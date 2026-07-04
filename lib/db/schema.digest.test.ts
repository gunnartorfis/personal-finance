import { PGlite } from "@electric-sql/pglite";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { digestSends, households, members } from "./schema";

/**
 * Schema coverage for the Digest opt-out flag + send ledger (#102, ADR-0019).
 *
 * `digest_sends` is the append-only idempotency ledger that lets the monthly cron dedup: exactly
 * one row per (Member, Statement cycle), so a retried or double-fired run never double-sends.
 * `members.digest_unsubscribed_at` is the per-Member opt-out (null = subscribed).
 */
function freshDb() {
  return drizzle(new PGlite(), {
    schema: { households, members, digestSends },
  });
}

/** Seed a Household with one Member; returns both ids. */
async function seed(db: ReturnType<typeof freshDb>, authUserId: string) {
  const [hh] = await db.insert(households).values({}).returning();
  const [member] = await db
    .insert(members)
    .values({ householdId: hh.id, authUserId })
    .returning();
  return { householdId: hh.id, memberId: member.id };
}

describe("digest schema", () => {
  let db: ReturnType<typeof freshDb>;

  beforeAll(async () => {
    db = freshDb();
    await migrate(db, { migrationsFolder: "./drizzle" });
  });

  it("subscribes a Member by default (digest_unsubscribed_at is null)", async () => {
    const { memberId } = await seed(db, "digest-default-sub");
    const [row] = await db.select().from(members).where(eq(members.id, memberId));
    expect(row.digestUnsubscribedAt).toBeNull();
  });

  it("records when a Member unsubscribes", async () => {
    const { memberId } = await seed(db, "digest-unsub");
    const when = new Date("2026-03-01T00:00:00.000Z");
    await db.update(members).set({ digestUnsubscribedAt: when }).where(eq(members.id, memberId));
    const [row] = await db.select().from(members).where(eq(members.id, memberId));
    expect(row.digestUnsubscribedAt?.toISOString()).toBe(when.toISOString());
  });

  it("records a digest send for a Member and cycle", async () => {
    const { householdId, memberId } = await seed(db, "digest-send-ok");
    const [row] = await db
      .insert(digestSends)
      .values({ householdId, memberId, cycleKey: "2026-02" })
      .returning();
    expect(row.cycleKey).toBe("2026-02");
    expect(row.sentAt).toBeInstanceOf(Date);
  });

  it("rejects a second send for the same Member and cycle (idempotency ledger)", async () => {
    const { householdId, memberId } = await seed(db, "digest-send-dupe");
    await db.insert(digestSends).values({ householdId, memberId, cycleKey: "2026-02" });
    await expect(
      db.insert(digestSends).values({ householdId, memberId, cycleKey: "2026-02" }),
    ).rejects.toThrow();
  });

  it("allows the same Member a send in a different cycle", async () => {
    const { householdId, memberId } = await seed(db, "digest-send-two-cycles");
    await db.insert(digestSends).values({ householdId, memberId, cycleKey: "2026-02" });
    await db.insert(digestSends).values({ householdId, memberId, cycleKey: "2026-03" });
    const rows = await db.select().from(digestSends).where(eq(digestSends.memberId, memberId));
    expect(rows).toHaveLength(2);
  });

  it("rejects a malformed cycle key (CHECK)", async () => {
    const { householdId, memberId } = await seed(db, "digest-send-badkey");
    await expect(
      db.insert(digestSends).values({ householdId, memberId, cycleKey: "2026-2" }),
    ).rejects.toThrow();
  });

  it("rejects a send whose Member belongs to another Household (composite tenant FK)", async () => {
    const a = await seed(db, "digest-tenant-a");
    const b = await seed(db, "digest-tenant-b");
    await expect(
      db.insert(digestSends).values({ householdId: a.householdId, memberId: b.memberId, cycleKey: "2026-02" }),
    ).rejects.toThrow();
  });

  it("cascades away a Member's send ledger when the Member is deleted", async () => {
    const { householdId, memberId } = await seed(db, "digest-send-cascade");
    await db.insert(digestSends).values({ householdId, memberId, cycleKey: "2026-02" });
    await db.delete(members).where(and(eq(members.id, memberId), eq(members.householdId, householdId)));
    const rows = await db.select().from(digestSends).where(eq(digestSends.memberId, memberId));
    expect(rows).toHaveLength(0);
  });
});
