/**
 * Tests how the pipeline routes, filters and copies template files.
 *
 * Runs against the versioned fixture tree in test/fixtures/templates/ rather
 * than the real templates/, so the expectations stay stable as the product
 * templates change.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  fixtureTemplates,
  readTarget,
  makeTempDir,
  runBuild,
  readBundle
} from './support.js';

describe('bundle emission', () => {
  let cleanup;
  let bundle;
  let target;

  beforeAll(async () => {
    const temp = await makeTempDir();
    cleanup = temp.cleanup;
    target = await readTarget();

    const { entries } = await runBuild({
      sourceDir: fixtureTemplates,
      outputDir: temp.dir,
      target
    });

    bundle = readBundle(entries);
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('extension filtering', () => {
    it('collects every file under skills/ regardless of extension', () => {
      expect(bundle.paths).toContain(`${target.directories.skills}/apm.sample/SKILL.md`);
      expect(bundle.paths).toContain(`${target.directories.skills}/apm.sample/references/data.json`);
      expect(bundle.paths).toContain(`${target.directories.skills}/apm.sample/run.sh`);
    });

    it('collects every file under hooks/ regardless of extension', () => {
      expect(bundle.paths).toContain(`${target.directories.hooks}/sample-hook.sh`);
      expect(bundle.paths).toContain(`${target.directories.hooks}/payload.json`);
    });

    it('keeps the markdown filter for guides/', () => {
      expect(bundle.paths).toContain(`${target.directories.guides}/sample-guide.md`);
      expect(bundle.paths).not.toContain(`${target.directories.guides}/ignored-note.txt`);
    });

    it('drops README.md from guides/ but keeps it inside a skill directory', () => {
      // A README documents a filtered category; inside a skill it is shipped content.
      expect(bundle.paths).not.toContain(`${target.directories.guides}/README.md`);
      expect(bundle.paths).toContain(`${target.directories.skills}/apm.sample/README.md`);
    });

    it('keeps the markdown filter for agents/', () => {
      expect(bundle.paths).toContain(`${target.directories.agents}/sample-agent.md`);
      expect(bundle.paths).not.toContain(`${target.directories.agents}/ignored-agent.txt`);
    });
  });

  describe('output paths', () => {
    it('emits guides and agents flat', () => {
      expect(bundle.paths).toContain(`${target.directories.guides}/sample-guide.md`);
      expect(bundle.paths).toContain(`${target.directories.agents}/sample-agent.md`);
    });

    it('preserves the directory layout inside a skill', () => {
      // The support file must stay under references/, not be flattened into the skill root.
      expect(bundle.paths).toContain(`${target.directories.skills}/apm.sample/references/data.json`);
      expect(bundle.paths).not.toContain(`${target.directories.skills}/apm.sample/data.json`);
    });

    it('emits hook scripts under the configured hooks directory', () => {
      expect(target.directories.hooks).toBe('.claude/apm-hooks');
      expect(bundle.paths).toContain('.claude/apm-hooks/sample-hook.sh');
    });
  });

  describe('placeholder substitution by extension', () => {
    it('substitutes placeholders in markdown', () => {
      const guide = bundle.text(`${target.directories.guides}/sample-guide.md`);
      expect(guide).toContain(target.rulesFile);
      expect(guide).not.toContain('{RULES_FILE}');
      expect(guide).not.toContain('{VERSION}');
    });

    it('substitutes placeholders in shell scripts', () => {
      const hook = bundle.text(`${target.directories.hooks}/sample-hook.sh`);
      expect(hook).toContain(`rules: ${target.rulesFile}`);
      expect(hook).not.toContain('{RULES_FILE}');
    });

    it('copies other extensions verbatim', () => {
      const insideSkill = bundle.text(`${target.directories.skills}/apm.sample/references/data.json`);
      const insideHooks = bundle.text(`${target.directories.hooks}/payload.json`);

      expect(insideSkill).toContain('{VERSION}');
      expect(insideHooks).toContain('{VERSION}');
    });

    it('resolves the skill and hook placeholders in a SKILL.md', () => {
      const skill = bundle.text(`${target.directories.skills}/apm.sample/SKILL.md`);

      expect(skill).toContain('/apm.sample');
      expect(skill).toContain('.claude/apm-hooks/sample-hook.sh');
    });

    it('emits frontmatter verbatim, including the hooks block', () => {
      const skill = bundle.text(`${target.directories.skills}/apm.sample/SKILL.md`);

      expect(skill.startsWith('---\nname: apm.sample\n')).toBe(true);
      expect(skill).toContain('hooks: |');
      expect(skill).toContain('  SessionStart:');
    });
  });

  describe('file mode', () => {
    it('keeps the execute bit on a hook script', () => {
      expect(bundle.mode(`${target.directories.hooks}/sample-hook.sh`)).toBe(0o755);
    });

    it('keeps the execute bit on an executable file inside a skill', () => {
      expect(bundle.mode(`${target.directories.skills}/apm.sample/run.sh`)).toBe(0o755);
    });

    it('does not add the execute bit to ordinary files', () => {
      expect(bundle.mode(`${target.directories.guides}/sample-guide.md`)).toBe(0o644);
      expect(bundle.mode(`${target.directories.skills}/apm.sample/references/data.json`)).toBe(0o644);
    });
  });
});
