---
name: apm.review
description: Delivers pending Task Reports to the Manager.
disable-model-invocation: true
argument-hint: "[agent-id ...]"
---

# APM {VERSION} - Manager Check Reports Skill

Read pending Task Reports from the Report Bus(es) and process them.

**This is a fallback, not the normal path.** Normally a Worker session sends back a trigger naming its Report Bus and that starts the review. Because the bus holds the report and the trigger only points at it, a lost trigger loses nothing: the report is still there and this retrieves it. It also catches a report from a session that ended without triggering.

If you are a Planner, Worker, or non-APM agent, concisely decline and take no action.

Accepts optional `[agent-id ...]` arguments. With arguments, checks those Workers' Report Buses. Without arguments, checks Workers with active dispatches plus a health check for unexpected content.

**Procedure:**
1. Collect before reading. A Worker writes its report into the mailbox inside its own worktree, so a report that was never collected is invisible on the shared bus. Scan the mailboxes in a single terminal invocation, e.g., `for f in .claude/worktrees/*/.apm/bus/*/report.md; do [ -s "$f" ] && echo "=== $f ===" && cat "$f"; done` (or platform equivalent), limited to the sessions `{ARGS}` names when it is provided - resolve each agent-id per `{SKILL_PATH:apm-communication}` §4.2 Agent ID Resolution. For each non-empty mailbox report, stop its session and collect its mailbox per `{GUIDE_PATH:task-review}` §3.1 Report Processing, which puts the report at `.apm/review/<stage>-<task>/report.md`.

2. Scan the shared Report Buses: read them in a single terminal invocation, e.g., `for f in .apm/bus/*/report.md; do [ -s "$f" ] && echo "=== $f ===" && cat "$f"; done` (or platform equivalent), or only the targeted ones when `{ARGS}` is provided. Worker reports never land here - they were collected to their per-Task paths in step 1 - so this catches reports from non-APM agents, which write to the shared bus directly, and includes path markers for cross-referencing. If any unexpected bus has content (beyond the actively dispatched Workers), include it and inform the User. If no buses have content, inform User that no pending reports are available. Await next invocation. If one or more have content, continue to step 3 for each.

3. Process report(s): for each report collected in step 1, read it from its per-Task path and process it per `{GUIDE_PATH:task-review}` §3 Task Review Procedure, skipping the stop and collection steps already done. Process each non-APM report found in step 2 the same way, from the shared bus.

---

**End of Skill**
