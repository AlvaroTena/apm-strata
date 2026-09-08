# Experiment: what skill frontmatter actually enforces

This document is a reproducible script. Follow it in a throwaway directory to re-verify what the
tool-access and hook fields of skill frontmatter really do.

**Verified against:** Claude Code 2.1.263, macOS (darwin 25.6.0), 2026-09-08.

The build emits skill frontmatter verbatim and validates only `name` and `description`. Anything
the platform does not understand is dropped in silence, so a field that looks like a guarantee can
be inert. Re-run this script whenever a new field is relied on, and whenever the version changes.

---

## 1. Fixture

Create the fixture outside any real repository. Probes need permission to write, and the auto mode
classifier of a calling session refuses `claude` invocations carrying `--permission-mode`, so grant
permission through a settings file rather than a flag.

```sh
P=$(mktemp -d)/fm-probes
mkdir -p "$P/.claude/skills" && cd "$P"
cat > .claude/settings.local.json <<'EOF'
{
  "permissions": {
    "allow": ["Write", "Edit", "Read", "Bash"],
    "defaultMode": "acceptEdits"
  }
}
EOF
```

Change one field per probe. Every probe below is a separate skill directory.

---

## 2. How long `disallowed-tools` lasts

This is the question that decides whether a skill may restrict the session that invoked it.

```sh
mkdir -p .claude/skills/probe.norite
cat > .claude/skills/probe.norite/SKILL.md <<'EOF'
---
name: probe.norite
description: Probe measuring how long disallowed-tools stays in effect.
disable-model-invocation: true
disallowed-tools: Write
---

Do exactly this and nothing else.

1. Try to create a file named `turn1.txt` containing the single word `one`, using the
   `Write` tool specifically. Do not substitute Bash, Edit, or any other tool.
2. Report on its own line either `TURN1_WRITE=PRESENT` if the Write tool exists in your
   available tools, or `TURN1_WRITE=ABSENT` if it does not.

End your turn.
EOF
```

Run the skill's turn, keeping the session id:

```sh
claude -p --output-format json "/probe.norite" </dev/null > t1.json 2>/dev/null
jq -r '.result' t1.json
jq -r '.session_id' t1.json
ls turn1.txt          # expected: no such file
```

Observed: `turn1.txt` is not created. The model reports `TURN1_WRITE=PRESENT` and says the call was
denied - the tool stays visible and the denial happens at call time.

**Always run the control.** Without it, the denial could be the permission settings rather than the
field. Copy the skill, delete only the `disallowed-tools` line, and run it:

```sh
mkdir -p .claude/skills/probe.canwrite
sed 's/^name: probe.norite/name: probe.canwrite/; /^disallowed-tools: Write$/d; s/turn1\.txt/control1.txt/' \
  .claude/skills/probe.norite/SKILL.md > .claude/skills/probe.canwrite/SKILL.md
claude -p "/probe.canwrite" </dev/null
ls control1.txt       # expected: created
```

Now take a second turn in the same session, with no skill invoked:

```sh
claude -p --resume "<session id from t1.json>" \
  "Try to create a file named turn2.txt containing the single word two, using the Write tool specifically. Report TURN2_WRITE=OK or TURN2_WRITE=DENIED." </dev/null
ls turn2.txt          # expected: created
```

**Result:** denied on the skill's turn, allowed on the next one. `disallowed-tools` lasts the
invoking turn and clears at the next user message. It cannot cripple the rest of a session.

---

## 3. Whether `hooks` registers a real hook

```sh
mkdir -p .claude/skills/probe.hook
cat > .claude/skills/probe.hook/SKILL.md <<EOF
---
name: probe.hook
description: Probe checking whether a skill-scoped hook registers and how long it stays.
disable-model-invocation: true
hooks:
  PreToolUse:
    - matcher: "Write"
      hooks:
        - type: command
          command: "echo FIRED >> $P/hook.log"
---

Do exactly this and nothing else.

1. Use the \`Write\` tool to create a file named \`hookA.txt\` containing the single word \`a\`.
2. Report on its own line \`SKILL_TURN_DONE\`.

End your turn.
EOF
: > hook.log
```

### 3.1 Use one process, not `--resume`

Measuring persistence needs one process across two turns. A `-p --resume` run starts a **new**
process that never invoked the skill, so the hook is absent and the reading is a false negative.
Use a background session and message it instead. Make the launch prompt the invocation, because a
message from another session cannot invoke this skill - see §6.

```sh
claude --bg --name fmhook "/probe.hook"
# wait until `claude agents --json` reports it idle
cat hook.log          # expected: 1 line
```

Then send a second turn from another session, with no skill invoked, asking it to write `hookC.txt`
with the Write tool.

```sh
cat hook.log          # expected: 2 lines
```

**Result:** the hook fires on the skill's own turn and on later turns of the same session. It does
not survive a process restart, so `-p --resume` sees it only on the turn that registers it.

