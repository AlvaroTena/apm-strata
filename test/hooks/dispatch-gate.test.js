/**
 * Tests for the dispatch gate hook.
 *
 * The script is executed as the platform executes it: the PreToolUse payload
 * arrives on stdin and the verdict is the exit status, with the reason on
 * stderr. Each case builds its own project tree in a temporary directory, so
 * no repository path is read or written.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..', '..');
const gate = path.join(repoRoot, 'templates', 'hooks', 'apm-dispatch-gate.sh');

const TASK_PROMPT = `---
stage: 2
task: 9
agent: review-agent
log_path: ".apm/memory/stage-02/task-02-09.log.md"
has_dependencies: true
---

# Task 2.9: Coordinator skill hooks

Implement the hook scripts and the frontmatter fragment that declares them.
`;

const TRACKER = `# Project Tracker

## Deferred

| Item | Origin task | Blocked tasks | Status |
| ---- | ----------- | ------------- | ------ |
| Retire the legacy parcel router | 1.4 | 2.9, 3.1 | open |
| Split the courier settings file | 1.7 | 4.2 | open |
| Rename the dispatch metrics table | 2.1 | 2.9 | done |
`;

let project;

/**
 * Runs the gate against a payload and returns its verdict.
 *
 * @param {Object} toolInput - The tool_input object the payload carries.
 * @param {string} toolName - The tool being gated.
 * @returns {{status: number, stderr: string}} Exit status and reason.
 */
function runGate(toolInput, toolName = 'Write') {
  const payload = JSON.stringify({
    session_id: 'test-session',
    cwd: project,
    hook_event_name: 'PreToolUse',
    tool_name: toolName,
    tool_input: toolInput
  });

  try {
    execFileSync('sh', [gate], { input: payload, encoding: 'utf8', stdio: 'pipe' });
    return { status: 0, stderr: '' };
  } catch (error) {
    return { status: error.status, stderr: error.stderr ?? '' };
  }
}

/** Writes a checklist whose single box is unchecked or checked. */
async function writeChecklist(checked) {
  const box = checked ? 'x' : ' ';
  await fs.outputFile(
    path.join(project, '.apm', 'checklists', 'stage-02.md'),
    [
      '# Stage 2 checklist',
      '',
      '- [x] Lens agents reviewed',
      `- [${box}] Bundle snapshot refreshed`,
      ''
    ].join('\n')
  );
}

beforeEach(async () => {
  project = await fs.mkdtemp(path.join(os.tmpdir(), 'apm-gate-test-'));
  await fs.outputFile(path.join(project, '.apm', 'bus', 'review-agent', 'task.md'), '');
});

afterEach(async () => {
  await fs.remove(project);
});

describe('dispatch gate: checklist condition', () => {
  it('blocks a dispatch and names the unchecked item', async () => {
    await writeChecklist(false);

    const { status, stderr } = runGate({
      file_path: path.join(project, '.apm', 'bus', 'review-agent', 'task.md'),
      content: TASK_PROMPT
    });

    expect(status).toBe(2);
    expect(stderr).toContain('Bundle snapshot refreshed');
    expect(stderr).toContain('stage-02.md');
  });

  it('allows a dispatch once every box is checked', async () => {
    await writeChecklist(true);

    const { status } = runGate({
      file_path: path.join(project, '.apm', 'bus', 'review-agent', 'task.md'),
      content: TASK_PROMPT
    });

    expect(status).toBe(0);
  });
});

describe('dispatch gate: deferred condition', () => {
  beforeEach(async () => {
    await writeChecklist(true);
    await fs.outputFile(path.join(project, '.apm', 'tracker.md'), TRACKER);
  });

  it('blocks and names the open item that blocks this task', () => {
    const { status, stderr } = runGate({
      file_path: path.join(project, '.apm', 'bus', 'review-agent', 'task.md'),
      content: TASK_PROMPT
    });

    expect(status).toBe(2);
    expect(stderr).toContain('Retire the legacy parcel router');
    expect(stderr).toContain('Task 2.9');
  });

  it('allows a dispatch when the open item blocks a different task', () => {
    const { status } = runGate({
      file_path: path.join(project, '.apm', 'bus', 'review-agent', 'task.md'),
      content: TASK_PROMPT.replace('task: 9', 'task: 6')
    });

    expect(status).toBe(0);
  });

  it('ignores a closed item that names this task', () => {
    const trackerWithOnlyClosed = TRACKER.replace('| 2.9, 3.1 | open |', '| 2.9, 3.1 | done |');
    return fs
      .outputFile(path.join(project, '.apm', 'tracker.md'), trackerWithOnlyClosed)
      .then(() => {
        const { status } = runGate({
          file_path: path.join(project, '.apm', 'bus', 'review-agent', 'task.md'),
          content: TASK_PROMPT
        });

        expect(status).toBe(0);
      });
  });
});

describe('dispatch gate: scope', () => {
  it('never blocks a file that is not a Task Bus message', async () => {
    await writeChecklist(false);

    for (const filePath of [
      path.join(project, '.apm', 'bus', 'review-agent', 'report.md'),
      path.join(project, '.apm', 'tracker.md'),
      path.join(project, 'src', 'index.js'),
      path.join(project, '.apm', 'bus', 'review-agent', 'nested', 'task.md')
    ]) {
      const { status } = runGate({ file_path: filePath, content: TASK_PROMPT });
      expect(status, `${filePath} must not be gated`).toBe(0);
    }
  });
});

