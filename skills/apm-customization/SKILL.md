---
name: apm-customization
description: Guides an AI agent through customizing apm-strata templates, building the bundle, and releasing a custom APM repository.
---

# APM Customization Skill

## 1. Overview

**Reading Agent:** Any AI assistant working within a fork or template of this repository

This skill orients an agent inside the APM codebase itself so it can find the right file,
change it without breaking the contracts around it, build, and release.

### 1.1 Objectives

- Navigate the repository and understand what each surface does
- Make targeted changes to templates, guides, skills, agents, hooks or the CLI
- Build and test changes locally
- Produce a release installable with `apm custom`

### 1.2 How to Use

The User describes what they want changed. The Agent explores the relevant surface, proposes
the change, and implements it after approval. Read the standard for a surface before editing
it; each one is listed with its surface below.

---

## 2. Repository Structure

**`templates/`** - The source of everything a User receives. Four emitted categories plus one
that never ships:

| Directory | Becomes | Notes |
|---|---|---|
| `templates/skills/` | `.claude/skills/` | Whole directories, tree preserved, any extension. Frontmatter on `SKILL.md` only |
| `templates/guides/` | `.claude/apm-guides/` | Flat, `.md` only, no frontmatter |
| `templates/agents/` | `.claude/agents/` | Flat, `.md` only, frontmatter on every file |
| `templates/hooks/` | `.claude/apm-hooks/` | Whole directory, any extension, no frontmatter. Source file mode is carried through |
| `templates/apm/` | `.apm/` | Copied verbatim: the artifact templates for Spec, Plan, Tracker and Memory Index |
| `templates/_standards/` | nothing | Build-time only. Nothing in a bundle may reference it |

A top-level directory under `templates/` that is not one of these is skipped with a warning
that names it.

**`templates/skills/`** holds the nine role entry points - `apm.plan`, `apm.manage`,
`apm.work`, `apm.task`, `apm.review`, `apm.handoff.manager`, `apm.handoff.worker`,
`apm.summarize`, `apm.recover` - plus `apm-communication`, which is not an entry point but the
shared bus protocol the roles load. A skill directory may carry support files of any
extension; only `SKILL.md` takes frontmatter.

**`templates/guides/`** holds the procedural documents agents read autonomously: context
gathering, work breakdown, task assignment, task execution, task logging, task review.

**`templates/agents/`** holds the subagents: an archive explorer and the five review lenses.

**`templates/hooks/`** holds the two hook scripts. They are POSIX `sh` and are declared in the
project's `.claude/settings.json` by the CLI, not by the bundle.

**`templates/_standards/`** - read before editing anything under `templates/`:
`WORKFLOW.md` (the source of truth for behaviour), `TERMINOLOGY.md`, `STRUCTURE.md`,
`WRITING.md`, `NOTES.md`.

**`build/`** - Turns templates into the bundle. `build-config.json` declares the target.
Standard: `build/_standards/BUILD.md`.

**`src/`** - The `apm-strata` CLI. Standard: `src/_standards/CLI.md`.

**`test/`** - Vitest suites over the build, the CLI, the hooks and the template contracts.

**`docs/`** - Documentation that is not part of a bundle, such as the spec delta format.

**`skills/`** - Standalone skills like this one, not part of any bundle.

---

## 3. How Templates Become the Bundle

There is **one target**, `claude`, declared in `build/build-config.json`. It sets the config
directory, the rules file (`CLAUDE.local.md`), the four output directories, and the natural
language used for new-chat and subagent guidance. Adding a second target means reintroducing
portability the guides no longer assume; see the README before proposing it.

Templates carry placeholders that the build resolves. Read
`build/processors/placeholders.js` for the full list. The ones most often needed:

| Placeholder | Resolves to |
|---|---|
| `{SKILL_NAME:slug}` | The skill's invocation name, `/apm.<slug>`. Use this rather than writing a skill name literally |
| `{SKILL_PATH:name}` | Path to a skill file, `<skills dir>/<name>/SKILL.md` |
| `{GUIDE_PATH:name}` | Path to a guide file |
| `{AGENT_PATH:name}` | Path to an agent file |
| `{HOOK_PATH:name}` | Path to a hook script, `<hooks dir>/<name>.sh`. Use this in any text that tells someone where a hook lives |
| `{RULES_FILE}` | The target's rules file name |
| `{SKILLS_DIR}`, `{GUIDES_DIR}`, `{AGENTS_DIR}` | The output directories |
| `{ARGS}` | The argument variable |
| `{NEW_CHAT_GUIDANCE}` | Natural language for starting a new session |
| `{PLANNER_SUBAGENT_GUIDANCE}`, `{MANAGER_SUBAGENT_GUIDANCE}`, `{WORKER_SUBAGENT_GUIDANCE}`, `{SUBAGENT_GUIDANCE}`, `{ARCHIVE_EXPLORER_GUIDANCE}` | Role-specific subagent invocation guidance |
| `{VERSION}`, `{TIMESTAMP}` | Release version and build time |

