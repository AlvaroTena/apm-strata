# APM Terminology

This document defines the formal vocabulary of the APM workflow. This is a development-time specification: agents do not read this file or any `_standards/` document during runtime. The vocabulary defined here takes effect through the skills, guides, agents and hooks that use these terms consistently. Template authors use terms exactly as defined here; agents inherit correct terminology through the templates they read.

Formal terms are always capitalized and carry defined meaning. All other language is natural - standard English capitalization applies (headings, labels, proper nouns) but confers no formal status. There is no intermediate category between formal vocabulary and natural language. Workflow definitions follow `WORKFLOW.md`.

Paths in this document are written literally. The build skips `_standards/`, so a placeholder written here would reach its reader unsubstituted.

---

## 1. Roles

| Term | Definition |
| ------ | ------------ |
| **Planner** | Gathers requirements and decomposes them into planning documents. Single instance, no Handoff. |
| **Manager** | Coordinates and orchestrates the Implementation Phase - dispatches Tasks, reviews results through lenses, maintains planning documents and memory. Single role, multiple instances via Handoff. |
| **Worker** | Executes Tasks assigned by the Manager. One Worker per domain. A Worker is an identity that persists for the whole APM session; its execution is a Worker Session per Task. |
| **Lens** | A reviewing agent that reads a staged artifact and returns Findings. Lenses do not judge, score, or decide - they report. Five ship with the template; a project may declare more. |

---

## 2. Phases

| Term | Definition |
| ------ | ------------ |
| **Planning Phase** | The Planner transforms User requirements into planning documents through Context Gathering and Work Breakdown. |
| **Implementation Phase** | The Manager and Workers transform the Spec, Plan and Rules into completed deliverables through coordinated Task execution. |

---

## 3. Planning Documents

Three documents form a waterfall: Spec (what to build) → Plan (how work is organized) → Rules (how work is performed).

| Term | Definition | Location |
| ------ | ------------ | ---------- |
| **Spec** | Project-specific design decisions and constraints that inform the Plan. The Manager may update it during the Implementation Phase. | `.apm/spec.md` |
| **Plan** | Stage and Task breakdown with agent assignments, Dependency Graph, and validation criteria. The Manager may update it during the Implementation Phase. | `.apm/plan.md` |
| **Rules** | Execution rules applicable to all or most Tasks, maintained as the APM Rules block within the Rules file. Every agent loads the block as a numbered step of its own procedure. | `CLAUDE.local.md` at workspace root, or `CLAUDE.md` when the project versions its Rules |
| **Dependency Graph** | Mermaid diagram in the Plan header that visualizes Task dependencies, agent assignments, and execution flow. Enables the Manager to identify batch candidates, parallel dispatch opportunities, and critical path bottlenecks. | Within `.apm/plan.md` |
| **Checklist** | Requirement quality checklist generated at an approval gate. Each item is a question about the quality of what the document says, never about implementation progress. Reviewer-owned: `[x]` means a human confirmed the criterion, and no agent ever marks a box. | `.apm/checklists/spec.md`, `.apm/checklists/plan.md` |

The APM Rules block is also where a project declares the mechanisms it turns on - its Tracker, knowledge layer consumer, external lenses, ambiguity taxonomy, lens model and delta validator. An undeclared mechanism is inert rather than broken: the step that reads the declaration finds none, says so, and continues. The Tracker declaration is the exception: the Planner always writes one, and a project that names no other tracker gets the `file` type, which keeps the Backlog in `.apm/backlog.md`.

---

## 4. Work Units

| Term | Definition |
| ------ | ------------ |
| **Stage** | Milestone grouping of related Tasks representing a coherent project progression. |
| **Task** | Discrete work unit with objective, deliverables, validation criteria, and dependencies. Tasks contain ordered sub-units (steps) that support failure tracing but have no independent validation. |
| **Worker Session** | The Claude Code session in which one Task executes: a background session in its own worktree, named `<agent-slug>-<stage>.<task>`. The Manager creates it at dispatch, stops it on report, resumes it for a follow-up, and releases it after the merge. It is ephemeral - the Worker identity outlives it, the session does not. |

### Task Lifecycle States

Tasks in the Tracker progress through these states:

