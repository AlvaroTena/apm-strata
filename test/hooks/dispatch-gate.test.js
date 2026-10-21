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
 * @param {{cwd?: string, projectDir?: string}} options - The payload's working
 *   directory (the project by default) and the CLAUDE_PROJECT_DIR to run under
 *   (unset by default, whatever the surrounding environment holds).
 * @returns {{status: number, stderr: string}} Exit status and reason.
 */
function runGate(toolInput, toolName = 'Write', options = {}) {
  const payload = JSON.stringify({
    session_id: 'test-session',
    cwd: options.cwd ?? project,
    hook_event_name: 'PreToolUse',
    tool_name: toolName,
    tool_input: toolInput
  });

  try {
    const env = { ...process.env };
    delete env.CLAUDE_PROJECT_DIR;
    if (options.projectDir) env.CLAUDE_PROJECT_DIR = options.projectDir;
    execFileSync('sh', [gate], { input: payload, encoding: 'utf8', stdio: 'pipe', env });
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

const BUS_FILE = '.apm/bus/review-agent/task.md';

/** Runs a Bash command through the gate and returns its verdict. */
function runBash(command) {
  return runGate({ command, description: 'test command' }, 'Bash');
}

describe('dispatch gate: Bash commands on the Task Bus', () => {
  it.each([
    ['a redirect from a heredoc', `cat > ${BUS_FILE} <<EOF\n---\nstage: 1\nEOF`],
    ['an append redirect', `echo more >> ${BUS_FILE}`],
    ['a redirect to a quoted path', `printf x > "$ROOT/${BUS_FILE}"`],
    ['tee', `echo prompt | tee ${BUS_FILE}`],
    ['tee with flags', `echo prompt | tee -a ${BUS_FILE}`],
    ['cp onto it', `cp /tmp/prompt.md ${BUS_FILE}`],
    ['mv onto it', `mv /tmp/prompt.md ${BUS_FILE}`],
    ['install onto it', `install -m 644 /tmp/prompt.md ${BUS_FILE}`],
    ['sed -i', `sed -i '' 's/a/b/' ${BUS_FILE}`],
    ['sed -i with a suffix', `sed -i.bak 's/a/b/' ${BUS_FILE}`],
    ['perl -pi', `perl -pi -e 's/a/b/' ${BUS_FILE}`],
    ['truncate to a size above zero', `truncate -s 10 ${BUS_FILE}`],
    ['truncate with a long size above zero', `truncate --size=10 ${BUS_FILE}`],
    ['mv between buses', `mv /w/${BUS_FILE} ${BUS_FILE}`],
    ['an empty redirect', `: > ${BUS_FILE}`],
    ['cp from a file outside the bus', `cp /tmp/p.md ${BUS_FILE}`],
    ['install from a file outside the bus', `install /tmp/p.md ${BUS_FILE}`],
    ['an allowed copy followed by a blocked write', `cp ${BUS_FILE} /w/${BUS_FILE} && echo hi > ${BUS_FILE}`],
    ['an allowed clear followed by a blocked write', `truncate -s 0 ${BUS_FILE}; tee ${BUS_FILE} < /tmp/p.md`],
    ['a copy that redirects into the bus', `cp ${BUS_FILE} /w/ > ${BUS_FILE}`],
    ['dd of=', `dd if=/dev/null of=${BUS_FILE}`],
    ['a python3 command that names it', `python3 -c "open('${BUS_FILE}', 'w').write('x')"`],
    ['a python3 heredoc that names it', `python3 - <<'EOF'\nopen('${BUS_FILE}', 'w')\nEOF`],
    ['node', `node -e "require('fs').writeFileSync('${BUS_FILE}', 'x')"`],
    ['an absolute path', `echo x > /work/parcel-app/${BUS_FILE}`],
    ['a command after a separator', `cd /work && sed -i s/a/b/ ${BUS_FILE}`]
  ])('blocks %s', (_name, command) => {
    const { status, stderr } = runBash(command);

    expect(status).toBe(2);
    expect(stderr).toContain('review-agent/task.md');
    expect(stderr).toContain('Write or Edit tool');
  });

  it.each([
    ['cat', `cat ${BUS_FILE}`],
    ['head', `head -n 5 ${BUS_FILE}`],
    ['tail', `tail -n 5 ${BUS_FILE}`],
    ['wc', `wc -l ${BUS_FILE}`],
    ['grep', `grep -n "Spec Deltas" ${BUS_FILE}`],
    ['grep for a word that names a tool', `grep -n tee ${BUS_FILE} | head`],
    ['grep for an interpreter name', `grep python ${BUS_FILE}`],
    ['ls', `ls -la ${BUS_FILE}`],
    ['test', `test -s ${BUS_FILE} && echo present`],
    ['a bracket test', `[ -s ${BUS_FILE} ]`],
    ['sed without -i', `sed -n 1,5p ${BUS_FILE}`],
    ['cp with it as the source', `cp ${BUS_FILE} /tmp/copy.md`],
    ['cat redirected elsewhere', `cat ${BUS_FILE} > /tmp/copy.md`]
  ])('lets a read-only %s pass', (_name, command) => {
    expect(runBash(command).status).toBe(0);
  });

  it('never blocks a command that does not name a Task Bus file', () => {
    expect(runBash('echo hello > /tmp/out.txt').status).toBe(0);
    expect(runBash('python3 -c "print(1)"').status).toBe(0);
    expect(runBash('sed -i s/a/b/ src/index.js').status).toBe(0);
    expect(runBash('echo task.md >> notes.txt').status).toBe(0);
  });

  it('does not watch the report or handoff files', () => {
    expect(runBash('echo done > .apm/bus/review-agent/report.md').status).toBe(0);
    expect(runBash('truncate -s 0 .apm/bus/review-agent/handoff.md').status).toBe(0);
  });

  it('blocks whatever the working directory and checklist state', async () => {
    await writeChecklist(true);

    const { status } = runGate(
      { command: `tee ${BUS_FILE} < /tmp/prompt.md` },
      'Bash',
      { cwd: path.join(project, '.apm') }
    );

    expect(status).toBe(2);
  });
});

describe('dispatch gate: emptying and copying between buses', () => {
  it.each([
    ['truncate -s 0', `truncate -s 0 ${BUS_FILE}`],
    ['truncate -s0', `truncate -s0 ${BUS_FILE}`],
    ['truncate --size=0', `truncate --size=0 ${BUS_FILE}`],
    ['truncate --size 0', `truncate --size 0 ${BUS_FILE}`],
    ['truncate behind a path', `truncate -s 0 /w/${BUS_FILE}`],
    ['cp bus to a mailbox file', `cp ${BUS_FILE} /w/${BUS_FILE}`],
    ['cp a mailbox file to the bus', `cp /w/${BUS_FILE} ${BUS_FILE}`],
    ['cp bus to a mailbox directory', `cp ${BUS_FILE} /w/.apm/bus/review-agent/`],
    ['cp with flags', `cp -f -p ${BUS_FILE} /w/${BUS_FILE}`],
    ['cp with quoted paths', `cp "${BUS_FILE}" "/w/${BUS_FILE}"`],
    ['install bus to a mailbox', `install -m 644 ${BUS_FILE} /w/${BUS_FILE}`],
    ['both in one command', `cp ${BUS_FILE} /w/${BUS_FILE} && truncate -s 0 ${BUS_FILE}`]
  ])('lets %s pass', (_name, command) => {
    expect(runBash(command).status).toBe(0);
  });
});

describe('dispatch gate: project root', () => {
  const DELTAS_PROMPT = TASK_PROMPT.replace(
    'none - builds the settings screen from scratch',
    '.apm/openspec/courier-settings/changes'
  );

  beforeEach(async () => {
    await fs.ensureDir(path.join(project, '.apm', 'openspec', 'courier-settings', 'changes'));
    await fs.ensureDir(path.join(project, '.apm', 'review'));
  });

  const dispatch = (options) =>
    runGate(
      {
        file_path: path.join(project, '.apm', 'bus', 'review-agent', 'task.md'),
        content: DELTAS_PROMPT
      },
      'Write',
      options
    );

  it('finds a relative delta path with the payload directory in a subdirectory', () => {
    const subdirectory = path.join(project, '.apm', 'review');

    expect(dispatch({ cwd: subdirectory, projectDir: project }).status).toBe(0);
  });

  it('uses the payload directory as the root when CLAUDE_PROJECT_DIR is unset', () => {
    expect(dispatch({ cwd: project }).status).toBe(0);
  });

  it('reads the checklists from the project root', async () => {
    await writeChecklist(false);

    const { status, stderr } = dispatch({
      cwd: path.join(project, '.apm', 'review'),
      projectDir: project
    });

    expect(status).toBe(2);
    expect(stderr).toContain('Bundle snapshot refreshed');
  });

  it('still rejects a delta path that does not exist under the root', async () => {
    await fs.remove(path.join(project, '.apm', 'openspec'));

    const { status, stderr } = dispatch({
      cwd: path.join(project, '.apm', 'review'),
      projectDir: project
    });

    expect(status).toBe(2);
    expect(stderr).toContain('does not exist as a directory');
  });

  it('falls back to the payload directory when CLAUDE_PROJECT_DIR is not a directory', () => {
    expect(
      dispatch({ cwd: project, projectDir: path.join(project, 'no-such-directory') }).status
    ).toBe(0);
  });
});
