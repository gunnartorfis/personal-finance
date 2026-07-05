import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { CategoriesManager } from "@/components/categories-manager"
import { renderWithIntl as render } from "@/lib/test/render"

afterEach(() => vi.unstubAllGlobals())

interface Cat {
  id: string
  parentId: string | null
  labelKey: string | null
  label: string | null
  hidden: boolean
}

const group = (id: string, labelKey: string): Cat => ({ id, parentId: null, labelKey, label: null, hidden: false })
const leaf = (id: string, parentId: string, labelKey: string | null, label: string | null, hidden = false): Cat => ({
  id,
  parentId,
  labelKey,
  label,
  hidden,
})

/** A stateful fetch double backing the categories API across list / POST / PATCH calls. */
function stubApi(initial: Cat[]) {
  let rows = [...initial]
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET"
    if (url === "/api/categories" && method === "GET") {
      return { ok: true, json: async () => rows }
    }
    if (url === "/api/categories" && method === "POST") {
      const body = JSON.parse(init!.body as string) as { parentId: string; label: string }
      rows = [...rows, leaf(`new-${rows.length}`, body.parentId, null, body.label)]
      return { ok: true, status: 201, json: async () => rows[rows.length - 1] }
    }
    if (method === "PATCH") {
      const id = url.split("/").pop()
      const { hidden } = JSON.parse(init!.body as string) as { hidden: boolean }
      rows = rows.map((r) => (r.id === id ? { ...r, hidden } : r))
      return { ok: true, json: async () => rows.find((r) => r.id === id) }
    }
    return { ok: false, status: 404, json: async () => ({}) }
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

describe("CategoriesManager", () => {
  it("lists groups with their leaves, localizing seed rows and showing custom labels", async () => {
    stubApi([
      group("g-food", "food"),
      leaf("l-groceries", "g-food", "groceries", null),
      leaf("l-pool", "g-food", null, "Sundlaug"),
    ])
    render(<CategoriesManager />)

    expect(await screen.findByRole("heading", { name: "Food & groceries" })).toBeInTheDocument()
    expect(screen.getByText("Groceries")).toBeInTheDocument()
    expect(screen.getByText("Sundlaug")).toBeInTheDocument()
  })

  it("hides a leaf via PATCH and reflects it after the refetch", async () => {
    const fetchMock = stubApi([group("g-food", "food"), leaf("l-groceries", "g-food", "groceries", null)])
    render(<CategoriesManager />)
    await screen.findByText("Groceries")

    await userEvent.click(screen.getByRole("button", { name: /hide groceries/i }))
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/categories/l-groceries",
      expect.objectContaining({ method: "PATCH" })
    )
    // After hiding, the row offers "Show" instead.
    expect(await screen.findByRole("button", { name: /show groceries/i })).toBeInTheDocument()
  })

  it("adds a custom leaf under a chosen group", async () => {
    const fetchMock = stubApi([group("g-food", "food")])
    render(<CategoriesManager />)
    await screen.findByRole("heading", { name: "Food & groceries" })

    await userEvent.selectOptions(screen.getByLabelText("Group"), "g-food")
    await userEvent.type(screen.getByLabelText("Name"), "Bakery")
    await userEvent.selectOptions(screen.getByLabelText("Default type"), "Necessary")
    await userEvent.click(screen.getByRole("button", { name: "Add" }))

    const postCall = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === "POST")!
    expect(JSON.parse((postCall[1] as RequestInit).body as string)).toEqual({
      parentId: "g-food",
      label: "Bakery",
      defaultExpenseType: "Necessary",
    })
    await waitFor(() => expect(screen.getByText("Bakery")).toBeInTheDocument())
  })
})
