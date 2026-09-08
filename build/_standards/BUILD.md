# Build System Standards

Coding standards and patterns for the APM build pipeline.

The pipeline has a single target, `claude`. Everything below describes what the
build does today; when a section and the code disagree, the code is right and
the section is a defect.

## Module Structure

### Pure Functions

Prefer pure functions with explicit dependencies:

```javascript
// Good: Pure function with explicit inputs
export function generateReleaseManifest(config, version) {
  return {
    version,
    assistants: config.targets.map(t => ({ ... }))
  };
}

// Avoid: Side effects or implicit dependencies
export function generateManifest() {
  const config = loadConfig(); // Implicit dependency
  writeFile(...);              // Side effect
}
```

Modules that decide stay pure; modules that orchestrate do the reporting. The
frontmatter processor returns the unknown keys it finds and never logs them;
`templates.js` logs. Keeping that split means the decision can be tested without
capturing output.

### Single Responsibility

Each module handles one concern:

- `build/core/config.js` - Configuration loading and validation
- `build/core/errors.js` - Error classes and codes
- `build/generators/manifest.js` - Manifest generation
- `build/generators/archive.js` - ZIP creation
- `build/processors/templates.js` - Template orchestration
- `build/processors/frontmatter.js` - Frontmatter parsing, validation and the key reference
- `build/processors/placeholders.js` - Placeholder replacement
- `build/utils/files.js` - File discovery and category resolution
- `build/utils/logger.js` - Build logging

### Export Patterns

Named exports for functions, with optional default export aggregating all exports:

```javascript
// Named exports for module functions
export function parseFrontmatter(content, filePath) { ... }
export function validateFrontmatter(frontmatter, filePath) { ... }

// Optional default export for convenience
export default { parseFrontmatter, validateFrontmatter };
```

## Error Handling

### BuildError Class

Use the `BuildError` class with error codes:

```javascript
import { BuildError } from '../core/errors.js';

// Factory methods for consistent errors
throw BuildError.configNotFound(path);
throw BuildError.templateParseFailed(file, reason);
throw BuildError.frontmatterInvalid(file, errors);
```

### Error Codes

Use semantic error codes from `BuildErrorCode`:

- `CONFIG_NOT_FOUND` - Missing configuration file
- `CONFIG_INVALID` - Configuration failed validation
- `TEMPLATE_PARSE_FAILED` - Frontmatter block is not valid YAML
- `TEMPLATE_MISSING_FIELD` - Frontmatter failed validation
- `ARCHIVE_FAILED` - ZIP creation failure

Every code has a factory that produces it, and every factory has a caller. A
code nothing can raise reads as a failure the build reports and is not one, so
`test/build/errors.test.js` fails when either half goes missing. Add a code and
its factory together, and add the throw in the same change.

### Fail Fast

Validate inputs early, fail with clear messages that name the file:

```javascript
const { valid, errors } = validateFrontmatter(frontmatter, filePath);
if (!valid) {
  throw BuildError.frontmatterInvalid(filePath, errors);
}
```

### Fail Loudly or Warn, Never Silently

The build is the only stage that sees a template and the platform's reference at
the same time. The platform ignores what it does not recognise without writing
to stderr or changing its exit code, so anything the build declines to report is
reported by nobody.

Two responses, and the choice between them is about who is authoritative:

- **Fail** when the build knows the template is wrong: absent required
  frontmatter, a frontmatter block that is not YAML. These do not depend on a
  platform version.
- **Warn** when the build only suspects it: a frontmatter key outside the known
  reference. That reference dates faster than the templates do, and a build that
  refused a field the platform added last week would be worse than the problem.

Never stay quiet on either.

## Template Processing

### Categories

A template's category is its top-level directory under `templates/`. There are
four, declared in `TEMPLATE_CATEGORIES` in `build/utils/files.js`:

| Category | Collected | Emitted to | Frontmatter |
|----------|-----------|------------|-------------|
| `guides` | `.md` only, minus `README.md` | `directories.guides`, flat | none |
| `skills` | every file, any extension | `directories.skills`, tree preserved | on `SKILL.md` |
| `agents` | `.md` only, minus `README.md` | `directories.agents`, flat | on every file |
| `hooks` | every file, any extension | `directories.hooks`, tree preserved | none |

`skills/` and `hooks/` ship whole directories, so their contents are collected
whatever the extension and a `README.md` inside them is content rather than
directory notes. `guides/` and `agents/` are markdown surfaces and keep both the
extension filter and the `README.md` exclusion.

