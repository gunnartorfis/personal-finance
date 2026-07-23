---
name: autopilot
description: Autonomously ship a task end-to-end under `/loop` — TDD implementation, split into stacked PRs on a feature branch (or one PR for small work), pass local checks, open PRs, wait for the Greptile AI review, run /address-pr-feedback until the Confidence Score is 5/5, and auto-merge each chunk into the feature branch. Canonical use `/loop /autopilot <task>` (e.g. "work on ADR-0017", "tackle issue #19"). Prepares the final PR to main green + 5/5, then hands off — it does NOT merge to main.
user-invocable: true
---

# Autopilot

Drive a task from an ADR / GitHub issue / freeform description all the way to a
review-clean PR, test-first, without babysitting. Big work is split into small
**chunk PRs** stacked on one **feature branch**; small work is a single PR to
`main`. Every PR must reach **all CI checks green + Greptile Confidence 5/5**
before it moves on. Chunks auto-merge into the feature branch; the final PR to
`main` is prepared and **handed off** for a human to merge.

Full command cookbook + edge cases: [reference.md](reference.md).

## Run me

```
/loop /autopilot <task>
```

Examples: `/loop /autopilot work on ADR-0017` · `/loop /autopilot tackle issue #19`.

- **Must run under `/loop` with no interval** (self-paced). Each loop tick I
  re-derive state from git + GitHub, advance as far as I can, and only when I
  must wait on GitHub (CI running, Greptile pending) do I `ScheduleWakeup` and
  end the tick. I `ScheduleWakeup({stop:true})` when the work is landed or
  blocked. `ScheduleWakeup` only exists inside `/loop` — if it is unavailable,
  tell the user to relaunch under `/loop`; do not busy-wait.
- **Interactive session** (the plan gate and any pause use `AskUserQuestion`).

## Prime directives

1. **Re-derive, don't remember.** Treat git + GitHub as the source of truth. The
   only thing carried across ticks is `<task>` (re-passed in the prompt) and the
   durable checklist stored in the epic PR body. Never assume in-memory state
   survived — a tick may start with a compacted context.
2. **Never merge without green + 5/5.** A PR merges only when all required CI
   checks are green AND Greptile Confidence Score is 5/5.