| Term | Definition |
| ------ | ------------ |
| **Waiting** | Dependencies not met. |
| **Ready** | All dependencies complete; can be dispatched. |
| **Active** | Dispatched to a Worker Session; execution in progress. |
| **Done** | Coordination decision finalized - terminal state. |

Outcome statuses are inputs to the Manager's coordination decision - the Manager reviews the outcome, investigates if needed, and then decides the lifecycle transition. A Task becomes Done when the Manager makes a terminal coordination decision - proceeding after Success, accepting a non-Success outcome, or restructuring work. A Task remains Active during investigation, while a follow-up is pending, or while the Manager is deciding how to proceed. Done is terminal; if completed work needs revisiting due to later findings, the Manager creates a new Task through plan modification rather than reopening the original. The original remains Done as a historical coordination decision; the new Task references it and captures what specifically needs correction. When all Tasks in a Stage are Done with no branches or sessions remaining, the Stage collapses to complete.

### Task Outcome Statuses

Task Logs record the execution result:

| Term | Definition |
| ------ | ------------ |
| **Success** | Objective achieved, all validation passed. |
| **Partial** | Some progress made; Worker needs guidance to continue. |
| **Failed** | Objective not achieved; Worker attempted but could not resolve the issue. |

Partial means "I need guidance to continue." Failed means "I could not achieve the objective."

---

## 5. Procedures

| Term | Definition |
| ------ | ------------ |
| **Procedure** | A defined workflow operation in APM. Each Procedure covers a specific part of agent work: Context Gathering, Work Breakdown, Task Assignment, Task Execution, Task Review, Task Logging, and Handoff. |

| Term | Definition |
| ------ | ------------ |
| **Context Gathering** | Planner reviews deferred work, discovers the knowledge layer, resolves ambiguity, elicits requirements through structured question rounds, and produces a consolidated summary for User review. |
| **Work Breakdown** | Planner decomposes gathered context into Spec, Plan, and Rules, generating a Checklist at each approval gate. |
| **Task Assignment** | Manager assesses readiness, constructs Task Prompts, launches Worker Sessions, and delivers Task Prompts through the Task Bus. |
| **Task Execution** | Worker Session reads a Task Prompt, executes instructions, validates results, iterates if needed, and logs the outcome to memory. |
| **Task Review** | Manager stages the artifact, runs Lenses, triages their Findings, modifies planning documents when findings warrant it, and updates the Tracker. |
| **Task Logging** | Worker writes a structured Task Log capturing outcome, validation, deliverables, claims, and flags. |
| **Handoff** | Context transfer between successive instances of the same agent role when context window limits approach. Applies to the Manager, and to a Worker whose single Task exhausts its session. |
| **Ambiguity Resolution** | The bounded pass within Context Gathering that maps coverage over a taxonomy and closes at most five open decisions before the question rounds begin. |
| **Recovery** | Context reconstruction after compaction or a lost conversation, within the same agent instance. |

---

## 6. Review

The Manager does not read a Task's artifact. It stages the artifact, dispatches Lenses that read it in contexts that die, and triages what they return.

| Term | Definition | Location |
| ------ | ------------ | ---------- |
| **Staged artifact** | The directory the Manager writes before a review, holding the artifact or diff, the Worker's claims, the acceptance criteria, and context paths. Lenses receive paths to it, never the text. | `.apm/review/<stage>-<task>/` |
| **Finding** | One reported problem, in a fixed shape and carrying no severity: `location`, `trigger_condition`, `guard_snippet`, `potential_consequence`. A Lens returns Findings and nothing else. |  |
| **Triage** | The Manager's pass over the Findings: discard any severity a Lens attached, verify at the cited location whether the bad outcome actually occurs, issue one Verdict, group survivors by shared root cause, and route each group to one Bucket. | `.apm/review/<stage>-<task>/triage.md` |
| **Verdict** | The Manager's judgment on one Finding, one of `high`, `medium`, `low`, `false`, `maybe-false`. |  |
| **Bucket** | The outcome a triaged group is routed to, one of `accept`, `follow-up`, `plan`, `defer`. Exactly one per group. |  |

