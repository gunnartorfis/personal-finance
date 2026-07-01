# Dashboard leads with Spending; credits are "Money in", not income

The dashboard's hero metric is **Spending** (total debits over a period), not "net profit/loss".
Card credits (`amount > 0`) are labeled **Money in** and shown as a secondary line, with
**Difference** (`Money in − Spending`) below it — because for a cards-focused product credits are
mostly refunds, card-bill payments, and inter-account transfers, so they are *not* true household
income and the "net" they produce is near-zero or misleading.

The dashboard intentionally does **not** net Spending against the savings feature's configured
**Monthly income** (ADR-0007): that anchor is off-card and its schema is still landing, and coupling
the two would double-count a bank **Account** whose salary shows up as card-side credits. Wiring
Difference to a true net (Monthly income − Spending, with transfer detection) is deferred (see
`docs/backlog.md` → "Deferred — true P&L").

## Considered Options

- **Net against Monthly income now** — reuse the savings anchor so Difference becomes a real net.
  Rejected for now: schema unmerged, and it double-counts salary-bearing bank Accounts without
  transfer detection.
- **Build transfer detection** — match card-bill payments / inter-account moves and exclude them
  from Money in, Spending, category totals, and baselines. Rejected for now: the largest build in
  the plan; its own project.
- **Keep "net profit/loss"** — minimal change, only relabel Income→Credits. Rejected: "profit"
  overclaims for cards-only households and stays misleading.

## Consequences

- The dashboard is honest without new infrastructure, and Spending (the actionable signal for a
  cards household) is front and center.
- "Difference" must never be presented as profit until the deferred work lands.
- Category totals can double-count in multi-account households (a card charge classified on the
  card, and the funding-account payment classified again) — an accepted, documented limitation
  until transfer detection ships.
