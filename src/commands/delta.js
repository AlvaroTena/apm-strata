/**
 * Delta Command Module
 *
 * Handles 'apm delta validate' — checks spec deltas against the specs they
 * change.
 *
 * @module src/commands/delta
 */

import path from 'path';
import fs from 'fs-extra';
import { CLIError } from '../core/errors.js';
import { validateDelta } from '../services/delta.js';
import logger from '../ui/logger.js';

/**
 * Directory that holds change proposals, relative to the specs root.
 */
const CHANGES_DIR = 'changes';

/**
 * Directory that holds baseline specs, relative to the specs root.
 */
const SPECS_DIR = 'specs';

/**
 * Filename every spec and delta document uses.
 */
const SPEC_FILE = 'spec.md';

/**
 * Collects the delta documents under a directory.
 *
 * @param {string} root - Directory to search.
 * @returns {Promise<string[]>} Absolute paths, sorted.
 */
async function findDeltas(root) {
  const found = [];

  async function walk(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const target = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(target);
      } else if (entry.name === SPEC_FILE) {
        found.push(target);
      }
    }
  }

  await walk(root);
  return found.sort();
}

/**
 * Locates the baseline spec a delta changes.
 *
 * A delta lives at `<root>/changes/<change>/specs/<capability>/spec.md` and its
 * baseline at `<root>/specs/<capability>/spec.md`.
 *
 * @param {string} deltaPath - Absolute path of the delta document.
 * @returns {string|null} Absolute baseline path, or null when it cannot be derived.
 */
function baselinePathFor(deltaPath) {
  const parts = deltaPath.split(path.sep);
  const changesAt = parts.lastIndexOf(CHANGES_DIR);
  const specsAt = parts.lastIndexOf(SPECS_DIR);
  if (changesAt === -1 || specsAt <= changesAt) return null;

  const root = parts.slice(0, changesAt).join(path.sep);
  const capability = parts.slice(specsAt + 1, -1);
  if (!capability.length) return null;

  return path.join(root, SPECS_DIR, ...capability, SPEC_FILE);
}

/**
 * Executes the delta validate command.
 *
 * @param {string} target - Delta document or directory to validate.
 * @returns {Promise<void>}
 * @throws {CLIError} When nothing is found or a delta violates a rule.
 */
export async function deltaValidateCommand(target) {
  // 1. Check preconditions
  const workspace = process.cwd();
  const resolved = path.resolve(workspace, target);
  if (!(await fs.pathExists(resolved))) {
    throw CLIError.deltaNotFound(target, 'path does not exist');
  }

  // 2. Collect the documents to check
  const stats = await fs.stat(resolved);
  const deltas = stats.isDirectory() ? await findDeltas(resolved) : [resolved];
  if (!deltas.length) {
    throw CLIError.deltaNotFound(target, `no ${SPEC_FILE} found`);
  }

  // 3. Check each against the spec it changes
  let total = 0;
  for (const delta of deltas) {
    const baselinePath = baselinePathFor(delta);
    const baseline =
      baselinePath && (await fs.pathExists(baselinePath)) ? await fs.readFile(baselinePath, 'utf8') : '';

    const violations = validateDelta(await fs.readFile(delta, 'utf8'), baseline);
    const label = path.relative(workspace, delta) || delta;

    // 4. Report per document
    if (!violations.length) {
      logger.success(`${label}: valid`);
      continue;
    }

    total += violations.length;
    logger.error(`${label}: ${violations.length} violation(s)`);
    for (const item of violations) {
      logger.info(`line ${item.line} [${item.rule}] ${item.message}`, { indent: true });
    }
  }

  // 5. Report the run
  if (total) {
    throw CLIError.deltaInvalid(total);
  }

  // 6. Success
  logger.success(`${deltas.length} delta(s) valid.`);
}

export default deltaValidateCommand;
