/**
 * Tests for merging APM's hook declarations into project settings.
 *
 * The file belongs to the user, so most of what matters here is what the
 * merge leaves alone. An in-memory tree stands in for the filesystem.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';

let files = new Map();

const fsDouble = {
  pathExists: vi.fn(async target => files.has(target)),
  readFile: vi.fn(async target => {
    if (!files.has(target)) throw new Error(`ENOENT: ${target}`);
    return files.get(target);
  }),
  writeFile: vi.fn(async (target, content) => {
    files.set(target, content);
  }),
  ensureDir: vi.fn(async () => {})
};

vi.mock('fs-extra', () => ({ ...fsDouble, default: fsDouble }));

const { installApmHooks, removeApmHooks, withApmHooks, withoutApmHooks, SETTINGS_FILE } = await import(
  '../../src/services/settings.js'
);
const { CLIError } = await import('../../src/core/errors.js');

const WORKSPACE = '/tmp/apm-settings-workspace';
const SETTINGS = path.join(WORKSPACE, SETTINGS_FILE);

const GATE = '.claude/apm-hooks/apm-dispatch-gate.sh';
const AFTER_COMPACT = '.claude/apm-hooks/apm-after-compact.sh';
const RETIRED = '.claude/apm-hooks/apm-precompact.sh';

/**
 * Puts a settings document in the tree.
 */
function seed(settings) {
  files.set(SETTINGS, `${JSON.stringify(settings, null, 2)}\n`);
}

/**
 * Reads the settings document back.
 */
function read() {
  return JSON.parse(files.get(SETTINGS));
}

/**
 * Returns every hook command declared for an event.
 */
function commands(settings, event) {
  return (settings.hooks?.[event] ?? []).flatMap(group => group.hooks.map(handler => handler.command));
}

