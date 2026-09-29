# APM {VERSION} - Context Gathering Guide

## 1. Overview

**Reading Agent:** Planner

This guide defines the process for Context Gathering - gathering sufficient context to create accurate planning documents that enable structured project execution. Your goal here is to exhaust requirements, constraints, and project context until you have sufficient understanding for the User to approve. Only after the User approves the understanding summary and you read the Work Breakdown guide do you begin decomposing work into planning documents, assigning Workers, or addressing project structure.

---

## 2. Operational Standards

### 2.1 Workflow Context

Context Gathering is the first of two sequential procedures. Understanding what comes next shapes how you gather context - which questions to ask, which to avoid, what depth to reach, and what to research yourself versus what remains for later.

**What your context feeds into.** After Context Gathering completes and the User approves your understanding, you read the Work Breakdown guide and decompose gathered context into three planning documents:
- *Spec:* Project-level design decisions and constraints. The Manager reads the Spec and uses it to construct work assignments for Workers.
- *Plan:* How work is organized - structure, sequencing, and domain-specific details. The Manager uses the Plan for coordination and work assignment construction.
- *Rules:* Execution standards that apply across all or most work assignments. All Workers read the same Rules file.

Workers only see their individual work assignments and Rules - not the Spec, Plan, or any coordination-level documents. What you capture here reaches Workers only through the Manager's extraction into those assignments, so the depth and quality of what you gather directly determines what Workers have to work with. Work Breakdown requires distinguishing project-level decisions from domain-specific details from broadly applicable patterns.

**What happens after planning is complete:** The Manager coordinates the Implementation Phase (assigning work to Workers across domains, reviewing completed work, maintaining project state). The Manager enriches work assignments at runtime with workspace context, findings from completed work, and coordination notes - your documents provide the planning-time substance, the Manager adds what only runtime can determine. All coordination mechanics - version control conventions, how work gets assigned and sequenced between Workers, branch management, workspace isolation, merging - are the Manager's runtime domain.

This shapes Context Gathering in practice. The planning documents need project substance - requirements, constraints, technical decisions, domain knowledge, design rationale. Coordination mechanics are the Manager's runtime concern, so your questions stay focused on the project itself. Each work assignment carries its own validation criteria - capture success states and concrete measures per requirement during Context Gathering, and these become per-assignment criteria during Work Breakdown. Holistic verification beyond individual deliverables - milestone checks, acceptance gates, end-to-end validation - is the Manager's runtime domain. When version control patterns, coordination preferences, or holistic verification needs surface from exploration or User responses, note them as factual observations rather than pursuing them as questions. Technical understanding of existing codebases and systems is Context Gathering research - Workers execute from assignments derived from your documents, so inaccurate understanding here propagates forward.

### 2.2 Guiding Principles

- *Clarity over exhaustion:* Aim for sufficient understanding, not exhaustive interrogation.
- *Leverage existing material:* Use workspace scanning to build an initial understanding before asking questions. Existing materials (README, PRD, requirements, specs) reduce the need for questions when they are confirmed as current. When the workspace contains git repositories, commit history and branch structure are project signals.
- *Authority before deep exploration:* Authority over project-defining materials is established during initiation per `{SKILL_PATH:apm.plan}` §2 - either from the User's front-loaded context or through User confirmation. Deep codebase exploration is based on materials with established authority. When authority is established, explore freely.
- *Explore on signal:* When User responses reference codebase elements, or when authority over discovered materials is established, proactively explore before continuing questions. See §2.5 Exploration and Research Standards.
- *Adapt to context:* Match language and depth to project size, type, and User expertise. Go deeper for large or multi-domain projects, revealed dependencies, or unclear domain boundaries. Stay light for small projects with clear, complete responses.
- *Substance, not coordination:* Do not ask about version control preferences, branching strategies, or how work gets assigned between Workers - the framework handles coordination at runtime. Ask about the project - requirements, constraints, technical decisions, domain knowledge - so that these decisions are fully informed when you reach Work Breakdown after the User approves your understanding.
- *Signals, not structure:* Identify work structure signals (domains, dependencies, complexity) but do not discuss or decide decomposition per §2.1 Workflow Context. Do not use planning vocabulary - Stages, Tasks, Workers, agent names or assignments, tracks, phases, task sizing or workload distribution - in questions, summaries, or exploration prompts. Do not surface internal awareness about document placement, decomposition, or coordination in User-facing output - it implies decisions that have not been made.
- *Iterate within rounds:* Fill gaps in the current round through follow-ups - do not defer to later rounds.

