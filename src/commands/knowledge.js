/**
 * Knowledge Command Module
 *
 * Handles the 'apm knowledge' subcommands: 'init' scaffolds the layer, 'emit'
 * ingests a task log into it, and 'audit' reports on the substrate.
 *
 * The command drives the consumer interface and knows nothing about any
 * particular knowledge tool; everything tool-specific lives in the adapter.
 *
 * @module src/commands/knowledge
 */

import path from 'path';
import fs from 'fs-extra';
import { CLIError } from '../core/errors.js';
import { getConsumer, DEFAULT_CONSUMER } from '../services/knowledge/index.js';
import { parseClaims } from '../services/knowledge/claims.js';
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

/**
 * Resolves the shared context every subcommand needs.
 *
 * @param {Object} options - Command options.
 * @returns {Object} Context as { consumer, workspace, vaultPath, cloneDir }.
 */
function resolveContext(options) {
  const { consumer: consumerId = DEFAULT_CONSUMER, vault, cloneDir } = options;
  const workspace = process.cwd();
  const consumer = getConsumer(consumerId);
  consumer.checkPlatform();

  const vaultPath = path.resolve(workspace, vault || DEFAULT_VAULT_DIR);
  return {
    consumer,
    workspace,
    vaultPath,
    cloneDir: consumer.resolveCloneDir(vaultPath, cloneDir)
  };
}

/**
 * Fails when the vault has not been initialized yet.
 *
 * @param {Object} consumer - Consumer adapter.
 * @param {string} vaultPath - Absolute vault path.
 * @param {string} workspace - Absolute workspace path.
 * @throws {CLIError} When the vault is absent.
 */
async function requireVault(consumer, vaultPath, workspace) {
  if (!(await consumer.isInitialized(vaultPath))) {
    throw CLIError.knowledgeSetupFailed(
      'vault selection',
      `no knowledge vault at ${displayPath(vaultPath, workspace)}. Run "apm knowledge init" first.`
    );
  }
}

/**
 * Runs an adapter step while showing progress.
 *
 * @param {Function} step - Receives an onProgress callback.
 * @returns {Promise<*>} Whatever the step resolves to.
 */
async function withProgress(step) {
  let stop = () => {};
  try {
    return await step(message => {
      stop();
      stop = logger.progress(message);
    });
  } finally {
    stop();
  }
}

/**
 * Ingests a task log into the knowledge layer.
 *
 * The page is assembled from the task log's claims section; nothing is
 * authored here.
 *
 * @param {Object} [options={}] - Command options.
 * @param {string} options.taskLog - Path of the task log to ingest.
 * @param {string} options.project - Project name.
 * @param {string|number} options.stage - Stage number.
 * @param {string|number} options.task - Task number.
 * @param {string} [options.vault] - Vault path.
 * @param {string} [options.cloneDir] - Consumer product directory.
 * @param {string} [options.consumer] - Knowledge consumer identifier.
 * @returns {Promise<void>}
 */
export async function knowledgeEmitCommand(options = {}) {
  const { taskLog, project, stage, task } = options;

  // 1. Check preconditions
  const { consumer, workspace, vaultPath, cloneDir } = resolveContext(options);
  await requireVault(consumer, vaultPath, workspace);

  const taskLogPath = path.resolve(workspace, taskLog);
  if (!(await fs.pathExists(taskLogPath))) {
    throw CLIError.taskLogInvalid(displayPath(taskLogPath, workspace), 'file not found');
  }

  // 2. Read what the task log claims
  const claims = parseClaims(await fs.readFile(taskLogPath, 'utf8'), displayPath(taskLogPath, workspace));

  // 3. A task with nothing to claim emits nothing
  if (!claims.length) {
    logger.warn(`${displayPath(taskLogPath, workspace)} declares no claims. Nothing emitted.`);
    return;
  }

  // 4. Ingest
  const result = await withProgress(onProgress =>
    consumer.emit({
      vaultPath,
      cloneDir,
      taskLogPath,
      reference: { project, stage, task },
      claims,
      onProgress
    })
  );

  // 5. Report what landed
  logger.success(`Ingested ${result.claimIds.length} claim(s) into ${result.pagePath}`);
  for (const id of result.claimIds) {
    logger.info(`${id} (provisional)`, { indent: true });
  }

  // 6. Point at the source record the claims hang from
  logger.info(`Source recorded as ${result.sourceId}`);
}

/**
 * Audits the knowledge substrate and writes the report.
 *
 * @param {Object} [options={}] - Command options.
 * @param {string} options.out - Path to write the report to.
 * @param {string} [options.asOf] - Audit date as YYYY-MM-DD.
 * @param {string} [options.vault] - Vault path.
 * @param {string} [options.cloneDir] - Consumer product directory.
 * @param {string} [options.consumer] - Knowledge consumer identifier.
 * @returns {Promise<void>}
 */
export async function knowledgeAuditCommand(options = {}) {
  const { out, asOf } = options;

  // 1. Check preconditions
  const { consumer, workspace, vaultPath, cloneDir } = resolveContext(options);
  await requireVault(consumer, vaultPath, workspace);

  if (asOf && !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    throw CLIError.knowledgeSetupFailed('audit', `--as-of must be an ISO date (YYYY-MM-DD), got "${asOf}"`);
  }

  // 2. Collect the substrate report
  const result = await withProgress(onProgress => consumer.audit({ vaultPath, cloneDir, asOf, onProgress }));

  // 3. Compose the report
  const report = [result.lint.trimEnd(), '', '## Disputed Claims', ''];
  if (result.disputed.length) {
    for (const claim of result.disputed) {
      report.push(`- \`${claim.id}\`: ${claim.text}`);
      report.push(`  - assessment: ${claim.assessment}`);
      if (claim.page) report.push(`  - page: ${claim.page}`);
      for (const reason of claim.reasons) report.push(`  - ${reason}`);
    }
  } else {
    report.push('None.');
  }

  // 4. Write it where the next planner will read it
  const outPath = path.resolve(workspace, out);
  await fs.ensureDir(path.dirname(outPath));
  await fs.writeFile(outPath, `${report.join('\n')}\n`, 'utf8');

  // 5. Report
  logger.success(`Audit as of ${result.asOf} written to ${displayPath(outPath, workspace)}`);

  // 6. Surface what needs a human
  if (result.disputed.length) {
    logger.warn(`${result.disputed.length} claim(s) in dispute.`);
  }
}

export default knowledgeInitCommand;
