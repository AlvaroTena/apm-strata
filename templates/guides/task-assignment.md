# APM {VERSION} - Task Assignment Guide

## 1. Overview

**Reading Agent:** Manager

This guide defines how you construct and deliver Task Prompts for Workers, manage version control workspace isolation, and coordinate bus-based delivery. Task Prompts are self-contained - Workers receive everything needed to execute a Task without referencing the Spec or Plan.

### 1.1 Outputs

- *Task Prompt:* Content written to a Task Bus for a Worker session to read.
- *Follow-up Task Prompt:* Refined prompt when the review outcome determines retry.
- *Worker session:* One background session per Task, in its own worktree, launched at dispatch and released after merge.
- *Task branch:* One branch per Task, cut from the base branch by the Worker.

---

## 2. Operational Standards

### 2.1 Dependency Context Standards

Tasks may depend on outputs from previous Tasks. Every Task runs in a session that starts empty, including Tasks whose dependencies an earlier session of the same Worker produced. Write comprehensive context for every dependency - explicit file reading instructions, output summaries, integration guidance. Assume nothing, and do not vary the depth by who produced the work.

**Domain context is the Worker's own.** What carries across a Worker's sessions lives in that Worker's `handoff.md`, which each session reads before it starts. That file is one session's note to the next and is not a substitute for dependency context, which you construct in the prompt.

**Dependency identification:** Check the Task's Dependencies field in the Plan. "None" indicates no dependencies. Which Worker produced a dependency matters for reading the dependency graph and for ordering merges, not for how much context you write.

**Chain reasoning:** Dependencies may have their own dependencies. Trace upstream when ancestors established patterns, schemas, or contracts the current Task must follow. Stop tracing when an intermediate node fully abstracts what came before. When uncertain whether an ancestor is relevant, include rather than risk missing critical context.

### 2.2 Task Prompt Content Standards

Task Prompts must be self-contained. Workers have the same tools as any agent but are intentionally scoped to their Task Prompt, Rules, and accumulated working context to keep them focused on execution. You enforce this scoping by extracting relevant content from the Spec, Plan, and authoritative sources into each prompt rather than referencing those documents by path. Never reference the Spec, Plan, Tracker, or Index by path - Workers should not read them. Task Prompt instructions and objectives do not reference Stage numbers, other Task IDs, or coordination-level concepts (dependency context sections reference producer Tasks by ID as needed). Validation criteria are Worker-scoped.

**Embed** content the Worker cannot discover from the codebase alone: design decisions and constraints from the Spec, Task definitions and guidance from the Plan, Task-relevant coordination context from the Tracker, observations from the Index, corrected findings from previous Tasks, and content from authoritative User documents the Spec references. Preserve specificity with exact constraints, not summaries. Present all embedded content as direct factual context. Never attribute content to its source artifact or use coordination-level vocabulary - Workers should not be aware of the Spec, Plan, Tracker, Index, or Memory - surfacing these concepts breaches their execution-focused scope.

**Reference with reading instructions** content that exists in the codebase: source files, existing patterns, configurations. Point the Worker to specific files and what to look for in them - the Worker reads them directly from their workspace. This applies to both dependency context and Spec content that references codebase patterns. The Manager identifies which files matter and what to look for, rather than embedding their contents.

**Exclude** content relating to other domains, providing background without actionable requirements, or already captured in the Task's Guidance field.

### 2.3 Follow-Up Standards

Follow-up Task Prompts occur when the review outcome determines retry after investigation. You arrive with: original Task Log findings, investigation results, understanding of what went wrong, and potentially modified planning documents.

**Content principle:** The follow-up is a new prompt - Objective, Instructions, Output, and Validation are refined based on what went wrong. Do not copy the previous prompt. The Worker operated with scoped context; your follow-up bridges the gap between what the Worker saw and what you now know from investigation, other Task completions, and planning document updates. Give the Worker concrete direction rather than restating the original Task Prompt.

**Log path continuity:** Use the same `log_path` as the original. The Worker overwrites the previous log. The Manager captures iteration patterns in Stage summaries when relevant.

### 2.4 Dispatch Standards

Before constructing individual Task Prompts, assess dispatch opportunities across Ready Tasks.

**Task readiness:** A Task is Ready when all its dependencies are Done. Read the Tracker for current statuses; cross-reference the Dependency Graph for newly unblocked Tasks.

