/**
 * Keeps the error surface to codes that something can actually produce.
 *
 * A code with no factory, or a factory nothing calls, reads in the standard as
 * a failure the build can report and is in fact unreachable. That is the same
 * shape of problem as a frontmatter key the platform ignores: it looks like a
 * mechanism and is not one.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { BuildError, BuildErrorCode } from '../../build/core/errors.js';
import { repoRoot } from './support.js';

/** Every static factory declared on BuildError. */
const factories = Object.getOwnPropertyNames(BuildError)
  .filter(name => typeof BuildError[name] === 'function' && !['length', 'name', 'prototype'].includes(name));

describe('BuildError surface', () => {
  it('produces every declared error code from some factory', () => {
    const produced = new Set();

    for (const name of factories) {
      // Arrays satisfy both the factories that interpolate their arguments and
      // the ones that join them. Only the resulting code matters here.
      produced.add(BuildError[name](['x'], ['y']).code);
    }

    const unreachable = Object.values(BuildErrorCode).filter(code => !produced.has(code));

    expect(unreachable).toEqual([]);
  });

  it('calls every factory somewhere in the build', async () => {
    const sources = [];

    async function walk(dir) {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory() && entry.name !== '_standards') {
          await walk(full);
        } else if (entry.isFile() && entry.name.endsWith('.js') && entry.name !== 'errors.js') {
          sources.push(await fs.readFile(full, 'utf8'));
        }
      }
    }

    await walk(path.join(repoRoot, 'build'));
    const code = sources.join('\n');
    const uncalled = factories.filter(name => !code.includes(`BuildError.${name}(`));

    expect(uncalled).toEqual([]);
  });

  it('carries the code and context on the thrown error', () => {
    const error = BuildError.frontmatterInvalid('skills/apm.sample/SKILL.md', ['missing name']);

    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe(BuildErrorCode.TEMPLATE_MISSING_FIELD);
    expect(error.context.file).toBe('skills/apm.sample/SKILL.md');
    expect(error.toJSON()).toMatchObject({ name: 'BuildError', code: BuildErrorCode.TEMPLATE_MISSING_FIELD });
  });
});
