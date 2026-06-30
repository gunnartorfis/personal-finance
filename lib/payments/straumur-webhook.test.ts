import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { straumurPayments } from "@/lib/db/schema";

import {
  extractRecurringDetailReference,
  parseHouseholdIdFromReference,
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