### 3.2 Whether the hook can block

A gate needs refusal, not logging. Exit 2 from the hook:

```sh
mkdir -p .claude/skills/probe.block
cat > .claude/skills/probe.block/SKILL.md <<EOF
---
name: probe.block
description: Probe checking whether a skill hook can block a tool call with exit 2.
disable-model-invocation: true
hooks:
  PreToolUse:
    - matcher: "Write"
      hooks:
        - type: command
          command: "echo BLOCKED >> $P/block.log; echo 'probe: writes are gated' >&2; exit 2"
---

Use the \`Write\` tool to create a file named \`blocked.txt\` containing the word \`x\`.
Report \`BLOCK_RESULT=CREATED\` or \`BLOCK_RESULT=REFUSED\`. Do not use Bash or Edit instead.
End your turn.
EOF
claude -p "/probe.block" </dev/null
ls blocked.txt        # expected: no such file
```

**Result:** the call is refused, the file is not created, and the hook's stderr text reaches the
model, which reports the reason. A skill-declared hook can stop an action.

---

## 4. Whether `allowed-tools` restricts

```sh
mkdir -p .claude/skills/probe.allow
cat > .claude/skills/probe.allow/SKILL.md <<'EOF'
---
name: probe.allow
description: Probe checking whether allowed-tools restricts anything.
disable-model-invocation: true
allowed-tools: Read
---

Do all of the following and report each on its own line.

1. Use the `Write` tool to create `allow-write.txt` containing `w`. Report `WRITE=OK` or `WRITE=DENIED`.
2. Use the `Bash` tool to run `echo bash-ran`. Report `BASH=OK` or `BASH=DENIED`.

End your turn.
EOF
claude -p "/probe.allow" </dev/null
```

**Result:** `WRITE=OK`, `BASH=OK`. Listing only `Read` restricts nothing. `allowed-tools` grants
permission; it is not a whitelist. Use `disallowed-tools` to take a tool away.

---

## 5. What happens to a field the platform does not know

```sh
mkdir -p .claude/skills/probe.unknown
cat > .claude/skills/probe.unknown/SKILL.md <<'EOF'
---
name: probe.unknown
description: Probe checking how unknown frontmatter keys are handled.
disable-model-invocation: true
agents:
  - Explore
  - some-agent-that-does-not-exist
wibble-wobble: banana
nested-nonsense:
  alpha: 1
  beta: [x, y]
---

Report on its own line `UNKNOWN_FIELD_SKILL_RAN`. Do nothing else. End your turn.
EOF
claude -p "/probe.unknown" </dev/null >out.txt 2>err.txt
cat out.txt; wc -c < err.txt
```

**Result:** the skill loads and runs, exit code 0, and `err.txt` is empty. Unknown keys - including
`agents`, which reads like a capability and is not one - are dropped without a word. Nothing at
build time or run time reports them.

---

## 6. A skill that only a person may invoke is not reachable by message

Discovered while building §3.1. Sending `/probe.hook` to a background session as a message does not
invoke it. The receiving session treats it as a Skill tool call and is refused:

```
Error: Skill probe.hook cannot be used with Skill tool due to disable-model-invocation.
Ask the user to run /probe.hook themselves - it cannot be invoked via the Skill tool.
```

`disable-model-invocation: true` blocks every non-human path, a peer session included. A skill
carrying it can be started only as a launch prompt or typed by the person. Anything driven by
messages must therefore instruct the session to read a file and act, never to invoke such a skill.

---

## 7. Results

| Question | Answer |
|---|---|
| Does `disallowed-tools` outlast the skill's turn? | No. It clears at the next user message. |
| Is the tool hidden, or denied? | Denied at call time; the model still sees it and may attempt it. |
| Does `hooks` in skill frontmatter register a real hook? | Yes. |
| Does that hook fire after the skill's turn? | Yes, for the rest of the session's process. |
| Does it survive a process restart (`-p --resume`)? | No. |
| Can it block a tool call? | Yes, with exit 2; its stderr reaches the model. |
| Does `allowed-tools` restrict other tools? | No. It grants permission only. |
| Are unknown frontmatter fields reported? | No. Silently dropped, exit 0, empty stderr. |

---

## 8. Consequences

**A restriction may be declared on a skill without harming the session.** `disallowed-tools` costs
only the invoking turn, so a skill that must not mutate state can say so directly. Write the
procedure so the agent does not attempt the denied tool at all - a denial still burns a step and
produces a confusing message.

**Gates built on `hooks` are sound.** A skill can register a `PreToolUse` hook that refuses an
action and explains why, and it stays in force for the rest of the session. The one limit worth
designing around: the registration lives in the process, so a session resumed into a new process
loses it until something invokes the skill again.

**Trust no frontmatter field that has not been run.** Neither the build nor the platform reports an
unrecognised key. Any field the design leans on for a guarantee is verified with a probe like these
before anything is built on it.

---

**End of Document**