**One Task, one session.** The dispatch unit is a single Task. Each dispatched Task gets its own background session in its own worktree, so two Ready Tasks assigned to the same Worker are dispatched as two sessions rather than queued behind one another. There are no dispatch modes to choose between and nothing to group.

**Session naming:** `<slug>-<stage>.<task>`, for example `build-agent-1.2`. The same string names both the session and its worktree.

**Two identifiers per session.** Launching prints a short id; the full session id is read with `claude agents --json`. They are not interchangeable: the short id addresses `attach`, `logs`, `stop` and `rm`, and only the full id resumes a session. Record both in the Task row's Session column at dispatch, because a resume attempted with the short id starts a copy that has lost the worktree.

**Concurrency:** keep 3-4 sessions running at once. Beyond that, review latency grows faster than throughput and merge order gets harder to hold.

**Version control prerequisite:** version control must be initialized, which happens during first Manager initiation per `{SKILL_PATH:apm.manage}` §2.1 First Manager Initiation. Dispatch depends on it - a Task branch and a worktree cannot exist without it.

**Tool approvals are a prerequisite, not an optimization.** A dispatched session runs with nobody watching it. If it reaches for a tool the project has not approved, it stops on a prompt that no one can answer: it does not fail, it waits, and the only visible symptom is a report that never arrives. Before the first dispatch of a session, confirm with the User that the tool surface Workers need is pre-approved for this project. A session found waiting rather than working is the first thing to check.

**Dispatch plan approval.** At the start of each Stage, present the Stage's dispatch plan and wait for the User: which Tasks go out, to which Workers, in what order, and how many run at once. Dispatch nothing until the User approves. Within an approved Stage, dispatch newly Ready Tasks as reviews free them without asking again - the gate is per Stage, not per Task.

**Wait state:** When no Tasks are Ready but sessions are still working, say what was processed and what is outstanding. Nothing is required of the User here; reports arrive on their own.

### 2.5 Version Control Standards

Every Task works in its own worktree, and you coordinate all merges during Task Review. When multiple repositories are listed in the Tracker's Version Control table, identify which repository each Task operates in from the Spec's Workspace section. If the User initially declined version control but later requests it mid-session, initialize it: run `git init` if needed, detect or confirm the base branch, establish conventions with the User, update Rules and the Tracker, then proceed with dispatch.

**Branch standards:** Every Task gets its own branch off the base branch per the branch convention in the Tracker, cut by the Worker inside its worktree. APM terminology (Task IDs, Stage numbers, agent identifiers) does not appear in branch names, commit messages, or worktree directory names - these reflect the actual work, not the framework managing it.

**Worktree standards:** Create the worktree yourself, before the launch, at `<checkout>/.claude/worktrees/<session name>` on a branch named `worktree-<session name>` cut from the base branch. The launch then opens it instead of creating one, because a `--worktree` name whose directory already exists reuses that directory, and it locks the worktree while the session runs. Creating it first is what lets the bundle below be in place before the session resolves its first skill; a worktree the launch creates exists only once the session has already started. The Worker cuts its own Task branch from the base inside it, so the `worktree-` branch is never worked on.

**Do not relocate the worktree.** Rules reach a session by walking up from its working directory, and that path lies below the checkout root only because the worktree sits under `.claude/worktrees/`. A worktree placed anywhere else does not see Rules at all, and nothing reports the omission.

**Bundle access:** the worktree has only tracked files, so the installed bundle - role skills, guides, agents, hook scripts - is missing from it, and a session launched there fails its launch prompt with `Unknown skill`. Copy the bundle in before the launch. Read `installedFiles.claude` in `.apm/metadata.json` and reduce each path to its first entry below a `.claude/` subdirectory - `.claude/skills/<skill>`, `.claude/agents/<file>`, `.claude/apm-guides/<file>`, `.claude/apm-hooks/<file>` - once each. For every entry absent from the worktree, create its parent directory there and copy the entry from the checkout to the same relative path. An entry already present came from git, which means the project versions it: leave it alone. Copy rather than link: a link resolves outside the worktree, and every read through it stops on a permission prompt that no one in a background session answers. Work at entry level, never a whole subdirectory and never `.claude` itself - a project may keep its own skills or agents beside the bundle's, and `.claude` holds `worktrees/`, so a copy of it would carry every other session's worktree and a link to it would contain itself. The copy is a snapshot for one Task: a session that outlives a bundle update keeps the version it started with.

