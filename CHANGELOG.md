# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning (SemVer)](https://semver.org/spec/v2.0.0.html) for the **core CLI package** published on NPM.

> **Note:** APM uses a decoupled versioning system. The CLI (`apm-strata`, a tarball attached to each release; `agentic-pm` on NPM upstream) and template releases (GitHub Releases) version independently but share major version for compatibility. This changelog primarily tracks CLI changes, but major template releases may also be noted. See [VERSIONING.md](VERSIONING.md) for full details.

---

## [1.1.0] - Unreleased

The `apm-strata` fork: Claude Code only, roles as skills, native dispatch, and review by
adversarial lenses. See the README for the design and the provenance of each adapted
mechanic.

### Breaking Changes

* **Claude Code only.** Every other target was removed from the build, including the
  Antigravity support added but never released under `[1.0.2]` below. A release is now a
  single `claude.zip` bundle plus its `apm-release.json` manifest. Guides may assume
  subagents, background sessions and hooks, which is what makes the rest of this list
  possible.

* **Commands became skills.** The nine numbered slash commands were replaced by nine named
  skills: `/apm.plan`, `/apm.manage`, `/apm.work`, `/apm.task`, `/apm.review`,
  `/apm.handoff.manager`, `/apm.handoff.worker`, `/apm.summarize` and `/apm.recover`.
  `templates/commands/` no longer exists.

* **The rules file moved to `CLAUDE.local.md`.** Rules are local project state, and the
  platform loads `CLAUDE.local.md` with the same discovery it gives `CLAUDE.md`, so a
  project can version its own `CLAUDE.md` without carrying the `APM_RULES` block. An
  installation created before this release keeps its block in `CLAUDE.md`; the planning
  procedure moves it the next time it runs.

* **The CLI is renamed to `apm-strata` and installs from the tarball attached to each
  release,** not from npm and not from git. Sharing upstream's name made a global install
  fail wherever upstream was already installed, and a global install from git links a
  directory in npm's cache instead of installing the package. See the README for the URL.

* **`apm-assist` was removed.** It described the upstream command set and migration from
  v0.5.x, neither of which applies to this fork.

### Added

* **Native dispatch.** The Manager dispatches Workers directly instead of asking a human to
  carry messages between chats. Approval gates stay where they were; the courier role goes.

* **Review by lenses.** Findings come from five context-free subagents run in parallel and
  blind to each other - adversarial, edge case, verification gap, acceptance and editorial -
  against prepared material that isolates the author's claims. The coordinator does not read
  the artifact; it triages verified findings. Findings carry exactly four fields and no
  severity.

* **Two hooks.** A `PreToolUse` dispatch gate that blocks a write to a Task Bus file while a
  checklist has an unchecked box or the Task is blocked by an open deferred item, and a
  `PreCompact` reminder that points a compacted agent at the recovery skill. `apm init`,
  `apm custom`, `apm add` and `apm update` declare them in `.claude/settings.json`;
  `apm remove` withdraws them, leaving hooks of your own untouched.

* **Spec deltas.** `apm delta validate` checks `ADDED` / `MODIFIED` / `REMOVED` requirement
  blocks against the spec they change, enforcing four rules. The format comes from OpenSpec;
  the validator is this repository's own, because the external one exited zero on an
  unmatched requirement key. Documented in `docs/deltas.md`.

* **Knowledge layer.** `apm knowledge init`, `apm knowledge emit` and `apm knowledge audit`
  scaffold a knowledge substrate, ingest a Task Log into it as claims with provenance, and
  audit what is there. The consumer is pluggable; the command knows nothing tool-specific.

* **Bounded ambiguity resolution** in context gathering: a Clear / Partial / Missing scan, a
  ceiling of five questions selected by impact, one question at a time, integrated after each
  answer, closing with a coverage table.

* **Requirement quality checklists**, whose tick means a reviewer confirmed the quality of a
  requirement and never that the implementation is done. No agent ticks a box, including one
  it is sure about. The dispatch gate reads the boxes and does not write them.

* **A size guard** before Plan approval that proposes narrowing the objective when it counts
  more than one independent deliverable, and records the rejected split when the human keeps
  the full scope.

* **A long-horizon backlog** that survives session archival, and deferred entries whose gate
  blocks dispatch until they are cleared.

* **An archive explorer subagent** for pulling context out of archived sessions.

