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
A named money location within a Household — a card, a bank account, or an external asset holding (investments, physical cash). Two roles, not mutually exclusive: the **provenance** a Transaction belongs to, and/or the subject of a **Balance** for **Net worth**. An Account may carry Transactions, a Balance, or both; a **balance-only Account** (e.g. "InteractiveBrokers", "Cash") holds no Transactions and exists purely to contribute to Net worth.
_Avoid_: Card (a non-card account is possible); treating "every Transaction belongs to an Account" as "every Account has Transactions" (balance-only Accounts have none)

**Upload**:
One CSV import into a Household: the file, its column mapping, the importing Member, and the Account the rows belong to.
_Avoid_: Import, Batch, Statement

**Column mapping**:
The assignment of a file's columns to the roles a Transaction needs — `date`, `amount`, `merchant`, and optional `category` — so an arbitrary bank export becomes an Upload's rows. Each role binds to exactly one column, and `amount` must be a single signed column (a file with separate debit/credit columns is unsupported in v1). A mapping is derived one of three ways, in precedence order: a **Remembered mapping**, then header heuristics, then an AI suggestion. A confident mapping (Remembered or heuristic-complete) with new rows auto-commits silently; an uncertain one — an AI suggestion or a column left unmatched — or a file that adds zero new rows stops for a Member to confirm, correct, or acknowledge first (see **Import preview**).
_Avoid_: Schema, Header map, Field mapping (drifts toward implementation)

**Remembered mapping**:
A Column mapping a Household has confirmed before, replayed automatically the next time a file of the same shape is uploaded — so a bank's format is taught once, then imports silently. Belongs to the file's shape, not to an Account, so two Accounts of the same bank share it. Degrades back to heuristics/AI if the bank later changes its columns.
_Avoid_: Template, Saved mapping, Preset

**Import preview**:
The pre-commit view of what an Upload *would* do — the parsed rows, the chosen Account, the Column mapping, and how many rows are new vs. already imported — shown so a Member can confirm or fix the mapping before anything is written. Transient (nothing is persisted until commit); surfaced only when there is a real decision — an unmapped column, a mapping that needed the AI fallback (AI involvement is itself the uncertainty signal, so it always stops for a human nod even when every role resolved), or a file that adds zero new rows — and skipped when the import is unambiguous (a heuristic-complete or **Remembered mapping** with new rows auto-commits).
_Avoid_: Draft, Staged import (nothing is stored pre-commit), Dry run (internal term, not user-facing)

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
The **discretionary** bucket assigned to a Transaction — `Fixed`, `Necessary`, `Nice to have`, or `""` (not bucketed: credits). Answers *how essential* the spend is, and is the axis the savings inference (ADR-0007) and budgets run on. Orthogonal to **Category** (which answers *what was bought*). A **Shared expense** is bucketed like any debit; only its **Own share** magnitude lands in the bucket.
_Avoid_: Category (a distinct, orthogonal axis — see **Category**); Raw category (the untyped merchant hint)

**Category**:
The **semantic** bucket assigned to a Transaction — *what was bought* (Groceries, Transport, Entertainment…), a **two-level** taxonomy of **Category groups** → **Subcategories**. A Transaction attaches to one leaf **Subcategory**; the parent **Category group** is a dashboard rollup. Orthogonal to **Expense type**: a Category carries a *default* Expense type used only as a fallback hint, never as a binding — the two are assigned and overridden independently. Seeded per Household from a curated bilingual taxonomy the Household may prune (**hide**) or extend (**add** custom Subcategories); seed labels are localized, custom labels are user text (like merchant names). Assigned by the same precedence as Expense type — **Override** > **Merchant rule** > **Classification** — with the model emitting Category in the same call, so it never costs extra **Free cap**. Only spending (`Expenses`) categories exist; credits/transfers stay **uncategorized** (parallel to the `""` Expense type).
_Avoid_: Expense type (the orthogonal discretionary axis); Raw category; Tegund

