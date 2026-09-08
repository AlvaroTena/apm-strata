# APM {VERSION} - Task Review Guide

## 1. Overview

**Reading Agent:** Manager

This guide defines how you review Task results, determine review outcomes, modify planning documents when findings warrant it, and maintain the Tracker.

### 1.1 Outputs

- *Stage summaries:* Appended to the Index after each Stage completion.
- *Updated Tracker:* Updated after each review cycle to reflect Task state changes, readiness changes, merge state, and coordination context.
- *Modified planning documents:* When findings warrant it - updated Spec, Plan, or Rules.

---

## 2. Operational Standards

### 2.1 Task Log Review Standards

Extract the information needed for the next review decision.

**Status interpretation:** Assess whether the status and flags are consistent with the log's body content - inconsistency is a hallucination indicator. Status values are Success (objective achieved, all validation passed), Partial (progress made, needs guidance), Failed (objective not achieved).

**Flag interpretation.** Workers set flags based on scoped observations. Interpret with full project awareness:
- `important_findings: true` - Worker observed something potentially beyond Task scope. Assess whether it affects planning documents or other Tasks. When findings indicate that validation criteria from the Task Prompt were not fully exercised, this warrants investigation before marking Done. Important findings may also include User corrections noted as potential Rules entries - assess whether they warrant a Rules addition per §2.3 Planning Document Modification Standards.
- `compatibility_issues: true` - Worker observed conflicts with existing systems. Assess whether it indicates Plan, Spec, or Rules issues.

**Content review:** Beyond flags and status, review the log body sections (Summary, Details, Output, Validation, Issues) to understand what happened and inform the review outcome. When findings contradict content in the Spec, Plan, or Rules - factual inaccuracies, incorrect assumptions, outdated descriptions - treat the affected document as needing correction per §3.4 Planning Document Modification regardless of whether the Worker handled the discrepancy.

### 2.2 Review Outcome Standards

After reviewing a Task Log, determine the review outcome.

**Review the log:** If everything looks good - Success status with no flags, log content supports the status - proceed to Task Tracking updates. If something needs attention - flags raised, non-Success status, or inconsistencies - investigate before proceeding.

**Investigation scope:** Investigate directly for contained checks; use a subagent for context-intensive issues. When scope is unclear, prefer subagent to preserve Manager context. When a subagent returns findings, verify critical claims by reading the key files it references before acting on them. {MANAGER_SUBAGENT_GUIDANCE}

**Post-investigation outcome:**
- If no issues are found (false positives, nothing actionable), continue to the next Task(s).
- If the Worker needs to retry with refined instructions, create a follow-up Task Prompt per `{GUIDE_PATH:task-assignment}` §3.4 Follow-Up Task Prompt Construction. If the Worker also left changes uncommitted, note this in the follow-up instructions.
- If planning documents need modification, proceed to §3.4 Planning Document Modification.
- If investigation reveals deficiencies in previously-Done work, create a new Task through Plan modification per §2.3 Planning Document Modification Standards. The original Task remains Done; reference it from the new Task, include the discovery context, and specify what needs correction.

Small contained actions (follow-ups for isolated issues, minor planning document corrections) can be executed immediately during the review cycle - present findings to the User for awareness after acting. When changes are significant enough to affect project direction or scope, pause for User approval per §2.3 Planning Document Modification Standards.

### 2.3 Planning Document Modification Standards

**Cascade reasoning:** Spec and Plan have bidirectional influence - changes to one may require adjustments in the other. Rules are generally isolated. When modifying any document, assess cascade implications before executing. Distinguish execution adjustments within design intent (no cascade) from design assumptions that proved incorrect (cascade warranted). When uncertain, assess the related document rather than assuming isolation.

**Modification authority:** Small contained changes are Manager authority (single Task clarification or correction, adding a missing dependency, isolated Spec addition, minor Rules adjustment). Significant changes require User collaboration (multiple Tasks affected, design direction change, scope expansion or reduction, new Stage or major restructure). Multiple small modifications that together represent significant change require User collaboration. When authority is unclear, prefer User collaboration.