### 2.3 Response and Gap Assessment

When processing User responses, assess what was explicitly stated, what can be reasonably inferred, and what assumptions you are making. Explicit statements are high-confidence. Inferences on critical points should be verified. Assumptions should be flagged for clarification.

**Extraction lens:** Before flagging a gap, assess whether the technical formalization can be derived from what was described naturally. The standard for gap identification is whether responses are sufficient to inform planning - not whether the User stated requirements in technical terms. Raise a follow-up only when what was gathered is genuinely insufficient.

**Ambiguous responses:**
- *Vague:* Rephrase with concrete interpretations.
- *Incomplete:* Acknowledge the covered part and ask for the remainder.
- *Contradictory:* Surface the contradiction neutrally.
- *Uncertain:* Distinguish preferences (probe further) from genuine unknowns (consider research per §2.5 Exploration and Research Standards).

**Gap assessment:** A gap exists when information needed for planning documents is missing, ambiguous, or lacks validation criteria. After each User response, assess what gaps remain and what follow-ups would resolve them. Gaps are resolved by asking directly (missing info), rephrasing and confirming (ambiguity), or proposing concrete criteria (validation).

### 2.4 Round Advancement

Advance when the current round's focus areas are sufficiently covered and further questions would yield diminishing returns. Continue when gaps remain that affect planning document accuracy. Each question round requires at least one interactive exchange with the User before advancement. Retroactive round summaries - summarizing rounds not actually conducted - are prohibited. "Sufficiently covered" requires each focus area addressed through questions, exploration, or explicit acknowledgment it does not apply.

Before advancing, present a round completion summary in chat under the header **Round N Summary:** (where N is the round number). Cover what was gathered in this round, how it informs planning (design decisions, work structure signals, execution patterns), what gaps were identified and how they were resolved, and why the round is ready to advance.

Round summaries present what was learned - do not organize findings into proposed work streams, structural groupings, or decomposition patterns. After Round 1 and 2 summaries, immediately begin the next round. After Round 3, continue to the understanding summary.

### 2.5 Exploration and Research Standards

When User responses or existing material reference codebase elements, or signal that relevant context exists, explore proactively. Do not wait for permission. Dispatch subagents autonomously to build deeper context. When subagent exploration answers some focus area questions but not others, ask the remaining unanswered ones. Ask reassurance and preference questions about big decisions or significant context gathered through exploration.

**After exploration:** Reassess gaps (what is now known, what questions are answered, what new gaps emerged). Subsequent questions target the delta. Present critical findings for confirmation.

**Scope assessment:** Research that builds your understanding of the project - exploring codebases, verifying documentation, resolving technical unknowns - belongs in Context Gathering per §2.1 Workflow Context. Research that is itself a project deliverable belongs in the Plan. Only defer when research is a project deliverable or the User explicitly requests deferral.

**Self-explore vs subagent:** For focused investigation (specific files, targeted questions, quick lookups), self-explore directly. For substantial research (cross-codebase exploration, extensive investigation), {PLANNER_SUBAGENT_GUIDANCE}

**After subagent results return:** Read the key files or paths the subagent references to confirm critical claims directly - subagent summaries compress details and can misrepresent what matters for planning. When verification contradicts the subagent's findings or reveals important context that needs deeper investigation, dispatch a follow-up subagent with a more targeted scope to resolve the discrepancy, then verify the follow-up's claims in turn. Present a concise summary of verified findings to the User (what was found, what it means for the project, and any alternatives or tradeoffs discovered). If the findings complete the round's remaining questions, include the research summary as a dedicated section in the round advancement. If gaps remain, present findings within the follow-up iteration and continue with unanswered questions.

**Decision authority:** When gathered context, whether from research, User input, codebase exploration, or your own understanding, reveals multiple viable approaches to an architectural or design question, present the alternatives with tradeoffs and a recommendation with justifiable reasoning. The User decides which approach to take. When a single clear approach emerges, present it with supporting evidence and proceed unless the User redirects.

