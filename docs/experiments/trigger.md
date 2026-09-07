# Experiment: background session lifecycle and the message trigger

This document is a reproducible script. Follow it top to bottom in a throwaway directory to
re-verify, on a new Claude Code release, that a work session can be dispatched, woken by a
message, stopped, resumed and deleted.

**Verified against:** Claude Code 2.1.263, macOS (darwin 25.6.0), 2026-09-08.
Re-run the whole script when the version changes - several results below are behaviours the
help text does not state.

---

## 1. What is being tested

One session per unit of work, running in the background, in its own git worktree, woken by a
fixed-text message rather than by a human typing into it:

1. **Dispatch** - write a task file to a message bus, launch a named background session bound to
   a worktree, send it a fixed-text message.
2. **Execution** - the session reads the task file, branches, works, commits, writes a report,
   messages the sender back.
3. **Stop** - stop the session; the conversation survives.
4. **Resume** - write a follow-up task, resume the same session, send a second message.
5. **Release** - merge the branch, delete the session and its worktree.

---

## 2. Fixture

Create the fixture outside any real repository.

```sh
EXP=$(mktemp -d)/trigger-exp
mkdir -p "$EXP" && cd "$EXP"
git init -q -b main
git config user.email "exp@example.com"
git config user.name "Trigger Experiment"
echo "# Trigger experiment fixture" > README.md
mkdir -p .claude/skills/apm.echo .apm/bus/w1
```

Write the skill the session will run. The skill name contains a dot on purpose - dotted skill
names resolve.

```sh
cat > .claude/skills/apm.echo/SKILL.md <<'SKILL'
---
name: apm.echo
description: Minimal work-cycle stand-in. Reads a task file from the message bus, does an observable piece of work on a task branch, writes a report, and messages the sender back.
---

# apm.echo

You are a worker session. The argument is a bus slug (for example `w1`).

Do all of the following, in order, without asking for confirmation:

1. Print your current working directory and `git rev-parse --show-toplevel`.
2. Read `.apm/bus/<slug>/task.md`. Print its full contents.
3. Print `readlink .apm` so it is visible whether `.apm` resolved through a symlink.
4. Create the branch named in the task file, from the base named in the task file.
5. Do the observable work the task file asks for, and commit it on that branch.
6. Write `.apm/bus/<slug>/report.md` describing what you did.
7. Send a message back to the session that triggered you (copy the `from` attribute of
   the message that woke you) with exactly this text:
   `APM: report available at .apm/bus/<slug>/report.md`

End your turn after the message is sent.
SKILL
```

Place a canary in local project memory at the checkout root, and the first task on the bus.

```sh
cat > CLAUDE.local.md <<'LOCAL'
LOCAL_MEMORY_CANARY_7Q4X: this line lives in CLAUDE.local.md at the root of the main checkout.
If you can read this, local project memory reached the session.
LOCAL

cat > .apm/bus/w1/task.md <<'TASK'
---
agent: w1
branch: task/echo-one
base: main
---

# Task: first echo

Create a file `artifact-one.txt` at the repo root whose single line is `echo one`.
Commit it on branch `task/echo-one` with the message `feat: add first echo artifact`.
Then write the report and message the sender back.
TASK

: > .apm/bus/w1/report.md
```

Keep the bus and local memory out of version control. **Write the ignore pattern without a
trailing slash** - see §6.2 for why `.apm/` breaks cleanup.

```sh
printf '.apm\nCLAUDE.local.md\n' > .gitignore
git add -A && git commit -qm "chore: initial fixture"
```

Confirm only the skill, the ignore file and the README are tracked:

```sh
git ls-files
# .claude/skills/apm.echo/SKILL.md
# .gitignore
# README.md
```

---

## 3. Dispatch

Launch the session. Separate initiation from the trigger: the launch prompt must establish the
protocol and stop, so that any work observed afterwards is attributable to the message alone.

```sh
claude --bg --name w1-1.6 --worktree w1-1.6 "You are an APM worker session bound to bus slug w1. Do NOT start any work now. Protocol for the rest of this conversation: whenever you receive a message of the form 'APM: task available at <path>', read that file and immediately run the /apm.echo skill with the argument w1, following that skill in full. Right now do nothing except reply with the single word READY and end your turn."
```

Expected output, in about 4 seconds:

```
backgrounded · 8ca4fa63 · w1-1.6
```

Record two things, because they are different identifiers and are not interchangeable:

