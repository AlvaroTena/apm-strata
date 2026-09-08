# APM Structure Standards

This document defines the organizational structure for APM guides, skills, agents and hooks - required sections, ordering, and document-level formatting. This is a development-time specification: agents do not read this file during runtime. The structural patterns defined here are implemented by template authors in the files they write. Content presentation and writing conventions follow [`WRITING.md`](./WRITING.md). All terms are defined in [`TERMINOLOGY.md`](./TERMINOLOGY.md).

Paths and invocations here are written literally. The build skips `_standards/` and `apm/`, so nothing in this directory is emitted and no placeholder in it is substituted.

---

## 1. Structure Policy

### 1.1 Document Type Matrix

Different document types have different structural needs. This matrix defines the rigidity expectations:

| Document Type | Structure Policy |
| ------------- | ---------------- |
| **Initiation skills** (`apm.plan`, `apm.manage`, `apm.work`) | Strict structure. Role declaration, initiation, core procedures, operating rules. |
| **Utility skills** (`apm.task`, `apm.review`, `apm.summarize`) | Lightweight structure. Short trigger or standalone skills - full rigidity adds no clarity. |
| **Handoff skills** (`apm.handoff.manager`, `apm.handoff.worker`) | Lightweight structure. Procedure, structural specs for artifacts. |
| **Troubleshooting skills** (`apm.recover`) | Lightweight structure. Recovery and diagnostic skills for workflow disruptions. |
| **Support skills** (`apm-communication`) | Free-form structure. Not invoked by anyone: read by several roles as shared reference. Required: §1 Overview naming its reading agents, and an end marker. |
| **Guides** | Strict 5-section pattern (§1 Overview through §5 Content Guidelines) by default. Sections may be merged only when there is a clear, justified reduction in cross-referencing overhead - not for cosmetic reasons. |
| **Reference files** (`<skill>/references/*`) | Free-form. Supplementary material a skill points at by path, kept out of the skill so the skill stays readable. Prose references carry §1 Overview and an end marker; data files carry neither. |
| **Lens agents** (`apm-lens-*`) | Free-form structure with a fixed frontmatter contract per §4.1. Required: §1 Overview, the finding shape the lens returns, and an end marker. |
| **Agents** (other subagents) | Free-form structure. Required: §1 Overview (spawning agents, purpose, outputs) and end marker. |
| **Hooks** (`templates/hooks/*.sh`) | Executable scripts, not prose. Structure is the script contract in §5. |

The role skills and the support skill are both skills and share the frontmatter and section rules in §2. They differ in naming and in invocation: a role skill is invoked by the User and its name carries dots, while the support skill is never invoked and its name is kebab-case.

---

## 2. Skill Structure

Skills are agent-facing documents. Each `SKILL.md` begins with YAML frontmatter. Internal organization is free-form beyond §1 Overview, except where §2.3 fixes a profile.

### 2.1 YAML Frontmatter

**Schema:**

```yaml
---
name: <skill-name>
description: <one or two sentence description of skill purpose>
---
```

- `name` (required): Skill identifier. Matches the directory name exactly, dots included.
- `description` (required, one or two sentences): Brief statement of skill purpose. The description of every skill is visible in the User's own menu, so it says which role invokes the skill and when, and never leaks procedure.

### 2.2 Role Skill Frontmatter Additions

Role skills are the nine skills the User types to start or drive an agent role. They add the fields below, which govern how the skill is invoked and what it may reach for.

| Field | Purpose |
| ----- | ------- |
| `disable-model-invocation` | Set to `true` on every role skill. The skill runs only when the User types its name. It also removes the skill from the listing the model sees, and it refuses invocation from a peer session as well as from the model - so no template may write a message asking another session to run one. |
| `argument-hint` | Arguments shown during autocomplete. Present on every role skill, including those that take none. |
| `allowed-tools` | Tools and subagents the skill may reach for without a permission prompt. Declare subagents as `Agent(<name>, <name>)`. This preapproves access; it does not restrict the rest. |
| `disallowed-tools` | Tools removed from the pool while the skill is active. It admits no exceptions, so a skill whose procedure needs one subagent cannot use it to exclude the others. It also lasts only the turn that invoked the skill, and the model still sees the tool and has its call denied - so a restricted skill's procedure says outright not to attempt the tool. |