A top-level directory that is not one of the four is skipped with a warning
naming it. The check is driven by the category list, not by any retired
category name, so a directory added by mistake is reported the same way.

### Directory Structure

Source templates in `templates/` (no dot prefixes):

```
templates/
  apm/              # Copied verbatim to .apm/ in the bundle
  guides/           # Processed
  skills/           # Processed
  agents/           # Processed
  hooks/            # Processed
  _standards/       # Never copied (build-time only)
```

`_standards/` is not emitted and nothing in the bundle can reference it. That
also means nothing in the build checks it, so cross-references written inside a
standard are covered by `test/templates/` instead.

### Output Structure

The bundle contains (with dot prefixes):

```
claude.zip/
  .apm/
    plan.md
    spec.md
    tracker.md
    memory/
      index.md
  .claude/
    apm-guides/
      context-gathering.md
      ...
    skills/
      apm.plan/
        SKILL.md
      apm.manage/
        SKILL.md
        references/
          review-procedure.md
          finding.schema.json
          ...
    agents/
      apm-archive-explorer.md
      apm-lens-adversarial.md
      ...
    apm-hooks/
      apm-dispatch-gate.sh
      apm-precompact.sh
```

Skills keep whatever layout they have below `templates/skills/`, so a skill's
`references/` arrives as a directory rather than flattened into the skill root.
Guides and agents are flat.

### File Modes

The source mode is carried to the output, so a hook script committed executable
arrives executable in the archive. Files that receive substitution are written
and then `chmod`ed to the source mode; files copied verbatim keep it through the
copy. The archive stores the unix mode in the high 16 bits of each entry's
external attributes, which is where a test reads it from.

The mode surviving into the archive is not the same claim as the mode surviving
installation, which belongs to the extractor and is tested separately.

### Substitution by Extension

Only `.md` and `.sh` are read as text and substituted. Every other extension is
copied byte for byte, so a JSON schema shipped inside a skill keeps any braces
it contains.

Shell scripts are substituted, which means `${NAME}` in a script contains
`{NAME}`. A hook expanding a variable that shares a name with a placeholder
would be rewritten into something that still parses - `${VERSION}` becomes
`$1.0.1` - so no hook may expand a variable named after a placeholder.
`test/build/placeholders.test.js` enforces that.

### Placeholder Replacement

Supported placeholders:

| Placeholder | Resolves to |
|-------------|-------------|
| `{VERSION}` | Package version, or `VERSION` from the environment |
| `{TIMESTAMP}` | ISO timestamp |
| `{SKILL_NAME:slug}` | `/apm.<slug>`, the skill's invocation name |
| `{SKILL_PATH:name}` | `<skills dir>/<name>/SKILL.md` |
| `{GUIDE_PATH:name}` | `<guides dir>/<name>.md` |
| `{AGENT_PATH:name}` | `<agents dir>/<name>.md` |
| `{HOOK_PATH:name}` | `<hooks dir>/<name>.sh` |
| `{SKILLS_DIR}`, `{GUIDES_DIR}`, `{AGENTS_DIR}` | The configured directories |
| `{RULES_FILE}` | The target's `rulesFile` |
| `{ARGS}` | `$ARGUMENTS` |
| `{NEW_CHAT_GUIDANCE}` | The target's `newChatGuidance` |
| `{PLANNER_SUBAGENT_GUIDANCE}`, `{MANAGER_SUBAGENT_GUIDANCE}`, `{WORKER_SUBAGENT_GUIDANCE}`, `{SUBAGENT_GUIDANCE}` | Role-specific subagent text built from `subagentGuidance` |
| `{ARCHIVE_EXPLORER_GUIDANCE}` | Spawn instruction naming the archive explorer agent |

`{RULES_FILE}` reads the target's `rulesFile` field. It is not derived from the
target id: the rules file is `CLAUDE.local.md`, not `CLAUDE.md`, so a project
can version its own `CLAUDE.md` without carrying the rules block.

An unrecognised placeholder is not an error. It is emitted verbatim and reaches
the bundle looking like a placeholder, which is the one failure in this file
that is visible on inspection.

### Frontmatter

Three frontmatters exist, and they do not share a spelling convention. Copying a
field from one surface to another is a common way to write something that is
silently ignored.

**Skill frontmatter**, on `SKILL.md` only. Support files in a skill directory
carry none and are not validated. Keys are kebab-case:

```yaml
---
name: apm.plan
description: Starts the Planner at the beginning of an APM session.
disable-model-invocation: true
argument-hint: "[project context]"
allowed-tools: Agent(Explore, apm-archive-explorer)
---
```

