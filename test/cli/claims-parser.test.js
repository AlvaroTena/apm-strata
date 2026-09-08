/**
 * Tests for the task log claims parser.
 */

import { describe, it, expect } from 'vitest';
import { parseClaims } from '../../src/services/knowledge/claims.js';
import { CLIError } from '../../src/core/errors.js';

/**
 * Wraps a claims section in a plausible task log.
 */
function log(section) {
  return `---\nstage: 1\n---\n\n# Task\n\n## Summary\nText.\n\n${section}\n\n## Issues\nNone.\n`;
}

describe('parseClaims', () => {
  it('parses claim, evidence and supersedes', () => {
    const claims = parseClaims(
      log('## Claims\n- claim: The parser reads three fields.\n  evidence: src/a.js:10\n  supersedes: clm-old-1')
    );
    expect(claims).toEqual([
      {
        claim: 'The parser reads three fields.',
        evidence: 'src/a.js:10',
        supersedes: 'clm-old-1'
      }
    ]);
  });

  it('parses several claims in order', () => {
    const claims = parseClaims(
      log(
        '## Claims\n' +
          '- claim: First.\n  evidence: a\n  supersedes: none\n' +
          '- claim: Second.\n  evidence: b\n  supersedes: none'
      )
    );
    expect(claims.map(c => c.claim)).toEqual(['First.', 'Second.']);
  });

  it('reads none as an empty claim list', () => {
    expect(parseClaims(log('## Claims\nnone'))).toEqual([]);
    expect(parseClaims(log('## Claims\nNone'))).toEqual([]);
  });

  it('stops at the next heading', () => {
    const claims = parseClaims(
      '## Claims\n- claim: Only this one.\n  evidence: a\n  supersedes: none\n\n## Output\n- claim: not a claim\n'
    );
    expect(claims).toHaveLength(1);
  });

  it('treats supersedes as optional', () => {
    const claims = parseClaims(log('## Claims\n- claim: No supersedes line.\n  evidence: a'));
    expect(claims[0].supersedes).toBeNull();
  });

  it('rejects a missing section', () => {
    expect(() => parseClaims('# Task\n\n## Summary\nText.\n', 'task.md')).toThrow(CLIError);
    expect(() => parseClaims('# Task\n', 'task.md')).toThrow(/no "## Claims" section/);
  });

  it('rejects an empty section', () => {
    expect(() => parseClaims(log('## Claims\n'))).toThrow(/write none when there is nothing to claim/);
  });

  it('rejects a claim with no evidence', () => {
    expect(() => parseClaims(log('## Claims\n- claim: Unproven.\n  supersedes: none'))).toThrow(
      /claim 1 \("Unproven\."\) has no evidence/
    );
  });

  it('rejects a supersedes value that is not a claim id', () => {
    expect(() => parseClaims(log('## Claims\n- claim: A.\n  evidence: b\n  supersedes: the old one'))).toThrow(
      /not a claim id; use a clm- id or none/
    );
  });

  it('rejects a stray line inside the section', () => {
    expect(() => parseClaims(log('## Claims\n- claim: A.\n  evidence: b\n  notes: stray'))).toThrow(
      /unrecognized line in the claims section/
    );
  });

  it('rejects a field before any claim', () => {
    expect(() => parseClaims(log('## Claims\n  evidence: orphaned'))).toThrow(/appears before any claim/);
  });
});
