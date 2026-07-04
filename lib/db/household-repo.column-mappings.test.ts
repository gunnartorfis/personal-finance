import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { householdRepo } from "./household-repo";
import { households } from "./schema";

let db: ReturnType<typeof drizzle>;
const repoDb = (d: typeof db) => d as unknown as Parameters<typeof householdRepo>[0];

beforeAll(async () => {
  db = drizzle(new PGlite());
  await migrate(db, { migrationsFolder: "./drizzle" });
});

async function household() {
  const [hh] = await db.insert(households).values({}).returning();
  return householdRepo(repoDb(db), hh.id);
}

const MAPPING = { date: 0, merchant: 1, category: 2, amount: 3 };

describe("repo.columnMappings", () => {
  it("returns undefined for an unknown signature", async () => {
    const repo = await household();
    expect(await repo.columnMappings.findBySignature("nope")).toBeUndefined();
  });

  it("remembers a mapping and finds it back by signature", async () => {
    const repo = await household();
    await repo.columnMappings.upsert("dagsetning|motadili|tegund|upphaed", MAPPING);
    const row = await repo.columnMappings.findBySignature("dagsetning|motadili|tegund|upphaed");
    expect(row?.columns).toEqual(MAPPING);
  });

  it("upserts in place on the same signature (re-confirming updates, not duplicates)", async () => {
    const repo = await household();
    await repo.columnMappings.upsert("sig", MAPPING);
    const updated = { date: 3, merchant: 2, category: 1, amount: 0 };
    await repo.columnMappings.upsert("sig", updated);
    const row = await repo.columnMappings.findBySignature("sig");
    expect(row?.columns).toEqual(updated);
  });

  it("scopes lookups to the household", async () => {
    const a = await household();
    const b = await household();
    await a.columnMappings.upsert("shared-sig", MAPPING);
    expect(await b.columnMappings.findBySignature("shared-sig")).toBeUndefined();
  });
});
