# APM Coordinator Hooks

## 1. Overview

**Reading Agent:** Manager

This reference explains where the coordinator's two hooks are declared, what each one guards, and what neither of them guarantees. You do not declare them: installation does. Read this to know what is already armed and what remains yours regardless.

The file name says `frontmatter` for historical reasons. Frontmatter is not where these hooks live - see §3 Why Not Frontmatter.

---

## 2. Where the Declaration Lives

Installation merges the declarations into the project's `.claude/settings.json`, and removal takes them back out. The merge is additive: your own hooks on the same events survive, and nothing outside APM's own entries is touched.

Two hooks are installed:

`apm-dispatch-gate.sh` runs on `PreToolUse`, matching `Write|Edit`. It blocks a write to `.apm/bus/<agent>/task.md` while a checklist under `.apm/checklists/` has an unchecked box, or while an open item in the Tracker's Deferred table names the Task being dispatched as blocked. It exits 2 to block, and the stderr text naming the item becomes the reason you are given. Writing any other file never blocks. The gate acts on the shared Task Bus, which is why the prompt is written there first: the terminal copy into a Worker's mailbox afterwards is not a write the gate sees, and does not need to be.

`apm-precompact.sh` runs on `PreCompact`. It leaves a reminder to run the recovery skill once the context window has been compacted. It never blocks: compaction proceeds either way.

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

The conditions it enforces - no dispatch over an unchecked checklist, no dispatch of a Task an open deferred item blocks - are yours to honour whether or not a hook is watching. Treat a passing write as the absence of a block, not as confirmation that the conditions hold.

Confirm the gate is live in the session type you actually run rather than assuming the declaration took effect: dispatch once with a box deliberately left unchecked and confirm the write is refused.

---

**End of Reference**
