/**
 * Tests that archiving preserves the long-horizon backlog.
 *
 * The backlog has to still be there when the session that wrote it is gone,
 * because the procedure opening the next session reads it. Archiving it would
 * bury it inside one particular archive and fail silently.
 *
 * These run against a real temporary directory: the behaviour under test is
 * which files survive on disk.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { createArchive } from '../../src/services/archive.js';

let cwd;

const BACKLOG = '# Long-horizon backlog\n\n- [ ] Deferred item one\n- [ ] Deferred item two\n';
const ARCHIVE_NAME = 'session-test-001';

/**
 * Lays out a workspace mid-session, optionally with a backlog.
 */
async function seedWorkspace({ backlog = true } = {}) {
  const apm = path.join(cwd, '.apm');
  await fs.ensureDir(path.join(apm, 'memory', 'stage-01'));
  await fs.ensureDir(path.join(apm, 'bus', 'manager'));

  await fs.writeFile(path.join(apm, 'plan.md'), '# Plan\n');
  await fs.writeFile(path.join(apm, 'memory', 'stage-01', 'task-01-01.log.md'), 'log\n');
  await fs.writeFile(path.join(apm, 'bus', 'manager', 'report.md'), 'report\n');
  await fs.writeJson(path.join(apm, 'metadata.json'), {
    source: 'official',
    assistants: ['claude'],
    installedFiles: { _apm: ['.apm/plan.md'], claude: ['.claude/commands/apm.md'] }
  });

  if (backlog) await fs.writeFile(path.join(apm, 'backlog.md'), BACKLOG);
}

/**
 * Lists the entries left directly under .apm/.
 */
function apmEntries() {
  return fs.readdir(path.join(cwd, '.apm'));
}

/**
 * Lists the entries captured in the archive.
 */
function archiveEntries() {
  return fs.readdir(path.join(cwd, '.apm', 'archives', ARCHIVE_NAME));
}

describe('createArchive backlog preservation', () => {
  beforeEach(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'apm-archive-'));
  });

  afterEach(async () => {
    await fs.remove(cwd);
  });

  it('leaves the backlog in place with its content untouched', async () => {
    await seedWorkspace();

    await createArchive(cwd, { name: ARCHIVE_NAME });

    const target = path.join(cwd, '.apm', 'backlog.md');
    expect(await fs.pathExists(target)).toBe(true);
    expect(await fs.readFile(target, 'utf8')).toBe(BACKLOG);
  });

  it('does not put the backlog inside the archive', async () => {
    await seedWorkspace();

    await createArchive(cwd, { name: ARCHIVE_NAME });

    expect(await archiveEntries()).not.toContain('backlog.md');
  });

  it('does not report the backlog as an archived runtime entry', async () => {
    await seedWorkspace();

    const { runtimeEntries } = await createArchive(cwd, { name: ARCHIVE_NAME });

    expect(runtimeEntries).not.toContain('backlog.md');
    expect(runtimeEntries.sort()).toEqual(['bus', 'memory']);
  });

  it('still archives and clears the rest of the session state', async () => {
    await seedWorkspace();

    await createArchive(cwd, { name: ARCHIVE_NAME });

    expect((await archiveEntries()).sort()).toEqual(['bus', 'memory', 'metadata.json', 'plan.md']);
    expect((await apmEntries()).sort()).toEqual(['archives', 'backlog.md', 'metadata.json']);
    expect(await fs.readFile(path.join(cwd, '.apm', 'archives', ARCHIVE_NAME, 'plan.md'), 'utf8')).toBe('# Plan\n');
  });

  it('works the same when no backlog is present', async () => {
    await seedWorkspace({ backlog: false });

    await createArchive(cwd, { name: ARCHIVE_NAME });

    expect((await archiveEntries()).sort()).toEqual(['bus', 'memory', 'metadata.json', 'plan.md']);
    expect((await apmEntries()).sort()).toEqual(['archives', 'metadata.json']);
  });

  it('keeps the backlog across successive archives', async () => {
    await seedWorkspace();
    await createArchive(cwd, { name: ARCHIVE_NAME });

    await seedWorkspace();
    await createArchive(cwd, { name: 'session-test-002' });

    expect(await fs.readFile(path.join(cwd, '.apm', 'backlog.md'), 'utf8')).toBe(BACKLOG);
    for (const name of [ARCHIVE_NAME, 'session-test-002']) {
      expect(await fs.readdir(path.join(cwd, '.apm', 'archives', name))).not.toContain('backlog.md');
    }
  });

  it('does not nest past archives inside a new one', async () => {
    await seedWorkspace();
    await createArchive(cwd, { name: ARCHIVE_NAME });

    await seedWorkspace();
    await createArchive(cwd, { name: 'session-test-002' });

    expect(await fs.readdir(path.join(cwd, '.apm', 'archives', 'session-test-002'))).not.toContain('archives');
  });
});
