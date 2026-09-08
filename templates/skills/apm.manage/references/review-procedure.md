# APM Review Procedure

## 1. Overview

**Reading Agent:** Manager

This reference defines how to review a completed deliverable with review lenses: how to prepare the material, which lenses apply, how to run them, and how to triage what they return.

Reviewing by reading the deliverable yourself and holding it against its sources exhausts your context and inherits your own blind spots - you already believe the plan the deliverable was built from. The review works because of the architecture around the reviewers, not because of any single reviewer prompt. The material is staged to file once and the lenses receive paths rather than text. Each lens is a subagent with no prior context, no skills, and no subagents of its own. The lenses run at the same time and never see each other. And the lenses do not grade: they report, and you judge.

---

## 2. Material Preparation

Stage the review material in `.apm/review/<stage>-<task>/`, with both numbers zero-padded - the review of Task 2.5 is staged in `.apm/review/02-05/`.

| File | Content | When |
| ---- | ------- | ---- |
| `artifact.md` or `artifact.diff` | The deliverable under review. | Always. |
| `claims.md` | The Task Log for this Task, copied verbatim. | When a Task Log exists. |
| `acceptance.md` | The criteria the deliverable was built to satisfy, copied from the Task's validation criteria and from the Spec content the Task Prompt carried. | When criteria exist. |
| `context.md` | The paths a lens may read beyond the artifact - the repository root, the source files the deliverable adapts - and the justification table when the Task produced one. | Always. |

Write the deliverable to `artifact.diff` when it is a change to existing files, and to `artifact.md` when it is new content or a document. For a branch, the diff is against the merge base with its base branch; for uncommitted work, include untracked files.

Stage the material once, before launching anything. A launch prompt carries the paths of these files and never their contents - the lens opens what it needs. Stage `claims.md` separately from the artifact for the same reason it exists at all: it is input for one lens, and every other lens must never see it.

---

## 3. Lens Selection

| Lens | Runs when | Receives |
| ---- | --------- | -------- |
| `apm-lens-adversarial` | Always. | `artifact` |
| `apm-lens-edge-case` | The artifact has behavior to trace - code, diffs, and the specifications, plans, and requirements that define behavior. | `artifact`, and `claims` marked as unread until its own instructions call for it |
| `apm-lens-verification-gap` | The artifact is code in a repository whose tests can be searched and read. | `artifact`, repository path |
| `apm-lens-acceptance` | `acceptance.md` was staged. | `artifact`, `acceptance` |
| `apm-lens-editorial` | The deliverable is a document. | `artifact` |

External lenses declared in the project rules run alongside these. See `external-lenses.md` alongside this reference.

---

## 4. Execution

Perform the following actions:
1. Determine which lenses apply per §3 Lens Selection and state the selection in one line before launching anything.
2. Launch every applicable lens in the same turn, as blocking calls awaited together. Lenses run at the same time and none receives another's findings - overlap between lenses is signal, not duplication.
3. Give each lens the absolute paths of the files it receives. Give the `claims` path to the edge-case lens alone, marked as not to be read until its own instructions call for it.
4. Carry these constraints in every launch prompt: return only findings, invoke no skill, spawn no subagents, and assign no severity, priority, confidence, or rank.
5. When a lens fails, times out, or returns nothing, record which one and continue with the rest. Report the failure before the results - a review that lost a lens is not a clean review.

---

## 5. Triage

Triage is yours alone. Execute it in this order.

### 5.1 Discard the Grades

Discard any severity, priority, confidence, or rank a lens attached to a finding. Lenses grade without the context that makes a grade meaningful - what the project is for, what the User accepts, what the rest of the system already guards. Their grades are noise, and reading them before your own verification anchors you to them.

### 5.2 Verify Each Finding

At the location the finding cites, determine whether the bad outcome it describes actually occurs. Read beyond the cited lines - follow the callers, check the guards upstream, read the file the claim depends on - until you can answer. A true statement about neighboring code does not settle a finding about this one. Judge whether the problem is real, not whether the proposed correction is plausible: content that fails loudly on a situation nobody showed to be reachable is behaving correctly.

Then render exactly one verdict per finding. The verdict is the whole decision; there is no separate keep-or-drop step.

| Verdict | Meaning |
| ------- | ------- |
| `high` | The bad outcome is real and intolerable. |
| `medium` | The bad outcome is real and tolerable. |
| `low` | The bad outcome is real, cosmetic or negligible. |
| `false` | You checked, and the bad outcome does not happen at the cited location. Record what disproves this specific claim. |
| `maybe-false` | You could not determine whether the bad outcome happens. Record what you would need to check. Use this only when the material genuinely leaves the question open. |

Grade by how much the problem hurts the people who use the deliverable or the people who maintain it. For a maintenance problem, name where it will cause trouble - which caller will diverge, which rule will break. An unnamed complaint that something is messy is not a grade; it is `false` or `maybe-false`. When the harm is real and you cannot tell how bad, take the higher grade.

Every finding keeps its verdict and a sentence of evidence. Never drop, merge, or silently skip one.

### 5.3 Group by Root Cause

Group the surviving findings by shared root cause. Two findings belong together only when the same defect produced both. **The same location is not a shared root cause**, and neither is a shared correction - two lenses landing on the same line often found two different problems. A group carries every member's verified outcome and the highest verdict among them.

### 5.4 Route Each Group

Route each group into exactly one bucket. A group with any verified `high`, `medium`, or `low` member routes by its highest such verdict, not to `defer` because another member is `maybe-false`.

| Bucket | What follows |
| ------ | ------------ |
| `accept` | Nothing. The Task proceeds on its course. |
| `follow-up` | A correction assignment is issued to the Worker, carrying the group's findings. |
| `plan` | The finding cascades over the planning documents. Decide this with the User. |
| `defer` | The finding is outside the current objective and enters the long-horizon backlog, citing the finding `id`. |

### 5.5 Record the Triage

Write the triage to `triage.md` in the staged directory. Each finding is one row.

| Field | Content |
| ----- | ------- |
| `id` | Stable identifier for the finding, unique within this review. The backlog item cites it when the bucket is `defer`. |
| `lens` | The lens that produced the finding. |
| `verdict` | One of `high`, `medium`, `low`, `false`, `maybe-false`. |
| `evidence` | What your verification established, in a sentence or two. |
| `bucket` | One of `accept`, `follow-up`, `plan`, `defer`. |

Neither `id` nor `lens` is decorative. Without `lens` the set cannot be split by its producer, and the overlap between lenses from different providers - which this project measures - cannot be computed. Without `id` a deferred finding cannot be cited by the backlog item that carries it forward.

---

## 6. Fallback Without Subagents

When subagents are unavailable, the lenses still run - elsewhere, by hand.

Perform the following actions:
1. Write one prompt per applicable lens to `.apm/review/<stage>-<task>/prompts/`, named for the lens.
2. Make each prompt self-contained: embed the contents of the files that lens receives, not their paths. The session that runs it may not share this file system.
3. Stop and ask the User to run each prompt in a separate session, ideally with a different provider, and to paste the findings back.
4. When the findings arrive, treat them as that lens's findings and resume from §5 Triage.

---

**End of Reference**
