# Excluding a Transaction from all calculations

A Member can mark any Transaction as **Excluded** — dropping it from every live
calculation (Spending, Income, Difference, spend series, expense-type buckets, Inferred
saving). It exists so a debit that is not true household spending — reimbursed by someone
else, a mistaken charge, or a cost fronted for another party (the "grandma's vacuum":
buy a vacuum, she transfers the money back the next day) — can be taken out of the math.
Persisted as `transactions.excluded` (boolean, default `false`) plus a nullable
`exclusion_note`.

This completes the pair started in ADR-0009. That decision made credits default-OUT with
`income_marked` as the opt-IN. Debits were still always-IN with no opt-out. `excluded` is
that missing opt-out. The two flags are **mutually exclusive** (DB CHECK
`NOT (excluded AND income_marked)`): a row is in exactly one net state — counts as
Spending, counts as Income, or Excluded.

## Considered Options

- **A reconciliation link between two rows** (pair the vacuum debit to grandma's credit) —
  rejected for v1. Because ADR-0009 already excludes every unmarked credit, the credit leg
  needs no action; only the debit does. A per-row flag fully resolves the scenario without
  matching logic, partial-amount handling, or a join table. Automatic matching/detection
  stays deferred as transfer detection (issue #97), which can later pre-fill this flag.
- **Debit-only flag** (strict mirror of `income_marked`'s credit-only CHECK) — rejected:
  allowing any sign lets a Member explicitly mark *both* legs of a reimbursement as
  Excluded, which reads as an intentional "these cancel" gesture even though the credit was
  already math-excluded.
- **Reusing the "reconcile"/"afstemma" name** — rejected: "reconciliation" already names an
  internal invariant in `lib/dashboard/net-summary.ts`, and reconcile/afstemma imply the
  row-pairing we are NOT building. Canonical term is **Excluded**.

## Consequences

- Excluding a debit *raises* Inferred saving: savings already ignored the reimbursing credit
  (positive lines ignored, ADR-0007), so subtracting the debit understated saving — dropping
  it corrects the figure. Excluding is therefore not cosmetic; it changes savings.
- Live views recompute from rows, so excluding retroactively changes a past cycle's
  dashboard — but a recorded **Check-in** snapshot is frozen and untouched.
- Excluding is orthogonal to Classification: status, Expense type, Override, and Free-cap
  counting are all preserved, so exclusion is cleanly reversible and cannot be used to
  reclaim Free-cap quota.
- v1 is entirely manual — no auto-detection or suggestion.
- Re-including is a fresh state, not an undo: excluding a credit clears its income mark, and
  re-including returns the row to the default credit state (unmarked, counting for nothing) rather
  than restoring a prior income mark. We store no prior state, a debit has no analogous mark to
  restore, and for a credit the math outcome is identical either way (an unmarked credit already
  counts for nothing). A Member who re-includes a credit they had marked as income must re-mark it.