### 2.4 Session Coordination Standards

Several Worker sessions run at once and their reports arrive on their own. Coordinate asynchronously.

**Stop on arrival.** A report means that session's attempt is finished. Stop the session before anything else: it stops consuming resources and keeps its conversation, and resuming a session that is still running produces a copy instead. Stopping is a prerequisite for the correction step, not a courtesy.

**Immediate reassessment:** After processing each report, reassess readiness and continue to dispatch assessment in the same turn, within the Stage the User already approved. The only reasons to pause are when no Tasks are Ready or when a modification requires User collaboration per §2.2 Review Outcome Standards.

**Async report handling:** Reports arrive in any order. Process each as it comes - stop the session, complete the review, merge if needed, reassess readiness, dispatch newly Ready Tasks.

**Brief the User after each review.** Say what the Task produced, what the review concluded, and what happens next. This is a report, not a request: proceed in the same turn. The Task's session stays stopped but alive until the next cycle per §2.5 Merge Standards, so a correction the User calls for after reading the brief still goes to that session per `{GUIDE_PATH:task-assignment}` §3.4 Follow-Up Task Prompt Construction. Say so in the brief when the Task is one the User may want to change.

**Wait state:** When no Tasks are Ready but sessions are still working, say what was processed and what is outstanding. Nothing is required of the User - the remaining reports arrive by themselves.

### 2.5 Merge Standards

Merge state is a dispatch prerequisite. Merge completed feature branches into the base branch at specific coordination points.

**Merge timing:** After successful Task Review, merge the completed branch. Before dependent dispatch, merge if the dependent Task needs the completed Task's output. At Stage end, all current-Stage feature branches must be merged.

**Merge execution:** Clean merges require no User intervention. Perform merges autonomously - switch to the base branch (`git checkout <base-branch>`), merge the completed branch (`git merge <branch-name>`), then verify.

**Conflict resolution:** Resolve using coordination-level context - knowledge of both Tasks' objectives, project design, and the Spec. For complex conflicts, spawn a debug subagent or escalate to the User.

**Branch protection adaptation:** If the base branch has protection rules preventing direct merges, adapt (create a PR, merge into an intermediate branch, or ask the User). Discovered reactively and noted in working notes.

**Merge promptly, release later.** Merging is a dispatch prerequisite, so merge as soon as the review passes. Releasing is not urgent and deletes the session, so hold it: release the sessions freed by earlier merges at the start of the next dispatch cycle, and sweep whatever remains at Stage end.

The reason is the brief. The User reads what the Task produced only after the review, and may call for a correction. That correction goes to the Task's own session, which still holds the context of the attempt - so a session released in the same breath as the merge takes that option away before the User ever had it. A merged Task whose session is still around costs a worktree; a released one costs a fresh session and a cold start.

Releasing a session refuses unless its worktree is clean and its commits are on a remote. Which path applies depends on the project:

- *With a remote:* push the Task branch, then release the session by its short id. Nothing is discarded.
- *Without a remote:* merge first, then release with the discard option, passing the exact value the refusal message prints. This throws away the worktree's commits, which is safe only because the merge already carried them to the base branch. Never use it before merging.

If a release is refused for uncommitted changes, look for an untracked `.apm` link - the ignore entry must be `.apm` with no trailing slash per `{GUIDE_PATH:task-assignment}` §2.5 Version Control Standards.

**Branch cleanup:** releasing a session deletes no refs. Two branches survive it - the Task branch and the branch the launch created alongside the worktree - and both are deleted separately. During Stage-end sweeps, batch the deletions into a single terminal invocation.

### 2.6 Stage Summary Standards

Stage summaries are the historical record of what happened during the Stage - written for future incoming Manager instances (after Handoff) and project retrospectives. They capture the Stage's coordination history and absorb Stage-specific observations from working notes during distillation. Write as descriptive prose covering outcome, agents involved, notable findings, patterns, and key decisions - point to commits where relevant. Implementation details belong in Task Logs, not here - but when working notes captured important events that involved implementation specifics, those are part of the Stage's history and belong in the summary. Follow with a Task Log reference list for deeper detail. Keep concise - coordination-ready context, not comprehensive documentation. Do not duplicate Memory notes as a separate section.