Three fields do not exist and must not be written: `agents` (the platform has `agent`, singular, which selects a subagent for a forked context and means something else), `hooks` on a coordinator skill (hooks are declared in the project settings per §5), and `model` on a role skill (the model is inherited from the session). An unknown frontmatter field is ignored in complete silence - no error from the platform, none from the build - so any field a guarantee depends on is proven with a probe before anything is built on it.

### 2.3 Section Structure

Skills require §1 Overview (naming the reading or invoking agents) and an end marker. Subsections for objectives and outputs within §1 are optional - include them when they convey non-obvious information. Beyond §1, content organizes freely to match the skill's nature, except that role skills close with Operating Rules as their last numbered section.

| Section | Position | Purpose |
| ------- | -------- | ------- |
| Overview | §1 (always first) | Introduce agent role, confirm identity, state responsibilities. |
| [Procedures] | §2 through §(N-1) | Primary procedures for this skill. Variable based on purpose. |
| Operating Rules | §N (always last numbered) | Boundaries, standards, and constraints for agent behavior. |

**Initiation skills** (strict profile):

| Section | Content |
| ------- | ------- |
| §1 Overview | Role declaration ("You are the **[Agent Type]**"), role scope, greeting instruction, responsibilities, skill reference. |
| §2 Initiation | First instance vs incoming agent logic, artifact reading. Worker includes identity binding. Exemption: the Planner (`apm.plan`) operates as a single instance with no Handoff or incoming agent logic, so §2 is omitted and core Procedures start at §2. |
| §3+ [Core Procedures] | Main procedures for this agent type. |
| §N Operating Rules | Boundaries, communication, subagent usage. |

**Utility and troubleshooting skills** (lightweight profile): One-liner purpose with applicability guard and argument handling. Flat procedure steps handle core logic. No formal sections - title, description paragraph, procedure, end marker.

**Handoff skills** (lightweight profile):

| Section | Content |
| ------- | ------- |
| §1 Overview | Handoff purpose, artifacts produced. |
| §2 Handoff Procedure | Handoff execution actions. |
| §3+ [Structural Sections] | Handoff Log structure, handoff prompt structure. |

### 2.4 Additional Files and Reference Directories

A skill directory may hold files beside `SKILL.md`. Two shapes exist, and the difference is whether the skill's reader is expected to open them.

**A sibling file** sits directly in the skill directory and serves a reader other than the skill's own agent - `apm-communication/bus-integration.md` documents bus participation for agents APM does not manage. Sibling files need no frontmatter.

**A reference directory** is `references/` inside a skill directory, holding material the skill's procedure points at by path at the moment it is needed. It exists so a skill can stay under the length limit in `WRITING.md` §1.5 without losing detail: the procedure keeps the flow, the reference keeps the specification. Rules for the contents:

- Each prose reference opens with §1 Overview naming its reading agent and what the file settles, and closes with an end marker per §10.
- The skill's procedure names each reference at the step that needs it. A reference nothing points at is unreachable, and no error reports it.
- A data file - a JSON schema, a fixture - carries no frontmatter, no §1, and no end marker. It is consumed by a program, not read as prose.
- A reference file name describes its content, not its history. When a file outlives the name it was given, it is renamed rather than annotated with an explanation of the mismatch.

### 2.5 Naming

| Component | Convention |
| --------- | ---------- |
| Directory | `skills/<skill-name>/` |
| File | `SKILL.md` (uppercase) |
| Role skill name | `apm.` prefix, lowercase, dots separating namespace segments (`apm.plan`, `apm.handoff.worker`). The name is also the invocation. |
| Support skill name | kebab-case (`apm-communication`). Never invoked, so it takes no dotted form. |
| Reference directory | `references/`, files in kebab-case with their natural extension |

A dot in a skill name does not interfere with discovery; this was isolated with probes. The two families are named differently because they are invoked differently, and the frontmatter tells them apart: a role skill carries `disable-model-invocation`, the support skill does not.

---

## 3. Guide Structure

Guides are agent-facing documents containing procedural instructions and operational standards. Each guide is read by only one agent role and omits YAML frontmatter.

### 3.1 Section Structure

Guides follow a consistent structure with §1 Overview, §2 Operational Standards, §3 Procedure(s), §4 Structural Specifications, and §5 Content Guidelines.