Treat `.claude/settings.json`, `.claude/settings.local.json` and `{RULES_FILE}` the same way: copy each one that exists in the checkout and is absent from the worktree. The Worker's first step reads the Rules block, and a Rules file that stays in the checkout is a read outside the worktree. `settings.json` carries the dispatch gate's declaration, and a session without it runs ungated. When the project versions `settings.json`, the worktree gets the committed copy, so the gate reaches Workers only once its declaration is committed.

**Ignore entries for the copies:** append each copied entry's path to the repository's shared exclude file, the `info/exclude` under `git rev-parse --git-common-dir`, anchored with a leading `/` and without a trailing slash, skipping lines already present. That file applies to the checkout and every worktree without a commit. An entry git reports as untracked leaves the worktree dirty, and a dirty worktree blocks its release. After copying, `git status --porcelain` in the worktree prints nothing.

**Bus access:** the Worker reaches the bus through a mailbox, a real `.apm/` directory inside its worktree, per `{SKILL_PATH:apm-communication}` §4.5 Worktree Mailbox. Never link `.apm` into the worktree: the session is isolated there, and the platform refuses every file edit that resolves into the main checkout, so a Worker behind a link cannot write its Task Log or its report. Fill the mailbox before the launch, from the shared `.apm/` and by terminal copy, with everything that section lists as inward. Add `/.apm` to the exclude file with the copies above. If a Worker needs other untracked assets, note this in the Task Prompt.

**Lifecycle:** short-lived. The worktree is created at dispatch and released after the Task's branch is merged, per `{GUIDE_PATH:task-review}` §2.5 Merge Standards.

### 2.6 Delivery Standards

Bus directories and files are created by the Planner during the Planning Phase - do not re-create them. A Worker writes its report into the Report Bus in its session's mailbox, which starts empty at dispatch; before a follow-up, clear that one via terminal (e.g., `truncate -s 0` or shell redirection). The shared `.apm/bus/<agent-slug>/report.md` is not part of a Worker's cycle - reports are collected to a per-Task path per `{SKILL_PATH:apm-communication}` §4.5 Worktree Mailbox - and carries only reports from non-APM agents. Read the Task Bus before writing to it per `{SKILL_PATH:apm-communication}` §4 Message Bus Protocol. One Task Bus message carries one Task Prompt.

**The bus is the source of truth and the trigger is only a pointer.** Write the prompt to the bus first, then send the fixed trigger text per `{SKILL_PATH:apm-communication}` §4.4 Trigger Messages. A trigger carries no Task content and never asks the session to run a skill. If a trigger is lost, the prompt is still on the bus and the Worker's manual fallback retrieves it.

### 2.7 Non-APM Agent Dispatch

When a non-APM agent has joined the session and you need to assign follow-up work to it, write a plain assignment to its Task Bus - not a full Task Prompt. Include what to do and what to produce, and instruct it to report back. The dispatch gate guards every Task Bus, so the assignment still carries a `## Spec Deltas` section per §2.8 Spec Delta Standards - `none - <reason>` or the validated delta directory - or the gate refuses a legitimate assignment. Do not include log paths, logging instructions, or Handoff metadata - non-APM agents do not log to Memory or participate in Worker tracking.

### 2.8 Spec Delta Standards

Every Task Prompt carries a section headed `## Spec Deltas`. The section always exists; what the Task decides is its content. Its first non-empty line takes one of two literal forms:

- `none - <reason>` when the Task builds something new from nothing. The reason says what it builds and is never empty.
- `.apm/openspec/<change>/changes`, the directory you validated, when the Task changes something that already exists - code, a document, configuration. That directory exists in the shared `.apm/` before you write the Task Bus. The rest of the section gives the baseline's path and repeats the delta.

**When in doubt, write the delta.** A Task that touches a file which already has behaviour changes something existing, however small the edit. `none` is a claim that nothing existing changes, not a default: the dispatch gate refuses a Task Bus write whose prompt lacks the heading, whose `none - ` carries no reason, or whose directory does not exist. The delta and the baseline it is checked against are files you write before the prompt.

**Layout.** Each change owns one directory under `.apm/openspec/`, holding its baseline and its delta:

```text
.apm/openspec/<change>/
  specs/<capability>/spec.md                    <- baseline: what is true today
  changes/<change>/specs/<capability>/spec.md   <- delta: what this change does to it
```

