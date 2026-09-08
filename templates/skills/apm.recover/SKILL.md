---
name: apm.recover
description: Rebuilds a Manager's or Worker's working context after it is lost.
disable-model-invocation: true
argument-hint: "[manager | agent-id]"
disallowed-tools: Write, Edit, Agent
---

# APM {VERSION} - Recover Skill

This skill reconstructs working context after platform auto-compaction, manual compaction, or when an initiated agent must resume after a cleared or lost conversation. It applies to the Manager and Workers only. If you are a Planner or non-APM agent, concisely decline and take no action. Accepts an optional `[role]` argument: `manager` or a Worker agent identifier (e.g., `frontend-agent`).

The skill argument - if provided - will be listed here: `{ARGS}`. If empty, then no argument was provided.

**Procedure:**
1. Determine role: from the skill argument if provided (`manager` for the Manager, any other value for a Worker). If no argument, infer from conversation context (compaction summary or the initiation just performed). If conversation context does not reveal your role, ask the User.
2. Re-read your initiation skill and read every document it references - every guide, skill, and project artifact listed in its loading sequence:
   - Manager: `{SKILL_PATH:apm.manage}`
   - Worker: `{SKILL_PATH:apm.work}`
   Reading the initiation skill alone is not sufficient - the documents it references contain the procedural knowledge and project state needed for recovery. Skip identity determination and greeting.
3. Explore project state from the artifacts listed in your initiation skill and the current state of the codebase to reconstruct where work stands. When gaps remain that artifacts cannot fill, ask the User for brief context before continuing.
4. Note the recovery event: if you are the Manager, add a working note to the Tracker; if you are a Worker, include it in the next Task Report. Recovery does not increment the instance number - you continue as the same instance. When eventually performing Handoff, note which portions of working context are reconstructed rather than first-hand.
5. Continue with duties.

---

**End of Skill**
