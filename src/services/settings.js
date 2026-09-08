/**
 * Project Settings Module
 *
 * Merges the hook declarations APM needs into the project's Claude Code
 * settings, and takes them back out again.
 *
 * The file belongs to the user. It may already carry their own hooks on the
 * same events, their permissions, their environment. Everything here merges:
 * nothing is overwritten, and nothing outside APM's own entries is touched.
 *
 * @module src/services/settings
 */

import path from 'path';
import fs from 'fs-extra';
import { CLIError } from '../core/errors.js';

/**
 * Project settings file, relative to the workspace.
 */
export const SETTINGS_FILE = path.join('.claude', 'settings.json');

/**
 * Directory the hook scripts are installed into by the bundle.
 */
const HOOKS_DIR = '.claude/apm-hooks';

/**
 * Hook declarations APM installs.
 *
 * Verified against the Claude Code hooks reference for 2.1.263:
 * - `PreToolUse` takes a matcher; `PreCompact` has no matcher support, so its
 *   group carries only `hooks`.
 * - A handler with no `args` is shell form: the command string goes to
 *   `sh -c`. The scripts are invoked through `sh` rather than by bare path
 *   because a hook must not depend on a mode bit surviving installation.
 */
const DECLARATIONS = [
  {
    event: 'PreToolUse',
    matcher: 'Write|Edit',
    script: `${HOOKS_DIR}/apm-dispatch-gate.sh`
  },
  {
    event: 'PreCompact',
    script: `${HOOKS_DIR}/apm-precompact.sh`
  }
];

/**
 * Builds the command that runs a hook script.
 *
 * `CLAUDE_PROJECT_DIR` resolves the project root, so the hook works whatever
 * the working directory happens to be when it fires.
 *
 * @param {string} script - Project-relative script path.
 * @returns {string} Shell command.
 */
function commandFor(script) {
  return `sh "$CLAUDE_PROJECT_DIR/${script}"`;
}

/**
 * Reports whether a matcher group is one of ours.
 *
 * Ownership is decided by the script path inside the command, not by position
 * in the array and not by the event alone: a user's own hook on the same event
 * must survive, and our own entry must be recognized again after the user has
 * reformatted the file.
 *
 * @param {Object} group - Matcher group from the settings file.
 * @param {string} script - Project-relative script path.
 * @returns {boolean} True when the group runs that script.
 */
function ownsScript(group, script) {
  return (
    Array.isArray(group?.hooks) &&
    group.hooks.some(handler => typeof handler?.command === 'string' && handler.command.includes(script))
  );
}

/**
 * Builds the matcher group for one declaration.
 *
 * @param {Object} declaration - Declaration to render.
 * @returns {Object} Matcher group.
 */
function groupFor({ matcher, script }) {
  return {
    ...(matcher ? { matcher } : {}),
    hooks: [{ type: 'command', command: commandFor(script) }]
  };
}

/**
 * Adds APM's hook declarations to a settings object.
 *
 * @param {Object} [settings={}] - Existing settings.
 * @returns {Object} Settings with APM's declarations present exactly once.
 */
export function withApmHooks(settings = {}) {
  const merged = { ...settings, hooks: { ...(settings.hooks ?? {}) } };

  for (const declaration of DECLARATIONS) {
    const existing = Array.isArray(merged.hooks[declaration.event])
      ? [...merged.hooks[declaration.event]]
      : [];
    const ours = existing.findIndex(group => ownsScript(group, declaration.script));

    // Replacing in place rather than appending keeps a second install from
    // duplicating the entry, and lets the command be corrected by reinstalling.
    if (ours === -1) {
      existing.push(groupFor(declaration));
    } else {
      existing[ours] = groupFor(declaration);
    }

    merged.hooks[declaration.event] = existing;
  }

  return merged;
}

/**
 * Removes APM's hook declarations from a settings object.
 *
 * Prunes only what it emptied: a group the user shares with us keeps its own
 * handlers, an event keeps its other groups, and `hooks` survives if anything
 * is left in it.
 *
 * @param {Object} [settings={}] - Existing settings.
 * @returns {Object} Settings without APM's declarations.
 */
export function withoutApmHooks(settings = {}) {
  if (!settings.hooks || typeof settings.hooks !== 'object') return { ...settings };

  const scripts = DECLARATIONS.map(declaration => declaration.script);
  const hooks = {};

  for (const [event, groups] of Object.entries(settings.hooks)) {
    if (!Array.isArray(groups)) {
      hooks[event] = groups;
      continue;
    }

    const kept = [];
    for (const group of groups) {
      if (!Array.isArray(group?.hooks)) {
        kept.push(group);
        continue;
      }

      const handlers = group.hooks.filter(
        handler => !scripts.some(script => typeof handler?.command === 'string' && handler.command.includes(script))
      );
      if (handlers.length === group.hooks.length) {
        kept.push(group);
      } else if (handlers.length) {
        kept.push({ ...group, hooks: handlers });
      }
    }

    if (kept.length) hooks[event] = kept;
  }

  const merged = { ...settings };
  if (Object.keys(hooks).length) {
    merged.hooks = hooks;
  } else {
    delete merged.hooks;
  }
  return merged;
}

/**
 * Reads the project settings file.
 *
 * @param {string} cwd - Workspace root.
 * @returns {Promise<Object|null>} Parsed settings, or null when absent.
 * @throws {CLIError} When the file exists but is not valid JSON.
 */
async function readSettings(cwd) {
  const target = path.join(cwd, SETTINGS_FILE);
  if (!(await fs.pathExists(target))) return null;

  const raw = await fs.readFile(target, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('expected a JSON object');
    }
    return parsed;
  } catch (err) {
    // Rewriting an unparseable file would destroy whatever the user has in
    // there, so this refuses and leaves it alone.
    throw CLIError.settingsUnreadable(SETTINGS_FILE, err.message);
  }
}

/**
 * Writes the project settings file, creating its directory if needed.
 *
 * @param {string} cwd - Workspace root.
 * @param {Object} settings - Settings to write.
 * @returns {Promise<void>}
 */
async function writeSettings(cwd, settings) {
  const target = path.join(cwd, SETTINGS_FILE);
  await fs.ensureDir(path.dirname(target));
  await fs.writeFile(target, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
}

/**
 * Declares APM's hooks in the project settings.
 *
 * @param {string} [cwd=process.cwd()] - Workspace root.
 * @returns {Promise<boolean>} True when the file changed.
 * @throws {CLIError} When the existing file is not readable JSON.
 */
export async function installApmHooks(cwd = process.cwd()) {
  const existing = await readSettings(cwd);
  const merged = withApmHooks(existing ?? {});

  if (existing && JSON.stringify(existing) === JSON.stringify(merged)) return false;

  await writeSettings(cwd, merged);
  return true;
}

/**
 * Withdraws APM's hooks from the project settings.
 *
 * @param {string} [cwd=process.cwd()] - Workspace root.
 * @returns {Promise<boolean>} True when the file changed.
 * @throws {CLIError} When the existing file is not readable JSON.
 */
export async function removeApmHooks(cwd = process.cwd()) {
  const existing = await readSettings(cwd);
  if (!existing) return false;

  const stripped = withoutApmHooks(existing);
  if (JSON.stringify(existing) === JSON.stringify(stripped)) return false;

  await writeSettings(cwd, stripped);
  return true;
}

export default {
  SETTINGS_FILE,
  withApmHooks,
  withoutApmHooks,
  installApmHooks,
  removeApmHooks
};
