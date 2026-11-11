# Railway production deployment

## Current architecture and release ownership

- Workspace: GA solutions, `c3eeb9c9-ecb1-4994-8ea1-4a94ea009093`.
- Project: [Personal Finance](https://railway.com/project/2c2ceec6-dacc-4c72-9f2a-fc1f980d57ec).
- Sole environment: production, `55011e12-2ebb-4637-bf00-fe7a95f4fef1`.
- Web: `7ca219f0-5894-4257-909c-735b36eee88a`,
  https://web-production-a5531.up.railway.app, Europe west4, 1 replica, 1 CPU / 1 GiB limits.
- Postgres: `5d41d9d5-2ce3-42bc-8b84-d70d1f265c47`, PostgreSQL 18, private network,
  5 GB volume `36ff80c5-ae59-4ee0-aba8-c35455ab0821`. No old Neon data/users imported (ADR-0028).
- Historical one-off migration service `83575ae3-9f5b-4aa8-b93d-f79888d6a3f1` is inactive:
  no GitHub source or automatic trigger; migration approval disabled. Do not manually rerun it.

Railway native GitHub integration follows `gunnartorfis/personal-finance`, branch **main**.
There is no commit pin, release tag, manual publishing step or GitHub Actions deploy token dependency.
**Wait for CI is disabled.** No other service triggers a web deployment. Postgres remains image-based.
The production environment is reused; no staging environment is created. See ADR-0029.

## Build, pre-deploy and rollout gates

The version-controlled Dockerfile pins Node 24.21.0 and pnpm 11.9.0, installs from the frozen
lockfile, and runs these checks before Next build:

1. Lint and TypeScript.
2. Full application tests using synthetic records and mocked providers.
3. Native hosting tests: lifecycle, runtime configuration, scheduling/overlap/retry guards and migrations.
4. Drizzle migration-file checks and offline schema generation with directory hashes to reject drift.
5. React Doctor 0.5.8 full scan, blocking warnings, preserving the existing quality gate.
6. Next production build, standalone server, static/public assets and fonts.

GitHub Actions does not repeat these builds/tests or publish images. Deleted job names must not
remain required GitHub checks; keep unrelated repository protections and automation intact.
No database migration runs during a build or application startup. No private key is a build argument.
Only NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is compiled publicly; Railway's injected commit SHA supplies
Next deployment identity without pinning future releases.

Web pre-deploy command:

```sh
/bin/sh -c 'cd /release && exec node scripts/hosting/migrate.mjs'
```

Railway pre-deploy timeout is 300 seconds. The immutable image contains the separate /release
migration tool tree and SQL, so no package download is needed in pre-deploy. It runs on Railway's
private network with runtime DATABASE_URL. Only web owns this hook. Other services must not inherit it.

The migration script preserves approval, environment, direct target-host and migration-file checks.
RAILWAY_SERVICE_ID must equal independently configured MIGRATION_SERVICE_ID. One PostgreSQL session
holds the advisory lock and applies Drizzle migrations; the hosting schema uses a checksum ledger.
A concurrent migration attempt fails the deploy instead of racing. Retries skip already-applied
migrations. Losing a session or failing a migration/pre-deploy must stop rollout; inspect before retry.
Never add financial charges, bank syncs or email sends to migrations.

Rollout is gated by `/api/health` (120-second timeout). JSON reports status and the injected deployed
SHA, with no-store caching. This is process liveness, not proof of auth/database/provider readiness.
The process binds 0.0.0.0:$PORT, runs non-root, forwards shutdown signals with a 310-second grace
period, and Railway drains for 320 seconds. Restart policy is ON_FAILURE, maximum 3 retries.

## Runtime configuration

Retain existing provider secrets in Railway. Never copy them into Git, Docker build arguments,
Notion, logs or test artifacts. Web DATABASE_URL references Postgres.DATABASE_URL. Migration settings:

- MIGRATION_ENVIRONMENT=production; MIGRATION_APPROVED=true (authorization for the controlled hook).
- MIGRATION_DATABASE_HOST references Postgres.RAILWAY_PRIVATE_DOMAIN.
- MIGRATION_SERVICE_ID=7ca219f0-5894-4257-909c-735b36eee88a.
- APP_ORIGIN=https://web-production-a5531.up.railway.app, NODE_ENV=production, PORT=3000,
  HOSTNAME=0.0.0.0, TZ=UTC, SCHEDULER_INSTANCE=railway-production, ENABLE_HOUSEHOLD_RESET=false.

Clerk public and secret keys stay in the existing GA Solutions app. The user selected its development
instance for initial verification without a domain: relaxed session security, 100-user cap and no
transfer of development users to production. This remains an evaluation exception, not production
identity acceptance. No authentication rewrite is part of this release-policy change.

Keep existing Straumur, Enable Banking, AI Gateway and Resend credentials. Banking app ID is
0f1c6d59-c41d-4e3b-87e3-8f0eb592da8a. Straumur base is https://greidslugatt.straumur.is (code adds /api/v1).
Public destinations use canonical APP_ORIGIN rather than the container bind address:

- Straumur webhook: https://web-production-a5531.up.railway.app/api/webhooks/straumur.
- Banking callback: https://web-production-a5531.up.railway.app/api/open-banking/callback.
- Payment returns and digest/unsubscribe links use the same HTTPS origin.

## Verification evidence and remaining migration work

Prior Actions release 43014276829 deployed main 91c5012be2298dac1bc2a52c7fc14dd068259b3d successfully
as web deployment 979bc7c7-1154-443f-81bc-394c0b71f816. That is historical evidence, not the new
native release. The first native source deployment reached terminal SUCCESS on 2026-11-11:

- Main SHA: `70fc226502d4f12ce1f7f816eb3c991a0aa60010` (PR #365).
- Deployment: `7c98f6c7-e8d5-480d-9c83-f5644f5c7cd3`.
- Image digest: `sha256:fcb53e6bfbdbf8444613ed74b026a64055856da0a4669787565509b2a20804ff`.
- Railway build passed 245 files / 1,688 tests, 23 hosting tests, lint/typecheck, migration
  drift/checks, React Doctor (no findings) and Next build. Lint retains one existing warning.
- Production `migration.completed` observed after financial and hosting migration phases.
- Railway health rollout passed. A live public health probe returned 200 and the matching SHA.
- A missing-state banking callback navigated safely to sign-in on the public Railway origin.
- Native push-trigger verification remains to be observed after the follow-up documentation merge.

The first attempt failed before migration logs because the Docker command required an explicit
shell. Updating the hook and using redeploy still failed; a fresh native source deployment with
`/bin/sh -c 'cd /release && exec node scripts/hosting/migrate.mjs'` succeeded. A redeploy can retain
an older deployment manifest; use a new main-triggered deployment to verify changed lifecycle settings.
Keep all migration guards enabled. Never bypass pre-deploy merely to obtain a healthy application.

Direct DB inspection found 43 application migration rows and a final hash matching
0042_wet_tarantula.sql. All three scheduler owners remain NULL. Repeated migration deployments
completed without applying work twice. Earlier public checks passed liveness, Clerk sign-in rendering,
anonymous account denial and unauthenticated scheduler rejection. A callback probe exposed the
container-origin regression; canonical-origin code is included in the native release candidate.

Remaining wider migration gates: authenticated household membership and cross-household denial,
CSV ingest/duplicates/editing, financial totals and cycle boundaries, budgets/savings/income,
Icelandic/English behavior, AI classification/streaming/resumability/accounting, restart recovery,
provider-supported sandbox payment/webhook retry and banking callback checks, email sender verification,
scheduler handover, backups/restore and alert delivery. Do not charge real accounts, send real digests
or synchronize real banks during automated verification. Healthy homepage/build alone is insufficient.

## Scheduler handover and external effects

Preserve billing at 03:00 UTC daily, banking at 04:00 UTC daily and digest at 06:00 UTC on day 1.
Owners are paused in hosting.scheduled_jobs. Existing Vercel functions use an older independent
Neon database: the fresh Railway ledger cannot coordinate with them. Fence/disable old schedules,
drain in-flight requests, reconcile the last occurrence, then explicitly enable a single new owner.
Do not enable duplicate schedules merely because native autodeploy is configured.

Scheduler calls require a constant-time bearer secret; due occurrences have a unique ledger entry.
Started or uncertain occurrences are never automatically reclaimed. Pending charges, partial syncs,
email ledger gaps and interrupted work require reconciliation before another attempt. Application
rollback does not undo external effects. Keep banking/payment callbacks and secrets stable through acceptance.

## Recovery, costs and rollback

The previous host https://auratalapp.vercel.app and its Neon/auth resources remain through acceptance.
Railway's backup screen currently requires Pro to create backups, schedules or PITR. No restore drill
or RPO/RTO acceptance has been completed. Do not retire old resources before the applicable recovery,
provider and authenticated-flow checks pass.

Railway observability has CPU, RAM, disk, egress, error logs and spend blocks; external alert routing
is not yet verified. Both services have 1 CPU / 1 GiB limits, which are ceilings, not measured usage.
The empty DB's 20-hour idle sample averaged 0.0531 GB RAM, 0.000248 vCPU and 0.1348 GB disk; roughly
USD0.56/month extrapolated resources only. Earlier illustrative web range USD5.65-13/month remains
unmeasured under representative load. Keep shared plan fees, backups, egress, Clerk, AI Gateway tokens,
Straumur transaction fees, Enable Banking and Resend costs separately visible. No savings claimed.

For every release record Railway deployment ID, GitHub main SHA, image digest, applied migration
ledger, public origin and smoke results. /api/health's revision must match Railway deployment metadata.
A failed build, pre-deploy or healthcheck must leave the previous healthy deployment serving traffic.

Normal application rollback: revert the offending main change and let the same native pipeline run.
For an urgent incident, redeploy a recorded compatible prior Railway deployment, then commit the
corresponding main fix so branch-based releases remain authoritative. Do not leave a manual SHA pin
that prevents subsequent main deployments. Confirm schema compatibility before rolling code back.

After financial writes or provider effects, pause jobs and preserve both datasets. Reconcile charges
by provider references, emails by send IDs and bank inserts by dedup state. Never blindly restore a
DB or repeat a charge/send. A database recovery is separate from application rollback and requires
a recorded recovery point, lost-write assessment and external-effect reconciliation. Keep the old
host available until acceptance; no old resource is retired by this deployment-policy change.
