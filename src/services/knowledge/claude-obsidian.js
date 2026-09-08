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

import crypto from 'crypto';
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
 * Vault-relative paths this adapter reads and writes.
 */
const VAULT_PATHS = {
  sourceLedger: 'wiki/meta/ledgers/source-ledger.json',
  claimLedger: 'wiki/meta/ledgers/claim-ledger.json',
  index: 'wiki/index.md',
  log: 'wiki/log.md'
};

/**
 * Heading under which emitted pages are catalogued in the wiki index.
 */
const INDEX_SECTION = '## Task Logs';

/**
 * How long an ingested source stays fresh before it must be reviewed again.
 */
const REFRESH_YEARS = 1;

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
 * Hashes a UTF-8 string the way the product hashes file bytes.
 *
 * @param {string} content - Content to hash.
 * @returns {string} Lowercase SHA-256 hex digest.
 */
function sha256(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Derives the canonical source identity.
 *
 * The product rejects a source whose key is not exactly this value, so it is
 * computed rather than chosen.
 *
 * @param {string} kind - Origin kind.
 * @param {string} locator - Canonical locator.
 * @param {string} contentHash - Source content SHA-256.
 * @returns {string} Source identifier.
 */
function sourceId(kind, locator, contentHash) {
  const digest = crypto
    .createHash('sha256')
    .update(`${kind.toLowerCase()}\0${locator}\0${contentHash.toLowerCase()}`, 'utf8')
    .digest('hex');
  return `src-${digest.slice(0, 20)}`;
}

/**
 * Returns the current UTC calendar date.
 *
 * @returns {string} Date as YYYY-MM-DD.
 */
function utcDate() {
  return utcTimestamp().slice(0, 10);
}

/**
 * Shifts an ISO date by a number of years.
 *
 * @param {string} isoDate - Date as YYYY-MM-DD.
 * @param {number} years - Years to add.
 * @returns {string} Shifted date as YYYY-MM-DD.
 */
function addYears(isoDate, years) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return date.toISOString().slice(0, 10);
}

/**
 * Reduces a value to the character set ledger identifiers allow.
 *
 * @param {string|number} value - Value to reduce.
 * @returns {string} Identifier-safe fragment.
 */
function idFragment(value) {
  return String(value).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Orders object keys at every depth.
 *
 * The product writes its ledgers with sorted keys. Matching that keeps the
 * diff between two ingests limited to what actually changed.
 *
 * @param {*} value - Value to order.
 * @returns {*} Value with ordered keys.
 */
function withSortedKeys(value) {
  if (Array.isArray(value)) return value.map(withSortedKeys);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map(key => [key, withSortedKeys(value[key])])
  );
}

/**
 * Serializes a ledger the way the product writes them.
 *
 * @param {Object} ledger - Ledger document.
 * @returns {string} Canonical JSON text.
 */
function serializeLedger(ledger) {
  return `${JSON.stringify(withSortedKeys(ledger), null, 2)}\n`;
}

/**
 * Reads a vault file, returning null when it does not exist.
 *
 * @param {string} vaultPath - Absolute vault path.
 * @param {string} relative - Vault-relative path.
 * @returns {Promise<string|null>} File contents or null.
 */
async function readVaultFile(vaultPath, relative) {
  const target = path.join(vaultPath, relative);
  if (!(await fs.pathExists(target))) return null;
  return fs.readFile(target, 'utf8');
}

/**
 * Reads a ledger, falling back to an empty document.
 *
 * @param {string} vaultPath - Absolute vault path.
 * @param {string} relative - Vault-relative ledger path.
 * @param {string} collection - Collection key inside the ledger.
 * @returns {Promise<Object>} Result as { document, content }.
 * @throws {CLIError} When the ledger is present but unreadable.
 */
async function readLedger(vaultPath, relative, collection) {
  const content = await readVaultFile(vaultPath, relative);
  if (content === null) {
    throw CLIError.knowledgeSetupFailed('read', `${relative} is missing; run "apm knowledge init" first`);
  }
  try {
    const document = JSON.parse(content);
    if (!document || typeof document[collection] !== 'object') {
      throw new Error(`missing ${collection}`);
    }
    return { document, content };
  } catch (err) {
    throw CLIError.knowledgeSetupFailed('read', `${relative} is not a readable ledger: ${err.message}`);
  }
}

