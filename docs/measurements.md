# Measurement protocols

Two design decisions in this framework are currently defended by argument rather than
by data. This document is what to run to settle them. Neither protocol has been
executed; running one is separate work.

Each protocol states a baseline, a variant, the quantities to measure, a decision
criterion, and the commands. A protocol that cannot be executed by reading it is not a
protocol, so the extraction scripts and the capture commands here were each run once
against a real transcript before being written down, and the output blocks are real
output, not illustrations. The one exception is marked where it appears: the
non-Anthropic lens invocation is verified against that tool's own help output rather
than executed, because the local install has no authenticated account.

## Platform baseline

Verified against Claude Code `2.1.263` on macOS (Darwin 25.6.0). Confirm with
`claude --version` before a run: the `/context` category table and the transcript
schema are both version-dependent, and a run that spans a version upgrade is not
comparable to itself.

Put the scripts and every artifact of a run outside the repository:

```bash
export RUN="$(mktemp -d /tmp/measurement.XXXXXX)"
mkdir -p "$RUN/scripts" "$RUN/baseline" "$RUN/variant"
```

---

# Protocol 1 - Up-front full reading

## The claim under test

The role initiation guides instruct the agent to read every referenced document in
full - every line, every section - and justify that instruction by saying that
skipping content causes execution errors.

The claim to test is that **relaxing that instruction saves context in the coordinator
without degrading coordination**. If the claim is false, the instruction stays exactly
as it is.

## Baseline

A real session, not a toy. Start the coordinator with the current templates, on a
pinned plan, and capture context twice: immediately after initialisation completes,
and again after N dispatches.

## Variant

The same initiation guide with a single difference: the full-reading instruction is
replaced by `consult each guide at the point where its procedure applies`. Nothing
else changes - same plan, same task set, same worker roster, same model, same effort.

Pin the difference to one commit so the diff is auditable:

```bash
git switch -c experiment/lazy-guide-reading
# edit only the reading instruction in the coordinator initiation guide
git diff --stat main   # must report exactly one file changed
```

## Capturing context by source

`/context` runs in print mode and emits a markdown table, so it can be captured
without a human reading a TUI:

```bash
claude -p "/context" --model <the model used for the run> < /dev/null \
  > "$RUN/baseline/context-after-init.md"
```

Real output from a probe session, trimmed to the category table:

```
## Context Usage

**Model:** claude-haiku-4-5-20251001
**Tokens:** 9.4k / 200k (5%)

### Estimated usage by category

| Category               | Tokens | Percentage |
|------------------------|--------|------------|
| System prompt          | 1.6k   | 0.8%       |
| System tools           | 5.6k   | 2.8%       |
| MCP tools (deferred)   | 197.7k | 98.9%      |
| System tools (deferred)| 15.5k  | 7.8%       |
| Custom agents          | 207    | 0.1%       |
| Memory files           | 18     | 0.0%       |
| Skills                 | 2k     | 1.0%       |
| Messages               | 8      | 0.0%       |
| Free space             | 190.6k | 95.3%      |
```

A per-tool table for MCP servers follows the category table, and rows for rules files
and memory files appear when those files load. The `Memory files` row appears only
when a `CLAUDE.md` or an auto-memory file is in scope; the probe above ran in a
directory with a two-line `CLAUDE.md`.

**What this does and does not separate.** It separates the system prompt, built-in
tool schemas, MCP tool schemas, custom agents, memory and rules files, the skill
listing after its budget is applied, and the conversation. It does **not** separate
the individual documents an agent reads during a session: every guide read with a
file tool is inside the single `Messages` row. That is precisely the quantity this
protocol needs, so `/context` alone is not sufficient and the transcript has to be
read directly.

Numbers are labelled *estimated*. Treat them as comparable between two sessions
measured the same way, never as exact token counts.

## Reading the transcript

Sessions are written as JSON Lines under `~/.claude/projects/<cwd-slug>/<session-id>.jsonl`,
where the slug is the working directory with every `/` replaced by `-`:

```bash
ls -t ~/.claude/projects/*/*.jsonl | head
```

Two scripts read it. Write them once into `$RUN/scripts`.