| Section | Number | Purpose |
| ------- | ------ | ------- |
| Overview | §1 | Introduce purpose and reading agent. Subsections for objectives and outputs are optional - include when they convey non-obvious information not already clear from the guide title. |
| Operational Standards | §2 | Define reasoning approaches and decision rules for the procedure. |
| [Procedure Section] | §3 | Define the procedure and its parts. |
| Structural Specifications | §4 | Define output formats and schemas. Omit when the guide produces no artifacts or only references formats defined elsewhere. |
| Content Guidelines | §5 | Common Mistakes for genuinely non-obvious error patterns. Omit quality standards subsections that restate §2 Operational Standards. |

**Section omission and renumbering:** When a section is omitted, subsequent sections renumber sequentially. For example, if §4 is omitted, §5 becomes §4.

**§5 Content Guidelines elevation:** When Content Guidelines contains only Common Mistakes (no additional quality subsections), the heading becomes `## 5. Common Mistakes` - dropping the "Content Guidelines" container. This elevation applies only to this section, and the section number follows the renumbering rule above.

**Procedure section structure:** Each guide contains one procedure. Section title is `## 3. [Procedure Name] Procedure`. A brief description before the first subsection orients the reader on the procedure's shape - its parts, their order, and any non-sequential flow (loops, conditional branches, approval gates). These describe structure, not duplicate subsection headers verbatim. Subsections (§3.1, §3.2...) define the procedure's flow.

**The rules-loading step:** Every guide's procedure opens with the numbered step that reads the APM Rules block. It is the first action of the first subsection, phrased identically across every guide and skill that carries it, and the Rules themselves are never copied into a guide.

### 3.2 Section Requirements

**§1 Overview:** Introduce the guide's purpose and reading agent. Subsections for navigation, objectives, and outputs are optional and should be omitted when they would restate the guide title or preview content defined in later sections.

**§2 Operational Standards:** One subsection per standards area. Cover reasoning and decision areas for the procedure. Include default behavior statements where ambiguity is possible.

**§3 Procedure:** Single procedure with subsections defining its flow. Cross-references §2 standards when decisions apply. Includes conditional branching where applicable.

**§4 Structural Specifications:** Define formats for all outputs. Specify file path patterns. Provide schemas with field descriptions. Omit type and required annotations for self-documenting fields. When a format is read by a script, the specification says which part is a contract and what happens when it is broken.

**§5 Content Guidelines:** Common Mistakes is the primary content - include only patterns not already derivable as inversions of §2 Operational Standards. Additional quality or communication subsections are omitted when they restate §2 or the communication skill. When multiple subsections exist, use `###` headings. When only Common Mistakes remains, the heading becomes `## 5. Common Mistakes` (or the renumbered equivalent if §4 was omitted).

### 3.3 Naming

| Component | Convention |
| --------- | ---------- |
| Directory | `guides/` |
| File | `<guide-name>.md` |
| Guide name | kebab-case |

---

## 4. Agent Structure

Agents are custom subagent configuration files shipped with APM bundles. Each begins with YAML frontmatter. Two kinds ship: the archive explorer, spawned by the Planner, and the five lenses, spawned by the Manager during review.

### 4.1 YAML Frontmatter

**Schema:**

```yaml
---
name: <agent-name>
description: <one or two sentence description of agent purpose>
model: <model>
tools: <comma-separated tools>
disallowedTools: <comma-separated tools>
---
```

- `name` (required, kebab-case): Agent identifier. Matches filename stem.
- `description` (required, one or two sentences): Brief statement of agent purpose.
- `model` (lens agents): The model the lens runs on. Lenses are the only place in the template where a model is pinned, and the value is overridable by the project through its Rules block.
- `tools` (lens agents): What the lens may use. Lenses read and search only.
- `disallowedTools` (lens agents): What the lens may never reach - the subagent, skill and write tools. This is what keeps a reviewer from acting.

**The subagent fields are not the skill fields.** An agent writes `tools` and `disallowedTools` in camelCase; a skill writes `allowed-tools` and `disallowed-tools` with hyphens. The two schemas are separate, and a field spelled the other way is ignored without complaint.

### 4.2 Section Structure

Agents require §1 Overview (spawning agents, purpose, and outputs) and an end marker. Beyond §1, agents organize content freely.

