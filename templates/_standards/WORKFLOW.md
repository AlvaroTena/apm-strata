# APM Workflow

This document is the formal specification of the APM workflow. It defines the phases, systems, and procedures that govern how agents coordinate to deliver project outcomes. This is a development-time specification: agents do not read this file during runtime. Every guide, skill, agent and hook derives its behavior from this specification - the rules defined here take effect through those implementation files, and each section names the ones that carry it.

Terms used here are defined in `TERMINOLOGY.md`. Writing conventions follow `WRITING.md`. Paths and invocations are written literally: the build skips `_standards/`, so a placeholder here would reach its reader unsubstituted.

---

## 1. Design

APM is a multi-agent project management framework that coordinates agents through file-based communication and structured planning documents.

**Agent-driven coordination** - The Manager launches a session per Task, signals it, and reads what it reports back. The User approves what needs approving and is not a relay: bus files carry the content, and a trigger message tells a session that a file is waiting. The manual bus-check skills remain as a fallback for a lost trigger.

**Four layers** - Every change belongs to exactly one: the platform, this template repository, the project that installs the template, and any cockpit the user runs on top. Three consequences hold throughout: no guide invokes a cockpit, no template carries a domain concept from any particular project, and Rules live in one place that every procedure loads as a step.

**Declared mechanisms** - Every configurable mechanism - the deferred-work tracker, the knowledge layer consumer, external lenses, the ambiguity taxonomy, the lens model, the delta validator - is declared in the project's APM Rules block. The template defines the contract and the default. An undeclared mechanism is inert, not broken: the step that reads the declaration finds none, says so, and continues. Nothing is silently skipped and nothing is silently invented. The deferred-work tracker is the exception: the Planner always declares one, and the default is the `file` type over `.apm/backlog.md`.

**Context scoping** - All agents have the same tools and the same access. Scoping is behavioral, shaped by what each agent reads: its initiation skill, the guides and skills that skill references, what those direct it to read, and what arrives through the bus. A Worker Session is scoped to its Task Prompt, the Rules block, and what it accumulates - it is never given the Spec, Plan, Tracker or Index. The scoping holds because nothing in its reading chain names those documents. The Manager holds the coordination-level view and keeps Worker scoping intact by extracting content into self-contained Task Prompts rather than pointing at documents.

**Structured memory** - Memory captures project history in a hierarchical file structure that enables Handoff continuity and efficient progress tracking.

**Subagent usage** - Agents spawn platform-native subagents for isolated, focused work: debug subagents for complex failures, research subagents for knowledge gaps, and the five lenses for review. The work that consumes context happens in contexts that then die. The build replaces subagent guidance placeholders with platform-specific invocations.

**What is not adopted** - Agent Teams, because they do not resume their teammates and this workflow is built on surviving context limits; subagents as Workers, because a subagent cannot be addressed once running; and a persistent Worker session per domain, because it allows only one change in flight per Worker and puts a follow-up in collision with the next Task.

---

## 2. Surfaces

**Runtime:** `skills/`, `guides/`, `agents/`, `hooks/`

The template ships four kinds of file, and every mechanism below names the ones that implement it.

| Surface | What it is |
| ------- | ---------- |
| Role skills | The nine skills a User types: `apm.plan`, `apm.manage`, `apm.work`, `apm.task`, `apm.review`, `apm.handoff.manager`, `apm.handoff.worker`, `apm.summarize`, `apm.recover`. The skill name is the invocation. |
| Support skill | `apm-communication`, read by every role rather than invoked by any. |
| Guides | Procedural documents, one reading agent each: `context-gathering`, `work-breakdown`, `task-assignment`, `task-execution`, `task-logging`, `task-review`. |
| Agents | The archive explorer and the five review lenses, spawned as subagents. |
| Hooks | Two scripts registered in the project's settings: the dispatch gate and the pre-compaction reminder. |

There is no command category. The numbered commands became role skills; `templates/commands/` no longer exists.

---

## 3. Phases

### 3.1 Planning Phase

The Planner transforms User requirements into planning documents through two sequential procedures: Context Gathering, then Work Breakdown. After the User approves all three planning documents, the Planner initializes the Message Bus and directs the User to start the Implementation Phase.

### 3.2 Implementation Phase

