import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { SavingsConfigForm } from "@/components/savings-config-form"

afterEach(() => vi.unstubAllGlobals())

type Config = {
  incomeSources: Array<{ id?: string; name: string; amount: number }>
  offcardCosts: Array<{ id?: string; name: string; monthlyAmount: number }>
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
  incomeSources: [{ id: "s1", name: "Salary", amount: 700_000 }],
  offcardCosts: [{ id: "c1", name: "Mortgage", monthlyAmount: 250_000 }],
}

describe("SavingsConfigForm", () => {
  it("loads and shows the existing config rows", async () => {
    stubApi(config)
    render(<SavingsConfigForm />)
    expect(await screen.findByDisplayValue("Salary")).toBeInTheDocument()
    expect(screen.getByDisplayValue("Mortgage")).toBeInTheDocument()
  })

  it("adds a row and saves the full lists", async () => {
    const fetchMock = stubApi(config)
    render(<SavingsConfigForm />)
    await screen.findByDisplayValue("Salary")

    const income = screen.getByRole("group", { name: /income sources/i })
    await userEvent.click(within(income).getByRole("button", { name: /add income source/i }))
    const nameInputs = within(income).getAllByLabelText(/name/i)
    const amountInputs = within(income).getAllByLabelText(/amount/i)
    await userEvent.type(nameInputs[nameInputs.length - 1], "Rental")
    await userEvent.type(amountInputs[amountInputs.length - 1], "150000")
    await userEvent.click(screen.getByRole("button", { name: /save config/i }))

    expect(await screen.findByText(/config saved/i)).toBeInTheDocument()
    const putCall = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === "PUT")!
    expect(JSON.parse((putCall[1] as RequestInit).body as string)).toEqual({
      incomeSources: [
        { name: "Salary", amount: 700_000 },
        { name: "Rental", amount: 150_000 },
      ],
      offcardCosts: [{ name: "Mortgage", monthlyAmount: 250_000 }],
    })
  })

  it("removes a row before saving", async () => {
    const fetchMock = stubApi(config)
    render(<SavingsConfigForm />)
    await screen.findByDisplayValue("Salary")

    const costs = screen.getByRole("group", { name: /off-card costs/i })
    await userEvent.click(within(costs).getByRole("button", { name: /remove/i }))
    await userEvent.click(screen.getByRole("button", { name: /save config/i }))

    expect(await screen.findByText(/config saved/i)).toBeInTheDocument()
    const putCall = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === "PUT")!
    expect(JSON.parse((putCall[1] as RequestInit).body as string)).toEqual({
      incomeSources: [{ name: "Salary", amount: 700_000 }],
      offcardCosts: [],
    })
  })

  it("surfaces an error when the save fails", async () => {
    stubApi(config, { putFails: true })
    render(<SavingsConfigForm />)
    await screen.findByDisplayValue("Salary")

    await userEvent.click(screen.getByRole("button", { name: /save config/i }))
    expect(await screen.findByRole("alert")).toBeInTheDocument()
  })
})
