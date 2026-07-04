import type { CategoryTrendPoint } from "@/lib/dashboard/category-trend"
import type { MonthlySpendPoint } from "@/lib/dashboard/monthly-series"
import type { EmailSender, SendEmailParams } from "@/lib/email/resend"
import { describe, expect, it, vi } from "vitest"

import {
  assembleDigestInput,
  runMonthlyDigest,
  type DigestCycleData,
  type MonthlyDigestDeps,
} from "./run-monthly"

function point(month: string, spending: number, income: number): MonthlySpendPoint {
  return { month, spending, income, difference: income - spending }
}

function trend(month: string, byExpenseType: Partial<CategoryTrendPoint["byExpenseType"]>): CategoryTrendPoint {
  return { month, byExpenseType: { Fixed: 0, Necessary: 0, "Nice to have": 0, "": 0, ...byExpenseType }, unclassified: 0 }
}

function cycleData(overrides: Partial<DigestCycleData> = {}): DigestCycleData {
  return {
    currency: "ISK",
    series: [point("2026-06", 160_000, 500_000), point("2026-07", 200_000, 500_000)],
    categoryTrend: [trend("2026-07", { Fixed: 120_000, Necessary: 50_000, "Nice to have": 30_000 })],
    movers: [],
    savings: null,
    ...overrides,
  }
}

describe("assembleDigestInput", () => {
  it("pulls the cycle + prior points, expense split, movers and currency for the cycle", () => {
    const input = assembleDigestInput(cycleData(), "2026-07")
    expect(input.cycleKey).toBe("2026-07")
    expect(input.currency).toBe("ISK")
    expect(input.cycle).toEqual(point("2026-07", 200_000, 500_000))
    expect(input.priorCycle).toEqual(point("2026-06", 160_000, 500_000))
    expect(input.byExpenseType.Fixed).toBe(120_000)
  })

  it("defaults a missing cycle to a zero point and a null prior", () => {
    const input = assembleDigestInput(cycleData({ series: [], categoryTrend: [] }), "2026-07")
    expect(input.cycle).toEqual({ month: "2026-07", spending: 0, income: 0, difference: 0 })
    expect(input.priorCycle).toBeNull()
  })

  it("maps a savings assessment to the on-track + allowed-nice-to-have block", () => {
    const savings = { onTrack: true, allowedNiceToHave: 45_000 } as DigestCycleData["savings"]
    const input = assembleDigestInput(cycleData({ savings }), "2026-07")
    expect(input.savings).toEqual({ onTrack: true, allowedNiceToHave: 45_000 })
  })
})

const NOW = new Date("2026-08-05T06:00:00Z") // → current cycle 2026-08, so the digest covers 2026-07

function fakeSender(result: Awaited<ReturnType<EmailSender["send"]>> = { ok: true, id: "e1" }) {
  const sent: SendEmailParams[] = []
  const send = vi.fn(async (params: SendEmailParams) => {
    sent.push(params)
    return result
  })
  return { sender: { send } as EmailSender, sent }
}

function deps(overrides: Partial<MonthlyDigestDeps> = {}): MonthlyDigestDeps {
  return {
    now: NOW,
    from: "Auratal <no-reply@auratal.is>",
    dashboardUrl: "https://auratal.is/dashboard",
    send: fakeSender().sender,
    listRecipients: async () => [
      { householdId: "h1", members: [{ memberId: "m1", email: "a@x.co", locale: "en" }] },
    ],
    loadCycle: async () => cycleData(),
    hasSent: async () => false,
    recordSent: async () => {},
    unsubscribeUrlFor: (id) => `https://auratal.is/digest/unsubscribe?token=${id}`,
    ...overrides,
  }
}

