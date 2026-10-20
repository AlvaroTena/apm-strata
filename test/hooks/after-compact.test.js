/**
 * Tests for the after-compaction notice hook.
 *
 * The script is executed as the platform executes it: the SessionStart payload
 * arrives on stdin and the notice, when there is one, is JSON on stdout. The
 * transcripts are fixtures shaped like the records Claude Code writes, so the
 * patterns that decide whether the session held a role are exercised against
 * the real structure.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..', '..');
const hook = path.join(repoRoot, 'templates', 'hooks', 'apm-after-compact.sh');
const fixtures = path.join(repoRoot, 'test', 'fixtures', 'transcripts');

let scratch;

/**
 * Runs the hook against a payload and returns what it printed.
 *
 * @param {Object} payload - The SessionStart payload.
 * @returns {{status: number, stdout: string}} Exit status and stdout.
 */
function runHook(payload) {
  const result = spawnSync('sh', [hook], {
    input: JSON.stringify({
      session_id: 'test-session',
      hook_event_name: 'SessionStart',
      source: 'compact',
      ...payload
    }),
    encoding: 'utf8'
  });
  return { status: result.status, stdout: result.stdout };
}

/** Writes a one-record transcript and returns its path. */
async function transcriptWith(record) {
  const file = path.join(scratch, 'session.jsonl');
  await fs.outputFile(file, `${JSON.stringify(record)}\n`);
  return file;
}

beforeEach(async () => {
  scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'apm-compact-test-'));
});

afterEach(async () => {
  await fs.remove(scratch);
});

describe('after-compaction notice: a session that held a role', () => {
  it('adds the recovery notice as additional context', () => {
    const { status, stdout } = runHook({
      transcript_path: path.join(fixtures, 'with-role.jsonl')
    });

    expect(status).toBe(0);
    const output = JSON.parse(stdout);
    expect(output.hookSpecificOutput.hookEventName).toBe('SessionStart');
    expect(output.hookSpecificOutput.additionalContext).toContain(
      '.claude/skills/apm.recover/SKILL.md'
    );
    expect(output.hookSpecificOutput.additionalContext).toContain('assignment step');
    expect(output.hookSpecificOutput.additionalContext).toContain('Write tool');
  });

  it('words the notice as statements of fact', () => {
    const { stdout } = runHook({ transcript_path: path.join(fixtures, 'with-role.jsonl') });
    const text = JSON.parse(stdout).hookSpecificOutput.additionalContext;

    expect(text).not.toMatch(/\b(you|your|must|before answering)\b/i);
    expect(text).not.toMatch(/(^|\. )(Read|Follow|Reread|Write|Run)\b/);
  });

  it.each(['apm.plan', 'apm.manage', 'apm.work'])('recognises a typed %s', async (role) => {
    const transcript = await transcriptWith({
      type: 'user',
      message: {
        role: 'user',
        content: `<command-message>${role}</command-message>\n<command-name>/${role}</command-name>`
      }
    });

    const { status, stdout } = runHook({ transcript_path: transcript });

    expect(status).toBe(0);
    expect(stdout).toContain('additionalContext');
  });

  it('recognises a Skill tool call for a role', async () => {
    const transcript = await transcriptWith({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'toolu_01', name: 'Skill', input: { skill: 'apm.work' } }]
      }
    });

    expect(runHook({ transcript_path: transcript }).stdout).toContain('additionalContext');
  });

  it('recognises a read of the installed role SKILL.md', async () => {
    const transcript = await transcriptWith({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_01',
            name: 'Read',
            input: { file_path: '/work/parcel-app/.claude/skills/apm.plan/SKILL.md' }
          }
        ]
      }
    });

    expect(runHook({ transcript_path: transcript }).stdout).toContain('additionalContext');
  });
});

describe('after-compaction notice: nothing to say', () => {
  it('prints nothing for a transcript without a role', () => {
    const { status, stdout } = runHook({
      transcript_path: path.join(fixtures, 'without-role.jsonl')
    });

    expect(status).toBe(0);
    expect(stdout).toBe('');
  });

  it('prints nothing for a Skill call that is not a role', async () => {
    const transcript = await transcriptWith({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'toolu_01', name: 'Skill', input: { skill: 'apm.recover' } }]
      }
    });

    expect(runHook({ transcript_path: transcript }).stdout).toBe('');
  });

  it('prints nothing without a transcript path', () => {
    const { status, stdout } = runHook({});

    expect(status).toBe(0);
    expect(stdout).toBe('');
  });

  it('prints nothing for a transcript that does not exist', () => {
    const { status, stdout } = runHook({ transcript_path: path.join(scratch, 'missing.jsonl') });

    expect(status).toBe(0);
    expect(stdout).toBe('');
  });

  it('prints nothing for a transcript that cannot be read', async () => {
    const transcript = path.join(scratch, 'locked.jsonl');
    await fs.outputFile(
      transcript,
      '{"type":"user","message":{"role":"user","content":"<command-message>apm.work</command-message>"}}\n'
    );
    await fs.chmod(transcript, 0o000);

    const { status, stdout } = runHook({ transcript_path: transcript });

    expect(status).toBe(0);
    expect(stdout).toBe('');
  });

  it('exits 0 on a payload that is not JSON', () => {
    const result = spawnSync('sh', [hook], { input: 'not json', encoding: 'utf8' });

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
  });
});
