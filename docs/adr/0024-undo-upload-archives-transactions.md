# Undoing an Upload archives its Transactions (reversible, clean-slate re-import)

Members need to view past **Uploads** and undo any of them. Rather than hard-delete
(which would violate append-only ingestion, ADR-0003, and lose Overrides / history),
an **Undo** _archives_ the Upload's Transactions: they are retained in the store but
hidden from the transactions list _and_ every calculation, and can be brought back with
**Restore**. Archived-ness is a denormalized per-row `transactions.archived` boolean
(filtered right alongside the existing `excluded` flag) with the undo timestamp/actor
recorded on the `uploads` row.

## Considered Options

- **Hard delete** the Upload + its rows — rejected: breaks the append-only model, drops
  Overrides and any per-row edits, and makes Restore impossible.
- **Reuse `excluded`** — rejected: **Excluded** keeps a row _visible_ in the list and is a
  per-row Member judgement ("not our spending"); archiving hides the row entirely and
  follows the whole Upload. Overloading it also collides with the `NOT (excluded AND
  income_marked)` CHECK.
- **Upload-status only, derive archived-ness via a join** to `uploads.undoneAt` — rejected
  in favour of the per-row flag, to avoid adding a join/subquery to the ~15 hot aggregation
  queries that already filter `excluded = false`, and to sidestep special-casing bank-sync
  rows (null `uploadId`).

## Consequences

- **Clean-slate re-import.** Both idempotency guards ignore archived data: the
  household-scoped exact-file guard skips undone Uploads (so the DB `unique(householdId,
  fileHash)` becomes a partial index `WHERE undone_at IS NULL`), and the row-fingerprint
  dedup skips archived rows. Re-importing — the same file to a different Account, or an
  overlapping month — therefore behaves as if the undo never happened. **Restore** is
  withdrawn for an undone Upload once the same file has been re-imported, preserving the
  no-duplicate-visible-rows invariant.
- **Free cap is not reset by undo.** Archived Transactions still count toward the
  50-classified lifetime **Free cap** (identical to **Excluded**, ADR-0011), so undo cannot
  be used to farm free classifications. Edge: a Free Household that undoes then re-imports
  the _same_ rows double-counts them against the cap — rare, and **Classification reuse**
  means no new model spend.
- **Transfers.** Archiving one leg of a detected transfer pair (#97) unlinks the surviving
  leg so it returns to its natural math treatment (a debit counts as **Spending** again);
  Restore re-runs detection to re-pair.
- **Live vs frozen.** Undo/Restore retroactively change live dashboard views but never a
  recorded **Check-in** snapshot (ADR-0007/0021), exactly as **Excluded** does.
- Undo and Restore are logged **Member** actions (ADR-0017); a full data export keeps
  archived rows and undone Uploads, each carrying its marker.
