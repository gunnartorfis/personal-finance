import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { migrate } from "drizzle-orm/pglite/migrator"
import { beforeAll, describe, expect, it } from "vitest"

import * as schema from "@/lib/db/schema"
import { households } from "@/lib/db/schema"

import { loadDigestCycleData } from "./load-cycle"

function freshDb() {
  return drizzle(new PGlite(), { schema })
}
const asDb = (d: ReturnType<typeof freshDb>) => d as unknown as Parameters<typeof loadDigestCycleData>[0]

const NOW = new Date("2026-08-05T06:00:00Z")

describe("loadDigestCycleData", () => {
  let db: ReturnType<typeof freshDb>

  beforeAll(async () => {
    db = freshDb()
    await migrate(db, { migrationsFolder: "./drizzle" })
  })

  it("returns null for an unknown household", async () => {
    expect(await loadDigestCycleData(asDb(db), "00000000-0000-0000-0000-000000000000", NOW)).toBeNull()
  })

  it("returns the household's billing currency, a series, and null savings when no goal is set", async () => {
    const [hh] = await db.insert(households).values({ billingCurrency: "ISK" }).returning()
    const data = await loadDigestCycleData(asDb(db), hh.id, NOW)
    expect(data).not.toBeNull()
    expect(data?.currency).toBe("ISK")
    expect(Array.isArray(data?.series)).toBe(true)
    expect(Array.isArray(data?.categoryTrend)).toBe(true)
    expect(Array.isArray(data?.movers)).toBe(true)
    expect(data?.savings).toBeNull()
  })
})