The Manager and Workers transform the Plan into completed deliverables. The Manager determines its init path from the Handoff Bus. The first Manager reads planning documents, explores git state, then presents an understanding summary alongside proposed version control conventions for User approval. On approval it writes those conventions to the Tracker and Rules, initializes the Tracker, and enters a coordination loop: dispatch, review, maintain state. Stages execute sequentially; Tasks within a Stage dispatch individually, in batches, or in parallel. After all Stages complete the Manager presents a completion summary. When context limits approach, Handoff transfers context to a successor instance.

---

## 4. Planning Documents

**Runtime:** `guides/work-breakdown.md`, `skills/apm.plan/SKILL.md`

| Document | Purpose | Location | Access |
| -------- | ------- | -------- | ------ |
| Spec | Define what is being built | `.apm/spec.md` | Manager reads directly; relevant content extracted into Task Prompts |
| Plan | Define how work is organized | `.apm/plan.md` | Manager reads directly; Task definitions extracted into Task Prompts |
| Rules | Define how work is performed | `CLAUDE.local.md` at workspace root | Every agent, loaded as a numbered step |

### 4.1 Spec

The Spec defines what is being built - project-specific design decisions and constraints, free-form below its header. Worker Sessions are not given the Spec; the Manager extracts relevant content into Task Prompts. The Manager may update it when execution findings warrant.

### 4.2 Plan

The Plan defines how work is organized - Stages, Tasks, agent assignments, a Dependency Graph, and validation criteria. Each Task specifies objective, output, validation criteria, guidance, dependencies, and steps.

Dependencies are classified same-agent or cross-agent and cross-agent ones are bolded, because the Dependency Graph renders them as different edges and the Manager reads dispatch opportunities off the graph. The classification no longer governs how much context a Task Prompt carries - see §5.

### 4.3 Rules

**Runtime:** every guide and every role skill, at the first step of its procedure

Rules are universal execution patterns, stored in the APM Rules block within `CLAUDE.local.md` at the workspace root. Content outside the block is user-managed and preserved; writing the block replaces it whole and never touches what surrounds it. Both files that can carry a block - `CLAUDE.local.md` and `CLAUDE.md` - are searched, and the block ends up in the one the User chose, so a block left behind by an earlier session cannot win. The Rules file is local project state, like `.apm/` itself; a project that wants its Rules versioned puts the block in `CLAUDE.md` instead.

**Loading is a step, not an assumption.** Every guide and role skill opens its procedure with a numbered step that reads the block at that moment. The wording is identical everywhere and the Rules are never copied into a guide. A block injected once at session start dilutes as the context fills, which is the failure this replaces; a single source with a load step in each procedure is what makes the rules hold at the moment work happens.

**The justification gate.** An agent may do something the block forbids, provided it first writes what was violated, why it was necessary, and which simpler alternative was rejected and why. A Worker writes the table in its Task Log, where the review reads it. The Manager writes it in the Tracker's working notes, where an incoming Manager reads it. The gate makes a deviation visible rather than forbidding it, because a rule with no legitimate exit is a rule that gets broken silently.

**Declarations.** The block is also where a project declares the mechanisms it turns on. The declaration formats are fixed and specified in `guides/work-breakdown.md` §4.5 Project Declaration Blocks: `## Tracker`, `## Knowledge layer`, `## External lenses`, `## Ambiguity taxonomy`, `## Lens model`, `## Deltas`. They are contracts between surfaces written by different authors, so a renamed heading or key does not error - the mechanism finds nothing and reports nothing.

Version control is the Manager's domain. It establishes conventions at first init from the workspace's git state and the Planner's Spec notes, confirms them with the User, and records them in the Tracker. Commit conventions are universal and belong in Rules; branch conventions are per-repository and stay in the Tracker.

### 4.4 Document Modification

The Spec and Plan have bidirectional influence. When modifying any planning document, the Manager assesses cascade implications first.

**Manager authority** (small contained changes): single Task clarification, a missing dependency, an isolated Spec addition, a minor Rules adjustment.

**User collaboration required** (significant changes): multiple Tasks affected, design direction change, scope change, new Stage or major restructure, or several small modifications that together amount to one.

---

## 5. Worker Model and Dispatch

**Runtime:** `guides/task-assignment.md`, `skills/apm.work/SKILL.md`, `guides/task-review.md`

