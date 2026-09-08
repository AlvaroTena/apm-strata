/**
 * Resolves the Runtime pointers in the workflow standard against the templates.
 *
 * The build skips _standards/, so nothing else reads these paths. A task that
 * moves or renames a template leaves the pointer behind it pointing at nothing,
 * and the standard goes on reading as though it were still true.
 *
 * A pointer is a backtick-quoted path inside a `**Runtime:**` line, relative to
 * templates/. It may name a file, a directory, or a glob.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { repoRoot } from '../build/support.js';

const templates = path.join(repoRoot, 'templates');
const standard = path.join(templates, '_standards', 'WORKFLOW.md');

/**
 * Extracts every backtick-quoted pointer from the Runtime lines of a standard.
 *
 * @param {string} content - Standard file content.
 * @returns {Array<{pointer: string, line: number}>} Pointers with their line numbers.
 */
export function collectRuntimePointers(content) {
  const pointers = [];

  content.split('\n').forEach((text, index) => {
    if (!text.startsWith('**Runtime:**')) {
      return;
    }
    for (const match of text.matchAll(/`([^`]+)`/g)) {
      pointers.push({ pointer: match[1], line: index + 1 });
    }
  });

  return pointers;
}

/**
 * Resolves one pointer against the templates tree.
 *
 * @param {string} pointer - Path relative to templates/.
 * @returns {Promise<boolean>} Whether the pointer names something that exists.
 */
async function resolves(pointer) {
  if (pointer.includes('*')) {
    const dir = path.join(templates, path.dirname(pointer));
    if (!await fs.pathExists(dir)) {
      return false;
    }
    const pattern = new RegExp(
      `^${path.basename(pointer).replace(/[.]/g, '\\.').replace(/\*/g, '.*')}$`
    );
    return (await fs.readdir(dir)).some(entry => pattern.test(entry));
  }

  return fs.pathExists(path.join(templates, pointer));
}

describe('Runtime pointers in the workflow standard', () => {
  let pointers;

  beforeAll(async () => {
    pointers = collectRuntimePointers(await fs.readFile(standard, 'utf8'));
  });

  it('finds pointers to check', () => {
    // A parser that silently matched nothing would make every assertion vacuous.
    expect(pointers.length).toBeGreaterThan(0);
  });

  it('resolves every pointer against the templates tree', async () => {
    const unresolved = [];

    for (const { pointer, line } of pointers) {
      if (!await resolves(pointer)) {
        unresolved.push(`WORKFLOW.md:${line} points at "${pointer}", which does not exist`);
      }
    }

    expect(unresolved).toEqual([]);
  });

  it('keeps pointers relative to the templates directory', () => {
    for (const { pointer, line } of pointers) {
      expect(pointer.startsWith('/'), `WORKFLOW.md:${line}: "${pointer}" must be relative`).toBe(false);
      expect(pointer.includes('..'), `WORKFLOW.md:${line}: "${pointer}" must not escape templates/`).toBe(false);
    }
  });
});

describe('collectRuntimePointers', () => {
  it('reads every backtick span on a Runtime line', () => {
    const found = collectRuntimePointers('**Runtime:** `a/b.md`, `c/d.md` §2\nother text `e.md`\n');

    expect(found).toEqual([
      { pointer: 'a/b.md', line: 1 },
      { pointer: 'c/d.md', line: 1 }
    ]);
  });

  it('ignores a Runtime line written as prose', () => {
    expect(collectRuntimePointers('**Runtime:** every guide and every role skill\n')).toEqual([]);
  });
});
