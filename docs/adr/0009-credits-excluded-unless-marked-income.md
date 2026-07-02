# Credits count for nothing unless manually marked as income

Every positive transaction (`amount > 0`) is **excluded from all calculations** — Income,
Difference, spend series, net summary — unless a Member manually marks it as income. A credit on a
card is almost never revenue: it is an inter-account transfer (e.g. moving 100K ISK from a bank
account onto the credit card), a card-bill payment, or a refund. Summing them as "Money in"
(ADR-0008) was honest labeling of a misleading number; this decision removes the number instead.

Mechanics: `transactions.income_marked` (boolean, default `false`, DB CHECK credits-only). The
transactions list shows an inline **Income** checkbox on credit rows (replacing the expense-type
control, which never applied to credits); `PUT`/`DELETE /api/transactions/:id/income` toggles it.
The former "Money in" surfaces (hero secondary line, 12-month trend overlay, net summary) now read
**Income** and sum only marked credits; `Difference = Income − Spending`.

## Considered Options

- **Transfer detection** (the deferred true-P&L plan, issue #97) — match a funding-account debit to
  the card credit automatically. Deferred, not replaced: matching is the largest build in the plan,
  and a manual default-exclude flag is a correct v1 that detection can later pre-fill.
- **Keep summing all credits as Money in** (ADR-0008 status quo) — rejected: even honestly labeled,
  a transfer-dominated number misleads, and it made Difference useless.
- **Classify credits via the AI pipeline** — rejected: income vs transfer is not inferable from a
  merchant string alone, and a wrong guess silently corrupts net; manual marking is explicit and
  rare (a salary line or two per cycle).

## Consequences

- Income/Difference are zero until a user marks credits — accurate, and a nudge to mark real income.
- Savings math is untouched (it already ignored all positive card lines, ADR-0007).
- Amends ADR-0008's "Money in" labeling: the all-credits sum no longer appears anywhere.
- Transfer detection (issue #97) becomes an enhancement that pre-fills/suggests marks rather than a
  prerequisite for a meaningful net.
