# Contributing

Thanks for your interest! This is a small, local-first personal-finance dashboard
(React + Vite + TypeScript) that classifies a bank-card statement with Claude.

## Setup

- **Node 22+** and **pnpm** (`npm i -g pnpm`)
- `pnpm install`
- See the [README](README.md) for adding your own `combined.csv`, configuring the
  Claude token, and running `pnpm classify` / `pnpm dev`.

You can develop without a Claude token using `pnpm seed` (bootstraps from a CSV
that already has a `Type` column; confidence shows as `—`).

## Development

| Command | What it does |
|---|---|
| `pnpm dev` | Run the app + local data API at http://localhost:5173 |
| `pnpm typecheck` | `tsc --noEmit` — must pass (CI enforces it) |
| `pnpm build` | Production build — must pass (CI enforces it) |

## Conventions

- **TypeScript must compile** with no errors (`pnpm typecheck`) before a PR is ready.
- Use [Conventional Commits](https://www.conventionalcommits.org/) — `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`…
- Keep PRs focused and describe **what** changed and **why**.

## Data & privacy

- **Never commit personal data.** `combined.csv` and `data/` are git-ignored — keep it that way.
- Secrets live in `.env` (git-ignored). Never hardcode tokens; read them from the environment.

## Submitting a PR

1. Branch off `main`.
2. Make your change; run `pnpm typecheck` and `pnpm build` locally.
3. Open a PR against `main`. CI runs typecheck + build on every PR.