describe('dispatch gate: task identity', () => {
  beforeEach(async () => {
    await writeChecklist(true);
    await fs.outputFile(path.join(project, '.apm', 'tracker.md'), TRACKER);
  });

  it('reads the task from the content being written, not from disk', async () => {
    const busFile = path.join(project, '.apm', 'bus', 'review-agent', 'task.md');

    // Disk holds an unblocked Task; the write carries a blocked one. Reading
    // disk would pass the dispatch through.
    await fs.outputFile(busFile, TASK_PROMPT.replace('task: 9', 'task: 6'));

    const { status, stderr } = runGate({ file_path: busFile, content: TASK_PROMPT });

    expect(status).toBe(2);
    expect(stderr).toContain('Retire the legacy parcel router');
  });

  it('reads the task from an Edit replacement string', async () => {
    const { status, stderr } = runGate(
      {
        file_path: path.join(project, '.apm', 'bus', 'review-agent', 'task.md'),
        old_string: '',
        new_string: TASK_PROMPT
      },
      'Edit'
    );

    expect(status).toBe(2);
    expect(stderr).toContain('Retire the legacy parcel router');
  });
});

describe('dispatch gate: quiet paths', () => {
  it('allows a dispatch when neither condition is configured', () => {
    const { status } = runGate({
      file_path: path.join(project, '.apm', 'bus', 'review-agent', 'task.md'),
      content: TASK_PROMPT
    });

    expect(status).toBe(0);
  });

  it('allows a dispatch when the payload carries no file path', () => {
    const { status } = runGate({ content: TASK_PROMPT });

    expect(status).toBe(0);
  });
});

describe('dispatch gate: checklist contract', () => {
  const SPEC_CHECKLIST = [
    '# Spec Quality Checklist',
    '',
    '**Reviewed document:** `.apm/spec.md`',
    '**Marker semantics:** `[x]` means the reviewer confirms this requirement quality criterion is satisfied.',
    '',
    '- [x] Does every requirement state a measurable outcome? [Measurability, Requirements]',
    '- [ ] Is the retention window stated as a single value? [Clarity, Constraints]',
    ''
  ].join('\n');

  /** Writes a checklist at the contract's own location. */
  function writeSpecChecklist(body) {
    return fs.outputFile(path.join(project, '.apm', 'checklists', 'spec.md'), body);
  }

  /** Dispatches against the bus file and returns the verdict. */
  function dispatch() {
    return runGate({
      file_path: path.join(project, '.apm', 'bus', 'review-agent', 'task.md'),
      content: TASK_PROMPT
    });
  }

  it('names the question and its dimension and section', async () => {
    await writeSpecChecklist(SPEC_CHECKLIST);

    const { status, stderr } = dispatch();

    expect(status).toBe(2);
    expect(stderr).toContain('Is the retention window stated as a single value?');
    expect(stderr).toContain('[Clarity, Constraints]');
    expect(stderr).toContain('spec.md');
  });

  it('treats an uppercase marker as marked', async () => {
    await writeSpecChecklist(SPEC_CHECKLIST.replace('- [ ] Is the retention', '- [X] Is the retention'));

    expect(dispatch().status).toBe(0);
  });

  it('treats a lowercase marker as marked', async () => {
    await writeSpecChecklist(SPEC_CHECKLIST.replace('- [ ] Is the retention', '- [x] Is the retention'));

    expect(dispatch().status).toBe(0);
  });

  it('ignores an unmarked box that is not at the start of its line', async () => {
    for (const line of [
      '  - [ ] Indented, so not a checklist item',
      '\t- [ ] Tab indented, so not a checklist item',
      '> - [ ] Quoted, so not a checklist item',
      'Note that - [ ] mid-line is not a checklist item'
    ]) {
      await writeSpecChecklist(`# Spec Quality Checklist\n\n${line}\n`);

      expect(dispatch().status, `${line} must not gate`).toBe(0);
    }
  });

  it('reads both checklists the contract names', async () => {
    await writeSpecChecklist('# Spec Quality Checklist\n\n- [x] Answered? [Clarity, Requirements]\n');
    await fs.outputFile(
      path.join(project, '.apm', 'checklists', 'plan.md'),
      '# Plan Quality Checklist\n\n- [ ] Is every Task independently validatable? [Coverage, Stages]\n'
    );

    const { status, stderr } = dispatch();

    expect(status).toBe(2);
    expect(stderr).toContain('Is every Task independently validatable?');
  });
});

describe('dispatch gate: absent checklists are a free pass', () => {
  /** Dispatches against the bus file and returns the verdict. */
  function dispatch() {
    return runGate({
      file_path: path.join(project, '.apm', 'bus', 'review-agent', 'task.md'),
      content: TASK_PROMPT
    });
  }

  it('allows a dispatch when the checklist directory does not exist', async () => {
    expect(await fs.pathExists(path.join(project, '.apm', 'checklists'))).toBe(false);

    expect(dispatch().status).toBe(0);
  });

  it('allows a dispatch when the checklist directory is empty', async () => {
    await fs.ensureDir(path.join(project, '.apm', 'checklists'));

    expect(dispatch().status).toBe(0);
  });

  it('allows a dispatch when a checklist holds no boxes at all', async () => {
    await fs.outputFile(
      path.join(project, '.apm', 'checklists', 'spec.md'),
      '# Spec Quality Checklist\n\nNo items were written yet.\n'
    );

    expect(dispatch().status).toBe(0);
  });
});