describe('withApmHooks', () => {
  it('declares the gate on PreToolUse with a Write|Edit|Bash matcher', () => {
    const merged = withApmHooks();
    const [group] = merged.hooks.PreToolUse;

    expect(group.matcher).toBe('Write|Edit|Bash');
    expect(group.hooks).toEqual([{ type: 'command', command: `sh "$CLAUDE_PROJECT_DIR/${GATE}"` }]);
  });

  it('declares the after-compaction notice on SessionStart with a compact matcher', () => {
    const [group] = withApmHooks().hooks.SessionStart;

    expect(group.matcher).toBe('compact');
    expect(group.hooks).toEqual([{ type: 'command', command: `sh "$CLAUDE_PROJECT_DIR/${AFTER_COMPACT}"` }]);
  });

  it('declares exactly two groups and no PreCompact', () => {
    const { hooks } = withApmHooks();

    expect(Object.keys(hooks).sort()).toEqual(['PreToolUse', 'SessionStart']);
    expect(hooks.PreToolUse).toHaveLength(1);
    expect(hooks.SessionStart).toHaveLength(1);
  });

  it('invokes the scripts through sh rather than by bare path', () => {
    // A hook must not depend on a mode bit surviving installation.
    for (const event of ['PreToolUse', 'SessionStart']) {
      expect(commands(withApmHooks(), event)[0]).toMatch(/^sh "/);
    }
  });

  it('withdraws the retired PreCompact declaration and keeps the user\'s own', () => {
    const merged = withApmHooks({
      hooks: {
        PreCompact: [
          { hooks: [{ type: 'command', command: `sh "$CLAUDE_PROJECT_DIR/${RETIRED}"` }] },
          { hooks: [{ type: 'command', command: 'echo mine' }] }
        ]
      }
    });

    expect(commands(merged, 'PreCompact')).toEqual(['echo mine']);
  });

  it('drops the PreCompact key when the retired declaration was all it held', () => {
    const merged = withApmHooks({
      hooks: { PreCompact: [{ hooks: [{ type: 'command', command: `sh "$CLAUDE_PROJECT_DIR/${RETIRED}"` }] }] }
    });

    expect(merged.hooks).not.toHaveProperty('PreCompact');
  });
});

describe('installApmHooks', () => {
  beforeEach(() => {
    files = new Map();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates the file when there is none', async () => {
    expect(await installApmHooks(WORKSPACE)).toBe(true);

    const settings = read();
    expect(commands(settings, 'PreToolUse')).toEqual([`sh "$CLAUDE_PROJECT_DIR/${GATE}"`]);
    expect(commands(settings, 'SessionStart')).toEqual([`sh "$CLAUDE_PROJECT_DIR/${AFTER_COMPACT}"`]);
    expect(settings.hooks).not.toHaveProperty('PreCompact');
  });

  it('writes a trailing newline and two-space indentation', async () => {
    await installApmHooks(WORKSPACE);

    const raw = files.get(SETTINGS);
    expect(raw.endsWith('\n')).toBe(true);
    expect(raw).toContain('\n  "hooks": {');
  });

  it('keeps a foreign hook on the same event and matcher', async () => {
    seed({
      hooks: {
        PreToolUse: [{ matcher: 'Write|Edit', hooks: [{ type: 'command', command: 'sh ~/.mytool/pre.sh' }] }]
      }
    });

    await installApmHooks(WORKSPACE);

    expect(commands(read(), 'PreToolUse')).toEqual([
      'sh ~/.mytool/pre.sh',
      `sh "$CLAUDE_PROJECT_DIR/${GATE}"`
    ]);
  });

  it('keeps every other key in the file', async () => {
    const original = {
      permissions: { allow: ['Bash(npm test)'], deny: [] },
      env: { MY_FLAG: '1' },
      model: 'opus',
      statusLine: { type: 'command', command: 'echo hi' }
    };
    seed(original);

    await installApmHooks(WORKSPACE);

    const settings = read();
    for (const [key, value] of Object.entries(original)) {
      expect(settings[key]).toEqual(value);
    }
  });

  it('keeps a foreign SessionStart hook beside its own', async () => {
    seed({ hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'echo start' }] }] } });

    await installApmHooks(WORKSPACE);

    expect(commands(read(), 'SessionStart')).toEqual(['echo start', `sh "$CLAUDE_PROJECT_DIR/${AFTER_COMPACT}"`]);
  });

  it('keeps foreign hooks on events it does not touch', async () => {
    seed({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo stop' }] }] } });

    await installApmHooks(WORKSPACE);

    expect(commands(read(), 'Stop')).toEqual(['echo stop']);
  });

  it('updates an alpha.4 installation in place and leaves foreign hooks intact', async () => {
    const foreign = {
      PreToolUse: { matcher: 'Write|Edit', hooks: [{ type: 'command', command: 'sh ~/.mytool/pre.sh' }] },
      PreCompact: { hooks: [{ type: 'command', command: 'echo user precompact' }] },
      SessionStart: { hooks: [{ type: 'command', command: 'echo start' }] }
    };
    seed({
      hooks: {
        PreToolUse: [
          foreign.PreToolUse,
          { matcher: 'Write|Edit', hooks: [{ type: 'command', command: `sh "$CLAUDE_PROJECT_DIR/${GATE}"` }] }
        ],
        PreCompact: [
          { hooks: [{ type: 'command', command: `sh "$CLAUDE_PROJECT_DIR/${RETIRED}"` }] },
          foreign.PreCompact
        ],
        SessionStart: [foreign.SessionStart]
      }
    });

    expect(await installApmHooks(WORKSPACE)).toBe(true);

    const { hooks } = read();
    expect(hooks.PreToolUse).toEqual([
      foreign.PreToolUse,
      { matcher: 'Write|Edit|Bash', hooks: [{ type: 'command', command: `sh "$CLAUDE_PROJECT_DIR/${GATE}"` }] }
    ]);
    expect(hooks.PreCompact).toEqual([foreign.PreCompact]);
    expect(hooks.SessionStart).toEqual([
      foreign.SessionStart,
      { matcher: 'compact', hooks: [{ type: 'command', command: `sh "$CLAUDE_PROJECT_DIR/${AFTER_COMPACT}"` }] }
    ]);
    expect(await installApmHooks(WORKSPACE)).toBe(false);
  });

  it('does not duplicate its entries on a second install', async () => {
    await installApmHooks(WORKSPACE);
    const first = files.get(SETTINGS);

    expect(await installApmHooks(WORKSPACE)).toBe(false);
    expect(files.get(SETTINGS)).toBe(first);
    expect(read().hooks.PreToolUse).toHaveLength(1);
  });

  it('recognizes its own entry after the user reformatted the file', async () => {
    // Ownership is decided by the script path, not by position or by shape.
    seed({
      hooks: {
        PreToolUse: [
          { hooks: [{ type: 'command', command: 'echo mine' }] },
          { matcher: 'Write', hooks: [{ type: 'command', command: `bash ./${GATE}` }] }
        ]
      }
    });

    await installApmHooks(WORKSPACE);

    const groups = read().hooks.PreToolUse;
    expect(groups).toHaveLength(2);
    expect(groups[1]).toEqual({
      matcher: 'Write|Edit|Bash',
      hooks: [{ type: 'command', command: `sh "$CLAUDE_PROJECT_DIR/${GATE}"` }]
    });
  });

  it('refuses invalid JSON and leaves the file exactly as it was', async () => {
    const broken = '{ "permissions": { "allow": [ "Bash" ] },,, }';
    files.set(SETTINGS, broken);

    await expect(installApmHooks(WORKSPACE)).rejects.toThrow(CLIError);
    await expect(installApmHooks(WORKSPACE)).rejects.toThrow(/is not readable JSON/);
    expect(files.get(SETTINGS)).toBe(broken);
    expect(fsDouble.writeFile).not.toHaveBeenCalled();
  });

  it('refuses a JSON document that is not an object', async () => {
    files.set(SETTINGS, '["not", "settings"]');

    await expect(installApmHooks(WORKSPACE)).rejects.toThrow(/expected a JSON object/);
    expect(fsDouble.writeFile).not.toHaveBeenCalled();
  });
});

