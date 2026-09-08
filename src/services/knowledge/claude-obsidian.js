/**
 * claude-obsidian Knowledge Adapter Module
 *
 * Implements the knowledge consumer interface for claude-obsidian: it clones
 * the pinned product, verifies prerequisites, initializes a vault, and reports
 * the rules the project must declare.
 *
 * Everything specific to this tool lives here. The command that drives it only
 * sees the interface described in `src/services/knowledge/index.js`.
 *
 * @module src/services/knowledge/claude-obsidian
 */

import path from 'path';
import fs from 'fs-extra';
import { CLIError } from '../../core/errors.js';
import { run } from './exec.js';

/**
 * Consumer identifier used by the command and printed in the rules block.
 */
export const CONSUMER_ID = 'claude-obsidian';

/**
 * Pinned upstream product. The commit is what actually determines behavior;
 * the version is carried alongside it for the messages the user reads.
 */
export const PRODUCT = {
  repository: 'https://github.com/AgriciDaniel/claude-obsidian',
  version: '2.1.1',
  commit: '9f8c1199047eac2c3828496279fbb7ba9540b90b'
};

/**
 * Minimum Python the product requires.
 */
const REQUIRED_PYTHON = { major: 3, minor: 11 };

/**
 * Directory name used for the clone when no explicit one is given.
 */
const CLONE_DIR_NAME = '.claude-obsidian';

/**
 * Product entry point, relative to the clone root.
 */
const CORE_SCRIPT = path.join('scripts', 'claude-obsidian.py');

/**
 * File the product writes to mark a directory as one of its vaults.
 */
const VAULT_MARKER = '.claude-obsidian.json';

/**
 * Operation identifier recorded in the vault for the initialization.
 */
const OPERATION_ID = 'apm-knowledge-init';

/**
 * Produces a canonical UTC timestamp.
 *
 * The product validates timestamps against the current UTC date, so a local
 * time would be rejected during the hours the two dates disagree. It also
 * rejects sub-second precision.
 *
 * @returns {string} Timestamp as YYYY-MM-DDTHH:MM:SSZ.
 */
function utcTimestamp() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Parses a `python3 --version` banner.
 *
 * @param {string} output - Combined command output.
 * @returns {Object|null} Parsed version as { major, minor, raw }, or null.
 */
function parsePythonVersion(output) {
  const match = /Python\s+(\d+)\.(\d+)(?:\.\d+)?/.exec(output);
  if (!match) return null;
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    raw: match[0]
  };
}

/**
 * Parses the JSON document a product command writes to stdout.
 *
 * @param {string} step - Step name used in the error message.
 * @param {string} stdout - Raw command output.
 * @returns {Object} Parsed document.
 * @throws {CLIError} When the output is not JSON.
 */
function parseProductJSON(step, stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    throw CLIError.knowledgeSetupFailed(step, `expected JSON output, got: ${stdout.trim().slice(0, 200)}`);
  }
}

/**
 * Runs a product command, converting failures into CLIError.
 *
 * @param {string} step - Step name used in the error message.
 * @param {string} command - Executable to run.
 * @param {string[]} args - Command arguments.
 * @returns {Promise<string>} Captured stdout.
 * @throws {CLIError} When the command fails.
 */
async function runStep(step, command, args) {
  try {
    const { stdout } = await run(command, args);
    return stdout;
  } catch (err) {
    const detail = (err.stderr || err.stdout || err.message || '').toString().trim();
    throw CLIError.knowledgeSetupFailed(step, detail || 'command failed');
  }
}

/**
 * Resolves the clone directory for a vault.
 *
 * @param {string} vaultPath - Absolute vault path.
 * @param {string} [cloneDir] - Explicit clone directory.
 * @returns {string} Absolute clone directory path.
 */
export function resolveCloneDir(vaultPath, cloneDir) {
  if (cloneDir) return path.resolve(cloneDir);
  return path.resolve(path.dirname(vaultPath), CLONE_DIR_NAME);
}

/**
 * Rejects platforms the product cannot write on.
 *
 * The transaction engine needs POSIX directory descriptors and flock. Under
 * WSL, process.platform reports 'linux', so only native Windows is rejected.
 *
 * @param {string} [platform=process.platform] - Platform identifier.
 * @throws {CLIError} On native Windows.
 */
export function checkPlatform(platform = process.platform) {
  if (platform === 'win32') {
    throw CLIError.unsupportedPlatform(
      platform,
      'claude-obsidian writes vaults through POSIX directory descriptors and file locks. Run this command inside WSL.'
    );
  }
}

/**
 * Verifies that a supported Python interpreter is available.
 *
 * This checks only. Installing an interpreter is left to the user, because
 * choosing how to install one is not a decision the CLI should make.
 *
 * @returns {Promise<Object>} Detected version as { major, minor, raw }.
 * @throws {CLIError} When python3 is missing or too old.
 */
