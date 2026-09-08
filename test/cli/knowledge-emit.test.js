/**
 * Tests for `apm knowledge emit` and `apm knowledge audit`.
 *
 * The product is never executed and no real file is touched: the process
 * runner answers a scripted command table and fs-extra is backed by an
 * in-memory tree seeded with an initialized vault.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import crypto from 'crypto';

const run = vi.fn();

vi.mock('../../src/services/knowledge/exec.js', () => ({
  run,
  default: { run }
}));

/**
 * In-memory file tree, keyed by absolute path.
 */
let files = new Map();

const fsDouble = {
  pathExists: vi.fn(async target => files.has(target)),
  readFile: vi.fn(async target => {
    if (!files.has(target)) throw new Error(`ENOENT: ${target}`);
    return files.get(target);
  }),
  writeFile: vi.fn(async (target, content) => {
    files.set(target, content);
  }),
  ensureDir: vi.fn(async () => {}),
  remove: vi.fn(async target => {
    files.delete(target);
  })
};

vi.mock('fs-extra', () => ({ ...fsDouble, default: fsDouble }));

vi.mock('../../src/ui/logger.js', () => {
  const noop = vi.fn();
  const logger = {
    info: noop,
    warn: noop,
    error: noop,
    success: noop,
    debug: noop,
    dim: noop,
    blank: noop,
    line: noop,
    banner: noop,
    clearAndBanner: noop,
    progress: vi.fn(() => vi.fn())
  };
  return { ...logger, default: logger };
});

const { knowledgeEmitCommand, knowledgeAuditCommand } = await import('../../src/commands/knowledge.js');
const { CLIError } = await import('../../src/core/errors.js');

const WORKSPACE = '/tmp/apm-emit-workspace';
const VAULT = path.join(WORKSPACE, 'wiki');
const TASK_LOG = path.join(WORKSPACE, 'task.log.md');
const APPROVAL_HASH = 'c'.repeat(64);

const SOURCE_LEDGER = path.join(VAULT, 'wiki/meta/ledgers/source-ledger.json');
const CLAIM_LEDGER = path.join(VAULT, 'wiki/meta/ledgers/claim-ledger.json');

/**
 * Seeds an initialized vault plus a task log carrying two claims.
 */
function seedVault({ taskLog } = {}) {
  files = new Map();
  files.set(path.join(VAULT, '.claude-obsidian.json'), '{}\n');
  files.set(
    SOURCE_LEDGER,
    JSON.stringify({ schema: 'claude-obsidian.source-ledger.v1', generated_at: '2026-01-01T00:00:00Z', sources: {} }, null, 2)
  );
  files.set(
    CLAIM_LEDGER,
    JSON.stringify({ schema: 'claude-obsidian.claim-ledger.v1', generated_at: '2026-01-01T00:00:00Z', claims: {} }, null, 2)
  );
  files.set(path.join(VAULT, 'wiki/index.md'), '# Wiki Index\n\n## Sources\n\n- No sources indexed yet.\n');
  files.set(path.join(VAULT, 'wiki/log.md'), '# Wiki Log\n\nNewest completed operations appear first.\n');
  files.set(
    TASK_LOG,
    taskLog ??
      '# Task\n\n## Claims\n' +
        '- claim: The first thing holds.\n  evidence: src/a.js:10\n  supersedes: none\n' +
        '- claim: The second thing holds.\n  evidence: test suite\n  supersedes: clm-old-9\n'
  );
}

/**
 * Scripts inspect, apply and lint.
 */
function scriptRunner({ lint = '# Wiki Lint Report\n\n- Issues found: 0\n' } = {}) {
  run.mockImplementation(async (command, args) => {
    if (args.includes('inspect')) {
      return { stdout: JSON.stringify({ approval_sha256: APPROVAL_HASH, valid: true }), stderr: '' };
    }
    if (args.includes('apply')) {
      return { stdout: JSON.stringify({ status: 'complete', changed_paths: ['wiki/index.md'] }), stderr: '' };
    }
    if (args.includes('lint')) {
      return { stdout: lint, stderr: '' };
    }
    throw new Error(`unexpected command: ${command} ${args.join(' ')}`);
  });
}

/**
 * Returns the bundle handed to the inspect step.
 */
function inspectedBundle() {
  const call = run.mock.calls.find(([, args]) => args.includes('inspect'));
  const bundlePath = call[1][call[1].indexOf('inspect') + 1];
  return JSON.parse(bundleWrites.get(bundlePath));
}

/**
 * Bundle contents captured before the adapter deletes them.
 */
let bundleWrites = new Map();

const REFERENCE = { project: 'demo', stage: 2, task: 7 };

