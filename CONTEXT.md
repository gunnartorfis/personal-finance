# Finance

A hosted product where a household uploads their credit-card statements, has each
transaction classified by spending type, and tracks combined household spending
(money-in vs money-out) over time.

## Language

**Household**:
The tenant boundary — a couple or family sharing one financial picture; all financial data is owned by a Household, never an individual.
_Avoid_: Account, Organization, Team, Workspace

**Member**:
A signed-in user who belongs to a Household.
_Avoid_: User (when the household-scoped meaning matters)

**Account**:
A card or bank account within a Household that Transactions belong to (e.g. "my Visa", "their Mastercard") — the provenance label, required on every Transaction.
_Avoid_: Card (when a non-card account is possible)

**Upload**:
One CSV import into a Household: the file, its column mapping, the importing Member, and the Account the rows belong to.
_Avoid_: Import, Batch, Statement

**Transaction**:
One line from an Upload: date, merchant, the charged amount (in the Account's billing currency), Account, optional source category, and optional original amount+currency.

**Billing currency**:
The currency an Account is charged in; the charged amount is the single source of truth for all net math. v1 assumes one billing currency per Household (no FX).
_Avoid_: Base currency, Display currency

**Original amount**:
The pre-conversion foreign amount on a Transaction (e.g. `-10,21 USD`), shown for context only — never summed into net.

**Spending**:
A period's total expenses (debits, `amount < 0`), shown as a positive magnitude — the dashboard's hero metric and primary signal.
_Avoid_: Expenses (as a headline), Costs

**Money in**:
A period's total card credits (`amount > 0`) — the honest label for what code once called "income". NOT true household income: it is mostly refunds, card-bill payments, and inter-account transfers. Distinct from the savings anchor **Monthly income** (off-card, configured); never sum the two.
_Avoid_: Income, Revenue, Earnings

**Difference**:
`Money in − Spending` for a period — the honest replacement for "net profit/loss" on the dashboard. Not true P&L; the dashboard intentionally does NOT (yet) net against configured **Monthly income** (ADR-0008).
_Avoid_: Net profit, Net loss, Net (unqualified), Cash flow

**Expense type**:
The spending bucket assigned to a Transaction — `Fixed`, `Necessary`, `Nice to have`, or `""` (not bucketed: credits and shared/split payments).
_Avoid_: Category (reserved for the merchant-supplied category on the raw row)

**Classification**:
Assigning an Expense type (+ confidence + reasoning) to a Transaction, done server-side by Claude.

**Override**:
A Member's manual change to a single Transaction's Expense type; takes precedence over the classified type.

**Merchant rule**:
A household-level mapping from a (normalized) merchant to an Expense type, applied deterministically before AI classification. Flat (`merchant → type`) or split by an optional amount threshold (`merchant, ≥ X → type A, else → type B`, e.g. gym membership vs incidental). Matching is normalized (uppercase, trimmed, store-number/location stripped).

**Statement cycle**:
The dashboard's and transactions view's time bucket — **one calendar month**, identified by its `YYYY-MM` key, bucketing every Account by transaction date. (A configurable per-Household cutoff day — e.g. 27th–26th — is a deferred aspiration, not yet built; `lib/dashboard/cycle.ts` assumes the 1st.)
_Avoid_: Billing cycle, Billing period, Month (informally)

**Plan**:
A Household's subscription level: `Free` (first 50 distinct classified Transactions, lifetime) or `Premium` (classification up to ~25k/month fair-use). 1990 ISK/month, or annually at 30% off, via Straumur/Adyen.

**Free cap**:
The 50-classified-Transaction lifetime limit on a Free Household; reaching it pauses AI **Classification** only — Uploads, dashboard, **Overrides**, and net tracking stay fully usable, and pending rows classify on upgrade.

### Savings goals

**Savings goal**:
A Household's target to accumulate a set amount by a target date (e.g. 5,000,000 ISK for a wedding), tracking progress by inference rather than an entered balance. One active goal per Household (v1).
_Avoid_: Budget, Plan (Plan is the subscription level)

**Monthly income**:
The Household's configured combined net recurring monthly income from all sources (salaries, rental income, …), deposited off-card; the anchor for all savings math. NOT derived from card credits. A per-cycle one-off extra (e.g. a bonus, tax refund, wedding gift) may be added to a single cycle.
_Avoid_: Take-home, Salary (exclude rental and multi-earner income), bare "Income" (collides with the dashboard's card-credit income)

**Off-card fixed cost**:
A recurring monthly outflow that does NOT appear on the uploaded cards (rent, mortgage, loan payments), configured per Household and subtracted from Monthly income. Disjoint from the card-side `Fixed` Expense type.
_Avoid_: Fixed expense (collides with the `Fixed` Expense type)

**Inferred saving**:
What a Household saved in a Statement cycle — computed, not observed: Monthly income − Off-card fixed costs − net card debits for the cycle (positive card lines ignored).
_Avoid_: Savings balance (implies an entered figure; we infer)

**Required saving**:
The per-cycle amount needed to stay on pace: (target − saved so far) ÷ Statement cycles remaining until the target date, recomputed at each Check-in — so falling behind raises next cycle's Required saving.

**Allowed nice-to-have**:
The discretionary budget for the coming cycle that still hits the goal: Monthly income − Off-card fixed costs − Required saving − expected `Fixed` − expected `Necessary` card spend.
_Avoid_: Budget

**Check-in**:
A recorded, roughly-monthly action: after uploading a cycle's Transactions it FREEZES that cycle's Monthly income, Off-card fixed costs, card spend and Inferred saving into a snapshot, compares cumulative Inferred saving against cumulative Required saving to report On track / behind, and states the next cycle's Allowed nice-to-have. Later config edits change only future cycles, never a recorded Check-in.
_Avoid_: Review, Report

**On track**:
Cumulative Inferred saving to date ≥ cumulative Required saving to date.

## Relationships

- A **Household** has one or more **Members**; one Household per Member (v1). All Members are equal — any can upload, edit, manage the subscription, invite/remove Members, or delete the Household. A Member who leaves loses access; the Household's data stays with the rest.
- A **Household** owns its **Transactions**, **Overrides**, and income/net config.
- A **Member** uploads **Transactions** (recorded as provenance); visibility is household-wide.
- A **Transaction**'s effective Expense type follows a precedence: manual **Override** > **Merchant rule** > AI **Classification**.
- A **Household** has zero or more **Merchant rules**; adding one (re-)types all matching Transactions except those with a manual **Override**, and applies to future Uploads.
- A **Household** has zero or one active **Savings goal** (v1), plus its **Monthly income** and **Off-card fixed cost** config.
- **Inferred saving** for a **Statement cycle** = **Monthly income** − **Off-card fixed costs** − net card debits (the cycle's **Transactions** with a negative amount; positive lines ignored).
- **Required saving** derives from the **Savings goal** (remaining ÷ cycles left) and rises when the Household is behind.
- A **Check-in** compares cumulative **Inferred saving** vs **Required saving** and yields the next cycle's **Allowed nice-to-have**.

## Flagged ambiguities

- "billing" is overloaded: **Statement cycle** (credit-card statement window, the dashboard time axis) vs. subscription/payment billing (the free/premium plan). Use "Statement cycle" for the former; reserve "billing" for payments. The existing `shared/billing.ts` computes the **Statement cycle** despite its name.
- "category" vs **Expense type**: the raw row's merchant category (`Tegund`) is an input hint; the assigned bucket is the **Expense type**. Don't conflate.
- "income" is two things: the dashboard's **Money in** (card credits — refunds, card-bill payments, transfers) vs configured **Monthly income** (the off-card savings anchor). Never sum them. Resolution: **Inferred saving** counts only card DEBITS (negative amounts) as spend and ignores all positive card lines — so a bank-account **Account** with salary credits cannot double-count with **Monthly income** (refunds are also ignored; accepted v1 simplification). The dashboard leads with **Spending** and shows **Money in** / **Difference** honestly; wiring **Difference** to **Monthly income** for a true net is deferred (ADR-0008).
- "savings" is **Inferred saving** (computed from spend), never an entered balance — chosen over a tracked-balance model.
