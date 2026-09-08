# CLI Standards

Coding standards and patterns for the APM CLI.

## Error Handling

### CLIError Class

Use the `CLIError` class with error codes:

```javascript
import { CLIError } from '../core/errors.js';

// Factory methods for consistent errors
throw CLIError.networkError(url, reason);
throw CLIError.releaseNotFound(repo);
throw CLIError.manifestMissing(tag);
throw CLIError.manifestInvalid(tag, errors);
throw CLIError.bundleNotFound(bundleName, tag);
throw CLIError.notInitialized();
throw CLIError.downloadFailed(url, reason);
throw CLIError.extractionFailed(reason);
throw CLIError.archiveFailed(reason);
```

### Fail Fast

Validate early, exit with clear messages:

```javascript
const metadata = await readMetadata();
if (!metadata) {
  throw CLIError.notInitialized();
}
```

### Error Codes

Use semantic codes from `CLIErrorCode`:

- `NETWORK_ERROR` - HTTP request failures
- `RELEASE_NOT_FOUND` - No matching releases
- `MANIFEST_MISSING` - Missing apm-release.json
- `MANIFEST_INVALID` - Schema validation failures
- `BUNDLE_NOT_FOUND` - Missing bundle asset
- `NOT_INITIALIZED` - No .apm/metadata.json
- `CONFIG_READ_FAILED` - Failed to read global config
- `CONFIG_WRITE_FAILED` - Failed to write global config
- `METADATA_READ_FAILED` - Failed to read workspace metadata
- `METADATA_WRITE_FAILED` - Failed to write workspace metadata
- `EXTRACTION_FAILED` - ZIP extraction failure
- `DOWNLOAD_FAILED` - Asset download failure
- `ARCHIVE_FAILED` - Session archive failure
- `UNKNOWN_CONSUMER` - Unsupported knowledge consumer requested
- `UNSUPPORTED_PLATFORM` - Platform cannot support the requested operation
- `PREREQUISITE_MISSING` - Required external tool missing or too old
- `KNOWLEDGE_SETUP_FAILED` - Knowledge layer install, ingest or audit failure
- `TASK_LOG_INVALID` - Task log claims section missing or malformed
- `DELTA_NOT_FOUND` - No delta document at the given path
- `DELTA_INVALID` - Delta violates one or more format rules
- `SETTINGS_UNREADABLE` - Project settings file exists but is not readable JSON

## Module Structure

### Single Responsibility

Each module handles one concern:

- `core/constants.js` - Configuration constants
- `core/errors.js` - Error classes
- `core/config.js` - Global config (~/.apm/config.json)
- `core/metadata.js` - Workspace metadata (.apm/metadata.json)
- `services/github.js` - GitHub API access
- `services/releases.js` - Release operations
- `services/extractor.js` - ZIP extraction
- `services/archive.js` - Session archival (.apm/archives/)
- `services/cleanup.js` - Installed file removal and directory cleanup
- `schemas/release.js` - Release manifest validation
- `ui/logger.js` - Terminal output
- `ui/prompts.js` - User interactions
- `commands/init.js` - Init command
- `commands/custom.js` - Custom command
- `commands/update.js` - Update command
- `commands/archive.js` - Archive command
- `commands/add.js` - Add command
- `commands/remove.js` - Remove command
- `commands/status.js` - Status command
- `commands/knowledge.js` - Knowledge layer commands (init, emit, audit)
- `commands/delta.js` - Delta validation command
- `services/knowledge/index.js` - Knowledge consumer registry and adapter contract
- `services/knowledge/claude-obsidian.js` - claude-obsidian consumer adapter
- `services/knowledge/claims.js` - Task log claims section parser
- `services/knowledge/exec.js` - External process execution without a shell
- `services/delta.js` - Delta parser and format rules
- `services/settings.js` - Project Claude Code settings merge

### Tests

