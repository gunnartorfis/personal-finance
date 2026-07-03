import { fireEvent, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { SavingsConfigForm } from "@/components/savings-config-form"
import { renderWithIntl } from "@/lib/test/render"

afterEach(() => vi.unstubAllGlobals())

type Config = {
  incomeSources: Array<{ id?: string; name: string; amount: number; effectiveFrom: string }>
  offcardCosts: Array<{ id?: string; name: string; monthlyAmount: number; effectiveFrom: string }>
  oneOffAdjustments: Array<{
    id?: string
    cycleKey: string
    kind: "income" | "cost"
    amount: number
    label: string | null
  }>
}

function stubApi(initial: Config, opts: { putFails?: boolean } = {}) {
  let stored = initial
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET"
    if (url === "/api/savings/config" && method === "GET") {
      return { ok: true, json: async () => stored }
    }
    if (url === "/api/savings/config" && method === "PUT") {
      if (opts.putFails) return { ok: false, status: 400, json: async () => ({ error: "bad" }) }
      stored = JSON.parse(init!.body as string) as Config
      return { ok: true, json: async () => stored }
    }
    return { ok: false, status: 404, json: async () => ({}) }
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

const config: Config = {
  incomeSources: [{ id: "s1", name: "Salary", amount: 700_000, effectiveFrom: "0001-01" }],
  offcardCosts: [{ id: "c1", name: "Mortgage", monthlyAmount: 250_000, effectiveFrom: "0001-01" }],
  oneOffAdjustments: [],
}

function putBody(fetchMock: ReturnType<typeof stubApi>) {
  const call = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === "PUT")!
  return JSON.parse((call[1] as RequestInit).body as string)
}

describe("SavingsConfigForm", () => {
  it("loads and shows the existing config rows", async () => {
    stubApi(config)
    renderWithIntl(<SavingsConfigForm />)
    expect(await screen.findByDisplayValue("Salary")).toBeInTheDocument()
    expect(screen.getByDisplayValue("Mortgage")).toBeInTheDocument()
  })

  it("shows an existing dated version as a 'from month' input (ADR-0015)", async () => {
    stubApi({
      ...config,
      incomeSources: [
        { id: "s1", name: "Salary", amount: 500_000, effectiveFrom: "0001-01" },
        { id: "s2", name: "Salary", amount: 700_000, effectiveFrom: "2026-07" },
      ],
    })
    renderWithIntl(<SavingsConfigForm />)
    await screen.findByDisplayValue("Salary")
    expect(screen.getByDisplayValue("2026-07")).toBeInTheDocument()
  })

  it("adds a dated change to a source and saves it as a second version sharing the name", async () => {
    const fetchMock = stubApi(config)
    renderWithIntl(<SavingsConfigForm />)
    await screen.findByDisplayValue("Salary")

    const income = screen.getByRole("group", { name: /income sources/i })
    await userEvent.click(within(income).getByRole("button", { name: /add a change/i }))
    const months = within(income).getAllByLabelText(/from month/i)
    fireEvent.change(months[months.length - 1], { target: { value: "2026-07" } })
    const amounts = within(income).getAllByLabelText(/amount \/ month/i)
    fireEvent.change(amounts[amounts.length - 1], { target: { value: "800000" } })

    await userEvent.click(screen.getByRole("button", { name: /save config/i }))
    expect(await screen.findByText(/config saved/i)).toBeInTheDocument()

    expect(putBody(fetchMock)).toEqual({
      incomeSources: [
        { name: "Salary", amount: 700_000, effectiveFrom: "0001-01" },
        { name: "Salary", amount: 800_000, effectiveFrom: "2026-07" },
      ],
      offcardCosts: [{ name: "Mortgage", monthlyAmount: 250_000, effectiveFrom: "0001-01" }],
      oneOffAdjustments: [],
    })
  })

  it("adds a one-off adjustment and sends it in the PUT body", async () => {
    const fetchMock = stubApi(config)
    renderWithIntl(<SavingsConfigForm />)
    await screen.findByDisplayValue("Salary")

    const oneoffs = screen.getByRole("group", { name: /one-off adjustments/i })
    await userEvent.click(within(oneoffs).getByRole("button", { name: /add one-off/i }))
    fireEvent.change(within(oneoffs).getByLabelText(/^month$/i), { target: { value: "2026-03" } })
    fireEvent.change(within(oneoffs).getByLabelText(/^amount$/i), { target: { value: "300000" } })
    await userEvent.type(within(oneoffs).getByLabelText(/^label$/i), "Tax refund")

    await userEvent.click(screen.getByRole("button", { name: /save config/i }))
    expect(await screen.findByText(/config saved/i)).toBeInTheDocument()

    expect(putBody(fetchMock).oneOffAdjustments).toEqual([
      { cycleKey: "2026-03", kind: "income", amount: 300_000, label: "Tax refund" },
    ])
  })

  it("surfaces an error when the save fails", async () => {
    stubApi(config, { putFails: true })
    renderWithIntl(<SavingsConfigForm />)
    await screen.findByDisplayValue("Salary")

    await userEvent.click(screen.getByRole("button", { name: /save config/i }))
    expect(await screen.findByRole("alert")).toBeInTheDocument()
  })
})
