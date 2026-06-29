# Background classification on Sonnet 4.6

A premium Household can upload thousands of rows at once (e.g. a full-year backfill), which exceeds serverless request timeouts, and running Opus on every row is a margin killer for a freemium product where we pay for inference. Classification therefore runs as an **async pipeline**: each Transaction carries a `classification_status` (`pending`/`classified`/`failed`) drained by a durable background worker (leaning Vercel Workflow), with the UI polling Upload progress. The classifier model is **Sonnet 4.6**, and deterministic **Merchant rules** run first so rule-matched rows skip the model entirely; per-row confidence + reasoning are retained.

## Considered Options

- **Synchronous classification inside the upload request** — rejected: times out on large uploads.
- **Opus 4.8 (the local tool's model)** — rejected: bucketing a named merchant isn't reasoning-heavy; Opus-per-row doesn't pencil out. Revisit only if Sonnet shows a quality gap in testing.

## Consequences

- The pipeline mirrors the old resumable CLI: idempotent, crash-safe, resumes where it stopped.
