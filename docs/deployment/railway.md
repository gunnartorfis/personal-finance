# Railway hosting migration — evidence and release runbook

Status on 2026-11-10: **CI passed; production deployment and acceptance pending. Not yet an executable cutover package.**
The user authorized production cutover and selected a single production Railway environment on 2026-11-10. Separate staging and local Docker/browser testing are waived. Keep the previous host through deployed acceptance and rollback readiness. Removal of the old host follows acceptance; permanent deletion requires action-time confirmation when performed through the browser.

No production changes, data migrations, provider calls, DNS changes or host retirement performed.

The user requested deployment-side debugging on 2026-11-10 and waived local Docker/browser
testing. Local Docker access is not a release prerequisite. Preserve the existing release
gates and obtain runtime evidence on the deployed candidate using synthetic records and
sandbox providers; this waiver does not authorize diagnostic charges, bank syncs or real digests.

### Production-side diagnosis, 2026-11-10

Inspected the failed Vercel deployment's complete visible build-log tail. It stops in
`drizzle-kit migrate` before `next build`, with exit 1. The log contains an SSL-mode
deprecation warning but no underlying PostgreSQL error or SQLSTATE. That warning alone is
not evidence of the cause. The old script inherits child output and reports a signal or
spawn error; neither appears in this log. Do not redeploy it merely to reproduce the failure:
doing so reruns migrations against the live database. Inspect the applied migration ledger
and schema through an authorized database session before the controlled migration step.

The replacement migration command emits fixed phase names and allowlisted driver error
codes, including Drizzle-wrapped causes, without SQL, connection strings, error messages,
details or financial records. Unknown errors remain `UNCLASSIFIED`. These diagnostics are
local preparation and have not run against production.

## Verified inventory

| Surface | Evidence | State / uncertainty |
| --- | --- | --- |
| Repository | https://github.com/gunnartorfis/personal-finance | Initial clean baseline `8b7717d1c5a58fa94dcd42de0ef23c838fa26803`; no pre-existing user modifications |
| Production | https://auratalapp.vercel.app | Vercel project `personal-finance`, Gunnar Steinarsson's projects, Hobby |
| Deployed revision | https://vercel.com/gunnar-steinarssons-projects/personal-finance/GBaQCfapSZZeir3ci6xcouXqWWa8 | Ready: `ed8b10ed452920123bd7fef346ba6576437cd3ed` |
| Failed newer release | https://vercel.com/gunnar-steinarssons-projects/personal-finance/3hHGAqkpxK1nxXibHEKN15m7k9Cn | Local HEAD `8b7717d`; build failed after entering the migration phase. Exact database failure not established; do not assume its migrations were rolled back |
| Railway workspace | GA solutions `c3eeb9c9-ecb1-4994-8ea1-4a94ea009093` | Confirmed team workspace through Railway connector |
| Railway project | https://railway.com/project/2c2ceec6-dacc-4c72-9f2a-fc1f980d57ec | Created in company workspace; reused account resources; no previous Personal Finance project existed |
| Production on Railway | `55011e12-2ebb-4637-bf00-fe7a95f4fef1` | Existing empty staging environment renamed to production in place on 2026-11-10; sole environment; no services or deployments yet |
| Database | Neon PostgreSQL, Drizzle + `pg` TCP pool | Source verified; actual project/branch/region, recovery configuration and applied migration ledger still require inspection |
| Authentication | `@neondatabase/auth` + Neon Auth UI, `/api/auth/[...path]` | Preserve identity, cookie secret and callbacks. ADR-0001's Stack wording is stale. Production provider configuration not inspected |
| Payments | Straumur wrapper over Adyen; `/api/webhooks/straumur` | Source verified; credentials configured on Vercel. Merchant/sandbox mode and callback allowlist not verified |
| Banking | Enable Banking; connect/callback, initial + daily sync | Source verified; Vercel has application ID and private key. Consent/callback config and sandbox access not verified |
| AI | Vercel AI Gateway, `anthropic/claude-sonnet-5` | Explicit gateway key configured. Retain gateway; do not rely on Vercel OIDC on Railway |
| Email | Resend REST API; Auratal sender in source | No RESEND_API_KEY or DIGEST_UNSUBSCRIBE_SECRET shown in project-variable list. Shared variables and actual delivery setup not yet verified |
| Runtime assets | `public/`, `.next/static`, message catalogs, Next-generated Google fonts | Container copies public/static; tracing and font output need an actual build check |
| Storage | No filesystem persistence found in current source | Neon owns records; legacy file/CSV tool is frozen. Provider state remains external |

