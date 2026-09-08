/**
 * Tests for spec delta validation.
 *
 * The rule engine is exercised directly; the command is exercised over an
 * in-memory file tree so no real path is touched.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import { validateDelta, parseSpec } from '../../src/services/delta.js';

const BASELINE = `# auth Specification

## Requirements

### Requirement: Session Expiry
The system SHALL expire an idle session after 30 minutes.

#### Scenario: Idle session expires
- **WHEN** a session has been idle for 30 minutes
- **THEN** the system rejects the next request

#### Scenario: Active session survives
- **WHEN** a session receives a request every 5 minutes
- **THEN** the system keeps the session alive
`;

const VALID_DELTA = `## ADDED Requirements
### Requirement: Device Binding
The system SHALL bind a session to the device that created it.

#### Scenario: Session replayed elsewhere
- **WHEN** a token is presented from another device
- **THEN** the system rejects the request

## MODIFIED Requirements
### Requirement: Session Expiry
The system SHALL expire an idle session after 10 minutes.

#### Scenario: Idle session expires
- **WHEN** a session has been idle for 10 minutes
- **THEN** the system rejects the next request

#### Scenario: Active session survives
- **WHEN** a session receives a request every 5 minutes
- **THEN** the system keeps the session alive
`;

/**
 * Returns the rules the violations belong to.
 */
function rules(violations) {
  return violations.map(item => item.rule);
}

