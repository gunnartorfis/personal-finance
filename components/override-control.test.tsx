import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { OverrideControl } from "@/components/override-control"

afterEach(() => {
  vi.unstubAllGlobals()
})

const ID = "11111111-1111-1111-1111-111111111111"

describe("OverrideControl", () => {
  it("PUTs the chosen expense type and reports the change", async () => {
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
    expect(onChanged).toHaveBeenCalledWith({ expenseType: "Nice to have", hasOverride: true })
  })

  it("can set the empty split type", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal("fetch", fetchMock)

    render(<OverrideControl transactionId={ID} value="Fixed" hasOverride={false} />)
    await userEvent.selectOptions(screen.getByRole("combobox"), "Split / none")

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ expenseType: "" })
  })

  it("DELETEs when reset is clicked and reports the clear with no effective type", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal("fetch", fetchMock)
    const onChanged = vi.fn()

    render(<OverrideControl transactionId={ID} value="Fixed" hasOverride={true} onChanged={onChanged} />)
    await userEvent.click(screen.getByRole("button", { name: /reset/i }))

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/transactions/${ID}/override`,
      expect.objectContaining({ method: "DELETE" }),
    )
    // The server reverted to the classified type, which the control doesn't know -> null.
    expect(onChanged).toHaveBeenCalledWith({ expenseType: null, hasOverride: false })
  })

  it("reflects the props directly, so a parent refetch keeps the dropdown and reset consistent", () => {
    vi.stubGlobal("fetch", vi.fn())
    const { rerender } = render(<OverrideControl transactionId={ID} value="Fixed" hasOverride={true} />)
    expect(screen.getByRole("combobox")).toHaveValue("Fixed")
    expect(screen.getByRole("button", { name: /reset/i })).toBeInTheDocument()

    // Parent cleared the override and refetched: effective type is now the classified type.
    rerender(<OverrideControl transactionId={ID} value="Necessary" hasOverride={false} />)
    expect(screen.getByRole("combobox")).toHaveValue("Necessary")
    expect(screen.queryByRole("button", { name: /reset/i })).not.toBeInTheDocument()
  })

  it("shows an error alert and does not report a change on failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }))
    const onChanged = vi.fn()

    render(<OverrideControl transactionId={ID} value="Fixed" hasOverride={false} onChanged={onChanged} />)
    await userEvent.selectOptions(screen.getByRole("combobox"), "Necessary")

    expect(await screen.findByRole("alert")).toBeInTheDocument()
    expect(onChanged).not.toHaveBeenCalled()
    // Controlled by the prop, so the dropdown still shows the persisted type.
    expect(screen.getByRole("combobox")).toHaveValue("Fixed")
  })
})
