# Finance dashboard

A local dashboard over an Icelandic credit-card statement. It classifies every
transaction into **Fixed / Necessary / Nice to have** with Claude (each row gets
an AI confidence score), lets you **override** any type from the UI, and tracks
**net profit / loss** from salaries, one-offs, and fixed monthly bills.

It runs entirely on your machine. Your statement and all derived data stay local
(`combined.csv` and `data/` are git-ignored) — the repo is just the tool.

---

## Prerequisites

- **Node 20+** and **pnpm** (`npm i -g pnpm`).
- A way to call Claude (for the AI classifier — optional; see [seed](#no-token-bootstrap)):
  - a **Claude subscription** token via `claude setup-token`, **or**
  - an **Anthropic API key** from <https://console.anthropic.com> → *Settings → API keys* (recommended — higher, clearer rate limits).

## Setup

```sh
# 1. Install dependencies
pnpm install

# 2. Add your statement (git-ignored). Export from your bank as CSV with the
#    Icelandic columns: Dagsetning, Mótaðili, Tegund, Upphæð í erlendum gjaldmiðli, Upphæð
cp ~/Downloads/your-statement.csv combined.csv

# 3. Configure Claude auth (git-ignored)
cp .env.example .env
#    then edit .env and set ONE of:
#      CLAUDE_CODE_OAUTH_TOKEN=...   (from `claude setup-token`)
#      ANTHROPIC_API_KEY=sk-ant-...  (preferred; classify.ts uses it if set)

# 4. Classify the statement -> data/transactions.json
pnpm classify

# 5. Run the dashboard
pnpm dev          # http://localhost:5173
```

`pnpm classify` is **resumable** — if it stops partway (e.g. a rate limit), just
run it again and it picks up only the rows still missing. If you hit 429s on a
subscription token, slow it down (`CLASSIFY_DELAY_MS=5000 pnpm classify`) or use
an API key.

### No-token bootstrap

To see the dashboard without calling Claude — if your CSV already has a `Type`
column (e.g. from the `classify-expenses` skill) — seed it instead. Confidence
shows as `—`:

```sh
pnpm seed
```

---

## Using it

- **Billing cycles, not calendar months.** Periods run the **27th → 26th** and
  are labeled by the closing month (e.g. "Apr 2026" = Mar 27 – Apr 26). Filter
  by period with the chips up top.
- **Override a classification.** Change a row's **Type** dropdown in the
  transactions table → saved to `data/income.json`'s sibling `data/overrides.json`.
  Overrides survive re-classification.
- **Review uncertain rows.** Tick **"Hide confidence > 90%"** to focus on the
  classifications worth checking.
- **Income & fixed expenses.** In the income panel add recurring **salaries**,
  per-month **one-offs**, and **fixed monthly expenses** (rent, loans — anything
  off the card). Saved to `data/income.json`.
  **Net = income − included card spending − fixed monthly expenses.**
  Credits/deposits (positive rows) are never counted as income.

> Editing (overrides, income) writes through the dev server, so it needs
> `pnpm dev` running. `pnpm build` makes a static, view-only bundle.

---

## Scripts

| Command | What it does |
|---|---|
| `pnpm classify [csv]` | Classify `combined.csv` (or a given path) with Claude → `data/transactions.json`. Resumable. |
| `pnpm seed [csv]` | Bootstrap `data/transactions.json` from an existing `Type` column (no token). |
| `pnpm dev` | Run the dashboard + local data API at <http://localhost:5173>. |
| `pnpm build` | Production build to `dist/` (view-only — no editing API). |
| `pnpm typecheck` | `tsc --noEmit`. |

### Classifier env vars

| Var | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Preferred auth; used if set. |
| `CLAUDE_CODE_OAUTH_TOKEN` | — | Subscription auth fallback. |
| `CLASSIFY_CONCURRENCY` | `1` | Parallel batches (raise to ~4 with an API key). |
| `CLASSIFY_DELAY_MS` | `1500` | Gap between batches (raise if rate-limited). |
| `CLASSIFY_BATCH` | `40` | Rows per request. |

---

## Layout

```
combined.csv          # your raw statement (git-ignored — bring your own)
data/                 # git-ignored, generated/state:
  transactions.json   #   classified transactions (type + confidence + reasoning)
  overrides.json      #   manual type overrides, keyed by row id
  income.json         #   salaries, one-offs, fixed expenses, type toggles
scripts/classify.ts   # AI ingest (raw CSV -> data/transactions.json)
scripts/seed.ts       # no-token bootstrap from an existing Type column
shared/               # CSV parsing, billing-cycle logic, classification prompt, types
server/devApi.ts      # Vite dev-server /api (serves data, persists overrides + income)
src/                  # React dashboard
```

`combined.csv` and everything in `data/` are personal financial data and are
**not** committed — the dashboard regenerates `data/` from your statement.