describe("runMonthlyDigest", () => {
  it("targets the just-closed cycle (previous calendar month)", async () => {
    const summary = await runMonthlyDigest(deps())
    expect(summary.cycleKey).toBe("2026-07")
  })

  it("sends one email per eligible member and records the ledger", async () => {
    const { sender, sent } = fakeSender()
    const recordSent = vi.fn(async () => {})
    const summary = await runMonthlyDigest(deps({ send: sender, recordSent }))

    expect(sent).toHaveLength(1)
    expect(sent[0].to).toBe("a@x.co")
    expect(sent[0].from).toBe("Auratal <no-reply@auratal.is>")
    expect(recordSent).toHaveBeenCalledWith("h1", "m1", "2026-07")
    expect(summary).toMatchObject({ households: 1, sent: 1, skippedEmpty: 0, skippedAlreadySent: 0, failed: 0 })
  })

  it("skips a household with no data for the cycle (no empty digest)", async () => {
    const { sender, sent } = fakeSender()
    const summary = await runMonthlyDigest(deps({ send: sender, loadCycle: async () => null }))
    expect(sent).toHaveLength(0)
    expect(summary).toMatchObject({ sent: 0, skippedEmpty: 1 })
  })

  it("skips a household whose cycle had neither spending nor income", async () => {
    const { sender, sent } = fakeSender()
    const empty = cycleData({ series: [point("2026-07", 0, 0)], categoryTrend: [] })
    const summary = await runMonthlyDigest(deps({ send: sender, loadCycle: async () => empty }))
    expect(sent).toHaveLength(0)
    expect(summary).toMatchObject({ sent: 0, skippedEmpty: 1 })
  })

  it("skips a member already sent this cycle and does not re-send", async () => {
    const { sender, sent } = fakeSender()
    const recordSent = vi.fn(async () => {})
    const summary = await runMonthlyDigest(deps({ send: sender, recordSent, hasSent: async () => true }))
    expect(sent).toHaveLength(0)
    expect(recordSent).not.toHaveBeenCalled()
    expect(summary).toMatchObject({ sent: 0, skippedAlreadySent: 1 })
  })

  it("counts a failed send and writes no ledger row (so it retries next run)", async () => {
    const { sender } = fakeSender({ ok: false, error: "bounced" })
    const recordSent = vi.fn(async () => {})
    const summary = await runMonthlyDigest(deps({ send: sender, recordSent }))
    expect(recordSent).not.toHaveBeenCalled()
    expect(summary).toMatchObject({ sent: 0, failed: 1 })
  })

  it("renders each member in their own locale", async () => {
    const { sender, sent } = fakeSender()
    await runMonthlyDigest(
      deps({
        send: sender,
        listRecipients: async () => [
          {
            householdId: "h1",
            members: [
              { memberId: "m-en", email: "en@x.co", locale: "en" },
              { memberId: "m-is", email: "is@x.co", locale: "is" },
            ],
          },
        ],
      }),
    )
    const en = sent.find((s) => s.to === "en@x.co")
    const is = sent.find((s) => s.to === "is@x.co")
    expect(en?.subject).toContain("July 2026")
    expect(is?.subject).toContain("júlí 2026")
  })

  it("counts the email as sent even if recording the ledger throws (no abort)", async () => {
    const { sender, sent } = fakeSender()
    const summary = await runMonthlyDigest(
      deps({
        send: sender,
        recordSent: async () => {
          throw new Error("db timeout")
        },
      }),
    )
    expect(sent).toHaveLength(1)
    expect(summary).toMatchObject({ sent: 1, failed: 0 })
  })

  it("isolates a failing household so later households still send", async () => {
    const { sender, sent } = fakeSender()
    const summary = await runMonthlyDigest(
      deps({
        send: sender,
        listRecipients: async () => [
          { householdId: "boom", members: [{ memberId: "m-x", email: "x@x.co", locale: "en" }] },
          { householdId: "ok", members: [{ memberId: "m-y", email: "y@x.co", locale: "en" }] },
        ],
        loadCycle: async (householdId) => {
          if (householdId === "boom") throw new Error("db down")
          return cycleData()
        },
      }),
    )
    expect(sent.map((s) => s.to)).toEqual(["y@x.co"])
    expect(summary).toMatchObject({ sent: 1, failed: 1 })
  })

  it("isolates a failing member so siblings still send", async () => {
    const sentTo: string[] = []
    const send = vi.fn(async (params: SendEmailParams) => {
      if (params.to === "bad@x.co") throw new Error("resend timeout")
      sentTo.push(params.to)
      return { ok: true, id: "e1" } as const
    })
    const summary = await runMonthlyDigest(
      deps({
        send: { send } as EmailSender,
        listRecipients: async () => [
          {
            householdId: "h1",
            members: [
              { memberId: "m-bad", email: "bad@x.co", locale: "en" },
              { memberId: "m-good", email: "good@x.co", locale: "en" },
            ],
          },
        ],
      }),
    )
    expect(sentTo).toEqual(["good@x.co"])
    expect(summary).toMatchObject({ sent: 1, failed: 1 })
  })

  it("falls back to the default locale when a member has none", async () => {
    const { sender, sent } = fakeSender()
    await runMonthlyDigest(
      deps({
        send: sender,
        listRecipients: async () => [
          { householdId: "h1", members: [{ memberId: "m0", email: "n@x.co", locale: null }] },
        ],
      }),
    )
    expect(sent[0].subject).toContain("júlí 2026") // defaultLocale is Icelandic
  })
})
