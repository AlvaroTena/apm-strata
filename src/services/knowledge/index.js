/**
 * Knowledge Consumer Registry Module
 *
 * Resolves knowledge consumers by identifier so commands stay unaware of any
 * particular tool.
 *
 * A consumer adapter exposes:
 * - `id`: identifier accepted by --consumer and printed in the rules block.
 * - `product`: pinned upstream metadata, at least { version, commit }.
 * - `resolveCloneDir(vaultPath, cloneDir?)`: where the product is installed.
 * - `corePath(cloneDir)`: the product entry point to advertise.
 * - `checkPlatform(platform?)`: throws when the platform cannot be supported.
 * - `checkPrerequisites()`: throws when a required tool is missing or too old.
 * - `isInitialized(vaultPath)`: resolves true when the vault already exists.
 * - `install({ vaultPath, cloneDir, onProgress })`: installs and initializes.
 * - `rulesBlock({ vaultPath, commandPath })`: lines the project must declare.
 *
 * @module src/services/knowledge/index
 */

import { CLIError } from '../../core/errors.js';
import claudeObsidian from './claude-obsidian.js';

/**
 * Supported consumers, keyed by identifier.
 */
const CONSUMERS = {
  [claudeObsidian.id]: claudeObsidian
};

/**
 * Default consumer used when none is requested.
 */
export const DEFAULT_CONSUMER = claudeObsidian.id;

/**
 * Lists supported consumer identifiers.
 *
 * @returns {string[]} Sorted identifiers.
 */
export function listConsumers() {
  return Object.keys(CONSUMERS).sort();
}

/**
 * Resolves a consumer adapter by identifier.
 *
 * @param {string} id - Consumer identifier.
 * @returns {Object} Consumer adapter.
 * @throws {CLIError} When the identifier is not supported.
 */
export function getConsumer(id) {
  const consumer = CONSUMERS[id];
  if (!consumer) {
    throw CLIError.unknownConsumer(id, listConsumers());
  }
  return consumer;
}

export default { DEFAULT_CONSUMER, listConsumers, getConsumer };
