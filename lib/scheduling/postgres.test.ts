// @vitest-environment node
import { randomUUID } from "node:crypto"

import { PGlite } from "@electric-sql/pglite"
import { afterEach, describe, expect, it } from "vitest"

import { migrateOperations } from "../../scripts/hosting/migrate-operations.mjs"
import { postgresCoordinator } from "./postgres.mjs"

const databases: PGlite[] = []
afterEach(async () => {
  await Promise.all(databases.splice(0).map((db) => db.close()))
})

async function setup() {
  const db = new PGlite()
  databases.push(db)
  // pg.query supports simple-query batches; PGlite exposes those through exec instead.
  const client = {
    query: async (text: string, params?: unknown[]) => {
      if (params) return db.query(text, params)
      const results = await db.exec(text)
      return { rows: results.at(-1)?.rows ?? [] }
    },
    end: async () => {},
  }
  await migrateOperations(client)
  return { db, client, coordinator: postgresCoordinator(client) }
}

describe("scheduled execution PostgreSQL coordination", () => {
  it("starts paused, deduplicates completion, and blocks a prior unresolved occurrence", async () => {
    const { db, coordinator } = await setup()
    const job = "billing-renewal"
    const first = "2026-11-10T03:00:00.000Z"
    expect(
      await coordinator.claim(job, first, "railway-staging", randomUUID())
    ).toBe("scheduler_not_owner")
    await db.query(
      "UPDATE hosting.scheduled_jobs SET owner = $1 WHERE name = $2",
      ["railway-staging", job]
    )
    const runId = randomUUID()
    expect(await coordinator.claim(job, first, "railway-staging", runId)).toBe(
      "started"
    )
    expect(
      await coordinator.claim(job, first, "railway-staging", randomUUID())
    ).toBe("reconciliation_required")
    await coordinator.finish(runId, "completed")
    expect(
      await coordinator.claim(job, first, "railway-staging", randomUUID())
    ).toBe("already_completed")
    expect(
      await coordinator.claim(
        job,
        "2026-11-11T03:00:00.000Z",
        "railway-staging",
        randomUUID()
      )
    ).toBe("started")
    await db.query(
      "UPDATE hosting.scheduled_jobs SET owner = $1 WHERE name = $2",
      ["vercel-production", job]
    )
    expect(
      await coordinator.claim(
        job,
        "2026-11-12T03:00:00.000Z",
        "vercel-production",
        randomUUID()
      )
    ).toBe("reconciliation_required")
  })

  it("never allows another run to finish an occurrence it does not own", async () => {
    const { coordinator } = await setup()
    await expect(coordinator.finish(randomUUID(), "completed")).rejects.toThrow(
      "Run is not owned"
    )
    await expect(coordinator.finish(randomUUID(), "invalid")).rejects.toThrow(
      "Invalid run state"
    )
  })

  it("applies operations migrations once and rejects changes to applied checksums", async () => {
    const { db, client } = await setup()
    await migrateOperations(client)
    const count = await db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM hosting.schema_migrations"
    )
    expect(count.rows[0].n).toBe(1)
    await db.query("UPDATE hosting.schema_migrations SET hash = 'changed'")
    await expect(migrateOperations(client)).rejects.toThrow(
      "Applied operations migration changed"
    )
    expect(
      (await db.query("SELECT name FROM hosting.scheduled_jobs")).rows
    ).toHaveLength(3)
  })
})
