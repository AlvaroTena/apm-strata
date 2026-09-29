/**
 * Tests that archiving and updating keep the hook declarations in step with
 * the hook scripts.
 *
 * Archiving deletes the scripts, so it has to take their declarations out of
 * the project settings too, and nothing else. Updating deletes and reinstalls
 * them, so the declarations must end up present exactly once, or gone when no
 * bundle came back.
 *
 * These run against a real temporary directory: the behaviour under test is
 * what the settings file holds on disk afterwards.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';

const messages = [];

vi.mock('../../src/ui/logger.js', () => {
  const noop = vi.fn();
  const record = vi.fn(message => messages.push(message));
  const logger = {
    info: record,
    warn: record,
    error: record,
    success: record,
    debug: noop,
    dim: noop,
    blank: noop,
    line: noop,
    banner: noop,
    clearAndBanner: noop,
    progress: vi.fn(() => vi.fn()),
    chalk: { bold: text => text }
  };
  return { ...logger, default: logger };
});

const fetchOfficialReleases = vi.fn();
const fetchReleaseManifest = vi.fn();

vi.mock('../../src/services/releases.js', async importOriginal => {
  const actual = await importOriginal();
  return { ...actual, fetchOfficialReleases, fetchReleaseManifest };
});

const downloadAndExtract = vi.fn();

vi.mock('../../src/services/extractor.js', () => ({
  downloadAndExtract,
  default: { downloadAndExtract }
}));

const { archiveCommand } = await import('../../src/commands/archive.js');
const { updateCommand } = await import('../../src/commands/update.js');
const { installApmHooks } = await import('../../src/services/settings.js');

const GATE = '.claude/apm-hooks/apm-dispatch-gate.sh';
const PRECOMPACT = '.claude/apm-hooks/apm-precompact.sh';
const HOOK_FILES = [GATE, PRECOMPACT];

/**
 * Settings a project carries on its own: a hook on the same event and matcher
 * as the gate, a hook on an event APM does not use, and unrelated keys.
 */
const FOREIGN = {
  permissions: { allow: ['Bash(npm test)'], deny: [] },
  env: { MY_FLAG: '1' },
  hooks: {
    PreToolUse: [{ matcher: 'Write|Edit', hooks: [{ type: 'command', command: 'sh ~/.mytool/pre.sh' }] }],
    SessionStart: [{ hooks: [{ type: 'command', command: 'echo start' }] }]
  },
  model: 'opus'
};

let cwd;

/**
 * Resolves a workspace-relative path.
 */
function at(relative) {
  return path.join(cwd, relative);
}

/**
 * Lays out an installed workspace mid-session, hook scripts included.
 */
async function seedInstallation() {
  await fs.ensureDir(at('.apm/memory'));
  await fs.writeFile(at('.apm/plan.md'), '# Plan\n');
  for (const file of HOOK_FILES) {
    await fs.ensureDir(path.dirname(at(file)));
    await fs.writeFile(at(file), '#!/bin/sh\n');
  }
  await fs.writeJson(at('.apm/metadata.json'), {
    source: 'official',
    repository: 'owner/repo',
    releaseVersion: 'v1.0.0',
    assistants: ['claude'],
    installedFiles: { _apm: ['.apm/plan.md'], claude: HOOK_FILES }
  });
}

/**
 * Writes a settings document with the formatting the CLI uses.
 */
async function seedSettings(settings) {
  await fs.ensureDir(at('.claude'));
  await fs.writeFile(at('.claude/settings.json'), `${JSON.stringify(settings, null, 2)}\n`);
}

/**
 * Reads the settings document back.
 */
async function readSettings() {
  return fs.readJson(at('.claude/settings.json'));
}

/**
 * Returns every hook command declared in the settings, across all events.
 */
function allCommands(settings) {
  return Object.values(settings.hooks ?? {}).flatMap(groups =>
    groups.flatMap(group => group.hooks.map(handler => handler.command))
  );
}

/**
 * Counts the handlers that run a given script.
 */
function declarationsOf(settings, script) {
  return allCommands(settings).filter(command => command.includes(script)).length;
}