The Vercel variable screen shows **Production and Preview** for all 14 project variables:
`DATABASE_URL`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `CRON_SECRET`,
`STRAUMUR_API_KEY`, `STRAUMUR_TERMINAL_IDENTIFIER`, `STRAUMUR_API_BASE_URL`,
`STRAUMUR_WEBHOOK_HMAC_KEY`, `ENABLE_BANKING_APPLICATION_ID`, `ENABLE_BANKING_PRIVATE_KEY`,
`AI_GATEWAY_API_KEY`, `ANTHROPIC_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN`, `ENABLE_HOUSEHOLD_RESET`.
Values were not revealed or copied. The latter two Claude credentials are not referenced by
current application source; do not remove them without verifying other consumers.

No `NEXT_PUBLIC_*` application variables were found. If added later they are public and fixed
at build time; runtime secrets must remain runtime-only. No credentials should enter Docker ARGs.
Set `ENABLE_HOUSEHOLD_RESET=false` in production. Use synthetic records for verification without exposing reset to real households.

## Execution/access blockers

- Shell DNS cannot resolve registry.npmjs.org or backboard.railway.com. Railway CLI cannot refresh
  its session; `gh auth status` reports an invalid account token (may also reflect network failure).
- Docker socket access returns permission denied. Docker Desktop being running is insufficient.
- GitHub connector reads work, but publishing the candidate through the Git tree API returned
  HTTP 403 Resource not accessible by integration. No candidate commit/branch or CI run was created.
  Repository Contents and workflow-write access (or an authenticated network-enabled local Git session)
  is needed to publish the candidate and run the preserved checks.
- No local node_modules. The default pnpm shim tries to obtain the pinned version and stalls.
  An explicit offline attempt with locally available pnpm 12.18.0 failed the supply-chain metadata
  check for `@emnapi/core`. Policies were not weakened and dependencies were not substituted.
- Repository Next.js 16.2.6 bundled docs are consequently unavailable. Read official current self-hosting
  docs plus adjacent installed Next.js 16.3.3 standalone-output guide; exact-version validation remains pending.
- Production runtime credentials, callbacks and safe provider verification modes have not been configured on Railway.

Restore shell network or repository write access so the candidate can be published and checked
by CI. Docker socket access is not required for the requested deployment-side workflow.
Provision secrets directly in scoped provider/Railway/GitHub secret stores, never in chat or this document.
Do not copy financial records into test artifacts. Synthetic households must be isolated by the existing household authorization. Provider diagnostics must use mocks or supported test modes; never switch the live production merchant/account globally into a sandbox mode.

## Implemented preparation

- Build no longer invokes a migration. Explicit guarded `pnpm db:migrate` checks approval, environment,
  independently configured target hostname, direct connection and migration-file validity. Financial
  migrations run on the same PostgreSQL session as the release lock; a separate child cannot outlive
  that lock. The versioned hosting schema is applied afterward in its own transaction.
- Pinned Node 24.21.0 / pnpm 11.9.0. Docker has runtime and separate migration targets; frozen install,
  non-root runtime, standalone server, port/host binding, static assets, no secret build args.
- `/api/health` is no-store process liveness only. It does not prove DB/auth readiness.
- Runtime supervisor forwards SIGTERM/SIGINT and allows 310 seconds for in-flight requests; Railway
  drain is drafted at 320 seconds. Lifecycle metadata uses JSON with no sensitive payloads.
- CI retains lint/typecheck/unit/build/migration-drift/React-Doctor gates and adds hosting guards and
  container builds. The manual production workflow requires successful CI for the exact SHA and the
  railway-production GitHub environment. CLI installation is in a separate unprivileged job. No GitHub Railway auto-deploy source is connected. Local vercel.json disables all automatic
  Git deployments while retaining the existing cron entries; the current deployed Vercel service is untouched.
- `.railway/railway.ts` is an unapplied IaC draft. Its SDK lockfile, type validation and plan are pending.
  It targets only production. New Railway services use IaC rather than deprecated railway.json.

Application API/provider diagnostics now emit fixed structured event names, without exception bodies,
OAuth state/cookie fragments, bank names, payment amounts or transaction identifiers. The classifier
privacy regression now injects sensitive text into the thrown SDK error (test not yet run). Third-party
framework/platform logs still require a deployed production audit; never enable verbose provider payload logging.
Financial calculations and user-facing strings are unchanged.

## Schedules and external effects — implemented locally, validation pending

