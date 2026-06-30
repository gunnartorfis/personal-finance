import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { households } from "@/lib/db/schema";

import { downgradeToFree, MAX_RENEWAL_ATTEMPTS, shouldDowngrade } from "./dunning";

describe("shouldDowngrade", () => {
  it("is true only once the attempt cap is reached", () => {
    expect(shouldDowngrade(0)).toBe(false);
    expect(shouldDowngrade(MAX_RENEWAL_ATTEMPTS - 1)).toBe(false);
    expect(shouldDowngrade(MAX_RENEWAL_ATTEMPTS)).toBe(true);
    expect(shouldDowngrade(MAX_RENEWAL_ATTEMPTS + 1)).toBe(true);
  });
});

describe("downgradeToFree", () => {
  let db: ReturnType<typeof drizzle>;
  const asDb = (d: typeof db) => d as unknown as Parameters<typeof downgradeToFree>[0];

  beforeAll(async () => {
    db = drizzle(new PGlite());
    await migrate(db, { migrationsFolder: "./drizzle" });
  });

  it("clears all subscription state in one update (satisfying the CHECKs)", async () => {
    const [h] = await db
      .insert(households)
      .values({
        plan: "Premium",
        planRenewsAt: new Date("2026-03-01T00:00:00Z"),
        subscriptionPeriod: "monthly",
        straumurRecurringDetailReference: "TOK",
        renewalFailureCount: 2,
      })
      .returning();

    await downgradeToFree(asDb(db), h.id);

    const [row] = await db.select().from(households).where(eq(households.id, h.id));
    expect(row.plan).toBe("Free");
    expect(row.planRenewsAt).toBeNull();
    expect(row.subscriptionPeriod).toBeNull();
    expect(row.straumurRecurringDetailReference).toBeNull();
    expect(row.renewalFailureCount).toBe(0);
  });
});
