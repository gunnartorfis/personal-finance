# Contributing

Personal Finance is the hosted Next.js application described in [README.md](README.md),
not the frozen Vite tool in `legacy/`.

Use Node 24.21.0 and pnpm 11.9.0; install with `pnpm install --frozen-lockfile`.
Read `AGENTS.md`, `CONTEXT.md`, the relevant architecture decisions and the installed
Next.js documentation before implementing changes. UI strings belong in both message
catalogs; use locale-aware formatting helpers and `renderWithIntl` in component tests.

Before submitting a PR, run lint, typecheck, test:run, test:hosting, build, db:check,
and the pinned React Doctor full scan. CI additionally generates migrations to detect
schema drift, builds both Docker targets, and enforces React Doctor's 100/100 quality gate.
Use Conventional Commits and describe the resulting behavior and validation.

Develop against isolated Neon/Auth instances with synthetic records and sandbox providers.
Never commit statements, tokens, environment files, provider responses or financial screenshots.
Builds and application startup must not apply migrations. Follow
[the deployment runbook](docs/deployment/railway.md) for controlled migration/release work.
