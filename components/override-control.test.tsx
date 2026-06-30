import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { OverrideControl } from "@/components/override-control"

afterEach(() => {
  vi.unstubAllGlobals()
})

const ID = "11111111-1111-1111-1111-111111111111"

describe("OverrideControl", () => {
  it("PUTs the chosen expense type and surfaces the reset action", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal("fetch", fetchMock)
    const onChanged = vi.fn()

    render(
      <OverrideControl transactionId={ID} value="Necessary" hasOverride={false} onChanged={onChanged} />,
    )
    await userEvent.selectOptions(screen.getByRole("combobox"), "Nice to have")

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/transactions/${ID}/override`,
      expect.objectContaining({ method: "PUT" }),
    )
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ expenseType: "Nice to have" })
    expect(await screen.findByRole("button", { name: /reset/i })).toBeInTheDocument()
    expect(onChanged).toHaveBeenCalledWith({ expenseType: "Nice to have", hasOverride: true })
  })

  it("can set the empty split type", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal("fetch", fetchMock)

    render(<OverrideControl transactionId={ID} value="Fixed" hasOverride={false} />)
    await userEvent.selectOptions(screen.getByRole("combobox"), "Split / none")

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ expenseType: "" })
  })

  it("DELETEs when reset is clicked", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal("fetch", fetchMock)

    render(<OverrideControl transactionId={ID} value="Fixed" hasOverride={true} />)
    await userEvent.click(screen.getByRole("button", { name: /reset/i }))

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/transactions/${ID}/override`,
      expect.objectContaining({ method: "DELETE" }),
    )
  })

  it("shows an error alert when saving fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }))

    render(<OverrideControl transactionId={ID} value="Fixed" hasOverride={false} />)
    await userEvent.selectOptions(screen.getByRole("combobox"), "Necessary")

    expect(await screen.findByRole("alert")).toBeInTheDocument()
  })
})
