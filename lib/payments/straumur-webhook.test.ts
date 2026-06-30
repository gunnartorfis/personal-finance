import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { households, straumurPayments } from "@/lib/db/schema";

import {
  activatePremiumFromAuthorization,
  extractRecurringDetailReference,
  parseHouseholdIdFromReference,
  parsePeriodFromReference,
  recordWebhookEvent,
} from "./straumur-webhook";

const UUID = "11111111-1111-1111-1111-111111111111";

describe("parseHouseholdIdFromReference", () => {
  it("extracts the householdId from a subscription reference", () => {
    expect(parseHouseholdIdFromReference(`sub_${UUID}_monthly_1719_abc123`)).toBe(UUID);
  });

  it("returns null for non-subscription or malformed references", () => {
    expect(parseHouseholdIdFromReference("checkout_xyz")).toBeNull();
    expect(parseHouseholdIdFromReference("sub_not-a-uuid_monthly_1")).toBeNull();
    expect(parseHouseholdIdFromReference(null)).toBeNull();
    expect(parseHouseholdIdFromReference("")).toBeNull();
  });
});

describe("parsePeriodFromReference", () => {
  it("reads the period segment of a subscription reference", () => {
    expect(parsePeriodFromReference(`sub_${UUID}_monthly_1_a`)).toBe("monthly");
    expect(parsePeriodFromReference(`sub_${UUID}_annual_1_a`)).toBe("annual");
  });

  it("returns null for an unknown period or non-subscription reference", () => {
    expect(parsePeriodFromReference(`sub_${UUID}_weekly_1`)).toBeNull();
    expect(parsePeriodFromReference("checkout_x")).toBeNull();
    expect(parsePeriodFromReference(null)).toBeNull();
  });
});

describe("extractRecurringDetailReference", () => {
  it("reads either additionalData key", () => {
    expect(extractRecurringDetailReference({ "recurring.recurringDetailReference": "TOK1" })).toBe("TOK1");
    expect(extractRecurringDetailReference({ recurringDetailReference: "TOK2" })).toBe("TOK2");
  });

  it("returns null when absent", () => {
    expect(extractRecurringDetailReference({})).toBeNull();
    expect(extractRecurringDetailReference(null)).toBeNull();
    expect(extractRecurringDetailReference({ recurringDetailReference: 5 })).toBeNull();
  });
});

describe("recordWebhookEvent", () => {
  let db: ReturnType<typeof drizzle>;
  const asDb = (d: typeof db) => d as unknown as Parameters<typeof recordWebhookEvent>[0];

  beforeAll(async () => {
    db = drizzle(new PGlite());
    await migrate(db, { migrationsFolder: "./drizzle" });
  });

  const base = {
    pspReference: "psp_1",
    householdId: UUID,
    merchantReference: `sub_${UUID}_monthly_1`,
    checkoutReference: "chk_1",
    recurringDetailReference: "TOK",
    amount: 199000,
    currency: "ISK",
    success: true,
    eventCode: "Authorization",
    reason: null,
    rawEvent: "{}",
  };

  it("inserts an event then upserts the same pspReference in place (idempotent)", async () => {
    await recordWebhookEvent(asDb(db), base);
    let rows = await db.select().from(straumurPayments).where(eq(straumurPayments.pspReference, "psp_1"));
    expect(rows).toHaveLength(1);
    expect(rows[0].householdId).toBe(UUID);
    expect(rows[0].recurringDetailReference).toBe("TOK");
    expect(rows[0].success).toBe(true);

    // Re-deliver the same event with a changed field — patches, not duplicates.
    await recordWebhookEvent(asDb(db), { ...base, success: false, reason: "REFUSED" });
    rows = await db.select().from(straumurPayments).where(eq(straumurPayments.pspReference, "psp_1"));
    expect(rows).toHaveLength(1);
    expect(rows[0].success).toBe(false);
    expect(rows[0].reason).toBe("REFUSED");
  });
});

describe("activatePremiumFromAuthorization", () => {
  let db: ReturnType<typeof drizzle>;
  const asDb = (d: typeof db) => d as unknown as Parameters<typeof activatePremiumFromAuthorization>[0];

  beforeAll(async () => {
    db = drizzle(new PGlite());
    await migrate(db, { migrationsFolder: "./drizzle" });
  });

  it("sets Premium + renewal date + token, idempotently and preserving the token", async () => {
    const [h] = await db.insert(households).values({}).returning();
    expect(h.plan).toBe("Free");

    await activatePremiumFromAuthorization(asDb(db), {
      householdId: h.id,
      period: "monthly",
      recurringDetailReference: "TOK",
      now: new Date("2026-03-15T00:00:00Z"),
    });
    let [row] = await db.select().from(households).where(eq(households.id, h.id));
    expect(row.plan).toBe("Premium");
    expect(row.planRenewsAt?.toISOString()).toBe("2026-04-15T00:00:00.000Z");
    expect(row.straumurRecurringDetailReference).toBe("TOK");

    // A later event with no token must not clear the stored one; re-running is harmless.
    await activatePremiumFromAuthorization(asDb(db), {
      householdId: h.id,
      period: "annual",
      recurringDetailReference: null,
      now: new Date("2026-04-15T00:00:00Z"),
    });
    [row] = await db.select().from(households).where(eq(households.id, h.id));
    expect(row.plan).toBe("Premium");
    expect(row.planRenewsAt?.toISOString()).toBe("2027-04-15T00:00:00.000Z");
    expect(row.straumurRecurringDetailReference).toBe("TOK"); // preserved
  });
});