describe('validateDelta', () => {
  it('accepts a delta that follows every rule', () => {
    expect(validateDelta(VALID_DELTA, BASELINE)).toEqual([]);
  });

  it('rejects a matching key that differs only in case', () => {
    const delta = VALID_DELTA.replace('### Requirement: Session Expiry', '### Requirement: session expiry');
    const violations = validateDelta(delta, BASELINE);

    expect(rules(violations)).toContain('matching-key');
    expect(violations[0].message).toMatch(/case sensitive/);
    expect(violations[0].message).toMatch(/"session expiry"/);
    expect(violations[0].message).toMatch(/"Session Expiry"/);
  });

  it('rejects a matching key that names nothing in the spec', () => {
    const delta = VALID_DELTA.replace('### Requirement: Session Expiry', '### Requirement: Token Rotation');
    const violations = validateDelta(delta, BASELINE);

    expect(rules(violations)).toContain('matching-key');
    expect(violations.find(v => v.rule === 'matching-key').message).toMatch(
      /names a requirement the spec does not have/
    );
  });

  it('rejects a scenario heading that is not four hashes deep', () => {
    const delta = VALID_DELTA.replace('#### Scenario: Session replayed elsewhere', '### Scenario: Session replayed elsewhere');
    const violations = validateDelta(delta, BASELINE);

    const found = violations.find(item => item.rule === 'scenario-depth');
    expect(found).toBeDefined();
    expect(found.message).toMatch(/uses 3 hash\(es\); a scenario heading takes exactly four/);
    expect(found.message).toContain('Session replayed elsewhere');
  });

  it('rejects a five-hash scenario heading too', () => {
    const delta = VALID_DELTA.replace('#### Scenario: Session replayed elsewhere', '##### Scenario: Session replayed elsewhere');
    expect(rules(validateDelta(delta, BASELINE))).toContain('scenario-depth');
  });

  it('rejects a requirement that states no obligation', () => {
    const delta = VALID_DELTA.replace(
      'The system SHALL bind a session to the device that created it.',
      'The system binds a session to the device that created it.'
    );
    const violations = validateDelta(delta, BASELINE);

    const found = violations.find(item => item.rule === 'normative-keyword');
    expect(found).toBeDefined();
    expect(found.message).toMatch(/must contain SHALL or MUST/);
    expect(found.message).toContain('Device Binding');
  });

  it('accepts MUST as well as SHALL', () => {
    const delta = VALID_DELTA.replace('The system SHALL bind', 'The system MUST bind');
    expect(rules(validateDelta(delta, BASELINE))).not.toContain('normative-keyword');
  });

  it('rejects a MODIFIED block that drops an existing scenario', () => {
    const delta = VALID_DELTA.replace(
      `
#### Scenario: Active session survives
- **WHEN** a session receives a request every 5 minutes
- **THEN** the system keeps the session alive
`,
      '\n'
    );
    const violations = validateDelta(delta, BASELINE);

    const found = violations.find(item => item.rule === 'modified-completeness');
    expect(found).toBeDefined();
    expect(found.message).toContain('"Active session survives"');
    expect(found.message).toMatch(/replaces the whole block/);
  });

  it('names every dropped scenario', () => {
    const delta = `## MODIFIED Requirements
### Requirement: Session Expiry
The system SHALL expire an idle session after 10 minutes.
`;
    const found = validateDelta(delta, BASELINE).find(item => item.rule === 'modified-completeness');
    expect(found.message).toContain('"Idle session expires"');
    expect(found.message).toContain('"Active session survives"');
  });

  it('does not require scenarios on a REMOVED requirement', () => {
    const delta = `## REMOVED Requirements
### Requirement: Session Expiry
**Reason**: Superseded.
**Migration**: None needed.
`;
    expect(validateDelta(delta, BASELINE)).toEqual([]);
  });

  it('rejects a requirement outside any operation group', () => {
    const delta = `### Requirement: Stray
The system SHALL do something.
`;
    expect(rules(validateDelta(delta, BASELINE))).toContain('operation-group');
  });

  it('reports several violations at once, ordered by line', () => {
    const delta = `## ADDED Requirements
### Requirement: No Obligation
The system does something.

### Scenario: Wrong depth
- **WHEN** x

## MODIFIED Requirements
### Requirement: Session Expiry
The system SHALL expire an idle session after 10 minutes.
`;
    const violations = validateDelta(delta, BASELINE);
    // matching-key cannot appear here: the name resolves, which is what lets
    // the completeness rule run at all. The two are mutually exclusive on one
    // requirement.
    expect(rules(violations).sort()).toEqual(
      ['modified-completeness', 'normative-keyword', 'scenario-depth'].sort()
    );
    expect(violations.map(item => item.line)).toEqual([...violations.map(item => item.line)].sort((a, b) => a - b));
  });

  it('does not cascade a completeness violation onto an unmatched name', () => {
    const delta = `## MODIFIED Requirements
### Requirement: session expiry
The system SHALL expire an idle session after 10 minutes.
`;
    // The name resolves to nothing, so there is no block to compare scenarios
    // against; reporting an omission as well would blame one mistake twice.
    expect(rules(validateDelta(delta, BASELINE))).toEqual(['matching-key']);
  });
});

describe('parseSpec', () => {
  it('collects scenarios under the requirement that owns them', () => {
    const parsed = parseSpec(BASELINE);
    expect(parsed.requirements).toHaveLength(1);
    expect(parsed.requirements[0].scenarios).toEqual(['Idle session expires', 'Active session survives']);
  });

  it('records the operation group a requirement belongs to', () => {
    const parsed = parseSpec(VALID_DELTA);
    expect(parsed.requirements.map(item => [item.name, item.operation])).toEqual([
      ['Device Binding', 'ADDED'],
      ['Session Expiry', 'MODIFIED']
    ]);
  });
});

