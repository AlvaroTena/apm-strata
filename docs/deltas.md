# Spec deltas

A delta is a change proposal written against a specification: it states what a change
adds, modifies and removes, and it is checked against the spec it changes before anyone
acts on it. The point is that a change to a requirement is reviewable on its own, without
diffing two versions of a long document and hoping the reader spots what moved.

The format is adapted from OpenSpec. The validator is this repository's own, and the
reason is in the last rule below.

## Layout

Deltas live under a specs root inside the project's APM directory. In a project that
installs this fork, that root is `.apm/openspec/`:

```
.apm/openspec/
  specs/
    scheduling/
      spec.md              <- the baseline: what is true today
  changes/
    add-recurring-slots/
      specs/
        scheduling/
          spec.md          <- the delta: what this change does to it
```

A delta at `<root>/changes/<change>/specs/<capability>/spec.md` is checked against the
baseline at `<root>/specs/<capability>/spec.md`. The root is derived from the path: the
validator takes the last `changes` segment and treats everything before it as the root,
so the tree can sit anywhere as long as the two halves mirror each other. One change
directory may carry deltas for several capabilities, one subdirectory each.

When no baseline exists at the derived path, the delta is checked as if the baseline were
empty. That is the right behaviour for a capability being specified for the first time,
and it is worth knowing about, because a delta that modifies a requirement will then fail
on the matching key rather than pass silently.

## Validating

```bash
apm delta validate .apm/openspec/changes/add-recurring-slots
```

The argument is a delta document or any directory containing them; a directory is walked
and every `spec.md` under it is checked. The command reports per document and exits
non-zero if any document has a violation:

```
[SUCCESS] .apm/openspec/changes/add-recurring-slots/specs/scheduling/spec.md: valid
[SUCCESS] 1 delta(s) valid.
```

```
[ERROR]   .apm/openspec/changes/add-recurring-slots/specs/scheduling/spec.md: 1 violation(s)
[INFO]      line 16 [modified-completeness] MODIFIED "Slot Booking" omits scenario(s) the spec still has: "Overlapping slot". A MODIFIED requirement replaces the whole block, so an omitted scenario is deleted.
[ERROR]   Delta validation failed with 1 violation(s)
```

Every violation names the rule it broke and the line it broke it on, so the message is
actionable without opening the validator.

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