* **A test suite**: 239 tests over the build, the CLI, the hooks and the template contracts,
  where there was none.

* **`docs/measurements.md`**, two measurement protocols for design claims that are currently
  argued rather than measured.

### Changed

* **Rules are loaded as a step.** Ten procedural files now begin by reading the `APM_RULES`
  block rather than relying on it having been in context since the start. The block still
  lives in exactly one place; no guide copies a rule.

* **Writing the rules block replaces instead of appending.** Both candidate rules files are
  searched, so a block left behind by an archived session or a renamed file cannot end up
  duplicated with the wrong one winning.

* **The build fails loudly.** Unknown frontmatter keys are warned about, and the surfaces that
  used to fail silently now fail with a message that names what is wrong.

### Removed

* Every non-Claude build target, `templates/commands/`, the `apm-assist` skill, and the
  placeholder and error surfaces nothing reached.

### Upgrade Notes

Two things an existing installation does not get on its own.

* **The hook declarations do not arrive until you reinstall or update.** The bundle carries
  the hook scripts, but what makes the platform run them is a declaration in
  `.claude/settings.json`, written by the CLI. An installation made before this release has
  the scripts and no declaration, and nothing says so: the dispatch gate is simply not armed.
  Run `apm update` (or reinstall) to have the declarations merged in. Hooks of your own in
  that file are left alone.

* **The rules block is looked for in a different file.** Agents now read `APM_RULES` from
  `CLAUDE.local.md`, while an installation made before this release has it in `CLAUDE.md`.
  The planning procedure searches both and moves the block to the destination the next time
  it runs, deleting the duplicate, so this resolves itself - but until it does, an agent
  started against the old file finds no block.

## [1.1.0-alpha.2] - 2026-09-29

The second pre-release of 1.1.0. It lists only what changed since `v1.1.0-alpha.1`, which
shipped what the `[1.1.0]` entry above describes. That entry stays the description of the
fork as a whole and is not dated until the stable release.

### Fixed

* **Planning declares a tracker when the project names none.** It writes a `## Tracker`
  block of type `file`, with `query` and `create` commands over `.apm/backlog.md`, and
  creates that file when it is missing, leaving an existing one untouched. The templates
  used to promise a default backlog that nothing declared or created, so reading deferred
  work, deferring a review finding and querying the backlog had no command to run.

* **A spec delta gets the baseline it is checked against.** When a change to existing work
  has no baseline, one is written from the current code before the delta, covering only
  the requirements its `MODIFIED` and `REMOVED` blocks name. Nothing used to create
  `.apm/openspec/`, so deltas were never written.

* **Each change keeps its baseline and delta in its own directory,**
  `.apm/openspec/<change>/`, named after the branch with `/` replaced by `-`. The
  directory is validated at its `changes` subdirectory, never rewritten by the person doing
  the change, and deleted when the branch is merged. A shared root let two concurrent
  changes to the same capability overwrite each other's baseline.

* **A Worker's worktree gets copies of the installed bundle, the settings files and the
  Rules file before the session starts.** The entries come from `installedFiles` in
  `.apm/metadata.json`. The bundle is git-ignored, so a session launched in its own
  worktree could not see it and failed with `Unknown skill`. The files are copies and not
  links, because through a link each read asked for a permission and a background session
  stalled waiting for it.

* **A Worker's worktree gets a real `.apm/` mailbox instead of a link to the shared one.**
  From Claude Code 2.1.284, a session isolated in its worktree cannot write into the main
  checkout, a link included, so a Worker behind the link could not write its log or its
  report. The mailbox keeps the same relative paths. It is filled when the work is
  dispatched and collected when the report arrives, always before the session is released,
  and the shared `.apm/` stays the source of truth.

* **Releasing a Worker session no longer needs `--force`.** The copies and the mailbox are
  excluded from git, so the worktree stays clean and `claude rm` releases it. The force
  was covering an untracked file in the worktree.

* **A `.apm/` entry with a trailing slash in `.gitignore` no longer blocks anything.** The
  rule only mattered for the link, which is gone.

* **`apm archive` withdraws the hook declarations from `.claude/settings.json`.** It used
  to delete the hook scripts and leave the declarations pointing at files that no longer
  existed. The withdrawal runs before anything else is touched, and the output says the
  file changed.

* **`apm update` withdraws the hook declarations when it reinstalls no bundle,** for the
  same reason.