A lens agent additionally states the shape of a finding it returns and the instructions that keep it a reviewer: return findings only, attach no severity, invoke no skills, spawn no subagents. The shape is identical across all five lenses, so a lens that invented a field of its own would produce findings the triage cannot read.

### 4.3 Naming

| Component | Convention |
| --------- | ---------- |
| Directory | `agents/` |
| File | `<agent-name>.md` |
| Agent name | kebab-case, matches filename stem. Lens agents are `apm-lens-<lens>`. |

---

## 5. Hook Structure

Hooks are executable scripts, not prose. Two ship with the template: the dispatch gate and the pre-compaction reminder.

**Source and emission.** Sources live in `templates/hooks/<name>.sh` and are emitted into the bundle under the config directory's `apm-hooks/`. They are POSIX `sh` with no dependency beyond the shell and the standard text utilities, and they are invoked through `sh` so they do not depend on an execute bit surviving installation.

**Where the declaration lives.** The CLI merges the hook declarations into the project's `.claude/settings.json` at install and takes them out at removal. A hook is never declared in a skill's frontmatter. Frontmatter registration happens when the skill is invoked and lives in the process, so a session resumed into a new process would carry no hook until something invoked the skill again - and a coordinator resuming and dispatching is exactly the moment nothing does. A gate that disarms without saying so is worse than no gate. A settings declaration is read at startup and arms a resumed process the same as a fresh one.

**Script contract.** A blocking hook exits 2, and its stderr becomes the reason the model is given. Every message therefore names the specific item that caused the block - a block that does not say why forces an investigation, which costs more than the block saves. Anything the hook does not guard exits 0 early, and the guarded path is stated at the top of the script so a reader knows the blast radius without tracing the logic.

**Documentation.** A hook's behavior is documented for the agent that lives with it, in a reference file beside that agent's skill per §2.4 - what is armed, what it guards, and what it does not guarantee. The script's own header comment carries the mechanics: which event, which matcher, which paths, and why the conditions are what they are.

**What a hook does not own.** A hook shortens a feedback loop; it never owns the rule. The conditions it enforces hold whether or not it fires, so the documentation tells its reader to treat a passing write as the absence of a block rather than as confirmation, and to verify the gate is live in the session type actually in use.

---

## 6. Section Formatting Rules

### 6.1 Heading Levels

| Level | Markdown | Usage |
| ----- | -------- | ----- |
| H1 | `#` | Document title only. One per file. |
| H2 | `##` | Major sections (§1, §2, §3, etc.). |
| H3 | `###` | Subsections (§1.1, §2.3, etc.). |
| Bold | `**text**` | Introduces sub-topics with inline content. |
| Italic | `*text*` | Labels items within lists. |

Deeper hierarchy within subsections uses **bold** to introduce sub-topics and *italic* to label items within lists. See `WRITING.md` §7.1 for formatting patterns.

### 6.2 Section Numbering

| Format | Usage |
| ------ | ----- |
| `## 1. Section Name` | Major sections. |
| `### 1.1 Subsection Name` | Subsections. |

Section numbers in text references use the § symbol with section title: "See §3.2 Dependency Context."

### 6.3 Horizontal Rules