A Worker is a persistent identity and an ephemeral execution. The identity - slug, bus directory, `handoff.md`, Task Logs - lasts the whole APM session. The execution does not: each Task runs in its own background session in its own worktree, created at dispatch and released after the merge. What a persistent Worker bought, accumulated context across Tasks of one domain, is carried instead by `handoff.md`, the Task Logs and the knowledge layer - and the friction it cost, one change in flight per Worker, disappears.

**Session and worktree naming.** `<agent-slug>-<stage>.<task>`.

**Lifecycle.**

1. *Dispatch.* The Manager writes the Task Prompt to the shared Task Bus, where the dispatch gate checks it, creates the worktree under `.claude/worktrees/` itself, copies into it the installed bundle, the project settings and the Rules file, fills its `.apm/` mailbox from the shared `.apm/`, launches a background session with the same name so the launch opens that worktree, records **both** session identifiers in the Tracker, and sends the trigger.
2. *Execution.* The session reads the domain's `handoff.md`, validates identity, reads the Task Prompt, branches, works, validates, writes the Task Log, updates `handoff.md` for the next session in the domain, writes the report and triggers the Manager. Everything it reads and writes lies inside its worktree: the platform refuses any file edit that resolves into the main checkout.
3. *Stop and collect.* On receiving the report the Manager stops the session, which frees resources and keeps the conversation, copies the report, the Task Log, the domain notes and any Handoff Log or delta from the mailbox back to the shared `.apm/`, and only then reads the report. Collection always precedes release, because releasing deletes the mailbox with the worktree.
4. *Review.* Per §9.3. A follow-up resumes the same session, which retains its context, and repeats until the review closes.
5. *Release.* The Manager merges from the main checkout and releases the session and its worktree.

**Two identifier spaces, and they are not interchangeable.** A background session has a short id and a full session id. The short one is what attaching, reading logs, stopping and releasing accept. Resuming accepts only the full one: giving it the short id starts a copy that has lost the worktree and looks healthy. The Tracker records both at dispatch, because a session whose full id was never written cannot be resumed for a correction.

**Release has two preconditions, not one:** a clean worktree, and every commit of its branch present on a remote. A local merge satisfies only the first, so a project with a remote publishes the branch before releasing, and one without discards the worktree's unpushed commits explicitly - only after merging. Releasing does not delete refs; the task branch and the automatic worktree branch are deleted separately.

**Where the worktree lives is load-bearing.** It is created inside the main checkout, and that is exactly why Rules reach it: the platform walks up parent directories, and the main checkout is an ancestor. A worktree placed elsewhere does not see the workspace Rules file. No guide may propose another location. The worktree is created by the Manager rather than by the launch, because the bundle has to be in place before the session resolves its first skill.

**Dependencies.** Every Task runs in a fresh session with no memory of earlier ones, so the Manager writes full dependency context into every Task Prompt, including dependencies on Tasks the same Worker produced. The same-agent and cross-agent distinction survives only in the Plan and its graph.

**Domain rooting.** A worktree belongs to one repository, so a Worker's domain maps to one repository. A domain spanning two repositories is split into one Worker per repository - there is no worktree in which the unsplit domain could run.

**Environment inheritance.** A launched session inherits the launcher's environment, including permission mode and MCP configuration. Any auxiliary session launched for a bounded task is launched with MCP and setting sources restricted, so its context budget does not depend on the local configuration of whoever launched it.

**Human gates that remain:** approval of Spec, Plan and Rules; the dispatch plan for each Stage; the justification table; the checklist markers. Retired: the message relay, and per-Task approval of clean results. After each review the Manager presents a brief and the User may ask for a follow-up.

---

## 6. Communication System

**Runtime:** `skills/apm-communication/SKILL.md`, `skills/apm-communication/bus-integration.md`

### 6.1 Communication Models

**Agent-to-user communication.** Agents explain decisions and actions in natural language. No framework vocabulary - section references, procedure step names, checkpoint labels, decision categories - is exposed. Only terms defined in `TERMINOLOGY.md` are used formally. When directing the User to act, agents say what to run and where, in copyable form.

