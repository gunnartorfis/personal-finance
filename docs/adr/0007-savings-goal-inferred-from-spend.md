# Savings goals track progress by inference, not an entered balance

A Household can set a **Savings goal** (a target amount by a target date, e.g. 5M ISK for a wedding) and check in ~monthly to see if it is on track and how much discretionary (`Nice to have`) spend it can still afford. We track progress by **inference**: each Statement cycle's saved amount is *computed* — configured **Monthly income** − **Off-card fixed costs** − net card debits — never an entered savings-account balance. This reuses the existing classifier/net pipeline (the card upload is the measurement) and matches the product's "upload statements, then check in" flow. Each **Check-in** freezes that cycle's inputs into a snapshot, so later config edits (a raise, a new loan) change only future cycles, not recorded history.

## Considered Options

- **Tracked balance** — user enters the actual wedding-fund balance each check-in. Most truthful, but a second source of truth to maintain and it decouples the goal from the card data the product is built on.
- **Hybrid** — infer, but let the user overwrite with a real balance. Two reconciling sources of truth; deferred.

## Consequences

- **Accepted blind spot:** spend that never hits the uploaded cards (cash, debit, off-card transfers other than the configured fixed costs) is invisible, so **Inferred saving is overstated** when it occurs. Documented as a v1 limitation.
- To avoid double-counting income, the savings math counts only card **debits** as spend and **ignores all positive card lines** (so a bank-account upload's salary credit can't inflate savings; refunds are also ignored).
- On-track is judged against the goal's original linear pace; the corrective forward pace (and **Allowed nice-to-have**) recomputes each check-in, rising when behind.
- Requires new household-scoped tables (goal, income sources, off-card costs, check-in snapshots); no bank-balance entry surface is built.