Tests live in `test/`, one directory per surface: `test/cli/` for `src/`,
`test/build/` for `build/`. Files are named `<topic>.test.js` and import the
code under test by relative path. Run them with `npm test`.

Vitest picks them up through its default include pattern; `vitest.config.js`
at the repository root only excludes worktree checkouts, so a branch under
review does not run the suite once per worktree.

New or modified code under `src/` ships with tests, and `npm test` is green
before the work is reported. Tests touch neither the network nor real paths:
replace external processes by mocking `services/knowledge/exec.js`, and the
filesystem by mocking `fs-extra`.

A test that pins a fixed defect earns its place by failing without the fix.
Check that it does before trusting it.

### Export Patterns

Named exports for functions, default for primary export:

```javascript
// Named exports for utility functions
export async function readConfig() { ... }
export async function writeConfig(config) { ... }

// Default export for single-responsibility modules
export default { readConfig, writeConfig, ... };
```

## Async Patterns

### Async/Await

Use async/await, not Promise chains:

```javascript
// Good
const releases = await fetchReleases(repo);
const manifest = await fetchReleaseManifest(release);

// Avoid
fetchReleases(repo)
  .then(releases => fetchReleaseManifest(...))
  .then(manifest => ...);
```

### Timeout Handling

Configure timeouts for network requests:

```javascript
const response = await axios.get(url, {
  timeout: 30000,  // 30 seconds for API
  maxRedirects: 5
});
```

## UI Patterns

### Logger Module

Use logger for all output:

```javascript
import logger from '../ui/logger.js';

logger.info('Fetching releases...');
logger.success('Installation complete!');
logger.warn('Already initialized');
logger.error('Network request failed');
```

### Prompts Module

Use prompts for all user interaction:

```javascript
import { selectAssistant, confirmAction } from '../ui/prompts.js';

const assistantId = await selectAssistant(assistants);
const proceed = await confirmAction('Continue?', true);
```

A prompt that has nothing to ask does not ask. `selectAssistant` returns the
only assistant directly when the list holds one, without drawing the banner or
opening the prompt, so callers must not assume it interacted with the user.

### Output Style

- Use `logger.info()` for progress updates
- Use `logger.success()` for completion messages
- Use `logger.warn()` for non-fatal issues
- Use `logger.error()` only for failures
- No emojis in output (ASCII banner is the exception)

#### Copyable blocks

One deliberate exception to routing output through `logger`: text the user is
meant to copy verbatim is printed with `console.log`. The log prefixes would
travel with it into wherever it is pasted.

Today that is the knowledge layer rules block, printed by
`commands/knowledge.js`. Do not "fix" it to use `logger`.

```javascript
logger.info('Declare this in the project rules file:');
logger.blank();
for (const line of rules) {
  console.log(line);
}
```

Introduce the exception only for a whole block that is copied as a unit, and
keep the surrounding explanation on the logger.

## Data Schemas

### ~/.apm/config.json

Global CLI configuration:

```json
{
  "customRepos": [
    {
      "repo": "owner/repo",
      "addedAt": "2024-01-01T00:00:00.000Z",
      "skipDisclaimer": false
    }
  ]
}
```

### .apm/metadata.json

Workspace installation state:

```json
{
  "source": "official",
  "repository": "owner/repo",
  "releaseVersion": "v1.0.0",
  "cliVersion": "1.0.0",
  "assistants": ["claude"],
  "installedFiles": {
    "_apm": [".apm/plan.md", ".apm/spec.md"],
    "claude": [".claude/commands/apm-1-initiate-planner.md"]
  },
  "installedAt": "2024-01-01T00:00:00.000Z"
}
```

### apm-release.json

Release manifest schema:

```json
{
  "version": "1.0.0",
  "assistants": [
    {
      "id": "claude",
      "name": "Claude Code",
      "bundle": "claude.zip",
      "description": "Optimized for Claude Code",
      "configDir": ".claude",
      "postInstallNote": "..."
    }
  ]
}
```

