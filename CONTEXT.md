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

**Locale**:
A Member's chosen language *and* regional formatting rules — `is` (Icelandic, the default) or `en` (English). Per-Member (a mixed-language Household is allowed), stored on the member row and mirrored to a cookie; drives both UI text (via message catalogs) and all number/date formatting. A logged-out visitor's Locale is resolved by: `NEXT_LOCALE` cookie → Vercel geolocation (country `IS` → `is`) → `Accept-Language` → `is`.
_Avoid_: Language (elides the formatting half), Region, Culture

**Invite**:
A pending, email-addressed offer to join an existing Household as a Member. Created by a Member of a **Premium** Household, redeemed by the invitee when signed in with the matching email; on redemption a new Member row is added to the *existing* Household (never a new one). A user who already belongs to a Household must leave it before redeeming (one Household per Member, v1). Expires if unredeemed.
_Avoid_: Membership request (the invitee doesn't request; the Household offers), Seat

**Account**:
A card or bank account within a Household that Transactions belong to (e.g. "my Visa", "their Mastercard") — the provenance label, required on every Transaction.
_Avoid_: Card (when a non-card account is possible)

**Upload**:
One CSV import into a Household: the file, its column mapping, the importing Member, and the Account the rows belong to.
_Avoid_: Import, Batch, Statement

**Transaction**:
One financial line belonging to an Account: date, merchant, the charged amount (in the Account's billing currency), Account, optional source category, and optional original amount+currency. Enters the Household one of two ways — a CSV **Upload** or a bank **Sync** — the source is recorded but the shape is identical.

**Bank connection**:
A Household's authorized link to one bank (via the aggregator), from which its Accounts are discovered and their Transactions are Synced. Holds the consent and its expiry; can lapse (needing reconnect) without losing history. Premium-only.
_Avoid_: Integration, Link (as a noun), Aggregator (that's the upstream provider, not the Household's link)

**Sync**:
Pulling a Bank connection's latest Transactions from the aggregator and dedup-inserting them. The **initial Sync** (right after linking, and on the first cron pass) backfills a long history window; every later Sync is **incremental** from the last sync point. Idempotent — an overlapping window never duplicates. Runs on a daily schedule and immediately on first linking.
_Avoid_: Import (reserved for Upload), Refresh, Fetch

**Billing currency**:
The currency an Account is charged in; the charged amount is the single source of truth for all net math. v1 assumes one billing currency per Household (no FX).
_Avoid_: Base currency, Display currency

**Original amount**:
The pre-conversion foreign amount on a Transaction (e.g. `-10,21 USD`), shown for context only — never summed into net.

**Spending**:
A period's total expenses (debits, `amount < 0`), shown as a positive magnitude — the dashboard's hero metric and primary signal. In the *presentations* that mirror income (the trend and the Transactions overview) the configured **Off-card fixed costs** in force that cycle are folded in on top of the card debits (ADR-0015), so spend and income stay symmetric; in the Transactions overview those off-card costs land in the **Fixed** expense-type bucket. The Savings/**Inferred saving** math keeps card debits and **Off-card fixed costs** on separate paths — do NOT double-count.
_Avoid_: Expenses (as a headline), Costs

**Income (marked)**:
A period's credits (`amount > 0`) that a Member manually marked as real income (ADR-0009). An UNMARKED credit — a refund, card-bill payment, or inter-account transfer — counts for nothing in any calculation. Replaces the former **Money in** (which summed ALL credits). Distinct from the savings anchor **Monthly income** (off-card, configured); never sum the two. Mutually exclusive with **Excluded** on the same row.
_Avoid_: Money in (pre-ADR-0009 all-credits sum), Revenue, Earnings

**Excluded**:
A Transaction a Member manually dropped from every calculation — it is neither **Spending** nor **Income (marked)**, contributes nothing to net math, spend series, expense-type buckets, or savings. For a debit this is the only way out of **Spending** (debits otherwise always count); for a credit it is redundant with the ADR-0009 default but records the intent explicitly (e.g. flagging both legs of a reimbursement). A Member excludes a Transaction when it is not true household spending — reimbursed by someone else, a mistaken charge, or a cost fronted for another party (the "grandma's vacuum" case: buy a vacuum, she transfers the money back next day). Any Transaction regardless of sign can be Excluded; mutually exclusive with **Income (marked)** (a row is exactly one of: counts as Spending / counts as Income / Excluded). When the Household bears *part* of a debit rather than none, that is a **Shared expense** (a nonzero **Own share**), not Excluded — Excluded is the share-of-zero limit.
_Avoid_: Reconciled, Afstemt (imply matching/pairing — this is a per-Transaction flag, not a link), Voided (implies deletion/reversal — the row is kept, only dropped from math), Reimbursed (too narrow — only one reason among several)

**Shared expense**:
A debit Transaction the Household only partly bears because it fronted the rest for other parties (e.g. one card charge for a group gift split across several couples). Only the Household's **Own share** counts as **Spending**; the remainder behaves like the fronted-for-others part of **Excluded** — it drops from all math. A generalisation of **Excluded**, which is the degenerate case of a share of zero. The incoming paybacks from the other parties need no handling: as unmarked credits they already count for nothing (ADR-0009), so nothing double-counts.
_Avoid_: Split (a verb only, and implies breaking one row into many — the row is never split; only its effective magnitude shrinks), Group expense, Shared cost (collides with **Off-card fixed cost**)

**Own share**:
The portion of a **Shared expense** that counts as the Household's **Spending** — a negative amount whose magnitude is at least one unit and strictly less than the charged **amount** (a share equal to the whole charge is no split at all, and a share of zero is **Excluded**). Everywhere net math would use the charged amount for such a Transaction it uses Own share instead; the difference (amount − Own share) counts for nothing, exactly as if **Excluded**. Never mutates the charged **amount**, which stays the append-only source of truth (ADR-0003/0004).
_Avoid_: Split amount, My part, Portion (unqualified)

**Difference**:
`Income (marked) − Spending` for a period. Not true P&L; the dashboard intentionally does NOT net against configured **Monthly income** (ADR-0008).
_Avoid_: Net profit, Net loss, Net (unqualified), Cash flow

**Expense type**:
The spending bucket assigned to a Transaction — `Fixed`, `Necessary`, `Nice to have`, or `""` (not bucketed: credits). A **Shared expense** is bucketed like any debit; only its **Own share** magnitude lands in the bucket.
_Avoid_: Category (reserved for the merchant-supplied category on the raw row)

**Classification**:
Assigning an Expense type (+ confidence + reasoning) to a Transaction, done server-side by Claude. A Classification may be produced by a fresh model call or **reused** from the Household's own prior Classifications of the same merchant (see **Classification reuse**) — either way the result is a Classification, at the same precedence level, and still counts against the **Free cap**.

**Classification reuse**:
Skipping the model by reusing the Expense type the Household's own prior Classifications gave the same merchant. Draws only on AI **Classification** results — never on **Overrides** or **Merchant rules** (those keep their own precedence; the intended way to propagate a correction across rows is still a **Merchant rule**). Because it is only ever another **Classification**, reuse never changes a Transaction's effective type precedence and cannot fill a merchant covered by a Merchant rule or an Override. Distinct from a **Merchant rule**: a rule is an explicit, user-authored, deterministic mapping; reuse is implicit and derived from what the model already decided.
_Avoid_: Cache (as a user-facing term), Merchant rule (reuse is not user-authored)

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

**Activity log**:
The Household's append-only record of Member actions — who did what, when: Transaction edits (**Override**, **Excluded**, **Income (marked)**, **Own share**), **Uploads**, **Account** and **Merchant rule** changes, **Invites** and membership changes, savings/budget config changes, billing actions, data export, and data reset. Member-facing: every Member sees the whole log. Records people only — system work (**Sync** runs, AI **Classification**) is not logged. Survives a data reset (the reset itself is a logged action) and outlives a departed Member (their entries stay attributed to them); removed only when the Household itself is deleted.
_Avoid_: Audit log (implies compliance/forensics and auth events this doesn't record), History, Activity (unqualified — see ambiguity note)

### Savings goals

**Savings goal**:
A Household's target to accumulate a set amount by a target date (e.g. 5,000,000 ISK for a wedding), tracking progress by inference rather than an entered balance. One active goal per Household (v1).
_Avoid_: Budget, Plan (Plan is the subscription level)

**Monthly income**:
The Household's combined net recurring income (salaries, rental income, …), deposited off-card; the anchor for all savings math. NOT derived from card credits. **Time-varying**: a change (a raise, a new job) is recorded with an **Effective cycle**, and each Statement cycle's savings math uses the amounts in force *that* cycle — so correcting a past cycle re-flows through **Inferred saving** (no frozen history, ADR-0007). A single cycle may also carry a **One-off adjustment**.
_Avoid_: Take-home, Salary (excludes rental and multi-earner income), bare "Income" (collides with the dashboard's card-credit income), treating it as one flat figure (the pre-ADR-0015 model)

**Off-card fixed cost**:
A recurring monthly outflow that does NOT appear on the uploaded cards (rent, mortgage, loan payments), configured per Household and subtracted from Monthly income. **Time-varying** exactly like Monthly income — a change (rent rises, a loan is cleared) carries an **Effective cycle**, and a single cycle may carry a **One-off adjustment** (e.g. an annual insurance bill). Disjoint from the card-side `Fixed` Expense type.
_Avoid_: Fixed expense (collides with the `Fixed` Expense type)

**Effective cycle**:
The Statement-cycle key (`YYYY-MM`) from which a recurring **Monthly income** or **Off-card fixed cost** amount applies, staying in force until a later change supersedes it. Every cycle from the **Savings goal**'s start onward is covered: the earliest amounts are the baseline (effective from the goal's start cycle), and a change adds a later-effective amount. An amount can step to zero (a job ends, a loan is cleared).
_Avoid_: Start date (reserved for the Savings goal), Version

**One-off adjustment**:
A non-recurring, single-cycle income addition or cost — a bonus, tax refund, or wedding gift (income); an annual insurance bill (cost) — additive to that cycle's recurring base and affecting only that cycle's **Inferred saving** (and, when it lands on the current cycle, its **Allowed nice-to-have**). Never carries forward. Replaces the earlier unbuilt "per-cycle one-off extra" note.
_Avoid_: Recurring change (that is an Effective-cycle amount), Transaction (this is off-card, never a card line)

**Inferred saving**:
What a Household saved in a Statement cycle — computed, not observed: Monthly income − Off-card fixed costs − net card debits for the cycle (positive card lines ignored). Only **completed** cycles count toward cumulative saved; the **current** (in-progress) cycle is excluded until its calendar month closes, because mid-month it carries full income against near-zero spend and would overstate savings. The current cycle is instead the one being budgeted (see **Allowed nice-to-have**).
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
Cumulative Inferred saving to date ≥ cumulative Required saving to date, where "to date" means through the last **completed** cycle (the current in-progress cycle counts toward neither side).

## Relationships

- A **Member** has one **Locale** (their own, not the Household's); two Members of one Household may differ.
- A **Household** has one or more **Members**; one Household per Member (v1). All Members are equal — any can upload, edit, manage the subscription, invite/remove Members, or delete the Household. A Member who leaves loses access; the Household's data stays with the rest.
- A **Household** grows only by **Invite**: any Member of a **Premium** Household may invite by email, up to a cap (10 Members incl. pending Invites). Redeeming adds a Member to that same Household; it never creates or merges Households, and carries no classification budget of its own (the joined Household's Plan governs). A user with an existing Household must leave it first — joining a second is rejected, not auto-resolved.
- A **Household** owns its **Transactions**, **Overrides**, and income/net config.
- A **Household** owns one **Activity log**; every Member reads all of it; entries are never edited or removed while the Household exists (a data reset clears financial data but not the log).
- A **Member** uploads **Transactions** (recorded as provenance); visibility is household-wide.
- A **Transaction**'s effective Expense type follows a precedence: manual **Override** > **Merchant rule** > AI **Classification**.
- A **Transaction** is in exactly one net state: counts as **Spending** (a debit, default), counts as **Income (marked)** (a credit a Member marked), or **Excluded** (any Transaction a Member dropped from all math). **Excluded** and **Income (marked)** are mutually exclusive.
- A **Spending** debit may be a **Shared expense**: only its **Own share** counts, the rest drops like **Excluded**. This is a modifier on a Spending row, not a fourth net state; mutually exclusive with **Excluded** (excluding clears the share) and inapplicable to credits. **Own share** substitutes for the charged **amount** in all spend/bucket/savings math, but never in classification, **Merchant rule** matching (incl. the split threshold), or the displayed charge — those read the true **amount** (ADR-0014).
- A **Household** has zero or more **Merchant rules**; adding one (re-)types all matching Transactions except those with a manual **Override**, and applies to future Uploads.
- A **Household** has zero or one active **Savings goal** (v1), plus its **Monthly income** and **Off-card fixed cost** config.
- **Inferred saving** for a **Statement cycle** = **Monthly income** − **Off-card fixed costs** − net card debits (the cycle's **Transactions** with a negative amount; positive lines ignored).
- **Required saving** derives from the **Savings goal** (remaining ÷ cycles left) and rises when the Household is behind.
- A **Check-in** compares cumulative **Inferred saving** vs **Required saving** and yields the next cycle's **Allowed nice-to-have**.

## Flagged ambiguities

- "billing" is overloaded: **Statement cycle** (credit-card statement window, the dashboard time axis) vs. subscription/payment billing (the free/premium plan). Use "Statement cycle" for the former; reserve "billing" for payments. The existing `shared/billing.ts` computes the **Statement cycle** despite its name.
- "category" vs **Expense type**: the raw row's merchant category (`Tegund`) is an input hint; the assigned bucket is the **Expense type**. Don't conflate.
- "income" is two things: **Income (marked)** (credits a Member marked as real income; all other credits count for nothing — ADR-0009) vs configured **Monthly income** (the effective-dated off-card savings anchor — ADR-0015). They stay distinct in storage and in the Savings math (which reads **Monthly income** on its own path and ignores all positive card lines, so a salary-crediting **Account** cannot double-count). But the **Income** *presentation* on the trend and the Transactions overview sums the two — configured **Monthly income** in force that cycle plus the cycle's **Income (marked)** — so the figure reflects real revenues even with no marked credit. Symmetrically, those same two surfaces fold configured **Off-card fixed costs** into their **Spending** figure (see **Spending**), keeping both sides of the presentation off-card-aware. Rule: never sum these into the *Savings* math; the presentations deliberately combine them. Do NOT also feed configured income/costs through the Savings/**Inferred saving** path a second time.
- "savings" is **Inferred saving** (computed from spend), never an entered balance — chosen over a tracked-balance model. Cumulative saving counts only **completed** cycles; the current in-progress cycle is excluded until its month closes (it would otherwise show full income against near-zero spend), and is instead the cycle being budgeted (ADR-0014, updating ADR-0007).
- "language" vs **Locale**: the product setting is a **Locale** (`is`/`en`) — it governs both translated text and number/date formatting together, not just words. Reserve "language" for informal use. AI **Classification** `reasoning` is Household-shared data generated once, so it is NOT localized (v1): it stays English and is shown as-is in both UIs (dynamic data, exempt from catalogs/lint). An Icelandic-UI Member seeing English reasoning is an accepted v1 limitation.
- "activity" is overloaded: the **Activity log** (the member-facing record of Member actions) vs the internal "has this Household been used?" usage signal in `lib/household/activity.ts` (drives the invite-switch warning, ADR-0010). Say "Activity log" for the former and "usage signal" for the latter; never bare "activity".
- "reconcile"/"afstemma" is NOT a domain term here: the user-facing gesture of cancelling out a reimbursed purchase is modelled as a per-Transaction **Excluded** flag, not a link between two rows. "reconciliation" already names an internal math invariant in `lib/dashboard/net-summary.ts` (`sum(byExpenseType) + unclassified === expense`); do not reuse it for the Excluded feature. Pairing/matching a debit to its funding credit stays deferred (transfer detection, issue #97).
