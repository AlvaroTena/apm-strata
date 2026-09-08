/**
 * Tests that extraction preserves the execute bit.
 *
 * The bundle ships hook scripts executable. Writing them at the default mode
 * leaves a declared hook that cannot run, and nothing reports it.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import AdmZip from 'adm-zip';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { extractBundle } from '../../src/services/extractor.js';

let dest;

/**
 * Builds a ZIP buffer with one entry per given mode.
 *
 * adm-zip takes the unix mode directly here and shifts it into the external
 * attributes itself, so the mode is passed unshifted.
 */
function zipWith(entries) {
  const zip = new AdmZip();
  for (const [name, mode] of Object.entries(entries)) {
    zip.addFile(name, Buffer.from('#!/bin/sh\nexit 0\n'), '', mode);
  }
  return zip.toBuffer();
}

/**
 * Returns the permission bits of an extracted file.
 */
async function modeOf(relative) {
  const stats = await fs.stat(path.join(dest, relative));
  return stats.mode & 0o777;
}

describe('extractBundle file modes', () => {
  beforeEach(async () => {
    dest = await fs.mkdtemp(path.join(os.tmpdir(), 'apm-extract-'));
  });

  afterEach(async () => {
    await fs.remove(dest);
  });

  it('makes an entry the archive marked executable executable', async () => {
    await extractBundle(zipWith({ '.claude/apm-hooks/gate.sh': 0o755 }), dest);

    expect(await modeOf('.claude/apm-hooks/gate.sh')).toBe(0o755);
  });

  it('leaves a plain file unexecutable', async () => {
    await extractBundle(zipWith({ '.claude/commands/apm.md': 0o644 }), dest);

    expect(await modeOf('.claude/commands/apm.md') & 0o111).toBe(0);
  });

  it('normalizes the mode instead of honouring whatever the archive says', async () => {
    // An archive does not get to request setuid or a group-writable script.
    await extractBundle(zipWith({ 'odd.sh': 0o4777 }), dest);

    expect(await modeOf('odd.sh')).toBe(0o755);
  });

  it('tolerates an archive that records no unix mode', async () => {
    await extractBundle(zipWith({ 'nomode.md': 0 }), dest);

    expect(await fs.pathExists(path.join(dest, 'nomode.md'))).toBe(true);
  });
});
