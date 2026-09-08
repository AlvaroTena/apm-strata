# APM Templates Development Notes

This document holds development notes, research findings, and implementation considerations for the APM templates - material that informs future decisions without belonging to any of the other standards. It is a development-time document: agents never read it, and the build does not emit it.

Notes here are provisional by nature. A note that becomes a decision moves into the standard that governs it and leaves this file; a note describing a direction the fork has rejected is deleted rather than kept as history, because a rejected direction left on the page reads like a plan.

---

## Placeholders Do Not Work Here

`_standards/` is one of the directories the build skips, alongside `apm/`. Nothing in this directory is ever emitted into a bundle, so no placeholder in it is ever substituted. A `{PLACEHOLDER}` written in any standard stays literal for every reader.

The consequence to watch is a note proposing a placeholder that no substituter implements. It costs nothing while it sits here, and it costs a bundle with a raw marker in it the moment someone copies the line into a real template believing the placeholder resolves. Write invocations in the standards with literal names, and when a note needs to discuss a placeholder that does not exist yet, say in the same sentence that it does not.

---

## Open Questions

Nothing currently open.

---

**End of Development Notes**
