import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { migrate } from "drizzle-orm/pglite/migrator"
import { beforeAll, describe, expect, it } from "vitest"

import * as schema from "@/lib/db/schema"
import { households, members } from "@/lib/db/schema"

import { isDigestSubscribed, setDigestSubscription } from "./subscription"

function freshDb() {
  return drizzle(new PGlite(), { schema })
}
const asDb = (d: ReturnType<typeof freshDb>) => d as unknown as Parameters<typeof setDigestSubscription>[0]

async function seedMember(db: ReturnType<typeof freshDb>, authUserId: string) {
  const [hh] = await db.insert(households).values({}).returning()
  const [m] = await db.insert(members).values({ householdId: hh.id, authUserId }).returning()
  return m.id
}

async function unsubscribedAt(db: ReturnType<typeof freshDb>, memberId: string) {
  const [row] = await db.select().from(members).where(eq(members.id, memberId))
  return row.digestUnsubscribedAt
}

describe("setDigestSubscription", () => {
  let db: ReturnType<typeof freshDb>

  beforeAll(async () => {
    db = freshDb()
    await migrate(db, { migrationsFolder: "./drizzle" })
  })

  it("stamps digest_unsubscribed_at when unsubscribing", async () => {
    const memberId = await seedMember(db, "sub-off")
    await setDigestSubscription(asDb(db), memberId, false)
    expect(await unsubscribedAt(db, memberId)).toBeInstanceOf(Date)
  })

  it("clears digest_unsubscribed_at when re-subscribing", async () => {
    const memberId = await seedMember(db, "sub-on")
    await setDigestSubscription(asDb(db), memberId, false)
    await setDigestSubscription(asDb(db), memberId, true)
    expect(await unsubscribedAt(db, memberId)).toBeNull()
  })

  it("reports subscribed by default and reflects an unsubscribe", async () => {
    const memberId = await seedMember(db, "sub-status")
    expect(await isDigestSubscribed(asDb(db), memberId)).toBe(true)
    await setDigestSubscription(asDb(db), memberId, false)
    expect(await isDigestSubscribed(asDb(db), memberId)).toBe(false)
  })

  it("defaults to subscribed for a missing member (schema convention: null = subscribed)", async () => {
    expect(await isDigestSubscribed(asDb(db), "00000000-0000-0000-0000-000000000000")).toBe(true)
  })
})
