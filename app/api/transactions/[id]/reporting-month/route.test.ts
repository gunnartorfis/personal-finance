// @vitest-environment node

import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { migrate } from "drizzle-orm/pglite/migrator"
import { expect, it, vi } from "vitest"

import { cycleKeyRange } from "@/lib/dashboard/cycle"
import { loadNetSummary } from "@/lib/dashboard/net-summary"
import { householdRepo } from "@/lib/db/household-repo"
import { households } from "@/lib/db/schema"
import { requireHousehold } from "@/lib/household/current"

import { PUT } from "./route"

vi.mock("@/lib/household/current", () => ({ requireHousehold: vi.fn() }))

function move(id: string, month: unknown) {
  return PUT(new Request("http://test/", {
    method: "PUT",
    body: JSON.stringify({ month }),
  }), { params: Promise.resolve({ id }) })
}

it("moves only the selected salary between reporting months and keeps the booked movement", async () => {
  const client = new PGlite()
  try {
    const database = drizzle(client)
    await migrate(database, { migrationsFolder: "./drizzle" })
    const db = database as unknown as Parameters<typeof householdRepo>[0]
    const [household, other] = await database.insert(households).values([{}, {}]).returning()
    const repo = householdRepo(db, household.id)
    const otherRepo = householdRepo(db, other.id)
    const [account] = await repo.accounts.create({ name: "Current account" })
    const salary = {
      accountId: account.id, merchant: "Employer", rawCategory: "", source: "bank_sync" as const,
    }
    const [early, late] = await repo.transactions.createSyncedMany([
      { ...salary, externalId: "early", date: "2026-10-01", amount: 500_000 },
      { ...salary, externalId: "late", date: "2026-10-30", amount: 600_000 },
    ])
    await repo.transactions.setIncomeMarked(early.id, true)
    await repo.transactions.setIncomeMarked(late.id, true)
    const record = vi.fn()
    const authenticateAs = (scopedRepo: typeof repo) => {
      vi.mocked(requireHousehold).mockResolvedValue({
        repo: { ...scopedRepo, activity: { ...scopedRepo.activity, record } },
        memberId: "member", user: {},
      } as unknown as Awaited<ReturnType<typeof requireHousehold>>)
    }
    const september = cycleKeyRange("2026-09")
    const october = cycleKeyRange("2026-10")

    authenticateAs(otherRepo)
    expect((await move(early.id, "2026-09")).status).toBe(404)
    authenticateAs(repo)
    expect((await move(early.id, "2026-13")).status).toBe(400)
    expect(await repo.transactions.cycleMonths()).toEqual(["2026-10"])

    const response = await move(early.id, "2026-09")
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ month: "2026-09" })
    expect(await repo.transactions.cycleMonths()).toEqual(["2026-10", "2026-09"])
    expect(await repo.transactions.listWithOverrides(september)).toMatchObject([
      { id: early.id, date: "2026-10-01", reportingMonth: "2026-09-01" },
    ])
    expect(await repo.transactions.listWithOverrides(october)).toMatchObject([{ id: late.id }])
    expect(await repo.transactions.listWithOverrides(october, { bookedDates: true })).toMatchObject([
      { id: late.id }, { id: early.id },
    ])
    expect(await loadNetSummary(repo, september)).toMatchObject({ income: 500_000 })
    expect(await loadNetSummary(repo, october)).toMatchObject({ income: 600_000 })
    expect(await repo.transactions.monthlySpendSeries({ from: september.from, to: october.to }))
      .toMatchObject([{ month: "2026-09", income: 500_000 }, { month: "2026-10", income: 600_000 }])
    expect(await repo.transactions.netByAccount(september)).toEqual([])
    expect(await repo.transactions.netByAccount(october)).toMatchObject([{ net: 1_100_000 }])

    expect((await move(early.id, "2026-09")).status).toBe(200)
    expect(record).toHaveBeenCalledTimes(1)
    expect(record).toHaveBeenCalledWith(expect.objectContaining({
      action: "transaction.reporting_month_changed",
      payload: expect.objectContaining({ fromMonth: "2026-10", toMonth: "2026-09" }),
    }))

    const restored = await move(early.id, null)
    expect(await restored.json()).toEqual({ month: "2026-10" })
    expect(await repo.transactions.findById(early.id)).toMatchObject({
      date: "2026-10-01", reportingMonth: null, incomeMarked: true,
    })
    expect(await loadNetSummary(repo, october)).toMatchObject({ income: 1_100_000 })
    expect(await repo.transactions.listWithOverrides(september)).toEqual([])
  } finally {
    await client.close()
  }
}, 20_000)
