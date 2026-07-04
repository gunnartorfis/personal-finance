# Plan 006: AI Assistant — natural-language Q&A over household finances (issue #101)

> **Executor instructions (read fully before each iteration)**: This is a
> multi-PR epic driven by a self-paced Claude Code loop. Each iteration ships
> **one** slice below as a **small, reviewable PR**, built **test-first with the
> `tdd` skill** (red → green → refactor). Then it **waits for Greptile** to
> review and loops on feedback until **Greptile 5/5 + all checks green**. It then
> **STOPS and waits for the human (Gunnar) to merge** — do NOT self-merge, even
> though auto-merge authority normally exists; the human merges each PR before
> the next slice starts. Only after the current PR is merged does the loop pull
> fresh `main`, branch, and start the next slice.

## Design (locked — from the grill-with-docs session, 2026-07-04)

Canonical term **Assistant** (see `CONTEXT.md`). Architecture decision recorded in
`docs/adr/0018-assistant-tool-calling-over-curated-reads.md`.

| Branch | Decision |
|---|---|
| Data access | Tool-calling over curated household-scoped **read** fns wrapping `lib/dashboard/*` + `householdRepo`. No text-to-SQL, no RAG. |
| Capabilities | Read-only Q&A; mutations stay in existing UI. |
| Answer language | Asking Member's **Locale** (the one localized-AI-text exception). |
| Gating | **Premium-only** (Free sees trigger → upgrade CTA). |
| Model | Sonnet 5 via AI Gateway, in a single config constant `ASSISTANT_MODEL`. |
| UI | Right-side shadcn **Sheet** drawer; `app-header` button + ⌘K; `@ai-sdk/react` `useChat` → `app/api/assistant` `streamText`. |
| Persistence | **Household-shared**, threaded: `assistant_conversations` + `assistant_messages`, per-message Member attribution. |
| Lifecycle | Not in Activity log; **cleared on data reset**. |
| Guardrails | Facts + light *data-grounded* suggestions; no external advice; never fabricate figures; "not financial advice" disclaimer. |
| Cost | `maxSteps: 6` + per-household soft cap **50 msgs/day** (tunable constants). |

**Defaults chosen for the deferred questions** (change here if you disagree, before the loop reaches them):
history window = full thread; conversation title = truncated first question;
retention = forever until data reset; ⌘K + header button both land in slice 4;
Free households see the trigger and get an upgrade CTA.

## Slices (execution order & status)

| # | Slice | Touches | Status |
|---|-------|---------|--------|
| 1 | **Schema + repo**: `assistant_conversations` + `assistant_messages` tables (household-scoped, `started_by`/`member_id`, role, content, timestamps), drizzle migration, repo methods (create conversation, append message, list conversations, load thread), data-reset delete hook. No LLM. | `lib/db/schema.ts`, `lib/db/household-repo.ts`, `drizzle/`, reset path | PR-OPEN #252 |
| 2 | **Tool layer**: the ~8 read tools (zod in/out, tenant-scoped) wrapping existing helpers — `getCycleSummary`, `compareCycles` (movers), `topMerchants`, `spendByType`, `searchTransactions`, `getSpendingTrend`, `getSavingsStatus`, `getFinancialHealth`. Pure functions + zod schemas; no LLM wiring yet. | new `lib/assistant/tools/*` | TODO |
| 3 | **API + streaming**: `app/api/assistant/route.ts` — `streamText` + tools + system prompt (Locale, today's date + current cycle key, domain vocab, guardrails), `ASSISTANT_MODEL` const, Premium gate, `maxSteps`, per-household daily cap, persist user+assistant text on finish. | new `app/api/assistant/`, `lib/assistant/*` | TODO |
| 4 | **Drawer UI**: Sheet + `useChat`, `app-header` trigger + ⌘K handler, conversation list + thread view, Member attribution, "not financial advice" disclaimer, empty state, Free upgrade CTA. en+is catalog keys (parity). Route the UI build through the `/design` skill. | `components/`, `app/(app)/`, `messages/{en,is}.json` | TODO |
| 5 | **Polish (fast-follow)**: suggested prompts, tool-call/loading status, error + rate-limit states, a11y pass. | `components/` | TODO |

Status values: TODO | PR-OPEN #<n> | MERGED | BLOCKED (one-line reason).

## Per-iteration loop protocol

1. **Sync state**: read this table; run `gh pr list --author @me --search "assistant in:title" --state all` and inspect the newest assistant PR.
2. **Branch on state**:
   - **Open assistant PR, not merged**:
     - Fetch Greptile review + CI status (`gh pr view <n> --json reviews,statusCheckRollup,comments`).
     - If Greptile not posted yet / checks pending → **wait** (reschedule long, ~20 min).
     - If Greptile score < 5 or actionable comments → address them (test-first where behavior changes), push, update PR, **wait**.
     - If **Greptile 5/5 + checks green + still open** → human merges. Do NOT merge. **Wait**.
   - **Newest assistant PR merged (or none) AND a TODO slice remains**:
     - `git fetch origin && git checkout main && git pull` → mark merged slice `MERGED`, pick next `TODO`.
     - Re-check mergeability / actively-refactored files (repo has parallel work streams). Branch `feat/assistant-slice-<n>-<slug>` off fresh main.
     - Build the slice **with the `tdd` skill** (write failing tests first). Keep it small.
     - Run typecheck + tests green locally (TypeScript MUST compile — no exceptions).
     - Open a small PR (conventional title `feat(assistant): … (#101, slice <n>)`), set this row to `PR-OPEN #<n>`, **wait** for Greptile.
   - **All slices MERGED** → comment on issue #101 summarizing, stop the loop (no reschedule).
3. **Reschedule** with a reason; keep waits ≥20 min when idle on external events (Greptile/human).

## STOP conditions

- Never self-merge; the human merges every PR.
- TypeScript compile errors or red tests → fix before opening/pushing; never open a red PR.
- A slice's scope balloons → split it, ship the smaller half, note the split here.
- Any i18n string added must exist in **both** `messages/en.json` and `messages/is.json` (parity test).