Each triage row carries `id`, `lens`, `verdict`, `evidence` and `bucket`. `id` is what a Deferred Item cites when the Bucket is `defer`. `lens` names the Lens that produced the Finding, and the value `manager` is reserved for a Finding the Manager found itself: the triage is the Manager's own artifact, and a coordinator that spots a real defect records it directly rather than laundering it through a Lens.

| Bucket | What happens |
| ------ | ------------ |
| `accept` | Nothing. The Task proceeds on its course. |
| `follow-up` | A correction assignment goes to the Worker Session, carrying the group's Findings. |
| `plan` | The finding cascades over the planning documents, decided with the User. |
| `defer` | The finding is outside the current objective and becomes a Deferred Item. |

---

## 7. Communication

The communication system is a file-based Message Bus in `.apm/bus/`. Each agent has a directory containing its bus files. Before writing to an outgoing bus file, the agent clears its incoming bus file.

| Term | Definition |
| ------ | ------------ |
| **Message Bus** | The file-based communication system in `.apm/bus/` through which agents exchange Task Prompts, Task Reports, and Handoff content. |
| **Task Bus** | Manager-to-Worker bus file (`task.md`). Contains Task Prompts. |
| **Report Bus** | Worker-to-Manager bus file (`report.md`). Contains Task Reports. |
| **Handoff Bus** | Outgoing-to-incoming agent bus file (`handoff.md`). Contains the handoff prompt content that instructs the incoming agent to rebuild working context. |
| **Task Prompt** | Self-contained prompt delivered via Task Bus providing a Worker Session with everything needed to execute and validate a Task. |
| **Task Report** | Concise summary delivered via Report Bus by a Worker Session for Manager review. |
| **Trigger** | The fixed-text message that tells a session a bus file has content, addressed by session name. A Trigger points at a file and never carries Task content, and it never asks the receiving session to run a skill - a role skill refuses any invocation that is not the User's, so a message that asked for one would fail while looking like it worked. The receiving session reads the file and acts on its own. |

The Trigger is the normal path and the bus files are the durable state. When a Trigger is lost the message is still on the bus, and the manual bus-check skills recover it - they are the fallback, not the route.

---

## 8. Memory

Memory resides in `.apm/memory/` and captures project history for progress tracking and Handoff continuity.

| Term | Definition | Location |
| ------ | ------------ | ---------- |
| **Memory** | The hierarchical file structure in `.apm/memory/` that captures project history for progress tracking and Handoff continuity. Contains the Index, Task Logs, and Handoff Logs. | `.apm/memory/` |
| **Tracker** | Live project state document containing Task tracking with session identifiers, Worker tracking, version control state, the Deferred table, and working notes. Updated by the Manager throughout the Implementation Phase. | `.apm/tracker.md` |
| **Index** | Durable project memory containing Memory notes (persistent observations and patterns) and Stage summaries (appended after each Stage completion). | `.apm/memory/index.md` |
| **Task Log** | Structured log created by a Worker Session after Task completion. Captures outcome, validation, deliverables, Claims, rule deviations, and flags. | `.apm/memory/stage-<NN>/task-<NN>-<MM>.log.md` |
| **Handoff Log** | Log created during Handoff containing working context not captured elsewhere. | `.apm/memory/handoffs/<agent>/handoff-<NN>.log.md` |
| **Deferred Item** | Work a review found, verified, and deliberately did not do. It exists in two places at once: an entry in the project's Tracker declaration, which outlives the session, and a row in the Tracker's Deferred table, which the dispatch gate reads. Announcing a deferral without writing both is a deferral that is lost. The declared tracker - `.apm/backlog.md` for the default `file` type; `## Deferred` in `.apm/tracker.md` |
| **Backlog** | The long-horizon list of Deferred Items kept by the default `file` tracker. The Planner declares that tracker and creates the file when writing the Rules; it outlives the session because archiving is built to leave it in place while everything around it is snapshotted and cleared. | `.apm/backlog.md` |

---

## 9. Knowledge Layer

| Term | Definition |
| ------ | ------------ |
| **Knowledge layer** | An external substrate of durable, falsifiable Claims that outlives every session. The template defines what is emitted and when; the project declares which consumer receives it. Without a declaration the emission and audit steps run, find nothing, and do nothing. |
| **Claim** | A falsifiable statement a Task asserts, with the evidence that proves it and the identifier of any earlier claim it supersedes. Workers write a `## Claims` section in every Task Log; a Task with nothing to claim writes `none`. |
| **Substrate audit** | The report on the knowledge layer's health at session close - claims in dispute and sources due for review. Written under `.apm/` before archiving, because archiving snapshots `.apm/` and removes the installation: a report written afterwards is never read by the next session. |

