# Savings gap: compare inferred saving against observed net-worth change, never merge them

The holdings dashboard (built on ADR-0016 balance snapshots) adds a cross-data insight — the
**Savings gap**: what the Household *inferred* it saved in a period (flow — Monthly income −
Off-card fixed costs − net card debits, ADR-0007/0015) set against the *observed* change in
**Net worth** over the same period (stock — the delta of the latest balance snapshots). ADR-0007 and
ADR-0016 deliberately keep inferred saving and entered net worth on separate paths, so pairing them
is a deliberate — and, to a future reader, surprising — move worth recording.

**Decision:** surface the two figures side by side and treat their **gap** as a first-class signal
(the residual is untracked spending, cash movement, market gains/losses, or unlogged transfers), but
**compare only, never merge**. Entered balances never feed the inferred-savings math; the Savings
goal stays inferred (ADR-0007); and the gap is never written back into either figure, never becomes
a Transaction, and never counts as Savings-goal progress.

## Considered Options

- **Don't build it** — keep inferred saving and net worth strictly apart. Rejected: forgoes the
  single most valuable thing that having both stock (balances) and flow (spend/income) unlocks, and
  the gap is what nudges a Household toward better tracking.
- **Merge them** — treat the net-worth delta as "actual" savings and drive the Savings goal off it.
  Rejected: breaks ADR-0007's inferred-progress invariant and makes goal progress hostage to
  sporadically, manually entered balances (staleness would masquerade as under/over-saving).
- **Compare only (chosen)** — show both and their gap as a diagnostic, with the two calculations
  kept on their existing separate paths.

## Consequences

- The gap is **diagnostic, not authoritative**: never persisted, never a Transaction, never
  Savings-goal progress; it only ever reads the two independently-computed figures.
- **Period alignment is approximate.** Manual balances arrive irregularly (a soft ~monthly nudge),
  so the insight aligns the net-worth delta to Statement-cycle boundaries by nearest snapshot and
  shows each figure's "as of" date; a stale or missing snapshot **caveats** the gap rather than
  hiding it or blocking the tile.
- **Naming is deliberate.** "Savings gap" avoids the reserved *reconcile/reconciliation* (the
  net-summary math invariant, CONTEXT.md) and the per-Account *balance check* (#98,
  `lib/dashboard/balance-check.ts`) — those name different things and must not be conflated.
