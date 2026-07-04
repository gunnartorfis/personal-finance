import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { BudgetConfigForm } from "@/components/budget-config-form"
import { renderWithIntl } from "@/lib/test/render"

afterEach(() => vi.unstubAllGlobals())

type Budgets = { budgets: Array<{ expenseType: string; monthlyAmount: number }> }

function stubApi(initial: Budgets) {
  let stored = initial
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET"
    if (url === "/api/budgets" && method === "GET") {
      return { ok: true, json: async () => stored }
    }
    if (url === "/api/budgets" && method === "PUT") {
      stored = JSON.parse(init!.body as string) as Budgets
      return { ok: true, json: async () => stored }
    }
    return { ok: false, status: 404, json: async () => ({}) }
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

describe("BudgetConfigForm", () => {
  it("renders an input per category and prefills from the loaded budgets", async () => {
    stubApi({ budgets: [{ expenseType: "Fixed", monthlyAmount: 200_000 }] })
    renderWithIntl(<BudgetConfigForm />)

    // The form gates on load; inputs appear once the fetch resolves.
    await waitFor(() => expect(screen.getByText("Fixed")).toBeInTheDocument())
    expect(screen.getByText("Necessary")).toBeInTheDocument()
    expect(screen.getByText("Nice to have")).toBeInTheDocument()
    expect(screen.getByDisplayValue("200000")).toBeInTheDocument()
  })

  it("saves only the filled categories as a positive-integer budget payload", async () => {
    const fetchMock = stubApi({ budgets: [] })
    renderWithIntl(<BudgetConfigForm />)

    await waitFor(() => expect(screen.getAllByRole("spinbutton")).toHaveLength(3))
    const [fixed, necessary] = screen.getAllByRole("spinbutton")
    await userEvent.type(fixed, "150000")
    await userEvent.type(necessary, "80000")
    await userEvent.click(screen.getByRole("button", { name: "Save budgets" }))

    await waitFor(() => expect(screen.getByText("Budgets saved.")).toBeInTheDocument())
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT")
    expect(JSON.parse(put![1]!.body as string)).toEqual({
      budgets: [
        { expenseType: "Fixed", monthlyAmount: 150000 },
        { expenseType: "Necessary", monthlyAmount: 80000 },
      ],
    })
  })
})
