# Finance

A hosted product where a household uploads their credit-card statements, has each
transaction classified by spending type, and tracks combined net profit/loss.

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
The dashboard's time bucket — a window defined by the Household's configurable cutoff day (default 1 = calendar month; e.g. 27 → 27th–26th), applied uniformly to every Account by transaction date.
_Avoid_: Billing cycle, Billing period, Month

**Plan**:
A Household's subscription level: `Free` (first 50 distinct classified Transactions, lifetime) or `Premium` (classification up to ~25k/month fair-use). 1990 ISK/month, or annually at 30% off, via Straumur/Adyen.

**Free cap**:
The 50-classified-Transaction lifetime limit on a Free Household; reaching it pauses AI **Classification** only — Uploads, dashboard, **Overrides**, and net tracking stay fully usable, and pending rows classify on upgrade.

## Relationships

- A **Household** has one or more **Members**; one Household per Member (v1). All Members are equal — any can upload, edit, manage the subscription, invite/remove Members, or delete the Household. A Member who leaves loses access; the Household's data stays with the rest.
- A **Household** owns its **Transactions**, **Overrides**, and income/net config.
- A **Member** uploads **Transactions** (recorded as provenance); visibility is household-wide.
- A **Transaction**'s effective Expense type follows a precedence: manual **Override** > **Merchant rule** > AI **Classification**.
- A **Household** has zero or more **Merchant rules**; adding one (re-)types all matching Transactions except those with a manual **Override**, and applies to future Uploads.

## Flagged ambiguities

- "billing" is overloaded: **Statement cycle** (credit-card statement window, the dashboard time axis) vs. subscription/payment billing (the free/premium plan). Use "Statement cycle" for the former; reserve "billing" for payments. The existing `shared/billing.ts` computes the **Statement cycle** despite its name.
- "category" vs **Expense type**: the raw row's merchant category (`Tegund`) is an input hint; the assigned bucket is the **Expense type**. Don't conflate.
