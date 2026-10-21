# APM Coordinator Hooks

## 1. Overview

**Reading Agent:** Manager

This reference explains where the coordinator's two hooks are declared, what each one guards, and what neither of them guarantees. You do not declare them: installation does. Read this to know what is already armed and what remains yours regardless.

The file name says `frontmatter` for historical reasons. Frontmatter is not where these hooks live - see §3 Why Not Frontmatter.

---

## 2. Where the Declaration Lives

Installation merges the declarations into the project's `.claude/settings.json`, and removal takes them back out. The merge is additive: your own hooks on the same events survive, and nothing outside APM's own entries is touched.

Two hooks are installed:

`apm-dispatch-gate.sh` runs on `PreToolUse`, matching `Write|Edit|Bash`. It blocks a write to `.apm/bus/<agent>/task.md` while a checklist under `.apm/checklists/` has an unchecked box, while an open item in the Tracker's Deferred table names the Task being dispatched as blocked, or while the Task Prompt lacks a valid `## Spec Deltas` decision. That decision is the first non-empty line under the heading, and it is either `none - <reason>` or a `.apm/openspec/<change>/changes` path that exists as a directory, optionally in backticks. For an `Edit`, the gate reads the prompt as the edit would leave it, so an edit that removes the decision is blocked and one elsewhere in a valid prompt is not. A write that empties the Task Bus is not held to the decision. It exits 2 to block, and the stderr text naming the item becomes the reason you are given. Writing any other file never blocks. A `Bash` command that writes the Task Bus is blocked outright, because a shell command carries no content the gate could check: write the Task Bus with the `Write` or `Edit` tool. The match is on the command text and recognises redirects, `tee`, `cp`, `mv`, `install`, `sed -i`, `perl -i`, `truncate`, `dd of=` and any interpreter command that names the file; reading the file from the shell passes, and so does any command that does not name it. Two shell commands on the Task Bus are let through because the Task cycle needs them: `truncate -s 0` (or `--size=0`), which empties it, and `cp` or `install` whose source is itself a Task Bus file, which copies a checked prompt into a worktree mailbox or reflects an emptied mailbox back. Any other size, any other source and `mv` still block, as does an empty redirect, and a compound command that also carries a blocked write is blocked. Relative paths - checklists, the Tracker and a Spec Deltas path - resolve against the project root, not against the shell's current directory. The gate acts on the shared Task Bus, which is why the prompt is written there first: the terminal copy into a Worker's mailbox afterwards is not a write the gate sees, and does not need to be.

`apm-after-compact.sh` runs on `SessionStart`, matching `compact`. After the context window is compacted it adds a notice to your context, but only when the session ran a role skill, which it reads from the session transcript. The notice states that the recovery procedure is in the recovery skill's file, read as a file because the model cannot invoke that skill, and that the coordinator rereads the assignment step and writes a Task Bus only with the `Write` or `Edit` tool. It never blocks.

The scripts are installed under `.claude/apm-hooks/` and invoked through `sh` with the project directory resolved from the environment, so they run whatever the working directory happens to be when a hook fires, and they do not depend on a mode bit surviving installation.

**Do not add a `hooks` block to the coordinator skill's frontmatter.** Two declarations of the same hook mean the gate runs twice on every write, and the second block is the one nobody remembers when the gate misbehaves.

---

## 3. Why Not Frontmatter

A skill can declare hooks in its own frontmatter, and that was the original design here. It was dropped for a reason worth keeping in view, because it is the same reason the gate is not a guarantee even now.

A frontmatter-declared hook registers when the skill is invoked, and the registration lives in the process. It holds for the rest of that session, including turns after the skill's own turn - but it does not outlive the process. A session resumed into a new process starts with no hook registered, and none is registered until something invokes the skill again. That is precisely the moment when least is likely to reinvoke it: the coordinator resumes, reads its state, and dispatches. The gate would be off for the rest of that session and nothing would say so.

A declaration in the settings file has no such window. It is read at startup, so a resumed process arms the gate the same way a fresh one does.

One further observation from testing the frontmatter route: a skill-declared hook did not register in a non-interactive session, while the same hook declared in the settings file registered and fired there. The settings route is the one that behaves the same way everywhere.

---

## 4. What the Gate Does Not Own

The gate shortens a feedback loop. It does not own the rule.

The conditions it enforces - no dispatch over an unchecked checklist, no dispatch of a Task an open deferred item blocks, no dispatch without a spec deltas decision - are yours to honour whether or not a hook is watching, and so is writing the Task Bus with the `Write` or `Edit` tool. Treat a passing write as the absence of a block, not as confirmation that the conditions hold.

Confirm the gate is live in the session type you actually run rather than assuming the declaration took effect: dispatch once with a box deliberately left unchecked and confirm the write is refused.

---

**End of Reference**
