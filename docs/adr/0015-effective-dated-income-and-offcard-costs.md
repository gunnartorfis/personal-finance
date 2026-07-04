# Monthly income and Off-card fixed costs are effective-dated, not flat

ADR-0007 configures a Household's **Monthly income** and **Off-card fixed costs** as a single flat
recurring figure each, applied uniformly to every Statement cycle, and derives savings progress with
**no frozen history** — a config edit re-flows through every cycle. That flat model is wrong the
moment either number changes over time: a Household onboarding with months of back-statements, or one
whose salary or rent changed, has today's figure applied to cycles where it did not hold, so every
affected cycle's **Inferred saving** is off.

We make both amounts **effective-dated**. Each recurring income/cost amount carries an **Effective
cycle** (`YYYY-MM`) from which it applies, staying in force until a later change supersedes it; the
savings math, for each cycle, uses the amounts in force *that* cycle. Separately, a single cycle may
carry a **One-off adjustment** — a non-recurring income addition or cost (bonus, tax refund, annual
insurance bill) additive to that cycle's recurring base. We keep ADR-0007's derive-everything model
intact: there is still no frozen snapshot, so correcting a past cycle's income re-flows through
cumulative saved and the on-track judgment — the config is now time-aware, but progress is still
inferred, never stored.

The existing flat config migrates to the **baseline**: the current amounts become the versions
effective from the **Savings goal**'s start cycle, so existing Households see no change until they
record one. Every cycle from the goal's start onward is therefore always covered (no gaps); an
amount steps to zero via a `0`-amount version (a job ends, a loan is cleared). The full timeline is
uniform — past, current, and future-dated changes are all just versions — so a current-cycle change
or one-off correctly feeds **Allowed nice-to-have** through the existing ADR-0021 machinery (the
in-progress cycle is excluded from cumulative saved but is the cycle being budgeted).

Scope: this is the savings anchor only. The dashboard's **Income (marked)** (ADR-0008/0009) is
untouched — it stays card-credit-driven and is never netted against Monthly income.

## Considered Options

- **Keep flat, re-flow only (ADR-0007 status quo)** — one figure for all time. Rejected: silently
  wrong for any Household whose income or costs ever changed, which is the common onboarding case.
- **Per-month overrides on a flat base** — keep "today's income" flat; let the user override the
  total for specific past months. Rejected: a job change is a lasting step, not a per-month
  exception, so this forces re-keying the old total onto every affected month and records no single
  "income changed here" fact. Effective-dating models the step change directly.
- **Income only, leave Off-card costs flat** — smaller change. Rejected: costs sit in the same
  `Inferred saving` formula, the same config surface, and have the identical staleness problem;
  shipping income alone leaves a known-wrong number beside it and forces a second migration later.
- **Reintroduce frozen check-in snapshots** — freeze each cycle's inputs so history is stable.
  Rejected: ADR-0007/0021 deliberately removed the freeze in favor of pure inference; this decision
  is orthogonal — time-varying config, still derived.

## Consequences

- **New schema**: recurring income/cost rows gain an **Effective cycle**; a new per-cycle **One-off
  adjustment** surface (income or cost) is added. The flat config migrates to baseline versions
  effective from the goal's start cycle — a no-op for current numbers.
- **Retroactive by design**: editing a past cycle's income/cost changes that cycle's Inferred
  saving, cumulative saved, and can flip **On track** ↔ behind. Intended — progress is inferred, not
  recorded (ADR-0007).
- The savings derivation (`deriveCycles`) stops summing one flat figure and instead resolves the
  in-force amounts per cycle plus that cycle's one-off adjustments.
- **Meaningful only with a Savings goal**: Monthly income feeds nothing but savings, so the timeline
  is inert until a goal exists — accepted; the editor is reachable but has no effect without a goal.
- The `/settings/income` surface grows a timeline editor. Editing must distinguish *correcting* an
  amount (edit a version in place) from *recording a change* (add a later-effective version) so a
  fix does not fork history — resolved in the UI design.
- Off-card cost changes and one-off costs are expressible for the first time; the ADR-0007 blind spot
  (off-card spend the cards never see) is unchanged in principle, only made time-accurate.
