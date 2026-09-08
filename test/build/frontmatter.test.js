/**
 * Tests frontmatter parsing and validation, and the build failures they cause.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import {
  parseFrontmatter,
  validateFrontmatter,
  assertValidFrontmatter,
  findUnknownFrontmatterKeys,
  KNOWN_FRONTMATTER_KEYS
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

describe('findUnknownFrontmatterKeys', () => {
  it('accepts every key the platform recognises for a skill', () => {
    const frontmatter = Object.fromEntries(
      KNOWN_FRONTMATTER_KEYS.skills.map(key => [key, 'value'])
    );

    expect(findUnknownFrontmatterKeys(frontmatter, 'skills')).toEqual([]);
  });

  it('accepts every key the platform recognises for an agent', () => {
    const frontmatter = Object.fromEntries(
      KNOWN_FRONTMATTER_KEYS.agents.map(key => [key, 'value'])
    );

    expect(findUnknownFrontmatterKeys(frontmatter, 'agents')).toEqual([]);
  });

  it('reports a key the platform would ignore without saying anything', () => {
    const frontmatter = { name: 'apm.sample', description: 'A skill.', agents: 'apm-lens-adversarial' };

    expect(findUnknownFrontmatterKeys(frontmatter, 'skills')).toEqual(['agents']);
  });

  it('reports several unknown keys in file order', () => {
    const frontmatter = { name: 'x', invented: 1, description: 'y', alsoInvented: 2 };

    expect(findUnknownFrontmatterKeys(frontmatter, 'skills')).toEqual(['invented', 'alsoInvented']);
  });

  it('does not carry skill keys over to agents, or the reverse', () => {
    // The two surfaces disagree on casing and on which fields exist at all.
    expect(findUnknownFrontmatterKeys({ tools: 'Read' }, 'skills')).toEqual(['tools']);
    expect(findUnknownFrontmatterKeys({ 'allowed-tools': 'Read' }, 'agents')).toEqual(['allowed-tools']);
    expect(findUnknownFrontmatterKeys({ disallowedTools: 'Bash' }, 'skills')).toEqual(['disallowedTools']);
    expect(findUnknownFrontmatterKeys({ 'disallowed-tools': 'Bash' }, 'agents')).toEqual(['disallowed-tools']);
  });

  it('stays silent for a category with no reference list', () => {
    expect(findUnknownFrontmatterKeys({ anything: true }, 'guides')).toEqual([]);
  });

  it('tolerates absent frontmatter', () => {
    expect(findUnknownFrontmatterKeys(undefined, 'skills')).toEqual([]);
    expect(findUnknownFrontmatterKeys({}, 'skills')).toEqual([]);
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

  it('warns without failing when a skill declares a key the platform ignores', async () => {
    await fs.writeFile(
      path.join(source, 'skills', 'apm.sample', 'SKILL.md'),
      [
        '---',
        'name: apm.sample',
        'description: A skill declaring a field that does not exist.',
        'agents: apm-lens-adversarial',
        '---',
        '',
        '# Sample'
      ].join('\n')
    );

    const { logs } = await runBuild({
      sourceDir: source,
      outputDir: path.join(temp.dir, 'out'),
      target: await readTarget()
    });

    // The build has to finish: the reference list dates faster than templates do.
    expect(logs.join('\n')).toContain('skills/apm.sample/SKILL.md: unknown frontmatter key "agents"');
  });

  it('warns for an agent key that belongs to the skill surface', async () => {
    await fs.writeFile(
      path.join(source, 'agents', 'sample-agent.md'),
      [
        '---',
        'name: sample-agent',
        'description: An agent using the skill spelling of a tools field.',
        'allowed-tools: Read',
        '---',
        '',
        '# Agent'
      ].join('\n')
    );

    const { logs } = await runBuild({
      sourceDir: source,
      outputDir: path.join(temp.dir, 'out'),
      target: await readTarget()
    });

    expect(logs.join('\n')).toContain('agents/sample-agent.md: unknown frontmatter key "allowed-tools"');
  });

  it('stays quiet when every declared key is recognised', async () => {
    const { logs } = await runBuild({
      sourceDir: source,
      outputDir: path.join(temp.dir, 'out'),
      target: await readTarget()
    });

    expect(logs.join('\n')).not.toContain('unknown frontmatter key');
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
