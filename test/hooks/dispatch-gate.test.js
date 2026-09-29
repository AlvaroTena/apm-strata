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

## Spec Deltas

none - builds the settings screen from scratch
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
    // An unexpected block is usually a status word outside the closed set, so
    // the message has to point at the word rather than only at the item.
    expect(stderr).toContain('counts as open unless it reads as');
  });

  it('allows a dispatch when the open item blocks a different task', () => {
    const { status } = runGate({
      file_path: path.join(project, '.apm', 'bus', 'review-agent', 'task.md'),
      content: TASK_PROMPT.replace('task: 9', 'task: 6')
    });

    expect(status).toBe(0);
  });

  it('does not treat the dot in a task identity as a regular expression wildcard', async () => {
    // An item blocking "2-3" must not block Task 2.9 or any other Task whose
    // identity differs only where the dot sits. Written as a range by hand,
    // "2-3" is a plausible entry and matched Task 2.3 before the identity was
    // escaped.
    const rangeTracker = TRACKER.replace('| 2.9, 3.1 | open |', '| 2-9 | open |');
    await fs.outputFile(path.join(project, '.apm', 'tracker.md'), rangeTracker);

    const { status } = runGate({
      file_path: path.join(project, '.apm', 'bus', 'review-agent', 'task.md'),
      content: TASK_PROMPT
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

describe('dispatch gate: spec deltas condition', () => {
  const busFile = () => path.join(project, '.apm', 'bus', 'review-agent', 'task.md');
  const DELTAS_PATH = '.apm/openspec/parcel-router/changes';

  /** Returns the fixture prompt with its Spec Deltas section body replaced. */
  function withDeltas(body) {
    return TASK_PROMPT.replace(
      '## Spec Deltas\n\nnone - builds the settings screen from scratch\n',
      `## Spec Deltas\n\n${body}\n`
    );
  }

  /** Dispatches a prompt with a Write and returns the verdict. */
  function dispatch(content) {
    return runGate({ file_path: busFile(), content });
  }

  it('blocks a prompt without the section and names the heading', () => {
    const { status, stderr } = dispatch(TASK_PROMPT.replace(/## Spec Deltas[\s\S]*$/, ''));

    expect(status).toBe(2);
    expect(stderr).toContain('## Spec Deltas');
    // The message carries both valid forms, so the reader can fix the prompt
    // without opening the guide.
    expect(stderr).toContain('none - <why this Task changes no specification>');
    expect(stderr).toContain('.apm/openspec/<change>/changes');
  });

  it('blocks "none" without a reason', () => {
    for (const body of ['none - ', 'none -', 'none']) {
      const { status, stderr } = dispatch(withDeltas(body));
      expect(status, `"${body}" must block`).toBe(2);
      expect(stderr).toContain('carries no reason');
    }
  });

  it('allows "none" with a reason', () => {
    expect(dispatch(withDeltas('none - builds the settings screen from scratch')).status).toBe(0);
  });

  it('blocks a heading with nothing under it', () => {
    const { status } = dispatch(TASK_PROMPT.replace(/(## Spec Deltas)[\s\S]*$/, '$1\n\n'));

    expect(status).toBe(2);
  });

  it('blocks a first line that is neither form', () => {
    for (const body of ['## Validation', 'see the change folder', '.apm/openspec/changes', 'docs/parcel-router/changes']) {
      const { status } = dispatch(withDeltas(body));
      expect(status, `"${body}" must block`).toBe(2);
    }
  });

  it('blocks a deltas path that does not exist and names it', () => {
    const { status, stderr } = dispatch(withDeltas(DELTAS_PATH));

    expect(status).toBe(2);
    expect(stderr).toContain(`${DELTAS_PATH} does not exist`);
  });

  it('allows a deltas path that exists', async () => {
    await fs.ensureDir(path.join(project, DELTAS_PATH));

    expect(dispatch(withDeltas(DELTAS_PATH)).status).toBe(0);
  });

  it('reads a path in backticks the same as a bare one', async () => {
    const quoted = withDeltas(`\`${DELTAS_PATH}\``);

    expect(dispatch(quoted).status).toBe(2);

    await fs.ensureDir(path.join(project, DELTAS_PATH));

    expect(dispatch(quoted).status).toBe(0);
  });

  it('allows a write that clears the bus', () => {
    expect(dispatch('').status).toBe(0);
  });

  it('blocks an Edit that deletes the section from the prompt on disk', async () => {
    await fs.outputFile(busFile(), TASK_PROMPT);

    const { status, stderr } = runGate(
      {
        file_path: busFile(),
        old_string: '## Spec Deltas\n\nnone - builds the settings screen from scratch\n',
        new_string: '',
        replace_all: false
      },
      'Edit'
    );

    expect(status).toBe(2);
    expect(stderr).toContain('no "## Spec Deltas" heading');
  });

  it('allows an Edit elsewhere in a prompt whose decision stands', async () => {
    await fs.outputFile(busFile(), TASK_PROMPT);

    const { status } = runGate(
      {
        file_path: busFile(),
        old_string: 'Implement the hook scripts',
        new_string: 'Implement both hook scripts',
        replace_all: false
      },
      'Edit'
    );

    expect(status).toBe(0);
  });

  it('applies replace_all when rebuilding the edited prompt', async () => {
    // The phrase appears in the body before it appears as the reason, so only
    // replace_all reaches the decision line.
    await fs.outputFile(
      busFile(),
      TASK_PROMPT.replace('them.\n', 'them.\n\nScope note: builds the settings screen from scratch.\n')
    );

    const edit = replaceAll => runGate(
      {
        file_path: busFile(),
        old_string: 'builds the settings screen from scratch',
        new_string: '',
        replace_all: replaceAll
      },
      'Edit'
    );

    expect(edit(false).status).toBe(0);
    expect(edit(true).status).toBe(2);
  });

  it('still blocks on an unchecked checklist when the decision is valid', async () => {
    await writeChecklist(false);

    const { status, stderr } = dispatch(TASK_PROMPT);

    expect(status).toBe(2);
    expect(stderr).toContain('Bundle snapshot refreshed');
    expect(stderr).not.toContain('Spec Deltas decision');
  });

  it('reports every failing condition in one message', async () => {
    await writeChecklist(false);
    await fs.outputFile(path.join(project, '.apm', 'tracker.md'), TRACKER);

    const { status, stderr } = dispatch(withDeltas('none'));

    expect(status).toBe(2);
    expect(stderr).toContain('Bundle snapshot refreshed');
    expect(stderr).toContain('Retire the legacy parcel router');
    expect(stderr).toContain('Spec Deltas decision');
  });

  it('never blocks a file that is not a Task Bus message, whatever it holds', () => {
    for (const filePath of [
      path.join(project, '.apm', 'bus', 'review-agent', 'report.md'),
      path.join(project, '.apm', 'bus', 'review-agent', 'handoff.md'),
      path.join(project, 'docs', 'task.md'),
      path.join(project, '.apm', 'bus', 'review-agent', 'nested', 'task.md')
    ]) {
      const { status } = runGate({ file_path: filePath, content: withDeltas('none') });
      expect(status, `${filePath} must not be gated`).toBe(0);
    }
  });

  it('gates a worktree mailbox task.md the same as the shared one', () => {
    // The path test matches any .apm/bus/<agent>/task.md, so a mailbox inside a
    // worktree is gated too, with project paths still resolved from the cwd.
    const mailbox = path.join(project, '.claude', 'worktrees', 'wt', '.apm', 'bus', 'review-agent', 'task.md');

    expect(runGate({ file_path: mailbox, content: withDeltas('none') }).status).toBe(2);
    expect(runGate({ file_path: mailbox, content: TASK_PROMPT }).status).toBe(0);
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
