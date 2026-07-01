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
process.exit(result.status ?? 1);
