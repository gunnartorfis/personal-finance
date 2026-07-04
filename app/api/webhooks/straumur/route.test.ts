import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { migrate } from "drizzle-orm/pglite/migrator"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { households, straumurPayments } from "@/lib/db/schema"

// getDb is read at call-time; a hoisted holder lets the mock return the migrated pglite db.
const holder = vi.hoisted(() => ({ db: null as unknown }))
vi.mock("@/lib/db", () => ({ getDb: () => holder.db }))

import { POST } from "./route"

const KEY = "6e4d1ae6624af9e1c0686c6c4415fb110172e8f222f55757"
const UUID = "11111111-1111-1111-1111-111111111111"

async function sign(
  fields: [string, string, string, string, string, string, string],
): Promise<string> {
  const keyBytes = new Uint8Array(KEY.length / 2)
  for (let i = 0; i < keyBytes.length; i++) keyBytes[i] = Number.parseInt(KEY.slice(i * 2, i * 2 + 2), 16)
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const digest = new Uint8Array(
    await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(fields.join(":")) as BufferSource),
  )
  return btoa(String.fromCharCode(...digest))
}

/** Build a signed Authorization webhook body for the given overrides. */
async function authBody(over: Record<string, unknown> = {}) {
  // `householdId`/`period` are test-only knobs that derive the (signed) merchantReference; strip them
  // from the emitted body so only real webhook fields ship.
  const { householdId, period, ...bodyOver } = over
  const merchantReference =
    (bodyOver.merchantReference as string) ??
    `sub_${(householdId as string) ?? UUID}_${(period as string) ?? "monthly"}_1_abc`
  const psp = (bodyOver.payfacReference as string) ?? "psp_route_1"
  const amount = (bodyOver.amount as string) ?? "199000"
  const currency = bodyOver.currency !== undefined ? (bodyOver.currency as string) : "ISK"
  const success = (bodyOver.success as string) ?? "true"
  // Signing string mirrors the 7 fields (additionalData is not signed).
  const hmacSignature = await sign(["", psp, merchantReference, amount, currency ?? "", "", success])
  return {
    checkoutReference: null,
    payfacReference: psp,
    merchantReference,
    amount,
    currency: currency === "" ? null : currency,
    reason: null,
    success,
    hmacSignature,
    additionalData: { eventType: "Authorization", "recurring.recurringDetailReference": "TOK_R" },
    ...bodyOver,
  }
}

const post = (body: unknown) =>
  POST(new Request("https://app.example.com/api/webhooks/straumur", { method: "POST", body: JSON.stringify(body) }))

beforeAll(async () => {
  const db = drizzle(new PGlite())
  await migrate(db, { migrationsFolder: "./drizzle" })
  // The subscription references in these tests resolve to this household; it must exist so a
  // successful Authorization can activate it (activation throws on a missing household).
  await db.insert(households).values({ id: UUID })
  holder.db = db
})
beforeEach(() => vi.stubEnv("STRAUMUR_WEBHOOK_HMAC_KEY", KEY))
afterEach(() => vi.unstubAllEnvs())

