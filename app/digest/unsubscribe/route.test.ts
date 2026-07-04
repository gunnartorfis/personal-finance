import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { migrate } from "drizzle-orm/pglite/migrator"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { digestUnsubscribeToken } from "@/lib/digest/unsubscribe-token"
import * as schema from "@/lib/db/schema"
import { households, members } from "@/lib/db/schema"

const holder = vi.hoisted(() => ({ db: null as unknown }))
vi.mock("@/lib/db", () => ({ getDb: () => holder.db }))

import { GET } from "./route"

const SECRET = "unsub-secret-abc"

function freshDb() {
  return drizzle(new PGlite(), { schema })
}

async function seedMember(db: ReturnType<typeof freshDb>, authUserId: string) {
  const [hh] = await db.insert(households).values({}).returning()
  const [m] = await db.insert(members).values({ householdId: hh.id, authUserId }).returning()
  return m.id
}

async function unsubscribedAt(db: ReturnType<typeof freshDb>, memberId: string) {
  const [row] = await db.select().from(members).where(eq(members.id, memberId))
  return row.digestUnsubscribedAt
}

const req = (query: string) => new Request(`https://auratal.is/digest/unsubscribe?${query}`)

describe("GET /digest/unsubscribe", () => {
  let db: ReturnType<typeof freshDb>

  beforeAll(async () => {
    db = freshDb()
    await migrate(db, { migrationsFolder: "./drizzle" })
    holder.db = db
  })
  beforeEach(() => vi.stubEnv("DIGEST_UNSUBSCRIBE_SECRET", SECRET))
  afterEach(() => vi.unstubAllEnvs())

  it("unsubscribes the member for a valid token and confirms in their locale", async () => {
    const memberId = await seedMember(db, "u-valid")
    const token = digestUnsubscribeToken(memberId, SECRET)
    const res = await GET(req(`token=${token}&l=en`))

    expect(res.status).toBe(200)
    expect(await res.text()).toContain("unsubscribed")
    expect(await unsubscribedAt(db, memberId)).toBeInstanceOf(Date)
  })

  it("renders the confirmation in Icelandic when l=is", async () => {
    const memberId = await seedMember(db, "u-is")
    const token = digestUnsubscribeToken(memberId, SECRET)
    const res = await GET(req(`token=${token}&l=is`))
    expect(await res.text()).toContain("afskráð")
  })

  it("rejects a forged token and changes nothing", async () => {
    const memberId = await seedMember(db, "u-forged")
    const token = digestUnsubscribeToken(memberId, "wrong-secret")
    const res = await GET(req(`token=${token}&l=en`))

    expect(res.status).toBe(400)
    expect(await unsubscribedAt(db, memberId)).toBeNull()
  })

  it("rejects when no token is supplied", async () => {
    const res = await GET(req("l=en"))
    expect(res.status).toBe(400)
  })
})