Nothing creates `.apm/openspec/` in advance - the first Task that carries a delta creates it. The validator pairs a delta with the baseline by mirroring the path around the last `changes` segment, so the two halves stay inside the change's directory and no other change reads them.

**Naming.** `<change>` is the Task branch name with each `/` replaced by `-` - `fix/slot-overlap` becomes `fix-slot-overlap` - so it is unique while the branch lives, and the Worker derives it from its own Workspace section. `<capability>` is the kebab-case stem of the file, module or command whose behaviour the requirements describe - `src/booking/slots.js` gives `slots`. One subdirectory per capability the change touches, with the same name under both halves.

**Baseline.** Write it before the delta whenever the delta modifies or removes a requirement and `.apm/openspec/<change>/specs/<capability>/spec.md` does not exist yet. It describes the current behaviour of what the change touches, not the project: exactly the requirements the delta's `MODIFIED` and `REMOVED` blocks name, and no others. Read each one from the code or document on the base branch in the repository, not from memory and not from the Spec - the baseline states what is true now, the Spec what was intended. Give each requirement `SHALL` or `MUST` and every scenario the code currently handles, under `#### Scenario:` headings. The validator checks the delta, not the baseline: a baseline scenario at the wrong depth is not counted, and the completeness rule then misses a delta that drops it. A delta with only `ADDED` blocks needs no baseline. When the touched behaviour takes more than five requirements to describe, the Task changes too much for one delta - raise it as a plan change rather than writing a longer baseline. A follow-up keeps the baseline its change started with.

**After merge.** The baseline belongs to its change and goes with it: once the Task branch is merged, delete `.apm/openspec/<change>/` whole. Do not fold the delta into the baseline or keep the baseline for the next change - after the merge it describes code that no longer exists, and the next change writes its own from the code it touches. A directory left behind by a merged change is clutter, not a hazard, because nothing outside the change reads it.

**Format.** Literal - the headings are the contract, not decoration:

````markdown
## ADDED Requirements
### Requirement: <name>
The system SHALL <behaviour>
#### Scenario: <name>
- **WHEN** <condition>
- **THEN** <expected outcome>

## MODIFIED Requirements
### Requirement: <exact name of the existing requirement>
<the complete requirement block, with every one of its scenarios>

## REMOVED Requirements
### Requirement: <name>
**Reason**: <why it is being removed>
**Migration**: <what replaces it, or how callers move off it>
````

**Four rules:**

- The text after `### Requirement:` is the matching key, and it is case-sensitive. A key that does not match an existing requirement exactly matches nothing at all.
- `#### Scenario:` takes exactly four hashes.
- Every requirement states `SHALL` or `MUST`.
- **`MODIFIED` replaces the whole block.** Copy the requirement complete, with every scenario it already has. Omitting an existing scenario is an error, not an abbreviation - this rule is the only thing standing between a routine edit and quietly deleting a scenario nobody meant to touch.

**Validation.** Validate the delta before writing the prompt, using the command the project declares under `## Deltas` in `{RULES_FILE}`. When no such block is declared, use `apm delta validate .apm/openspec/<change>/changes`. Point it at the `changes` directory, never at the change directory or `.apm/openspec/`: the validator checks every `spec.md` below the path it is given, reads a baseline as a delta with no operation group, and fails it. Take the command from the declaration rather than writing it into the procedure: what the procedure requires is that the delta validate clean, and a project that swaps the tool then changes one line and nothing else. A delta that fails is fixed before dispatch - never dispatched with a note about it.

A delta that passes matching but names a requirement that does not exist is the failure this guards against. It reports clean in some tools while the change lands on nothing, so treat an unexpected clean result on a `MODIFIED` block as a reason to confirm the key by eye against the spec.

---

## 3. Task Assignment Procedure

Dispatch assessment followed by per-Task analysis and prompt construction for each Task in the dispatch plan. Follow-up prompts use a separate construction path when a review outcome requires retry.

### 3.1 Dispatch Assessment

Assess dispatch opportunities from current project state per §2.4 Dispatch Standards. Present the assessment visibly in chat under the header **Dispatch Assessment:** covering which Tasks are Ready, what dependency relationships exist among them, and how many sessions to run at once. Each dispatch cycle is a fresh assessment.

