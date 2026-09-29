# Spec deltas

A delta is a change proposal written against a specification: it states what a change
adds, modifies and removes, and it is checked against the spec it changes before anyone
acts on it. The point is that a change to a requirement is reviewable on its own, without
diffing two versions of a long document and hoping the reader spots what moved.

The format is adapted from OpenSpec. The validator is this repository's own, and the
reason is in the last rule below.

## Layout

Each change owns one directory under the project's APM directory, and that directory holds
both halves: the baseline the change is checked against and the delta itself. In a project
that installs this fork, a change on the branch `feat/recurring-slots` lives here:

```
.apm/openspec/
  feat-recurring-slots/            <- the change: its branch name, "/" replaced by "-"
    specs/
      scheduling/
        spec.md                    <- the baseline: what is true today
    changes/
      feat-recurring-slots/
        specs/
          scheduling/
            spec.md                <- the delta: what this change does to it
```

A delta at `<root>/changes/<change>/specs/<capability>/spec.md` is checked against the
baseline at `<root>/specs/<capability>/spec.md`. The root is derived from the path: the
validator takes the last `changes` segment and treats everything before it as the root,
so the tree can sit anywhere as long as the two halves mirror each other. Here the root is
the change's own directory, so no other change reads its baseline. A shared root is what
this layout replaces: with two sessions working at once, two changes to the same
capability overwrote each other's baseline. One change directory may carry deltas for
several capabilities, one subdirectory each.

**The baseline is written by whoever prepares the work, before the delta.** It describes
the current behaviour of what the change touches, read from the code on the base branch,
and it is limited to the requirements the delta's `MODIFIED` and `REMOVED` blocks name. It
is not a specification of the project. A delta with only `ADDED` blocks needs no baseline.
The person carrying out the change does not rewrite the baseline; a follow-up to the same
change keeps the baseline it started with.

When no baseline exists at the derived path, the delta is checked as if the baseline were
empty. That is the right behaviour for a capability being specified for the first time,
and it is worth knowing about, because a delta that modifies a requirement will then fail
on the matching key rather than pass silently.

**The directory goes when the change is merged.** Once the branch is merged, delete
`.apm/openspec/<change>/` whole. Do not fold the delta into the baseline and do not keep
the baseline for the next change: after the merge it describes code that no longer exists,
and the next change writes its own from the code it touches.

## Every assignment states its decision

In a project that installs this fork, every piece of work handed to a Worker carries a
section headed `## Spec Deltas`, and so does every correction sent back to one and every
assignment to an agent outside APM. The section always exists. Its first non-empty line
is one of two literal forms:

```
none - builds the export screen from scratch
```

```
.apm/openspec/feat-recurring-slots/changes
```

The first says the work creates something new and changes nothing that already exists,
and the reason after `none - ` names what it builds. The second is the `changes` directory
of the change, already validated, followed by the baseline's path and the delta itself.
Backticks around the path are allowed.

**When in doubt, write the delta.** Work that touches a file which already has behaviour -
code, a document, configuration - changes something existing, however small the edit.
`none` is a claim that nothing existing changes, not a default. The Worker who receives
`none` confirms it holds and reports it as a deviation when it does not, rather than
writing a delta of its own.

The section exists because the rule used to be a condition - "a change to existing work
carries a delta" - and a condition nothing checks stops being applied. It is now checked
at dispatch: the hook that guards the Task Bus refuses the write when the decision is
missing or malformed. That means a prompt with no `## Spec Deltas` heading, a heading with
nothing under it, `none` with no reason, a first line that is neither form, or a path to a
directory that does not exist. For an edit to the Task Bus it checks the prompt as the edit
would leave it. A refused write is reported like this:

```
APM dispatch gate: the write to .apm/bus/booking-agent/task.md is blocked.

Dispatch target: booking-agent -> Task 2.3

Spec Deltas decision missing or invalid: "none" carries no reason after "none - ".
  The first non-empty line under "## Spec Deltas" must be one of:
    none - <why this Task changes no specification>
    .apm/openspec/<change>/changes (an existing directory, backticks allowed)

Resolve what is named above, then dispatch again. Nothing else is gated: this hook only guards .apm/bus/<agent>/task.md.
```

The other refusals differ only in the line after `Spec Deltas decision missing or
invalid:`, which names the defect:

```
the Task Prompt has no "## Spec Deltas" heading.
"## Spec Deltas" has no line under it.
"see the plan" is neither "none - <reason>" nor a .apm/openspec/<change>/changes path.
.apm/openspec/feat-slot-overlap/changes does not exist as a directory.
```

The hook checks that the decision is there and well formed, and that the directory exists.
It does not validate the delta; that is what the command below is for, and it runs before
the prompt is written.

## Validating

```bash
apm delta validate .apm/openspec/feat-recurring-slots/changes
```

The argument is a delta document or any directory containing them; a directory is walked
and every `spec.md` under it is checked. The command reports per document and exits
non-zero if any document has a violation:

```
[SUCCESS] .apm/openspec/feat-recurring-slots/changes/feat-recurring-slots/specs/scheduling/spec.md: valid
[SUCCESS] 1 delta(s) valid.
```

```
[ERROR]   .apm/openspec/feat-recurring-slots/changes/feat-recurring-slots/specs/scheduling/spec.md: 1 violation(s)
[INFO]      line 16 [modified-completeness] MODIFIED "Slot Booking" omits scenario(s) the spec still has: "Overlapping slot". A MODIFIED requirement replaces the whole block, so an omitted scenario is deleted.
[ERROR]   Delta validation failed with 1 violation(s)
```

Every violation names the rule it broke and the line it broke it on, so the message is
actionable without opening the validator.

