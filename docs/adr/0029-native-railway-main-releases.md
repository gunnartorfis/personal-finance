# Native Railway releases from main

Date: 2026-11-11. Status: implemented; first native deployment verified, push-trigger verification pending.

GA Solutions now prefers Railway native GitHub autodeploy from main, production only.
This supersedes the GitHub Actions publishing workflow and dedicated migration-service
release orchestration described in ADR-0028. Existing application/authentication/provider
scope remains unchanged.

Dockerfile runs lint, typecheck, application tests, native hosting tests, Drizzle checks,
Git-independent migration drift detection, pinned React Doctor and Next build. Failed
checks prevent creating a releasable image. Private credentials are not build arguments.

Web owns the Railway pre-deploy migration hook. An isolated /release tool tree inside
the same immutable image contains locked migration dependencies and SQL. Pre-deploy runs
in Railway's private network, with environment, approval, target-host and service-owner
guards, a session advisory lock and persisted migration/checksum ledgers. Concurrent
migration ownership fails closed; retries skip already-applied work. Build, startup,
workers and schedulers never migrate. Historical migration service has no source/trigger
and its approval is disabled. A failed pre-deploy or health check prevents rollout.

Railway follows main without a SHA pin; Wait for CI is disabled. Obsolete GitHub required
checks are removed while unrelated branch protections remain. GitHub Actions publishing
scripts/artifacts and duplicate build workflows are removed. Railway deployment metadata
and /api/health record the deployed SHA; the SHA identifies a revision, not a user-maintained
release setting. Rollback normally reverts main through the same native pipeline.

A compatible application rollback does not undo schema changes, financial writes or
external effects. Preserve the database and reconcile forward when necessary. The existing
Clerk development-instance exception and wider migration acceptance gates are unchanged.

The first native source deployment of main 70fc226502d4f12ce1f7f816eb3c991a0aa60010
reached SUCCESS as 7c98f6c7-e8d5-480d-9c83-f5644f5c7cd3. Docker pre-deploy uses an
explicit shell: `/bin/sh -c 'cd /release && exec node scripts/hosting/migrate.mjs'`.
After changing lifecycle settings, create a fresh deployment: reusing a prior deployment
can preserve its previous manifest. See the runbook for build, migration and health evidence.