### 2.7 Note-Taking Standards

Notes capture context that falls outside structured tracking but aids coordination and continuity. Two categories serve different purposes:

**Working Notes (Tracker):** Coordination context accumulated during the Stage - pending considerations, User preferences, temporary constraints, technical observations, patterns noticed during reviews. Insert when a review yields note-worthy context. Remove items that are no longer applicable as the Stage progresses. At Stage end, all working notes are distilled into two destinations per §3.5 Stage Summary Creation (Stage summary prose per §2.6 Stage Summary Standards and Memory notes).

**Memory Notes (Index):** Observations with lasting impact on future Stages, coordination, or assignments - User preferences, operational principles, architectural insights, patterns that shape upcoming decisions. Not all working notes become Memory notes. Implementation details and Stage-specific observations belong in the Stage summary, not in Memory - they are historical, not forward-looking.

Use a bulleted list for both types - one item per note, each self-contained and understandable without surrounding context.

### 2.8 Stage Verification Standards

After all Tasks in a Stage are Done, assess whether the Stage's deliverables require holistic verification before writing the Stage summary and proceeding. This is a judgment call, not a mandatory step.

**When to verify:** Stages where the User confirmed verification during the understanding summary approval, where Task Reviews surfaced edge cases or compatibility concerns, where follow-up prompts were required during the Stage, where Workers reported difficulties or important findings, where the Planner flagged complexity in Plan notes, or where accumulated working notes suggest deliverables should be checked as a whole. Simple Stages with clean Task Reviews and no flags can proceed directly to the summary.

**How to verify:** Re-run the most important validation checks Workers already performed, exercise edge cases that individual Task validation may not have covered, run holistic end-to-end checks across the Stage's deliverables, and read source files, artifacts, or data to confirm the codebase is in the expected state. Verification should match the validation patterns established in the project - the same kinds of checks at the integration level. For context-intensive checks, dispatch a verification subagent and verify its findings against the referenced files before acting on them.

**When verification reveals issues:** Determine the appropriate response based on scope. For contained issues you can resolve directly, fix them. For issues requiring focused investigation, dispatch a subagent. For issues requiring Worker-level execution, create a new Task through Plan modification per §2.3 Planning Document Modification Standards. For issues whose scope or direction is unclear, present findings to the User with your assessment and proposed options. When verification requires User judgment or action, present findings and pause.

### 2.9 Non-APM Agent Reports

When a report arrives from an agent not listed in Worker tracking, it is a non-APM agent that joined the session independently. These reports do not follow the standard processing flow - there is no Task Log, no Worker tracking entry, and no dispatch state to update. Assess the report on its own terms: what the agent did, whether it affects planning documents or current dispatch. Add a working note to the Tracker recording the agent's identity and contribution. Inform the User of the findings. If follow-up work is needed, assign it per `{GUIDE_PATH:task-assignment}` §2.7 Non-APM Agent Dispatch.

---

## 3. Task Review Procedure

Three sequential steps per report (processing, log review, outcome determination), with conditional branches for planning document modification and Stage summary creation. Update the Tracker after each cycle.

### 3.1 Report Processing

Execute when a Worker session's trigger names its Report Bus, or when the User retrieves a report by hand with `{SKILL_NAME:review}`.

Perform the following actions:
1. Read the APM_RULES block from `{RULES_FILE}`, or from `CLAUDE.md` when that file does not contain it.
2. Read the report from the Report Bus (`.apm/bus/<agent-slug>/report.md`).
3. Stop the reporting session by its short id per §2.4 Session Coordination Standards.
4. Check for Handoff indication - look for a statement that the Worker is a new instance and a list of current-Stage Task Logs read. When previous Stages exist, the report also notes that previous-Stage logs were not loaded. If detected, verify the Handoff Log exists. Update Worker tracking in the Tracker: increment the instance number for this Worker. Compare the loaded Task Logs against all Tasks previously completed by this Worker and record cross-agent overrides in the Tracker for any completed Tasks whose logs were not loaded. From this point forward, previous-Stage same-agent dependencies for this Worker are treated as cross-agent.
5. Check for auto-compaction indication - a Worker that recovered from auto-compaction notes it in the Task Report. If detected, update Worker tracking Notes in the Tracker (e.g., "auto-compacted, recovered"). No dependency reclassification - the Worker continues as the same instance. Provide slightly more comprehensive dependency context in future Task Prompts for this Worker.
6. Update dispatch tracking: mark this Worker as available, note completed Task(s) for readiness assessment.
7. Merge completed branch per §2.5 Merge Standards if dependent Tasks need it.