- The **short background id** (`8ca4fa63`) - what `attach`, `logs`, `stop` and `rm` take.
- The **full session id** - what `--resume` needs to continue the same session. Read it with:

```sh
claude agents --json | jq -r '.[] | select(.name=="w1-1.6") | .sessionId'
```

`claude agents --json` works without a TTY and is the only scriptable way to read session state.
`claude agents --json --all` also lists sessions that have exited.

The worktree is created at `<checkout>/.claude/worktrees/<name>`, on a new branch named
`worktree-<name>`, and is left `locked`:

```sh
git worktree list
# .../trigger-exp                            d8fe9ff [main]
# .../trigger-exp/.claude/worktrees/w1-1.6   d8fe9ff [worktree-w1-1.6] locked
```

Link the bus into the worktree, using an absolute path:

```sh
ln -s "$EXP/.apm" "$EXP/.claude/worktrees/w1-1.6/.apm"
```

Verify the session is listed by another session before triggering it. From a different Claude
Code session, list agents: the row `w1-1.6` must be present and idle.

---

## 4. Trigger

Send exactly the fixed text, and nothing else, from another session:

```
APM: task available at .apm/bus/w1/task.md
```

Expected within about 45 seconds: the session reads the task file, runs the skill, creates
`task/echo-one`, commits `artifact-one.txt`, writes `.apm/bus/w1/report.md`, and sends back

```
APM: report available at .apm/bus/w1/report.md
```

The reply arrives from a socket address such as `uds:/tmp/cc-socks/5309.sock` carrying
`from-name="w1-1.6"`. The socket path is tied to the process and changes when the session is
resumed. **Address sessions by name, never by a cached socket path or by the short id.**

Verify:

```sh
cat "$EXP/.apm/bus/w1/report.md"
git -C "$EXP" log --oneline task/echo-one
```

The report must show `readlink .apm` resolving to the main checkout's `.apm`, proving the
worktree reached the bus through the symlink.

---

## 5. Stop and resume

```sh
claude stop 8ca4fa63
# stopped 8ca4fa63
#   worktree retained at .../.claude/worktrees/w1-1.6
```

Stopping takes about 1 second. The stopped session disappears from `claude agents --json` and
appears only under `--all`, with `state=stopped`.

Write a follow-up task that probes context retention without naming the artifact:

```sh
cat > "$EXP/.apm/bus/w1/task.md" <<'TASK'
---
agent: w1
branch: task/echo-one
base: main
revision: 2
---

# Correction to the previous task

Do NOT re-read your earlier report to answer this. Answer from memory.

1. State the exact commit sha you created for the previous task, and the exact
   single line of content you put in the file you created. Name that file.
2. Change that same file's content to `echo two`, on the same branch, and commit
   it with the message `fix: correct echo artifact content`.
3. Rewrite the report to cover both commits.
TASK

: > "$EXP/.apm/bus/w1/report.md"
```

Resume with the **full session id**:

```sh
claude --resume 8ca4fa63-975f-4a49-8431-2a9e4a6f1c09 --bg
# note: woke session 8ca4fa63 with its saved options (--name).
# backgrounded · 8ca4fa63 · w1-1.6 (idle — send a prompt to start)
```

Passing the short id instead forks the conversation into a new session and says so:

```sh
claude --resume 8ca4fa63 --bg
# note: started a copy of that conversation as fa14594c. To continue a session under
# its own id, pass its full session id (lowercase, as `claude agents --json` prints it).
```

The copy also loses the worktree binding - its `cwd` is the directory the command ran in, not
the worktree. Delete an accidental copy with `claude rm <copy-id>`.

Send the same fixed text a second time. The session must answer the recall probe from memory
before touching git, then make the second commit. Expected elapsed time is about 50 seconds.

---

## 6. Merge and release

Merge from the main checkout while the worktree is still checked out on the branch:

```sh
cd "$EXP"
git merge --no-ff -m "merge: echo artifact from w1-1.6" task/echo-one
```

### 6.1 What `claude rm` requires

`claude rm` deletes the session and its worktree only when **both** hold:

- the worktree is clean - no modified and no untracked files;
- every commit on its branch is present on a remote.

A local merge does not satisfy the second condition. With both satisfied, deletion takes about
1 second:

```sh
claude rm 27423fb8
# removed 27423fb8
#   worktree: .../.claude/worktrees/w1-1.7
```

### 6.2 The ignore pattern that breaks cleanup