| Job | Existing declared UTC schedule | Meaning |
| --- | --- | --- |
| Billing renewal | `0 3 * * *` | Daily 03:00 UTC |
| Open-banking sync | `0 4 * * *` | Daily 04:00 UTC |
| Monthly digest | `0 6 1 * *` | First day of calendar month, 06:00 UTC; previous statement cycle |

These match Atlantic/Reykjavik year-round. Verify live cron history before handover.
The cron entries in vercel.json and deployed schedules have not been changed. The local repository
configuration now disables Vercel Git deployments, including main, to prevent an unapproved release
on merge. The live Git integration was not mutated; verify the provider honors this configuration
before merging, and use an explicitly approved manual release for the guard-capable Vercel revision. The Railway IaC draft defines three
cron services, all with SCHEDULER_ENABLED=false and restart policy NEVER. None is provisioned yet.

All three GET routes now use shared coordination. Constant-time CRON_SECRET authentication runs before
any DB access. A short transaction locks one job-control row, checks its owner, checks unresolved runs,
and records a unique occurrence as running before the handler can charge/sync/send. The transaction
commits before external work; no long-lived session lock or in-memory lease is required. Concurrent
claims serialize on the control row, including across old/new hosts sharing the database.

The new `hosting` schema is infrastructure metadata, intentionally separate from Drizzle's financial
schema. `ops-migrations/0001_scheduled_execution.sql` is applied only by the guarded release migration
command and tracked with an immutable SHA-256 checksum in hosting.schema_migrations. It contains no
financial payloads. Initial schedule owners are NULL, so installation pauses the routes until an
explicit ownership assignment. Do not run Drizzle push/pull across this infrastructure schema.

Configuration:

- Web: SCHEDULER_INSTANCE is a fixed deployment identity such as railway-production or vercel-production.
  DATABASE_URL supplies the same environment's coordination and product database. No second database.
- Cron: APP_ORIGIN must be the canonical HTTPS application origin; CRON_SECRET is a runtime secret.
  SCHEDULER_ENABLED defaults off. Start with `node scripts/hosting/run-scheduled.mjs billing-renewal`
  (or bank-sync / monthly-digest). The launcher refuses redirects, uses a 300-second timeout and makes
  one request with no automatic network retry. Do not attach web/database/provider secrets to cron services.
- Requests use the latest due UTC occurrence and a six-hour execution window. Explicit occurrence
  headers must match. Outside that window, the run is rejected and requires a reviewed catch-up;
  it is never silently shifted to a different email/billing cycle.

Completed occurrence retries are acknowledged without calling the handler. A definitive billing
refusal completes that occurrence; the next scheduled day can perform its intended next dunning
attempt. Unknown/pending payment outcomes, partial banking/digest failures, missing email config,
exceptions and lost completion writes leave the run blocked for reconciliation. No automatic reclaim
occurs after a crash or ownership change; unresolved runs block later occurrences of the same job.
The digest now counts delivered-but-unrecorded emails explicitly so the scheduler cannot mark that
occurrence completed. Provider idempotency and the existing digest ledger remain additional guards.

This intentionally trades automatic recovery for preventing repeated uncertain financial/email effects.
It is not an exactly-once claim. Failure alerts and the following operator procedure are acceptance gates:

1. Pause the job by setting its owner NULL in a transaction. Inspect job/run metadata and provider state
   through authorized consoles; never dump financial records or credentials into verification logs.
2. Confirm the original process/request has ended. A running row has no automatic timeout and may still
   represent live work. Never mark it complete simply because its age exceeds an expected duration.
3. Reconcile charges, deliveries and bank inserts against provider references and application ledgers.
   Repair confirmed delivery-ledger gaps without sending again. A payment pending at the provider is
   not a new charge opportunity. Record the decision in the existing operational/audit process.
4. Mark the occurrence completed only when every possible effect is reconciled. If part of the work
   remains, use a reviewed narrowly scoped recovery operation with preserved provider idempotency keys;
   do not delete the run, reset it to running, or retry the whole handler. Restore the intended owner
   only after recovery. The next scheduled occurrence may then execute normally.

**Critical handover prerequisite:** legacy deployed Vercel code does not consult the new owner table.
Before enabling Railway, deploy the guard-capable preparatory revision to Vercel under approved release
control and verify it, or make its legacy cron endpoints incapable of external effects and drain all
in-flight work. Removing a cron entry alone does not fence an old callable deployment. All callable
hosts must share the guard, or be disabled. Retain the previous web host for application rollback.

Pending verification: real multi-client PostgreSQL concurrency, owner switch with an active request,
provider sandbox failure recovery, member-triggered initial bank sync interaction, missed-run alerts,
and actual cron delivery. No production or staging migrations have been executed.

## Classification, streaming and localization gates

