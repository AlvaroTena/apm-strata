# APM {VERSION} - Task Logging Guide

## 1. Overview

**Reading Agent:** Worker

This guide defines how you log Task outcomes and report results. Task Logs capture Task-level context using structured markdown files, enabling the Manager to track progress and make review decisions without parsing raw code or chat history.

### 1.1 Outputs

- *Task Log:* Structured log at `.apm/memory/stage-<NN>/task-<NN>-<MM>.log.md` capturing outcome, validation, deliverables, and flags.
- *Task Report:* Concise summary written to the Report Bus for the coordinator to process.
- *Updated domain notes:* `.apm/bus/<agent-slug>/handoff.md`, carrying what the next session of this domain needs.

---

## 2. Operational Standards

### 2.1 Flag Assessment Standards

Boolean flags in YAML frontmatter signal conditions requiring Manager attention. Set flags based on what you observed during execution relative to your Task Prompt and working context.

**`important_findings`:** Set to `true` when execution revealed information not in your Task Prompt that seems project-relevant, you discovered dependencies, risks, or constraints your Task Prompt didn't account for, or something suggests other Tasks or agents might be affected.

**`compatibility_issues`:** Set to `true` when your output conflicts with existing code, patterns, or conventions you touched, you discovered integration concerns that might affect other parts of the system, or breaking changes or migration requirements resulted from your work.

**Default:** When uncertain whether a finding warrants a flag, set to `true`. False negatives hurt coordination more than false positives.

### 2.2 Outcome Standards

Status reflects whether the objective was achieved. Select based on end state, not effort expended.

- *Success:* Objective achieved, all validation passed.
- *Partial:* Some progress made but incomplete; you need guidance to continue.
- *Failed:* Objective not achieved; you attempted but could not resolve the issue.

Use Partial when: validation is ambiguous, important findings emerged that could affect other Tasks, iteration stalled with recurring failures, or approach uncertainty depends on factors outside your scope. Continue iterating (do not log yet) when validation failed but the cause is clear and fixable, no findings require Manager awareness, and progress is being made.

### 2.3 Detail Level Standards

Task Logs serve the Manager's coordination needs, not archival documentation. Ask: does this detail help the Manager understand what was accomplished? Would it affect the Manager's next review decision? Can it be found by reading the referenced artifacts directly?

**Default:** Prefer concise but comprehensive summaries with artifact references over verbose inline content. Reference artifacts by path rather than including large code blocks. Include code snippets only for novel, complex, or critical logic (20 lines or fewer). For error messages, include relevant stack traces or diagnostic details.

---

## 3. Task Logging Procedure

Two sequential steps after Task completion: write the Task Log, then deliver the Task Report via the bus. Execute after Task completion per `{GUIDE_PATH:task-execution}` §3.6 Task Completion.

### 3.1 Task Log Procedure

After Task execution, populate the Task Log at the path provided in the Task Prompt (`log_path`).

Perform the following actions:
1. Read the APM_RULES block from `{RULES_FILE}`, or from `CLAUDE.md` when that file does not contain it.
2. From the completion assessment already presented in chat per `{GUIDE_PATH:task-execution}` §3.6 Task Completion, determine what to capture in the Task Log.
3. Complete YAML frontmatter fields:
   - Set `status` per §2.2 Outcome Standards.
   - Set `important_findings` and `compatibility_issues` per §2.1 Flag Assessment Standards.
   - Set `stage`, `task`, `title`, and `agent` from the Task Prompt.
4. Complete markdown body sections per §4.1 Task Log Format. Always include: Summary, Details, Output, Validation, Issues. Include conditional sections (Compatibility Concerns, Important Findings) only when their corresponding flag is `true`.
5. Write the Task Log to `log_path`.

### 3.2 Task Report Delivery

Perform the following actions:
1. Update the domain notes per §4.3 Domain Notes Format, before clearing anything - the Task Prompt is still on the bus and you may want it.
2. Clear the incoming Task Bus: truncate `.apm/bus/<agent-slug>/task.md` via terminal (e.g., `truncate -s 0` or shell redirection).
3. Read the Report Bus, then write the Task Report to it: `.apm/bus/<agent-slug>/report.md`. The report is a concise summary - key outcome, status, log path, and any flags. Detail belongs in the Task Log.
4. Send the fixed trigger text back per `{SKILL_PATH:apm-communication}` §4.4 Trigger Messages. It names the Report Bus path and carries none of the report's content.

---

## 4. Structural Specifications

### 4.1 Task Log Format

**Location:** `.apm/memory/stage-<NN>/task-<NN>-<MM>.log.md`

**Naming Convention:**
- `<NN>`: Stage number, zero-padded (e.g., 01, 02).
- `<MM>`: Task number within Stage, zero-padded (e.g., 01, 02).

**YAML Frontmatter Schema:**