In the main checkout `.apm` is a directory, so the pattern `.apm/` ignores it. In the worktree
`.apm` is a **symlink**, which git treats as a file, so `.apm/` does not match it. The symlink
shows as untracked and `claude rm` refuses:

```
kept 8ca4fa63 — worktree has uncommitted changes
```

Write the pattern as `.apm`, without the trailing slash, so it covers both the directory and the
symlink. The fixture in §2 already uses the correct pattern; to reproduce the failure, write
`.apm/` instead and re-run from §3.

### 6.3 Deleting without a remote

When the commits are not on a remote, `claude rm` refuses and prints the exact escape hatch:

```
kept 8ca4fa63 — 5 unpushed commits on task/echo-one (6b86090 fix: ..., … and 4 more)
  push them, or discard the worktree and its commits:
  claude rm 8ca4fa63 --discard-unpushed <full-sha>@<worktree-id>
```

Run that command verbatim. It removes the session and the worktree and leaves an already-merged
`main` untouched. Only use it after the branch is merged - it discards the worktree's commits.

### 6.4 Residue

`claude rm` never deletes branch refs. Both the task branch and the auto-created
`worktree-<name>` branch survive and must be deleted separately:

```sh
git branch -D task/echo-one worktree-w1-1.6
```

Confirm nothing is left running:

```sh
claude agents --json --all | jq -r '.[] | select(.cwd|test("trigger-exp")) | .id'
```

Delete the fixture directory to finish.

---

## 7. Results

| Question | Answer |
|---|---|
| A session launched with `--bg --name --worktree` is listed by another session | Yes |
| A fixed-text message makes it read a file and run a skill | Yes |
| It can message back | Yes |
| `claude attach` works on it | Yes, interactive only - see §8 |
| `claude stop` works | Yes, about 1 second |
| `claude --resume <id> --bg` works | Yes, with the full session id only |
| It sees `CLAUDE.local.md` from the checkout root | Yes, but by parent-directory walk - see §8 |
| It resolves `.apm` through the symlink | Yes |
| It branches from the base and commits inside the worktree | Yes |
| A second trigger after resume runs with prior context intact | Yes |
| `claude rm` deletes the session and the worktree | Only under the conditions in §6.1 |
| `--name` and `--worktree` accept a dot | Yes, in the name, the directory and the branch |

Timings, single run: launch 4s, first trigger to completed cycle 44s, stop 1s, resume 1s,
second trigger to completed cycle 51s, delete 1s.

---

## 8. Findings that contradict the documented behaviour

**Local memory reaches the worktree by parent-directory walk, not by checkout resolution.**
The canary is found because `claude --worktree` always places the worktree at
`<checkout>/.claude/worktrees/<name>`, which is below the checkout root. A worktree created
outside the checkout sees nothing. Verify with:

```sh
git worktree add -q -b probe/outside /tmp/outside-wt main
cd /tmp/outside-wt
claude -p "Is the token LOCAL_MEMORY_CANARY_7Q4X present anywhere in your context or project memory? Answer YES or NO."
# NO
```

The behaviour is reliable only while worktrees stay inside the checkout. Do not place them
elsewhere and expect project memory to follow.

**`/context` cannot be run by the session itself.** It is a client UI command, not a skill, and
there is no Bash equivalent. To inspect what memory reached a session, ask it which project
memory files were injected at session start.

**`claude attach` is interactive only.** With stdin redirected it prints `Attaching…` and exits.
It is a human debugging tool and has no place in an automated cycle. `claude logs <id>` is the
scriptable alternative, but it emits raw terminal escape sequences, so strip them:

```sh
claude logs 8ca4fa63 | sed -e 's/\x1b\[[0-9;]*[a-zA-Z]//g'
```

**The auto mode classifier blocks `claude` invocations carrying `--permission-mode`.** A plain
`claude -p ...` runs; adding `--permission-mode dontAsk` is denied by the classifier in the
calling session. Launch background sessions without permission overrides, or grant an explicit
Bash permission rule.

**Background sessions inherit the launching environment's settings**, including auto mode and
MCP server configuration. A launched session reported five MCP servers awaiting authentication.
Nothing in the cycle above required a permission grant beyond that.

---

## 9. Conclusion

The message trigger works. Every step of the cycle is viable as described, with three
corrections: resume requires the full session id, the ignore pattern must be `.apm` without a
trailing slash, and deletion requires either a pushed branch or `--discard-unpushed`.

The `Stop`-hook fallback is not needed. Keep it unimplemented.

---

**End of Document**