**Visible reasoning.** Agents present analysis in chat so the User can audit decisions - assessments, justifications, trade-offs. Internal reasoning may reach a conclusion first, but the visible analysis still walks through it. When a procedure defines a reasoning frame with a header, the agent presents that header and addresses its aspects beneath.

**Agent-to-agent and agent-to-system communication.** Structured per schemas and format specifications: bus messages, artifact writing, memory logs.

### 6.2 Message Bus

The Message Bus is a file-based mechanism in `.apm/bus/`. The Planner initializes it at the end of the Planning Phase. Each Worker has a directory with three bus files; the Manager has one with a Handoff Bus.

| Bus File | File Name | Direction | Contains |
| -------- | --------- | --------- | -------- |
| Task Bus | `task.md` | Manager → Worker | Task Prompts (single or batched) |
| Report Bus | `report.md` | Worker → Manager | Task Reports |
| Handoff Bus | `handoff.md` | Outgoing → incoming agent | Handoff prompt content |

A bus file is either empty or holds a message awaiting delivery. Before writing an outgoing file, an agent clears its incoming one. Agents read a bus file before writing it.

A Worker Session never touches the shared bus. It works against a mailbox, a real `.apm/` inside its worktree with the same relative layout, which the Manager fills at dispatch and collects on report. The shared `.apm/` stays the single source of truth.

### 6.3 Triggers

A trigger is fixed text naming a bus file, addressed by session name. It never carries Task content, and it never asks the receiving session to run a skill: a role skill refuses any invocation that is not the User's, including one from a peer session, so such a message would fail while appearing to succeed. The receiving session reads the named file and acts on its own.

Addressing is by session name rather than by return address, because a session's return address changes when it resumes.

When a trigger is lost the message is still on the bus, and `apm.task` or `apm.review` invoked by hand recovers it. Those are the fallback, not the route.

### 6.4 Non-APM Agent Participation

Agents not managed by APM can participate by creating their own directory under `.apm/bus/`. They operate at the communication level only - receiving assignments, reporting results - and do not log to Memory, perform Handoff, or appear in Worker tracking.

---

## 7. Memory

### 7.1 Structure

```text
.apm/
├── tracker.md
├── backlog.md
├── checklists/
├── review/<stage>-<task>/
├── memory/
│   ├── index.md
│   ├── stage-<NN>/
│   │   └── task-<NN>-<MM>.log.md
│   └── handoffs/
│       └── <agent>/handoff-<NN>.log.md
└── archives/
```

**Tracker** (`tracker.md`) is live project state: Task tracking with branch and session identifiers, Worker tracking, version control state, the Deferred table, and working notes. Worker tracking counts nothing - sessions are per-Task and ephemeral, so there is no instance number to keep.

**Index** (`memory/index.md`) is durable memory: Memory notes first, then Stage summaries appended after each Stage.

**Task Logs** are written by each Worker Session on completion: outcome, validation, deliverables, claims, rule deviations, flags.

**Handoff Logs** hold working context not captured elsewhere.

**Backlog** (`backlog.md`) is the long-horizon list of deferred work kept by the default `file` tracker. The Planner creates it with its header when writing the Rules of a project that declares no other tracker, and never overwrites one that already exists. Archiving leaves it in place while snapshotting and clearing everything around it, which is what makes it outlive the session.

### 7.2 Task Log Flags

| Flag | Interpretation |
| ---- | -------------- |
| `important_findings` | The Worker observed something potentially beyond the Task's scope. |
| `compatibility_issues` | The Worker observed dependency or system conflicts. |

When uncertain, Workers set the flag. False negatives harm coordination more than false positives.

### 7.3 Task Outcome Status

| Status | Definition |
| ------ | ---------- |
| Success | Objective achieved, all validation passed |
| Partial | Some progress; the Worker needs guidance to continue |
| Failed | Objective not achieved |

---

## 8. Planning Phase

### 8.1 Context Gathering

**Runtime:** `skills/apm.plan/SKILL.md` (§2), `guides/context-gathering.md`, `agents/apm-archive-explorer.md`

The Planner scans the workspace, resolves what earlier sessions left open, then gathers requirements through three progressive rounds, deriving technical formalization from natural User responses.

**Workspace assessment** - Directory structure, git repositories, the Rules file, and the location of existing materials. Materials the initiation context establishes as authoritative are read directly; discovered materials are listed for the User to confirm.

