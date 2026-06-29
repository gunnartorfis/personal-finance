import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { households } from "./schema";

// Exercise the real committed migrations against an in-memory Postgres so the schema and the
// migration pipeline are verified in CI without a live Neon database.
function freshDb() {
  return drizzle(new PGlite(), { schema: { households } });
}

describe("database migrations", () => {
  let db: ReturnType<typeof freshDb>;

  beforeAll(async () => {
    db = freshDb();
    await migrate(db, { migrationsFolder: "./drizzle" });
  });

  it("creates the households table and round-trips a row", async () => {
    const [created] = await db.insert(households).values({}).returning();
    expect(created.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(created.createdAt).toBeDefined();

    const all = await db.select().from(households);
    expect(all).toHaveLength(1);
  });

  it("generates a distinct id per household", async () => {
    const [a] = await db.insert(households).values({}).returning();
    const [b] = await db.insert(households).values({}).returning();
    expect(a.id).not.toBe(b.id);
  });
});