describe('apm knowledge emit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'cwd').mockReturnValue(WORKSPACE);
    seedVault();
    scriptRunner();
    bundleWrites = new Map();
    fsDouble.writeFile.mockImplementation(async (target, content) => {
      if (target.endsWith('.json') && target.includes('.vault-meta')) {
        bundleWrites.set(target, content);
      }
      files.set(target, content);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits five writes: page, index, log and both ledgers', async () => {
    await knowledgeEmitCommand({ taskLog: TASK_LOG, ...REFERENCE });

    const bundle = inspectedBundle();
    expect(bundle.operation_type).toBe('ingest');
    expect(bundle.writes.map(write => write.path)).toEqual([
      'wiki/apm/demo/2-7.md',
      'wiki/index.md',
      'wiki/log.md',
      'wiki/meta/ledgers/source-ledger.json',
      'wiki/meta/ledgers/claim-ledger.json'
    ]);
  });

  it('copies the task log into the inbox outside the transaction', async () => {
    await knowledgeEmitCommand({ taskLog: TASK_LOG, ...REFERENCE });

    const inboxPath = path.join(VAULT, 'inbox/apm/demo/2-7.md');
    expect(files.has(inboxPath)).toBe(true);

    const bundle = inspectedBundle();
    expect(bundle.writes.some(write => write.path.startsWith('inbox/'))).toBe(false);
  });

  it('derives the source identity from kind, locator and content hash', async () => {
    await knowledgeEmitCommand({ taskLog: TASK_LOG, ...REFERENCE });

    const bundle = inspectedBundle();
    const ledger = JSON.parse(bundle.writes.find(write => write.path.endsWith('source-ledger.json')).content);
    const [id, record] = Object.entries(ledger.sources)[0];

    const digest = crypto
      .createHash('sha256')
      .update(`file\0${record.origin.locator}\0${record.content_sha256}`, 'utf8')
      .digest('hex');
    expect(id).toBe(`src-${digest.slice(0, 20)}`);
  });

  it('registers the source as an active primary document', async () => {
    await knowledgeEmitCommand({ taskLog: TASK_LOG, ...REFERENCE });

    const bundle = inspectedBundle();
    const ledger = JSON.parse(bundle.writes.find(write => write.path.endsWith('source-ledger.json')).content);
    const record = Object.values(ledger.sources)[0];

    expect(record).toMatchObject({
      origin: { kind: 'file' },
      authority: 'primary',
      review_status: 'active',
      content_kind: 'document',
      pages: ['wiki/apm/demo/2-7.md']
    });
    expect(record.refresh_due > record.ingested_at).toBe(true);
  });

  it('records each claim as provisional with supporting evidence', async () => {
    await knowledgeEmitCommand({ taskLog: TASK_LOG, ...REFERENCE });

    const bundle = inspectedBundle();
    const sourceLedger = JSON.parse(bundle.writes.find(w => w.path.endsWith('source-ledger.json')).content);
    const claimLedger = JSON.parse(bundle.writes.find(w => w.path.endsWith('claim-ledger.json')).content);
    const sourceId = Object.keys(sourceLedger.sources)[0];
    const claims = Object.values(claimLedger.claims);

    expect(claims).toHaveLength(2);
    for (const claim of claims) {
      expect(claim.assessment).toBe('provisional');
      expect(claim.evidence[0]).toMatchObject({ source_id: sourceId, relation: 'supports' });
      expect(claim.location.path).toBe('wiki/apm/demo/2-7.md');
    }
    expect(claims[1].supersedes).toBe('clm-old-9');
    expect(claims[0].supersedes).toBeUndefined();
  });

  it('gives the page the frontmatter fields the linter requires', async () => {
    await knowledgeEmitCommand({ taskLog: TASK_LOG, ...REFERENCE });

    const page = inspectedBundle().writes[0].content;
    for (const field of ['title', 'type', 'status', 'created', 'updated', 'tags']) {
      expect(page).toMatch(new RegExp(`^${field}:`, 'm'));
    }
  });

  it('links the page from the index so it is not orphaned', async () => {
    await knowledgeEmitCommand({ taskLog: TASK_LOG, ...REFERENCE });

    const index = inspectedBundle().writes.find(write => write.path === 'wiki/index.md').content;
    expect(index).toContain('[[wiki/apm/demo/2-7|demo 2.7]]');
  });

  it('reads the approval hash from approval_sha256, not approved_plan_sha256', async () => {
    run.mockImplementation(async (command, args) => {
      if (args.includes('inspect')) {
        return {
          stdout: JSON.stringify({ approved_plan_sha256: 'wrong', approval_sha256: APPROVAL_HASH }),
          stderr: ''
        };
      }
      return { stdout: JSON.stringify({ changed_paths: [] }), stderr: '' };
    });

    await knowledgeEmitCommand({ taskLog: TASK_LOG, ...REFERENCE });

    const apply = run.mock.calls.find(([, args]) => args.includes('apply'));
    expect(apply[1]).toContain(APPROVAL_HASH);
    expect(apply[1]).not.toContain('wrong');
  });

  it('writes nothing when the task log declares no claims', async () => {
    seedVault({ taskLog: '# Task\n\n## Claims\nnone\n' });

    await knowledgeEmitCommand({ taskLog: TASK_LOG, ...REFERENCE });

    expect(run).not.toHaveBeenCalled();
  });

  it('refuses to emit into a vault that does not exist', async () => {
    files.delete(path.join(VAULT, '.claude-obsidian.json'));

    await expect(knowledgeEmitCommand({ taskLog: TASK_LOG, ...REFERENCE })).rejects.toThrow(CLIError);
    await expect(knowledgeEmitCommand({ taskLog: TASK_LOG, ...REFERENCE })).rejects.toThrow(
      /Run "apm knowledge init" first/
    );
  });

  it('refuses a task log that is not there', async () => {
    await expect(
      knowledgeEmitCommand({ taskLog: path.join(WORKSPACE, 'missing.md'), ...REFERENCE })
    ).rejects.toThrow(/file not found/);
  });
});

