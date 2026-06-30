import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { AccountsManager } from "@/components/accounts-manager"

afterEach(() => vi.unstubAllGlobals())

/** Stateful fetch double backing the accounts API across list/POST. */
function stubApi(initial: { id: string; name: string }[], opts: { postFails?: boolean } = {}) {
  let accounts = [...initial]
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET"
    if (url === "/api/accounts" && method === "GET") {
      return { ok: true, json: async () => accounts }
    }
    if (url === "/api/accounts" && method === "POST") {
      if (opts.postFails) return { ok: false, status: 400, json: async () => ({}) }
      const body = JSON.parse(init!.body as string) as { name: string }
      accounts = [...accounts, { id: "new", name: body.name }]
      return { ok: true, status: 201, json: async () => accounts[accounts.length - 1] }
    }
    return { ok: false, status: 404, json: async () => ({}) }
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

describe("AccountsManager", () => {
  it("lists existing accounts", async () => {
    stubApi([{ id: "1", name: "Visa" }])
    render(<AccountsManager />)
    expect(await screen.findByText("Visa")).toBeInTheDocument()
  })

  it("adds an account and shows it after the refetch", async () => {
    const fetchMock = stubApi([])
    render(<AccountsManager />)
    await screen.findByText(/no accounts yet/i)

    await userEvent.type(screen.getByLabelText("Name"), "Landsbankinn")
    await userEvent.click(screen.getByRole("button", { name: /add account/i }))

    expect(await screen.findByText("Landsbankinn")).toBeInTheDocument()
    const postCall = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === "POST")!
    expect(JSON.parse((postCall[1] as RequestInit).body as string)).toEqual({ name: "Landsbankinn" })
  })

  it("surfaces an error when creation fails", async () => {
    stubApi([], { postFails: true })
    render(<AccountsManager />)
    await screen.findByText(/no accounts yet/i)

    await userEvent.type(screen.getByLabelText("Name"), "X")
    await userEvent.click(screen.getByRole("button", { name: /add account/i }))

    expect(await screen.findByRole("alert")).toBeInTheDocument()
  })
})