### 3.2 Task Log Review

Execute after report processing. Present your assessment of the Task Log visibly in natural language: whether the claimed status is consistent with evidence, whether flags indicate coordination-relevant findings, and what the appropriate next action is.

Perform the following actions:
1. Read the Task Log at the path referenced in the Task Report.
2. Interpret content per §2.1 Task Log Review Standards: status, flags, body sections. Assess consistency between status/flags and body content.
3. Continue to the review outcome.

### 3.3 Review Outcome

Execute after Task Log review.

Perform the following actions:
1. Review findings from the Task Log per §2.2 Review Outcome Standards. Assess deliverables against the Task's objectives and validation criteria before determining the outcome. If version control is active and the Task was successful but changes remain uncommitted on the Task branch, commit on behalf following the conventions from Rules - no follow-up needed. If everything looks good, skip to step 3. If something needs attention, continue to step 2.
2. Investigate and determine outcome per §2.2 Review Outcome Standards:
   - If no issues are found, continue to step 3.
   - If the Worker needs a follow-up, create a follow-up Task Prompt per `{GUIDE_PATH:task-assignment}` §3.4 Follow-Up Task Prompt Construction and continue to step 3.
   - If planning documents need modification, proceed to §3.4 Planning Document Modification (returns to step 3 after completion).
3. Update the Tracker per §4.1 Task Tracking Format: mark completed Tasks as Done, reassess Waiting Tasks for readiness, update branch and session state. Execute pending merges per §2.5 Merge Standards before reassessing readiness, and release the sessions that earlier merges already freed. Assess whether the review yielded note-worthy context and add to working notes - both ephemeral coordination items and durable observations for later distillation. Remove stale working notes. Batch all changes from this review-dispatch cycle into a single Tracker edit.
4. Brief the User on this Task per §2.4 Session Coordination Standards, then assess next action:
   - If all Stage Tasks are Done and merged, collapse Stage per §4.1 Task Tracking Format and proceed to §3.5 Stage Summary Creation.
   - If Tasks are Ready, proceed to `{GUIDE_PATH:task-assignment}` §3.1 Dispatch Assessment in the same turn.
   - If no Tasks are Ready but sessions are still working, state the wait per §2.4 Session Coordination Standards and end the turn.

### 3.4 Planning Document Modification

Execute when the review outcome identifies that planning documents need modification. Always triggered from §3.3 Review Outcome.

Perform the following actions:
1. Capture triggering context: which Task Log revealed the findings, what specific findings indicate modification, Task status and flags, post-investigation outcome.
2. Apply §2.3 Planning Document Modification Standards: assess affected documents, analyze cascade implications, determine authority scope.
3. If any modification is significant enough to require User input, present concisely: what triggered it, what needs to change, why it exceeds what you can decide alone, options with trade-offs, and your recommendation. Integrate User guidance.
4. Execute modifications following existing document patterns per §4.5 Planning Document Modification Guidelines. Verify consistency: reference integrity across documents (same data descriptions match), terminology consistency, scope alignment between the Spec and Plan. When correcting the Spec, check whether the Plan references the same content and update accordingly.
5. When modifying Plan Tasks (adding, removing, or changing dependencies), update the Dependency Graph per §4.5 Planning Document Modification Guidelines.
6. Document: update `modified` field in Spec and/or Plan YAML frontmatter per §4.4 Modification Log Format.
7. Proceed to §3.3 Review Outcome step 4 to update tracking. Reassess readiness against the updated Plan and proceed accordingly.

