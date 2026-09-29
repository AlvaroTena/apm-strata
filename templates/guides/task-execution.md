# APM {VERSION} - Task Execution Guide

## 1. Overview

**Reading Agent:** Worker

This guide defines how you execute the Task assigned to you, from receipt through context integration, execution, validation, iteration, and completion.

Your session exists for this one Task. It starts when the coordinator launches it and ends when the Task's branch is merged, so nothing you hold in context survives to the next Task. What the next session of your domain needs to know goes in `handoff.md`, which you read before you start and update before you report.

---

## 2. Operational Standards

Write clean, maintainable code following best practices for the language and framework in use. Use descriptive naming and add comments where the logic is not self-evident. Follow the existing codebase's patterns, conventions, and structure. Build incrementally - validate after each meaningful step rather than producing everything at once. These are baseline defaults; Task Prompt instructions and Rules take precedence when they specify otherwise.

### 2.1 Context Integration Standards

Follow the integration steps completely - read files, review artifacts, understand interfaces. Do this for every dependency, including work an earlier session of your own domain produced: that session is gone and you have none of its context. For dependency integration that requires reading specific files at known paths, read them directly. Subagent dispatch is for open-ended exploration or investigation where the scope is broad or context isolation is beneficial.

**Integration issues:** Do not execute on an unstable foundation. Report back with Partial status when a dependency's output is missing or contradicts what the prompt describes, and say what you found - the coordinator can correct the prompt or the ordering. For a minor ambiguity, continue with your best interpretation and note the uncertainty in the Task Log.

### 2.2 Validation Standards

Validation criteria in the Task Prompt specify what to check. Execute each criterion as written - run tests, verify outputs exist and match expected structure, confirm behavior meets requirements. Always complete autonomous checks first. If any autonomous check fails, correct it before involving the User - do not request User review or User action while autonomous checks are failing.

When a criterion requires User involvement - judgment the Worker cannot self-assess (design approval, content quality) or action outside the development environment (running external checks, confirming platform behavior) - pause and present work only after all autonomous checks pass. When pausing, communicate clearly per `{SKILL_PATH:apm-communication}` §2.1 Direct Communication: what is needed and why, what the User should expect or verify, and what to report back so execution can continue.

When criteria require resources not currently available, request them from the User rather than substituting a lower verification level.

**Spec deltas.** Your Task Prompt always carries a `## Spec Deltas` section, and its first line states the coordinator's decision. When it reads `none - <reason>`, confirm the reason holds as you work. If the work turns out to change something that already existed, do not write a delta yourself: record it in the Task Log under Important Findings as a deviation from the prompt and say so in the report, so the coordinator writes the delta against the right baseline. When the first line names a directory, validate it before you report, using the command the project declares under `## Deltas` in `{RULES_FILE}`, or `apm delta validate <path>` on that directory when no such block exists. Take the command from the declaration rather than assuming one. The prompt's delta was validated when it was written, but your work may have moved a requirement's wording or added a scenario, and a delta that no longer matches the spec it describes reports clean while changing nothing. Update the delta to match your work; leave the baseline alone. The coordinator wrote it from the base branch as the record of behaviour before your change, so editing it to make the delta pass erases the comparison the check exists for. When the baseline misstates that behaviour, say what it gets wrong in the Task Log and report Partial. Read the rules the validator enforces in `{GUIDE_PATH:task-assignment}` §2.8 Spec Delta Standards; the one that bites is that a `MODIFIED` block replaces the requirement whole, so an omitted scenario deletes it.

### 2.3 Iteration Standards

When validation fails, you enter a correction loop - investigate, correct, re-validate.

**Investigate before fixing.** Read error output thoroughly, trace the failure to its origin, and understand what specifically went wrong before changing anything. Attempting fixes without understanding the cause compounds problems and wastes iterations.

**One targeted fix per iteration.** Apply a single change based on what your investigation found, then re-validate. When a correction does not resolve the issue - the same failure recurs, the fix introduces new problems, or the root cause remains unclear - spawn a debug subagent with structured instructions: the error output, what you investigated and attempted, relevant file paths, and the expected vs actual behavior. Direct it to trace the root cause, form a specific hypothesis, and propose a targeted fix. The subagent iterates in a fresh context while your main context is preserved for validating its findings. When the root cause could stem from multiple independent areas, spawn separate subagents in parallel. When a subagent returns, validate its findings before applying - confirm the root cause explanation makes sense and the fix addresses it. If unresolved after subagent investigation, prefer reporting back with Partial status - the Manager can restructure or reassign. When execution suggests Task Prompt instructions may be inaccurate, this is also a reason to stop iterating. When classification is unclear, prefer Partial with clear description - invites guidance rather than closing options.

