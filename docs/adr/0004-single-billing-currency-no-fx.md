# Single billing-currency, no FX engine in v1

Statements show a foreign *original* amount for foreign purchases, but the card **bills in one currency** — the bank already converted, so every row carries a charged amount in the Account's billing currency (e.g. `CONVEX -10,21 USD` settles as `-1.323 kr.`). That charged amount is the **sole source of truth** for all net math; the original foreign amount is stored display-only and never summed. v1 assumes **one billing currency per Household** (no cross-currency accounts).

## Consequences

- No FX engine — no historical rate source, no rate caching, no base-currency conversion. This is deliberate; do not "fix" it by summing mixed currencies.
- A Household with Accounts billing in *different* currencies is unsupported until FX is added. If that demand appears, it reopens this decision.