Only `.md` and `.sh` are read as text and substituted. Every other extension is copied byte
for byte, so a JSON schema shipped inside a skill keeps its braces.

The three frontmatters - skill, agent, and the one guides do not have - do not share a
spelling convention. Copying a field from one surface to another is the usual way to write
something the platform silently ignores. The build warns on frontmatter keys it does not
recognise; do not ignore that warning.

**Building locally:**

```bash
npm install
npm run build:release
```

This writes `dist/` with `claude.zip` and `apm-release.json`. Extract the bundle into a
throwaway project to test it. Never commit `dist/`.

**Testing:**

```bash
npm test
```

The suite covers the build, the CLI, the hook scripts and the cross-surface template
contracts - including that every placeholder used in a template is one the build resolves.
A change to any surface should leave it green.

---

## 4. Making Changes

Identify the surface first. Workflow changes propagate top down:

1. **Update `WORKFLOW.md`** - any change to behaviour, procedure or coordination goes into the
   specification before any runtime file changes.
2. **Propagate to runtime files** - skills, guides, agents and hooks implement the spec,
   following `STRUCTURE.md`, `WRITING.md` and `TERMINOLOGY.md`.

Changes that do not affect behaviour - rewording inside an existing procedure, adding an
example - go straight into the runtime file.

### Template Content

- Guides follow the five-section pattern: Overview, Operational Standards, Procedure,
  Structural Specifications, Content Guidelines.
- Skills require an Overview section; the rest of the internal organisation is free.
- Text addressed to the User carries no section numbers and no procedure names.
- Imperative mood, hyphens rather than dashes, and an end-of-document marker.

### Adding a File

1. Follow `STRUCTURE.md` for that file type.
2. Add frontmatter where the category requires it: `SKILL.md` and every agent file, never a
   guide.
3. Use placeholders for paths, the rules file, and anything platform-specific.
4. Update the cross-references that should load it. A new file nothing references ships and
   is never read.

### Hooks

A hook script goes in `templates/hooks/`, committed executable. The declaration that makes
the platform run it lives in `src/services/settings.js`, which merges APM's declarations into
the project's `.claude/settings.json` on `apm init`, `apm custom`, `apm add` and `apm update`,
and withdraws them on `apm remove`. Adding a hook means both: the script, and its declaration.

A hook that blocks must say why. The dispatch gate exits 2 and writes the reason to stderr,
naming the checklist item or deferred entry that caused the block - a block with no reason
forces an investigation, which is worse than no block.

### CLI

Changes under `src/` follow `src/_standards/CLI.md` and version separately from template
releases. Beyond template management, the CLI carries two command groups worth knowing about:

- `apm knowledge init | emit | audit` - scaffolds the project knowledge layer, ingests a Task
  Log into it as claims with provenance, and audits the substrate. The command drives a
  consumer interface and knows nothing tool-specific; adapters live in
  `src/services/knowledge/`.
- `apm delta validate <path>` - checks spec deltas against the specs they change. Format and
  rules in `docs/deltas.md`.

---

## 5. Releasing

1. **Build** - `npm run build:release`.
2. **Test** - `npm test`, then extract `dist/claude.zip` into a throwaway project and exercise
   the change.
3. **Tag** - a git tag following `VERSIONING.md`.
4. **Release** - a GitHub Release with everything in `dist/` attached: `claude.zip` and
   `apm-release.json`.

`apm-release.json` is what the CLI reads to discover what a release contains; see
`build/generators/manifest.js`.

`.github/workflows/` is inherited from upstream and tailored to its release pipeline. Do not
assume it works as-is in a fork. The manual build-tag-release above is the reliable path.

Users install from a custom repository with:

```bash
apm custom -r owner/repo
```

---

## 6. Communicating Changes

A custom repository that diverges from its source should say how:

- Describe in the README what was customized and why.
- Note where the workflow differs from the documentation the User may be reading.
- Document any new skill or command.

Custom repositories carry trust implications. A bundle can write anywhere in the project
directory, the templates determine how the assistant behaves, and installing declares hooks in
the project's settings file. If a customization writes outside `.claude/` and `.apm/`, say so
explicitly, so anyone installing it can make an informed decision.

---

**End of Skill**
