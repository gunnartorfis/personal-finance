# Personal Finance infrastructure

GA solutions workspace `c3eeb9c9-ecb1-4994-8ea1-4a94ea009093`, project
`2c2ceec6-dacc-4c72-9f2a-fc1f980d57ec`, sole production environment
`55011e12-2ebb-4637-bf00-fe7a95f4fef1`.

Web uses Railway native GitHub autodeploy from `gunnartorfis/personal-finance`, branch
`main`, without a commit pin and with Wait for CI disabled. Dockerfile owns required build
checks. Web's pre-deploy command is `/bin/sh -c 'cd /release && exec node scripts/hosting/migrate.mjs'`,
timeout 300 seconds; `/api/health` gates rollout for 120 seconds. Runtime startup never migrates.
Only web is the migration owner; workers and schedulers must not copy its migration hook.

The TypeScript infrastructure file is still an **unvalidated, unapplied draft**, not the
source of live configuration. Do not apply it: existing Postgres and its volume must be
imported first, and a plan must not delete or replace existing resources. It includes
historical disabled scheduler declarations; no services are created merely to match it.
Current live settings and evidence are in docs/deployment/railway.md. No infrastructure SDK
installation or mutable publishing command is needed for normal releases.
