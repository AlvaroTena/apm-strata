# claude-obsidian minimal ingest bundle

`minimal-ingest-bundle.json` is the smallest `claude-obsidian.transaction.v1`
bundle observed to be accepted by `claude-obsidian` 2.1.1 while registering a
file as a source, creating a page, and recording a claim backed by that source.

It was captured from a manual run against a throwaway vault. Reuse it as a
shape reference, not as a runnable file: three of its values are bound to that
specific vault and must be recomputed before any other run.

## Values that must be recomputed

| Field | How to obtain it |
|---|---|
| `expected_hashes.<ledger>` | SHA-256 of the ledger file as it currently exists in the target vault, or `null` when the path must be absent. |
| `writes[].sha256` | SHA-256 of the accompanying `content` string. |
| The `src-` key and `content_sha256` inside the source ledger | SHA-256 of the source file bytes, then the source ID that `claude_obsidian.ledgers.stable_source_id(kind, locator, content_sha256)` derives from it. A source ID that does not match its own record is rejected. |

Dates are also load-bearing. `generated_at`, `ingested_at` and `retrieved_at`
must not be later than the audit date, which is the current UTC date unless
`--as-of` overrides it. `refresh_due` must not precede the ingestion or
retrieval date.

## Applying it

The engine never writes on the strength of a bundle alone. Inspect first, then
replay the exact `approval_sha256` the inspection emitted:

```bash
python3 <product>/scripts/claude-obsidian.py transaction inspect BUNDLE --vault VAULT
python3 <product>/scripts/claude-obsidian.py transaction apply BUNDLE --vault VAULT \
  --approved-plan-sha256 <approval_sha256>
```

The approval hash binds the expanded plan to the resolved vault root, so a hash
reviewed for one vault cannot be replayed against another.

## Boundaries this bundle stays inside

An `ingest` operation may write only under `wiki/` and `.raw/`. It cannot write
the `inbox/`, so the source file has to be placed there outside the
transaction. The coupled writes that the wiki skill documents for ingest -
index, log, hot cache - are skill convention, not an engine requirement: this
three-write bundle applies cleanly without them.
