/**
 * Shared helpers for the build test suite.
 *
 * Builds always run into a fresh temporary directory: the pipeline empties its
 * output directory and deletes its staging directory, so it must never be
 * pointed at the repository.
 */

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import AdmZip from 'adm-zip';
import { buildAll } from '../../build/processors/templates.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));

/** Repository root, resolved from this file rather than the process cwd. */
export const repoRoot = path.resolve(testDir, '..', '..');

/** Versioned fixture tree standing in for templates/. */
export const fixtureTemplates = path.join(repoRoot, 'test', 'fixtures', 'templates');

/** Versioned SKILL.md files that must be rejected by frontmatter validation. */
export const invalidFrontmatter = path.join(repoRoot, 'test', 'fixtures', 'invalid-frontmatter');

/**
 * Reads the single target from the real build configuration.
 *
 * Tests use it so that a change to the shipped directory layout shows up here
 * instead of drifting against a hard-coded copy.
 *
 * @returns {Promise<Object>} Target configuration object.
 */
export async function readTarget() {
  const config = await fs.readJson(path.join(repoRoot, 'build', 'build-config.json'));
  return config.targets[0];
}

/**
 * Creates a temporary directory removed by the returned cleanup function.
 *
 * @returns {Promise<{dir: string, cleanup: () => Promise<void>}>} Temp directory handle.
 */
export async function makeTempDir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'apm-build-test-'));
  return { dir, cleanup: () => fs.remove(dir) };
}

/**
 * Runs the pipeline against a source directory and returns the bundle it produced.
 *
 * Build logging is suppressed so a failing assertion is not buried in output.
 *
 * @param {Object} options - Build options.
 * @param {string} options.sourceDir - Templates directory to build from.
 * @param {string} options.outputDir - Temporary directory to build into.
 * @param {Object} options.target - Target configuration.
 * @returns {Promise<{entries: Object[], zipPath: string}>} Archive entries and path.
 */
export async function runBuild({ sourceDir, outputDir, target }) {
  const log = console.log;
  console.log = () => {};

  try {
    await buildAll({
      build: { sourceDir, outputDir, cleanOutput: true },
      targets: [target]
    });
  } finally {
    console.log = log;
  }

  const zipPath = path.join(outputDir, target.bundleName);
  return { entries: new AdmZip(zipPath).getEntries(), zipPath };
}

/**
 * Maps archive entries to a bundle view keyed by path.
 *
 * @param {Object[]} entries - Archive entries from runBuild.
 * @returns {{paths: string[], text: (p: string) => string, mode: (p: string) => number}} Bundle view.
 */
export function readBundle(entries) {
  const byPath = new Map(entries.map(entry => [entry.entryName, entry]));

  const get = entryPath => {
    const entry = byPath.get(entryPath);
    if (!entry) {
      throw new Error(`Bundle has no entry "${entryPath}"`);
    }
    return entry;
  };

  return {
    paths: entries.map(entry => entry.entryName).sort(),
    text: entryPath => get(entryPath).getData().toString('utf8'),
    // The unix mode lives in the high 16 bits of the external attributes field
    mode: entryPath => (get(entryPath).header.attr >>> 16) & 0o777
  };
}