export async function checkPrerequisites() {
  const requirement = `${REQUIRED_PYTHON.major}.${REQUIRED_PYTHON.minor} or newer`;
  let output;

  try {
    const result = await run('python3', ['--version']);
    output = `${result.stdout}${result.stderr}`;
  } catch {
    throw CLIError.prerequisiteMissing('Python', requirement);
  }

  const version = parsePythonVersion(output);
  if (!version) {
    throw CLIError.prerequisiteMissing('Python', requirement, `unrecognized output "${output.trim()}"`);
  }

  const tooOld =
    version.major < REQUIRED_PYTHON.major ||
    (version.major === REQUIRED_PYTHON.major && version.minor < REQUIRED_PYTHON.minor);

  if (tooOld) {
    throw CLIError.prerequisiteMissing('Python', requirement, version.raw);
  }

  return version;
}

/**
 * Reports whether a vault has already been initialized.
 *
 * @param {string} vaultPath - Absolute vault path.
 * @returns {Promise<boolean>} True when the vault marker exists.
 */
export async function isInitialized(vaultPath) {
  return fs.pathExists(path.join(vaultPath, VAULT_MARKER));
}

/**
 * Clones the pinned product when the clone is not already present.
 *
 * @param {string} cloneDir - Absolute clone directory path.
 * @returns {Promise<boolean>} True when a clone was created.
 * @throws {CLIError} When cloning or pinning fails.
 */
async function ensureClone(cloneDir) {
  if (await fs.pathExists(path.join(cloneDir, CORE_SCRIPT))) {
    return false;
  }

  await fs.ensureDir(path.dirname(cloneDir));
  await runStep('clone', 'git', ['clone', '--quiet', PRODUCT.repository, cloneDir]);
  await runStep('checkout', 'git', ['-C', cloneDir, 'checkout', '--quiet', PRODUCT.commit]);
  return true;
}

/**
 * Initializes a vault through the product's reviewed two-step flow.
 *
 * The approval hash is bound to the resolved vault path, so it cannot be
 * precomputed: the dry-run emits it and the apply consumes it.
 *
 * @param {string} cloneDir - Absolute clone directory path.
 * @param {string} vaultPath - Absolute vault path.
 * @returns {Promise<Object>} Apply result as { approvalHash, changedPaths }.
 * @throws {CLIError} When either step fails.
 */
async function initializeVault(cloneDir, vaultPath) {
  const core = path.join(cloneDir, CORE_SCRIPT);
  const generatedAt = utcTimestamp();
  const baseArgs = [
    core,
    'init',
    vaultPath,
    '--generated-at',
    generatedAt,
    '--operation-id',
    OPERATION_ID
  ];

  const planOutput = await runStep('review', 'python3', baseArgs);
  const plan = parseProductJSON('review', planOutput);
  const approvalHash = plan.approved_plan_sha256;

  if (typeof approvalHash !== 'string' || !approvalHash) {
    throw CLIError.knowledgeSetupFailed('review', 'the review step did not report an approval hash');
  }

  const applyOutput = await runStep('apply', 'python3', [
    ...baseArgs,
    '--approved-plan-sha256',
    approvalHash,
    '--apply'
  ]);
  const applied = parseProductJSON('apply', applyOutput);

  return {
    approvalHash,
    changedPaths: Array.isArray(applied.changed_paths) ? applied.changed_paths : []
  };
}

/**
 * Installs the product and initializes the vault.
 *
 * @param {Object} options - Install options.
 * @param {string} options.vaultPath - Absolute vault path.
 * @param {string} options.cloneDir - Absolute clone directory path.
 * @param {Function} [options.onProgress] - Called with a message per step.
 * @returns {Promise<Object>} Result as { cloned, changedPaths }.
 */
export async function install({ vaultPath, cloneDir, onProgress = () => {} }) {
  onProgress(`Cloning claude-obsidian ${PRODUCT.version}`);
  const cloned = await ensureClone(cloneDir);

  onProgress(`Initializing vault at ${vaultPath}`);
  const { changedPaths } = await initializeVault(cloneDir, vaultPath);

  return { cloned, changedPaths };
}

/**
 * Builds the rules block the project must declare.
 *
 * The keys are a contract with the guides that read this block. Renaming one
 * silently disconnects the mechanism, so they are fixed.
 *
 * @param {Object} options - Block options.
 * @param {string} options.vaultPath - Vault path as it should be displayed.
 * @param {string} options.commandPath - Product entry point as it should be displayed.
 * @returns {string[]} Block lines.
 */
export function rulesBlock({ vaultPath, commandPath }) {
  return [
    '## Knowledge layer',
    `- consumer: ${CONSUMER_ID}`,
    `- vault: ${vaultPath}`,
    `- command: python3 ${commandPath}`
  ];
}

/**
 * Path of the product entry point relative to a clone root.
 *
 * @param {string} cloneDir - Clone directory path.
 * @returns {string} Path to the product entry point.
 */
export function corePath(cloneDir) {
  return path.join(cloneDir, CORE_SCRIPT);
}

export default {
  id: CONSUMER_ID,
  product: PRODUCT,
  resolveCloneDir,
  corePath,
  checkPlatform,
  checkPrerequisites,
  isInitialized,
  install,
  rulesBlock
};
