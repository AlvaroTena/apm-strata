# APM Coordinator Hooks Frontmatter

## 1. Overview

**Reading Agent:** Manager

This reference holds the `hooks` frontmatter block that registers the coordinator's two hooks, ready to paste into the coordinator skill's frontmatter. It is a fragment, not a live declaration: nothing registers until the block sits in the skill's own frontmatter.

---

## 2. The Block

```yaml
hooks: |
  PreToolUse:
    - matcher: Write|Edit
      command: {HOOK_PATH:apm-dispatch-gate}
  PreCompact:
    - command: {HOOK_PATH:apm-precompact}
```

`{HOOK_PATH:apm-dispatch-gate}` guards dispatch. It blocks a write to `.apm/bus/<agent>/task.md` while a checklist under `.apm/checklists/` has an unchecked box, or while an open item in the Tracker's Deferred table names the Task being dispatched as blocked. It exits 2 to block, and the stderr text naming the item becomes the reason. Writing any other file never blocks.

`{HOOK_PATH:apm-precompact}` leaves a reminder to run the recovery skill after the context window is compacted. It never blocks: compaction proceeds either way.

The field name must be exactly `hooks`. An unrecognized frontmatter field is discarded in complete silence - no warning, no error, exit code 0 - so a misspelling produces a skill that loads normally and registers nothing.

---

## 3. The Registration Lives in the Process

Registration happens when the skill is invoked, and it holds for the rest of that session. It does not outlive the process. A session resumed into a new process starts with no hook registered, and none is registered until something invokes the skill again.

Do not treat the dispatch gate as a standing guarantee. After a resume, the gate is off until the coordinator skill runs again, and a dispatch made in that window passes unchecked. The conditions the gate enforces are the coordinator's responsibility regardless of whether the gate is armed - the hook shortens the feedback loop, it does not own the rule.

Confirm the registration in the session type you actually run. A skill-declared hook did not register in a non-interactive session, while the same hook declared in the settings file registered and fired there, so this block is not a guarantee on every session type. Verify by triggering the gate once - dispatch with a box deliberately left unchecked and confirm the write is refused - rather than by assuming the declaration took effect.

---

**End of Reference**