Perform the following actions:
1. Read the APM_RULES block from `{RULES_FILE}`, or from `CLAUDE.md` when that file does not contain it.
2. Identify Ready Tasks from the Tracker. Cross-reference the Dependency Graph for newly unblocked Tasks.
3. Order Ready Tasks by how much downstream work each unblocks, and choose how many to dispatch now within the concurrency guidance in §2.4 Dispatch Standards.
4. If this is the Stage's first dispatch, present the Stage's dispatch plan and wait for the User's approval per §2.4 Dispatch Standards. Launch nothing before it arrives. Within a Stage the User already approved, continue without asking again.
5. For each Task in the dispatch plan, continue to per-Task analysis.

### 3.2 Per-Task Analysis

Execute for each Task in the dispatch plan.

Perform the following actions:
1. Read the Task's Dependencies field from the Plan. If "None," skip dependency context steps.
2. For each dependency, trace upstream when ancestors established patterns, schemas, or contracts this Task must follow, per §2.1 Dependency Context Standards. Context depth does not vary with who produced the dependency.
3. Read each unique producer Task Log and note key outputs, file paths, and integration details. When several Tasks in this dispatch cycle share a producer, read that log once and reuse it from context.
4. Extract Spec content relevant to this Task per §2.2 Task Prompt Content Standards. The Spec is in context from session start and refreshed on any modification. A fresh read is warranted at the start of a new Stage's first dispatch; per-Task re-reads of an unchanged Spec are not needed.
5. Extract Task definition fields from the Plan: Objective, Steps, Guidance, Output, Validation. When Guidance references Spec sections, resolve those references and extract the referenced content per §2.2 Task Prompt Content Standards. Transform steps into actionable instructions, incorporating Guidance and relevant Spec content.

### 3.3 Task Prompt Construction

Assemble the Task Prompt and deliver via the Message Bus.

Perform the following actions:
1. Construct YAML frontmatter per §4.1 Task Prompt Format.
2. Name the Task branch per the convention in the Tracker. The Worker cuts it inside its worktree; you do not create it here.
3. Decide whether the Task changes anything that already exists - code, a document, configuration - and write the `## Spec Deltas` section per §2.8 Spec Delta Standards:
   - If it does, name the change from the branch and each capability, write any missing baseline from the base branch, write the delta, and validate the change's `changes` directory. Fix what the validator reports before going further. The validated directory is the section's first line.
   - If it does not, write `none - <reason>`, naming what the Task builds from nothing.
   - If you cannot tell, it changes something: write the delta.
4. Construct prompt body: Task Reference, Context from Dependencies (if applicable), Objective, Spec Deltas, Detailed Instructions, Workspace (with the branch and its base branch), Expected Output, Validation Criteria, Instruction Accuracy, Task Iteration, Task Logging instructions, Reporting Instructions.
5. Read the Worker's Task Bus, then write the Task Prompt to it: `.apm/bus/<agent-slug>/task.md`.
6. From the Task's repository directory, create the worktree per §2.5 Version Control Standards:

   ```
   git worktree add <checkout>/.claude/worktrees/<slug>-<stage>.<task> -b worktree-<slug>-<stage>.<task> <base-branch>
   ```

7. Copy the bundle entries, the settings files and the Rules file into it, fill its mailbox from the shared `.apm/`, add the copies and `/.apm` to the exclude file, and confirm `git status --porcelain` in the worktree prints nothing, per §2.5 Version Control Standards.
8. Launch the session from the same directory, with the same name:

   ```
   claude --bg --name <slug>-<stage>.<task> --worktree <slug>-<stage>.<task> "{SKILL_NAME:work} <slug>"
   ```

   The launch prompt is what starts the Worker skill. A trigger message cannot: role skills accept only a person's invocation, and a launch prompt counts as one.
9. Wait until the session appears in the agent listing.
10. Read both session identifiers with `claude agents --json` and record them, with the branch name, in the Task row when updating the Tracker per §2.4 Dispatch Standards.
11. Send the fixed trigger text to the session by name per `{SKILL_PATH:apm-communication}` §4.4 Trigger Messages.

### 3.4 Follow-Up Task Prompt Construction

Execute when the review outcome (per `{GUIDE_PATH:task-review}` §3.3 Review Outcome) determines follow-up is needed.

