# APM External Lenses

## 1. Overview

**Reading Agent:** Manager

An external lens is any command that receives the path of the staged review directory, runs without write access, and returns findings in the canonical shape as JSON. Everything else about it is the same as a lens that runs as a subagent: it reads the material itself, it never sees another lens's findings, and it does not grade.

What an external lens adds is that it is not this model. A reviewer from another provider fails differently, and the findings the two sets do not share are the ones a single provider would have missed. Run external lenses alongside the shipped ones, and keep the `lens` field on every finding so the sets stay separable.

The canonical shape is `{SKILLS_DIR}/apm.manage/references/finding.schema.json`. Its root is an object holding a `findings` array rather than a bare array, because structured-output APIs reject a schema whose root is an array.

---

## 2. Declaration

The project declares its external lenses in its rules block, under an `## External lenses` heading, one line per lens: the lens name, then the command that runs it. `{staged_dir}` marks where the path of the staged review directory is substituted at launch.

```markdown
## External lenses

- `codex-adversarial`: `codex exec --sandbox read-only ... --add-dir {staged_dir} ...`
- `cursor-adversarial`: `agent -p --mode ask --output-format json "..."`
```

A project that declares no external lenses runs the shipped lenses alone.

---

## 3. Codex

```bash
codex exec \
  --sandbox read-only \
  --ask-for-approval never \
  --json \
  --output-schema {SKILLS_DIR}/apm.manage/references/finding.schema.json \
  -C <directory holding no AGENTS.md> \
  --add-dir {staged_dir} \
  --add-dir <repository root> \
  -m <model> \
  "<lens prompt>" < /dev/null
```

Pass the prompt as an argument rather than on stdin, and redirect stdin from `/dev/null` - Codex has open bugs around terminal detection that hang or misread a piped prompt.

Run it from a directory that holds no `AGENTS.md`. Codex reads the `AGENTS.md` chain of its working directory and offers no flag to skip it, so a lens launched from inside a project inherits that project's instructions on top of its own - the review is then partly steered by the same document the author was steered by. An empty scratch directory as `-C`, with the material reachable through `--add-dir`, keeps the lens reading only what you staged.

---

## 4. Cursor

```bash
agent -p --mode ask --output-format json "<lens prompt>"
```

`-p` runs non-interactively but grants the agent every tool, writing and shell included. `--mode ask` holds it read-only, which is what a lens needs.

---

## 5. MCP Configuration

A helper session launched from a command line inherits the MCP configuration of whatever launched it. On a machine with MCP servers configured, the tool schemas alone can fill the context window before the lens reads anything - one measurement recorded 197.7k of a 200k window consumed at startup, and the invocation failed before it opened the artifact.

Launch a lens that runs as a Claude Code session with `--strict-mcp-config` and `--setting-sources ""`. Without both, the lens loads whatever servers and settings the operator's machine happens to have, its context budget varies by machine, and the review stops being reproducible.

---

**End of Reference**