---

## 3. Context Gathering Procedure

Archive and workspace context setup (building on initiation), a review of work deferred by earlier sessions, knowledge layer discovery, a bounded ambiguity resolution pass, three progressive question rounds with iterative follow-ups until each round's focus areas are sufficiently covered, and a finalization with a consolidated understanding summary for User approval. Complete each step before proceeding to the next. Present your work as natural analytical discussion - do not reference guide sections, procedure names, or steps in User-facing output.

### 3.1 Pre-Round Context

Read the APM_RULES block from `{RULES_FILE}`, or from `CLAUDE.md` when that file does not contain it.

**Archives:** If archives were identified as relevant during initiation, explore them now. For each relevant archive, {ARCHIVE_EXPLORER_GUIDANCE}. Verify archived findings against the current codebase using the handles the archive explorer provides per §2.5 Exploration and Research Standards. Integrate verified context as a baseline - focus subsequent questions on delta rather than re-establishing what was already known.

**Deep exploration:** When the workspace contains codebases relevant to the project, explore all of them before entering question rounds - not selectively. Questions asked without baseline knowledge of a relevant codebase will be poorly targeted. For substantial research, {PLANNER_SUBAGENT_GUIDANCE}

**`{RULES_FILE}`:** If `{RULES_FILE}` was found during initiation, present its contents to the User. Explain that during Work Breakdown an APM_RULES block will be added where APM-specific standards will go, and that existing content outside the block will be preserved and referenced. Ask if the User wants to consider any modifications to existing contents alongside the APM Rules block. If not found, note its absence for the Rules configuration step in Round 1.

Present what was found as the opening of the first interaction - the workspace summary and Round 1 questions are delivered together. Use findings to skip redundant questions and focus rounds on what is not yet understood.

### 3.2 Deferred Work Review

Runs after exploration and before the question rounds. Do not ask the User whether anything from earlier sessions is still relevant. Work that survives only if someone remembers to raise it does not survive: an artifact carries across sessions when reading it is a numbered step of the procedure that opens the next one, and not otherwise.

Perform the following actions:
1. Read the `## Tracker` block per `{GUIDE_PATH:work-breakdown}` §4.5 Project Declaration Blocks and run the command its `query` key declares. When no `## Tracker` block is declared yet, as in a project planned for the first time, run the `query` command of the default `file` tracker from that section if `.apm/backlog.md` exists, otherwise state that there is no deferred work to read. In both cases state that the default tracker is declared when the Rules are written, and continue to the next action.
2. Read the section headed exactly `Deferred work` in the most recent archived session summary under `.apm/archives/`. The heading is a literal, not a description: the summary writes that string and this action matches it, so a renamed heading is found by nothing and reported by nothing. When no archive exists, or the summary carries no such section, state that and continue.
3. Read `substrate-audit.md` from that same archive when the file is present. When it is absent, state that and continue.
4. Present everything collected in the previous actions as a table per §4.1 Deferred Work Table Format. Every item carries one of the three verdicts - none may be presented without one.

### 3.3 Knowledge Layer Discovery

Runs after workspace exploration and before the question rounds. The decision belongs here rather than in the installer for two reasons: the installer runs before anything about the project is known, which is the worst moment to choose, and it cannot check a claim about a vault, while a procedure already inspecting the workspace can.

Perform the following actions:
1. Read the `## Knowledge layer` block per `{GUIDE_PATH:work-breakdown}` §4.5 Project Declaration Blocks. When it is already declared, state the vault it points at and continue to §3.4 Ambiguity Resolution.
2. Look for an existing vault: a `.claude-obsidian.json` marker in the workspace or any of its ancestors, or the consumer's diagnostic reporting `"ok": true` for a candidate directory. For the default consumer the diagnostic is `python3 <command path> doctor --vault <candidate>`, which prints a JSON report and exits non-zero when the candidate is not a vault.
3. If a vault was found, declare the `## Knowledge layer` block for it and continue.
4. If no vault was found, ask the User whether this project should have a knowledge layer:
   - If yes, run `apm knowledge init`, then declare the block the command prints. The command prints the block and does not write it, so between installing a vault and the guides being able to find it there is a manual step that nothing else verifies - this action is what closes it.
   - If no, declare nothing and continue.

