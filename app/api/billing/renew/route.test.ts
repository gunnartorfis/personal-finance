import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { migrate } from "drizzle-orm/pglite/migrator"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { households } from "@/lib/db/schema"

const holder = vi.hoisted(() => ({ db: null as unknown }))
vi.mock("@/lib/db", () => ({ getDb: () => holder.db }))

// Keep isAuthorised/isPending real; only stub the network charge.
const chargeMock = vi.hoisted(() => ({ fn: null as unknown as (...a: unknown[]) => unknown }))
vi.mock("@/lib/payments/straumur", async (orig) => ({
  ...(await orig<typeof import("@/lib/payments/straumur")>()),
  chargeStoredToken: (...args: unknown[]) => chargeMock.fn(...args),
}))

import { GET } from "./route"

const SECRET = "cron-secret-xyz"
const PAST = new Date("2026-01-01T00:00:00Z")

const cronReq = (auth?: string) =>
  new Request("https://app.example.com/api/billing/renew", {
    headers: auth ? { authorization: auth } : {},
  })

beforeAll(async () => {
  const db = drizzle(new PGlite())
  await migrate(db, { migrationsFolder: "./drizzle" })
  holder.db = db
})
beforeEach(() => {
  vi.stubEnv("CRON_SECRET", SECRET)
  chargeMock.fn = vi.fn()
})
afterEach(() => vi.unstubAllEnvs())

async function seedDuePremium() {
  const db = holder.db as ReturnType<typeof drizzle>
  const [h] = await db
    .insert(households)
    .values({
      plan: "Premium",
      planRenewsAt: PAST,
      straumurRecurringDetailReference: "TOK",
      subscriptionPeriod: "monthly",
    })
    .returning()
  return h
}

describe("GET /api/billing/renew", () => {
  it("401s without the cron secret", async () => {
    expect((await GET(cronReq())).status).toBe(401)
    expect((await GET(cronReq("Bearer wrong"))).status).toBe(401)
  })

  it("charges a due household and advances its renewal on an authorised charge", async () => {
    const h = await seedDuePremium()
    chargeMock.fn = vi.fn().mockResolvedValue({ resultCode: "Authorised", payfacReference: "PSP" })

    const res = await GET(cronReq(`Bearer ${SECRET}`))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.charged).toBeGreaterThanOrEqual(1)

    const db = holder.db as ReturnType<typeof drizzle>
    const [row] = await db.select().from(households).where(eq(households.id, h.id))
    expect(row.planRenewsAt!.getTime()).toBeGreaterThan(PAST.getTime()) // advanced
    // Charge used a deterministic per-cycle reference + idempotency key.
    const arg = (chargeMock.fn as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(arg.reference).toBe(`sub_${h.id}_monthly_2026-01-01`)
    expect(arg.idempotencyKey).toBe(`renew-${h.id}-2026-01-01`)
    expect(arg.amount).toBe(1990)
  })

  it("does not advance renewal for a pending charge", async () => {
    const h = await seedDuePremium()
    chargeMock.fn = vi.fn().mockResolvedValue({ resultCode: "Pending" })

    const res = await GET(cronReq(`Bearer ${SECRET}`))
    const body = await res.json()
    expect(body.pending).toBeGreaterThanOrEqual(1)

    const db = holder.db as ReturnType<typeof drizzle>
    const [row] = await db.select().from(households).where(eq(households.id, h.id))
    expect(row.planRenewsAt!.toISOString()).toBe(PAST.toISOString()) // unchanged
  })
})
