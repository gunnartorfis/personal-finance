# Personal Finance / Auratal

A hosted Next.js application for household finances. Households upload CSV statements,
review classifications, manage budgets and savings, and optionally connect bank accounts.
The new target uses tenant-scoped Railway PostgreSQL and Clerk authentication. This is a
fresh start: existing Neon data and users are not imported. Icelandic (`is`, default) and English (`en`) are supported per member.

The old Vite application is frozen in `legacy/`. Earlier versions of this README described
that application; the current application does **not** keep customer data solely on the
user's machine. `CONTEXT.md` and `docs/adr/` define current financial behavior.

## Development

Use Node **24.21.0** (`.node-version`) and **pnpm 11.9.0** (`packageManager`).

```sh
cd ~/code/personal-finance
pnpm install --frozen-lockfile
pnpm dev
```

The development server listens on http://localhost:3000. Configure a dedicated development
PostgreSQL database and Clerk application with `DATABASE_URL`,
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` in an ignored `.env.local`. Never use production records or
provider credentials in automated tests. See the deployment inventory for integration variables.

## Checks and builds

```sh
cd ~/code/personal-finance
pnpm lint
pnpm typecheck
pnpm test:run
pnpm test:hosting
pnpm db:check
pnpm db:generate  # offline; CI rejects uncommitted generated migrations
pnpm build       # build only: never migrates a database
```

CI also requires the pinned React Doctor full scan to score 100/100 and builds the runtime
and separate runtime/migration Dockerfiles. `pnpm start` runs the built app locally. Docker uses the
standalone server, includes static assets, and runs as a non-root user.

## Database migrations

Migrations are reviewed release operations, separate from builds and application startup.
The former `scripts/migrate-on-vercel.mjs` ran migrations in production builds and is retired.
`pnpm db:migrate` now requires an explicit target, an independently configured direct database
hostname, and approval. Read [the release runbook](docs/deployment/railway.md) before running it.
Never migrate from previews. Railway uses a single production environment; automated
deployment checks use synthetic households and must not charge, sync or email real accounts.

## Hosting migration status

The new application is deployed at https://web-production-a5531.up.railway.app with fresh
Railway PostgreSQL and Clerk development authentication for initial verification. Old records
and identities were intentionally not imported. The previous Vercel host remains available
through acceptance. Financial/provider, household-isolation and recovery acceptance are pending;
the migration is **not yet accepted for retiring old resources**.

Production containers require runtime `APP_ORIGIN` set to the canonical public HTTPS origin.
It determines banking callbacks, payment returns and digest links; never use the container's
bind address as a public URL. The origin fix is currently local and pending deployment.
Passing `main` commits release automatically through GitHub after CI, with a separate migration
service completing before the web deployment. See the runbook for current revision evidence.

- [Deployment inventory, evidence, remaining gates and cutover/rollback](docs/deployment/railway.md)
- [Railway architecture decision](docs/adr/0027-portable-railway-hosting.md)
- [Infrastructure draft](.railway/README.md)
- [Contribution rules](CONTRIBUTING.md) and [localization rules](AGENTS.md)

Credentials and customer financial records belong in secret stores and product databases,
never in Git, build arguments, Notion, logs or verification artifacts.