Unlike the Backlog, the knowledge layer never archives and never closes. That is why deferred work does not live in it: a Deferred Item has to be able to close.

---

## 10. Defined Concepts

These concepts are not formal capitalized terms but are clearly defined because they drive real workflow decisions.

**Task dependencies.** A Task may depend on outputs from a prior Task. Every Task runs in a fresh Worker Session with no memory of earlier Tasks, so the Manager writes full dependency context into every Task Prompt, including dependencies on Tasks the same Worker produced. The same-agent and cross-agent distinction survives only in the Plan and its Dependency Graph, where the two render as different edge types and the Manager reads dispatch opportunities off them.

**Dispatch modes.** The Manager determines how to dispatch Ready Tasks:

- *Single:* one Task dispatched to one Worker Session.
- *Batch:* multiple sequential Tasks dispatched to the same Worker in a single prompt. Candidates either form a chain with only internal dependencies, or are an independent group of same-Worker Tasks all Ready simultaneously. Soft guidance: 2-3 Tasks per batch.
- *Parallel:* two or more dispatch units sent to different Workers simultaneously when no unresolved cross-Worker dependencies exist. Each Worker Session has its own worktree, so isolation is a property of the model rather than a precondition to arrange.

**Domain rooting.** A worktree belongs to one repository, so a Worker's domain maps to one repository. A domain that would span two repositories in a multi-repository workspace is split into one Worker per repository - there is no worktree in which the unsplit domain could run.

**Gates.** A gate stops work until a condition holds. Human gates are approval points: Spec, Plan and Rules approval, the dispatch plan for each Stage, the justification table, and the Checklist markers. The mechanical gate is the dispatch hook, which refuses a write to a Task Bus file while a Checklist has an unmarked box or an open Deferred Item names the Task being dispatched. A gate that blocks without naming what blocked it is worse than no gate, so every refusal names the item.

**Justification table.** An agent may do something a rule in the APM Rules block forbids, provided it first writes what was violated, why it was necessary, and which simpler alternative was rejected and why. A Worker writes it in its Task Log, where the review reads it; the Manager writes it in the Tracker's working notes, where an incoming Manager reads it.

**Agent instances.** The Manager is numbered sequentially: Manager 1 is the first, Manager 2 takes over after Handoff. Workers are not numbered - a Worker's sessions are per-Task and ephemeral, so there is no instance count to keep. Recovery does not create a new instance.

**APM session.** One complete workflow cycle operating on a single set of `.apm/` artifacts. Multiple agent instances and many Worker Sessions participate, and the artifact set remains continuous until archival.

**Session continuation.** Archiving the current session's artifacts and reinitializing for a new session. The summarization skill produces an optional session summary, then `apm archive` moves artifacts into `.apm/archives/`, leaves the Backlog in place, and removes the current installation. The user runs `apm init` (or `apm custom`) to begin a new session with fresh templates while retaining read access to archived context.

**Session archive.** A snapshot of a session's artifacts stored as a dated directory in `.apm/archives/` (`session-YYYY-MM-DD-NNN`). Contains planning documents, Tracker, Memory, an optional session summary, and the substrate audit when one was written. The `metadata.json` file is the canonical archive marker.

**Session summary.** Optional artifact (`.apm/session-summary.md`) produced by a standalone agent via the summarization skill - not a Planner, Manager, or Worker. Captures a point-in-time snapshot of the session, including a `Deferred work` section read verbatim by the next session's Context Gathering.

**Understanding summary.** A consolidated presentation of gathered context for User review and approval. The Planner presents one at the end of Context Gathering; the Manager presents one during first initiation. Both are approval gates.

**Delta specification.** A Task that changes something already existing carries its change as ADDED, MODIFIED and REMOVED requirement blocks rather than prose. MODIFIED replaces a requirement whole, so omitting one of its existing scenarios deletes that scenario. The baseline it is checked against is written per change from the current code and deleted when the change merges.

---

**End of Terminology**