`postInstallNote` is optional (only Codex currently uses it).

## Version Filtering

The CLI filters releases by major version:

- v1.x CLI → fetches only v1.x.x releases from official repo
- Custom repos: no filtering (user selects release)

```javascript
import { CLI_MAJOR_VERSION } from '../core/constants.js';

const filtered = filterByMajorVersion(releases, CLI_MAJOR_VERSION);
```

## Command Patterns

### Command Structure

Each command follows this pattern:

```javascript
export async function initCommand(options = {}) {
  // 1. Check preconditions
  if (!force && await isInitialized()) {
    const proceed = await confirmAction('Re-initialize?');
    if (!proceed) return;
  }

  // 2. Fetch data
  const releases = await fetchOfficialReleases();
  const latest = getLatestRelease(releases);

  // 3. User interaction, when there is anything to ask
  const assistantId = await selectAssistant(manifest.assistants);

  // 4. Perform action
  await downloadAndExtract(url, destPath);

  // 5. Update state
  await writeMetadata(metadata);

  // 6. Success message
  logger.success('Initialized!');
}
```

The six steps are an order, not a quota. A command that has nothing to fetch
or no state to persist skips that step; it does not invent work to fill it.
Number the comments by what the step is, so a reader can tell a skipped step
from a missing one.

### Command Reference

Every command's six steps, so a change to one can be checked against what it
is supposed to do.

#### knowledge init

Installs a knowledge consumer and initializes its vault. One vault per
project.

| Option | Meaning |
|---|---|
| `--consumer <id>` | Consumer to install. Defaults to `claude-obsidian`. |
| `--vault <path>` | Vault path. Defaults to `./wiki`. |
| `--clone-dir <path>` | Where to install the consumer product. Defaults to `<vault>/../.claude-obsidian`. |

1. Resolve the consumer and reject unsupported platforms.
2. Return early when the vault already exists, reprinting the rules block.
3. Verify the consumer's prerequisites.
4. Install the product and initialize the vault.
5. Report what was installed and what changed.
6. Print the rules block the project must declare.

The platform check precedes everything because there is nothing to do on a
platform the consumer cannot write on. The idempotence check precedes the
prerequisite check, so a second run does not demand tools it will not use.

#### knowledge emit

Ingests a task log into the vault. The page is assembled from the log's claims
section; nothing is authored.

| Option | Meaning |
|---|---|
| `--task-log <path>` | Task log to ingest. Required. |
| `--project <name>` | Project name. Required. |
| `--stage <number>` | Stage number. Required. |
| `--task <number>` | Task number. Required. |
| `--consumer`, `--vault`, `--clone-dir` | As for `knowledge init`. |

1. Resolve the consumer and require an initialized vault.
2. Parse the claims section of the task log.
3. Return early when the log declares no claims.
4. Ingest through the consumer.
5. Report the claims recorded and any retired.
6. Report the source record the claims hang from.

#### knowledge audit

Audits the substrate and writes the report where the next planner reads it.

| Option | Meaning |
|---|---|
| `--out <path>` | Where to write the report. Required. |
| `--as-of <date>` | Provenance freshness date, `YYYY-MM-DD`. Defaults to today in UTC. |
| `--consumer`, `--vault`, `--clone-dir` | As for `knowledge init`. |

1. Resolve the consumer, require a vault, validate the date.
2. Collect the substrate report from the consumer.
3. Compose the document.
4. Write it to `--out`.
5. Report where it went.
6. Warn when claims are in dispute.

#### delta validate

Checks a delta against the spec it changes. Takes a delta document or a
directory, which is walked. Exits non-zero when any rule is violated.

1. Resolve the path and require it to exist.
2. Collect the documents to check.
3. Check each against its baseline spec.
4. Report per document.
5. Fail when any violation was found.
6. Report success.

