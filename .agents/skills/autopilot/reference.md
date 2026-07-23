# Autopilot — command cookbook

Exact, verified commands for [SKILL.md](SKILL.md). `gh` expands `{owner}/{repo}`
to the current repo, so these are copy-paste safe from anywhere in the checkout.
Assumes `gh` is authenticated and `pnpm` is the package manager.

## State discovery

Run at the start of every tick to decide the phase.

```bash
git fetch origin --prune
gh label create autopilot       --color 1f6feb 2>/dev/null || true
gh label create autopilot-epic  --color 8250df 2>/dev/null || true

# The epic (big-feature) umbrella PR, if any:
gh pr list --state open --label autopilot-epic --base main \
  --json number,headRefName,title,body --jq '.[0] // empty'

# A small single PR run (autopilot label, base main, NOT the epic):
gh pr list --state open --label autopilot --base main \
  --json number,headRefName,labels \
  --jq '[.[] | select((.labels // []) | any(.name=="autopilot-epic") | not)][0] // empty'

# Chunk PRs of an epic (base = the feature branch), open and merged:
FEAT=<feat/slug>
gh pr list --state all --base "$FEAT" --json number,state,headRefName,title
```

- Exactly one epic OR one small PR should be active per run. If both/none match
  and no branch exists → you are at Phase 0 (Intake).
- The **feature branch** is `EPIC.headRefName`; the **checklist** is parsed from
  `EPIC.body` (the `### Chunks` block). Chunk `n` is done when its line is `- [x]`.

## Poll a PR

Both one-liners are verified against real PRs in this repo.

**Greptile Confidence Score** (single issue comment, edited in place → take the
last greptile comment; `score` is `"pending"` until the `<h3>` line appears):

```bash
PR=<number>
gh api "repos/{owner}/{repo}/issues/$PR/comments" --jq '
  [.[] | select(.user.login=="greptile-apps[bot]")] | last
  | {updated_at, score: ((.body | capture("Confidence Score: (?<s>[0-9])/5").s) // "pending")}'
```

Fallback (Greptile sometimes moves the block into the PR description once inline
threads are resolved):

```bash
gh pr view "$PR" --json body --jq '.body' | grep -oE 'Confidence Score: [0-9]/5' | tail -1
```

**CI checks verdict** — filter to this repo's six required jobs so an optional
Vercel/preview check never gates a merge; returns `green` / `pending` / `failed`:

```bash
gh pr view "$PR" --json statusCheckRollup --jq '
  ([.statusCheckRollup[]
     | { name: (.name // .context // ""), s: ((.conclusion // .state // .status // "") | ascii_upcase) }
     | select(.name | test("^(lint|typecheck|test|build|migrations|react-doctor)$"))]) as $c
  | (if ($c|length)==0 then "pending"
     elif ($c|map(select(.s|test("FAIL|ERROR|CANCELL|TIMED_OUT|ACTION_REQUIRED")))|length)>0 then "failed"
     elif ($c|map(select(.s|test("PENDING|PROGRESS|QUEUED|EXPECTED|WAITING|^$")))|length)>0 then "pending"
     else "green" end)'
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

Greptile edits its comment in place, so detect a *fresh* review by watching
`updated_at` advance past your push:

```bash
BEFORE=$(gh api "repos/{owner}/{repo}/issues/$PR/comments" --jq \
  '[.[] | select(.user.login=="greptile-apps[bot]")] | last | .updated_at')
# ... /address-pr-feedback pushes and posts "@greptileai review" ...
# next tick: fresh once updated_at > BEFORE AND score present (see Poll a PR)
```

`/address-pr-feedback` posts the `@greptileai review` trigger itself; only post it
manually if you pushed a fix outside that skill and Greptile hasn't picked it up.

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
