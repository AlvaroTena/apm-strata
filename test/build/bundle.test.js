/**
 * Guards the set of paths the bundle emits.
 *
 * The build runs against the real templates/ tree so that adding, removing or
 * relocating a template is caught here. When a change to templates/ is
 * intentional, refresh the snapshot with:
 *
 *   node test/build/refresh-bundle-snapshot.js
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import {
  repoRoot,
  readTarget,
  makeTempDir,
  runBuild,
  readBundle
} from './support.js';

const snapshotPath = path.join(repoRoot, 'test', 'fixtures', 'bundle-paths.json');

describe('bundle contents', () => {
  let cleanup;
  let bundle;
  let expected;
  let manifest;
  let target;

  beforeAll(async () => {
    const temp = await makeTempDir();
    cleanup = temp.cleanup;
    target = await readTarget();

    const { entries } = await runBuild({
      sourceDir: path.join(repoRoot, 'templates'),
      outputDir: temp.dir,
      target
    });

    bundle = readBundle(entries);
    expected = await fs.readJson(snapshotPath);
    manifest = await fs.readJson(path.join(temp.dir, 'apm-release.json'));
  });

  afterAll(async () => {
    await cleanup();
  });

  it('emits exactly the paths recorded in the snapshot', () => {
    const actual = new Set(bundle.paths);
    const recorded = new Set(expected);

    // Reported as two named lists so a failure says which path moved.
    const missing = expected.filter(entryPath => !actual.has(entryPath));
    const unexpected = bundle.paths.filter(entryPath => !recorded.has(entryPath));

    expect({ missing, unexpected }).toEqual({ missing: [], unexpected: [] });
  });

  it('emits the session scaffold and the assistant directory', () => {
    expect(bundle.paths).toContain('.apm/plan.md');
    expect(bundle.paths).toContain('.claude/agents/apm-archive-explorer.md');
    expect(bundle.paths).toContain('.claude/skills/apm-communication/SKILL.md');
  });

  it('substitutes the rules file name from the target configuration', () => {
    const guide = bundle.text('.claude/apm-guides/task-execution.md');

    expect(guide).toContain(target.rulesFile);
    expect(guide).not.toMatch(/\{RULES_FILE\}/);
  });

  it('writes a manifest describing a single assistant', () => {
    expect(manifest.assistants).toHaveLength(1);
    expect(manifest.assistants[0]).toMatchObject({
      id: target.id,
      bundle: target.bundleName,
      configDir: target.configDir
    });
  });
});
