/**
 * Tests for the help output.
 *
 * These run the entry point as a process, because the help text and the help
 * wiring both live there and neither is reachable by importing a module.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const execFileAsync = promisify(execFile);
const ENTRY = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../src/index.js');

/**
 * Runs the CLI and returns its stdout.
 */
async function cli(...args) {
  const { stdout } = await execFileAsync(process.execPath, [ENTRY, ...args], {
    env: { ...process.env, FORCE_COLOR: '0' }
  });
  return stdout;
}

describe('apm --help', () => {
  let help;

  beforeAll(async () => {
    help = await cli('--help');
  });

  it('lists every command', () => {
    for (const command of ['init', 'custom', 'update', 'archive', 'add', 'remove', 'status', 'knowledge', 'delta']) {
      expect(help).toMatch(new RegExp(`^  ${command}\\s`, 'm'));
    }
  });

  it('lists the knowledge and delta subcommands', () => {
    expect(help).toContain('knowledge init');
    expect(help).toContain('knowledge emit');
    expect(help).toContain('knowledge audit');
    expect(help).toContain('delta validate');
  });

  it('does not tell the user to update the upstream npm package', () => {
    expect(help).not.toContain('npm update -g agentic-pm');
  });

  it('points the update instruction at this repository', () => {
    expect(help).toContain('npm install -g AlvaroTena/apm-strata');
    expect(help).toContain('Installed from git, not from npm');
  });
});

describe('subcommand help', () => {
  it('documents a subcommand instead of reprinting the global help', async () => {
    const help = await cli('knowledge', 'emit', '--help');
    expect(help).toContain('Usage: apm knowledge emit');
    expect(help).toContain('--task-log <path>');
    expect(help).not.toContain('Agentic Project Management');
  });

  it('documents a command that predates the knowledge layer', async () => {
    const help = await cli('init', '--help');
    expect(help).toContain('Usage: apm init');
    expect(help).toContain('-a, --assistant');
  });

  it('documents a positional argument', async () => {
    const help = await cli('delta', 'validate', '--help');
    expect(help).toContain('Usage: apm delta validate');
    expect(help).toMatch(/^ +path\s/m);
  });
});