describe("POST /api/webhooks/straumur", () => {
  it("400s an unparseable body", async () => {
    const res = await POST(
      new Request("https://app.example.com/api/webhooks/straumur", { method: "POST", body: "{not json" }),
    )
    expect(res.status).toBe(400)
  })

  it("503s when the HMAC key is not configured", async () => {
    vi.stubEnv("STRAUMUR_WEBHOOK_HMAC_KEY", "")
    const res = await post(await authBody())
    expect(res.status).toBe(503)
  })

  it("401s on a bad signature", async () => {
    const body = await authBody()
    const res = await post({ ...body, hmacSignature: "deadbeef" })
    expect(res.status).toBe(401)
  })

  it("records a valid Authorization and ACKs with [accepted]", async () => {
    const res = await post(await authBody({ payfacReference: "psp_ok" }))
    expect(res.status).toBe(200)
    expect(await res.text()).toBe("[accepted]")

    const db = holder.db as ReturnType<typeof drizzle>
    const rows = await db.select().from(straumurPayments).where(eq(straumurPayments.pspReference, "psp_ok"))
    expect(rows).toHaveLength(1)
    expect(rows[0].householdId).toBe(UUID)
    expect(rows[0].recurringDetailReference).toBe("TOK_R")
    expect(rows[0].amount).toBe(199000)
    expect(rows[0].success).toBe(true)
  })

  it("activates Premium on a successful subscription Authorization", async () => {
    const db = holder.db as ReturnType<typeof drizzle>
    await db.insert(households).values({ id: UUID }).onConflictDoNothing()

    const res = await post(await authBody({ payfacReference: "psp_activate" }))
    expect(res.status).toBe(200)

    const [h] = await db.select().from(households).where(eq(households.id, UUID))
    expect(h.plan).toBe("Premium")
    expect(h.planRenewsAt).not.toBeNull()
    expect(h.straumurRecurringDetailReference).toBe("TOK_R")
  })

  it("ACKs but does not record a non-Authorization event", async () => {
    const body = await authBody({ payfacReference: "psp_capture" })
    const res = await post({ ...body, additionalData: { eventType: "Capture" } })
    expect(res.status).toBe(200)
    expect(await res.text()).toBe("[accepted]")

    const db = holder.db as ReturnType<typeof drizzle>
    const rows = await db.select().from(straumurPayments).where(eq(straumurPayments.pspReference, "psp_capture"))
    expect(rows).toHaveLength(0)
  })

  it("warns and drops an HMAC-verified payload with no eventType", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const body = await authBody({ payfacReference: "psp_noevent" })
    const res = await post({ ...body, additionalData: null })
    expect(res.status).toBe(200)
    expect(await res.text()).toBe("[accepted]")
    expect(warn).toHaveBeenCalled()

    const db = holder.db as ReturnType<typeof drizzle>
    const rows = await db.select().from(straumurPayments).where(eq(straumurPayments.pspReference, "psp_noevent"))
    expect(rows).toHaveLength(0)
    warn.mockRestore()
  })

  it("400s a valid signature with a missing required field (so Straumur retries)", async () => {
    // currency empty: signed consistently, passes HMAC, but fails the field check.
    const res = await post(await authBody({ payfacReference: "psp_missing", currency: "" }))
    expect(res.status).toBe(400)
  })

  it("records but does not activate when the signed amount doesn't match the plan price", async () => {
    const db = holder.db as ReturnType<typeof drizzle>
    const [h] = await db.insert(households).values({}).returning()
    const err = vi.spyOn(console, "error").mockImplementation(() => {})

    // "100" wire ≠ 199000 (monthly). amount/currency are HMAC-signed, so a mismatch is a mis-priced
    // or tampered charge: record it (observable), never activate on it.
    const res = await post(await authBody({ payfacReference: "psp_wrongamt", householdId: h.id, amount: "100" }))
    expect(res.status).toBe(200)
    expect(await res.text()).toBe("[accepted]")

    const rows = await db.select().from(straumurPayments).where(eq(straumurPayments.pspReference, "psp_wrongamt"))
    expect(rows).toHaveLength(1)
    const [row] = await db.select().from(households).where(eq(households.id, h.id))
    expect(row.plan).toBe("Free")
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })

  it("records but does not activate on a currency mismatch", async () => {
    const db = holder.db as ReturnType<typeof drizzle>
    const [h] = await db.insert(households).values({}).returning()
    const err = vi.spyOn(console, "error").mockImplementation(() => {})

    const res = await post(await authBody({ payfacReference: "psp_wrongcur", householdId: h.id, currency: "EUR" }))
    expect(res.status).toBe(200)

    const [row] = await db.select().from(households).where(eq(households.id, h.id))
    expect(row.plan).toBe("Free")
    err.mockRestore()
  })

  it("activates on an annual authorization at the annual price", async () => {
    const db = holder.db as ReturnType<typeof drizzle>
    const [h] = await db.insert(households).values({}).returning()

    // annual = round(1990*12*0.7) = 16716 ISK → 1671600 wire.
    const res = await post(
      await authBody({ payfacReference: "psp_annual", householdId: h.id, period: "annual", amount: "1671600" }),
    )
    expect(res.status).toBe(200)

    const [row] = await db.select().from(households).where(eq(households.id, h.id))
    expect(row.plan).toBe("Premium")
    expect(row.subscriptionPeriod).toBe("annual")
  })

  it("keeps the first-seen card token when a re-delivered event carries a different one", async () => {
    const db = holder.db as ReturnType<typeof drizzle>
    const [h] = await db.insert(households).values({}).returning()
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

    await post(
      await authBody({
        payfacReference: "psp_replay",
        householdId: h.id,
        additionalData: { eventType: "Authorization", "recurring.recurringDetailReference": "TOK_ORIG" },
      }),
    )
    let [row] = await db.select().from(households).where(eq(households.id, h.id))
    expect(row.straumurRecurringDetailReference).toBe("TOK_ORIG")

    // Replay the same pspReference carrying a swapped (unsigned) token — must not overwrite the stored one.
    await post(
      await authBody({
        payfacReference: "psp_replay",
        householdId: h.id,
        additionalData: { eventType: "Authorization", "recurring.recurringDetailReference": "TOK_EVIL" },
      }),
    )
    ;[row] = await db.select().from(households).where(eq(households.id, h.id))
    expect(row.straumurRecurringDetailReference).toBe("TOK_ORIG")
    warn.mockRestore()
  })
})
