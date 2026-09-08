# APM Standalone Skills

Skills that live outside the APM bundle. Unlike the skills `apm init` installs, these are not
part of a release and are used on demand.

## Available Skills

### apm-customization

Orients an AI agent working inside this repository: what each surface does, which standard
governs it, how templates become the bundle, and how to build, test and release. It is meant
for a fork or template of this repository, not for a project that has APM installed.

No installation needed. The skill is already present in any fork of this repository, and the
agent reads it directly from `skills/apm-customization/SKILL.md` while working in the repo. If
your setup does not discover it automatically, copy it into the platform's skills directory:

```bash
mkdir -p .claude/skills/apm-customization
cp skills/apm-customization/SKILL.md .claude/skills/apm-customization/SKILL.md
```

## Contributing

To propose a new standalone skill, open an issue or pull request on
[this repository](https://github.com/AlvaroTena/apm-strata).
