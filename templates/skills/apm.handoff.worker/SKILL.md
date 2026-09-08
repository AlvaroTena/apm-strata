---
name: apm.handoff.worker
description: Hands a Worker identity to a new instance as the context window fills.
disable-model-invocation: true
argument-hint: "(no arguments)"
---

# APM {VERSION} - Worker Handoff Skill

## 1. Overview

This skill covers one case: a single Task that outlasts the context of the session executing it. Work does not normally move between sessions this way - each Task is dispatched to a fresh session of its own, so a Worker never needs relieving between Tasks. Reach for this only when the Task in front of you cannot be finished honestly in the context you have left.

You produce two artifacts:
- **Handoff Log:** what this session did, tried, and observed, stored in `.apm/memory/handoffs/<agent>/`.
- **Continuation block:** a delimited note at the top of the domain notes, telling the replacement session where the work stopped.

The replacement rebuilds from the Handoff Log and the Task Prompt, which is still on the Task Bus. It does not rebuild from the Handoff Log alone.

---

## 2. Handoff Procedure

Execute when you judge your remaining context insufficient to finish the Task, or when the User initiates it.

### 2.1 Securing the Work

Perform the following actions:
1. Commit everything you have on the Task branch, following the commit conventions from `{RULES_FILE}`. Uncommitted work does not survive this session.
2. Note the branch name and the commit you left it at. The replacement continues from that commit, so it has to be written down.

### 2.2 Handoff Log Creation

Perform the following actions:
1. Determine this session's sequence number for the Worker: one higher than the highest existing Handoff Log in `.apm/memory/handoffs/<agent>/`, or 1 when none exists.
2. Create the Handoff Log per §3 Handoff Log Structure, capturing **past actions** - what was done, tried, and observed. Content is strictly past tense; where the work stands now belongs in the continuation block.
   - Which parts of the Task are complete, and which are not.
   - Approaches tried and rejected, and why - this is what stops the replacement repeating them.
   - Technical notes not captured elsewhere.
   - If auto-compaction occurred during this session, note it and say which parts of your account are reconstructed rather than first-hand.

### 2.3 Continuation Block Creation

Perform the following actions:
1. Write the continuation block at the top of `.apm/bus/<agent-slug>/handoff.md` per `{GUIDE_PATH:task-logging}` §4.3 Domain Notes Format, leaving the existing domain notes below it untouched.
2. Include: the Task the continuation is for, the Handoff Log path, the Task branch and the commit it was left at, and what the replacement should do first.
3. Update the domain notes themselves with anything this session learned that outlives the Task, per `{GUIDE_PATH:task-execution}` §2.6 Domain Continuity Standards. The continuation block is consumed and deleted by the replacement; the notes are not.

### 2.4 Reporting the Handoff

Perform the following actions:
1. Write a Task Report to the Report Bus with `Partial` status, stating that the Task is unfinished, that a continuation is pending, and where the Handoff Log is. The coordinator launches the replacement session - you cannot.
2. Send the fixed trigger text back per `{SKILL_PATH:apm-communication}` §4.4 Trigger Messages.
3. Stop. This session's duties are complete.

---

## 3. Handoff Log Structure

Contains what this session accumulated while working the Task. The Task Log records the Task's outcome; this file records the attempt.

**Location:** `.apm/memory/handoffs/<agent>/handoff-<NN>.log.md`

**YAML Frontmatter Schema:**
```yaml
---
agent: <agent-slug>
handoff: <N>
stage: <N>
task: <M>
branch: <branch-name>
commit: <sha>
---
```

**Field Descriptions:**
- `agent`: Worker identifier (kebab-case).
- `handoff`: Sequence number for this Worker's handoffs.
- `stage`: Stage number of the Task being handed over.
- `task`: Task number within the Stage.
- `branch`: The Task branch the work was committed on.
- `commit`: The commit the branch was left at.

**Body:**
- *Title:* `# <Display Name> Handoff <N> - Task <N>.<M>`. Each section uses `##` heading. The display name is the Title Case form of the agent identifier (e.g., `frontend-agent` → `Frontend Agent`).
- *Progress:* What of the Task is done and what is not, concretely enough to resume against.
- *Approaches Tried:* What was attempted and rejected, and why.
- *Working Notes:* Technical details and environment observations not captured elsewhere.

---

**End of Skill**
