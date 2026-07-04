import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { migrate } from "drizzle-orm/pglite/migrator"
import { beforeAll, describe, expect, it } from "vitest"

import * as schema from "@/lib/db/schema"
import { digestSends, households, members } from "@/lib/db/schema"

import { digestSendExists, recordDigestSend } from "./sent-ledger"

function freshDb() {
  return drizzle(new PGlite(), { schema })
}
const asDb = (d: ReturnType<typeof freshDb>) => d as unknown as Parameters<typeof digestSendExists>[0]

async function seedMember(db: ReturnType<typeof freshDb>, authUserId: string) {
  const [hh] = await db.insert(households).values({}).returning()
  const [m] = await db.insert(members).values({ householdId: hh.id, authUserId }).returning()
  return { householdId: hh.id, memberId: m.id }
}

describe("digest sent-ledger", () => {
  let db: ReturnType<typeof freshDb>

  beforeAll(async () => {
    db = freshDb()
    await migrate(db, { migrationsFolder: "./drizzle" })
  })

  it("reports no send before one is recorded", async () => {
    const { memberId } = await seedMember(db, "led-none")
    expect(await digestSendExists(asDb(db), memberId, "2026-07")).toBe(false)
  })

  it("reports a send after it is recorded", async () => {
    const { householdId, memberId } = await seedMember(db, "led-one")
    await recordDigestSend(asDb(db), householdId, memberId, "2026-07")
    expect(await digestSendExists(asDb(db), memberId, "2026-07")).toBe(true)
  })

  it("does not report a send for a different cycle", async () => {
    const { householdId, memberId } = await seedMember(db, "led-cycle")
    await recordDigestSend(asDb(db), householdId, memberId, "2026-07")
    expect(await digestSendExists(asDb(db), memberId, "2026-08")).toBe(false)
  })

  it("is idempotent: recording the same (member, cycle) twice keeps one row and does not throw", async () => {
    const { householdId, memberId } = await seedMember(db, "led-idem")
    await recordDigestSend(asDb(db), householdId, memberId, "2026-07")
    await recordDigestSend(asDb(db), householdId, memberId, "2026-07")
    const rows = await db.select().from(digestSends).where(eq(digestSends.memberId, memberId))
    expect(rows).toHaveLength(1)
  })
})