**Deferred work review** (`guides/context-gathering.md` §3.2) - After exploration and before the rounds, the Planner runs the declared tracker's query command - or, in a project planned for the first time and so without a declaration yet, the default `file` query when `.apm/backlog.md` exists - reads the section headed exactly `Deferred work` in the most recent archived session summary, and reads that archive's substrate audit. Every item collected gets one of three verdicts: it enters this Spec, it stays deferred, or it closes. This is a step that executes, not a question to the User. Work that survives only if someone remembers to raise it does not survive, so the read is part of the procedure that opens the session.

**Knowledge layer discovery** (§3.3) - The Planner looks for an existing vault by marker file or by the consumer's own diagnostic, declares it when found, and otherwise offers to create one. The decision sits here rather than in the installer because the installer runs before anything about the project is known and cannot verify a claim about a vault. The scaffolding command prints the declaration block without writing it, so declaring it is part of this step.

**Ambiguity resolution** (§3.4) - A bounded pass that precedes the rounds and reduces what they must ask. The Planner maps coverage over a taxonomy as `Clear`, `Partial` or `Missing`; raises a candidate only from the latter two, discarding any whose answer would not change execution or validation; keeps at most five, ranked by impact against uncertainty; asks one at a time without revealing the queue, each answerable by two to five exclusive options or five words, each carrying an explicit recommendation and its reason; integrates every answer as it arrives, replacing what it invalidates rather than duplicating it; and closes with a coverage table. The default taxonomy has seven categories - functional scope, data and state, technical constraints, validation and acceptance, external dependencies, non-code deliverables, operation and deployment - and a project may replace it through its Rules block.

**Rounds** - Round 1 covers existing materials and vision; Round 2 technical requirements, work structure and validation criteria; Round 3 implementation approach and quality. Each round iterates until its focus areas are covered, closes with an open-ended question aimed at what the focused ones missed, and ends in a summary. The Planner explores proactively when responses reference the codebase, verifies subagent findings against the referenced files, and presents alternatives with a recommendation rather than deciding alone. Context Gathering produces signals about the project, never decomposition structures or planning vocabulary.

After the rounds, the Planner presents a consolidated understanding summary for approval.

### 8.2 Work Breakdown

**Runtime:** `skills/apm.plan/SKILL.md` (§3-4), `guides/work-breakdown.md`

The Planner decomposes gathered context into the three documents through visible reasoning, each with its own analysis, write, and approval gate.

1. **Spec Analysis** - Design decisions, the workspace section, and notes for the Manager. Generates `.apm/checklists/spec.md` before the gate.
2. **Plan Analysis** - Domains mapped to Workers, Stage structure, per-Task analysis, dependency verification. Generates `.apm/checklists/plan.md` before the gate.
3. **Rules Analysis** - Universal execution patterns and the project's declaration blocks, written into the APM Rules block. When no tracker is declared, the Planner writes the default `file` Tracker block and creates `.apm/backlog.md` with its header unless the file already exists.

**The size guard** precedes the Plan gate. The Planner counts independent deliverables; at two or more it proposes narrowing the objective to one and moving the rest to the backlog with their evidence. It does not block - the User may keep the full scope, and the Plan then carries a note recording the proposed split and the reason it was rejected. An objective-bounded session only holds when what does not fit has somewhere to go.

**Decomposition** - Each Task produces a meaningful deliverable scoped to one Worker's domain, with concrete validation criteria. A domain maps to one repository per §5. Granularity adapts to project size.

---

## 9. Implementation Phase

### 9.1 Task Assignment

**Runtime:** `guides/task-assignment.md`, `skills/apm.task/SKILL.md`

The Manager assesses readiness, constructs Task Prompts, launches sessions, and delivers through the Task Bus.

**Dispatch assessment** - Ready Tasks are identified from the Tracker and grouped by Worker into dispatch units.

| Mode | Description | Prerequisites |
| ---- | ----------- | ------------- |
| Single | One Task to one session | Task is Ready |
| Batch | Several Tasks to one session in one message | A sequential chain, or independent same-Worker Tasks all Ready |
| Parallel | Units to different Workers at once | No unresolved cross-Worker dependencies |

Isolation is a property of the model rather than a precondition to arrange: every session has its own worktree.

