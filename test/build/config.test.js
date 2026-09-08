/**
 * Tests build configuration validation and template discovery.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateConfig } from '../../build/core/config.js';
import { findTemplateFiles, TEMPLATE_CATEGORIES } from '../../build/utils/files.js';
import fs from 'fs-extra';
import path from 'path';
import { fixtureTemplates, readTarget, makeTempDir, runBuild } from './support.js';

/**
 * Builds a valid configuration, optionally mutated before validation.
 */
async function config(mutate = () => {}) {
  const value = {
    build: { sourceDir: 'templates', outputDir: 'dist', cleanOutput: true },
    targets: [await readTarget()]
  };
  mutate(value);
  return value;
}

describe('validateConfig', () => {
  it('accepts the shipped configuration', async () => {
    expect(validateConfig(await config())).toEqual([]);
  });

  it('requires rulesFile', async () => {
    const errors = validateConfig(await config(c => delete c.targets[0].rulesFile));

    expect(errors).toContain('targets[0]: missing "rulesFile"');
  });

  it('requires directories.agents', async () => {
    const errors = validateConfig(await config(c => delete c.targets[0].directories.agents));

    expect(errors).toContain('targets[0]: missing "directories.agents"');
  });

  it('requires directories.hooks', async () => {
    const errors = validateConfig(await config(c => delete c.targets[0].directories.hooks));

    expect(errors).toContain('targets[0]: missing "directories.hooks"');
  });

  it('requires directories.skills and directories.guides', async () => {
    const errors = validateConfig(await config(c => {
      delete c.targets[0].directories.skills;
      delete c.targets[0].directories.guides;
    }));

    expect(errors).toContain('targets[0]: missing "directories.skills"');
    expect(errors).toContain('targets[0]: missing "directories.guides"');
  });

  it('reports every missing target field at once', async () => {
    const errors = validateConfig(await config(c => {
      c.targets[0] = {};
    }));

    expect(errors).toEqual([
      'targets[0]: missing "id"',
      'targets[0]: missing "name"',
      'targets[0]: missing "bundleName"',
      'targets[0]: missing "rulesFile"',
      'targets[0]: missing "directories"'
    ]);
  });

  it('requires the build section and a non-empty targets array', () => {
    expect(validateConfig({})).toEqual([
      'Missing "build" section',
      'Missing "targets" array'
    ]);
    expect(validateConfig({ build: { sourceDir: 'a', outputDir: 'b' }, targets: [] }))
      .toContain('"targets" array is empty');
  });
});

describe('findTemplateFiles', () => {
  it('declares the four template categories', () => {
    expect(TEMPLATE_CATEGORIES).toEqual(['guides', 'skills', 'agents', 'hooks']);
  });

  it('tags every discovered file with the category directory it came from', async () => {
    const found = await findTemplateFiles(fixtureTemplates);
    const byCategory = {};

    for (const { path: filePath, category } of found) {
      (byCategory[category] ??= []).push(filePath.split('/').pop());
    }

    expect(Object.keys(byCategory).sort()).toEqual(['agents', 'guides', 'hooks', 'skills']);
    expect(byCategory.guides).toEqual(['sample-guide.md']);
    expect(byCategory.agents).toEqual(['sample-agent.md']);
    expect(byCategory.hooks.sort()).toEqual(['payload.json', 'sample-hook.sh']);
    expect(byCategory.skills.sort()).toEqual(['README.md', 'SKILL.md', 'data.json', 'run.sh']);
  });

  it('never reports a commands category', async () => {
    const found = await findTemplateFiles(fixtureTemplates);

    expect(found.map(entry => entry.category)).not.toContain('commands');
  });
});

describe('unknown source directories', () => {
  let temp;

  beforeEach(async () => {
    temp = await makeTempDir();
  });

  afterEach(async () => {
    await temp.cleanup();
  });

  /**
   * Copies the fixture tree and adds one directory that is not a category.
   */
  async function buildWithExtraDirectory(name) {
    const source = path.join(temp.dir, 'templates');
    await fs.copy(fixtureTemplates, source);
    await fs.outputFile(path.join(source, name, 'stray.md'), '# Stray\n');

    return runBuild({
      sourceDir: source,
      outputDir: path.join(temp.dir, 'out'),
      target: await readTarget()
    });
  }

  it('warns naming whichever directory it does not recognise', async () => {
    // The warning is driven by the category list, not by a retired category
    // name, so any directory added to templates/ by mistake is reported.
    const { logs } = await buildWithExtraDirectory('workflows');

    expect(logs.join('\n')).toContain('Skipping "workflows/": not a template category');
  });

  it('uses the same wording for a different unknown directory', async () => {
    const { logs } = await buildWithExtraDirectory('commands');

    expect(logs.join('\n')).toContain('Skipping "commands/": not a template category');
  });

  it('does not emit anything from an unknown directory', async () => {
    const { entries } = await buildWithExtraDirectory('workflows');
    const paths = entries.map(entry => entry.entryName);

    expect(paths.some(entryPath => entryPath.includes('stray.md'))).toBe(false);
  });
});