**Total context at each request.** This is the number that answers "how much context
after N dispatches", and it is also how the handoff point is detected.

```bash
cat > "$RUN/scripts/context-timeline.py" <<'EOF'
#!/usr/bin/env python3
"""Print total context size at each model request in a Claude Code transcript.

Usage: python3 context-timeline.py <session>.jsonl
One row per API request of the main thread; sidechain (subagent) requests are skipped
because they run in their own context window.
"""
import json, sys

seen = set()
n = 0
print("request\tcontext_tokens\toutput_tokens\ttimestamp")
for line in open(sys.argv[1]):
    try:
        entry = json.loads(line)
    except ValueError:
        continue
    if entry.get("type") != "assistant" or entry.get("isSidechain"):
        continue
    request_id = entry.get("requestId")
    if request_id in seen:
        continue
    seen.add(request_id)
    usage = entry.get("message", {}).get("usage") or {}
    context = (usage.get("input_tokens", 0)
               + usage.get("cache_read_input_tokens", 0)
               + usage.get("cache_creation_input_tokens", 0))
    n += 1
    print(f"{n}\t{context}\t{usage.get('output_tokens', 0)}\t{entry.get('timestamp', '')}")
EOF
python3 "$RUN/scripts/context-timeline.py" <session>.jsonl | tee "$RUN/baseline/timeline.tsv"
```

**Context charged to each document.** This is the attribution `/context` cannot give.
It pairs every tool call with its result and charges the result to the file or command
that produced it.

```bash
cat > "$RUN/scripts/read-attribution.py" <<'EOF'
#!/usr/bin/env python3
"""Attribute context to the files a session read.

Usage: python3 read-attribution.py <session>.jsonl

/context reports whole-file reads inside a single Messages row, so this walks the
transcript instead: it pairs every tool_use with its tool_result and charges the
result to the file or command that produced it. Token counts are estimated at four
characters per token; they are only used to compare sessions measured the same way.
"""
import json, sys
from collections import defaultdict

CHARS_PER_TOKEN = 4

targets = {}          # tool_use_id -> label
by_target = defaultdict(int)
by_tool = defaultdict(int)

for line in open(sys.argv[1]):
    try:
        entry = json.loads(line)
    except ValueError:
        continue
    if entry.get("isSidechain"):
        continue
    content = entry.get("message", {}).get("content")
    if not isinstance(content, list):
        continue
    for block in content:
        if not isinstance(block, dict):
            continue
        if block.get("type") == "tool_use":
            args = block.get("input") or {}
            target = (args.get("file_path") or args.get("path")
                      or args.get("pattern") or args.get("command")
                      or args.get("url") or "")
            targets[block["id"]] = (block.get("name", "?"), str(target)[:120])
        elif block.get("type") == "tool_result":
            body = block.get("content")
            if isinstance(body, list):
                body = "".join(p.get("text", "") for p in body if isinstance(p, dict))
            size = len(body or "") // CHARS_PER_TOKEN
            tool, target = targets.get(block.get("tool_use_id"), ("?", ""))
            by_tool[tool] += size
            by_target[f"{tool}\t{target}"] += size

print("== estimated tokens by tool ==")
for tool, size in sorted(by_tool.items(), key=lambda kv: -kv[1]):
    print(f"{size:>8}\t{tool}")
print("\n== estimated tokens by target (top 20) ==")
for target, size in sorted(by_target.items(), key=lambda kv: -kv[1])[:20]:
    print(f"{size:>8}\t{target}")
EOF
python3 "$RUN/scripts/read-attribution.py" <session>.jsonl | tee "$RUN/baseline/attribution.txt"
```

The estimator charges four characters per token and charges a result at the size it
entered the conversation, so it over-counts anything a later compaction dropped. It
compares two sessions measured identically; it is not an absolute measure.

## Fixing N

N is the number of dispatches after which context is compared. Fix it before either
run, and make both runs do the same work, or the comparison measures the plan rather
than the instruction.

- Pin one plan: same stages, same tasks, same worker roster, same dispatch order.
  Both arms run that plan and no other.