**Per-Task analysis** - The Manager synthesizes dependency context, relevant Spec content extracted inline, and Plan Task fields into a self-contained Task Prompt. Rules are not included - every agent reads the block directly. Content in the codebase is referenced by targeted reading instructions rather than embedded. Every Task Prompt decides its deltas explicitly in a `## Spec Deltas` section per §12.

**Task Prompt construction** - Metadata plus objective, dependency context, instructions, expected output, validation criteria, instruction accuracy guidance, iteration guidance, logging and reporting instructions, and the workspace the session operates in.

**Follow-ups** - When a review requires one, the Manager refines the prompt from what went wrong, reuses the original log path, and resumes the same session.

### 9.2 Task Execution

**Runtime:** `skills/apm.work/SKILL.md`, `guides/task-execution.md`, `guides/task-logging.md`

The session binds to its identity by resolving the agent identifier against `.apm/bus/` directory names, then reads its bus state to determine whether it is continuing after a Handoff, has a Task waiting, or is idle.

**Execution flow** - Integrate dependency context, execute steps, validate autonomously first, and pause only for criteria that genuinely need the User. On failure, investigate the cause before changing anything; when a correction does not resolve it, delegate to a debug subagent with fresh context and validate what it returns before applying.

**Completion** - Commit to the assigned branch, write the Task Log including its claims section, update the domain's `handoff.md`, clear the incoming bus file, write the Task Report, and trigger the Manager.

**User corrections** - A correction is complied with immediately and noted in the Task Log as an important finding. After reporting, the Worker asks whether it should become a Rule.

### 9.3 Task Review

**Runtime:** `guides/task-review.md`, `skills/apm.review/SKILL.md`, `skills/apm.manage/references/review-procedure.md`, `skills/apm.manage/references/external-lenses.md`, `skills/apm.manage/references/finding.schema.json`, `agents/apm-lens-*.md`

**The Manager does not read the artifact.** It stages the artifact, dispatches lenses that read it in contexts that die, and triages what they return. The expensive reading happens where its context is disposable.

**Staging** - The Manager writes `.apm/review/<stage>-<task>/`: the diff or the deliverable document, the Worker's Task Log as its claims, the acceptance criteria from the Task Prompt, and context paths including the justification table when one exists. Lenses receive paths, never text.

**Lenses** - Five ship with the template, each with a condition for running:

| Lens | Runs when | Does |
| ---- | --------- | ---- |
| `adversarial` | always | Looks for what is missing as well as what is wrong; a floor on findings, because a lens reporting none has usually stopped looking |
| `edge-case` | the artifact has behavior to trace | Traces the branches itself first, then reads the author's narrative to falsify it - the narrative is testimony, not evidence |
| `verification-gap` | code in a repository with tests | Grounds every coverage claim in a test actually read |
| `acceptance` | acceptance criteria exist | Checks the deliverable against the criteria it was built to satisfy |
| `editorial` | the deliverable is a document | Structure and prose only; the content is not its business |

Each lens is pinned to a model, restricted to reading tools, and denied the tools that would let it act. Every lens returns findings in one shape - `location`, `trigger_condition`, `guard_snippet`, `potential_consequence` - and no severity. Applicable lenses run in parallel without seeing each other, and the Manager waits for all of them.

**External lenses** - A project may declare its own in the Rules block: any command that takes the staged directory, runs without writing, and returns findings in the same shape. They run alongside the internal ones and are triaged identically. A lens invoked through a third-party binary is verified by running it, not by reading its documentation - flags move between versions.

**Fallback** - Where subagents are unavailable, the Manager writes self-contained lens prompts to the staged directory and asks the User to run them elsewhere, ideally against a different provider, and paste the findings back.

**Triage** - For each finding, in order: discard any severity the lens attached; verify at the cited location whether the bad outcome actually occurs; issue one verdict; group survivors by shared root cause, which is not the same as shared location; route each group to exactly one bucket.

| Bucket | What happens |
| ------ | ------------ |
| `accept` | Nothing; the Task proceeds |
| `follow-up` | A correction assignment carrying the group's findings |
| `plan` | Cascade over the planning documents, decided with the User |
| `defer` | Outside the objective; becomes a deferred item per §11 |