Perform the following actions:
1. Capture follow-up context: what went wrong, investigation findings, required refinement, any planning document modifications.
2. If planning documents were modified, extract relevant updated content per §3.2 Per-Task Analysis.
3. Refine all content sections per §2.3 Follow-Up Standards. Include a follow-up context section explaining the issue and required refinement.
4. Write the follow-up's `## Spec Deltas` section per §2.8 Spec Delta Standards. When the change is the same, keep the baseline it started with, update the delta to what the follow-up now asks for, and validate it again. When the original said `none - <reason>`, it still holds while the follow-up only reshapes what the first attempt built on its unmerged branch. A follow-up that now touches something that existed on the base branch changes existing work: write the delta per §3.3 Task Prompt Construction.
5. Construct the follow-up prompt per §4.2 Follow-Up Format. Same `log_path` as the original.
6. Clear the Report Bus in the session's mailbox per §2.6 Delivery Standards.
7. Read the Worker's Task Bus, then write to it: `.apm/bus/<agent-slug>/task.md`. Copy it into the session's mailbox before resuming, together with anything new the follow-up cites, per `{SKILL_PATH:apm-communication}` §4.5 Worktree Mailbox. The rest of the mailbox is the session's own working state from the first attempt: leave it.
8. Confirm the session no longer appears in `claude agents --json`, then resume it in the background from the Task's repository directory using the full session id from its Task row, with no other flags - the session keeps the options it was launched with, and flags passed on the resume start a copy. Confirm it came back under the same id instead of as a copy. A copy means the short id was used, flags were passed, or the session had not finished stopping: a stop returns before the session has exited.
9. Send the fixed trigger text to the session by name per `{SKILL_PATH:apm-communication}` §4.4 Trigger Messages. The session keeps the execution context of its first attempt, so the follow-up addresses what changed rather than restating what the session already did.

---

## 4. Structural Specifications

### 4.1 Task Prompt Format

Task Prompts are markdown files. Adapt based on Task needs - not all sections are required for every Task, except Spec Deltas, which every prompt carries.

**YAML Frontmatter Schema:**
```yaml
---
stage: 1
task: 2
agent: frontend-agent
log_path: ".apm/memory/stage-01/task-01-02.log.md"
has_dependencies: true
---
```

**Field Descriptions:**
- `stage`: Stage number.
- `task`: Task number within Stage.
- `agent`: Worker identifier (kebab-case).
- `log_path`: Pre-constructed path for the Task Log. Path pattern: `.apm/memory/stage-<NN>/task-<NN>-<MM>.log.md` (relative to the project root). All Tasks in the same Stage share the same Stage directory. You construct the path; the Worker writes directly to it.
- `has_dependencies`: Whether dependency context is present.

**Prompt Body Sections:**
- *Title.* `#` heading using Task ID and title. Each section uses `##` heading:
- *Task Reference:* Task ID and assigned agent.
- *Context from Dependencies.* Included when `has_dependencies: true`. One form for every dependency per §2.1 Dependency Context Standards: an intro naming what this Task depends on - `**Integration Steps:**` numbered file reading instructions - `**Producer Output Summary:**` key features, files, interfaces, constraints - `**Upstream Context:**` for relevant ancestors. Say which Worker produced the work when it helps the reader locate it, and write the same depth either way.
- *Objective:* Single-sentence Task goal, optionally enhanced with coordination-level context.
- *Detailed Instructions:* Plan steps transformed into actionable instructions with integrated Spec content and guidance.
- *Spec Deltas.* Required in every prompt, headed `## Spec Deltas`, placed before the detailed instructions so the Worker knows whether it is changing existing behaviour before it starts. Its first non-empty line is one of the two literal forms in §2.8 Spec Delta Standards:
  - `none - <reason>`, the reason naming what the Task builds from nothing.
  - `.apm/openspec/<change>/changes`, followed by the baseline's path and the delta itself.

  A missing heading, an empty reason, or a directory that does not exist is refused by the dispatch gate. An empty section is an unfinished prompt, not a Task without deltas.