### 3.5 Stage Summary Creation

Execute when all Tasks in a Stage are Done. A Task is Done when the review concludes with no outstanding follow-ups. Write the Stage summary once, after all follow-up cycles finish.

Perform the following actions:
1. Enumerate Task Logs for the completed Stage using a directory listing, e.g., `ls .apm/memory/stage-<NN>/` (or platform equivalent). Synthesize from logs already reviewed during individual Task Reviews - re-reading is not needed when logs are unchanged and still in context.
2. Assess whether Stage verification is needed per §2.8 Stage Verification Standards. When warranted, verify before proceeding.
3. Distill working notes per §2.7 Note-Taking Standards: observations with lasting impact on future work become Memory notes in the Index, Stage-specific observations become Stage summary prose. Keep working notes that will be needed in the next Stage. When this review immediately triggers Stage summary (last Task in Stage), observations from this review can be written directly to their destinations rather than first passing through working notes.
4. Synthesize Stage-level observations and append a Stage summary to the Index per §4.3 Index Format. The Index structure (Memory notes above Stage summaries) enables steps 3 and 4 as a single contiguous edit.

---

## 4. Structural Specifications

### 4.1 Task Tracking Format

The Task Tracking section within the Tracker tracks Task statuses, agent assignments, branch state, and live sessions per Stage. Update after each review cycle.

**Location:** `## Task Tracking` section of `.apm/tracker.md`.

**Format:**
```markdown
**Stage 1:** Complete

**Stage 2:**

| Task | Status | Agent | Branch | Session |
|------|--------|-------|--------|---------|
| 2.1 | Done | frontend-agent | | |
| 2.2 | Active | backend-agent | feat/backend-models | 8ca4fa63 / 8ca4fa63-975f-4a49-8431-2a9e4a6f1c09 |
| 2.3 | Active | frontend-agent | feat/frontend-auth | 27423fb8 / 27423fb8-1c0e-4d77-9a52-0b3e6f5d8a41 |
| 2.4 | Waiting: 2.1 | backend-agent | | |
| 2.5 | Ready | frontend-agent | | |
```

**Session column:** both identifiers for the Task's session, short id first, separated by ` / `. They are not interchangeable - the short id stops and releases the session, and only the full id resumes it. Write them at dispatch, before anything can go wrong: a session whose full id was never recorded cannot be resumed for a correction, and an incoming Manager has no way to recover it. Empty means no live session for that Task.

**Task statuses:** `Ready`, `Active`, `Done`, `Waiting: <deps>`.

**Task lifecycle:**
- `Waiting: N.M` - dependencies not met. May list multiple dependencies.
- `Ready` - all dependencies complete, can be dispatched.
- `Active | branch-name` - dispatched, Worker is on a branch.
- `Done | branch-name` - reviewed, branch pending merge.
- `Done` (no branch) - merged.

Write the end state of each Task for the review-dispatch cycle. When a Task is unblocked and dispatched in the same turn, write directly from Waiting to Active. When a Task is unblocked but cannot be dispatched - the assigned Worker has an Active Task or a pending report would unlock a better dispatch per `{GUIDE_PATH:task-assignment}` §2.4 Dispatch Standards - write Ready.

**Cleanup:** Clear the Branch column when the branch is merged. Clear the Session column only when the session is released, which happens a cycle later per §2.5 Merge Standards - until then the row shows a Done Task with a live session, which is what makes a late correction possible.

**Stage collapse:** When all Tasks in a Stage are Done with no branches or sessions remaining, replace all Task rows with `**Stage N:** Complete`.

**Batch edits:** Task ID column guarantees edit tool uniqueness for targeting individual rows. When multiple rows or working notes change in the same review-dispatch cycle, batch all Tracker updates into a single edit.

### 4.2 Tracker Format

**Location:** `.apm/tracker.md`

**YAML Frontmatter Schema:**
```yaml
---
title: <project name>
completed_at: <datetime>  # set by Manager at project completion - absence means in-progress, ISO 8601 UTC
---
```