Classification drains 25 pending rows per authenticated request; the browser re-invokes it. There is
no durable Vercel Workflow, after(), waitUntil(), or detached task. Restart leaves pending records
resumable, but concurrent drains can both call AI before a conditional DB update: test free-cap and
usage behavior. Preserve the current design unless validation demonstrates a worker is required.

Assistant uses AI SDK streaming with reply persistence in onFinish. Test chunk delivery, disconnect,
persistence failure and restart during the stream; a live stream itself is not resumable and an
interrupted answer must be visibly recoverable. maxDuration exports do not impose a Node timeout.
Verify Railway's actual proxy timeout against representative 25-row batches and six-step assistant turns.

Signed-out locale currently uses x-vercel-ip-country after cookie/member preference and before
Accept-Language. Railway country geolocation equivalence is not established. Do not silently trust a
client-provided country header or claim parity. Validate a trusted edge country signal or record the
explicit signed-out fallback decision. Signed-in per-member locale and financial formatting stay intact.

## Production-only acceptance matrix

CI run https://github.com/gunnartorfis/personal-finance/actions/runs/42814519957 passed all six jobs for revision `e0d55b3355a944ff979f92f188ece45dd3a1bbcb`. The production-only workflow/configuration changes made afterward require a fresh CI run. Deployed acceptance remains **NOT RUN** unless explicitly marked below. Record SHA, image digest, deployment ID,
synthetic fixture version and redacted evidence. Do not attach transaction payloads or real screenshots.

| Gate | Required evidence |
| --- | --- |
| Migration configuration guards | PASS: 18 native Node tests in CI on Node 24.21.0, 2026-11-10 (migration/runtime guards, sanitized diagnostics + scheduler state machine). PostgreSQL/provider acceptance pending |
| Existing quality gates | PASS in linked CI: lint, typecheck, Vitest, pinned React Doctor with no blocking warnings, db:check + generated-schema diff |
| Container | PASS in linked CI: frozen build with no secrets; static JS/CSS/fonts; non-root; custom PORT; clean stop; restart; migration image build |
| Login | Preserve existing Neon Auth; verify allowed production origin/callback, secure cookies, refresh, logout using a controlled test identity |
| Household isolation | two synthetic households; membership; wrong-household IDs denied on reads and writes |
| CSV | parse preview, ingest, re-import dedup, recover invalid rows, forced import, undo/restore |
| Editing | overrides, manual rows, soft-delete/restore, transfer/exclusion/own-share behavior |
| Financial math | 27th/26th and year/leap boundaries, budgets, completed-cycle savings, effective income, totals |
| AI | injected/sandbox classification, retry/resume/cap, stream chunks and persisted reply |
| Payments | sandbox checkout; signed duplicate/out-of-order webhook; unknown charge outcome/retry |
| Banking/email | sandbox consent + incremental dedup; fake/test-only recipient; crash recovery |
| Schedules | Native state-machine checks PASS; locked PGlite 0.5.3 suite PASS in linked CI. Real multi-client and deployed cron validation pending |
| Locales/browser | Icelandic and English labels/formatting; navigation/back/refresh; stale-tab deploy transition |
| Performance | representative synthetic import/classification/stream workload; p50/p95, CPU/RAM/egress |

To run after access is restored:

```sh
cd ~/code/personal-finance
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test:run
pnpm test:hosting
pnpm db:check
pnpm db:generate
test -z "$(git status --porcelain drizzle)"
pnpm dlx react-doctor@0.5.8 --yes --scope full --blocking warning --no-telemetry
pnpm build
docker build --tag personal-finance:production .
docker build --target migrations --tag personal-finance-migrations:production .
```

For explicit migration execution, populate the ignored runtime environment from secret stores:
DATABASE_URL (direct endpoint), MIGRATION_DATABASE_HOST (independently verified),
MIGRATION_ENVIRONMENT=production, MIGRATION_APPROVED=true. Then:

```sh
cd ~/code/personal-finance
docker run --rm --env-file /secure/path/production-migration.env personal-finance-migrations:production
```

That file path is an operator-supplied prerequisite, not a file supplied by this repository.
Production requires separately scoped credentials and backup/restore evidence. User release approval
was given on 2026-11-10; validation and access prerequisites remain unsatisfied.
The production workflow uploads code only. It does not migrate the database, assign scheduler ownership, switch domains, prove runtime acceptance or retire Vercel. Use the same production environment for controlled verification before switching traffic. Keep automatic financial effects paused until the ownership handover.

## Monitoring, limits and cost assumptions