- Set **N to the task count of the pinned plan's first stage, and never below 8**.
  Below eight dispatches, per-dispatch variance dominates the difference being
  measured. If the first stage is shorter than eight, continue into the second stage
  until N is reached rather than swapping in a different plan.

Freeze everything else that moves context on its own:

- Same model and same effort level in both arms.
- Same MCP servers enabled. MCP tool schemas are routinely the largest single
  category - 197.7k of 200k in the probe above - so a server toggled between runs
  invalidates the comparison outright. Record the enabled set:
  `claude mcp list > "$RUN/baseline/mcp.txt"`.
- Same `CLAUDE.md` and same memory files in scope.
- No compaction inside the measured window. Push the auto-compact window out of
  reach for the run with `claude --autocompact 1000000` (verified in `claude --help`:
  `--autocompact <auto|tokens>`, accepting `auto` or 100k to 1M) and do not run
  `/compact` by hand. If a compaction fires anyway, the run is void - the timeline
  after it is not comparable.

Record all of it in a run sheet next to the transcripts, so a reader six months later
can tell whether two numbers were produced under the same conditions.

## The two quantities that decide

**Context consumed after N dispatches.** Take the `context_tokens` value on the
request that completes dispatch N in each arm. Dispatch boundaries come from the
coordinator's own transcript - a dispatch is a write to a worker's task bus file:

```bash
cat > "$RUN/scripts/dispatches.py" <<'EOF'
#!/usr/bin/env python3
"""List the coordinator's dispatches, in order, from its transcript.

Usage: python3 dispatches.py <session>.jsonl

A dispatch is a write to a worker's task bus file. Repeated writes to the same bus
without an intervening report are the reissues counted in the defect rate.
"""
import json, re, sys

BUS = re.compile(r"\.apm/bus/([a-z0-9-]+)/task\.md")

n = 0
print("dispatch\trequest_ts\tworker")
for line in open(sys.argv[1]):
    try:
        entry = json.loads(line)
    except ValueError:
        continue
    if entry.get("isSidechain"):
        continue
    content = entry.get("message", {}).get("content")
    if not isinstance(content, list):
        continue
    for block in content:
        if not isinstance(block, dict) or block.get("type") != "tool_use":
            continue
        args = block.get("input") or {}
        blob = " ".join(str(args.get(k, "")) for k in ("file_path", "command"))
        hit = BUS.search(blob)
        if hit and not re.search(r"\b(cat|head|tail|less|wc|truncate -s 0)\b", blob):
            n += 1
            print(f"{n}\t{entry.get('timestamp','')}\t{hit.group(1)}")
EOF
python3 "$RUN/scripts/dispatches.py" <session>.jsonl | tee "$RUN/baseline/dispatches.tsv"
```

The exclusion list is a heuristic over tool inputs. On the first run, check the
dispatch count against the bus history by hand and extend the exclusions if the
coordinator touches bus files in a way the pattern misreads.

**Dispatches until the first coordinator handoff.** This is the quantity that matters,
because it is the one a reference project paid thirteen times over. Do not let it rest
on an operator's sense of when the session felt full. Declare a handoff threshold `T`
before either run - a fixed fraction of the context window, for example
`T = 0.75 x 200000 = 150000` - and define the metric as the index of the first dispatch
that completes with `context_tokens >= T`:

```bash
awk -F'\t' -v T=150000 '
  NR > 1 && $2 >= T { print "threshold reached at request " $1 " (" $2 " tokens) " $4; found = 1; exit }
  END { if (!found) print "threshold never reached" }
' "$RUN/baseline/timeline.tsv"
```

Cross-reference the request index against `dispatches.tsv` by timestamp to convert it
into a dispatch index. If an arm never reaches `T` inside the pinned plan, report
"not reached within N" and lengthen the plan. Do not extrapolate a trend line into a
handoff that did not happen.

## The quality counterpart

A saving that degrades coordination is not a saving. The counterweight is the
**coordination defect rate**, defined as the number of defects divided by the number
of dispatches, where a defect is either of:

- **A reissue.** A task prompt that had to be redone. Countable from
  `dispatches.tsv`: the same worker bus written twice with no report processed in
  between, or a report that came back Partial or Failed with the cause attributed to
  the prompt rather than to the work.