Recognised: `name`, `description`, `argument-hint`,
`disable-model-invocation`, `allowed-tools`, `disallowed-tools`, `model`,
`hooks`.

**Agent frontmatter**, on every file in `agents/`. Note `tools` rather than
`allowed-tools`, and `disallowedTools` in camelCase rather than kebab-case:

```yaml
---
name: apm-lens-adversarial
description: Reviews a prepared artifact for what is missing as well as what is wrong.
model: sonnet
tools: Read, Grep, Glob
disallowedTools: Agent, Skill, Write, Edit, Bash
---
```

Recognised: `name`, `description`, `model`, `tools`, `disallowedTools`.

**The `hooks` block inside skill frontmatter** is a nested YAML document. The
build accepts it and checks that it parses, but APM declares its own hooks in
the project's settings file at install time instead, for reasons recorded in
`templates/skills/apm.manage/references/hooks-frontmatter.md`. The build
validates the shape; it does not install anything.

Both lists live in `KNOWN_FRONTMATTER_KEYS` in
`build/processors/frontmatter.js`, with the platform version they were verified
against. They date. Extend them when the platform gains a field.

### Frontmatter Validation

Applied to `SKILL.md` files and to every agent:

1. The block must parse as YAML. A block that does not is `TEMPLATE_PARSE_FAILED`
   and stops the build. Parse failures are never downgraded to a warning: that
   was the old behaviour and it turned a corrupt file into an empty one.
2. `name` and `description` must be present, non-empty strings, or the build
   fails with `TEMPLATE_MISSING_FIELD`. Both messages name the file.
3. A `hooks` value written as a string must itself parse as YAML.
4. Keys outside the reference for that surface produce a warning naming the file
   and the key. The build continues.

Frontmatter is emitted verbatim. There is no key allow-list applied to the
output and no renaming between source and bundle: what a template declares is
what the platform reads.

## Archive Generation

### ZIP Structure

Archives are created directly from the build directory:

```javascript
await createZipArchive(targetBuildDir, zipPath);
```

The staging directory is removed after archiving, so the archive is the only
artifact and anything inspecting the output reads it from there.

### Release Manifest

`apm-release.json` schema:

```json
{
  "version": "1.0.1",
  "assistants": [
    {
      "id": "claude",
      "name": "Claude Code",
      "bundle": "claude.zip",
      "description": "Optimized for Claude Code",
      "configDir": ".claude"
    }
  ]
}
```

The CLI's own schema in `src/schemas/release.js` still accepts an optional
`postInstallNote`; the build no longer emits one.

## Logging

Use the build logger module (not CLI logger):

```javascript
import logger from '../utils/logger.js';

logger.info('Processing target...');
logger.success('Build completed');
logger.warn('Missing optional field');
logger.error('Build failed');
```

A warning names the file and the thing found, in that order, so the line is
useful without the surrounding output.

## Configuration

### build-config.json

Required fields per target:

```json
{
  "id": "claude",
  "name": "Claude Code",
  "bundleName": "claude.zip",
  "configDir": ".claude",
  "rulesFile": "CLAUDE.local.md",
  "directories": {
    "skills": ".claude/skills",
    "guides": ".claude/apm-guides",
    "agents": ".claude/agents",
    "hooks": ".claude/apm-hooks"
  },
  "newChatGuidance": "Open a new terminal and start Claude Code",
  "subagentGuidance": {
    "hasSubagents": true,
    "toolSyntax": "Agent(subagent_type=\"Explore\", prompt=\"...\")",
    "explorerName": "Explore",
    "configNote": null
  }
}
```

`validateConfig` requires `id`, `name`, `bundleName`, `rulesFile`, and all four
entries of `directories`. It reports every missing field at once rather than the
first, so a malformed config is fixed in one pass.

A field nothing reads does not belong here. Configuration that no code consumes
reads as a supported knob and is not one.

## Testing

Build coverage lives in `test/build/`, and the cross-surface checks the build
cannot make live in `test/templates/`. Fixtures are versioned under
`test/fixtures/`, including scripts committed executable, since the mode is part
of what is under test.

Builds under test always run into a temporary directory. The pipeline empties
its output directory and deletes its staging directory, so pointing a test at
the repository would delete work.

`test/build/bundle.test.js` compares the emitted paths against
`test/fixtures/bundle-paths.json`. A change to `templates/` is expected to fail
it; refresh with `node test/build/refresh-bundle-snapshot.js` once the change is
intended.

---

**End of Document**
