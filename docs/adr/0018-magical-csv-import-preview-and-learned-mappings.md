# Magical CSV import: stateless preview-then-confirm, learned mappings, AI fallback

## Context

Auto column-mapping (#233) matches headers by heuristic alias, but it is all-or-nothing: if any of `date/amount/merchant/category` is unmatched, `detectColumnMapping` returns `null` and the upload API throws a 422 with no recourse and no preview. To make CSV import "feel magical" we add a preview-then-confirm flow that never hard-fails on mapping, learns a Household's file formats, and falls back to AI when heuristics miss. (PDF and emailed-statement parsing from #96 were dropped in favour of this.)

## Decisions

- **Stateless, two-call flow.** A `POST /api/uploads/preview` call parses and runs the dedup dry-run against the account's existing rows and writes nothing; the client then re-sends the file bytes plus the confirmed **Column mapping** to `POST /api/uploads` to commit. No draft rows, no staging table, no abandoned-draft cleanup, and dedup is recomputed against current DB state at commit (the preview's counts are advisory). Chosen over server-side staging, whose draft lifecycle would fight the strict provenance CHECK on `transactions` and require a GC job; the cost is uploading the (≤10 MB) file twice.
- **Interrupt only when unsure.** A heuristic-complete or **remembered** mapping that resolves every role and adds new rows auto-commits to a summary. The **Import preview** is surfaced in exactly three cases: (1) a column role is unmatched, (2) the mapping required the **AI fallback** — AI involvement *is* the uncertainty signal, so it stops even when every role resolved — or (3) the file would add zero new rows. This is the complete trigger set; none of the three is optional.
- **Learned mappings.** On commit, the final Column mapping is stored keyed by a normalized *header signature* (the folded, sorted set of the file's column labels), Household-scoped. Precedence becomes **remembered → heuristic → AI**; a remembered mapping counts as confident and auto-commits, so the second import of a taught format is silent. Keyed by file shape, not Account, so same-bank accounts share it; a changed export format is simply a new signature and re-learns.
- **AI mapping is out of scope of the Free cap.** When heuristics leave a role unmatched, the header + sample rows go to Claude (AI Gateway, structured output) to *suggest* `column → role`, pre-filling editable controls. This call assigns columns only — it never repairs cell data (Icelandic amount/date parsing stays deterministic in `parse-csv.ts`). The **Free cap** counts *distinct classified Transactions* (ADR-0003); mapping is a different kind of call and must not draw down a Household's classification budget.
- **Single signed-amount column only (v1).** Each role binds to one column and `amount` must be a single signed column. Files with separate debit/credit columns (or a debit-positive sign convention) get a *specific* error, not a generic mapping failure, and are a later capability.
- **Header-row detection in; encoding and account-detection out.** The parser locates the real header row (first row where enough role-aliases hit) so bank preamble lines don't break mapping. Delimiter auto-detection (PapaParse) stays on. Latin-1/encoding repair and auto-detecting the Account from file contents are deferred.

## Consequences

- The duplicate-file **409** is demoted to a soft preview notice ("already imported — 0 new rows"). The `unique(householdId, fileHash)` constraint stays; commit now tolerates its violation as a 0-row no-op instead of erroring, since the row-fingerprint dedup is the real guard and nothing would have been inserted anyway.
- A new small table stores learned mappings (`household_id`, `header_signature`, `mapping_json`).
- The parser splits into "detect (possibly partial) mapping" and "parse with an explicit mapping"; `detectColumnMapping` now returns the resolved roles plus the names of unmatched roles rather than null-on-first-miss.
