/**
 * Tests for `apm knowledge init`.
 *
 * The external product is never cloned and python3 is never executed: the
 * process runner is replaced by a double that answers a scripted command
 * table, and the filesystem probe that detects an existing vault is stubbed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';

const run = vi.fn();

vi.mock('../../src/services/knowledge/exec.js', () => ({
  run,
  default: { run }
}));

const pathExists = vi.fn();
const ensureDir = vi.fn(async () => {});

vi.mock('fs-extra', () => {
  const api = { pathExists, ensureDir };
  return { ...api, default: api };
});

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

const { knowledgeInitCommand } = await import('../../src/commands/knowledge.js');
const { PRODUCT } = await import('../../src/services/knowledge/claude-obsidian.js');
const { CLIError } = await import('../../src/core/errors.js');

const WORKSPACE = '/tmp/apm-knowledge-workspace';
const APPROVAL_HASH = 'a'.repeat(64);

/**
 * Scripts the process runner: python3 reports a version, the review step emits
 * an approval hash, the apply step reports what changed, git succeeds silently.
 */
function scriptRunner({ pythonVersion = 'Python 3.12.1' } = {}) {
  run.mockImplementation(async (command, args) => {
    if (command === 'python3' && args[0] === '--version') {
      return { stdout: `${pythonVersion}\n`, stderr: '' };
    }
    if (command === 'python3' && args.includes('--apply')) {
      return {
        stdout: JSON.stringify({
          status: 'complete',
          changed_paths: ['.claude-obsidian.json', 'wiki/index.md']
        }),
        stderr: ''
      };
    }
    if (command === 'python3') {
      return { stdout: JSON.stringify({ approved_plan_sha256: APPROVAL_HASH }), stderr: '' };
    }
    if (command === 'git') {
      return { stdout: '', stderr: '' };
    }
    throw new Error(`unexpected command: ${command} ${args.join(' ')}`);
  });
}

/**
 * Collects everything printed straight to stdout, which is where the rules
 * block goes so it stays copy-pasteable.
 */
function captureStdout() {
  const lines = [];
  const spy = vi.spyOn(console, 'log').mockImplementation(message => {
    lines.push(String(message ?? ''));
  });
  return { lines, restore: () => spy.mockRestore() };
}

/**
 * Returns the python3 invocations the command made.
 */
function pythonCalls() {
  return run.mock.calls.filter(([command]) => command === 'python3');
}

describe('apm knowledge init', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'cwd').mockReturnValue(WORKSPACE);
    pathExists.mockResolvedValue(false);
    scriptRunner();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('clones the pinned product and initializes the default vault', async () => {
    const { lines, restore } = captureStdout();
    await knowledgeInitCommand();
    restore();

    const [cloneCall, checkoutCall] = run.mock.calls.filter(([command]) => command === 'git');
    expect(cloneCall[1]).toEqual([
      'clone',
      '--quiet',
      PRODUCT.repository,
      path.join(WORKSPACE, '.claude-obsidian')
    ]);
    expect(checkoutCall[1]).toContain(PRODUCT.commit);

    const [, review, apply] = pythonCalls();
    expect(review[1]).toContain('init');
    expect(review[1]).toContain(path.join(WORKSPACE, 'wiki'));
    expect(apply[1]).toContain('--approved-plan-sha256');
    expect(apply[1]).toContain(APPROVAL_HASH);
    expect(apply[1]).toContain('--apply');

    expect(lines).toContain('## Knowledge layer');
  });

  it('generates a canonical UTC timestamp with no sub-second precision', async () => {
    await knowledgeInitCommand();

    const [, review] = pythonCalls();
    const generatedAt = review[1][review[1].indexOf('--generated-at') + 1];
    expect(generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(new Date(generatedAt).getTime()).not.toBeNaN();
  });

  it('reads the approval hash from the review step instead of assuming one', async () => {
    const otherHash = 'b'.repeat(64);
    run.mockImplementation(async (command, args) => {
      if (command === 'git') return { stdout: '', stderr: '' };
      if (args[0] === '--version') return { stdout: 'Python 3.11.0\n', stderr: '' };
      if (args.includes('--apply')) return { stdout: JSON.stringify({ changed_paths: [] }), stderr: '' };
      return { stdout: JSON.stringify({ approved_plan_sha256: otherHash }), stderr: '' };
    });

    await knowledgeInitCommand();

    const apply = pythonCalls().at(-1);
    expect(apply[1]).toContain(otherHash);
  });

  it('does nothing when the vault is already initialized', async () => {
    pathExists.mockResolvedValue(true);

    const { lines, restore } = captureStdout();
    await knowledgeInitCommand();
    restore();

    expect(run).not.toHaveBeenCalled();
    expect(lines).toContain('## Knowledge layer');
  });

  it('fails with a CLIError naming the required Python version', async () => {
    scriptRunner({ pythonVersion: 'Python 3.9.6' });

    await expect(knowledgeInitCommand()).rejects.toThrow(CLIError);
    await expect(knowledgeInitCommand()).rejects.toThrow(/Python 3\.11 or newer is required/);
    expect(run.mock.calls.some(([command]) => command === 'git')).toBe(false);
  });

  it('fails with a CLIError when python3 is missing entirely', async () => {
    run.mockImplementation(async command => {
      if (command === 'python3') throw new Error('spawn python3 ENOENT');
      return { stdout: '', stderr: '' };
    });

    await expect(knowledgeInitCommand()).rejects.toThrow(/Python 3\.11 or newer is required/);
  });

  it('prints the rules block with the consumer, vault and command keys', async () => {
    const { lines, restore } = captureStdout();
    await knowledgeInitCommand();
    restore();

    const start = lines.indexOf('## Knowledge layer');
    expect(start).toBeGreaterThanOrEqual(0);
    expect(lines.slice(start, start + 4)).toEqual([
      '## Knowledge layer',
      '- consumer: claude-obsidian',
      '- vault: wiki',
      `- command: python3 ${path.join('.claude-obsidian', 'scripts', 'claude-obsidian.py')}`
    ]);
  });

  it('honours an explicit vault and clone directory', async () => {
    const { lines, restore } = captureStdout();
    await knowledgeInitCommand({ vault: 'docs/knowledge', cloneDir: '/opt/claude-obsidian' });
    restore();

    const cloneCall = run.mock.calls.find(([command]) => command === 'git');
    expect(cloneCall[1]).toContain('/opt/claude-obsidian');

    const start = lines.indexOf('## Knowledge layer');
    expect(lines[start + 2]).toBe(`- vault: ${path.join('docs', 'knowledge')}`);
    expect(lines[start + 3]).toBe(
      `- command: python3 ${path.join('/opt/claude-obsidian', 'scripts', 'claude-obsidian.py')}`
    );
  });

  it('rejects an unknown consumer', async () => {
    await expect(knowledgeInitCommand({ consumer: 'nope' })).rejects.toThrow(
      /Unknown knowledge consumer 'nope'/
    );
  });
});