* **`npm test` no longer writes a real `.claude/settings.json` into the repository.** A
  test of `apm init` did.

### Changed

* **`apm archive` refuses to run when `.claude/settings.json` is not valid JSON,** and
  changes nothing when it refuses.

* **The Manager's guide names two traps in resuming a session:** `claude stop` returns
  before the session has exited, and resuming with flags starts a copy instead of the
  session.

* **The default tracker's `create` command places the title and origin inside a shell
  string and a table row,** so neither may contain `|`, double quotes, `$`, backticks or
  backslashes.

### Upgrade Notes

* **Reinstall to get the new guides.** An existing installation keeps the guides it was
  installed with until you run `apm update` or reinstall.

* **A Manager still on the previous guide links `.apm` into each Worker's worktree.** On
  Claude Code 2.1.284 or later those Workers cannot write their log or their report.
  Update before dispatching again.

* **Archiving can now refuse.** If `.claude/settings.json` is not valid JSON, `apm archive`
  stops before moving or deleting anything. Fix the file and archive again.

## [1.0.2] - Unreleased

### Breaking Changes

* **Gemini CLI Migration:** Transitioned support from Gemini CLI to the new Antigravity platform. The configuration directory has moved from `.gemini` to `.agents`, and the rules file has been renamed from `GEMINI.md` to `AGENTS.md`. Output format has been updated from TOML to Markdown.

### Added

* **Antigravity Support:** Full support for the new Antigravity (CLI and IDE), including optimized directory structure (`.agents/workflows/`, `.agents/skills/`) and agent-first subagent guidance.

## [1.0.1] - 2026-04-24

### Fixed

* **Codex CLI fixes:** Resolved issues with Codex CLI command invocation and path handling.

## [1.0.0] - 2026-04-12