Declarations made here are written into the APM_RULES block during Work Breakdown per `{GUIDE_PATH:work-breakdown}` §3.3 Rules Analysis. When the block does not exist yet, record the declaration and carry it there.

### 3.4 Ambiguity Resolution

Runs once per objective, after exploration and before the question rounds. The rounds that follow are unchanged - this precedes them so they spend their questions on what is still open rather than on decisions that could have been closed here.

Perform the following actions:
1. Build a coverage map over the taxonomy below, marking each category `Clear`, `Partial`, or `Missing`. The map is working material - it reaches the User only through the closing table.
2. Raise a candidate question for each category marked `Partial` or `Missing`. Discard any candidate whose answer would not materially change execution or validation.
3. Rank the surviving candidates by impact multiplied by uncertainty and keep at most five. Five is the ceiling for the whole objective, not per category.
4. Ask one question at a time and do not reveal the queue behind it. Each question is answerable either by choosing among two to five mutually exclusive options or by an answer of five words or fewer, and each carries an explicit recommendation together with the reason for it.
5. Integrate each answer as it arrives, into the area of your working understanding it affects, so the next question is asked against updated ground. When a clarification invalidates something already concluded, replace that conclusion rather than recording both - leave no obsolete contradictory text behind, in the working understanding or in what you later present.
6. Close with a coverage table per §4.2 Coverage Table Format.

**Default taxonomy.** Seven categories, used unless the project declares its own:
- *Functional scope:* what the deliverable does, what it explicitly does not do, and who it serves.
- *Data and state:* entities and their relationships, identity and uniqueness rules, lifecycle and state transitions, volume assumptions.
- *Technical constraints:* language, storage, hosting, versions, and the tradeoffs already accepted or ruled out.
- *Validation and acceptance:* how each requirement is verified and where the pass boundary sits.
- *External dependencies:* services, APIs, and data exchange formats, with their failure modes.
- *Non-code deliverables:* documentation, migrations, fixtures, configuration, and anything else shipped alongside the code.
- *Operation and deployment:* how the deliverable is run, released, observed, and recovered.

A project that needs different categories declares them in the APM_RULES block of `{RULES_FILE}`. When the block declares a taxonomy, use it in place of the seven above.

### 3.5 Round Iteration

These rules apply across all three question rounds.

**Iteration cycle.** For each question round:
1. Ask the initial questions defined for the round.
2. After each User response, assess gaps per §2.3 Response and Gap Assessment.
3. Follow up on gaps or advance per §2.4 Round Advancement. When subagents are dispatched during the round, verify and present findings per §2.5 Exploration and Research Standards before continuing.
4. Repeat until the round's focus areas are sufficiently covered.

Combine related questions naturally in conversation. Track what has been answered - ask only for what is missing.

**Open elicitation:** Before each round's completion summary, include a broad open-ended question targeting what the focused questions may have missed. Generate it dynamically from what has not been covered (review what was gathered, identify categories within the round's theme that received no attention, and ask about those gaps specifically). Do not use a fixed set of example topics. The open-ended question should not block round advancement - the User can address it together with the next round's questions if they prefer.

**Validation criteria gathering:** Capture success states and criteria for each requirement. If the User does not specify how a requirement will be validated, propose concrete measures and ask for their guidance. Integrate validation gathering into Rounds 2 and 3 follow-ups.

### 3.6 Question Round 1: Existing Materials and Vision

**Focus areas:** Project type and deliverables, problem and purpose, essential features and scope, required skills and expertise, existing documentation and materials, current plan or vision, previous work and codebase context.

**Initial questions.** Select and adapt from these areas:
1. What type of deliverable(s) are you creating?
2. What problem does the project solve? What defines success and completion?
3. What are the essential features, sections, or deliverables?
4. What skills or expertise areas does this involve?
5. Do you have existing materials? (PRD, requirements, user stories, architecture, code, templates)
6. What is your current plan or vision?
7. If there is an existing codebase or previous work, what are the important files or documentation?

**Rules configuration:** If `{RULES_FILE}` was not found during §3.1 Pre-Round Context, ask the User - "I didn't find an existing `{RULES_FILE}` in your workspace. Do you have one elsewhere, or should we create one during Work Breakdown?" If the User provides a file, read it and note contents for integration. If `{RULES_FILE}` was found during the workspace assessment, it has already been discussed with the User - no need to revisit here.