**Raw category**:
The merchant-supplied category string on the imported row (Icelandic `Tegund`). A passive **input hint** to **Classification** only — never aggregated, displayed as a breakdown, or conflated with the first-class **Category**.
_Avoid_: Category (the first-class semantic axis)

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

**Assistant**:
A Premium-only, read-only conversational feature that answers natural-language questions about the Household's finances (e.g. "why was March higher?") by calling curated, household-scoped read tools backed by the existing dashboard math — so its figures obey the same net rules (ADR-0009/0011/0014/0015) and it never invents numbers. May offer light, data-grounded suggestions ("nice-to-have spend rose; trimming it helps your goal") but gives no external financial advice (hence not "Advisor"). Answers in the asking **Member**'s **Locale** — the one place AI-generated text follows Locale, unlike **Classification** `reasoning`. Conversations are **Household**-shared and organised as threads, each message attributed to the Member who asked; it writes no **Activity log** entry (read-only) and its history is cleared by a data reset (unlike the Activity log).
_Avoid_: Advisor (implies regulated advice), Chatbot, Agent (implies it acts/mutates), Insights (collides with the dashboard's computed metrics)

**Digest**:
A scheduled, automated, read-only email summarizing a just-closed **Statement cycle** for a Household — its **Spending**, **Income (marked)**, expense-type split, top movers, and (when a **Savings goal** exists) On track / behind plus the next cycle's **Allowed nice-to-have**. Sent one-per-**Member** in each Member's own **Locale** (identical household figures, per-member rendering); on by default (opt-out) with a one-click unsubscribe, and only to a Member with a verified email. Its body is a pure function of the dashboard view-model — **computed figures only, no AI prose** — so it obeys the same net rules (ADR-0009/0011/0014/0015) and never invents a number, with all text drawn from the message catalogs like the rest of the UI. Read-only in the strong sense: it never mutates household data, never creates a **Check-in**, and writes no **Activity log** entry. Available to Free and Premium alike. The v1 instance is the **Monthly digest**, fired by a monthly cron for the previous calendar month and skipped for a Household with no Transactions in that cycle (no empty digest; a late uploader simply misses that month).
_Avoid_: Insights (collides with the dashboard's computed metrics), Report (an avoid-term already reserved against Check-in), Newsletter (implies marketing), Notification (channel-neutral; push is deferred), Summary (too generic)

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

### Financial health (net worth)

**Financial health**:
The dashboard section (ADR-0016) answering three questions the Savings goal and cycle view don't: are we profitable, how much can we realistically save, will we survive. Two independently-degrading halves — a **flow** half from completed-cycle income & spend (savings rate, typical monthly saving, profit streak) and a **stock** half from **Balances** (**Net worth**, **Runway**). Each half hides until it has the data it needs.

**Balance** *(snapshot)*:
One observation of an **Account**'s value at a point in time, in whole billing-currency units. Append-only — never updated in place, so the full history is kept and a future bank-balance sync merely appends more. May be negative (an overdraft or card debt is real), though v1 records only assets. Entered manually today; an automatic bank-balance sync is the reserved future source.
_Avoid_: Savings (that is inferred from flow, not entered — see **Inferred saving**), Reconciled balance

**Net worth**:
The sum of the **latest Balance per Account** across the Household (ADR-0016); `null` until at least one Balance exists, and the newest snapshot per Account wins. A Balance may be negative in principle (an overdraft/card debt), so this is assets minus liabilities; v1 *usage* enters only assets (debts stay on the flow side as **Off-card fixed costs**). The dashboard surfaces this same total as **Holdings** — a presentation label, not a second calculation. Deliberately separate from **Savings goal** progress, which stays **inferred** — a Balance is Net worth, never savings-goal progress.
_Avoid_: Savings balance (savings is inferred), Wealth

**Holdings**:
The dashboard's user-facing label for **Net worth** — "what the Household owns" (investments, cash, bank). It is the **same calculation** (sum of the latest **Balance** per Account), **not** a separate assets-only filter: were a negative Balance ever entered it would lower Holdings exactly as it lowers Net worth, so the two can never diverge. v1 *usage* enters only assets, which is why the figure reads as pure holdings — the name is a presentation choice, not a different total.
_Avoid_: Assets under management, Portfolio (implies investments only), Net worth (when the user-facing "what we own" framing is meant)

**Runway**:
How many whole months **Net worth** covers the Household's **Monthly burn** if income stopped — `Net worth ÷ Monthly burn`, floored so it never overstates (ADR-0016). `null` when there is no Net worth, when burn is non-positive, or when cycle history is too thin to compute burn.

**Monthly burn**:
The trailing-average monthly outflow — recurring **Off-card fixed costs** plus card debits — i.e. the drain the Household would sustain if income stopped; the denominator of **Runway**. Distinct from **Spending** (burn is a trailing average and always folds in off-card costs).
_Avoid_: Spending (a single cycle's card-side figure), Expenses

## Relationships

- A **Member** has one **Locale** (their own, not the Household's); two Members of one Household may differ.
- A **Household** has one or more **Members**; one Household per Member (v1). All Members are equal — any can upload, edit, manage the subscription, invite/remove Members, or delete the Household. A Member who leaves loses access; the Household's data stays with the rest.
- A **Household** grows only by **Invite**: any Member of a **Premium** Household may invite by email, up to a cap (10 Members incl. pending Invites). Redeeming adds a Member to that same Household; it never creates or merges Households, and carries no classification budget of its own (the joined Household's Plan governs). A user with an existing Household must leave it first — joining a second is rejected, not auto-resolved.
- A **Household** owns its **Transactions**, **Overrides**, and income/net config.
- A **Household** owns one **Activity log**; every Member reads all of it; entries are never edited or removed while the Household exists (a data reset clears financial data but not the log).
- A **Household** (Premium only) has zero or more **Assistant** conversations; every Member reads all of them and each message is attributed to the asking Member. The Assistant is read-only — it never mutates household data and writes no Activity-log entry — and its conversations are cleared by a data reset.
- A **Household**'s verified-email **Members** each receive the **Digest** (one email each, in their own **Locale**) unless they have unsubscribed; the figures are the Household's, rendered per Member. Like the **Assistant**, the Digest is read-only — it computes from the dashboard view-model, mutates nothing, creates no **Check-in**, and writes no **Activity log** entry.
- A **Member** uploads **Transactions** (recorded as provenance); visibility is household-wide.
- A **Transaction**'s effective Expense type follows a precedence: manual **Override** > **Merchant rule** > AI **Classification**. Its effective **Category** follows the *same* precedence chain independently — the two axes are resolved separately, so an Override on one does not touch the other.
- A **Transaction** is in exactly one net state: counts as **Spending** (a debit, default), counts as **Income (marked)** (a credit a Member marked), or **Excluded** (any Transaction a Member dropped from all math). **Excluded** and **Income (marked)** are mutually exclusive.
- A **Spending** debit may be a **Shared expense**: only its **Own share** counts, the rest drops like **Excluded**. This is a modifier on a Spending row, not a fourth net state; mutually exclusive with **Excluded** (excluding clears the share) and inapplicable to credits. **Own share** substitutes for the charged **amount** in all spend/bucket/savings math, but never in classification, **Merchant rule** matching (incl. the split threshold), or the displayed charge — those read the true **amount** (ADR-0014).
- A **Household** has zero or more **Merchant rules**; adding one (re-)types all matching Transactions except those with a manual **Override**, and applies to future Uploads.
- A **Household** has zero or one active **Savings goal** (v1), plus its **Monthly income** and **Off-card fixed cost** config.
- **Inferred saving** for a **Statement cycle** = **Monthly income** − **Off-card fixed costs** − net card debits (the cycle's **Transactions** with a negative amount; positive lines ignored).
- **Required saving** derives from the **Savings goal** (remaining ÷ cycles left) and rises when the Household is behind.
- A **Check-in** compares cumulative **Inferred saving** vs **Required saving** and yields the next cycle's **Allowed nice-to-have**.
- A **Household** has zero or more **Balances** per **Account**; **Net worth** sums the latest per Account, **Holdings** is that same total relabeled for the dashboard (not a separate assets-only figure), and **Runway** = Net worth ÷ **Monthly burn**. Net worth is kept strictly separate from **Savings goal** progress (inferred, ADR-0007/0016) — an entered Balance never feeds the inferred-savings math.

## Flagged ambiguities

- "billing" is overloaded: **Statement cycle** (credit-card statement window, the dashboard time axis) vs. subscription/payment billing (the free/premium plan). Use "Statement cycle" for the former; reserve "billing" for payments. The existing `shared/billing.ts` computes the **Statement cycle** despite its name.
- Three things once collided under "category", now split by name: **Category** (first-class semantic axis, *what was bought*, aggregated) vs **Expense type** (discretionary axis, *how essential*, drives savings) vs **Raw category** (the untyped `Tegund` merchant hint, never aggregated). Never conflate the three.
- "income" is two things: **Income (marked)** (credits a Member marked as real income; all other credits count for nothing — ADR-0009) vs configured **Monthly income** (the effective-dated off-card savings anchor — ADR-0015). They stay distinct in storage and in the Savings math (which reads **Monthly income** on its own path and ignores all positive card lines, so a salary-crediting **Account** cannot double-count). But the **Income** *presentation* on the trend and the Transactions overview sums the two — configured **Monthly income** in force that cycle plus the cycle's **Income (marked)** — so the figure reflects real revenues even with no marked credit. Symmetrically, those same two surfaces fold configured **Off-card fixed costs** into their **Spending** figure (see **Spending**), keeping both sides of the presentation off-card-aware. Rule: never sum these into the *Savings* math; the presentations deliberately combine them. Do NOT also feed configured income/costs through the Savings/**Inferred saving** path a second time.
- "savings" is **Inferred saving** (computed from spend), never an entered balance — chosen over a tracked-balance model. Cumulative saving counts only **completed** cycles; the current in-progress cycle is excluded until its month closes (it would otherwise show full income against near-zero spend), and is instead the cycle being budgeted (ADR-0021, updating ADR-0007).
- "language" vs **Locale**: the product setting is a **Locale** (`is`/`en`) — it governs both translated text and number/date formatting together, not just words. Reserve "language" for informal use. AI **Classification** `reasoning` is Household-shared data generated once, so it is NOT localized (v1): it stays English and is shown as-is in both UIs (dynamic data, exempt from catalogs/lint). An Icelandic-UI Member seeing English reasoning is an accepted v1 limitation. The **Assistant** is the deliberate exception: its answers are conversational chrome and DO follow the asking Member's **Locale** (Icelandic member → Icelandic prose), making it the one place AI-generated text is localized.
- "activity" is overloaded: the **Activity log** (the member-facing record of Member actions) vs the internal "has this Household been used?" usage signal in `lib/household/activity.ts` (drives the invite-switch warning, ADR-0010). Say "Activity log" for the former and "usage signal" for the latter; never bare "activity".
- "reconcile"/"afstemma" is NOT a domain term here: the user-facing gesture of cancelling out a reimbursed purchase is modelled as a per-Transaction **Excluded** flag, not a link between two rows. "reconciliation" already names an internal math invariant in `lib/dashboard/net-summary.ts` (`sum(byExpenseType) + unclassified === expense`); do not reuse it for the Excluded feature. Pairing/matching a debit to its funding credit stays deferred (transfer detection, issue #97).
- Three money-*stock* ideas must not blur: **Net worth** and **Holdings** are one and the same entered-**Balance** total (Holdings is Net worth's dashboard label, never a separate assets-only figure), whereas **Inferred saving** is computed from *flow* and never entered. A Balance is **Net worth**, not **Savings goal** progress — the two are deliberately separate (ADR-0016). Never let an entered Balance leak into the inferred-savings math, and never call inferred saving a "balance".
- This glossary predated **ADR-0016**; the Financial-health / Net-worth cluster above was backfilled after the code shipped. If code and glossary ever disagree on balances/net worth, assume the glossary was the straggler and check ADR-0016.