- **A rule miss.** A review that finds the coordinator did not apply a rule that was
  in its own guide. This is exactly the failure the full-reading instruction claims to
  prevent, so it is the half of the measurement that can save the instruction.

Rule misses need a fixed instrument, built before the runs so it cannot be tuned to
the result: derive a checklist of one line per obligation stated in the coordinator's
guides, and have a reviewer who did not run either session score every dispatched
prompt against it. Strip the arm label from the prompts first - the scorer must not
know which prompts came from the relaxed guide. Score both arms in one interleaved
pass, not one arm then the other.

Report the rate per arm as `defects / dispatches`, with the two defect kinds broken
out, because a variant that trades reissues for rule misses is not neutral even when
the totals match.

## Decision criterion

**Relax the instruction only if context drops appreciably and the defect rate does not
rise. On a tie or on doubt, it stays as it is**, because the instruction defends a
real and documented failure.

Operationally, with the baseline as the reference:

- *Appreciable drop*: context after N dispatches is at least 15% lower **and**
  dispatches until the handoff threshold is at least 20% higher.
- *Does not rise*: the variant's coordination defect rate is less than or equal to the
  baseline's, counting both defect kinds.
- Both hold: relax the instruction. Anything else, including a clear context win paired
  with any rise in defects: the instruction stays.

One pair of runs cannot support the second half of that criterion. A defect rate
computed over a single session moves by a whole percentage point on one event, so run
**at least three pairs** and compare the medians. If three pairs are out of budget,
the protocol still yields an honest context number, but the decision cannot be taken -
the criterion is not "context dropped", it is "context dropped *and* defects did not
rise", and one run does not measure the second half.

## Out of scope

- **Per-document attribution from `/context`.** It does not exist at that granularity.
  Documents read during a session are aggregated into the `Messages` row, and the
  split by document only comes from the transcript walk above.
- **Exact token counts.** Both `/context` and the attribution script are estimates.
  Every claim this protocol supports is a comparison between two sessions measured the
  same way.
- **Anything outside Claude Code.** The capture path is Claude Code's transcript
  format and `/context`. Another platform needs its own capture method before this
  protocol means anything there.

---

# Protocol 2 - Provider diversity in review

## The claim under test

The review design splits work into lenses: reviewers with no accumulated context that
receive the path of a prepared artifact and return findings. The claim is that **a
lens from a different provider finds defects the same-provider lenses do not find**.
Today that rests on indirect evidence.

## What is measured

The **overlap of findings after verified triage, counting confirmed findings only**.
If overlap is near total, diversity does not pay its cost and the answer is more
lenses from the same provider. If disjoint families of defects appear, it pays.

Measure after triage rather than on raw findings. The adversarial lens has a mandatory
floor of findings, so raw counts guarantee volume, not signal, and an overlap computed
before triage mostly measures that floor.

## Prerequisites

Review material is prepared in `.apm/review/<stage>-<task>/` with the artifact, the
author's claims, the acceptance criteria and the context. Each finding carries exactly
four fields and no severity:

```yaml
- location: <file:line, section, or "general">
  trigger_condition: <the problem, in one line>
  guard_snippet: <the concrete correction>
  potential_consequence: <what happens if this ships>
```

Triage output goes to `.apm/review/<stage>-<task>/triage.md`, one row per finding with
a verdict, evidence and a bucket. Verdicts are `high`, `medium`, `low`, `false` and
`maybe-false`; buckets are `accept`, `follow-up`, `plan` and `defer`.

This measurement needs two columns beyond that: **`lens`**, naming which lens produced
the row, and **`id`**, a stable per-finding identifier. Without `lens` the rows cannot
be separated into two sets and no overlap exists to compute. The table the scripts
below parse is:

```markdown
| id | lens | location | trigger_condition | verdict | evidence | bucket |
|----|------|----------|-------------------|---------|----------|--------|
| a1 | lens-alpha | src/importer.js:42 | Retry loop never terminates when the upstream returns 429 | high | Reproduced with a stub returning 429 twice | accept |
```

