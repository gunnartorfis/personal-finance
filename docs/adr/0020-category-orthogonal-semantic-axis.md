---
status: proposed
---

# Category is a second, orthogonal axis — not more Expense types

Issue #105 asked for "custom Expense types / subcategories." We are **not** widening the
Expense type set. `Fixed | Necessary | Nice to have | ""` stays a **closed** enum: it is the
*discretionary* axis the savings inference (ADR-0007) and budgets run on, and Meniga-style
taxonomies carry no discretionary levels to seed it from (only a binary fixed flag). Instead we
add **Category** — a first-class *semantic* axis ("what was bought": Groceries, Transport,
Entertainment…), **orthogonal** to Expense type. This retires the old "category = the raw
`Tegund` hint" reservation; that untyped hint is renamed **Raw category** (see CONTEXT.md).

## Shape

- **Two-level** taxonomy: **Category group** → **Subcategory**. A Transaction attaches to one
  leaf Subcategory; the group is a dashboard rollup. Each group carries an **"(other)" leaf**
  (Meniga's `otherCategoryName`) so classification always lands on a leaf; **Uncategorized** is
  reserved for not-yet-processed / model-abstain rows.
- **Seeded per Household** from a curated, deduped, bilingual subset of the Meniga taxonomy
  (Expenses-type categories only — see below). A Household may **hide** seed rows it doesn't use
  (answering "too detailed") and **add** its own Subcategories. Seed rows carry a stable slug +
  i18n message key + a **default Expense type** (fallback hint only) + icon + synonyms; custom
  rows carry literal user text (localization-exempt, like merchant names).
- **Assigned by the same precedence as Expense type** — Override > Merchant rule >
  Classification — resolved **independently** per axis. The classifier emits Category in the
  **same call** as Expense type — carrying its **own confidence** (independent of the Expense-type
  confidence; reasoning is shared) — so it never costs extra Free cap (one row = one classification).
  Merchant rules gain an **optional** Category mapping (flat `merchant → category` only — a
  merchant's category, unlike its discretionary type, does not vary by amount, so no threshold
  split). Overrides gain a nullable `category_id` on the existing one-row-per-Transaction row.
- **Expenses only** in v1. Credits, income (ADR-0009/0015), Excluded (ADR-0011), transfers
  (#97), and savings goals keep their existing orthogonal models; a Category only ever attaches
  to a Spending debit. Uncategorized is the Category-axis analogue of the `""` Expense type.
- **Aggregation is new and additive**, with **dynamic keys** (a Map, never a fixed
  `Record<ExpenseType, number>`), plus a parallel invariant
  `sum(byCategory) + uncategorized === effective expense`. Because the Expense-type axis is
  untouched, the existing dense-`Record` aggregations and the
  `sum(byExpenseType) + unclassified === expense` reconciliation are **not disturbed**.

## Considered Options

- **Replace Expense type with the Meniga taxonomy (single axis).** Rejected. Meniga has no
  discretionary levels (only `isFixedExpenses`), so we'd have to re-encode Necessary-vs-Nice-to-have
  as a per-category attribute anyway, while rewriting the savings engine, budgets, classifier, and
  dashboard hero. Largest blast radius, kills a signature feature's input.
- **Derive Expense type from the Category's default (coupled axes).** Rejected. Simpler
  classifier, but couples the two dimensions, changes the savings input path, and loses
  per-transaction discretionary judgment (the same category would always carry the same type —
  yet two coffees can be one Necessary, one treat).
- **Category by rules + manual only, no AI.** Rejected. Cheapest, but most transactions land
  Uncategorized until a human or rule acts — weak first-run experience. Riding the existing
  classification call makes AI category effectively free.
- **Per-Category budgets in v1.** Deferred to a follow-up. Budgets stay on the Expense-type axis;
  the mis-named `category_budgets` table is renamed `expense_type_budgets`.

## Consequences

- **Splitting (issue #105's other half) still deferred**, but now has a target: a future
  "split across categories" splits across *this* axis. Settling the axis first was the whole
  point of doing types before splitting.
- **Assistant** (ADR-0022) gains a read-only "spend by Category" tool this round, grounded in the
  same aggregation — no new math, tenant-safe by construction like the other curated reads.
- **One-time background backfill** on rollout: a category-only classification pass over existing
  classified rows, **held harmless against the Free cap** (those rows already counted). Needs a
  "needs-category" marker so the worker revisits rows it normally skips (ADR-0003).
- The closed Expense type enum and its 4 DB CHECK constraints are **unchanged**; the feared
  pervasive refactor of the reconciliation invariant does not occur under this design.
- **Numbering note:** `docs/adr/` previously double-used 0014 and 0018; that collision was resolved
  alongside this ADR by renumbering the savings-cycle decision to **0021** and the assistant
  tool-calling decision to **0022** (the shared-expense and CSV-import decisions keep 0014/0018).