**Round completion:** Present a round completion summary per §2.4 Round Advancement. You must have sufficient understanding of project foundation, problem and success criteria, essential scope, skills and expertise, existing context, and User vision.

### 3.7 Question Round 2: Technical Requirements

**Focus areas:** Design decisions and constraints, work structure and dependencies, technical and resource requirements, complexity and risk assessment, validation criteria.

**Initial questions.** Select and adapt from these areas:

*Work Structure and Dependencies:*
- Which parts can be done independently vs need sequential order?
- What are the most challenging aspects?
- Any dependencies between different parts of the work?

*Technical and Resource Requirements:*
- Does this work involve different technical environments or platforms?
- What is the deployment/delivery environment?
- External resources needed? (data sources, APIs, libraries)
- What actions require access outside the development environment?
- Which deliverables can be prepared/built within the development environment vs require external platform interaction?

*Complexity and Risk Assessment:*
- What is the target timeline or deadline?
- What are the anticipated challenging areas or known risks?
- Any parts requiring external input or review before proceeding?

*Existing Assets (if building on previous work):*
- What is the current structure and key components?
- What existing functionality should be preserved or modified?

*Emerging Design Decisions:*
- What has already been decided about technical direction, tools, or approaches - and what remains open?
- Are there things that are definitely in or out of scope?

**Round completion:** Present a round completion summary per §2.4 Round Advancement. You must have sufficient understanding of design decisions and constraints, work structure and dependencies, technical requirements, complexity and risk factors, and validation criteria for core requirements.

### 3.8 Question Round 3: Implementation Approach and Quality

**Focus areas:** Technical constraints and preferences, workflow preferences, quality standards, project-level coordination and approval requirements (external reviews or validation, stakeholder sign-offs, approval gates), domain organization, design decisions and constraints.

**Initial questions.** Select and adapt from these areas:

*Technical Constraints and Preferences:*
- Required or prohibited tools, languages, frameworks, or platforms?
- Performance, security, compatibility requirements?
- Setup, configuration, or deployment steps requiring specific account access?

*Workflow Preferences:*
- Specific workflow patterns, quality standards, or validation approaches preferred?
- Coordination requirements, review processes, or approval gates to build into the work structure?

*Consistency and Documentation:*
- Consistency standards, documentation requirements, or delivery formats?
- Examples, templates, or reference materials illustrating preferred approach?

*Domain Organization (if distinct domains identified in earlier rounds):*
- Would related domains benefit from unified handling or separate parallel progress?
- Natural handoff points between different types of work?
- Parts requiring deep domain expertise vs general implementation skills?

*Design Decisions and Constraints:*
- Have you already settled on specific approaches, tools, or ways the project should work - or is that still open?
- Is there anything that's definitely in or out of scope?
- Are there important reasons or principles behind the direction you've chosen - things that ruled other approaches out?

**Round completion:** Present a round completion summary per §2.4 Round Advancement. You must have sufficient understanding of technical constraints, access and coordination needs, workflow preferences, quality and validation standards, domain organization, documentation expectations, and design decisions with their rationale and constraints.

### 3.9 Finalize Understanding

After completing the three question rounds, present gathered context for User review.

Perform the following actions:
1. Assess gathered context: what was resolved through exploration, what through questions, and what genuinely remains unresolved for implementation. Present an understanding summary consolidating all gathered context per §4.3 Understanding Summary Format.
2. Pause for User review. Present a checkpoint:
   - State that all question rounds are complete and understanding is presented.
   - Ask the User to review carefully before planning document generation.
   - Offer options: modifications needed (describe issues) or approved (proceed to Work Breakdown).
   - If modifications needed, apply targeted follow-ups, update summary, and repeat step 1.
   - If approved, continue to step 3.
3. Output procedure completion stating Context Gathering is complete. The next step is the Work Breakdown procedure per `{GUIDE_PATH:work-breakdown}` §3 Work Breakdown Procedure.

---

## 4. Structural Specifications

### 4.1 Deferred Work Table Format

The table closes Deferred Work Review per §3.2 Deferred Work Review. It is presented in chat, one row per item collected from the declared tracker, the last archived session summary, and the last substrate audit.

