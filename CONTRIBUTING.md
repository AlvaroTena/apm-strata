# Contributing to Agentic Project Management (APM)

Thank you for considering contributing to APM! Your contributions help build a better framework for AI-assisted project management.

## Ways to Contribute

### Reporting Bugs & Workflow Issues

- **Search existing issues** first: [GitHub Issues](https://github.com/AlvaroTena/apm-strata/issues)
- **For new bug reports**, include:
  - APM CLI version (run `apm --version` or `npm list -g apm-strata`)
  - Node.js and npm versions (run `node --version` and `npm --version`)
  - Claude Code version (`claude --version`)
  - Agent type experiencing issues (Planner, Manager, or Worker)
  - Step-by-step reproduction of the issue (if possible, otherwise a detailed description)
  - Expected vs actual behavior

### Suggesting Features & Improvements

- Workflow improvements: procedures, coordination patterns, memory system optimizations
- Documentation improvements: clearer explanations, additional examples, missing use cases
- Platform support: better use of Claude Code's subagents, hooks and background sessions
- Build system: placeholder additions, platform-specific enhancements

### High-Priority Areas

**Workflow Testing & Feedback**
- Run APM sessions on real projects and report issues via [GitHub Issues](https://github.com/AlvaroTena/apm-strata/issues)
- Test across model and effort combinations
- Identify edge cases in coordination, Handoff, and session continuation

**Template Standards**
- Help improve the template authoring standards in `templates/_standards/`
- Resources: WORKFLOW.md, TERMINOLOGY.md, STRUCTURE.md, WRITING.md
- Contributions needed: compliance findings, writing improvements, structural refinements

**Standalone Skills**
- The `skills/` directory contains standalone skills installed independently from APM bundles
- Current skills: [apm-customization](skills/apm-customization/) (repo customization)
- Contributions welcome for new standalone skills that complement the APM workflow

### Community Contributions

- Share adaptations: domain-specific customizations via custom repositories
- Best practices: cost optimization strategies, effective coordination patterns
- Case studies: real project examples using APM

### Community Extensions

This fork targets Claude Code only. The guides assume subagents, background sessions and hooks, so there is no portable subset to extend to another assistant; a port would be a fork of this fork.

Community extensions are not officially supported, may lag behind releases, and should be tested thoroughly before use. If you're interested in developing or maintaining an extension, please open an issue to discuss.

## Contribution Process

### Setting Up Your Development Environment

1. **Fork and clone the repository:**
   ```bash
   git clone https://github.com/YOUR-USERNAME/apm-strata.git
   cd apm-strata
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Create a feature branch:**
   ```bash
   git checkout -b feature/description-of-change
   ```

### Making Changes

APM uses a build system that processes source templates into platform-specific bundles. Understanding where to make changes is important:

#### File Locations

- **Templates (skills, guides, agents, hooks):** Edit files in `templates/`. This is the core deliverable. All template changes must comply with `templates/_standards/`.
- **Build system:** Edit files in `build/` for processors, config, and generators.
- **CLI source:** Edit files in `src/` for CLI command behavior.
- **Standalone skills:** Edit files in `skills/` for independently installable skills.
- **Documentation:** Docs live in this repository. The README covers the design, `docs/` covers formats such as spec deltas, and `skills/apm-customization/` orients an agent working on the templates themselves.

**Important:** Template changes follow a top-down propagation. Workflow changes start in `WORKFLOW.md`, then propagate to affected skills, guides, agents and hooks. See the change propagation rules in [CLAUDE.md](CLAUDE.md).

#### Building

After modifying files in `templates/` or `build/`, run:

```bash
npm run build:release
```

This processes templates and creates platform-specific bundles in `dist/`.

### Testing Your Changes

**For template changes** (`templates/`):
- Run `npm run build:release` to verify the build completes
- Test in a real project with Claude Code
- Include example interactions or observations in your PR to speed review

**For CLI or build system changes** (`src/` or `build/`):
- Run `npm run build:release` to verify build output
- Test CLI commands manually
- Verify generated output in `dist/` is correct

### Pull Requests

1. Ensure your changes are tested.
2. Commit with clear messages following the conventions in [CLAUDE.md](CLAUDE.md).
3. Push your branch and create a Pull Request with a clear description.
4. Reference related issues if applicable.
5. Include test instructions for template changes.

### Versioning Considerations

APM uses a decoupled versioning system where the CLI and templates version independently but share the same major version number. See [VERSIONING.md](VERSIONING.md) for details.

## License Requirements

APM uses Mozilla Public License 2.0 (MPL-2.0). By contributing, you agree that:
- Your contributions will be licensed under MPL-2.0
- Improvements to core APM files will remain open source
- Proper attribution is maintained

## Questions & Discussion

- Technical questions: open a GitHub issue
- General inquiries: open a discussion or an issue on [this repository](https://github.com/AlvaroTena/apm-strata/issues)
- Collaboration: mention @AlvaroTena in relevant issues or PRs

---

Your contributions help make APM better for everyone. Thank you for being part of the community!