Horizontal rules (`---`) separate major sections (## headings) only. Horizontal rules are not used within sections or between subsections.

**Planning documents** (Spec, Plan) use a single horizontal rule to separate the document header from content. No other horizontal rules appear in planning documents - `##` and `###` headings provide sufficient visual separation.

---

## 7. YAML Frontmatter Rules

### 7.1 General Rules

| Rule | Description |
| ---- | ----------- |
| Position | Always at the very beginning of the file. |
| Delimiters | Begin and end with `---` on their own lines. |
| Indentation | No indentation for top-level fields. |
| Quotes | Strings containing special characters are quoted. |

The build emits frontmatter verbatim and validates only that the block parses and carries the required fields. It does not check field names against any allowed list, so a misspelled or invented field survives the build and is then ignored by the platform.

### 7.2 Field Naming

| Rule | Description |
| ---- | ----------- |
| Case | Platform-defined fields use the platform's own spelling, which differs by file type per §2.2 and §4.1. Fields APM defines within artifact schemas use snake_case. |
| Clarity | Field names are descriptive. |
| Consistency | Field names are consistent across all files of the same type. |

### 7.3 Field Values

| Type | Format |
| ---- | ------ |
| Strings | No quotes unless containing special characters. |
| Numbers | No quotes. |
| Lists | Comma-separated in a single line, or YAML list syntax. |
| Booleans | `true` or `false` (lowercase). |

---

## 8. Structural Specifications Rules

These rules govern output format definitions in structural specifications sections of skills and guides. Tables are the appropriate format for structural specifications, schemas, format definitions, and enumerated field descriptions. Prose remains preferred for explanatory and instructional content per `WRITING.md` §1.3.

### 8.1 Format Definition Structure

Each format definition includes: location (file path pattern with placeholders), naming convention (explanation of path components), schema (YAML frontmatter and/or markdown body structure), and field descriptions (type, required status, allowed values, purpose).

When a script reads the format, the definition also states what is contractual and what is free. A heading matched literally, a column read by position, and a closed set of accepted values are each contracts, and each one fails silently when broken - the reader finds nothing, blocks nothing, and reports nothing. Naming the contract is the only warning the author of a future translation will get.

### 8.2 Schema Representation

**YAML Schemas:** Use fenced code blocks with `yaml` language tag:

````markdown
**YAML Frontmatter Schema:**

```yaml
---
field_one: <type or allowed values>
field_two: <type or allowed values>
---
```

**Field Descriptions:**

- `field_one`: string, required, specifies [purpose].
- `field_two`: enum, required, indicates [purpose]. Allowed values are `A`, `B`, or `C`.
````

**Markdown Body Templates:** Use fenced code blocks with `markdown` language tag.

**Declaration blocks:** A block a project writes into its own Rules is shown in a `text` block, verbatim and in English, with its headings and keys exactly as the surfaces that read them expect. These are contracts across surfaces written by different authors, and a renamed key produces a mechanism that does nothing and says nothing.

### 8.3 Placeholder Notation

Value placeholders use `<placeholder>` for values to fill, `[optional]` for conditional content, `...` for pattern continuation, `<N>`/`<M>` for integer values, and `<NN>`/`<MM>` for zero-padded numeric identifiers. Cross-reference placeholders (`{SKILL_NAME:slug}`, `{SKILL_PATH:name}`, `{GUIDE_PATH:name}`, `{AGENT_PATH:name}`, `{SKILLS_DIR}`, `{GUIDES_DIR}`, `{AGENTS_DIR}`, `{RULES_FILE}`, `{VERSION}`, `{TIMESTAMP}`, `{ARGS}`) are resolved during build.

Every placeholder written into a template has a substituter in the build. One that does not is not caught by anything: the build emits the marker literally and the reader of the bundle sees it raw.

---

## 9. File Naming Conventions

Per-type naming lives with each type: skills in §2.5, guides in §3.3, agents in §4.3, hooks in §5.

### 9.1 APM Artifact Files

| Component | Convention |
| --------- | ---------- |
| Paths | kebab-case throughout |
| Logs | `.log.md` suffix for Task Logs and Handoff Logs |
| Directories | `stage-<NN>/`, `handoffs/<agent>/`, `review/<stage>-<task>/`, `checklists/` |

### 9.2 Task Identifiers

Tasks are identified by Stage number and Task number using the compound `N.M` format (e.g. Task 2.3) in markdown prose. YAML frontmatter uses plain integers (`stage: 1`, `task: 2`) as the natural machine-format data type. File paths use zero-padded numbers (`stage-01/task-01-02.log.md`) for lexicographic sorting so Stages and Tasks sort correctly in the user's file system.

Worker Session and worktree names use the unpadded compound form after the agent slug: `<agent-slug>-<stage>.<task>`. The dot is accepted by the session and worktree flags; this was verified rather than assumed.

---

## 10. End Markers

Every guide, skill, agent and prose reference file ends with an end marker followed by a blank line.

**Guides:**

```text
---

**End of Guide**

```

**Skills:**

```text
---

**End of Skill**

```

**Agents:**

```text
---

**End of Agent**

```

**Reference files** end with `**End of Reference**` in the same form. Data files and hook scripts carry no end marker.

The end marker follows a horizontal rule, uses bold formatting, and is followed by a blank line.

---

**End of Structure Standards**