**Tracker sections:**
- *`## Task Tracking`:* Per-Stage Task state per §4.1 Task Tracking Format.
- *`## Worker Tracking`:* Records Worker states, instance numbers, and coordination notes. Update Worker tracking when Workers are first dispatched to, when Handoffs are detected, and when auto-compaction recovery is reported. Cross-agent overrides are recorded below the Worker table when Worker Handoffs reclassify dependencies, listing the specific Tasks affected and referencing the Handoff that triggered the reclassification.
- *`## Version Control`:* Per-repository base branch, branch convention, and commit convention per `{GUIDE_PATH:task-assignment}` §4.4 Tracker VC Entry Format. Branch state is tracked per-Task in the Task table's Branch column.
- *`## Working Notes`:* Ephemeral coordination context per §2.7 Note-Taking Standards. Contents are inserted and removed as context evolves.

**Worker Tracking Table:**
```markdown
| Agent | Instance | Notes |
|-------|----------|-------|
| frontend-agent | 2 | Handoff after Stage 1 |
| backend-agent | 1 | |
```

**Cross-Agent Overrides** (below Worker Tracking table, when applicable):
```markdown
**Cross-Agent Overrides:**
- frontend-agent: Tasks 1.1, 1.3 (pre-Handoff) - treat as cross-agent
```

### 4.3 Index Format

**Location:** `.apm/memory/index.md`

**YAML Frontmatter Schema:**
```yaml
---
title: <project name>
---
```

**Index sections:**
- *`## Memory Notes`:* Durable observations per §2.7 Note-Taking Standards. Patterns, preferences, and insights that persist across Handoffs.
- *`## Stage Summaries`:* Appended after each Stage completion. Each entry:
```markdown
### Stage <N> - <Stage Name>

[Prose summary: outcome, agents involved, notable findings, patterns, key commits]

**Task Logs:**
- task-<NN>-<MM>.log.md
- task-<NN>-<MM>.log.md
```

### 4.4 Modification Log Format

Update the `modified` field in YAML frontmatter when modifying the Spec or Plan:
```yaml
modified: Task 2.3 scope clarified based on task-02-02.log.md findings. Modified by the Manager.
```

### 4.5 Planning Document Modification Guidelines

**Spec:** Maintain existing section structure. Add content under relevant headings. Use `##` for top-level categories. Keep specifications concrete and actionable - design decisions that affect what is being built and apply across multiple Tasks. Task-specific details belong in Task guidance, not here.

**Plan:**
- *Adding Tasks:* Insert under the appropriate Stage, maintain numbering sequence, specify all fields (Objective, Output, Validation, Guidance, Dependencies, Steps).
- *Modifying Tasks:* Preserve existing structure, update only affected fields.
- *Removing Tasks:* Delete the Task section AND update any other Tasks that referenced it as a dependency.

**Rules:** Modifications stay within the `APM_RULES {}` block. Use `##` headings for categories. Only add genuinely universal patterns.

**Dependency Graph:** When Task dependencies change, regenerate the relevant graph section. Same-agent dependencies use `-->`, cross-agent use `-.->`. Update node styles if agents change.

---

## 5. Common Mistakes

- *Status inconsistency:* When a Worker claims Success but the log body shows incomplete validation, unresolved issues, or missing deliverables, treat the content as authoritative over the status field and investigate before accepting.
- *Accepting insufficient reports:* Marking Tasks as Done when validation criteria were not fully exercised or deliverables are partial. Push back with a follow-up Task Prompt before accepting.
- *Skipping Handoff detection:* Failing to track Worker Handoff leads to incorrect dependency context treatment.
- *Unacknowledged recovery:* When a Worker report indicates auto-compaction occurred, factor this into the assessment - reconstructed context may have affected report completeness.
- *Single-document tunnel vision:* Updating the Spec without checking whether the Plan references the same content, or modifying the Plan without assessing whether the Spec's design assumptions still hold. Changes to one planning document often cascade to the other.
- *Symptom treatment:* Modifying one document to work around an issue that should be addressed in another. When an issue surfaces in execution, trace it to the document where the root cause lives rather than patching around it elsewhere.

---

**End of Guide**
