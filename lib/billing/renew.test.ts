import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { households } from "@/lib/db/schema";

import { dueForRenewal } from "./renew";

const PAST = new Date("2026-01-01T00:00:00Z");
const FUTURE = new Date("2026-12-01T00:00:00Z");
const NOW = new Date("2026-06-30T00:00:00Z");

describe("dueForRenewal", () => {
  let db: ReturnType<typeof drizzle>;
  const asDb = (d: typeof db) => d as unknown as Parameters<typeof dueForRenewal>[0];

  beforeAll(async () => {
    db = drizzle(new PGlite());
    await migrate(db, { migrationsFolder: "./drizzle" });
  });

  it("returns only Premium households that are due and have a token + period", async () => {
    const [due] = await db
      .insert(households)
      .values({
        plan: "Premium",
        planRenewsAt: PAST,
        straumurRecurringDetailReference: "TOK",
        subscriptionPeriod: "monthly",
      })
      .returning();
    // Premium but not yet due.
    await db.insert(households).values({
      plan: "Premium",
      planRenewsAt: FUTURE,
      straumurRecurringDetailReference: "TOK",
      subscriptionPeriod: "monthly",
    });
    // Premium + due but missing the stored token.
    await db.insert(households).values({
      plan: "Premium",
      planRenewsAt: PAST,
      subscriptionPeriod: "monthly",
    });
    // Premium + due + token but no period.
    await db.insert(households).values({
      plan: "Premium",
      planRenewsAt: PAST,
      straumurRecurringDetailReference: "TOK",
    });
    // Free household (default).
    await db.insert(households).values({});

    const result = await dueForRenewal(asDb(db), NOW);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: due.id,
      subscriptionPeriod: "monthly",
      token: "TOK",
      billingCurrency: "ISK",
    });
  });
});
