# Hosted SaaS on Next.js / Vercel + Neon

The project was a local Vite SPA with a dev-only file-based API and a user-run `classify` CLI. Going public — multi-tenant, with us paying for inference — needs a real server, database, and auth. We are rebuilding it as a **Next.js (App Router) app on Vercel (EU region)**, with **Neon Postgres** for data and **Neon Auth (Stack)** for identity; the `shared/` core (parse, types, rules) is reused, and the local Vite/JSON tool is frozen, not feature-matched.

## Considered Options

- **Keep the Vite SPA + add serverless functions** — rejected: pushes auth and access-control for financial data into the browser, and means two runtimes to reason about.

## Consequences

- EU hosting (Neon + Vercel) is a GDPR choice, not a default — keep it.
- Lock-in to Vercel + Neon + Stack Auth; swapping any of the three is a quarter-scale job.
