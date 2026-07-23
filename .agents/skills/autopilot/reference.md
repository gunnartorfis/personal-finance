# Autopilot — command cookbook

Exact, verified commands for [SKILL.md](SKILL.md). `gh` expands `{owner}/{repo}`
to the current repo, so these are copy-paste safe from anywhere in the checkout.
Assumes `gh` is authenticated and `pnpm` is the package manager.

## State discovery

Run at the start of every tick to decide the phase. **Identity is this run's
branch, derived deterministically from `<task>`** — never "the first PR carrying
the label" (that would clobber a concurrent autopilot run in another worktree).

```bash
TASK="<the exact task text you were invoked with>"   # stable across ticks
# Deterministic + collision-resistant: a readable kebab prefix PLUS an 8-char hash
# of the FULL task, so two tasks that share the first chars never derive the same
# branch. Same <task> → same slug → same branch, every tick.
HASH=$(printf '%s' "$TASK" | shasum -a 256 | cut -c1-8)
SLUG=$(printf '%s' "$TASK" | tr '[:upper:]' '[:lower:]' \
       | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g' | cut -c1-32 | sed -E 's/-+$//')
SLUG="${SLUG}-${HASH}"
BRANCH="feat/$SLUG"        # this run's epic (big) or single (small) branch — the identity key

git fetch origin --prune
gh label create autopilot       --color 1f6feb 2>/dev/null || true
gh label create autopilot-epic  --color 8250df 2>/dev/null || true

# THIS run's PR, selected strictly by branch (epic if labelled autopilot-epic, else the small PR):
RUN=$(gh pr list --state all --head "$BRANCH" --base main \
       --json number,state,labels,body,url,headRefName --jq '.[0] // empty')

# Chunk PRs of a big run (base = this run's branch), open and merged:
gh pr list --state all --base "$BRANCH" --json number,state,headRefName,title
```

- Select strictly by `--head "$BRANCH"` (and chunk base `"$BRANCH"`). Different
  tasks → different slugs → different branches, so concurrent runs never collide.
  The `autopilot` / `autopilot-epic` labels are markers for humans, **not** selectors.
- **Never act on a PR whose head/base branch isn't this run's `$BRANCH`** (or a
  `$BRANCH-<n>-…` chunk of it) — it belongs to a different run.
- `RUN` empty and no local `$BRANCH` → Phase 0 (Intake). `RUN` is a big-feature
  **epic** if its `labels` include `autopilot-epic`, else a **small** single PR.
  The checklist is parsed from the epic `body` (`### Chunks`); chunk `n` is done
  when its line is `- [x]`.

## Poll a PR

Two signals gate every merge, and both are verified against real PRs in this repo.

**Greptile Confidence Score — read atomically with the commit it scored.**
Greptile reviews a specific commit. After a Phase-5 push, CI can go green again
*before* Greptile re-scores. The review object and the confidence comment update
**separately**, so "review `commit_id` == head, then read the score from the
comment" can still race (review fresh, comment stale → a stale score slips
through). Avoid it: the confidence comment itself links `/commit/<sha>` for the
commit it scored, so read the score from that comment **only when it links the
current head** — one object, no race:

```bash
PR=<number>
HEAD=$(gh pr view "$PR" --json headRefOid --jq '.headRefOid')
BODY=$(gh api "repos/{owner}/{repo}/issues/$PR/comments" --jq \
  '[.[] | select(.user.login=="greptile-apps[bot]")] | last | .body')
case "$BODY" in
  *"/commit/$HEAD"*) printf '%s' "$BODY" | sed -nE 's#.*Confidence Score: ([0-9])/5.*#\1#p' | head -1 ;;
  *) echo "pending" ;;      # the comment does not (yet) score the current head commit
esac
```

(`gh api --jq` has no `--arg`, hence the shell glob on `$BODY`. If Greptile ever
drops the `/commit/<sha>` link, fall back to requiring the latest review
`commit_id` == head AND the comment `updated_at` after your push — but the
single-comment read above is race-free.)

**CI checks verdict — every required job must be PRESENT and pass.** Filtering to
the six required jobs is not enough on its own: a *missing* job (renamed, not yet
created) or one that concluded `SKIPPED`/`NEUTRAL` must **not** count as green —
otherwise a chunk can merge without every validation actually running. Require all
six named jobs to conclude exactly `SUCCESS`, else `pending`/`failed` (an optional
Vercel/preview check is ignored):

```bash
gh pr view "$PR" --json statusCheckRollup --jq '
  (["lint","typecheck","test","build","migrations","react-doctor"]) as $req
  | ([.statusCheckRollup[]
       | {name:(.name // .context // ""), s:((.conclusion // .state // .status // "")|ascii_upcase)}]) as $all
  | [ $req[] as $n
      | ($all | map(select(.name==$n))) as $m
      | (if ($m|length)==0 then "MISSING" else $m[-1].s end) ] as $st
  | if   ($st | map(select(test("FAIL|ERROR|CANCELL|TIMED_OUT|ACTION_REQUIRED"))) | length) > 0 then "failed"
    elif ($st | map(select(. == "SUCCESS")) | length) == ($req|length) then "green"
    else "pending" end'   # MISSING / in-progress / SKIPPED / NEUTRAL required job ⇒ pending, never green
```

