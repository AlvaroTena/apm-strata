# Security Considerations

This document covers security risks when using the `apm-strata` CLI, particularly with custom repositories.

## Custom Repository Risks

When using `apm custom` to install templates from third-party repositories, you are downloading and extracting files from an untrusted source. The CLI displays a security disclaimer before installation, but you should understand the risks:

### What Custom Repositories Can Do

- **Write files anywhere within the project directory**: Official bundles only contain files within `.claude/` (skills, guides, agents and hook scripts) and `.apm/`. A malicious bundle could include entries with arbitrary paths like `src/malicious.js` or `package.json`, writing files anywhere within the project root. Path traversal outside the project directory is blocked by the CLI.

- **Overwrite specific APM files**: Bundles write only the files they contain. A malicious bundle could overwrite existing APM skills, guides, agents or hook scripts with modified versions.

- **Install malicious agent instructions**: APM templates define how AI assistants behave. Malicious templates could instruct agents to execute harmful commands, exfiltrate data, or modify code in subtle ways when the agent runs.

### What Custom Repositories Cannot Do

- **Execute code during installation**: The CLI only extracts ZIP contents. No scripts run during `apm init` or `apm custom`.

- **Write files outside the project directory**: The CLI validates that all extracted paths resolve within the project directory. Entries attempting path traversal are blocked with a warning.

- **Delete or modify files not in the bundle**: Only files explicitly included in the ZIP are written. Existing files outside the bundle's paths are untouched.

## Mitigation Strategies

1. **Review the repository before installation**: Check the repository's README, issues, and commit history. Look for signs of active maintenance and community trust.

2. **Inspect bundle contents after installation**: Review the extracted files under your project's `.claude/` and `.apm/` before running a session against them, and review the hook declarations the CLI merged into `.claude/settings.json`.

3. **Use specific tags**: Instead of relying on "latest", specify a known-good tag with `--tag` to avoid pulling unexpected changes.

4. **Check the installation metadata**: After installation, review `.apm/metadata.json` to verify the source repository and version.

5. **Prefer official repositories**: When possible, use `apm init` for official, reviewed templates.

6. **Audit saved repositories**: Periodically review saved repositories with `apm custom --list`. Consider re-enabling the security disclaimer for repositories you have not recently audited.

## Known Limitations

- **`skipDisclaimer` silences warnings permanently**: Saved repositories can be configured to skip the security disclaimer. If a previously trusted repository is compromised, users with the disclaimer skipped receive no warning on `apm custom`, `apm add`, or `apm update`. Periodically review saved repositories with `apm custom --list`.

- **No release signature verification**: The CLI does not verify cryptographic signatures on releases. Security relies on GitHub's HTTPS transport. A compromised GitHub account or repository could serve malicious bundles that appear legitimate.

- **No content scanning**: The CLI does not inspect or validate the contents of extracted files. It enforces path boundaries but does not analyze what the files contain.

## Reporting Security Issues

If you discover a security vulnerability in the `apm-strata` CLI or official templates, please report it by opening an issue at https://github.com/AlvaroTena/apm-strata/issues with the "security" label, or contact the maintainer directly.

Do not publicly disclose vulnerabilities until they have been addressed.