describe('apm knowledge audit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'cwd').mockReturnValue(WORKSPACE);
    seedVault();
    scriptRunner();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Adds a source and a claim to the seeded ledgers.
   */
  function seedClaim(id, claim, { fresh = true } = {}) {
    const sources = JSON.parse(files.get(SOURCE_LEDGER));
    sources.sources['src-fixture'] = {
      origin: { kind: 'file', locator: 'inbox/x.md' },
      review_status: 'active',
      authority: 'primary',
      content_kind: 'document',
      ingested_at: '2026-01-01',
      refresh_due: fresh ? '2099-01-01' : '2026-01-02'
    };
    files.set(SOURCE_LEDGER, JSON.stringify(sources, null, 2));

    const claims = JSON.parse(files.get(CLAIM_LEDGER));
    claims.claims[id] = claim;
    files.set(CLAIM_LEDGER, JSON.stringify(claims, null, 2));
  }

  it('writes the lint report to the requested path', async () => {
    await knowledgeAuditCommand({ out: 'reports/audit.md' });

    const report = files.get(path.join(WORKSPACE, 'reports/audit.md'));
    expect(report).toContain('# Wiki Lint Report');
    expect(report).toContain('## Disputed Claims');
    expect(report).toContain('None.');
  });

  it('passes the audit date through to the linter', async () => {
    await knowledgeAuditCommand({ out: 'audit.md', asOf: '2027-03-04' });

    const lint = run.mock.calls.find(([, args]) => args.includes('lint'));
    expect(lint[1]).toContain('--as-of');
    expect(lint[1][lint[1].indexOf('--as-of') + 1]).toBe('2027-03-04');
  });

  it('lists contested claims', async () => {
    seedClaim('clm-contested', {
      text: 'Disputed statement.',
      assessment: 'contested',
      location: { path: 'wiki/a.md' },
      evidence: []
    });

    await knowledgeAuditCommand({ out: 'audit.md' });

    const report = files.get(path.join(WORKSPACE, 'audit.md'));
    expect(report).toContain('`clm-contested`: Disputed statement.');
    expect(report).toContain('assessment is contested');
  });

  it('lists claims contradicted by a fresh source', async () => {
    seedClaim('clm-contradicted', {
      text: 'Contradicted statement.',
      assessment: 'provisional',
      location: { path: 'wiki/a.md' },
      evidence: [{ source_id: 'src-fixture', relation: 'contradicts' }]
    });

    await knowledgeAuditCommand({ out: 'audit.md' });

    expect(files.get(path.join(WORKSPACE, 'audit.md'))).toContain('fresh contradicting source src-fixture');
  });

  it('ignores a contradiction whose source has gone stale', async () => {
    seedClaim(
      'clm-contradicted',
      {
        text: 'Contradicted statement.',
        assessment: 'provisional',
        location: { path: 'wiki/a.md' },
        evidence: [{ source_id: 'src-fixture', relation: 'contradicts' }]
      },
      { fresh: false }
    );

    await knowledgeAuditCommand({ out: 'audit.md', asOf: '2028-01-01' });

    const report = files.get(path.join(WORKSPACE, 'audit.md'));
    expect(report).toContain('## Disputed Claims\n\nNone.');
  });

  it('rejects an --as-of value that is not an ISO date', async () => {
    await expect(knowledgeAuditCommand({ out: 'audit.md', asOf: 'yesterday' })).rejects.toThrow(
      /--as-of must be an ISO date/
    );
  });
});
