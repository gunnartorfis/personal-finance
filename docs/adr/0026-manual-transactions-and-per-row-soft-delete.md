# Manual Transactions and per-row soft-delete (reversible, member-owned rows)

Members need two per-row controls over **member-owned** transaction data that the
ingestion model (ADR-0003) didn't provide: to **hand-enter** a Transaction that no
statement carries, and to **delete a single** unwanted row without undoing a whole
**Upload** (ADR-0024) or merely **Excluding** it (ADR-0011, which keeps the row
visible). Both build on the append-only store: nothing is destroyed.

## Context

- Rows only ever arrived via a CSV **Upload** or a bank **Sync**. A member who paid
  cash, or whose export missed a charge, had no way to add one.
- The only per-row removals were **Excluded** (drops from math, stays *visible*,
  struck-through) and whole-Upload **Undo** (archives *all* the file's rows). ADR-0025
  (**Import anyway** / **Fix & import**) made it easy to create a duplicate or repaired
  row, sharpening the need to remove *one* row cleanly.
- `transactions.source` was `csv | bank_sync`, and a CHECK tied each to its provenance
  (a CSV row carries an `uploadId`; a synced row carries an `externalId`). A hand-entered
  row fits neither.

## Decisions

- **First-class `manual` source.** Add `manual` to the ingestion-source enum and a third
  arm to the provenance CHECK: a manual row carries no `uploadId`, `externalId`, or
  `sourceRow`. The enum value is added in an earlier migration than the CHECK that
  references it, because Postgres forbids using a just-added enum value in the same
  transaction. A manual row is otherwise an ordinary Transaction — same shape, same
  classification, same net math.
- **Optional type at insert, via an Override — not an AI call.** The insert form takes an
  optional **Expense type**. When given, the row is created with a manual **Override**
  (ADR-0012) in the same DB transaction; because the classification queue anti-joins
  `overrides`, a typed manual row never enters the AI queue (no **Free cap** spend, ADR-0011)
  and resolves to the chosen type. Left blank, the row is `pending` and the standing
  classification drain picks it up like any other. Types are debit-only; a credit is
  **Income (marked)** or nothing, never a typed expense.
- **Per-row soft-delete with its own column.** A Member can delete a single **non-`bank_sync`**
  row (csv or manual — a synced row would just re-appear on the next Sync). Delete stamps a
  new per-row `transactions.deletedAt`; the row is **retained** (append-only) but hidden from
  the transactions list and **every** calculation, and is **reversible**. It gets its **own**
  column rather than reusing `archived` (ADR-0024) precisely because `archived` is
  upload-derived and flipped en-masse by Undo/**Restore** — conflating the two would let a
  whole-Upload restore silently un-delete a row a Member deleted on its own. A row is hidden
  when `archived = true` **OR** `deletedAt IS NOT NULL`; the `deletedAt IS NULL` predicate is
  filtered right alongside the existing `archived = false` in every read/aggregation.
- **Restore, immediate and durable.** Deleting shows an inline **Undo**; the row is also
  reachable later through a per-cycle **Deleted** view (a `deletedMonths()` query keeps a
  cycle whose only remaining rows are deleted navigable in the period selector, though such a
  cycle never becomes the default landing). Restore clears `deletedAt` and re-runs transfer
  detection, mirroring Upload **Restore** (ADR-0024) so a restored transfer leg re-pairs.
- **Both are logged Member actions** (ADR-0017): `transaction.created`, `transaction.deleted`,
  `transaction.restored`.

## Consequences

- **Delete stays out of the dedup guard's way — deliberately not like `archived`.** A
  soft-deleted row *remains visible* to the row-fingerprint dedup (`listByAccount`), so a
  re-upload of the same file does **not** silently resurrect a deliberately-deleted row —
  **Restore** is the only way back. This is the opposite of ADR-0024's clean-slate re-import
  (where archived rows are invisible to dedup), and the asymmetry is intentional.
- **Free cap unaffected.** A soft-deleted row still counts toward the 50-classified lifetime
  cap (identical to `archived` and `excluded`), so delete can't farm free classifications.
- **Transfers.** Deleting one leg of a detected pair (#97) unlinks both legs so the survivor
  returns to its natural math treatment (a debit counts as **Spending** again); Restore
  re-runs detection to re-pair — the same lifecycle Undo/Restore already use.
- **Export & upload progress.** A full data export keeps soft-deleted rows carrying their
  `deletedAt` marker (as it keeps archived rows). Deleting a still-`pending` CSV row also drops
  it from that Upload's classification-progress counts, so the progress indicator can complete.
- **Idempotent, atomic writes.** `softDelete`/`restoreDeleted` are guarded (delete only a live
  non-bank row; restore only a deleted row), so concurrent requests and retries don't
  double-act or write duplicate audit entries; a manual insert with a type inserts the row and
  its Override in one transaction. A post-commit audit-log failure never fails the request
  (which would prompt a duplicate retry).
- New message keys land in both `messages/en.json` and `messages/is.json`, kept in parity
  (`lib/i18n/parity.test.ts`).
