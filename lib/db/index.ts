import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

/**
 * The application's Neon Postgres connection (ADR-0001).
 *
 * Built lazily from `DATABASE_URL` on first use so that importing this module never requires the
 * env var (e.g. during build, or in tests that use their own in-memory database). Uses
 * node-postgres over TCP, which works on Vercel's Node runtime and supports transactions.
 */
let pool: Pool | undefined;
let database: NodePgDatabase<typeof schema> | undefined;

export function getDb(): NodePgDatabase<typeof schema> {
  if (!database) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set");
    }
    pool = new Pool({ connectionString });
    database = drizzle(pool, { schema });
  }
  return database;
}

/**
 * Close the connection pool, if one was opened. Safe to call when no pool exists. Use in tests,
 * one-off scripts, and graceful-shutdown paths so TCP handles don't leak.
 */
export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
    database = undefined;
  }
}