Confirmed means the verdict is `high`, `medium` or `low`. Rows verdicted `false` or
`maybe-false` are excluded from every count.

**Rows the coordinator wrote are excluded too.** The coordinator may add findings of its
own to `triage.md` under the reserved `lens` value `manager`. That is deliberate: the
triage is its artifact, and someone who spots a real defect should not have to launder it
through a lens to record it. But those rows came from no lens, so counting them would
contaminate the measurement in both directions - inflating the union, and crediting or
denying a lens work it never did. **The overlap counts only rows produced by lenses**, and
both scripts below drop every reserved value before anything else. If the review design
adds another reserved value later, add it to `RESERVED` in both scripts, or the number
silently starts measuring something else.

## Baseline

**Two lenses from the same provider**, identical prompt, separate sessions. This is
not a formality: it measures the overlap floor produced by sampling variation alone.
Without it, a cross-provider overlap number cannot be told apart from the ordinary
run-to-run difference of one lens re-run twice.

## Variant

**Two lenses from different providers**, the same identical prompt, on the same
prepared artifact.

## Running the lenses

A lens gets the prepared directory and nothing else, read-only, with no ambient
configuration. For the Claude lens:

```bash
REVIEW=.apm/review/03-04
claude -p "$(cat "$REVIEW/lens-prompt.md")" \
  --model <model> \
  --add-dir "$REVIEW" \
  --tools "Read,Grep,Glob" \
  --permission-mode dontAsk \
  --strict-mcp-config \
  --setting-sources "" \
  < /dev/null > "$REVIEW/findings-claude-1.yaml"
```

`--strict-mcp-config` and `--setting-sources ""` are load-bearing, not tidiness. Run
without them on a machine with MCP servers configured and the ambient tool schemas
alone exceed the context window before the artifact is read - the invocation above
fails outright with `the request is ~205825 tokens (limit 200000)` until the servers
are excluded. They also make the lens reproducible across machines, which a lens whose
context depends on the operator's local configuration is not.

For a lens from another provider, the requirements are the same - headless, read-only,
prompt from a file, output to a file, scoped to the prepared directory. Using the
Cursor agent CLI, whose flags are verified against `cursor-agent --help`:

```bash
cursor-agent -p "$(cat "$REVIEW/lens-prompt.md")" \
  --model <a non-Anthropic model> \
  --mode ask \
  --workspace "$REVIEW" \
  --output-format text \
  > "$REVIEW/findings-other-1.yaml"
```

Resolve the model identifier with `cursor-agent --list-models` on an authenticated
account before the run, and record the exact identifier in the run sheet: "a different
provider" is not a measurement input, a model identifier is.

Then triage all findings into `triage.md` as usual, with the `lens` column filled in.

## When two findings count as the same

Without this rule the overlap number means nothing. Two findings can cite the same line
and describe unrelated problems, or cite different places and be one cause.

Two confirmed findings from different lenses are **the same finding** when both hold:

1. **Same site.** Their `location` values resolve to the same region of the artifact:
   the same file within a few lines, or the same named section. `general` matches only
   `general`.
2. **Same failure.** Applying either finding's `guard_snippet` makes the other's
   `trigger_condition` no longer true.

Site alone never suffices. The second test is what does the work, and it settles both
awkward cases directly:

- *Same line, different problems.* Two findings on `importer.js:42`, one about an
  unbounded retry loop and one about a logged credential. Fixing the loop leaves the
  credential in the log, so the second trigger still holds: **different findings**.
- *Different sites, one cause.* A rejected payload reported at the schema declaration
  and at the call site that trips over it. If one guard removes both triggers they are
  the **same cause**; if each site needs its own guard they are two findings that share
  a cause.

That last case is why the result is reported at two granularities. **Finding level**
counts only `same-finding` matches and answers "did the other lens do redundant work".
**Cause level** also counts `same-cause` matches and answers "did the other lens see
anything genuinely new". Report both; they disagree in exactly the cases that matter.

The adjudication is a judgement, so it is made blind. The worksheet relabels the lenses
`A` and `B` by a coin flip, and the adjudicator is not one of the lenses and did not
run them.

