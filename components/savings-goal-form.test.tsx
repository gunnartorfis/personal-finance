import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { SavingsGoalForm } from "@/components/savings-goal-form"

afterEach(() => vi.unstubAllGlobals())

const goal = {
  id: "g1",
  target: 3_000_000,
  targetDate: "2027-06-01",
  startingSaved: 250_000,
  startCycle: "2026-07",
  currency: "ISK",
}

/** Fetch double for /api/savings/goal GET/PUT. */
function stubApi(initial: typeof goal | null, opts: { putFails?: boolean } = {}) {
  let stored = initial
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET"
    if (url === "/api/savings/goal" && method === "GET") {
      return { ok: true, json: async () => stored }
    }
    if (url === "/api/savings/goal" && method === "PUT") {
      if (opts.putFails) {
        return { ok: false, status: 400, json: async () => ({ error: "bad" }) }
      }
      const body = JSON.parse(init!.body as string) as Omit<typeof goal, "id" | "currency">
      stored = { ...body, id: "g1", currency: "ISK" }
      return { ok: true, json: async () => stored }
    }
    return { ok: false, status: 404, json: async () => ({}) }
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

describe("SavingsGoalForm", () => {
  it("loads and shows the existing goal", async () => {
    stubApi(goal)
    render(<SavingsGoalForm />)
    expect(await screen.findByLabelText(/target amount/i)).toHaveValue(3_000_000)
    expect(screen.getByLabelText(/target date/i)).toHaveValue("2027-06-01")
    expect(screen.getByLabelText(/already saved/i)).toHaveValue(250_000)
    expect(screen.getByLabelText(/start cycle/i)).toHaveValue("2026-07")
  })

  it("saves the goal with numeric fields as integers", async () => {
    const fetchMock = stubApi(null)
    render(<SavingsGoalForm />)
    await screen.findByLabelText(/target amount/i)

    await userEvent.type(screen.getByLabelText(/target amount/i), "1200000")
    await userEvent.type(screen.getByLabelText(/target date/i), "2027-05-31")
    await userEvent.type(screen.getByLabelText(/already saved/i), "0")
    await userEvent.type(screen.getByLabelText(/start cycle/i), "2026-07")
    await userEvent.click(screen.getByRole("button", { name: /save goal/i }))

    expect(await screen.findByText(/goal saved/i)).toBeInTheDocument()
    const putCall = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === "PUT")!
    expect(JSON.parse((putCall[1] as RequestInit).body as string)).toEqual({
      target: 1_200_000,
      targetDate: "2027-05-31",
      startingSaved: 0,
      startCycle: "2026-07",
    })
  })

  it("surfaces an error when the save fails", async () => {
    stubApi(null, { putFails: true })
    render(<SavingsGoalForm />)
    await screen.findByLabelText(/target amount/i)

    await userEvent.type(screen.getByLabelText(/target amount/i), "100")
    await userEvent.type(screen.getByLabelText(/target date/i), "2027-05-31")
    await userEvent.type(screen.getByLabelText(/start cycle/i), "2026-07")
    await userEvent.click(screen.getByRole("button", { name: /save goal/i }))

    expect(await screen.findByRole("alert")).toBeInTheDocument()
  })
})
