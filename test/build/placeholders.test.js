/**
 * Tests for template placeholder replacement.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { replacePlaceholders } from '../../build/processors/placeholders.js';
import { repoRoot, readTarget } from './support.js';

/** Target stub with values distinct from the shipped configuration. */
const target = {
  id: 'claude',
  rulesFile: 'FIXTURE_RULES.md',
  directories: {
    skills: '.fixture/skills',
    guides: '.fixture/guides',
    agents: '.fixture/agents',
    hooks: '.fixture/hooks'
  },
  contextAttachSyntax: 'Reference the file by path.',
  newChatGuidance: 'Open a new chat',
  subagentGuidance: {
    hasSubagents: true,
    toolSyntax: 'Agent(...)',
    explorerName: 'Explore',
    configNote: null
  }
};

/**
 * Replaces placeholders in a fragment using the stub target.
 */
function replace(content, overrides = {}) {
  return replacePlaceholders(content, {
    version: '9.9.9',
    target: { ...target, ...overrides },
    now: new Date('2026-01-01T00:00:00.000Z')
  });
}

describe('replacePlaceholders', () => {
  it('resolves SKILL_NAME to the namespaced invocation name', () => {
    expect(replace('{SKILL_NAME:test}')).toBe('/apm.test');
    expect(replace('{SKILL_NAME:communication}')).toBe('/apm.communication');
  });

  it('resolves every SKILL_NAME occurrence in a document', () => {
    expect(replace('{SKILL_NAME:one} and {SKILL_NAME:two}')).toBe('/apm.one and /apm.two');
  });

  it('resolves HOOK_PATH to a .sh file under the hooks directory', () => {
    expect(replace('{HOOK_PATH:session-start}')).toBe('.fixture/hooks/session-start.sh');
  });

  it('no longer resolves COMMAND_PATH', () => {
    expect(replace('{COMMAND_PATH:apm-1-initiate-planner}')).toBe('{COMMAND_PATH:apm-1-initiate-planner}');
  });

  it('reads RULES_FILE from the target configuration rather than the target id', () => {
    expect(replace('{RULES_FILE}')).toBe('FIXTURE_RULES.md');
    expect(replace('{RULES_FILE}', { rulesFile: 'OTHER.md' })).toBe('OTHER.md');
  });

  it('does not derive RULES_FILE from the target id', () => {
    // A non-claude id must not change the outcome: the field is the only source.
    expect(replace('{RULES_FILE}', { id: 'something-else' })).toBe('FIXTURE_RULES.md');
  });

  it('resolves the path placeholders against the target directories', () => {
    expect(replace('{SKILL_PATH:apm.sample}')).toBe('.fixture/skills/apm.sample/SKILL.md');
    expect(replace('{GUIDE_PATH:task-execution}')).toBe('.fixture/guides/task-execution.md');
    expect(replace('{AGENT_PATH:apm-archive-explorer}')).toBe('.fixture/agents/apm-archive-explorer.md');
  });

  it('resolves the directory placeholders', () => {
    expect(replace('{SKILLS_DIR} {GUIDES_DIR} {AGENTS_DIR}')).toBe(
      '.fixture/skills .fixture/guides .fixture/agents'
    );
  });

  it('resolves version, timestamp and args', () => {
    expect(replace('{VERSION}')).toBe('9.9.9');
    expect(replace('{TIMESTAMP}')).toBe('2026-01-01T00:00:00.000Z');
    expect(replace('{ARGS}')).toBe('$ARGUMENTS');
  });

  it('builds the subagent guidance from the target configuration', () => {
    const result = replace('{WORKER_SUBAGENT_GUIDANCE}');
    expect(result).toContain('Explore');
    expect(result).toContain('Agent(...)');
    expect(result).not.toContain('{WORKER_SUBAGENT_GUIDANCE}');
  });

  it('leaves content without placeholders untouched', () => {
    expect(replace('Plain text with { braces } and $ARGUMENTS.')).toBe(
      'Plain text with { braces } and $ARGUMENTS.'
    );
  });
});

describe('shell expansions in scripts that receive substitution', () => {
  // Shell scripts are substituted, and `${NAME}` contains `{NAME}`. A hook that
  // expanded a variable sharing a name with a placeholder would be rewritten
  // into something that still parses: `${VERSION}` becomes `$1.0.1`. Nothing at
  // runtime reports that, so the collision is caught here instead.
  it('does not rewrite any shell variable the hooks expand', async () => {
    const hooksDir = path.join(repoRoot, 'templates', 'hooks');
    const target = await readTarget();
    const collisions = [];

    for (const name of await fs.readdir(hooksDir)) {
      if (!name.endsWith('.sh')) {
        continue;
      }

      const script = await fs.readFile(path.join(hooksDir, name), 'utf8');

      for (const [, variable] of script.matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g)) {
        const braced = `{${variable}}`;
        const substituted = replacePlaceholders(braced, { version: '0.0.0', target });

        if (substituted !== braced) {
          collisions.push(`${name} expands \${${variable}}, which the build would rewrite`);
        }
      }
    }

    expect([...new Set(collisions)]).toEqual([]);
  });
});
