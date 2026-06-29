# Append-only, idempotent ingestion

The local tool used the CSV row-index as the transaction `id` and overwrote a single `transactions.json` on every run — fine for one person, one file. A Household uploads repeatedly (monthly statements, two spouses' cards), so we **append**: each import is an **Upload**, Transactions accumulate with DB-generated PKs (the row-index is demoted to `source_row` for traceability), and Overrides key off the real PK.

Ingestion must be **idempotent**, enforced in two layers, both reported back: an **exact-file guard** (hash the upload; warn if the Household already imported this file) and **row-fingerprint dedup** (`date, amount, merchant, raw-category` + an occurrence ordinal, so genuine same-day/same-price repeats both survive). Re-running classification skips already-classified rows.

## Consequences

- Overlapping monthly re-exports never double-count, and never burn the per-Household Free cap twice.
- The Free cap counts *distinct* classified Transactions, lifetime, which this model makes well-defined.
