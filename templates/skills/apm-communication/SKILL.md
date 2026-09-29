---
name: apm-communication
description: Agent communication standards and file-based Message Bus protocol for structured inter-agent messaging.
---

# APM {VERSION} - Communication Skill

## 1. Overview

**Reading Agent:** Planner, Manager, Worker

This skill defines agent communication standards and the file-based Message Bus protocol. It covers communication models, bus identity, and shared message formats. Agent-specific delivery and reporting procedures are defined in each agent's guides.

Agents not managed by APM can participate in bus communication by creating their own agent directory under `.apm/bus/`. See `bus-integration.md` alongside this skill for the integration guide.

---

## 2. Agent-to-User Communication

### 2.1 Direct Communication

When communicating with the User - asking questions, requesting actions, providing status updates, presenting completions - use natural language adapted to the situation. Explain what happened, what was decided, and what happens next. There are no rigid templates; adapt phrasing to what the situation requires while conveying necessary information.

When directing Users to perform actions (run commands, switch chats, review artifacts), provide specific actionable guidance naturally: which command, in which agent's chat, with what arguments. Present commands the User needs to run in code blocks so they are easy to copy. Use inline code for file paths, values, and references within prose. When multiple actions are needed (open a new chat, run initiation, check tasks), list them clearly with enough spacing to distinguish each step. When the action requires a new chat, include the platform guidance per {NEW_CHAT_GUIDANCE}.

Communication at workflow transitions should orient the User: what was just completed, what comes next, and what action is needed. Adapt naturally to the moment rather than following a fixed format.

### 2.2 Visible Reasoning

At procedural decision points, present your analysis visibly in chat before acting. The User needs to understand why you are making each decision - explain your assessments, justify your choices, and surface trade-offs so they can review and audit your reasoning and redirect if needed. Reasoning quality correlates with output quality. Internal reasoning or thinking may reach conclusions before visible chat output begins - but visible analysis in chat must still walk through the reasoning that led to those conclusions. Present how you arrived at each decision, not just what you decided. The User cannot audit or redirect decisions that appear in chat as given.

When a procedure prescribes specific headers for reasoning, present those headers visibly and address each section beneath them. When a procedure describes aspects to cover without prescribing headers, cover all indicated aspects using whatever format suits the content - prose, lists, tables, or any combination. In both cases, the output is analysis presented for the User's review. When no reasoning frame is provided, present what you are assessing, the key considerations, and your conclusion.

### 2.3 Terminology Boundaries

Formal APM terms - consistently capitalized words in APM commands and guides like Task, Stage, Worker, Manager - are part of the agent's public vocabulary. Use them naturally when communicating. All other language is natural prose; standard English capitalization applies but confers no formal status.

The following are internal authoring structure - use them for navigation but never surface them in User-facing output:
- Section references (§N.M).
- Procedure names and named sections from your guides.
- Step labels and checkpoint names.
- Decision categories.

When transitioning between sections, describe what you are doing and why rather than announcing which section you are executing. Describe your findings and move naturally into the next topic rather than stating "Beginning [section name]" or "Entering [step name]."

Reasoning frame headers prescribed by your procedures are always surfaced as defined per §2.2 Visible Reasoning. These are analytical output structure, not section announcements.

---

## 3. Agent-to-System Communication

When writing to APM artifacts (Spec, Plan, Tracker, Task Logs, bus files), follow the structural format defined by the relevant guide's structural specifications section or the bus protocol in §4 Message Bus Protocol. Artifact content is technical, formal, structured, and precise. Internal procedure vocabulary does not appear in artifacts - use natural descriptive language for any free-text fields.

---

## 4. Message Bus Protocol

Bus directories and files are initialized during the Planning Phase.

**Message files are transient.** `task.md` and `report.md` are either empty, meaning no message is present, or hold one message awaiting delivery. Before writing to an outgoing message file, an agent clears its incoming one.

