# Plan 007: Holdings dashboard + Savings gap (ADR-0016 extension, ADR-0023)

> **Executor instructions (read fully before each iteration)**: This is a
> multi-PR epic driven by a **self-paced Claude Code loop**. Each iteration ships
> **one** slice below as a **small, reviewable PR**, built **test-first with the
> `tdd` skill** (red → green → refactor). Commit with conventional one-line subjects
> ending in the `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer
> (repo convention), push the branch, and open PRs with `gh pr create --base main`.
> **Do NOT use the global `create-pr`/`commit-and-push` skills** — they target a `dev`
> base + Linear `HQ-XXXX` tickets from a different repo; this repo uses `main` and
> conventional titles `type(scope): … (#/ADR)` with no Linear tickets. After
> opening, **wait for Greptile**, then loop on feedback until
> **Greptile Confidence Score 5/5 + all CI checks green + no unresolved Greptile
> threads** — then **squash-merge and delete the branch**. Auto-merge is
> **authorized for this epic** (full guardrails below); this deliberately deviates
> from plans 006 / i18n-rollout ("human merges"), per the 2026-07-22 decision.
> Only after the current PR is merged does the loop branch fresh and start the next
> slice.
>
> **Runs in a git worktree — do NOT `git checkout main`.** Branch off `origin/main`:
> `git fetch origin && git checkout -b feat/holdings-slice-<n>-<slug> origin/main`.

## Design (locked — from the grill-with-docs session, 2026-07-22)

Scope **(a)**: fold manually-entered external balances (InteractiveBrokers, cash, …)
into **Net worth**, add a **Holdings** dashboard surface, and add insights unlocked by
having both balances (stock) and spend/income (flow). Anchored by
`docs/adr/0016-financial-health-net-worth-runway.md` (net worth) and
`docs/adr/0023-savings-gap-compare-not-merge.md` (savings gap). Canonical terms are in
`CONTEXT.md` (**Account**, **Balance**, **Net worth**, **Holdings**, **Runway**,
**Monthly burn**, **Financial health**).

| Branch | Decision |
|---|---|
| Holdings vs net worth | **Holdings == Net worth**; assets only. No debts as balances (debts stay **Off-card fixed costs**, ADR-0015). |
| Asset model | **Reuse Accounts** as balance-only holdings (create by name, enter balance). **No asset-`type` attribute** (deferred until allocation/emergency-fund needs it). |
| Breakdown | **Total + per-account** rows. Account names carry the grouping; no formal asset-class taxonomy. |
| Currency | **ISK only**; the Member hand-converts. No FX (ADR-0004 intact). |
| Freshness | **Show "as of"** + soft **~30-day nudge**. Insights are **caveated** when stale, never hard-gated. |
| Insights (v1) | **Savings gap** (⭐, ADR-0023) + **observed net-worth trend** + **per-account allocation**. |
| Skipped (v1) | Emergency-fund months (needs asset-`type`); time-to-goal-from-net-worth (ADR-0007/0016 boundary — do NOT build). |
| Savings gap | Compare inferred saving vs net-worth Δ; **compare, never merge** (ADR-0023). Entered balances never feed the inferred-savings math. |

**Defaults chosen for the open layout question** (change here before the loop reaches
slice 3 if you disagree): a **new "Holdings" dashboard section** hosts the breakdown,
allocation, trend, and savings gap; **Runway** stays in the existing Financial health
section. Insight name is **"Savings gap"** (must avoid the reserved *reconcile/
reconciliation* and the per-Account *balance check*, CONTEXT.md).

## Slices (execution order & status)

| # | Slice | Touches | Status |
|---|-------|---------|--------|
| 0 | **Docs**: this plan + ADR-0023 + `CONTEXT.md` net-worth/holdings vocabulary. | `docs/adr/0023*`, `plans/007*`, `CONTEXT.md` | TODO |
| 1 | **Balance-check fix**: `loadBalanceChecks` skips Accounts with **no transactions at all** (balance-only asset Accounts), killing the constant-drift false positive (#98) for IBKR/cash. Pure logic + tests; no UI. | `lib/dashboard/balance-check.ts`, `lib/db/household-repo.ts` (read), tests | TODO |
| 2 | **Surface "as of"**: thread `NetWorth.asOf` (already computed, dropped at render) into the net-worth tile, formatted via `lib/format/date`. en+is strings. | `components/financial-health-section.tsx`, `messages/{en,is}.json`, tests | TODO |
| 3 | **Per-account holdings breakdown**: new **Holdings** section — total + one row per Account with a Balance (data already in `loadNetWorthPanel`). Built via `/design`. en+is. | `components/holdings-*`, `app/(app)/dashboard/page.tsx`, `messages/*`, tests | TODO |
| 4 | **Allocation**: pure calc — each Account's share of total Holdings (% of latest balances) — rendered in the breakdown. | `lib/dashboard/net-worth.ts` (or new selector), tests + render | TODO |
| 5 | **Observed net-worth trend**: repo read for net worth over time (sum of latest-per-Account as of each snapshot/cycle) + chart of the **real observed** line (distinct from the existing straight-line projection). | `lib/dashboard/net-worth.ts`, `lib/db/household-repo.ts`, `components/*`, tests | TODO |
| 6 | **Savings gap ⭐ (ADR-0023)**: pure selector comparing, per aligned period, **inferred saving** (ADR-0007/0015) vs **net-worth Δ** (nearest-snapshot-to-cycle-boundary); caveat when a snapshot is stale/missing. Render both + the gap. **Compare, never merge** — `lib/savings/*` MUST stay untouched. | `lib/dashboard/savings-gap.ts` (new), `components/*`, `messages/*`, tests | TODO |
| 7 | **Staleness nudge**: a soft "balances are N weeks old — update?" prompt in the Holdings section after ~30 days (days-since-latest-snapshot helper). en+is. | `components/holdings-*`, `lib/dashboard/net-worth.ts`, `messages/*`, tests | TODO |

Status values: TODO | PR-OPEN #\<n\> | MERGED | BLOCKED (one-line reason).

## Per-iteration loop protocol

1. **Sync state**: read this table; run `gh pr list --author @me --search "holdings in:title" --state all` and inspect the newest holdings PR.
2. **Branch on state**:
   - **Open holdings PR, not merged** — shepherd it:
     - Fetch review + CI: `gh pr view <n> --json reviews,comments,statusCheckRollup,mergeable`.
     - **Greptile score**: from the `greptile-apps` comment body, parse `Confidence Score:\s*(\d)/5`. Not posted yet / CI pending → **wait** (reschedule ~20 min).
     - **Score < 5, or unresolved actionable Greptile threads** → address them **test-first** where behavior changes (via `tdd`), commit (conventional + `Co-Authored-By` trailer) and push, **wait**. Cap at **3 address-rounds** per PR; if still < 5/5 after 3, set row `BLOCKED (greptile <5 after 3 rounds)`, **stop and ping the human**.
     - **Score = 5/5 AND every CI check `SUCCESS` (lint, typecheck, test, build, migrations, react-doctor, Greptile Review, Vercel) AND no unresolved Greptile threads AND `mergeable`** → **squash-merge + delete branch** (`gh pr merge <n> --squash --delete-branch`). Mark the row `MERGED`.
   - **Newest holdings PR merged (or none) AND a TODO slice remains**:
     - `git fetch origin` → mark the merged slice `MERGED`, pick the next `TODO`.
     - Branch off fresh `origin/main`: `git checkout -b feat/holdings-slice-<n>-<slug> origin/main` (never `git checkout main` — worktree). Re-check the touched files aren't mid-refactor on `main` (repo has parallel work streams).
     - Build the slice **with the `tdd` skill** (write failing tests first). Keep it small.
     - `pnpm typecheck` + `pnpm test:run` green locally — **TypeScript MUST compile, no exceptions**; never open a red PR.
     - Open a small PR with `gh pr create --base main`, conventional title `feat(holdings): … (ADR-0023, slice <n>)` (slice 1 uses `fix(holdings):`) + a Summary / Test-plan body. Set the row to `PR-OPEN #<n>`, **wait** for Greptile.
   - **All slices MERGED** → summarize on the ADRs / in this plan, **stop the loop** (no reschedule).
3. **Reschedule** with a one-line reason; keep waits **≥20 min** when idle on external events (Greptile / CI).

## STOP conditions

- **Auto-merge is scoped to this epic only** and only under the full gate above (5/5 + all checks green + no open Greptile threads + mergeable). Never merge on a partial gate; never bypass a failing check.
- **Slice 6 invariant (ADR-0023)**: the savings gap is read-only/diagnostic — it must **never** write back into either figure and must **not** modify `lib/savings/*`. If a slice needs to touch the savings math, STOP and re-open the ADR decision.
- TypeScript compile errors or red tests → fix before opening/pushing; never open a red PR.
- A slice's scope balloons → split it, ship the smaller half, note the split here.
- Any i18n string added must exist in **both** `messages/en.json` and `messages/is.json` (parity test).
- **Do NOT build** the skipped v1 insights (emergency-fund months; time-to-goal-from-net-worth).
