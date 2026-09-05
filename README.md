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

It targets **Claude Code only**. Upstream supports six assistants. Once the guides assume
subagents, background sessions and hooks, that portability is gone. Deliberate trade, not an
oversight.

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

## Provenance

Each mechanic comes from wherever it was already best solved. None of these projects is adopted
as a framework; the mechanics are adapted and attributed.

| Mechanic | Source | License |
|---|---|---|
| Roles, file bus, planning documents, handoff protocol | [agentic-project-management](https://github.com/sdi2200262/agentic-project-management) | MPL-2.0 |
| Rules loaded as a numbered step; forced-justification gate; bounded ambiguity resolution; checklists whose tick is reserved for a human reviewer | [spec-kit](https://github.com/github/spec-kit) | MIT |
| Context-free review lenses in parallel; author-claims isolation; reviewers that do not grade, with verified triage by the coordinator | [BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) | MIT |
| Delta specifications (`ADDED` / `MODIFIED` / `REMOVED`) and their validator, usable without adopting the workflow | [OpenSpec](https://github.com/Fission-AI/OpenSpec) | MIT |
| Knowledge layer: synthesis at ingest time, the claim with provenance as the unit | Karpathy's [LLM wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) pattern | public idea |
| Deferred entries with a gate that blocks dispatch until cleared | bmad-loop | MIT |

## Branches

`main` follows upstream and carries the fork's own work on top.

`feat/enhanced-skills-agents` (March 2026) converts three role entry points into skills with
per-role model routing, tool restriction, declared spawnable agents and a skill-scoped hook. It
was submitted upstream as a pull request and closed unmerged. It is kept as reference material:
some of its calls were made when the platform offered fewer options than it does now.

## Contributing

Issues and pull requests are welcome. This is a personal fork shaped around one way of working,
so expect opinionated answers, but a different perspective on any of the above is genuinely
useful. If you want the original framework rather than this reading of it, use
[upstream](https://github.com/sdi2200262/agentic-project-management).

## License

MPL-2.0, inherited from APM and kept for the whole fork. It is per-file copyleft: any APM file
that gets modified stays MPL and its source must remain available, which a public repository
satisfies. Mechanics adapted from MIT projects are incorporated with their attribution intact,
which is what the provenance table is for.

Original copyright 2025-2026 sdi2200262 - CobuterMan.
