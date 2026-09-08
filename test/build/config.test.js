/**
 * Tests build configuration validation and template discovery.
 */

import { describe, it, expect } from 'vitest';
import { validateConfig } from '../../build/core/config.js';
import { findTemplateFiles, TEMPLATE_CATEGORIES } from '../../build/utils/files.js';
import { fixtureTemplates, readTarget } from './support.js';

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
