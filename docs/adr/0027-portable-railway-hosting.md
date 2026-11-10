# Portable Railway application hosting; preserve Neon and existing identity

Status: implementation in progress. User authorized production cutover and selected production-only
Railway hosting on 2026-11-10. No separate staging environment or local Docker/browser acceptance
is required. CI gates and safe deployed production verification remain required. Cutover has not
been executed. Prior host retention remains required through acceptance for rollback.
Date: 2026-11-10.

The approved [GA Solutions mantra](https://app.notion.com/p/412f135054ba81e9b90ce26bb92bedfb)
selects company-owned Railway hosting. Move the existing Next.js application only; preserve
Neon PostgreSQL, Neon Auth, household authorization, financial calculations, localization
and provider contracts. Clerk is an explicit separate migration scope.

Use a non-root standalone Node container with a pinned Node/pnpm toolchain and frozen
lockfile. Keep static assets with the server. Do not pass credentials as build arguments.
Run reviewed migrations once as an explicit release operation, never during image builds,
previews, application startup or every replica's boot. Keep existing CI quality gates.

The source does not implement the durable Vercel Workflow contemplated in ADR-0005.
Classification is a client-reinvoked batch over pending transaction state; no `after()` or
`waitUntil()` use was found. Retain this design initially; a new worker is not justified merely
by hosting. Validate concurrency, restart recovery, free-cap accounting and streaming before
acceptance. AI Gateway remains an external Vercel dependency using `AI_GATEWAY_API_KEY`.

Keep one owner for each schedule. The current Vercel schedules remain active until a
reviewed, approved handover; do not provision an active Railway scheduler yet. The local implementation adds durable occurrence/owner coordination in a versioned hosting schema,
short transaction locks, and a reconciliation fence for ambiguous external effects. Failed or interrupted
runs are never automatically reclaimed. The digest reports send-before-ledger gaps explicitly; this is
not an exactly-once delivery guarantee. Real PostgreSQL concurrency and provider recovery validation
remain release blockers. Legacy unguarded Vercel endpoints must be fenced before Railway can own jobs.

ADR-0001 describes the original Vercel deployment and an older auth branding, not a permanent
hosting requirement. ADR-0005 describes intent that differs from the current implementation.
This decision supersedes their hosting assumptions only after acceptance. ADR-0019's
email contract remains; its scheduler host will change during the approved cutover.

See [the live inventory and runbook](../deployment/railway.md). Resource limits, observability,
production environment, callback ownership, backup restore evidence and cost measurements
are pending. No savings or validated production readiness is claimed.