**Structure:**

```markdown
| Item | Source | Verdict | Reason |
| ---- | ------ | ------- | ------ |
| <item title, carrying its link when the source provides one> | <where it came from> | Enters this Spec | <what changed to make it current> |
| <item title> | <where it came from> | Stays deferred | <what still blocks it> |
| <item title> | <where it came from> | Closed | <why it no longer applies> |
```

**Field descriptions:**
- `Item`: the item's title, carrying its link when the source provides one.
- `Source`: the declared tracker, the archived session summary, or the substrate audit.
- `Verdict`: `Enters this Spec` when the item becomes part of the current objective, `Stays deferred` when it remains in the tracker untouched, `Closed` when it no longer applies and the tracker item is closed so it stops reappearing.
- `Reason`: what decided the verdict.

Every item gets exactly one verdict. An item presented without one is the failure this table exists to prevent - it reads as reviewed while nothing was decided about it.

### 4.2 Coverage Table Format

The coverage table closes Ambiguity Resolution per §3.4 Ambiguity Resolution. It is presented in chat, one row per taxonomy category, and it is what makes the questioning auditable rather than a matter of trust.

**Structure:**

```markdown
| Category | Status | Note |
| -------- | ------ | ---- |
| <category name> | Resolved | <the clarification that closed it> |
| <category name> | Deferred | <why it was not asked, and where it is handled instead> |
| <category name> | Clear | <what already covered it> |
| <category name> | Outstanding | <what remains open and why the impact is low> |
```

**Status values:** `Resolved` for a category that was `Partial` or `Missing` and was addressed. `Deferred` for one left unasked because the five-question ceiling was reached or because it belongs in Work Breakdown. `Clear` for one that needed nothing. `Outstanding` for one still `Partial` or `Missing` at low impact. Every category appears exactly once. When any row is `Deferred` or `Outstanding`, say so explicitly rather than letting the table speak for itself.

### 4.3 Understanding Summary Format

The understanding summary is presented per §3.9 Finalize Understanding for User review. It consolidates everything gathered across the three question rounds into a coherent picture of the project.

**Structure:** Use free-form markdown. Choose whatever structure best communicates the project - headings, tables, lists, mermaid diagrams, prose, or any combination. Adapt the format to the project's nature and complexity.

**Required coverage** (order and presentation are flexible):

- *Requirements and deliverables:* essential features, scope, success criteria
- *Design decisions and constraints:* choices made where alternatives existed, rationale, constraints that bound what's being built
- *Work structure signals:* identified domains, dependency relationships, complexity indicators, parallelism or sequencing constraints the User specified. Present as observed project characteristics, not proposed work structures. Do not organize signals into tracks, phases, groups, or hierarchies - list what was observed, not how it should be organized.
- *Technical context:* environments, resources, constraints, access needs
- *Process and quality:* workflow preferences, coordination requirements, approval gates, validation approach
- *Execution conventions:* broadly applicable patterns or coding standards the User has specified; note whether an existing `{RULES_FILE}` was found.
- *Observed preferences:* version control patterns, coordination preferences, or other factual observations that surfaced during exploration or User responses.

The understanding summary captures what was gathered - not how it will be decomposed. Decomposition happens in the next procedure. Use diagrams for relationships, tables for structured comparisons, prose for narrative context. Do not force entries for categories where nothing emerged. The summary should be something the User can review and say "yes, you understand my project" or point out what's wrong.

---

## 5. Common Mistakes

- *Repetition across rounds:* Asking the same question in different words in later rounds. Track what has been answered.
- *Skipping validation criteria:* Accepting requirements without understanding how success will be verified. Every requirement needs concrete criteria.
- *Silent research absorption:* Dispatching subagents, receiving results, and distilling them into summaries without showing the User what was found. Present research findings to the User before incorporating them - the User catches errors you cannot.
- *Unverified subagent claims:* Accepting subagent findings as authoritative without reading the referenced files directly. Subagent summaries compress details and can misrepresent what matters for planning - claims that enter the Spec unverified mislead Workers downstream.
- *Autonomous architectural decisions:* Selecting a technical approach based on research without presenting viable alternatives and tradeoffs to the User. Architectural choices that shape what Workers build require User decision.

---

**End of Guide**