### Project Settings

Installation declares APM's hooks in the project's `.claude/settings.json`
through `services/settings.js`, from every path that installs or reinstalls a
bundle: `init`, `custom`, `add` and `update`. `remove` withdraws them once the
last assistant is gone, because the hook scripts live in an assistant's config
directory and the declarations would otherwise outlive them.

**That file belongs to the user. Merge into it; never write over it.** A
project may already carry its own hooks on the same events, its permissions,
its environment, its model. Losing any of that would be a silent failure: the
user finds out when something stops working for no visible reason. Everything
not APM's own is copied through untouched, and the writer prunes only what it
emptied.

Rules the merge follows, each of which a test pins:

- **Ownership is decided by the script path inside the command**, not by
  position in the array and not by the event. A user's hook on the same event
  and matcher survives as its own matcher group, and APM's entry is recognized
  again after the user reformats the file.
- **Installing twice changes nothing.** An existing entry of ours is replaced
  in place rather than appended, so a corrected command also lands on
  reinstall.
- **An unparseable file is refused, not rewritten.** Rewriting it would destroy
  whatever the user has in there. `SETTINGS_UNREADABLE` says so and the file is
  left alone.
- **Withdrawal is surgical.** A matcher group shared with the user keeps its
  own handlers; an event keeps its other groups; `hooks` survives if anything
  is left in it.

Verified against the Claude Code hooks reference for 2.1.263, and worth
knowing before editing the declarations:

- Event names are exact. `PreToolUse` takes a `matcher`; `PreCompact` has no
  matcher support, so its group carries only `hooks`.
- A handler with no `args` is shell form: the `command` string is passed to
  `sh -c`. `$CLAUDE_PROJECT_DIR` resolves the project root, so a hook works
  whatever the working directory is when it fires.
- **Invoke a shipped script through `sh`, not by bare path.** A hook must not
  depend on a mode bit surviving installation.

Extraction restores the execute bit the archive recorded, normalized to
`0755`; an archive does not get to choose arbitrary modes. Before that,
`fs.writeFile` left every extracted file at the default mode, which made a
shipped hook script unrunnable by bare path.

### Knowledge Consumer Adapters

The knowledge commands know nothing about any particular tool. A consumer is
an adapter registered in `services/knowledge/index.js`, whose header carries
the contract. Adding a consumer is a new module plus one line in the registry;
no command changes.

When a command needs something a consumer must provide, add it to the contract
and document it in that header. Do not reach around the registry by importing
a specific adapter.

Three constraints that adapters have had to respect, recorded because they are
not obvious and they were expensive to find:

- **Generate every timestamp in UTC.** A consumer may validate dates against
  the current UTC date, which makes a local timestamp fail only during the
  hours the two dates differ. That is an intermittent failure and a miserable
  one to diagnose.
- **An approval hash cannot be precomputed** when it binds a plan to a
  resolved path. Run the review step, read the hash from its output, feed it
  back. Field names differ between commands of the same tool, so read the one
  the command in hand actually reports.
- **Derive identifiers that other documents will cite from content, not from
  position.** A positional identifier changes when its document is reordered,
  which silently repoints existing references at a different subject.

### Entry Point

The entry point handles errors at the top level:

```javascript
program
  .command('init')
  .action(async (options) => {
    try {
      await initCommand(options);
    } catch (err) {
      handleError(err);
    }
  });
```

`displayHelp` replaces Commander's global help, and that override is inherited
by every subcommand. The entry point restores Commander's own formatter on
each one after registration, so `apm <command> --help` documents the command
rather than reprinting the global help. A new command group needs nothing
extra; the loop walks what is registered. Call the prototype method, not
`helper.formatHelp`, which is the override and recurses.

Help text is covered by `test/cli/help.test.js`, which runs the entry point as
a process, because neither the text nor the wiring is reachable by importing a
module.

**End of Document**