v1.0.0 is a complete redesign of the APM workflow. The scope of changes across both the codebase and the workflow itself is too large to cover exhaustively here. This is a concise summary of the most significant changes. For the full specification, see the [documentation](https://github.com/sdi2200262/apm-website/tree/main/docs).

### Breaking Changes

* **Workflow redesigned.** Two-phase workflow: Planning Phase (Context Gathering + Work Breakdown) produces three planning documents (Spec, Plan, Rules). Implementation Phase cycles through Task Assignment, Task Execution, Task Logging, and Task Review, with support for batch and parallel dispatch across multiple Workers. All coordination is User-mediated through a file-based Message Bus, with Agents guiding the User at every step.

* **Agent roles changed.** Setup Agent → Planner. Implementation Agent → Worker. Ad-Hoc Agents removed (subagents are now spawned natively by Planner, Manager, and Workers). Manager unchanged.

* **9 commands** (up from 5): `apm-1-initiate-planner`, `apm-2-initiate-manager`, `apm-3-initiate-worker`, `apm-4-check-tasks`, `apm-5-check-reports`, `apm-6-handoff-manager`, `apm-7-handoff-worker`, `apm-8-summarize-session`, `apm-9-recover`.

* **New artifact structure.** Spec (`.apm/spec.md`), Plan with dependency graphs (`.apm/plan.md`), Rules (platform rules file), Tracker (`.apm/tracker.md`), Memory hierarchy (`.apm/memory/` with Index, Task Logs, Handoff Logs). Replaces Implementation Plan and Memory Root.

* **Platform support narrowed** to Claude Code, Cursor, GitHub Copilot, Antigravity, and OpenCode.

* **Template file structure changed.** Commands in `templates/commands/`, guides in `templates/guides/`, skills in `templates/skills/`, agents in `templates/agents/`. Governed by `templates/_standards/` (WORKFLOW.md, TERMINOLOGY.md, STRUCTURE.md, WRITING.md).

* **CLI redesigned.** New commands: `apm archive`, `apm add`, `apm remove`, `apm status`, `apm custom`. `apm init` is fresh-install only. Per-file install tracking via `installedFiles` in metadata.

* **Decoupled versioning.** CLI and templates version independently. Template releases use standard SemVer. See [VERSIONING.md](VERSIONING.md).

### Added

* **Message Bus** (`.apm/bus/`): file-based Agent communication with Task Bus, Report Bus, and Handoff Bus per Worker.
* **Session continuation:** archive completed sessions, start fresh with archived context carried forward via Planner detection.
* **Recovery command** (`/apm-9-recover`): reconstructs working context after platform auto-compaction.
* **Handoff system:** structured context transfer between Agent instances with Handoff Log (persistent) and Handoff Prompt (ephemeral).
* **Standalone skills** (`skills/`): independently installable skills for migration and customization.
* **Custom repository support** (`apm custom`): install templates from forked or third-party repositories.
* **Build pipeline** (`build/`): processes templates into platform-specific bundles with placeholder system, TOML conversion for Gemini, and `apm-release.json` manifest.
* **Modular CLI architecture** (`src/`): commands, services, core, UI, and schemas modules.

### Removed

* Ad-Hoc Agents and Delegate commands.
* Implementation Plan, Memory Root, and `guides/` directory format.
* Support for Windsurf, Kilo Code, Roo Code, Auggie CLI, Google Antigravity, and Qwen Code.
* Legacy build system (`scripts/build.js`).

---

## [0.5.4] - 2026-01-24

### Added

* **Google Antigravity Support:** Added support for Google Antigravity as the 11th AI assistant.

### Deprecated

* **Bootstrap Prompt:** The Bootstrap Prompt has been deprecated and will be removed in v1.0.0.

---

## [0.5.3] - 2025-12-05

### Fixed

* **NPM Package:** Fixed `.npmignore` to exclude `dist/` directory from published package. Previous releases (v0.5.2 and earlier) incorrectly included build artifacts (zip files) in the npm package.

---

## [0.5.2] - 2025-11-26

### Added

* **Header Templates:** CLI now creates `Implementation_Plan.md` and `Memory_Root.md` with pre-filled header templates containing placeholders. Setup Agent must fill Implementation Plan header before Project Breakdown, and Manager Agent must fill Memory Root header before first phase execution.

### Changed

* **Workflow Streamlining:** Removed Enhancement phase and `Implementation_Plan_Guide.md`. Setup workflow now consists of 4 steps instead of 5, with structured file format built directly into Project Breakdown Guide.
* **Context Synthesis:** Renamed terminology from "Phase" to "Question Round" with stricter sequence enforcement and mandatory completion requirements.
* **Error Handling:** Strengthened Implementation Agent error handling protocol with 3-attempt limit before mandatory delegation (increased from 2 attempts).
* **Project Breakdown:** Added stricter instructions for interleaved Project Breakdown sequence with strict guardrails to prevent pattern matching and ensure quality task breakdown.
* **Task Assignment:** Added Reporting Protocol requiring Implementation Agents to output Final Task Report code blocks for better UX.
* **Agent Management:** Added Agent Name Registration & Assignment Validation protocol for Implementation Agents to prevent task assignment errors.

### Removed

* **Implementation_Plan_Guide.md:** Removed separate Enhancement guide. Structured format now integrated directly into Project Breakdown Guide workflow.

---

## [0.5.0] - 2025-10-29

### Added

* **NPM CLI Tool (`agentic-pm`):** Introduced a command-line interface for managing APM installations.
* **`apm init` Command:** Automates project setup, including AI assistant selection, asset download from GitHub Releases, and creation of the `.apm` directory structure (`.apm/guides`, `.apm/Memory`, `.apm/Implementation_Plan.md`, `.apm/metadata.json`). By default, automatically finds and installs the latest template version compatible with the current CLI version. Supports `--tag <tag>` option for installing specific template versions (e.g., `apm init --tag v0.5.0+templates.1`).
* **`apm update` Command:** Allows users to update their local APM installation to the latest compatible template version. Includes intelligent version compatibility checking that compares installed templates against available releases, only updating if a newer compatible build exists. Informs users when newer templates require a CLI update via `npm update -g agentic-pm`. Includes backup and restore functionality for safe updates.
* **Version Compatibility System:** Dynamic CLI version reading from `package.json` with automatic template version matching. The CLI automatically finds templates compatible with the running CLI version and compares build numbers for update decisions.
* **Support for 10 AI Assistants:** CLI downloads and installs specific bundles tailored for Cursor, GitHub Copilot, Claude Code, Antigravity, Qwen Code, OpenCode, Windsurf, Kilo Code, Auggie CLI, and Roo Code.
* **Build Process (`npm run build`):** New script (`scripts/build.js`) processes source templates (`templates/`) into distributable bundles (`dist/`) for each assistant, handling formatting (Markdown/TOML) and placeholders.
* **Metadata File (`.apm/metadata.json`):** Tracks the installed APM version (template tag) and selected AI assistant within the project.
* **`Troubleshooting_Guide.md`:** Added a dedicated guide based on the v0.4 User Guide's troubleshooting section.

### Changed

* **Installation Method:** APM is now installed via NPM (`npm install agentic-pm`) instead of Git clone or GitHub Template.
* **Customization Workflow:** Customization is now done by editing files locally within the `.apm/guides/` directory or the assistant-specific command directory *after* running `apm init`. Acknowledged as a work-in-progress for improving flexibility.
* **Source File Structure:** Core prompt and guide templates moved to the `templates/` directory in the repository. The `/prompts` directory is no longer the source or user-facing structure.
* **Prompt/Guide Compliance:** Updated all agent initiation prompts, handover prompts, and core guides (`Memory_System`, `Memory_Log`, `Task_Assignment`, `Implementation_Plan`, `Project_Breakdown`, `Context_Synthesis`) to be v0.5 compliant:
    * Removed all instructions related to actions now handled by the CLI (e.g., Asset Verification).
    * Added CLI awareness to the Setup Agent.
    * Removed all references to JSON assets.
    * Removed all references to the Simple Memory system.
* **File Re-branding & Relocation:**
    * `Context_Synthesis_Prompt.md` re-branded to `Context_Synthesis_Guide.md` and moved conceptually to the guides directory.
    * `Manager_Agent_Handover_Guide.md` re-branded to `Manager_Agent_Handover_Prompt.md` with command name `handover-manager`.
    * `Implementation_Agent_Handover_Guide.md` re-branded to `Implementation_Agent_Handover_Prompt.md` with command name `handover-implementation`.
* **Documentation Update:** Updated `README.md` (main), `docs/README.md`, `CONTRIBUTING.md`, `Getting_Started.md`, `Introduction.md`, `Workflow_Overview.md`, `Modifying_APM.md`, `Agent_Types.md`, and `Token_Consumption_Tips.md` to reflect all v0.5 changes, including CLI usage, new file structures, deprecations, and customization workflow. Removed references to now-obsolete PDF guides.

### Deprecated

* **JSON Asset Format:** No longer supported for Implementation Plans or Memory Logs.
* **Simple Memory Bank:** The single-file `Memory_Bank.md` strategy is no longer supported. APM v0.5 exclusively uses the Dynamic-MD system.

### Removed

* **GitHub Template:** The "Use this template" approach for installation and customization is removed in favor of the CLI.
* **User-facing `/prompts` Directory:** The structured `/prompts` directory is no longer part of the user installation; assets are placed directly by the CLI.
* **PDF Guides:** `APM_Quick_Start_Guide.pdf` and `APM_User_Guide.pdf` are removed from the documentation set; relevant content integrated into Markdown files.

---

## [0.4.0] - 2025-08-19

APM v0.4 represents a complete framework refinement. The v0.3 architecture is enhanced to provide a more sophisticated, scalable approach to multi-agent project management while maintaining the core principles that made APM effective.

### Major Changes

**Architecture Enhancements**
- **Expanded from 2 to 4 agent types**: Added Setup Agent for project initialization and Ad-Hoc Agents for specialized delegation
- **Two-phase workflow**: Setup Phase for comprehensive planning, Task Loop Phase for execution
- **Advanced memory system**: Dynamic Memory Bank with multiple variants and progressive creation
- **Sophisticated dependency management**: Cross-agent coordination with comprehensive context integration
- **Handovers are now practical context repair mechanisms** not just context dumps, with built-in safety and validation steps

**Complete File Structure Overhaul**
- All prompts redesigned and reorganized under new directory structure
- New `docs/` directory with comprehensive updated documentation
- Added `schemas/` directory with experimental JSON asset format for testing/research preview

**Enhanced Capabilities**
- **Systematic project discovery**: 4-phase Context Synthesis with progression gates
- **Advanced task execution**: Single-step and multi-step patterns with dependency context integration
- **Error handling protocol**: Mandatory delegation system for complex debugging scenarios
- **Token optimization**: Economic model proposals and cost-effective strategies

### License Change
- **Updated from MIT to Mozilla Public License 2.0 (MPL-2.0)**
- Ensures community protection while maintaining full commercial compatibility

### Migration Notes
APM v0.4 is not backward compatible with v0.3. assets - **yet**. However:
- **New users** will find v0.4 significantly easier to get started with using the comprehensive documentation
- **v0.3 users** will find the core concepts familiar but greatly enhanced with more sophisticated workflows and capabilities

> **Note:** Existing v0.3 projects should be re-initialized using the new Setup Agent methodology and all v0.3 assets should be removed..

### **Getting Started**
See the complete [documentation suite](docs/) for detailed setup instructions, concepts, and advanced usage. Read [Getting Started](docs/Getting_Started.md) for your first APM v0.4 session.

---

## [0.3.0] - 2025-05-21

### Added
- New section in `prompts/02_Utility_Prompts_And_Format_Definitions/Handover_Artifact_Format.md` for "Recent Conversational Context & Key User Directives" in the `Handover_File.md`.

### Changed
- **Memory System Robustness (High Priority):**
  - Updated `prompts/01_Manager_Agent_Core_Guides/02_Memory_Bank_Guide.md` to mandate strict adherence to `Implementation_Plan.md` for all directory/file naming and to include a validation step before creation. Phase and Task naming conventions clarified.
  - Significantly revised `prompts/02_Utility_Prompts_And_Format_Definitions/Memory_Bank_Log_Format.md` to emphasize conciseness, provide clear principles for achieving it, and added concrete examples of good vs. overly verbose log entries.
  - Updated `prompts/01_Manager_Agent_Core_Guides/03_Task_Assignment_Prompts_Guide.md` to instruct Manager Agents to explicitly remind specialized agents of their obligations regarding Memory Bank structure and log quality (this earlier change remains valid alongside the newer one below).
- **Handover Protocol Enhancement:**
  - Modified `prompts/01_Manager_Agent_Core_Guides/05_Handover_Protocol_Guide.md` to include a new mandatory step for the Outgoing Manager Agent: review recent conversational turns with the User and incorporate a summary of unlogged critical directives or contextual shifts into the handover artifacts.
- **Implementation Plan and Task Assignment Process:**
  - Enhanced `prompts/01_Manager_Agent_Core_Guides/01_Implementation_Plan_Guide.md` to:
    - Emphasize and clarify the requirement for explicit agent assignment per task.
    - Mandate the inclusion of brief "Guiding Notes" (e.g., key methods, libraries, parameters) within task action steps to ensure inter-task consistency and provide clearer direction.
  - Updated `prompts/01_Manager_Agent_Core_Guides/03_Task_Assignment_Prompts_Guide.md` to ensure Manager Agents incorporate and expand upon these "Guiding Notes" from the `Implementation_Plan.md` when creating detailed task assignment prompts for Implementation Agents.
- **Handover Artifacts Refinement:**
  - Restructured and clarified `prompts/02_Utility_Prompts_And_Format_Definitions/Handover_Artifact_Format.md` for better usability and understanding.

### Removed
- Removed the `Complex_Task_Prompting_Best_Practices.md` guide to maintain a more general framework.
- Removed explicit guidelines for Jupyter Notebook cell generation from `prompts/02_Utility_Prompts_And_Format_Definitions/Imlementation_Agent_Onboarding.md` to keep agent guidance general.

---

## [0.2.0] - 2025-05-14
### Added
- New Manager Agent Guide for dynamic Memory Bank setup (`02_Memory_Bank_Guide.md`).
- Cursor Rules system with 3 initial rules and `rules/README.md` for MA reliability upon Initiation Phase.
- Enhanced MA Initiation with improved asset verification, file structure display and more.

### Changed
- Refined Manager Agent Initiation Flow (`01_Initiation_Prompt.md`) for Memory Bank, planning, and codebase guidance.
- Comprehensive documentation updates across key files (Root `README.md`, `Getting Started`, `Cursor Integration`, `Core Concepts`, `Troubleshooting`) reflecting all v0.2.0 changes.
- Renumbered core MA guides in `prompts/01_Manager_Agent_Core_Guides/` and updated framework references.

---

## [0.1.0] - 2025-05-12
### Added
- Initial framework structure
- Defined Memory Bank log format and Handover Artifact formats.
- Created core documentation: Introduction, Workflow Overview, Getting Started, Glossary, Cursor Integration Guide, Troubleshooting.
- Established basic repository files: README, LICENSE, CONTRIBUTING, CHANGELOG, CODE OF CONDUCT.
- Added initial GitHub issue template for bug reports.