To see *which* check failed (for the report / to decide who fixes it):

```bash
gh pr checks "$PR"          # human-readable table
gh run view <run-id> --log-failed   # failing step logs, from the run linked in the table
```

## Local gate

Reproduces the CI gate. Run before opening a PR and before every Phase-5 push.

```bash
pnpm lint \
  && pnpm typecheck \
  && pnpm test:run \
  && pnpm dlx react-doctor@0.5.8 --yes --scope full --blocking warning --no-telemetry
```

Mapping to CI jobs (`.github/workflows/ci.yml`, each a required check):

| CI job | Command | Run locally before PR? |
| --- | --- | --- |
| `lint` | `pnpm lint` (eslint) | ✅ yes |
| `typecheck` | `pnpm typecheck` (`tsc --noEmit`) | ✅ yes |
| `test` | `pnpm test:run` (`vitest run`) | ✅ yes |
| `react-doctor` | `pnpm dlx react-doctor@0.5.8 --yes --scope full --blocking warning --no-telemetry` | ✅ yes (needs the flags — `pnpm doctor` alone does not) |
| `build` | `pnpm build` (`migrate-on-vercel.mjs && next build`) | ⚠️ may need env/DB — rely on CI, verify via `gh pr checks` |
| `migrations` | `pnpm db:check`; `pnpm db:generate`; fail if `git status --porcelain drizzle` non-empty | ⚠️ run `pnpm db:generate` + commit `drizzle/**` if you changed schema; else rely on CI |

- Formatting: `pnpm format` (prettier) is **not** a CI gate, but run it if you
  reformatted.
- i18n parity is enforced inside the `test` job (`lib/i18n/parity.test.ts`) —
  keep `messages/en.json` and `messages/is.json` keys identical.

## Epic PR setup

```bash
git checkout main && git pull --ff-only
git checkout -b feat/<slug>
git commit --allow-empty -m "chore(<scope>): start <feature> epic"   # seed so the PR can open
git push -u origin feat/<slug>
gh pr create --base main --head feat/<slug> --draft \
  --label autopilot --label autopilot-epic \
  --title "feat(<scope>): <feature> (epic)" \
  --body "$(cat <<'EOF'
## Autopilot epic: <feature>
Source: <ADR-XXXX | issue #N | task text>

Stacked chunk PRs land on this feature branch; this PR lands on main by hand-off
once every chunk below is merged and it is green + Greptile 5/5.

### Chunks
- [ ] 1. <chunk title>
- [ ] 2. <chunk title>
- [ ] 3. <chunk title>
EOF
)"
```

A PR with only the empty seed commit opens fine (the commit delta is enough); the
diff fills in as chunks merge into the feature branch.

## Update the checklist

After a chunk merges, tick its box and append the PR number, so state survives
context loss:

```bash
EPIC=<epic-number>
BODY=$(gh pr view "$EPIC" --json body --jq '.body')
# Turn "- [ ] 2. <title>" into "- [x] 2. <title> — #<chunkPR> (merged)"
NEW=$(printf '%s' "$BODY" | perl -pe 's/^- \[ \] (\Q'"$N"'\E\. .*)$/- [x] $1 — #'"$CHUNK_PR"' (merged)/')
gh pr edit "$EPIC" --body "$NEW"
```

(Or just read the body, edit the one line, and write it back — the exact
mechanism doesn't matter; keeping the checklist current does.)

## Re-review detection (Phase 5)

After `/address-pr-feedback` pushes a fix, the review is *current* only once
Greptile's latest review `commit_id` equals the new head — which is exactly what
the **Poll a PR** score check enforces (it reads `pending` until then). So there
is nothing extra to track: re-poll each tick and treat any score whose
`commit_id` predates your push as `pending`, never as a merge signal.

`/address-pr-feedback` posts the `@greptileai review` trigger itself; only post it
manually (`gh pr comment "$PR" --body "@greptileai review"`) if you pushed a fix
outside that skill and Greptile hasn't picked it up.

## Merging & hand-off

```bash
# chunk → feature branch (only at green + 5/5):
gh pr merge <chunkPR> --squash --delete-branch

# epic hand-off (do NOT merge to main):
gh pr ready <epicPR>
# then stop the loop and report the URL for a human to merge
```

## Edge cases

- **Not launched under `/loop`** → `ScheduleWakeup` is a no-op; do not busy-wait
  (foreground `sleep` is blocked). Tell the user to run `/loop /autopilot <task>`.
- **First tick already has a branch/PR** (resumed run) → skip Phase 0; the plan
  gate does not re-fire because state exists.
- **Feature branch drifted** (chunk PR base moved) → `git fetch`; if a chunk PR's
  checks went stale, re-run Phase 4 before merging. Rebase a chunk branch on the
  updated feature branch only if it is strictly behind; never rebase `main`.
- **Chunk turns out unnecessary / splits further** → edit the epic checklist
  (remove or add lines) and continue; the checklist is the plan of record.
- **Branch protection blocks the squash-merge** of a chunk into the feature
  branch → the feature branch should be unprotected; if it is protected, stop and
  report (do not use admin override).
- **No Greptile comment after ~15 min** on a fresh PR → keep waiting a few more
  ticks; if it never arrives, report that Greptile did not review (check the app
  is installed) rather than merging without a score.