/**
 * Renders the emitted page, frontmatter included.
 *
 * The page is assembled from the task log, never authored: it carries the
 * claims, their evidence and the link back to the source, and nothing else.
 *
 * @param {Object} options - Page options.
 * @param {string} options.title - Page title.
 * @param {string} options.sourceLocator - Vault-relative path of the source.
 * @param {Object[]} options.claims - Claims with their identifiers.
 * @param {string} options.today - Current UTC date.
 * @param {string[]} options.tags - Frontmatter tags.
 * @returns {string} Page content.
 */
function renderPage({ title, sourceLocator, claims, today, tags }) {
  const lines = [
    '---',
    `title: ${title}`,
    'type: task-log',
    'status: provisional',
    `created: ${today}`,
    `updated: ${today}`,
    'tags:',
    ...tags.map(tag => `  - ${tag}`),
    '---',
    '',
    `# ${title}`,
    '',
    `Source: [[${sourceLocator}]]`,
    '',
    '## Claims',
    ''
  ];

  for (const claim of claims) {
    lines.push(`### ${claim.id}`);
    lines.push('');
    lines.push(claim.claim);
    lines.push('');
    lines.push(`- evidence: ${claim.evidence}`);
    if (claim.supersedes) {
      lines.push(`- supersedes: ${claim.supersedes}`);
    }
    lines.push('');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

/**
 * Adds a catalogue entry for the page, keeping the index idempotent.
 *
 * @param {string} content - Current index content.
 * @param {string} target - Wikilink target for the page.
 * @param {string} title - Entry label.
 * @returns {string} Updated index content.
 */
function withIndexEntry(content, target, title) {
  const entry = `- [[${target}|${title}]]`;
  if (content.includes(entry)) return content;

  const lines = content.split('\n');
  const heading = lines.findIndex(line => line.trim() === INDEX_SECTION);

  if (heading === -1) {
    return `${content.trimEnd()}\n\n${INDEX_SECTION}\n\n${entry}\n`;
  }

  let insert = heading + 1;
  while (insert < lines.length && !lines[insert].startsWith('## ')) insert += 1;
  while (insert > heading + 1 && !lines[insert - 1].trim()) insert -= 1;

  lines.splice(insert, 0, entry);
  return lines.join('\n');
}

/**
 * Appends an operation line to the wiki log, newest first.
 *
 * @param {string} content - Current log content.
 * @param {string} line - Line to record.
 * @returns {string} Updated log content.
 */
function withLogEntry(content, line) {
  const lines = content.split('\n');
  const heading = lines.findIndex(entry => entry.startsWith('# '));
  if (heading === -1) {
    return `${content.trimEnd()}\n${line}\n`;
  }

  let insert = heading + 1;
  while (insert < lines.length && !lines[insert].trim()) insert += 1;
  while (insert < lines.length && lines[insert].trim() && !lines[insert].startsWith('- ')) insert += 1;

  lines.splice(insert, 0, '', line);
  return lines.join('\n');
}

/**
 * Builds one write entry for a transaction bundle.
 *
 * @param {string} relative - Vault-relative path.
 * @param {string} content - File content.
 * @param {string|null} existing - Current content, or null when absent.
 * @returns {Object} Write entry.
 */
function writeEntry(relative, content, existing) {
  return {
    path: relative,
    mode: existing === null ? 'create' : 'replace',
    content,
    sha256: sha256(content)
  };
}

/**
 * Ingests a task log into the vault.
 *
 * The source file is copied into the inbox before the transaction, because an
 * ingest operation may write only under wiki/ and .raw/.
 *
 * @param {Object} options - Emit options.
 * @param {string} options.vaultPath - Absolute vault path.
 * @param {string} options.cloneDir - Absolute clone directory path.
 * @param {string} options.taskLogPath - Absolute path of the task log.
 * @param {Object} options.reference - Reference as { project, stage, task }.
 * @param {Object[]} options.claims - Parsed claims.
 * @param {Function} [options.onProgress] - Called with a message per step.
 * @returns {Promise<Object>} Result as { pagePath, sourceId, claimIds, changedPaths }.
 */
export async function emit({ vaultPath, cloneDir, taskLogPath, reference, claims, onProgress = () => {} }) {
  const { project, stage, task } = reference;
  const slug = `${idFragment(stage)}-${idFragment(task)}`;
  const projectSlug = idFragment(project);
  const pageRelative = `wiki/apm/${projectSlug}/${slug}.md`;
  const sourceRelative = `inbox/apm/${projectSlug}/${slug}.md`;
  const title = `${project} ${stage}.${task}`;
  const today = utcDate();

  onProgress(`Capturing ${path.basename(taskLogPath)}`);
  const taskLogContent = await fs.readFile(taskLogPath, 'utf8');
  await fs.ensureDir(path.dirname(path.join(vaultPath, sourceRelative)));
  await fs.writeFile(path.join(vaultPath, sourceRelative), taskLogContent, 'utf8');

  const contentHash = sha256(taskLogContent);
  const id = sourceId('file', sourceRelative, contentHash);

  const identified = claims.map((claim, position) => ({
    ...claim,
    id: `clm-${projectSlug}-${slug}-${position + 1}`
  }));

  const sources = await readLedger(vaultPath, VAULT_PATHS.sourceLedger, 'sources');
  const claimLedger = await readLedger(vaultPath, VAULT_PATHS.claimLedger, 'claims');
  const indexContent = await readVaultFile(vaultPath, VAULT_PATHS.index);
  const logContent = await readVaultFile(vaultPath, VAULT_PATHS.log);

  if (indexContent === null || logContent === null) {
    throw CLIError.knowledgeSetupFailed('read', 'the vault is missing wiki/index.md or wiki/log.md');
  }

  const generatedAt = utcTimestamp();
  const existingPage = await readVaultFile(vaultPath, pageRelative);

  sources.document.generated_at = generatedAt;
  sources.document.sources[id] = {
    origin: { kind: 'file', locator: sourceRelative },
    title,
    content_kind: 'document',
    authority: 'primary',
    review_status: 'active',
    content_sha256: contentHash,
    ingested_at: today,
    refresh_due: addYears(today, REFRESH_YEARS),
    pages: [pageRelative]
  };

  claimLedger.document.generated_at = generatedAt;
  for (const claim of identified) {
    claimLedger.document.claims[claim.id] = {
      text: claim.claim,
      risk: 'normal',
      assessment: 'provisional',
      confidence: 'medium',
      location: { path: pageRelative },
      evidence: [{ source_id: id, relation: 'supports', locator: claim.evidence }],
      ...(claim.supersedes ? { supersedes: claim.supersedes } : {})
    };
  }

  const pageContent = renderPage({
    title,
    sourceLocator: sourceRelative,
    claims: identified,
    today,
    tags: ['apm', projectSlug]
  });
  const nextIndex = withIndexEntry(indexContent, pageRelative.replace(/\.md$/, ''), title);
  const nextLog = withLogEntry(logContent, `- ${generatedAt} ingest ${title} (${identified.length} claim(s))`);

  const writes = [
    writeEntry(pageRelative, pageContent, existingPage),
    writeEntry(VAULT_PATHS.index, nextIndex, indexContent),
    writeEntry(VAULT_PATHS.log, nextLog, logContent),
    writeEntry(VAULT_PATHS.sourceLedger, serializeLedger(sources.document), sources.content),
    writeEntry(VAULT_PATHS.claimLedger, serializeLedger(claimLedger.document), claimLedger.content)
  ];

  const bundle = {
    schema: 'claude-obsidian.transaction.v1',
    operation_id: `apm-emit-${projectSlug}-${slug}-${generatedAt.replace(/[:-]/g, '').replace('Z', '')}`,
    operation_type: 'ingest',
    expected_hashes: {
      [pageRelative]: existingPage === null ? null : sha256(existingPage),
      [VAULT_PATHS.index]: sha256(indexContent),
      [VAULT_PATHS.log]: sha256(logContent),
      [VAULT_PATHS.sourceLedger]: sha256(sources.content),
      [VAULT_PATHS.claimLedger]: sha256(claimLedger.content)
    },
    writes
  };

  onProgress(`Ingesting ${identified.length} claim(s)`);
  const changedPaths = await applyBundle(cloneDir, vaultPath, bundle);

  return { pagePath: pageRelative, sourceId: id, claimIds: identified.map(claim => claim.id), changedPaths };
}

/**
 * Writes a bundle to a temporary file and runs the reviewed apply.
 *
 * The approval hash is bound to the resolved vault, so it is read from the
 * inspection rather than precomputed. The inspection reports it as
 * `approval_sha256`, while init reports the same value as
 * `approved_plan_sha256`; both are consumed by --approved-plan-sha256.
 *
 * @param {string} cloneDir - Absolute clone directory path.
 * @param {string} vaultPath - Absolute vault path.
 * @param {Object} bundle - Transaction bundle.
 * @returns {Promise<string[]>} Paths the operation changed.
 * @throws {CLIError} When inspection or application fails.
 */
async function applyBundle(cloneDir, vaultPath, bundle) {
  const core = corePath(cloneDir);
  const bundlePath = path.join(vaultPath, '.vault-meta', `apm-${bundle.operation_id}.json`);

  await fs.ensureDir(path.dirname(bundlePath));
  await fs.writeFile(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`, 'utf8');

  try {
    const plan = parseProductJSON(
      'inspect',
      await runStep('inspect', 'python3', [core, 'transaction', 'inspect', bundlePath, '--vault', vaultPath])
    );
    const approvalHash = plan.approval_sha256;
    if (typeof approvalHash !== 'string' || !approvalHash) {
      throw CLIError.knowledgeSetupFailed('inspect', 'the inspection did not report an approval hash');
    }

    const applied = parseProductJSON(
      'apply',
      await runStep('apply', 'python3', [
        core,
        'transaction',
        'apply',
        bundlePath,
        '--vault',
        vaultPath,
        '--approved-plan-sha256',
        approvalHash
      ])
    );
    return Array.isArray(applied.changed_paths) ? applied.changed_paths : [];
  } finally {
    await fs.remove(bundlePath);
  }
}

/**
 * Reports whether a source is still fresh at a given date.
 *
 * @param {Object} source - Source record.
 * @param {string} asOf - Audit date as YYYY-MM-DD.
 * @returns {boolean} True when the source is active and not stale.
 */
function sourceIsFresh(source, asOf) {
  if (!source || source.review_status !== 'active') return false;
  if (source.authority === 'synthetic' || source.content_kind === 'synthetic') return false;

  const observed = source.retrieved_at || source.ingested_at;
  const due = source.refresh_due;
  if (!observed || !due) return false;
  return observed <= asOf && due >= asOf;
}

/**
 * Audits the knowledge substrate.
 *
 * @param {Object} options - Audit options.
 * @param {string} options.vaultPath - Absolute vault path.
 * @param {string} options.cloneDir - Absolute clone directory path.
 * @param {string} [options.asOf] - Audit date as YYYY-MM-DD.
 * @param {Function} [options.onProgress] - Called with a message per step.
 * @returns {Promise<Object>} Result as { asOf, lint, disputed }.
 */
export async function audit({ vaultPath, cloneDir, asOf, onProgress = () => {} }) {
  const auditDate = asOf || utcDate();

  onProgress('Linting the vault');
  const lint = await runStep('lint', 'python3', [
    corePath(cloneDir),
    'lint',
    '--vault',
    vaultPath,
    '--as-of',
    auditDate,
    '--format',
    'markdown'
  ]);

  onProgress('Collecting disputed claims');
  const sources = await readLedger(vaultPath, VAULT_PATHS.sourceLedger, 'sources');
  const claimLedger = await readLedger(vaultPath, VAULT_PATHS.claimLedger, 'claims');

  const disputed = [];
  for (const [id, claim] of Object.entries(claimLedger.document.claims).sort()) {
    const evidence = Array.isArray(claim.evidence) ? claim.evidence : [];
    const contradictions = evidence.filter(
      item => item.relation === 'contradicts' && sourceIsFresh(sources.document.sources[item.source_id], auditDate)
    );
    const contested = claim.assessment === 'contested';

    if (!contested && !contradictions.length) continue;

    disputed.push({
      id,
      text: claim.text,
      assessment: claim.assessment,
      page: claim.location?.path ?? null,
      reasons: [
        ...(contested ? ['assessment is contested'] : []),
        ...contradictions.map(item => `fresh contradicting source ${item.source_id}`)
      ]
    });
  }

  return { asOf: auditDate, lint, disputed };
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
  rulesBlock,
  emit,
  audit
};