Pending configuration: EU region aligned with verified Neon location; one web replica; initial
1 vCPU / 1 GiB limit (proposal, not measured sizing); no sleep until scheduling/wake behavior is tested.
Configure external liveness monitoring, protected DB/auth readiness, 5xx/p95 alerts, restart/OOM alerts,
scheduler missed-run and failed-work alerts, and spend notifications. Do not set a company-wide hard
compute cutoff without an explicit availability decision. Add provider budgets independently.

[Railway pricing](https://docs.railway.com/pricing), read 2026-11-10: RAM $10/GB-month,
CPU $20/vCPU-month, egress $0.05/GB. Pro is $20/month credited toward workspace resource usage.
Illustrative **unmeasured** web usage per environment: 0.5–1 GiB average RAM, 0.02–0.10 average
vCPU, 5–20 GB egress => **$5.65–$13/month** for the single production web service, before
cron/build overhead, external services and shared subscription allocation.
Limits are not average usage. This is not a savings claim or an observed forecast.

Measure representative synthetic workloads and 24h idle usage before replacing these assumptions.
Track Neon compute/storage/auth, Vercel AI Gateway tokens, Straumur transaction fees, Enable Banking
fees, Resend delivery, domains/monitoring and allocated Railway subscription separately. Current
actual invoices and product-specific budgets are unknown. Keep Vercel costs during acceptance.

## Cutover and rollback procedure — requires completed release package

Do not execute until every acceptance gate passes. The user has now explicitly authorized production
cutover and waived separate staging; backup, callback and financial-effect safety gates remain.
This procedure is a checklist awaiting concrete IDs/domains and validated command paths, not yet an
executable production release package.

1. Freeze candidate SHA/image; reconcile local HEAD with the deployed revision and inspect the applied
   migration ledger after the failed Vercel build. Review additive schema compatibility with both hosts.
2. Confirm Neon restore window/backups and a synthetic restore drill. Record chosen RPO/RTO, backup ID,
   current schema/migration IDs and restored checks. Never overwrite production to test restoration.
3. Reuse the sole Railway production environment above; provision preserved runtime secrets directly.
   Record exact image/deployment IDs, limits, region, rollback image and provider callbacks.
4. Approve and run migrations once with the guarded migration target; inspect success before deployment.
   Neither host may auto-migrate during rollout. No destructive schema change without separate recovery plan.
5. Drain/pause job ownership and financial external effects before switching. Check in-flight payments,
   bank syncs, classifications and streams. Retain the old deployment and all provider state.
6. Domain decision required: auratalapp.vercel.app is Vercel-owned and cannot be moved to Railway by DNS.
   Verify ownership of an application domain (auratal.is appears only as an email sender in source), or
   approve a new origin. Configure DNS/TLS, auth trusted origins/redirects, Straumur return/origin/webhook,
   Enable Banking callback, email dashboard/unsubscribe URLs. Verify each exact production URL with a controlled test identity and provider-supported test mechanisms before enabling real traffic/effects.
7. Disable Vercel deployment triggers and cron ownership as one recorded controlled change; verify no
   old jobs can run. Remove Vercel crons only in the cutover revision. Enable the new schedule owner
   once, preserving UTC schedules; record last successful occurrence and next intended occurrence.
8. Route traffic; run login, cross-household denial, both locales, synthetic ingest/edit/math, stream and
   sandbox-safe provider smoke checks. Observe errors/latency/failed jobs and a representative workload.
9. Preserve the guard-capable preparatory Vercel revision as the hosting rollback target; the older
   unguarded revision cannot safely regain cron ownership. Roll back routing/application if auth breaks, isolation fails, totals differ, repeated 5xx appear,
   streaming fails or effects duplicate. Stop new scheduler ownership before restoring the old owner.
   Redeploy the recorded compatible previous image or route to retained Vercel; recheck callbacks/cookies.
10. Financial writes and external effects are **not undone by an app rollback**. Reconcile charges with
    gateway references, email sends with provider IDs and bank inserts with dedup state. Do not blindly
    restore the DB or re-charge/re-send. Recover database data using an approved point-in-time plan only
    after determining lost writes and external effects; preserve audit history and reconcile forward.
11. Retire Vercel resources only after explicit separate acceptance/retirement approval. Preserve gateway
    service access while it still provides AI. Do not delete Neon/auth/provider resources in this migration.

Before executing the authorized cutover, replace unknowns with the validated Railway production candidate URL, exact release/image revision,
full check evidence, measured cost forecast, recorded backup/restore, actual domains/callbacks, and tested
cutover/rollback commands. None of these approval prerequisites are waived by a healthy homepage.
