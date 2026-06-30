import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { MerchantRulesManager } from "@/components/merchant-rules-manager"

afterEach(() => {
  vi.unstubAllGlobals()
})

interface Rule {
  id: string
  merchant: string
  flatType: string | null
  threshold: number | null
  atOrAboveType: string | null
  belowType: string | null
}

const flat = (id: string, merchant: string, flatType: string): Rule => ({
  id,
  merchant,
  flatType,
  threshold: null,
  atOrAboveType: null,
  belowType: null,
})

/** A stateful fetch double backing the rules API across list/POST/DELETE calls. */
function stubApi(initial: Rule[], opts: { postFails?: { status: number; error: string } } = {}) {
  let rules = [...initial]
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET"
    if (url === "/api/merchant-rules" && method === "GET") {
      return { ok: true, json: async () => rules }
    }
    if (url === "/api/merchant-rules" && method === "POST") {
      if (opts.postFails) {
        return {
          ok: false,
          status: opts.postFails.status,
          json: async () => ({ error: opts.postFails!.error }),
        }
      }
      const body = JSON.parse(init!.body as string) as { merchant: string; flatType: string }
      rules = [...rules, flat("new", body.merchant.toUpperCase(), body.flatType)]
      return { ok: true, status: 201, json: async () => rules[rules.length - 1] }
    }
    if (method === "DELETE") {
      const id = url.split("/").pop()
      rules = rules.filter((r) => r.id !== id)
      return { ok: true, json: async () => ({ removed: true }) }
    }
    return { ok: false, status: 404, json: async () => ({}) }
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

describe("MerchantRulesManager", () => {
  it("lists existing rules", async () => {
    stubApi([flat("1", "NETFLIX", "Fixed")])
    render(<MerchantRulesManager />)
    await screen.findByText("NETFLIX")
    // Assert on the row (the form's <option> also reads "Fixed", so scope to the list item).
    const item = screen.getByRole("listitem")
    expect(item).toHaveTextContent("NETFLIX")
    expect(item).toHaveTextContent("Fixed")
  })

  it("adds a flat rule and shows it after the refetch", async () => {
    const fetchMock = stubApi([])
    render(<MerchantRulesManager />)
    expect(await screen.findByText(/no rules yet/i)).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText("Merchant"), "Spotify")
    await userEvent.selectOptions(screen.getByLabelText("Type"), "Necessary")
    await userEvent.click(screen.getByRole("button", { name: "Add" }))

    expect(await screen.findByText("SPOTIFY")).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/merchant-rules",
      expect.objectContaining({ method: "POST" }),
    )
    const postCall = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === "POST")!
    expect(JSON.parse((postCall[1] as RequestInit).body as string)).toEqual({
      merchant: "Spotify",
      flatType: "Necessary",
    })
  })

  it("deletes a rule", async () => {
    stubApi([flat("1", "NETFLIX", "Fixed")])
    render(<MerchantRulesManager />)
    await screen.findByText("NETFLIX")

    await userEvent.click(screen.getByRole("button", { name: "Delete" }))
    await waitFor(() => expect(screen.queryByText("NETFLIX")).not.toBeInTheDocument())
  })

  it("surfaces a duplicate-merchant error from the API", async () => {
    stubApi([], { postFails: { status: 409, error: "a rule already exists for this merchant" } })
    render(<MerchantRulesManager />)
    await screen.findByText(/no rules yet/i)

    await userEvent.type(screen.getByLabelText("Merchant"), "NETFLIX")
    await userEvent.click(screen.getByRole("button", { name: "Add" }))

    expect(await screen.findByRole("alert")).toHaveTextContent(/already exists/i)
  })
})
