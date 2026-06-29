import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit config (ADR-0001): generates and runs SQL migrations for the Neon Postgres
 * database. `DATABASE_URL` is read from the environment (Vercel env in production; `.env.local`
 * locally) and is only needed for commands that touch the database (e.g. `migrate`).
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
