/**
 * Knowledge Command Module
 *
 * Handles 'apm knowledge init' — scaffolds the knowledge layer for the
 * consumer the project declares.
 *
 * The command drives the consumer interface and knows nothing about any
 * particular knowledge tool; everything tool-specific lives in the adapter.
 *
 * @module src/commands/knowledge
 */

import path from 'path';
import { getConsumer, DEFAULT_CONSUMER } from '../services/knowledge/index.js';
import logger from '../ui/logger.js';

/**
 * Directory name used for the vault when none is given.
 */
const DEFAULT_VAULT_DIR = 'wiki';

/**
 * Renders a path relative to the workspace when it sits inside it.
 *
 * @param {string} target - Absolute path to render.
 * @param {string} workspace - Absolute workspace path.
 * @returns {string} Workspace-relative path, or the absolute path.
 */
function displayPath(target, workspace) {
  const relative = path.relative(workspace, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return target;
  }
  return relative;
}

/**
 * Prints the rules block the project must declare.
 *
 * Printed without log prefixes because the block is meant to be copied
 * verbatim into the project's rules file.
 *
 * @param {string[]} lines - Block lines from the consumer.
 */
function printRulesBlock(lines) {
  logger.blank();
  logger.info('Declare this in the project rules file so the guides can find the knowledge layer:');
  logger.blank();
  for (const line of lines) {
    console.log(line);
  }
  logger.blank();
}

/**
 * Executes the knowledge init command.
 *
 * @param {Object} [options={}] - Command options.
 * @param {string} [options.consumer] - Knowledge consumer identifier.
 * @param {string} [options.vault] - Vault path.
 * @param {string} [options.cloneDir] - Directory to install the product into.
 * @returns {Promise<void>}
 */
export async function knowledgeInitCommand(options = {}) {
  const { consumer: consumerId = DEFAULT_CONSUMER, vault, cloneDir } = options;

  // 1. Check preconditions
  const workspace = process.cwd();
  const consumer = getConsumer(consumerId);
  consumer.checkPlatform();

  const vaultPath = path.resolve(workspace, vault || DEFAULT_VAULT_DIR);
  const resolvedCloneDir = consumer.resolveCloneDir(vaultPath, cloneDir);
  const rules = consumer.rulesBlock({
    vaultPath: displayPath(vaultPath, workspace),
    commandPath: displayPath(consumer.corePath(resolvedCloneDir), workspace)
  });

  // 2. One vault per project — a second run must not touch anything
  if (await consumer.isInitialized(vaultPath)) {
    logger.warn(`Knowledge layer already initialized at ${displayPath(vaultPath, workspace)}. Nothing to do.`);
    printRulesBlock(rules);
    return;
  }

  // 3. Verify the tools the consumer needs
  await consumer.checkPrerequisites();

  // 4. Install the product and initialize the vault
  let stop = () => {};
  const { cloned, changedPaths } = await consumer.install({
    vaultPath,
    cloneDir: resolvedCloneDir,
    onProgress: message => {
      stop();
      stop = logger.progress(message);
    }
  });
  stop();

  // 5. Report what changed
  if (cloned) {
    logger.success(`Installed ${consumer.id} ${consumer.product.version} at ${displayPath(resolvedCloneDir, workspace)}`);
  }
  logger.success(`Initialized vault at ${displayPath(vaultPath, workspace)} (${changedPaths.length} file(s))`);

  // 6. Tell the user what the project still has to declare
  printRulesBlock(rules);
}

export default knowledgeInitCommand;