The result is written to `triage.md`, one row per finding, carrying `id`, `lens`, `verdict`, `evidence` and `bucket`. `id` is what a deferred item cites. `lens` names the producer, and `manager` is reserved for a finding the Manager found itself - the triage is the Manager's own artifact, and a coordinator that spots a real defect records it rather than laundering it through a lens. Measurements that compare lenses count only the rows lenses produced.

**Stage summary** - After a Stage's Tasks complete and any holistic verification concludes, the Manager appends a Stage summary to the Index.

---

## 10. Mechanical Gates

**Runtime:** `hooks/apm-dispatch-gate.sh`, `hooks/apm-precompact.sh`, `skills/apm.manage/references/hooks-frontmatter.md`, `guides/work-breakdown.md` §4.4

**Checklists.** At the Spec and Plan approval gates the Planner writes a requirement quality checklist of five to eight items, each a question about the quality of what the document says, carrying its dimension and the section it points at. `[x]` means a human confirmed the criterion, never that implementation is done, and no agent marks a box - an agent marking its own work removes the only signal the checklist carries.

**The dispatch gate.** A `PreToolUse` hook on write operations refuses a write to a Task Bus file while a checklist has an unmarked box, while an open deferred item names the Task being dispatched as blocked, or while the Task Prompt has no valid `## Spec Deltas` decision. It exits non-zero to block and its stderr becomes the reason, so every refusal names the specific item. Nothing else is gated.

**Where hooks are declared.** In the project's settings file, installed by the CLI - never in a skill's frontmatter. Frontmatter registration happens when the skill is invoked and lives in the process, so a session resumed into a new process would carry no gate until something reinvoked the skill, which is exactly what a resuming coordinator does not do. A gate that disarms without saying so is worse than no gate. The consequence accepted is that the hook is project-scoped rather than role-scoped, which is harmless: it only guards a file that only a coordinator writes.

**No checklists is a pass.** The gate enforces an unfinished review, not the absence of a review artifact. A project that never generates a checklist is never blocked by one - the same principle as an undeclared mechanism.

**A gate does not own its rule.** It shortens a feedback loop. The conditions hold whether or not it fires, so a passing write means no block was raised, not that the conditions were checked.

**Pre-compaction.** A second hook leaves a reminder to run recovery once the context window has been compacted. It never blocks.

---

## 11. Knowledge Layer and Backlog

**Runtime:** `guides/context-gathering.md` §3.2-3.3, `guides/task-review.md` §3.6, `skills/apm.summarize/SKILL.md`, `guides/work-breakdown.md` §4.5

### 11.1 Knowledge Layer

A contract, not a tool: the template defines what is emitted and when, and the project declares which consumer receives it. Without a declaration the emission and audit steps run, find nothing, and do nothing.

Every Task Log carries a `## Claims` section - falsifiable statements with the evidence proving each and the identifier of any claim it supersedes. A Task with nothing to claim writes `none`. After triage, the Manager builds the ingest mechanically from that section; it never authors knowledge. Claims enter as provisional.

At session close the audit reports claims in dispute and sources due for review. It is written under `.apm/` **before** archiving, because archiving snapshots `.apm/` and removes the installation - a report written afterwards, or outside `.apm/`, is never seen by the next session. Archiving carries it into the session archive, which is where the next Context Gathering reads it.

### 11.2 Long-Horizon Backlog

Deferred work needs somewhere that outlives the session, and the project's `## Tracker` declaration names it. The Planner always writes one when writing the Rules: a project that names no other tracker gets the `file` type, whose `query` and `create` commands operate on `.apm/backlog.md`, and the Planner creates that file when it does not exist. The file survives because archiving is built to leave it in place; a project may declare a different tracker, and the requirement is durability rather than a location. It does not live in the knowledge layer: a backlog has to be able to close, and the knowledge layer never archives.

The four steps that make it work:

1. *Capture.* The `defer` bucket creates the item and writes its row in the Tracker's Deferred table in the same step. A deferral that is only announced is lost.
2. *Size guard.* The Planner proposes splitting an oversized objective and sending the remainder here.
3. *Close.* The session summary carries a `Deferred work` section with each item linked, and the archive index carries the count.
4. *Blind read.* The next Context Gathering reads all of it as a numbered step, with a mandatory verdict per item.