**User collaboration:** Pause when criteria require User judgment (you cannot self-approve subjective quality), when explicit User actions are needed (outside the development environment), when environment resources are needed for validation, or when iteration stalls and you need guidance. Continue autonomously when checks can be performed without User involvement and when the cause of failure is clear and the fix is within scope. When uncertain or stopping without Success, pause and present the situation to the User with options rather than making unilateral decisions.

### 2.4 Rules Updates

When the User provides a correction or directive during execution, comply immediately and continue. Do not pause to discuss Rules at this point. At Task completion, note the correction in the Task Log under Important Findings with `important_findings: true` - the Manager will see it during Task Review regardless of what happens next. After logging, reporting, and directing the User to deliver the report, ask at the end of your turn whether the correction should become a Rule for all Workers - frame it naturally based on what was said and why it might apply beyond this Task. Make it clear the User can ignore this and proceed with delivering the report - it is not a gate. If the User approves, update `{RULES_FILE}` and update the Task Log to note that the correction was entered as a Rule. If the User declines, defers, or ignores, no further action - the Manager already has visibility through the important findings flag.

### 2.5 Version Control Standards

Operate in the worktree given in the Task Prompt's Workspace section. Cut the Task branch named there from the base branch named there, and commit your work on it following the commit conventions from `{RULES_FILE}`. Note the worktree and branch in the Task Log. Cutting your own Task branch is the only version control setup you perform: do not create other branches, manage worktrees, push, or merge. The coordinator handles the rest. For large Tasks, commit at logical intermediate points rather than only at completion - each commit should represent a coherent unit of change.

**Stay inside the worktree.** The session is isolated there, and the platform refuses any file edit that lands in the main checkout. Everything you need was copied in before the launch: the bundle, the Rules file, and a mailbox at `.apm/` holding your Task Bus, your domain notes, your Report Bus and the directories your Task Log and any spec delta live in, per `{SKILL_PATH:apm-communication}` §4.5 Worktree Mailbox. Read and write every `.apm/` path relative to the worktree, exactly as written. The coordinator copies your Task Log, report and domain notes out when your report trigger arrives. Never reach for the checkout's copy of a file, not even to read it - when something you need is missing from the worktree, say so in the Task Log and report Partial rather than going out to fetch it. Write file contents with the file tools, and keep shell commands plain and separate: the platform also refuses a command whose reach it cannot verify from its text, such as a heredoc chained to other commands.

**Commit content:** APM terminology - Task IDs, Stage numbers, agent identifiers, framework vocabulary - does not appear in commit messages, branch references, or source code comments. Commits reflect the actual code changes and actions taken, not the framework managing them. Write commit messages as if no project management framework existed.

### 2.6 Domain Continuity Standards

`handoff.md` in your bus directory is your domain's memory across sessions. Read it before you start and update it before you report.

**Reading it.** Treat it as what an earlier session of this domain chose to pass on: conventions it settled, traps it hit, paths that matter. It is not dependency context and not authoritative over your Task Prompt. When it contradicts the prompt or the codebase, the prompt and the codebase win, and you note the contradiction so it gets corrected.

**Updating it.** Write what the next session of this domain would waste time rediscovering, and nothing else. Keep it short enough to stay worth reading: replace entries that no longer hold rather than appending to them, and leave out anything a Task Log already records in detail. An empty file is a valid state - say nothing rather than pad it.

### 2.7 Self-Review Standards

Before you log and report, run the review lenses over your own work once and fix what is plainly yours. This does not replace the coordinator's review, which stages its own material, runs the lenses again and judges every finding. It catches the obvious before a correction round has to.

**Once per attempt.** Run the lenses one time on the first attempt and one time on each follow-up - never in a loop until they come back clean. Each run costs a subagent per lens, and a clean pass proves nothing the coordinator's review will not check anyway.

