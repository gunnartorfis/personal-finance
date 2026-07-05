import { PGlite } from "@electric-sql/pglite";
import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { householdRepo } from "./household-repo";
import { categories, households } from "./schema";

let db: ReturnType<typeof drizzle>;
const asRepoDb = (d: typeof db) => d as unknown as Parameters<typeof householdRepo>[0];

beforeAll(async () => {
  db = drizzle(new PGlite());
  await migrate(db, { migrationsFolder: "./drizzle" });
});

async function seededHousehold() {
  const [hh] = await db.insert(households).values({}).returning();
  const repo = householdRepo(asRepoDb(db), hh.id);
  await repo.categories.ensureSeeded();
  return { hh, repo };
}

/** A seeded group (parent_id NULL) and one of its leaves, for the guard cases. */
async function aGroupAndLeaf(hhId: string) {
  const [group] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.householdId, hhId), isNull(categories.parentId)));
  const leafId = (await householdRepo(asRepoDb(db), hhId).categories.leafSlugToId())
    .values()
    .next().value as string;
  return { groupId: group.id, leafId };
}

describe("categories.createCustom (ADR-0020, S6)", () => {
  it("adds a custom leaf under a group", async () => {
    const { hh, repo } = await seededHousehold();
    const { groupId } = await aGroupAndLeaf(hh.id);

    const result = await repo.categories.createCustom({
      parentId: groupId,
      label: "Sundlaug",
      defaultExpenseType: "Necessary",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.row.parentId).toBe(groupId);
    expect(result.row.label).toBe("Sundlaug");
    expect(result.row.labelKey).toBeNull(); // custom rows carry a literal label, not a key
    expect(result.row.isSeed).toBe(false);
    expect(result.row.hidden).toBe(false);
    expect(result.row.slug.startsWith("custom-")).toBe(true);
  });

  it("rejects a parent that is itself a leaf (keeps the tree 2-level)", async () => {
    const { hh, repo } = await seededHousehold();
    const { leafId } = await aGroupAndLeaf(hh.id);
    const result = await repo.categories.createCustom({ parentId: leafId, label: "Too deep" });
    expect(result).toEqual({ ok: false, error: "parent_not_group" });
  });

  it("rejects an unknown parent (and another Household's group is unknown here)", async () => {
    const { repo } = await seededHousehold();
    const { hh: other } = await seededHousehold();
    const { groupId: othersGroup } = await aGroupAndLeaf(other.id);
    // A real group id, but it belongs to another Household → not visible to this repo.
    const result = await repo.categories.createCustom({ parentId: othersGroup, label: "X" });
    expect(result).toEqual({ ok: false, error: "parent_not_found" });
  });
});

describe("categories.setHidden (ADR-0020, S6)", () => {
  it("hides and unhides a Household's own leaf", async () => {
    const { hh, repo } = await seededHousehold();
    const { leafId } = await aGroupAndLeaf(hh.id);

    const hidden = await repo.categories.setHidden(leafId, true);
    expect(hidden.ok && hidden.row.hidden).toBe(true);
    const shown = await repo.categories.setHidden(leafId, false);
    expect(shown.ok && shown.row.hidden).toBe(false);
  });

  it("refuses to hide a group (its leaves would stay classifiable)", async () => {
    const { hh, repo } = await seededHousehold();
    const { groupId } = await aGroupAndLeaf(hh.id);
    expect(await repo.categories.setHidden(groupId, true)).toEqual({ ok: false, error: "is_group" });
  });

  it("won't touch another Household's category (not_found → 404)", async () => {
    const { repo } = await seededHousehold();
    const { hh: other } = await seededHousehold();
    const { leafId: othersLeaf } = await aGroupAndLeaf(other.id);
    expect(await repo.categories.setHidden(othersLeaf, true)).toEqual({
      ok: false,
      error: "not_found",
    });
  });
});
