# APM Versioning Strategy

APM uses a decoupled versioning system with two independent release tracks: the **CLI tool** (installed from git) and **APM template releases** (distributed via GitHub Releases). Both tracks follow Semantic Versioning and share the same major version to ensure compatibility.

## Versioning Tracks

### 1. APM CLI (`apm-strata`, installed from git)

The CLI source code lives in `src/`. Changes to this directory ship on the next tag. The CLI handles template management via `apm init`, `apm custom`, `apm update`, `apm archive`, `apm add`, `apm remove`, and `apm status`.

The CLI is installed from a tarball published with each release rather than from the NPM registry. The package is named `apm-strata`, not upstream's `agentic-pm`, so it installs alongside an upstream CLI instead of replacing it and an upstream release can never be pulled over it by `npm update`.

### 2. APM Template Releases (GitHub Releases)

Templates live in `templates/` and are processed by the build system in `build/`. Running `npm run build:release` generates the `claude.zip` bundle plus an `apm-release.json` manifest. These artifacts are published as GitHub Releases.

Template releases are fully decoupled from CLI versioning. The release workflow auto-increments patch versions (1.0.0 → 1.0.1) based on the latest stable release tag. For minor/major bumps, provide a version override when triggering the workflow.

Pre-release versions (e.g., `v1.0.0-test-1`, `v1.1.0-beta-1`) are supported for testing. Pre-releases sort before their stable counterpart (`v1.0.0-test-1 < v1.0.0`) and are excluded when the CLI fetches the "latest" release.

### 3. Build System

The `build/` directory, CI/CD workflows, and configuration files are not versioned. Changes are tracked via git history only.

## Stable Releases Follow Acceptance

The first stable version of a release line - `1.1.0`, for example - is published only once the project has passed its acceptance: a real session run with the release, checked against the acceptance criteria. Until then the line is published as pre-releases with an identifier, `1.1.0-alpha.1`, `1.1.0-alpha.2` and so on, and each round of fixes that acceptance calls for ships as the next one.

The reason is where the fixes go. The first release of this fork was published as stable before it had been accepted, and the defects acceptance found right after had nowhere to land except as patches to a version nobody had validated. Held back as pre-releases, those fixes stay inside the line being tested, and the stable version, when it comes, is the one that passed. Because pre-releases are excluded from "latest", `apm init` and `apm update` keep resolving to the latest stable release while a line is still being tested; a pre-release is installed on purpose, with `--tag`.

Promotion keeps the stable release identical to what was accepted. The accepted pre-release's commit is pinned on a `release/<line>` branch - `release/1.1` - and the stable release is published from that branch with one commit on top that changes only the version in `package.json` and dates the changelog entry, because the package version names the CLI tarball and is recorded at install. No code changes between the accepted pre-release and the stable one. Work on the next line continues on `main` with its own pre-releases.

## Version Compatibility

The CLI and template releases are decoupled but tied by **major version**. CLI v1.x will only fetch v1.x.x releases from the official repository, ensuring template compatibility. Minor and patch versions can differ between CLI and templates.

## `apm-strata` CLI Behavior

### Official Repository (`apm init`)

By default, `apm init` fetches the latest stable release matching the CLI's major version. Pre-release versions are excluded from "latest" but can be installed explicitly with `--tag` (e.g., `apm init --tag v1.0.0-test-1`).

### Custom Repositories (`apm custom`)

**Custom repositories have no version filtering.** Users can select any available release regardless of CLI version. This enables access to experimental versions, community-maintained templates, or unreleased changes. See [SECURITY.md](SECURITY.md) for security considerations.

### Updating Templates (`apm update`)

For official installs, `apm update` fetches the latest compatible release. For custom installs, `apm update` fetches newer releases from the same custom repository.

## Metadata Tracking

Installed template information is stored in `.apm/metadata.json`, including the source (official or custom), repository, release version, installed target, and timestamps. This allows `apm update` to determine the current state and available updates.