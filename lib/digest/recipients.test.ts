import { PGlite } from "@electric-sql/pglite"
import { sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { migrate } from "drizzle-orm/pglite/migrator"
import { beforeAll, describe, expect, it } from "vitest"

import * as schema from "@/lib/db/schema"
import { households, members } from "@/lib/db/schema"

import { listDigestRecipients } from "./recipients"

function freshDb() {
  return drizzle(new PGlite(), { schema })
}

// The PGlite driver's result type differs from node-postgres; cast at the boundary (repo idiom).
const asDb = (d: ReturnType<typeof freshDb>) => d as unknown as Parameters<typeof listDigestRecipients>[0]

/** Mirror the Neon-managed `neon_auth.users_sync` mirror so the join resolves in tests. */
async function createUsersSync(db: ReturnType<typeof freshDb>) {
  await db.execute(sql`create schema if not exists neon_auth`)
  await db.execute(sql`
    create table neon_auth.users_sync (
      id text primary key,
      name text,
      email text,
      raw_json jsonb,
      created_at timestamptz default now(),
      updated_at timestamptz,
      deleted_at timestamptz
    )
  `)
}

async function seedHousehold(db: ReturnType<typeof freshDb>) {
  const [hh] = await db.insert(households).values({}).returning()
  return hh.id
}

/** Add a Member + its users_sync identity row; returns the memberId. */
async function seedMember(
  db: ReturnType<typeof freshDb>,
  householdId: string,
  authUserId: string,
  opts: {
    email?: string | null
    verified?: boolean
    locale?: string | null
    unsubscribed?: boolean
    deleted?: boolean
  } = {},
) {
  const { email = "m@example.com", verified = true, locale = "en", unsubscribed = false, deleted = false } = opts
  const [member] = await db
    .insert(members)
    .values({
      householdId,
      authUserId,
      locale,
      digestUnsubscribedAt: unsubscribed ? new Date("2026-01-01T00:00:00Z") : null,
    })
    .returning()
  await db.execute(sql`
    insert into neon_auth.users_sync (id, email, raw_json, deleted_at)
    values (
      ${authUserId},
      ${email},
      ${JSON.stringify({ primary_email_verified: verified })}::jsonb,
      ${deleted ? new Date().toISOString() : null}
    )
  `)
  return member.id
}

describe("listDigestRecipients", () => {
  let db: ReturnType<typeof freshDb>

  beforeAll(async () => {
    db = freshDb()
    await migrate(db, { migrationsFolder: "./drizzle" })
    await createUsersSync(db)
  })

  it("includes a verified, subscribed Member with their email and locale, grouped by household", async () => {
    const hh = await seedHousehold(db)
    const memberId = await seedMember(db, hh, "u-ok", { email: "ok@example.com", locale: "is" })

    const result = await listDigestRecipients(asDb(db))
    const household = result.find((h) => h.householdId === hh)
    expect(household).toBeDefined()
    expect(household?.members).toEqual([{ memberId, email: "ok@example.com", locale: "is" }])
  })

  it("excludes an unsubscribed Member", async () => {
    const hh = await seedHousehold(db)
    await seedMember(db, hh, "u-unsub", { unsubscribed: true })
    expect(result(await listDigestRecipients(asDb(db)), hh)).toHaveLength(0)
  })

  it("excludes a Member whose email is not verified", async () => {
    const hh = await seedHousehold(db)
    await seedMember(db, hh, "u-unverified", { verified: false })
    expect(result(await listDigestRecipients(asDb(db)), hh)).toHaveLength(0)
  })

  it("excludes a Member with no email", async () => {
    const hh = await seedHousehold(db)
    await seedMember(db, hh, "u-noemail", { email: null })
    expect(result(await listDigestRecipients(asDb(db)), hh)).toHaveLength(0)
  })

  it("excludes a soft-deleted identity", async () => {
    const hh = await seedHousehold(db)
    await seedMember(db, hh, "u-deleted", { deleted: true })
    expect(result(await listDigestRecipients(asDb(db)), hh)).toHaveLength(0)
  })

  it("returns a null locale when the Member has not chosen one", async () => {
    const hh = await seedHousehold(db)
    await seedMember(db, hh, "u-nolocale", { locale: null })
    expect(result(await listDigestRecipients(asDb(db)), hh)[0].locale).toBeNull()
  })

  it("groups multiple eligible Members under one household", async () => {
    const hh = await seedHousehold(db)
    await seedMember(db, hh, "u-a")
    await seedMember(db, hh, "u-b")
    expect(result(await listDigestRecipients(asDb(db)), hh)).toHaveLength(2)
  })
})

/** The members list for a given household in the result (empty if the household isn't present). */
function result(rows: Awaited<ReturnType<typeof listDigestRecipients>>, householdId: string) {
  return rows.find((h) => h.householdId === householdId)?.members ?? []
}
