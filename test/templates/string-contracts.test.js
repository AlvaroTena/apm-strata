/**
 * Locks the literal strings one surface writes and another matches.
 *
 * These contracts fail silently by construction. When a heading is reworded on
 * one side, the side that matches it finds nothing, reports nothing, and the
 * mechanism it feeds simply stops happening. Nothing at runtime can tell that
 * apart from there being nothing to find, so the check has to live here.
 *
 * To add a contract, append an entry to CONTRACTS. A side matches the literal
 * as plain text unless it declares its own `match`, which is what a side needs
 * when it carries the string inside a regular expression rather than as prose.
 * A side's `file` is relative to `templates/` unless the side declares
 * `root: 'repo'`, which resolves it from the repository root instead - the form
 * a contract needs when one side lives in the CLI or in the documentation.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { repoRoot } from '../build/support.js';

const ROOTS = {
  templates: path.join(repoRoot, 'templates'),
  repo: repoRoot
};

/** Returns the absolute path of a side's file under its declared root. */
function resolveSide(side) {
  return path.join(ROOTS[side.root ?? 'templates'], side.file);
}

const CONTRACTS = [
  {
    name: 'deferred work section of the session summary',
    literal: 'Deferred work',
    sides: [
      { role: 'writes', file: 'skills/apm.summarize/SKILL.md' },
      { role: 'reads', file: 'guides/context-gathering.md' }
    ]
  },
  {
    name: 'deferred table heading of the Tracker',
    literal: '## Deferred',
    sides: [
      { role: 'writes', file: 'apm/tracker.md' },
      { role: 'specifies', file: 'guides/task-review.md' },
      // The gate matches the heading with an awk regular expression, so the
      // literal never appears as plain text on this side.
      { role: 'reads', file: 'hooks/apm-dispatch-gate.sh', match: /\^##\[\[:space:\]\]\+Deferred/ }
    ]
  },
  {
    name: 'spec deltas section of the Task Prompt',
    literal: '## Spec Deltas',
    sides: [
      { role: 'writes', file: 'guides/task-assignment.md' },
      { role: 'reads', file: 'guides/task-execution.md' },
      // The gate finds the heading with an awk regular expression; the plain
      // text also appears in its comments and messages, so match the pattern.
      { role: 'reads', file: 'hooks/apm-dispatch-gate.sh', match: /\^## Spec Deltas\[\[:space:\]\]\*\$/ }
    ]
  },
  {
    name: 'self-review section of the Task Log',
    literal: '## Self-Review',
    sides: [
      { role: 'writes', file: 'guides/task-logging.md' },
      { role: 'specifies', file: 'guides/task-execution.md' },
      { role: 'reads', file: 'guides/task-review.md' }
    ]
  },
  {
    name: 'tracker declaration heading of the Rules block',
    literal: '## Tracker',
    sides: [
      { role: 'writes', file: 'guides/work-breakdown.md' },
      { role: 'reads', file: 'guides/context-gathering.md' },
      { role: 'reads', file: 'guides/task-review.md' }
    ]
  },
  {
    // The README's provenance table is the attribution the MIT license of the
    // adapted material requires, so a wrong link there is not a typo.
    name: 'claude-obsidian repository in the provenance table',
    literal: 'https://github.com/AgriciDaniel/claude-obsidian',
    sides: [
      { role: 'writes', root: 'repo', file: 'src/services/knowledge/claude-obsidian.js' },
      { role: 'reads', root: 'repo', file: 'README.md' }
    ]
  }
];

describe('string contracts between surfaces', () => {
  for (const contract of CONTRACTS) {
    describe(contract.name, () => {
      for (const side of contract.sides) {
        it(`${side.file} ${side.role} it`, async () => {
          const content = await fs.readFile(resolveSide(side), 'utf8');
          const found = side.match ? side.match.test(content) : content.includes(contract.literal);

          expect(
            found,
            `${side.file} no longer ${side.role} the literal "${contract.literal}" ` +
              `(contract: ${contract.name}). ` +
              'Every side of this contract has to change together, or the mechanism ' +
              'it feeds stops working without reporting anything.'
          ).toBe(true);
        });
      }
    });
  }

  it('describes at least two sides per contract', () => {
    // A one-sided contract cannot detect drift, which is the whole point.
    for (const contract of CONTRACTS) {
      expect(contract.sides.length, `${contract.name} needs at least two sides`)
        .toBeGreaterThanOrEqual(2);
    }
  });
});