**Point it at the change's `changes` directory, never at the change directory itself.**
Because every `spec.md` below the argument is checked as a delta, a directory that
contains the baseline reads the baseline as a delta too. A baseline's requirements belong
to no operation group, so it fails even when the delta is valid:

```
[SUCCESS] .apm/openspec/feat-recurring-slots/changes/feat-recurring-slots/specs/scheduling/spec.md: valid
[ERROR]   .apm/openspec/feat-recurring-slots/specs/scheduling/spec.md: 2 violation(s)
[INFO]      line 5 [operation-group] Requirement "Slot Booking" sits outside an ADDED, MODIFIED or REMOVED group.
[INFO]      line 19 [operation-group] Requirement "Cancellation Window" sits outside an ADDED, MODIFIED or REMOVED group.
[ERROR]   Delta validation failed with 2 violation(s)
```

The same applies to `.apm/openspec/` as a whole, which holds every open change's baseline.

## Format

Requirements are grouped under an operation heading, one requirement per `###` heading,
and scenarios under it at `####`:

```markdown
# Scheduling delta

## ADDED Requirements

### Requirement: Recurring Slots

The system SHALL expand a recurring rule into individual slots at booking time.

#### Scenario: Weekly rule

- **WHEN** a weekly rule is booked
- **THEN** one slot per occurrence is created

## MODIFIED Requirements

### Requirement: Slot Booking

The system SHALL reject a booking whose start time is in the past.

#### Scenario: Past start time

- **WHEN** a booking starts before the current time
- **THEN** the request is rejected

#### Scenario: Overlapping slot

- **WHEN** a booking overlaps an existing one
- **THEN** the request is rejected

## REMOVED Requirements

### Requirement: Cancellation Window
```

The baseline that delta is checked against, and that the outputs on this page were produced
from, carries only the two requirements the delta modifies or removes:

```markdown
# Scheduling

## Requirements

### Requirement: Slot Booking

The system SHALL reject a booking whose start time is in the past.

#### Scenario: Past start time

- **WHEN** a booking starts before the current time
- **THEN** the request is rejected

#### Scenario: Overlapping slot

- **WHEN** a booking overlaps an existing one
- **THEN** the request is rejected

### Requirement: Cancellation Window

The system SHALL accept a cancellation up to one hour before the slot starts.

#### Scenario: Late cancellation

- **WHEN** a cancellation arrives less than one hour before the slot
- **THEN** the cancellation is rejected
```

The three operations are `ADDED`, `MODIFIED` and `REMOVED`, written as
`## <OPERATION> Requirements`. A requirement heading outside any of those groups is
reported as `operation-group`: an ungrouped requirement states no operation, so there is
nothing to check it against.

A `REMOVED` entry needs only the heading. Its body is not read, and the requirement it
names has to exist in the baseline.

## The four rules

**1. Matching key (`matching-key`).** A `MODIFIED` or `REMOVED` requirement must name a
requirement the baseline actually has. The requirement name is the matching key and it is
**case sensitive**. When the only difference is capitalisation the message says so
explicitly, because that is the failure people stare past:

```
line 16 [matching-key] MODIFIED "Slot booking" does not match the spec, which has "Slot Booking". The requirement name is the matching key and is case sensitive.
```

**2. Scenario depth (`scenario-depth`).** A scenario heading takes exactly four hashes.
Three makes it a requirement heading, five hides it from the parser; either way the
scenario stops being counted, which matters because rule 4 counts scenarios.

**3. Normative keyword (`normative-keyword`).** An `ADDED` or `MODIFIED` requirement must
contain `SHALL` or `MUST`. A requirement that states no obligation cannot be satisfied or
violated, so it cannot be tested and does not belong in a spec. `REMOVED` is exempt: its
body is not read.

**4. Modified completeness (`modified-completeness`).** **A `MODIFIED` block replaces the
whole requirement in the target spec.** It is not a patch, and nothing merges it with what
is already there. So the block has to be copied out in full, and **omitting a scenario the
baseline still has is an error**, not a shorthand for leaving it alone:

```
line 16 [modified-completeness] MODIFIED "Slot Booking" omits scenario(s) the spec still has: "Overlapping slot". A MODIFIED requirement replaces the whole block, so an omitted scenario is deleted.
```

### Why the fourth rule is the one that matters

The first three catch a delta that is malformed. The fourth catches a delta that is
well-formed and wrong, which is the dangerous kind.

Replacement semantics mean a `MODIFIED` block is the new requirement in full. Write it
from memory, forget the scenario you were not thinking about, and that scenario is gone
from the spec - not flagged, not conflicted, just quietly absent, and absent in the one
document the team treats as the record of what the system guarantees. The rule exists so
that dropping a guarantee has to be deliberate: to remove a scenario you delete it on
purpose, and the validator's silence means the omission was intended.

Rule 1 protects the same invariant from the other end. If the matching key does not
resolve, the change applies to no requirement at all - it validates, it reads correctly,
and it changes nothing. That is why the key is compared case sensitively and why a
near-miss is reported as a near-miss.

The two rules are also why this repository carries its own validator. The external one was
evaluated against a baseline and five deltas that differed by a single mutation each. It
detected all four seeded violations but only failed on three, and the one it let through
was the unmatched key - exactly the failure that loses a change without saying so. A check
that reports a problem and still exits zero is not a gate.

One deliberate omission: when a `MODIFIED` requirement fails rule 1, rule 4 stays quiet for
it. With no baseline requirement to compare against there are no scenarios to miss, and
reporting an omission on top of the unmatched name would be two messages from one cause.
Fix the name and the completeness check starts applying.

---

End of document.