## Computing the overlap

```bash
cat > "$RUN/scripts/triage-pairs.py" <<'EOF'
#!/usr/bin/env python3
"""Emit the blind adjudication worksheet for a cross-lens overlap measurement.

Usage: python3 triage-pairs.py <triage.md> > pairs.tsv

Reads the triage table, keeps only confirmed findings (verdict high, medium or low),
and writes every cross-lens pair. Lens names are replaced by A and B, assigned by a
coin flip, so the adjudicator cannot tell which provider produced which finding.
Fill the relation column with same-finding, same-cause or different.
"""
import csv, random, sys

CONFIRMED = {"high", "medium", "low"}

# Lens values that name something other than a lens. The coordinator may add findings of
# its own to the triage under "manager"; they are real findings but they came from no
# lens, so they cannot enter an overlap between lenses.
RESERVED = {"manager"}


def read_table(path):
    rows, header = [], None
    for line in open(path):
        line = line.strip()
        if not line.startswith("|"):
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        if set("".join(cells)) <= set("-: "):
            continue
        if header is None:
            header = cells
            continue
        rows.append(dict(zip(header, cells)))
    return rows


def from_a_lens(row):
    return row["verdict"].lower() in CONFIRMED and row["lens"].strip().lower() not in RESERVED


findings = [r for r in read_table(sys.argv[1]) if from_a_lens(r)]
lenses = sorted({r["lens"] for r in findings})
if len(lenses) != 2:
    sys.exit(f"expected exactly 2 lenses in the triage table, found {lenses}")

random.shuffle(lenses)
label = {lenses[0]: "A", lenses[1]: "B"}
left = [r for r in findings if label[r["lens"]] == "A"]
right = [r for r in findings if label[r["lens"]] == "B"]

out = csv.writer(sys.stdout, delimiter="\t", lineterminator="\n")
out.writerow(["relation", "a_id", "a_location", "a_trigger",
              "b_id", "b_location", "b_trigger"])
for a in left:
    for b in right:
        out.writerow(["?", a["id"], a["location"], a["trigger_condition"],
                      b["id"], b["location"], b["trigger_condition"]])
print(f"# lens A = {lenses[0]} | lens B = {lenses[1]}"
      f" | confirmed: A={len(left)} B={len(right)}", file=sys.stderr)
EOF

python3 "$RUN/scripts/triage-pairs.py" "$REVIEW/triage.md" \
  > "$RUN/pairs.tsv" 2> "$RUN/lens-key.txt"
```

`lens-key.txt` holds the mapping from `A` and `B` back to the real lens names. Hand the
adjudicator `pairs.tsv` only, and keep the key until the relations are filled in. The
adjudicator replaces each `?` in the `relation` column with `same-finding`,
`same-cause` or `different`.

