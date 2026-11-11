# Fresh Railway PostgreSQL and Clerk identity

Date: 2026-11-10. Status: authorized; implementation and provider setup in progress.

The user explicitly requested a Railway database, a new Clerk application, a generated
cron secret, the existing Enable Banking application/key, and Straumur production.
Old data and users do not need to be carried over. This supersedes ADR-0027's original
Neon database/auth preservation constraint. Application behavior, financial calculations,
household boundaries and Icelandic/English localization remain required.

Use a new Railway PostgreSQL 18 service in the existing company project and sole production
environment. Do not import, reset or delete the old Neon database as part of initialization.
Apply the reviewed application and hosting migrations once with the controlled migration
image. The fresh database starts with schedule owners NULL and contains no old billing tokens.
Stop the old scheduler before the new one can own jobs; a fresh database cannot coordinate
ownership with an old database, so legacy host fencing is mandatory.

Use Clerk for new identities. Application-owned household/member/invite tables stay intact;
Clerk IDs are opaque text keys. Resolve primary email and verification from Clerk's backend
user; never trust client email claims or a verified secondary address for invite matching.
Initialize Clerk on pages and APIs while retaining resource-level authorization and the
browser CSRF boundary. Remove the retired Neon Auth API route. Clerk's bundled isIS/enUS
catalogs follow the application's member locale; application chrome stays in messages/*.

Clerk application app_3Luz43tZcw6w2EKYAkwkWbKCIJY was created in the GA Solutions Clerk
workspace, with email sign-in and no social providers. Its production instance still requires
a user-selected owned application domain and DNS verification. Do not substitute development
keys for production acceptance. The default development instance is a Clerk platform resource,
not an additional Railway environment.

The public Clerk publishable key is a Docker build argument and a runtime variable. The
Clerk secret, database connection, banking PEM, cron secret and payment keys are runtime-only.
CI builds use a nonfunctional synthetic public key; real releases must build with the selected
production public key. Pin SDKs older than the repository's seven-day package age window.
The user resolved the lockfile with pnpm 11.9.0; frozen installation and application/container
builds passed CI on commit 4158259.

Rollback before financial activity can restore Vercel and its original database/auth routing.
After new signups, financial writes or external effects, routing back does not merge these
independent datasets or identities. Pause jobs, preserve both systems and reconcile forward;
never silently replace the new database with the old one. Keep the old host through acceptance.

Company policy alignment, 2026-11-11: passing main commits automatically release through
the GitHub workflow. Use a dedicated, NEVER-restarting migration service with Dockerfile.migrations;
wait for a structured production migration completion before releasing web. Record commit
and deployment IDs. Keep native Railway GitHub auto-deploy disconnected to prevent competing
triggers. Build/startup/preview processes never apply production migrations.