```yaml
---
stage: <N>
task: <M>
title: <Task title from Plan>
agent: <agent-slug>
status: Success | Partial | Failed
important_findings: true | false
compatibility_issues: true | false
---
```

**Field Descriptions:**
- `stage`: Stage number from the Task Prompt.
- `task`: Task number from the Task Prompt.
- `title`: Task title from the Task Prompt.
- `agent`: Your agent identifier.
- `status`: Task outcome per §2.2 Outcome Standards. `Success`, `Partial`, or `Failed`.
- `important_findings`: Whether discoveries have implications beyond current Task scope per §2.1 Flag Assessment Standards.
- `compatibility_issues`: Whether output conflicts with existing systems per §2.1 Flag Assessment Standards.

**Markdown Body Template:**

```markdown
# Task <N>.<M> - <Title>

## Summary
[1-2 sentences describing main outcome]

## Details
[Work performed, decisions made, steps taken in logical order. Note subagent usage when applicable.]

## Output
- File paths for created/modified files
- Code snippets (if necessary, ≤20 lines)
- Configuration changes
- Results or deliverables

## Validation
[Description of validation performed and result]

## Issues
[Specific blockers or errors encountered, or "None"]

## Compatibility Concerns
[Only include if compatibility_issues: true]
[Description of compatibility issues identified]

## Important Findings
[Only include if important_findings: true]
[Project-relevant discoveries that Manager must know]
```

### 4.2 Task Report Format

Task Reports are concise summaries written to the Report Bus for the Manager to process. Detail belongs in the Task Log - the report provides enough for the Manager to assess the outcome and locate the log.

**Location:** `.apm/bus/<agent-slug>/report.md`

**YAML Frontmatter Schema:**

```yaml
---
stage: <N>
task: <M>
agent: <agent-slug>
status: Success | Partial | Failed
log_path: ".apm/memory/stage-<NN>/task-<NN>-<MM>.log.md"
important_findings: true | false
compatibility_issues: true | false
---
```

**Field Descriptions:**
- `stage`: Stage number from the Task Prompt.
- `task`: Task number from the Task Prompt.
- `agent`: Your agent identifier.
- `status`: Task outcome per §2.2 Outcome Standards.
- `log_path`: Path to the Task Log for this Task.
- `important_findings`: Same value as the Task Log.
- `compatibility_issues`: Same value as the Task Log.

**Markdown Body:** 1-2 sentences summarizing the outcome. Reference the Task Log for detail.

### 4.3 Domain Notes Format

`handoff.md` in your bus directory is the only file that carries anything between your domain's sessions. Unlike the Task Bus and Report Bus, it is not cleared after reading: it persists for the life of the domain.

**Location:** `.apm/bus/<agent-slug>/handoff.md`

**Body:** free prose under `##` headings you choose. There is no schema, because what a domain needs to remember differs by domain. Keep it to what the next session would otherwise waste time rediscovering: conventions settled, traps hit, paths that matter, decisions whose reasons are not visible in the code. Replace entries that no longer hold instead of appending, and leave out what a Task Log already records in detail. Empty is a valid state.

**Pending continuation block.** When a session exhausts its context part-way through a Task, its replacement needs to know where the work stopped. That is transient, not domain memory, so it goes in a clearly delimited block at the top of the file:

```markdown
<!-- APM:CONTINUATION -->
Continuation pending for Task <N>.<M>. Read the Handoff Log at
`.apm/memory/handoffs/<agent-slug>/handoff-<NN>.log.md`, then read the Task Prompt still
on the Task Bus and resume from where it stopped.
<!-- /APM:CONTINUATION -->
```

A session that finds this block acts on it, then deletes the block and leaves the rest of the file intact. Only `{SKILL_PATH:apm.handoff.worker}` writes it.

---

## 5. Content Guidelines

### 5.1 Good vs Poor Logging
- *Summary:* "Made some changes and fixed issues" → "Implemented POST /api/users with validation. All tests passing."
- *Details:* "I worked on the endpoint and there were some issues" → "Added registration route with email/password validation using express-validator"
- *Output:* "Changed some files" → "Modified: `routes/users.js`, `server.js`"
- *Validation:* "It works now" → "Test suite: 5/5 passing. Manual testing confirmed expected responses."

### 5.2 Common Mistakes

- *Forgetting conditional sections:* When a flag is `true`, include the corresponding section (Compatibility Concerns, Important Findings).
- *Missing artifact references:* When deliverables are produced, list file paths in the Output section.
- *Domain notes left untouched:* A session that learned something its successor needs and wrote nothing to `handoff.md` has discarded it. The session ends when the Task does, and nothing else carries forward.
- *Domain notes used as a log:* Appending every session's narrative turns the file into something nobody reads. It holds what is still true and still useful, not a history.

---

**End of Guide**