**Stage it in your mailbox,** at `.apm/review/<stage>-<task>/self/` inside your worktree, both numbers zero-padded. The coordinator's own staging for this Task uses the directory above it, so the `self/` subdirectory keeps the two apart, and the collection carries it back to the shared `.apm/` beside the coordinator's material. Write:
- `artifact.diff` - your Task branch against its base branch, after committing, written with one standalone command and the path spelled out: `git diff <base-branch>...HEAD > .apm/review/<stage>-<task>/self/artifact.diff`. A shell variable or a chained command around `git` is refused by the worktree isolation.
- `acceptance.md` - the validation criteria from your Task Prompt, copied verbatim.
- `claims.md` - the claims you are about to write in your Task Log.
- `context.md` - the worktree path, as the repository the lenses may read.

**Select and launch as the review does.** Read the lens selection and execution sections of `{SKILLS_DIR}/apm.manage/references/review-procedure.md` - the copy in your worktree - and follow them rather than a summary: the same lenses apply, each receives absolute paths and never text, the edge-case lens alone gets `claims.md` marked as not to be read until its instructions call for it, and every launch prompt carries the same constraints. Launch the applicable lenses together as subagents. Save each lens's reply to `self/<lens>.json` verbatim - the JSON object it returned, every field of every finding - not a summary of it: the collection carries these files to the coordinator as the raw record.

**Act on what is clearly yours.** Fix a finding that is plainly a defect of your work, commit the fix, and rerun the validation it touches. Leave the rest as it is and say why. Do not assign verdicts or buckets - judging findings belongs to the coordinator, who is not the author. A finding that points at something your Task Prompt never asked for, or asked for ambiguously, is a gap in the brief, not a defect of yours: name it as one, because that is half of what this pass is for.

**Record everything the lenses returned,** not only what you changed, in the Task Log's `## Self-Review` section per `{GUIDE_PATH:task-logging}` §4.1 Task Log Format. A silent fix removes the signal the coordinator needs to judge how the attempt went.

When subagents are unavailable, do not run the lenses by hand: write why in the section and move on.

---

## 3. Task Execution Procedure

Sequential flow from Task Prompt receipt through completion. Task Validation and the Correction Loop form a cycle that repeats until success or a stop condition.

### 3.1 Task Prompt Receipt

A trigger naming your Task Bus starts this procedure. The trigger itself carries nothing but that path - everything you need is in the file.

On Task receipt, perform the following actions:
1. Read the APM_RULES block from `{RULES_FILE}`, or from `CLAUDE.md` when that file does not contain it.
2. Read `.apm/bus/<agent-slug>/handoff.md` per §2.6 Domain Continuity Standards. Empty means no earlier session left anything.
3. Read the Task Prompt from `.apm/bus/<agent-slug>/task.md`.
4. Verify `agent` in YAML frontmatter matches your assigned identity. Validate the bus directory matches `agent` per `{SKILL_PATH:apm-communication}` §4.1 Bus Identity Standards. If mismatch, decline per `{SKILL_PATH:apm.work}` §5 Operating Rules.
5. Cut the Task branch from the base branch, both named in the Workspace section, per §2.5 Version Control Standards.
6. If `has_dependencies: true`, continue to Context Integration, otherwise proceed to §3.3 Task Execution.

### 3.2 Context Integration

Perform the following actions:
1. Read the Context from Dependencies section.
2. Execute the integration steps completely for every dependency per §2.1 Context Integration Standards - read files, review artifacts, understand interfaces. {WORKER_SUBAGENT_GUIDANCE} When a subagent returns findings, verify critical claims by reading the key files it references before proceeding - subagent summaries compress details and can misrepresent what matters for execution.
3. If integration issues discovered, apply decision rules from §2.1 Context Integration Standards.

### 3.3 Task Execution

Perform the following actions:
1. Execute Detailed Instructions sequentially, applying Guidance and relevant Rules from `{RULES_FILE}`, working toward the Objective.
2. When an instruction requires explicit User action, communicate what needs doing, why, and what options exist. Await completion, then resume.
3. When an instruction includes a subagent step, spawn the relevant subagent with a structured task description. Verify critical findings by reading key files the subagent references before integrating into execution. {WORKER_SUBAGENT_GUIDANCE}
4. When all instructions complete, communicate that implementation is complete and you are moving to validation. Continue to Task Validation.

### 3.4 Task Validation