3. **Never touch `main` directly.** No commits, no force-push, no merge to `main`.
   The terminal step is hand-off (see [Phase 7](#phase-7--land-hand-off)).
4. **Stay in your lane.** Only operate on this run's branches. Never modify,
   rebase, or delete branches/PRs you did not create for this task.
5. **TDD is not optional.** Production code only ever appears to satisfy a
   failing test. Follow `/tdd`.
6. **One plan gate, then autonomous.** Get the breakdown approved once, then run
   to the end, pausing only on the conditions in [Stop & pause](#stop--pause).

## Every tick: re-derive state, then route

Run the discovery block ([reference.md §State](reference.md#state-discovery)),
then pick the FIRST matching branch:

```bash
gh label create autopilot --color 1f6feb 2>/dev/null; gh label create autopilot-epic --color 8250df 2>/dev/null
EPIC=$(gh pr list --state open --label autopilot-epic --base main --json number,headRefName,body --jq '.[0] // empty')
SMALL=$(gh pr list --state open --label autopilot --base main --json number,headRefName,labels --jq '[.[] | select((.labels // []) | any(.name=="autopilot-epic") | not)][0] // empty')
```

| If … | Phase |
| --- | --- |
| No epic PR, no small PR, no work started for `<task>` | **[0 Intake & plan](#phase-0--intake--plan-gate)** |
| Just approved a *big* plan, branch/epic not created yet | **[0 → create epic](#big-feature-setup)** then Phase 1 |
| Epic exists, checklist has an unchecked chunk with **no open PR** | **[1 Implement](#phase-1--implement-a-chunk-tdd)** the next chunk |
| Epic or small PR exists and its PR is **open** | inspect that PR → **[4](#phase-4--await-review) / [5](#phase-5--address-until-55) / [6](#phase-6--merge-chunk--advance)** |
| Epic exists, **all** chunks merged | **[7 Land](#phase-7--land-hand-off)** |
| Small PR merged, or epic handed off | **Done** — `ScheduleWakeup({stop:true})` + report |

When a PR is open, classify it and act:

```bash
PR=<number>
# see reference.md for the exact verified one-liners
SCORE=$(...);  CHECKS=$(...)   # SCORE ∈ {0..5,"pending"};  CHECKS ∈ {green,pending,failed}
```

- `CHECKS=failed` → **Phase 5** (fix the failure, push, re-review).
- `CHECKS=pending` or `SCORE=pending` → still running → **Phase 4** (wait).
- `CHECKS=green` and `SCORE=5` → **Phase 6** (merge / advance).
- `CHECKS=green` and `SCORE<5` → **Phase 5** (address feedback).

## Phase 0 — Intake & plan gate

1. **Resolve the task.**
   - `ADR-XXXX` → read `docs/adr/*XXXX*.md` (+ any linked plan under `docs/`).
   - `issue #N` / `#N` → `gh issue view N --comments`.
   - freeform → take it at face value.
   - Always read `CONTEXT.md` and any ADRs in the area for domain vocabulary
     (test names and interfaces must match it). Note the i18n rule: user-facing
     strings live in `messages/en.json` **and** `messages/is.json` (keys must stay
     in parity — `lib/i18n/parity.test.ts` enforces it).
2. **Decide size.**
   - **Small** — one cohesive change, one reviewable diff (≈ ≤ a few files / one
     behavior cluster). → single PR to `main`.
   - **Big** — multiple independent behaviors, a multi-slice ADR/plan, or a diff a
     reviewer could not hold in their head at once. → feature branch + stacked
     chunk PRs. Each chunk must be an independently reviewable vertical slice
     (a real behavior, test-first), not a horizontal layer.
3. **Plan gate (once).** Present, via `AskUserQuestion`:
   - size decision + one-line rationale;
   - for big: the ordered chunk list (each a short title), the feature-branch
     name `feat/<slug>`, and that chunks land on the feature branch while the
     final PR to `main` is handed off;
   - for small: the branch name and the single PR title.
   Offer **Proceed** / **Adjust breakdown** / **Cancel**. On Adjust, revise and
   re-ask. Only after approval do anything that writes to the repo/GitHub.
   (Re-derivation skips this gate automatically on later ticks, because a branch
   or PR already exists.)

### Big-feature setup

After approval, create the feature branch, seed it, and open the **draft epic PR**
whose body is the durable checklist ([reference.md §Epic](reference.md#epic-pr-setup)):

```bash
git checkout main && git pull --ff-only
git checkout -b feat/<slug>
git commit --allow-empty -m "chore(<scope>): start <feature> epic"
git push -u origin feat/<slug>
gh pr create --base main --head feat/<slug> --draft --label autopilot --label autopilot-epic \
  --title "feat(<scope>): <feature> (epic)" --body "$(cat <<'EOF'
## Autopilot epic: <feature>
Source: <ADR-XXXX | issue #N | task text>

Stacked chunk PRs land here; this PR lands on main by hand-off once every chunk
is merged and it is green + Greptile 5/5.

### Chunks
- [ ] 1. <chunk title>
- [ ] 2. <chunk title>
- [ ] 3. <chunk title>
EOF
)"
```

Then continue into Phase 1 for chunk 1.

## Phase 1 — Implement a chunk (TDD)

1. **Branch off the right base**, freshly updated:
   - big: `git fetch origin && git checkout feat/<slug> && git pull --ff-only && git checkout -b feat/<slug>-<n>-<short>`
   - small: `git checkout main && git pull --ff-only && git checkout -b <type>/<slug>`
2. **Invoke `/tdd`** for this chunk's behaviors. Strict red→green→refactor,
   one behavior at a time, vertical slices; tests assert observable behavior
   through public interfaces; expected values are independent literals (no
   tautological tests); a bugfix's first RED test reproduces the bug. Commit on
   green — never commit red.
3. **Commit convention** (this repo — see [Conventions](#conventions)): scoped
   Conventional Commits, e.g. `feat(holdings): add balance staleness nudge`, with
   the `Co-Authored-By` trailer. For a chunk of a big feature, put `(slice <n>)`
   in the subject to match repo history.

## Phase 2 — Local gate (before every PR open AND before every push in Phase 5)

Reproduce the CI gate locally; **all four must pass** before pushing a PR-opening
commit ([reference.md §Gate](reference.md#local-gate)):

```bash
pnpm lint && pnpm typecheck && pnpm test:run \
  && pnpm dlx react-doctor@0.5.8 --yes --scope full --blocking warning --no-telemetry
```

- These are the checks the user requires locally: **lint, test, typescript,
  react-doctor**. Note react-doctor needs the CI flags above — the bare
  `pnpm doctor` script does NOT reproduce the gate.
- `build` and `migrations` are also CI gates but may need env/DB; do not block PR
  creation on them — they are enforced at merge time via `gh pr checks`
  ([Phase 4](#phase-4--await-review)). If migrations are relevant to the change,
  run `pnpm db:generate` and commit any new files under `drizzle/` (the CI
  `migrations` job fails on uncommitted schema drift).
- On failure: fix and re-run. Cap at **3** fix attempts for the same failure;
  past that, pause + report ([Stop & pause](#stop--pause)).

## Phase 3 — Open PR

```bash
git push -u origin HEAD
gh pr create --base <BASE> --label autopilot \
  --title "<scoped conventional title>[ (slice <n>)]" --body "$(cat <<'EOF'
## Summary
- <what changed and why>

## Risk areas
- <what a reviewer should scrutinise>

## Test plan
- [x] pnpm lint · pnpm typecheck · pnpm test:run
- [x] react-doctor (full scope)
EOF
)"
```

- `<BASE>` = `feat/<slug>` for a chunk, `main` for small. Reference the ADR/issue
  in the body (`ADR-0017`, `#19`) when applicable.
- Then go to Phase 4 (wait for review).

## Phase 4 — Await review

CI runs and Greptile reviews (Greptile edits a single issue comment in place,
posting `<h3>Confidence Score: X/5</h3>` once done; it takes a few minutes).

- Read `CHECKS` and `SCORE` ([reference.md §Poll](reference.md#poll-a-pr)).
- If `CHECKS=failed` → **Phase 5**.
- If `CHECKS=green` + `SCORE=5` → **Phase 6**.
- If `CHECKS=green` + `SCORE<5` → **Phase 5**.
- Otherwise still pending → `ScheduleWakeup` ~240s while Greptile is pending,
  ~150s while only CI is pending ([Pacing](#pacing)), then end the tick.

## Phase 5 — Address until 5/5

When checks are red or the score is `<5`:

1. **Invoke `/address-pr-feedback <PR>`.** It triages inline + PR-body (Greptile)
   feedback, applies valid fixes, runs build/test, commits, pushes, replies to
   threads, and **re-triggers Greptile** (`@greptileai review`). It proceeds
   autonomously on clearly-valid feedback.
2. If checks were red for a reason `/address-pr-feedback` would not touch (e.g. a
   flaky/infra failure or a lint/type error), fix it yourself, re-run the
   [local gate](#phase-2--local-gate), and push.
3. **Re-review detection:** capture the Greptile comment `updated_at` before
   pushing; the review is fresh once `updated_at` advances past your push and a
   score is present. Then `ScheduleWakeup` and return to Phase 4.
4. **Cap: 3 address rounds per PR.** If still `<5/5` after 3 rounds, stop the loop
   and report the specific unresolved Greptile items so the user can decide
   (some findings are intentional and worth pushing back on, not fixing).

## Phase 6 — Merge chunk & advance

Only reachable at **green + 5/5**.

- **Chunk (big):** `gh pr merge <PR> --squash --delete-branch` (merges into the
  feature branch). Then tick the chunk in the epic PR body checklist
  ([reference.md §Checklist](reference.md#update-the-checklist)) and go implement
  the next unchecked chunk (Phase 1). If it was the last chunk → Phase 7.
- **Small:** do NOT merge. Go to Phase 7 (hand off).

Never merge a chunk whose base (the feature branch) has moved underneath it in a
way that made checks stale — if `CHECKS` is not currently green, go back to
Phase 4/5 first.

## Phase 7 — Land (hand off)

- **Big:** mark the epic PR ready (`gh pr ready <EPIC>`), ensure it is green +
  Greptile 5/5 (run Phases 4–5 on the epic PR itself — Greptile reviews the whole
  feature here). Then **stop**: do not merge to `main`.
- **Small:** ensure the single PR is green + 5/5.
- Post a short hand-off summary and `ScheduleWakeup({stop:true})`:
  > ✅ Ready to merge to `main`: <PR url>. All CI checks green, Greptile 5/5.
  > <for big: N chunks merged into `feat/<slug>`.> Merge when you're ready.

## Pacing

At a wait point, call `ScheduleWakeup` and END the tick (stop calling tools):

- `prompt`: the exact `/autopilot <task>` you were invoked with (re-fires the loop).
- `delaySeconds`: **~240** while Greptile is pending (stays inside the cache
  window; Greptile typically takes a few minutes); **~150** while only CI is
  pending. Do not sleep between local steps — only yield on GitHub waits.
- `reason`: specific, e.g. `"waiting on Greptile review of PR #124"`.
- When landed or blocked: `ScheduleWakeup({stop:true})`.

## Stop & pause

Stop the loop (`ScheduleWakeup({stop:true})`) or pause with `AskUserQuestion`, and
report clearly, when:

- **Greptile stuck `<5/5`** after 3 address rounds on one PR → stop; list the
  unresolved items and why they may be intentional.
- **Local gate fails 3×** for the same failure, or **CI stays red** after fixes →
  stop; paste the failing output.
- **A human reviewer requests changes** → apply if clearly valid (via
  `/address-pr-feedback`); if it implies a product/scope/architecture decision →
  pause + `AskUserQuestion`.
- **A product/scope ambiguity** surfaces during implementation → pause + ask.
- **Anything would require touching `main` or another team's branch** → stop.

Always leave the world in a clean, resumable state (branch pushed, PR open,
checklist current) so the next tick — or a human — can pick up.

## Conventions

- **Base branch:** `main` (this repo has no `dev`). Chunk PRs base on the feature
  branch; small + epic PRs base on `main`.
- **Branches:** feature `feat/<slug>`; chunk `feat/<slug>-<n>-<short>`; small
  `<type>/<slug>` (`type` ∈ feat/fix/refactor/chore/docs).
- **Commits:** scoped Conventional Commits (`feat(scope): …`, `fix(scope): …`),
  imperative, lowercase, no trailing period. End with
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` (matches this repo's
  history and the harness rule). Commit on green only.
- **PR body:** `## Summary` / `## Risk areas` / `## Test plan`. Label every PR
  `autopilot`; label the epic `autopilot-epic`.
- **i18n:** never hard-code UI strings; add keys to both `messages/en.json` and
  `messages/is.json`.
- **Do NOT use `/create-pr` or `/commit-and-push`** here — they target a `dev`
  base with `HQ-XXXX` Linear tickets and would prompt for a push, which breaks
  this repo's `main`-based, ADR/issue-referencing, autonomous flow. Own git
  directly per the above.