describe('apm archive and the hook declarations', () => {
  beforeEach(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'apm-archive-hooks-'));
    vi.spyOn(process, 'cwd').mockReturnValue(cwd);
    messages.length = 0;
    vi.clearAllMocks();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.remove(cwd);
  });

  it('withdraws its own entries and keeps everything else exactly as it was', async () => {
    await seedInstallation();
    await seedSettings(FOREIGN);
    await installApmHooks(cwd);
    expect(declarationsOf(await readSettings(), GATE)).toBe(1);

    await archiveCommand({ force: true, name: 'session-test-001' });

    expect(await readSettings()).toEqual(FOREIGN);
    for (const file of HOOK_FILES) {
      expect(await fs.pathExists(at(file))).toBe(false);
    }
  });

  it('says in its output that the settings file changed', async () => {
    await seedInstallation();
    await installApmHooks(cwd);

    await archiveCommand({ force: true, name: 'session-test-001' });

    expect(messages).toContain('Removed APM hook declarations from .claude/settings.json.');
  });

  it('leaves a file without its entries byte for byte alone', async () => {
    // Formatting the CLI would never produce, so a rewrite cannot pass unseen.
    const raw = `{"model":"opus",    "env": {"MY_FLAG": "1"}}`;
    await seedInstallation();
    await fs.ensureDir(at('.claude'));
    await fs.writeFile(at('.claude/settings.json'), raw);

    await archiveCommand({ force: true, name: 'session-test-001' });

    expect(await fs.readFile(at('.claude/settings.json'), 'utf8')).toBe(raw);
    expect(messages.some(message => message.includes('settings.json'))).toBe(false);
  });

  it('does not create a settings file when there is none', async () => {
    await seedInstallation();

    await archiveCommand({ force: true, name: 'session-test-001' });

    expect(await fs.pathExists(at('.claude/settings.json'))).toBe(false);
  });

  it('declares each hook exactly once when reinstalled after archiving', async () => {
    await seedInstallation();
    await seedSettings(FOREIGN);
    await installApmHooks(cwd);

    await archiveCommand({ force: true, name: 'session-test-001' });
    await installApmHooks(cwd);

    const settings = await readSettings();
    expect(declarationsOf(settings, GATE)).toBe(1);
    expect(declarationsOf(settings, PRECOMPACT)).toBe(1);
    expect(allCommands(settings)).toEqual(expect.arrayContaining(allCommands(FOREIGN)));
  });

  it('refuses an unreadable settings file before archiving anything', async () => {
    const broken = '{ "model": "opus",,, }';
    await seedInstallation();
    await fs.ensureDir(at('.claude'));
    await fs.writeFile(at('.claude/settings.json'), broken);

    await expect(archiveCommand({ force: true, name: 'session-test-001' })).rejects.toThrow(/is not readable JSON/);

    expect(await fs.readFile(at('.claude/settings.json'), 'utf8')).toBe(broken);
    expect(await fs.pathExists(at('.apm/archives'))).toBe(false);
    expect(await fs.pathExists(at('.apm/metadata.json'))).toBe(true);
    for (const file of HOOK_FILES) {
      expect(await fs.pathExists(at(file))).toBe(true);
    }
  });
});

describe('apm update and the hook declarations', () => {
  const current = { tag_name: 'v1.0.0', published_at: '2026-01-01T00:00:00Z', prerelease: false, assets: [] };
  const assistant = { id: 'claude', name: 'Claude Code', bundle: 'claude.zip', configDir: '.claude' };

  /**
   * Serves a newer release, with or without the assistant's bundle attached.
   */
  function givenNewerRelease({ withBundle }) {
    const next = {
      tag_name: 'v1.1.0',
      published_at: '2026-02-01T00:00:00Z',
      prerelease: false,
      assets: withBundle ? [{ name: 'claude.zip', browser_download_url: 'https://example.invalid/claude.zip' }] : []
    };
    fetchOfficialReleases.mockResolvedValue([next, current]);
    fetchReleaseManifest.mockResolvedValue({ version: '1.1.0', assistants: [assistant] });
    downloadAndExtract.mockImplementation(async (url, target) => {
      for (const file of HOOK_FILES) {
        await fs.ensureDir(path.dirname(path.join(target, file)));
        await fs.writeFile(path.join(target, file), '#!/bin/sh\n');
      }
      return [...HOOK_FILES, '.apm/plan.md'];
    });
  }

  beforeEach(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'apm-update-hooks-'));
    vi.spyOn(process, 'cwd').mockReturnValue(cwd);
    messages.length = 0;
    vi.clearAllMocks();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.remove(cwd);
  });

  it('ends with each hook declared exactly once after reinstalling', async () => {
    givenNewerRelease({ withBundle: true });
    await seedInstallation();
    await seedSettings(FOREIGN);
    await installApmHooks(cwd);

    await updateCommand({ force: true, name: 'session-test-001' });

    const settings = await readSettings();
    expect(declarationsOf(settings, GATE)).toBe(1);
    expect(declarationsOf(settings, PRECOMPACT)).toBe(1);
    expect(allCommands(settings)).toEqual(expect.arrayContaining(allCommands(FOREIGN)));
    expect(await fs.pathExists(at(GATE))).toBe(true);
  });

  it('withdraws the declarations when no bundle came back', async () => {
    givenNewerRelease({ withBundle: false });
    await seedInstallation();
    await seedSettings(FOREIGN);
    await installApmHooks(cwd);

    await updateCommand({ force: true, name: 'session-test-001' });

    expect(await fs.pathExists(at(GATE))).toBe(false);
    expect(await readSettings()).toEqual(FOREIGN);
  });
});