describe('apm delta validate', () => {
  const WORKSPACE = '/tmp/apm-delta-workspace';
  let files;
  let deltaValidateCommand;
  let logger;

  beforeEach(async () => {
    files = new Map();
    vi.resetModules();

    const tree = {
      pathExists: async target => files.has(target) || [...files.keys()].some(key => key.startsWith(`${target}${path.sep}`)),
      stat: async target => ({ isDirectory: () => !files.has(target) }),
      readFile: async target => files.get(target),
      readdir: async (dir, options) => {
        const names = new Set();
        for (const key of files.keys()) {
          if (!key.startsWith(`${dir}${path.sep}`)) continue;
          const rest = key.slice(dir.length + 1).split(path.sep);
          names.add(JSON.stringify([rest[0], rest.length > 1]));
        }
        return [...names].map(entry => {
          const [name, isDir] = JSON.parse(entry);
          return options?.withFileTypes ? { name, isDirectory: () => isDir } : name;
        });
      }
    };

    vi.doMock('fs-extra', () => ({ ...tree, default: tree }));
    vi.doMock('../../src/ui/logger.js', () => {
      const noop = vi.fn();
      const api = {
        info: noop,
        warn: noop,
        error: noop,
        success: vi.fn(),
        debug: noop,
        dim: noop,
        blank: noop,
        line: noop,
        banner: noop,
        clearAndBanner: noop,
        progress: vi.fn(() => vi.fn())
      };
      return { ...api, default: api };
    });

    ({ deltaValidateCommand } = await import('../../src/commands/delta.js'));
    logger = (await import('../../src/ui/logger.js')).default;
    vi.spyOn(process, 'cwd').mockReturnValue(WORKSPACE);

    files.set(path.join(WORKSPACE, 'openspec/specs/auth/spec.md'), BASELINE);
    files.set(path.join(WORKSPACE, 'openspec/changes/good/specs/auth/spec.md'), VALID_DELTA);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock('fs-extra');
  });

  it('accepts a change directory whose delta follows the rules', async () => {
    await expect(deltaValidateCommand('openspec/changes/good')).resolves.toBeUndefined();
    expect(logger.success).toHaveBeenCalledWith('1 delta(s) valid.');
  });

  it('resolves the baseline spec from the delta path', async () => {
    files.set(
      path.join(WORKSPACE, 'openspec/changes/bad/specs/auth/spec.md'),
      VALID_DELTA.replace('### Requirement: Session Expiry', '### Requirement: session expiry')
    );

    await expect(deltaValidateCommand('openspec/changes/bad')).rejects.toThrow(
      /Delta validation failed with 1 violation/
    );
  });

  it('walks every delta under a directory', async () => {
    files.set(path.join(WORKSPACE, 'openspec/changes/other/specs/auth/spec.md'), VALID_DELTA);

    await deltaValidateCommand('openspec/changes');
    expect(logger.success).toHaveBeenCalledWith('2 delta(s) valid.');
  });

  it('accepts a single delta file', async () => {
    await expect(deltaValidateCommand('openspec/changes/good/specs/auth/spec.md')).resolves.toBeUndefined();
  });

  it('fails when the path does not exist', async () => {
    await expect(deltaValidateCommand('openspec/changes/missing')).rejects.toThrow(/path does not exist/);
  });

  it('fails when a directory holds no delta document', async () => {
    files.set(path.join(WORKSPACE, 'openspec/changes/empty/notes.md'), '# Notes\n');

    await expect(deltaValidateCommand('openspec/changes/empty')).rejects.toThrow(/no spec\.md found/);
  });

  it('counts violations across every delta in the tree', async () => {
    files.set(
      path.join(WORKSPACE, 'openspec/changes/one/specs/auth/spec.md'),
      VALID_DELTA.replace('### Requirement: Session Expiry', '### Requirement: session expiry')
    );
    files.set(
      path.join(WORKSPACE, 'openspec/changes/two/specs/auth/spec.md'),
      VALID_DELTA.replace('The system SHALL bind', 'The system binds')
    );

    await expect(deltaValidateCommand('openspec/changes')).rejects.toThrow(
      /Delta validation failed with 2 violation/
    );
  });

  it('validates against an empty baseline when the spec is absent', async () => {
    files.set(
      path.join(WORKSPACE, 'openspec/changes/new-capability/specs/billing/spec.md'),
      `## ADDED Requirements
### Requirement: Invoice Numbering
The system SHALL number invoices consecutively.

#### Scenario: Two invoices in a row
- **WHEN** two invoices are issued
- **THEN** their numbers differ by one
`
    );

    await expect(deltaValidateCommand('openspec/changes/new-capability')).resolves.toBeUndefined();
  });
});