- *Workspace:* The worktree path, the Task branch to cut, and the base branch to cut it from. The Worker works and commits in the worktree and notes it in the Task Log. `.apm/` paths resolve to the session's mailbox inside the worktree, which you fill before the launch and collect when the report arrives. Workers do not merge.
- *Expected Output:* Deliverables from Plan Output field.
- *Validation Criteria:* From Plan Validation field.
- *Instruction Accuracy:* The objective and expected output are authoritative - deliver those. However, the detailed instructions and steps were constructed from planning documents and may contain inaccurate details, missed prerequisites, or outdated assumptions about the codebase. When a specific instruction contradicts what the codebase actually shows, validate the actual state rather than persisting with the instruction as written.
- *Task Iteration:* When validation fails, investigate before fixing - read error output, trace the cause, understand what went wrong. Apply one targeted change per iteration. When a fix does not resolve the issue, spawn a debug subagent with structured instructions: the error output, what you investigated and attempted, relevant file paths, and expected vs actual behavior. Direct it to trace the root cause and propose a fix. Validate the subagent's findings before applying. When the root cause could stem from multiple independent areas, spawn separate subagents in parallel. If unresolved after subagent investigation, report with Partial status.
- *Task Logging:* Path and reference to `{GUIDE_PATH:task-logging}` §3.1 Task Log Procedure.
- *Task Report:* Instruction to write the report to the Report Bus and send the fixed trigger text back.

### 4.2 Follow-Up Format

Follow-up Task Prompts use the same structure as §4.1 Task Prompt Format with these modifications:
- *Title:* `APM Follow-Up Task: <Task Title>`
- *Follow-up context section* after Task Reference - previous issue, investigation findings, required refinement, additional guidance.
- *All content sections* refined based on what went wrong, not copied from the previous attempt.
- *Same `log_path`* as the original Task Prompt.
- *Spec Deltas* present as in every prompt, carrying the same change directory when the change is the same.

### 4.3 Branch and Worktree Standards

Branch naming follows the convention recorded in the Tracker Version Control table, and names describe the actual work. Worktree location is not a choice: create it at `<checkout>/.claude/worktrees/<session name>`, where the session name is `<slug>-<stage>.<task>`, and launch with that same name so the session opens it. The directory holds a full checkout of all tracked files; untracked files are not present, which is why the bundle is copied in and the bus is reached through a mailbox per §2.5 Version Control Standards.

### 4.4 Tracker VC Entry Format

VC configuration recorded in the Version Control table within the Tracker, with one row per repository. Per-Task state lives in the Task table: the Branch column holds branch state and the Session column holds the two session identifiers. An incoming Manager reads Task rows to rebuild working version control and session context.

**Format:**

```markdown
## Version Control

| Repository | Base Branch | Branch Convention | Commit Convention |
|-----------|-------------|-------------------|-------------------|
| <repo-name> | <branch-name> | <convention> | <convention> |
```

---

## 5. Common Mistakes

- *Planning document paths in Task Prompts:* Workers are scoped to their Task Prompt and Rules - the Spec and Plan are not in their context. A reference like "see the Spec" or "check the Plan" breaks self-containedness. Extract and embed the relevant content instead.
- *Thin dependency context because the same Worker produced it:* A Worker's earlier session is gone. Its successor knows only what the prompt and the Worker's `handoff.md` carry, so a dependency the same Worker produced needs the same depth as anyone else's.
- *Asking the User to carry a message:* The bus and the trigger move work. Telling the User to open a chat, paste a report, or run a skill on the normal path reintroduces the relay the dispatch cycle exists to remove.
- *Writing a trigger that asks for a skill:* A session asked to invoke a role skill refuses, and the Task never starts. Triggers name a bus path and nothing else.
- *Shallow dependency chains:* A Task's direct dependency may itself depend on earlier work that established patterns, schemas, or contracts. Trace upstream until an intermediate node fully abstracts what came before.
- *Vague instructions:* "Implement the feature properly" vs "Implement POST /api/users with email validation using express-validator, returning 201 on success."
- *Dispatching before merging dependencies:* If Task B depends on Task A's output and A was on a separate branch, A must be merged before B's branch is created.
- *Assuming base branch name:* Read the base branch from the Tracker's Version Control table for the relevant repository. Do not assume `main` or `master`.
- *Forgetting session and VC state in Handoff:* Task rows must reflect current branch and session state before Handoff. Include active branches, live sessions with both identifiers, and pending merges in the Handoff Log - an incoming Manager cannot resume a session whose full id was never written down.
- *Resuming with the short id:* Only the full session id continues a session. The short id starts a copy that has lost the worktree, and the copy looks healthy.
- *Moving the worktree:* The worktree goes under `.claude/worktrees/` and nowhere else. Relocating it silently cuts the session off from Rules.
- *Launching before copying the bundle:* A session resolves its skills when it starts. Files copied after the launch arrive too late for the launch prompt, which fails with `Unknown skill` while the session itself looks healthy.
- *Committing build artifacts:* Do not commit generated files. Create or update `.gitignore` for build directories.

---

**End of Guide**
