# apm-strata

A Claude Code fork of [Agentic Project Management](https://github.com/sdi2200262/agentic-project-management).

*Strata*, from Latin *stratum*, "what has been laid down": the bands of rock deposited over
time, each one from a different age and readable on its own. It names what the fork
contributes.

APM structures work into Planner, Manager and Worker agents that coordinate through a
file-based bus. This fork keeps that shape and changes three things.

**Rules become mechanics.** What APM states as a written rule becomes a numbered step in the
guide the agent loads to do its job. A rule an agent can skip is not a rule, it is a hope.

**Native dispatch replaces the human relay.** You stop carrying messages between agent
conversations. The approval gates you actually want stay exactly where they are; the courier
role goes.

**Review is adversarial and separate from coordination.** Findings come from context-free
lenses running in parallel, each blind to the others. The coordinator does not read the
artifact, it triages verified findings. The role that runs out of context stops being the one
doing the reading.

It targets **Claude Code only**, where upstream is portable across several assistants. Once
the guides assume subagents, background sessions and hooks, that portability is gone.
Deliberate trade, not an oversight.

A release is a single `claude.zip` bundle plus an `apm-release.json` manifest. The bundle
carries nine role skills, one shared communication skill, six guides, six subagents - an
archive explorer and five review lenses - two hook scripts, and the `.apm/` artifact
scaffolding.

## Install

The CLI ships as a tarball attached to each release, and installs from that URL.

```bash
npm install -g https://github.com/AlvaroTena/apm-strata/releases/download/v1.1.0-alpha.3/apm-strata-1.1.0-alpha.3.tgz
apm init
```

**Do not install it with `npm install -g AlvaroTena/apm-strata`.** npm resolves a global git
dependency to a symlink into its own cache directory rather than installing the package, so the
command appears to succeed and the CLI stops working the next time that cache is cleared.
Reproduced against npm 11.6.0 in a clean prefix. The tarball route installs a real directory.

The package is named `apm-strata`, so it neither replaces an upstream `agentic-pm` install nor
can be replaced by one through `npm update`.

If you already have the upstream CLI and would rather not add another, you can pull the
templates with the command upstream already provides:

```bash
apm custom -r AlvaroTena/apm-strata
```

**That route installs the templates but not the install-time behaviour, and nothing but the
Manager points out the difference.** Two things this repository's CLI does are absent from the
published upstream package: it merges the hook declaration into `.claude/settings.json`, and
it restores the execute bit that extraction strips from the hook scripts. The declaration is
the one that matters: the hook runs its script through `sh`, so the bit does not, but without
the declaration the dispatch gate is never armed - it does not fail, it simply never runs, and
the installation looks complete. The Manager checks for the declaration and the script when it starts and says
what is missing, but it does not stop the session. Use this route to read the templates, not
to run a session that relies on the gate.

Installing declares two hooks in `.claude/settings.json` and writes the rest of the bundle
into `.claude/`. `apm remove` withdraws the declarations again, leaving any hooks of your own
untouched.

## Skills

Nine skills drive the roles, one per entry point. Each is invoked by name in a Claude Code
session.

| Skill | What it does |
|---|---|
| `/apm.plan` | Starts the Planner at the beginning of a session: gathers context, breaks the work down, writes the planning documents |
| `/apm.manage` | Starts the Manager once the planning documents exist |
| `/apm.work` | Starts a Worker and binds it to an agent identity |
| `/apm.task` | Delivers a pending Task Prompt to the Worker whose chat this is |
| `/apm.review` | Delivers pending Task Reports to the Manager, which reviews them by dispatching lenses |
| `/apm.handoff.manager` | Hands the Manager role to a new instance as the context window fills |
| `/apm.handoff.worker` | Hands a Worker identity to a new instance as the context window fills |
| `/apm.summarize` | Summarizes the current session and optionally archives it |
| `/apm.recover` | Rebuilds a Manager's or Worker's working context after it is lost |

A tenth skill, `apm-communication`, is not an entry point: it holds the message bus protocol
and the communication standards that the roles load when they need them.

## Four layers

The organising idea. Every change belongs to exactly one layer, and putting it in the wrong one
is how these setups rot.

| Layer | Holds | Survives a tooling change? |
|---|---|---|
| **Platform** | background sessions, subagents, hooks, cross-session messaging | it is the invariant |
| **Template** (this repo) | roles, guides, bus protocol, review, closing procedure | yes |
| **Project** | rules, domain lenses, knowledge-layer wiring | yes |
| **Cockpit** | worktree views, boards, fleet telemetry | no, which is why it never enters a template |

Three rules follow. The cockpit never enters a template, so swapping IDEs costs nothing.
Domain knowledge never enters a template either, so the same framework serves unrelated
projects. And rules live in exactly one place, with each guide loading them as an explicit
step rather than relying on context that dilutes as a session fills.

## Where the rules live

The Planner writes the project's rules into an `APM_RULES` block, and the file it writes them
to is **`CLAUDE.local.md`**, not `CLAUDE.md`.

Rules are local project state. They describe how this project wants agents to behave, they
change as the project learns, and they are not necessarily something a team wants in version
control. Claude Code documents `CLAUDE.local.md` as the file for personal project
preferences, and loads it every session from the working directory and the directories above
it - the same discovery `CLAUDE.md` gets. So the block is read exactly as reliably as before,
and a project can keep versioning its own `CLAUDE.md` without dragging the block along with
it.

The Planner asks. If you say the rules should be versioned, it writes them to `CLAUDE.md`
instead, and if it finds a block in both files it replaces the one in the destination and
deletes the other, so there is never more than one.

## Spec deltas

Changes to a specification are written as deltas - `ADDED`, `MODIFIED` and `REMOVED`
requirement blocks - and checked with `apm delta validate` before anyone acts on them. The
format and its four rules are in [docs/deltas.md](docs/deltas.md).

## Provenance

Each mechanic comes from wherever it was already best solved. None of these projects is adopted
as a framework; the mechanics are adapted and attributed. This table is the attribution: the
adapted files carry no attribution header of their own, so what follows is the only record of
where the text came from.

| Mechanic | Adapted into | Source file | Source | License |
|---|---|---|---|---|
| Roles, file bus, planning documents, handoff protocol | the framework as a whole | - | [agentic-project-management](https://github.com/sdi2200262/agentic-project-management) | MPL-2.0 |
| Bounded ambiguity resolution: Clear / Partial / Missing scan, discard criterion, five-question ceiling, one question at a time, incremental integration, closing coverage table | `templates/guides/context-gathering.md` | `templates/commands/clarify.md` | [spec-kit](https://github.com/github/spec-kit) | MIT |
| Requirement checklists whose tick means reviewed quality, never finished implementation, and is reserved for a human reviewer | `templates/guides/work-breakdown.md` | `templates/checklist-template.md` | [spec-kit](https://github.com/github/spec-kit) | MIT |
| Rules loaded as a numbered step of each procedure rather than assumed to be in context | `templates/guides/` and `templates/skills/`, ten files | mechanism only, no text adapted: the constitution loaded as a numbered step in `templates/commands/` (`plan.md` step 2, `clarify.md` step 2) | [spec-kit](https://github.com/github/spec-kit) | MIT |
| Forced-justification gate: a departure from a rule is allowed only with a row naming the violation, why it was necessary, and the simpler alternative rejected | `templates/guides/task-logging.md`, `templates/guides/task-review.md` | the three-column table in `templates/plan-template.md` (`Violation` / `Why Needed` / `Simpler Alternative Rejected Because`) | [spec-kit](https://github.com/github/spec-kit) | MIT |
| Adversarial review lens | `templates/agents/apm-lens-adversarial.md` | `skills/bmad-review/references/lens-adversarial.md` | [BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) | MIT |
| Edge-case and verification-gap lenses | `templates/agents/apm-lens-edge-case.md`, `apm-lens-verification-gap.md` | `skills/bmad-review/references/lens-edge-case-hunter.md`, `lens-verification-gap.md` | [BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) | MIT |
| Acceptance lens | `templates/agents/apm-lens-acceptance.md` | `acceptance-auditor` layer of `skills/bmad-code-review/customize.toml` | [BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) | MIT |
| Editorial lens | `templates/agents/apm-lens-editorial.md` | `skills/bmad-review/references/lens-structure.md`, `lens-prose.md`, `editorial-common.md` | [BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) | MIT |
| Canonical finding fields | `templates/skills/apm.manage/references/finding.schema.json` | `skills/bmad-review/SKILL.md` | [BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) | MIT |
| Review material preparation, author-claims isolation, verified triage by the coordinator | `templates/skills/apm.manage/references/review-procedure.md` | `skills/bmad-code-review/steps/step-02-review.md`, `step-03-triage.md`, `skills/bmad-review/SKILL.md` | [BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) | MIT |
| Shape of an external lens instruction | `templates/skills/apm.manage/references/external-lenses.md` | `skills/bmad-review/customize.toml` | [BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) | MIT |
| Delta specifications (`ADDED` / `MODIFIED` / `REMOVED`), usable without adopting the workflow | `docs/deltas.md`, `src/services/delta.js` | format only; the validator is this repository's own | [OpenSpec](https://github.com/Fission-AI/OpenSpec) | MIT |
| Knowledge layer: synthesis at ingest time, the claim with provenance as the unit | `src/services/knowledge/` | consumer interface modelled on [claude-obsidian](https://github.com/AgriciDaniel/claude-obsidian) | [LLM wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) pattern | public idea |
| Deferred entries with a gate that blocks dispatch until cleared | `templates/hooks/apm-dispatch-gate.sh` | mechanism only; no text adapted | [bmad-loop](https://github.com/bmad-code-org/bmad-loop) | MIT |

Where a row says "mechanism only", no text was copied: what was adapted is the shape of the
mechanism, and the source column names where to find it rather than a file this repository
derives text from.

One lesson came with the rules mechanism rather than the mechanism itself. spec-kit stopped
propagating constitution guidance into its templates in 0.14.4, because copying the rules to
the places that use them duplicates the source of truth. That is why the `APM_RULES` block
here lives in exactly one file and every guide loads it, instead of each guide carrying its
own copy.

OpenSpec's validator was evaluated and rejected: against five deltas differing by one seeded
mutation each, it detected four violations but exited zero on one of them - the unmatched
requirement key, which is the failure that loses a change silently. The format was kept and
the check was rewritten. See [docs/deltas.md](docs/deltas.md).

## Branches

`main` follows upstream and carries the fork's own work on top.

`feat/enhanced-skills-agents` (March 2026) converts three role entry points into skills with
per-role model routing, tool restriction, declared spawnable agents and a skill-scoped hook. It
was submitted upstream as a pull request and closed unmerged. It is kept as reference material:
some of its calls were made when the platform offered fewer options than it does now.

## Contributing

Issues and pull requests go to [this repository](https://github.com/AlvaroTena/apm-strata/issues),
not to upstream. This is a personal fork shaped around one way of working, so expect opinionated
answers, but a different perspective on any of the above is genuinely useful.

`CONTRIBUTING.md` has the development setup, the coding conventions and what the test suite
covers. Two things are worth knowing before opening a pull request: everything written into the
repository is in English, and no file under `templates/` may reference a cockpit or carry a
domain concept from any particular project.

If you want the original framework rather than this reading of it, use
[upstream](https://github.com/sdi2200262/agentic-project-management).

## License

MPL-2.0, inherited from APM and kept for the whole fork. It is per-file copyleft: any APM file
that gets modified stays MPL and its source must remain available, which a public repository
satisfies. Mechanics adapted from MIT projects are incorporated with their attribution intact,
which is what the provenance table is for.

Original copyright 2025-2026 sdi2200262 - CobuterMan.
