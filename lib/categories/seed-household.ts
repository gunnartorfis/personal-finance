import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { categories } from "@/lib/db/schema";
import type * as schema from "@/lib/db/schema";

import { CATEGORY_SEED } from "./seed";

type Db = NodePgDatabase<typeof schema>;

/**
 * Seed a Household's initial Category taxonomy (ADR-0020, #105) from the curated {@link CATEGORY_SEED}
 * — group rows first, then their leaf subcategories linked by `parent_id`, all flagged `is_seed`.
 * Called once inside the Household-provisioning transaction. Idempotency is the caller's concern
 * (the `(household_id, slug)` unique constraint guards against a double-seed).
 */
export async function seedCategoriesForHousehold(db: Db, householdId: string): Promise<void> {
  const groupRows = await db
    .insert(categories)
    .values(
      CATEGORY_SEED.map((group, index) => ({
        householdId,
        slug: group.slug,
        labelKey: group.labelKey,
        icon: group.icon,
        isSeed: true,
        sortOrder: index,
      })),
    )
    .returning({ id: categories.id, slug: categories.slug });

  const groupIdBySlug = new Map(groupRows.map((row) => [row.slug, row.id]));

  const leafValues = CATEGORY_SEED.flatMap((group) => {
    const parentId = groupIdBySlug.get(group.slug);
    if (!parentId) throw new Error(`seed group insert returned no row: ${group.slug}`);
    return group.children.map((leaf, index) => ({
      householdId,
      parentId,
      slug: leaf.slug,
      labelKey: leaf.labelKey,
      defaultExpenseType: leaf.defaultExpenseType,
      icon: leaf.icon,
      synonyms: [...leaf.synonyms],
      isSeed: true,
      sortOrder: index,
    }));
  });

  await db.insert(categories).values(leafValues);
}
