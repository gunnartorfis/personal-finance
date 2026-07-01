import { spawnSync } from "node:child_process";

// Runs drizzle migrations as part of `pnpm build`, but only for Vercel production builds.
// Preview builds share the production DATABASE_URL, so migrating there would apply
// unmerged schema changes to the live database. Local/CI builds have no VERCEL_ENV
// and skip too.
if (process.env.VERCEL_ENV !== "production") {
  console.log(
    `Skipping DB migrations (VERCEL_ENV=${process.env.VERCEL_ENV ?? "unset"}).`,
  );
  process.exit(0);
}

const result = spawnSync(
  "node",
  ["node_modules/drizzle-kit/bin.cjs", "migrate"],
  { stdio: "inherit" },
);
// status is null when the process failed to start (missing node_modules, bad path)
// or was signal-killed; surface why so the failed build is debuggable from Vercel logs.
if (result.error) console.error("Failed to run drizzle-kit:", result.error);
if (result.signal) console.error(`drizzle-kit killed by signal ${result.signal}`);
process.exit(result.status ?? 1);