Perform the following actions:
1. Execute autonomous checks from the Task Prompt's validation criteria per §2.2 Validation Standards: run tests, verify builds, confirm outputs exist and match expected structure. If any fail, continue to the correction loop. Ambiguous results: treat as failure and iterate; if iteration doesn't resolve, pause for guidance.
2. If criteria require User involvement: pause and present work per §2.2 Validation Standards. Communicate what was accomplished, what needs the User's review or action, where deliverables are located, and what to report back. If approved or completed, proceed to §3.6 Task Completion with Success status. If feedback provided, continue to the correction loop with feedback integrated.
3. If all criteria passed, proceed to §3.6 Task Completion with Success status.

### 3.5 Correction Loop

Perform the following actions:
1. Investigate the failure per §2.3 Iteration Standards: read error output, trace the cause, understand what went wrong.
2. Apply a single targeted fix based on your investigation, re-execute affected portions, and return to Task Validation.
3. If the correction does not resolve the issue, spawn a debug subagent per §2.3 Iteration Standards: provide the error output, what you investigated and attempted, relevant file paths, and expected vs actual behavior. Direct it to trace the root cause and propose a fix.
4. When the subagent returns, validate its findings - confirm the root cause and verify the fix. If sound, apply and return to Task Validation. If unresolved, present the situation to the User: what failed, what was investigated and attempted, current state, and options for proceeding. Upon User guidance, integrate the new direction or apply outcome status per `{GUIDE_PATH:task-logging}` §2.2 Outcome Standards and continue to Task Completion.

### 3.6 Task Completion

Perform the following actions:
1. Commit work to the assigned branch per §2.5 Version Control Standards.
2. Run the self-review once per §2.7 Self-Review Standards: stage your material, launch the applicable lenses, fix and commit what is plainly your defect, and rerun the validation each fix touches.
3. Present your assessment visibly in chat: whether all objectives are met and deliverables are ready, whether any important findings or compatibility issues arose, and the Task's outcome status per `{GUIDE_PATH:task-logging}` §2.2 Outcome Standards.
4. Create Task Log per `{GUIDE_PATH:task-logging}` §3.1 Task Log Procedure at `log_path`, including its `## Self-Review` section.
5. Settle the `## Spec Deltas` section per §2.2 Validation Standards: validate the delta when the section names a directory, or confirm `none - <reason>` still holds and report the deviation when it does not. A failing delta is a failing Task: correct it or report the failure, never report Success over it.
6. Update `handoff.md` per §2.6 Domain Continuity Standards.
7. Write Task Report and send the trigger back per `{GUIDE_PATH:task-logging}` §3.2 Task Report Delivery. If auto-compaction occurred and recovery was performed via `{SKILL_NAME:recover}`, note it in the Task Report.
8. Stop. The coordinator reviews the report and either sends a correction to this same session or releases it after merging. Do not start anything else, and do not act on the absence of a reply.

---

## 4. Common Mistakes

- *Framework vocabulary in project output:* Commit messages, source comments, and code should describe the actual work - not the framework managing it. Never surface Task IDs, Step numbers, agent identifiers, or APM terminology in project-facing output.
- *Skipping integration steps:* When dependency context includes file reading instructions and integration guidance, completing those steps fully before starting implementation catches mismatches early. Proceeding on assumptions about someone else's output - or about what an earlier session of your own domain did - leads to rework.
- *Leaving `handoff.md` as you found it:* A session that learned something the next one needs and wrote nothing down has thrown it away. Nothing else carries between sessions.
- *Fixing without investigating:* Attempting changes before understanding why the failure occurred. Read error output, trace the cause, and understand what went wrong first - otherwise each fix attempt is a guess that may compound the problem.
- *Continuing to iterate instead of delegating:* When a correction does not resolve the issue, the effective path is spawning a debug subagent with accumulated context rather than continuing in the main context. Each iteration consumes context budget and reduces reasoning quality - a subagent with fresh context is more effective.
- *Working non-incrementally:* Writing large deliverables in one pass without testing intermediate results. Build incrementally - compile, run, or validate after each meaningful step rather than producing everything and then discovering issues.
- *Logging Success with incomplete validation:* Marking a Task as Success when validation criteria were not fully exercised. If criteria cannot be met (missing resources, need User cooperation), log as Partial and explain what remains rather than claiming Success with caveats.

---

**End of Guide**
