import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { householdRepo } from "./household-repo";
import { households } from "./schema";

let db: ReturnType<typeof drizzle>;

beforeAll(async () => {
  db = drizzle(new PGlite());
  await migrate(db, { migrationsFolder: "./drizzle" });
});

// pglite's drizzle db exposes the same query surface; cast to the repo's expected db type.
const asRepoDb = (d: typeof db) => d as unknown as Parameters<typeof householdRepo>[0];

async function freshHousehold() {
  const [h] = await db.insert(households).values({}).returning();
  return { repo: householdRepo(asRepoDb(db), h.id), id: h.id };
}

const A_MEMBER = "00000000-0000-0000-0000-0000000000aa";

describe("householdRepo.activity", () => {
  it("records an entry stamped with the bound household id", async () => {
    const { repo, id } = await freshHousehold();
    const [entry] = await repo.activity.record({
      memberId: A_MEMBER,
      actorName: "Ada",
      action: "transaction.excluded",
      payload: { transactionId: "tx-1", summary: "Excluded Netflix" },
    });
    expect(entry.householdId).toBe(id);
    expect(entry.action).toBe("transaction.excluded");
    expect(entry.actorName).toBe("Ada");
    expect(entry.memberId).toBe(A_MEMBER);
    expect(entry.payload).toEqual({ transactionId: "tx-1", summary: "Excluded Netflix" });
  });

  it("defaults payload to an empty object when omitted", async () => {
    const { repo } = await freshHousehold();
    const [entry] = await repo.activity.record({
      memberId: A_MEMBER,
      actorName: "Ada",
      action: "data.reset",
    });
    expect(entry.payload).toEqual({});
  });

  it("scopes the log to the bound household", async () => {
    const { repo: a } = await freshHousehold();
    const { repo: b } = await freshHousehold();
    await a.activity.record({ memberId: A_MEMBER, actorName: "Ada", action: "a.did" });
    await b.activity.record({ memberId: A_MEMBER, actorName: "Bob", action: "b.did" });
    const aLog = await a.activity.list();
    expect(aLog).toHaveLength(1);
    expect(aLog[0].action).toBe("a.did");
  });

  it("lists entries newest-first", async () => {
    const { repo } = await freshHousehold();
    await repo.activity.record({
      memberId: A_MEMBER,
      actorName: "Ada",
      action: "first",
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });
    await repo.activity.record({
      memberId: A_MEMBER,
      actorName: "Ada",
      action: "second",
      createdAt: new Date("2026-02-01T00:00:00Z"),
    });
    const log = await repo.activity.list();
    expect(log.map((e) => e.action)).toEqual(["second", "first"]);
  });
});
