import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { householdRepo } from "@/lib/db/household-repo";
import { activityLog, households } from "@/lib/db/schema";

import { loadActivityLog } from "./load";

let db: ReturnType<typeof drizzle>;

beforeAll(async () => {
  db = drizzle(new PGlite());
  await migrate(db, { migrationsFolder: "./drizzle" });
});

const asRepoDb = (d: typeof db) => d as unknown as Parameters<typeof householdRepo>[0];
const A_MEMBER = "00000000-0000-0000-0000-0000000000aa";

describe("loadActivityLog", () => {
  it("returns the household's entries newest-first", async () => {
    const [h] = await db.insert(households).values({}).returning();
    const repo = householdRepo(asRepoDb(db), h.id);
    await repo.activity.record({ memberId: A_MEMBER, actorName: "Ada", action: "invite.created" });
    await repo.activity.record({ memberId: A_MEMBER, actorName: "Ada", action: "member.left" });

    const entries = await loadActivityLog(repo);
    expect(entries.map((e) => e.action)).toEqual(["member.left", "invite.created"]);
    expect(entries[0]).toMatchObject({ actorName: "Ada", householdId: h.id });
  });

  it("scopes to the bound household", async () => {
    const [a] = await db.insert(households).values({}).returning();
    const [b] = await db.insert(households).values({}).returning();
    const repoA = householdRepo(asRepoDb(db), a.id);
    const repoB = householdRepo(asRepoDb(db), b.id);
    await repoA.activity.record({ memberId: A_MEMBER, actorName: "A", action: "a.did" });
    await repoB.activity.record({ memberId: A_MEMBER, actorName: "B", action: "b.did" });

    expect((await loadActivityLog(repoB)).map((e) => e.action)).toEqual(["b.did"]);
  });

  it("caps the read at the given limit (most recent first)", async () => {
    const [h] = await db.insert(households).values({}).returning();
    const repo = householdRepo(asRepoDb(db), h.id);
    // Seed distinct timestamps via the low-level insert (record() is DB-stamped, so back-to-back
    // calls would tie on created_at and make the ordering non-deterministic).
    await db.insert(activityLog).values(
      ["first", "second", "third"].map((action, i) => ({
        householdId: h.id,
        memberId: A_MEMBER,
        actorName: "Ada",
        action,
        createdAt: new Date(`2026-01-0${i + 1}T00:00:00Z`),
      })),
    );
    const entries = await loadActivityLog(repo, 2);
    expect(entries.map((e) => e.action)).toEqual(["third", "second"]);
  });
});