describe('removeApmHooks', () => {
  beforeEach(() => {
    files = new Map();
    vi.clearAllMocks();
  });

  it('restores a populated file to exactly what it was', async () => {
    const original = {
      permissions: { allow: ['Bash(npm test)'] },
      env: { MY_FLAG: '1' },
      hooks: {
        PreToolUse: [{ matcher: 'Write|Edit', hooks: [{ type: 'command', command: 'sh ~/.mytool/pre.sh' }] }],
        SessionStart: [{ hooks: [{ type: 'command', command: 'echo start' }] }]
      },
      model: 'opus'
    };
    seed(original);

    await installApmHooks(WORKSPACE);
    expect(await removeApmHooks(WORKSPACE)).toBe(true);

    expect(read()).toEqual(original);
  });

  it('drops the hooks key when nothing else used it', async () => {
    await installApmHooks(WORKSPACE);
    await removeApmHooks(WORKSPACE);

    expect(read()).toEqual({});
  });

  it('keeps a shared group and removes only its own handler', () => {
    const stripped = withoutApmHooks({
      hooks: {
        PreToolUse: [
          {
            matcher: 'Write|Edit',
            hooks: [
              { type: 'command', command: 'sh ~/.mytool/pre.sh' },
              { type: 'command', command: `sh "$CLAUDE_PROJECT_DIR/${GATE}"` }
            ]
          }
        ]
      }
    });

    expect(stripped.hooks.PreToolUse[0].hooks).toEqual([{ type: 'command', command: 'sh ~/.mytool/pre.sh' }]);
  });

  it('withdraws both current declarations and the retired one', () => {
    const stripped = withoutApmHooks({
      hooks: {
        PreToolUse: [{ matcher: 'Write|Edit|Bash', hooks: [{ type: 'command', command: `sh "$CLAUDE_PROJECT_DIR/${GATE}"` }] }],
        SessionStart: [{ matcher: 'compact', hooks: [{ type: 'command', command: `sh "$CLAUDE_PROJECT_DIR/${AFTER_COMPACT}"` }] }],
        PreCompact: [{ hooks: [{ type: 'command', command: `sh "$CLAUDE_PROJECT_DIR/${RETIRED}"` }] }]
      }
    });

    expect(stripped).toEqual({});
  });

  it('leaves a file that never had its entries alone', async () => {
    seed({ model: 'opus' });

    expect(await removeApmHooks(WORKSPACE)).toBe(false);
    expect(fsDouble.writeFile).not.toHaveBeenCalled();
  });

  it('does nothing when there is no file', async () => {
    expect(await removeApmHooks(WORKSPACE)).toBe(false);
  });

  it('refuses invalid JSON rather than rewriting it', async () => {
    files.set(SETTINGS, 'not json at all');

    await expect(removeApmHooks(WORKSPACE)).rejects.toThrow(/is not readable JSON/);
    expect(fsDouble.writeFile).not.toHaveBeenCalled();
  });
});
