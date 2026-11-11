import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit config: generates PostgreSQL migrations. Controlled production migrations
 * run separately through the Railway migration service (ADR-0028). DATABASE_URL is
 * only needed by commands that connect to the database, never by the application build.
 */
const url = process.env.DATABASE_URL;

// Commands that open a database connection must fail fast with a clear message when the URL is
// missing, instead of passing "" and erroring deep in the Postgres connection path. `generate`
// works offline, so it doesn't require a URL.
const DB_COMMANDS = ["migrate", "push", "pull", "drop", "up", "studio"];
if (!url && process.argv.some((arg) => DB_COMMANDS.includes(arg))) {
  throw new Error(
    "DATABASE_URL is not set. Add it to .env.local (loaded automatically by the db scripts) or your environment.",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: url ?? "" },
});
