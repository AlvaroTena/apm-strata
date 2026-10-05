/**
 * Tests that `apm remove` withdraws the hook declarations before it deletes
 * anything.
 *
 * Withdrawal is the step that can refuse: an unreadable settings file stops
 * it. Run first, a refusal leaves the installation exactly as it was instead
 * of half removed.
 *
 * These run against a real temporary directory: the behaviour under test is
 * what survives on disk.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';

vi.mock('../../src/ui/logger.js', () => {
  const noop = vi.fn();
  const logger = {
    info: noop,
    warn: noop,
    error: noop,
    success: noop,
    debug: noop,
    dim: noop,
    blank: noop,
    line: noop,
    banner: noop,
    clearAndBanner: noop,
    progress: vi.fn(() => vi.fn())
  };
  return { ...logger, default: logger };
});

const { removeCommand } = await import('../../src/commands/remove.js');
const { installApmHooks } = await import('../../src/services/settings.js');

const HOOK_FILES = ['.claude/apm-hooks/apm-dispatch-gate.sh', '.claude/apm-hooks/apm-precompact.sh'];
const FOREIGN = {
  permissions: { allow: ['Bash(npm test)'] },
  hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'echo start' }] }] }
};

let cwd;

/**
 * Resolves a workspace-relative path.
 */
function at(relative) {
  return path.join(cwd, relative);
}

/**
 * Lays out an installation with the hook scripts in place.
 */
async function seedInstallation() {
  for (const file of HOOK_FILES) {
    await fs.ensureDir(path.dirname(at(file)));
    await fs.writeFile(at(file), '#!/bin/sh\n');
  }
  await fs.ensureDir(at('.apm'));
  await fs.writeJson(at('.apm/metadata.json'), {
    source: 'official',
    releaseVersion: 'v1.0.0',
    assistants: ['claude'],
    installedFiles: { _apm: [], claude: HOOK_FILES }
  });
}

describe('apm remove and the hook declarations', () => {
  beforeEach(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'apm-remove-hooks-'));
    vi.spyOn(process, 'cwd').mockReturnValue(cwd);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.remove(cwd);
  });

  it('refuses an unreadable settings file before deleting or rewriting anything', async () => {
    const broken = '{ "model": "opus",,, }';
    await seedInstallation();
    await fs.writeFile(at('.claude/settings.json'), broken);
    const metadataBefore = await fs.readFile(at('.apm/metadata.json'), 'utf8');

    await expect(removeCommand({ assistant: ['claude'], force: true })).rejects.toThrow(/is not readable JSON/);

    expect(await fs.readFile(at('.claude/settings.json'), 'utf8')).toBe(broken);
    expect(await fs.readFile(at('.apm/metadata.json'), 'utf8')).toBe(metadataBefore);
    for (const file of HOOK_FILES) {
      expect(await fs.pathExists(at(file))).toBe(true);
    }
  });

  it('still removes the files, updates metadata and withdraws the hooks', async () => {
    await seedInstallation();
    await fs.writeFile(at('.claude/settings.json'), `${JSON.stringify(FOREIGN, null, 2)}\n`);
    await installApmHooks(cwd);

    await removeCommand({ assistant: ['claude'], force: true });

    for (const file of HOOK_FILES) {
      expect(await fs.pathExists(at(file))).toBe(false);
    }
    const metadata = await fs.readJson(at('.apm/metadata.json'));
    expect(metadata.assistants).toEqual([]);
    expect(metadata.installedFiles).not.toHaveProperty('claude');
    expect(await fs.readJson(at('.claude/settings.json'))).toEqual(FOREIGN);
  });
});
