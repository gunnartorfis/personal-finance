import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { SavingsCheckin } from "@/components/savings-checkin"

afterEach(() => vi.unstubAllGlobals())

const history = [
  {
    id: "c1",
    cycleKey: "2026-06",
    monthlyIncome: 1_000_000,
    cycleExtra: 0,
    offCardFixed: 300_000,
    cardDebits: 450_000,
    inferredSaving: 250_000,
  },
]

const onTrackAssessment = {
  cycleKey: "2026-07",
  cumulative: 550_000,
  requiredCumulative: 200_000,
  onTrack: true,
  cyclesElapsed: 2,
  cyclesRemaining: 10,
  requiredSaving: 65_000,
  expectedFixed: 110_000,
  expectedNecessary: 190_000,
  expectedSource: "history",
  allowedNiceToHave: 335_000,
  provisional: false,
}

function stubApi(opts: {
  checkins?: typeof history
  post?: { status: number; body: unknown }
}) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET"
    if (url === "/api/savings/checkins" && method === "GET") {
      return { ok: true, json: async () => opts.checkins ?? [] }
    }
    if (url === "/api/savings/checkins" && method === "POST") {
      const { status, body } = opts.post ?? { status: 500, body: {} }
      return { ok: status < 400, status, json: async () => body }
    }
    return { ok: false, status: 404, json: async () => ({}) }
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

describe("SavingsCheckin", () => {
  it("lists the check-in history newest first", async () => {
    stubApi({
      checkins: [
        ...history,
        { ...history[0], id: "c2", cycleKey: "2026-07", inferredSaving: 300_000 },
      ],
    })
    render(<SavingsCheckin />)
    const rows = await screen.findAllByRole("row")
    // Header row + two cycles, newest (July) first.
    expect(rows[1]).toHaveTextContent(/july 2026/i)
    expect(rows[2]).toHaveTextContent(/june 2026/i)
  })

  it("checks in and shows an on-track assessment with the allowed nice-to-have", async () => {
    stubApi({
      checkins: history,
      post: {
        status: 200,
        body: {
          checkin: { id: "c2", cycleKey: "2026-07", inferredSaving: 300_000 },
          assessment: onTrackAssessment,
        },
      },
    })
    render(<SavingsCheckin />)
    await userEvent.click(await screen.findByRole("button", { name: /check in now/i }))

    const status = await screen.findByRole("status")
    expect(status).toHaveTextContent(/on track/i)
    expect(screen.getByText(/allowed nice to have/i)).toBeInTheDocument()
    expect(screen.getByText("ISK 335,000")).toBeInTheDocument()
  })

  it("prescribes the corrective pace when behind", async () => {
    stubApi({
      checkins: [],
      post: {
        status: 200,
        body: {
          checkin: { id: "c2", cycleKey: "2026-07" },
          assessment: {
            ...onTrackAssessment,
            onTrack: false,
            requiredSaving: 120_000,
            allowedNiceToHave: -20_000,
          },
        },
      },
    })
    render(<SavingsCheckin />)
    await userEvent.click(await screen.findByRole("button", { name: /check in now/i }))

    const status = await screen.findByRole("status")
    expect(status).toHaveTextContent(/behind/i)
    expect(status).toHaveTextContent(/ISK 120,000/)
  })

  it("flags a provisional assessment while rows are unclassified", async () => {
    stubApi({
      checkins: [],
      post: {
        status: 200,
        body: {
          checkin: { id: "c2", cycleKey: "2026-07" },
          assessment: { ...onTrackAssessment, provisional: true },
        },
      },
    })
    render(<SavingsCheckin />)
    await userEvent.click(await screen.findByRole("button", { name: /check in now/i }))

    expect(await screen.findByText(/provisional/i)).toBeInTheDocument()
  })

  it("prompts to set a goal on a no-goal conflict", async () => {
    stubApi({ checkins: [], post: { status: 409, body: { error: "no-goal" } } })
    render(<SavingsCheckin />)
    await userEvent.click(await screen.findByRole("button", { name: /check in now/i }))

    expect(await screen.findByRole("alert")).toHaveTextContent(/set a savings goal/i)
  })
})
