/**
 * Tests frontmatter parsing and validation, and the build failures they cause.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import {
  parseFrontmatter,
  validateFrontmatter,
  assertValidFrontmatter
} from '../../build/processors/frontmatter.js';
import {
  fixtureTemplates,
  invalidFrontmatter,
  readTarget,
  makeTempDir,
  runBuild
} from './support.js';

describe('parseFrontmatter', () => {
  it('returns the parsed frontmatter and the body', () => {
    const { frontmatter, content } = parseFrontmatter(
      '---\nname: apm.sample\ndescription: A skill.\n---\n\n# Body\n',
      'sample.md'
    );

    expect(frontmatter).toEqual({ name: 'apm.sample', description: 'A skill.' });
    expect(content.trim()).toBe('# Body');
  });

  it('treats a document without a frontmatter block as all body', () => {
    const { frontmatter, content } = parseFrontmatter('# Just a heading\n', 'sample.md');

    expect(frontmatter).toEqual({});
    expect(content).toBe('# Just a heading\n');
  });

  it('treats an unterminated frontmatter block as all body', () => {
    const { frontmatter } = parseFrontmatter('---\nname: apm.sample\n', 'sample.md');

    expect(frontmatter).toEqual({});
  });

  it('throws naming the file when the block is not valid YAML', () => {
    expect(() => parseFrontmatter('---\nname: [unclosed\n---\n', 'skills/apm.sample/SKILL.md'))
      .toThrowError(/skills\/apm\.sample\/SKILL\.md/);
  });
});

describe('validateFrontmatter', () => {
  const valid = { name: 'apm.sample', description: 'A skill.' };

  it('accepts frontmatter carrying name and description', () => {
    expect(validateFrontmatter(valid, 'sample.md')).toEqual({ valid: true, errors: [] });
  });

  it('reports a missing name, naming the file', () => {
    const { valid: ok, errors } = validateFrontmatter({ description: 'A skill.' }, 'sample.md');

    expect(ok).toBe(false);
    expect(errors).toEqual(['missing required frontmatter field "name" in sample.md']);
  });

  it('reports a missing description, naming the file', () => {
    const { valid: ok, errors } = validateFrontmatter({ name: 'apm.sample' }, 'sample.md');

    expect(ok).toBe(false);
    expect(errors).toEqual(['missing required frontmatter field "description" in sample.md']);
  });

  it('rejects blank and non-string values', () => {
    expect(validateFrontmatter({ name: '   ', description: 42 }, 'sample.md').errors).toHaveLength(2);
  });

  it('accepts a structured hooks block', () => {
    const frontmatter = { ...valid, hooks: { SessionStart: [{ command: 'x.sh' }] } };

    expect(validateFrontmatter(frontmatter, 'sample.md').valid).toBe(true);
  });

  it('accepts a hooks block written as valid YAML text', () => {
    const frontmatter = { ...valid, hooks: 'SessionStart:\n  - command: x.sh\n' };

    expect(validateFrontmatter(frontmatter, 'sample.md').valid).toBe(true);
  });

  it('rejects a hooks block whose text is not valid YAML', () => {
    const frontmatter = { ...valid, hooks: 'SessionStart: [unclosed\n  - : : bad\n' };
    const { valid: ok, errors } = validateFrontmatter(frontmatter, 'sample.md');

    expect(ok).toBe(false);
    expect(errors[0]).toContain('invalid YAML in "hooks" frontmatter of sample.md');
  });
});

describe('assertValidFrontmatter', () => {
  it('returns the frontmatter when it is valid', () => {
    const frontmatter = assertValidFrontmatter(
      '---\nname: apm.sample\ndescription: A skill.\n---\n',
      'sample.md'
    );

    expect(frontmatter.name).toBe('apm.sample');
  });

  it('throws naming the file when a required field is absent', () => {
    expect(() => assertValidFrontmatter('---\ndescription: A skill.\n---\n', 'sample.md'))
      .toThrowError(/sample\.md/);
  });
});

describe('build failures caused by invalid frontmatter', () => {
  let temp;
  let source;

  beforeEach(async () => {
    temp = await makeTempDir();
    source = path.join(temp.dir, 'templates');
    await fs.copy(fixtureTemplates, source);
  });

  afterEach(async () => {
    await temp.cleanup();
  });

  /**
   * Replaces the fixture skill entry point with an invalid one and builds.
   */
  async function buildWithInvalidSkill(fixtureName) {
    await fs.copy(
      path.join(invalidFrontmatter, fixtureName),
      path.join(source, 'skills', 'apm.sample', 'SKILL.md'),
      { overwrite: true }
    );

    return runBuild({
      sourceDir: source,
      outputDir: path.join(temp.dir, 'out'),
      target: await readTarget()
    });
  }

  it('fails when a SKILL.md has no name, naming the file', async () => {
    await expect(buildWithInvalidSkill('missing-name.md')).rejects.toThrowError(
      /missing required frontmatter field "name" in skills\/apm\.sample\/SKILL\.md/
    );
  });

  it('fails when a SKILL.md has no description, naming the file', async () => {
    await expect(buildWithInvalidSkill('missing-description.md')).rejects.toThrowError(
      /missing required frontmatter field "description" in skills\/apm\.sample\/SKILL\.md/
    );
  });

  it('fails when a hooks block is not valid YAML, naming the file', async () => {
    await expect(buildWithInvalidSkill('malformed-hooks.md')).rejects.toThrowError(
      /invalid YAML in "hooks" frontmatter of skills\/apm\.sample\/SKILL\.md/
    );
  });

  it('fails when the frontmatter block itself is not valid YAML, naming the file', async () => {
    await expect(buildWithInvalidSkill('malformed-block.md')).rejects.toThrowError(
      /skills\/apm\.sample\/SKILL\.md/
    );
  });

  it('fails when an agent has no name, naming the file', async () => {
    await fs.writeFile(
      path.join(source, 'agents', 'sample-agent.md'),
      '---\ndescription: An agent without a name.\n---\n\n# Agent\n'
    );

    await expect(
      runBuild({
        sourceDir: source,
        outputDir: path.join(temp.dir, 'out'),
        target: await readTarget()
      })
    ).rejects.toThrowError(/missing required frontmatter field "name" in agents\/sample-agent\.md/);
  });

  it('does not validate skill support files that carry no frontmatter', async () => {
    await fs.writeFile(
      path.join(source, 'skills', 'apm.sample', 'notes.md'),
      '# Support file with no frontmatter\n'
    );

    await expect(
      runBuild({
        sourceDir: source,
        outputDir: path.join(temp.dir, 'out'),
        target: await readTarget()
      })
    ).resolves.toBeDefined();
  });
});
