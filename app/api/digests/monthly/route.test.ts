import { PGlite } from "@electric-sql/pglite"
import { sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { migrate } from "drizzle-orm/pglite/migrator"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import * as schema from "@/lib/db/schema"

const holder = vi.hoisted(() => ({ db: null as unknown }))
vi.mock("@/lib/db", () => ({ getDb: () => holder.db }))

import { GET } from "./route"

const CRON = "cron-secret-xyz"

const req = (auth?: string) =>
  new Request("https://auratal.is/api/digests/monthly", { headers: auth ? { authorization: auth } : {} })

beforeAll(async () => {
  const db = drizzle(new PGlite(), { schema })
  await migrate(db, { migrationsFolder: "./drizzle" })
  // The recipient query joins the Neon-managed mirror; create an (empty) one so it resolves.
  await db.execute(sql`create schema if not exists neon_auth`)
  await db.execute(sql`create table neon_auth.users_sync (id text primary key, name text, email text, raw_json jsonb, created_at timestamptz default now(), updated_at timestamptz, deleted_at timestamptz)`)
  holder.db = db
})
beforeEach(() => {
  vi.stubEnv("CRON_SECRET", CRON)
  vi.stubEnv("RESEND_API_KEY", "re_test")
  vi.stubEnv("DIGEST_UNSUBSCRIBE_SECRET", "unsub_test")
})
afterEach(() => vi.unstubAllEnvs())

describe("GET /api/digests/monthly", () => {
  it("rejects a request with no cron secret", async () => {
    expect((await GET(req())).status).toBe(401)
  })

  it("rejects a wrong cron secret", async () => {
    expect((await GET(req("Bearer nope"))).status).toBe(401)
  })

  it("returns 503 when email is not configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "")
    expect((await GET(req(`Bearer ${CRON}`))).status).toBe(503)
  })

  it("runs and returns a summary for an authorized request", async () => {
    const res = await GET(req(`Bearer ${CRON}`))
    expect(res.status).toBe(200)
    const summary = await res.json()
    expect(summary).toMatchObject({ households: 0, sent: 0, skippedEmpty: 0, failed: 0 })
    expect(summary.cycleKey).toMatch(/^\d{4}-\d{2}$/)
  })
})