```bash
cat > "$RUN/scripts/overlap.py" <<'EOF'
#!/usr/bin/env python3
"""Compute cross-lens finding overlap from an adjudicated worksheet.

Usage: python3 overlap.py <triage.md> <pairs.tsv>

pairs.tsv is the output of triage-pairs.py with the relation column filled in with
same-finding, same-cause or different. Prints the overlap at both granularities plus
the exclusive high-verdict counts, which is the number that decides on its own.
"""
import csv, sys
from collections import defaultdict

CONFIRMED = {"high", "medium", "low"}

# See triage-pairs.py: rows the coordinator wrote itself carry a reserved lens value and
# are not part of any lens's output.
RESERVED = {"manager"}


def read_table(path):
    rows, header = [], None
    for line in open(path):
        line = line.strip()
        if not line.startswith("|"):
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        if set("".join(cells)) <= set("-: "):
            continue
        if header is None:
            header = cells
            continue
        rows.append(dict(zip(header, cells)))
    return rows


def from_a_lens(row):
    return row["verdict"].lower() in CONFIRMED and row["lens"].strip().lower() not in RESERVED


findings = {r["id"]: r for r in read_table(sys.argv[1]) if from_a_lens(r)}
lenses = sorted({r["lens"] for r in findings.values()})
per_lens = {l: {i for i, r in findings.items() if r["lens"] == l} for l in lenses}

matched_finding, matched_cause = set(), set()
with open(sys.argv[2]) as fh:
    for row in csv.DictReader(fh, delimiter="\t"):
        relation = row["relation"].strip().lower()
        pair = (row["a_id"], row["b_id"])
        if relation == "same-finding":
            matched_finding.add(pair)
            matched_cause.add(pair)
        elif relation == "same-cause":
            matched_cause.add(pair)

def report(title, matches, strict):
    counts = defaultdict(int)
    for pair in matches:
        for i in pair:
            counts[i] += 1
    repeated = sorted(i for i, c in counts.items() if c > 1)
    if repeated and strict:
        print(f"warning: {repeated} matched more than once - "
              "resolve to one pair each before reading the numbers", file=sys.stderr)
    paired = set(counts)
    union = len(findings) - len(matches)          # each match collapses two rows into one
    shared = len(matches)
    jaccard = shared / union if union else 0.0
    print(f"\n== {title} ==")
    print(f"shared: {shared}   union: {union}   jaccard: {jaccard:.2f}")
    for l in lenses:
        exclusive = per_lens[l] - paired
        highs = [i for i in exclusive if findings[i]["verdict"].lower() == "high"]
        print(f"  {l}: confirmed {len(per_lens[l])}, "
              f"exclusive {len(exclusive)}, exclusive high {len(highs)}"
              + (f"  -> {sorted(highs)}" if highs else ""))

print(f"lenses: {lenses[0]} vs {lenses[1]}   confirmed findings: {len(findings)}")
report("finding level", matched_finding, strict=True)
report("cause level", matched_cause, strict=False)
EOF

python3 "$RUN/scripts/overlap.py" "$REVIEW/triage.md" "$RUN/pairs.tsv"
```

Overlap is the Jaccard index over confirmed findings: shared findings divided by the
union of both lenses' confirmed findings. Output on a worked example:

```
lenses: lens-alpha vs lens-beta   confirmed findings: 7

== finding level ==
shared: 2   union: 5   jaccard: 0.40
  lens-alpha: confirmed 4, exclusive 2, exclusive high 0
  lens-beta: confirmed 3, exclusive 1, exclusive high 1  -> ['b3']

== cause level ==
shared: 2   union: 5   jaccard: 0.40
  lens-alpha: confirmed 4, exclusive 2, exclusive high 0
  lens-beta: confirmed 3, exclusive 1, exclusive high 1  -> ['b3']
```

Run the same two scripts over the baseline pair's `triage.md` and over the variant
pair's. The comparison is between those two Jaccard values, never against an absolute.

## Decision criterion

Write `J_base` for the same-provider pair's finding-level Jaccard and `J_var` for the
cross-provider pair's.

- **Diversity pays** when `J_var <= J_base - 0.15`, or when the foreign lens
  contributes at least one exclusive confirmed `high` finding per artifact, averaged
  over the artifact set. The second clause stands on its own: one real high-verdict
  defect that only the foreign lens saw is worth more than a favourable ratio.
- **Diversity does not pay** when `J_var >= J_base - 0.05` and the foreign lens
  contributes no exclusive `high` findings across the set. Spend the budget on more
  same-provider lenses instead.
- **Inconclusive** otherwise: extend the artifact set and re-measure. Do not resolve an
  inconclusive result by picking the reading that matches the current design.

Measure over **at least five prepared artifacts**, chosen before the run and spanning
more than one kind of work. A single artifact decides nothing: whether one lens happens
to find one bug is close to a coin flip, and it is the shape of the disagreement across
artifacts, not its size on one, that says whether provider identity is doing anything.

## Out of scope

- **Provider attribution of the difference.** This measures whether two named model
  identifiers disagree. It does not isolate why - training data, tuning, and decoding
  settings all move with the provider and are not separated here.
- **Finding quality beyond the verdict.** A confirmed finding counts once whatever its
  depth. The verdict is the only weighting, and only the `high` bucket enters the
  decision separately.
- **Cost.** The decision criterion is about signal. Whether the foreign lens is worth
  its price is a separate judgement made once the overlap number exists.

---

End of document.