**The status vocabulary is a closed set.** The gate treats a deferred item as closed only for a fixed list of values, and everything else - including an empty cell and including a word that plainly means finished - counts as open. The asymmetry is deliberate: a gate guessing which unfamiliar words mean "open" would eventually wave one through, while a gate blocking on a word it does not know is merely irritating. The exact list is specified in `guides/task-review.md` §4.6 and `guides/work-breakdown.md` §4.5.

---

## 12. Delta Specification

**Runtime:** `guides/task-assignment.md`, `guides/task-execution.md`

Every Task Prompt carries a `## Spec Deltas` section, and its first non-empty line records the decision: `none - <reason>` for work built from nothing, or the validated `.apm/openspec/<change>/changes` directory for a Task that modifies something that already exists. A delta states that change as ADDED, MODIFIED and REMOVED requirement blocks rather than prose, each requirement carrying `SHALL` or `MUST` and its scenarios. The requirement name is the key and is case-sensitive. MODIFIED replaces a requirement whole, so omitting one of its existing scenarios deletes that scenario - the most common way to lose behavior silently. When in doubt the Manager writes the delta, and the dispatch gate refuses a Task Bus write whose prompt lacks the section, gives `none` without a reason, or names a directory that does not exist.

Deltas are validated by a declared command, run by the Manager when it builds the Task Prompt and by the Worker Session before it reports.

A MODIFIED or REMOVED block needs a baseline to match against, and nothing creates one ahead of time. The Manager writes it from the current code on the base branch, limited to the requirements the delta names, in a root of its own per change under `.apm/openspec/<change>/`. A per-change root keeps concurrent changes to the same capability from overwriting each other's baseline. The Worker Session never rewrites the baseline, and the whole root is deleted when the change merges, so no stale baseline waits for the next Task.

---

## 13. Handoff and Continuity

### 13.1 Handoff

**Runtime:** `skills/apm.handoff.manager/SKILL.md`, `skills/apm.handoff.worker/SKILL.md`

Handoff transfers context between successive instances of the same role when context limits approach. The Manager uses it as a matter of course. A Worker uses it in the exception where one Task exhausts its own session; the ordinary case needs no Handoff, because the next Task starts a new session anyway and reads the domain's `handoff.md`.

| Artifact | Location | Content | Lifecycle |
| -------- | -------- | ------- | --------- |
| Handoff prompt | Handoff Bus | Current state and continuation | Ephemeral; cleared once processed |
| Handoff Log | Memory | Past actions, decisions, approaches tried | Persistent |

An incoming Manager reads the Handoff Log, the Tracker, the Index and relevant recent Task Logs.

### 13.2 Recovery

**Runtime:** `skills/apm.recover/SKILL.md`, `hooks/apm-precompact.sh`

Recovery reconstructs context after compaction or a lost conversation. The agent re-reads its initiation skill, follows its document loading instructions, then explores project artifacts to rebuild operational state. Recovery does not create a new instance. The agent notes it in its next report and in its eventual Handoff Log.

### 13.3 Session Continuation

**Runtime:** `skills/apm.summarize/SKILL.md`, `agents/apm-archive-explorer.md`, `guides/context-gathering.md` §3.2

Session continuation archives the session's artifacts and reinitializes for a new one.

**Archive structure** - Archives reside in `.apm/archives/<session-YYYY-MM-DD-NNN>/`, holding the planning documents, Tracker, Memory, the optional session summary, and the substrate audit when one was written. `metadata.json` is the canonical archive marker. The bus directory is not archived; the backlog is left in place rather than snapshotted, so the next session's blind read finds it where it looks.

**Session summary** - Produced by `apm.summarize`, a standalone agent that is not a Planner, Manager or Worker. It captures scope, stage outcomes, deliverables, findings, known issues, codebase state, the `Deferred work` section and the substrate audit. Before archiving it writes the substrate audit; after archiving it updates the archive index. At close it lists the Worker Sessions still alive, crossing the platform's session listing against the Tracker's session column, and directs the User to delete them - stopping and releasing take the short identifier, and only resuming takes the full one.

**Planner archive detection** - The next Planner checks `.apm/archives/`, spawns the archive explorer for relevant archives, and verifies its findings against the current codebase before integrating them.

**No secondary archival** - Archives accumulate; there is no mechanism to archive archives.

---

**End of Workflow Specification**