**`handoff.md` is not a message file.** It holds a Worker's domain notes and persists for the life of the domain: it is read at the start of every session and updated at the end, and it is never cleared on reading. The one transient thing it can carry is a delimited continuation block, written when a session runs out of context part-way through a Task and deleted by the session that relieves it. Always read a bus file before writing to it - this ensures the platform's file tools recognize the file and avoids write failures on empty or cleared files.

### 4.1 Bus Identity Standards

Agent identity is derived from the agent directory name (`.apm/bus/<agent-slug>/`). Workers validate by confirming the directory matches their registered `agent`. If the agent directory does not match, reject the message and inform the User of the mismatch.

### 4.2 Agent ID Resolution

When `{SKILL_NAME:task}` or `{SKILL_NAME:review}` accept an `[agent-id]` argument, resolve it against `.apm/bus/` directory names: exact match, then prefix, then best plausible match. When only one plausible candidate exists, resolve to it. When multiple candidates are plausible, list them and ask the User. When no bus directories exist, inform that the Message Bus is not initialized.

### 4.3 Agent Slug Format

Agent slugs are derived from the Worker names listed in the Plan Workers field by converting to lowercase and replacing spaces with hyphens. Examples: `Frontend Agent` → `frontend-agent`, `Backend Agent` → `backend-agent`. The Manager's own directory uses the slug `manager`.

### 4.4 Trigger Messages

A dispatched Worker runs in its own background session. Two fixed texts move work between the coordinator and that session, and nothing else travels this way:

- Coordinator to Worker: `APM: task available at .apm/bus/<slug>/task.md`
- Worker to coordinator: `APM: report available at .apm/bus/<slug>/report.md`

**The bus carries the content; the trigger only points at it.** A trigger never contains a Task Prompt, a report, a finding, or an instruction. It names a path. The receiving session reads that file and acts on what it finds there.

**A trigger never asks the receiving session to run a skill.** Role skills are invocable only by a person: a session asked to invoke one refuses, and the cycle stops with nothing to show for it. Name the bus file instead.

**Sessions are addressed by name,** in the form `<slug>-<stage>.<task>`. A session's return address changes when it is resumed, so an address captured from an earlier message is not reusable.

### 4.5 Worktree Mailbox

A Worker session is isolated in its own worktree, and the platform refuses any file edit that lands in the main checkout - a link that resolves there included. So the Worker never touches the shared `.apm/`. It works against a mailbox: a real `.apm/` directory inside its worktree, laid out like the shared one for the paths a Task uses. The Manager moves files across; the Worker never does.

**The shared `.apm/` is the source of truth.** The mailbox is a working copy for one Task, and it is deleted with the worktree when the session is released. Anything not copied out before then is lost.

**Inward, at dispatch and before every resume.** The Manager writes the Task Prompt to the shared Task Bus first, where the dispatch gate checks it, then copies into the mailbox the Task Bus, the domain's `handoff.md`, an empty `report.md`, the Stage directory of the Task Log, the Worker's Handoff Logs, the change directory of any spec delta, and anything else under `.apm/` the Task Prompt cites.

**Outward, when the report trigger arrives and before anything else.** The Manager copies the mailbox's Report Bus to `.apm/review/<stage>-<task>/report.md`, both numbers zero-padded - the same per-Task directory the review stages its material in - and copies back the Task Log, `handoff.md`, any new Handoff Log, and the change directory of any spec delta. It mirrors the Task Bus - when the Worker cleared its copy, the shared one is cleared too - and then clears the mailbox's Report Bus, so each report is collected once. Only then is the report read, from its per-Task path. Collection always comes before release.

**Reports never pass through the shared Report Bus.** Two sessions of the same domain can report at once, and one shared `.apm/bus/<slug>/report.md` would let the second collection overwrite the first before anyone read it. Each report lands at a path only its own Task uses. The shared Report Bus stays in place for non-APM agents, which write to it directly.

**The paths do not change.** A Worker reads and writes `.apm/bus/<slug>/...` and `.apm/memory/...` exactly as written, relative to its worktree, and the trigger it sends back names the same `.apm/bus/<slug>/report.md` - which, for the Manager, means the one inside that session's worktree.

---

**End of Skill**
