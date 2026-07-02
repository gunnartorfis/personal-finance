import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { IncomeToggle } from "@/components/income-toggle"

afterEach(() => {
  vi.unstubAllGlobals()
})

const ID = "11111111-1111-1111-1111-111111111111"

describe("IncomeToggle", () => {
  it("PUTs when checked and reports the change", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal("fetch", fetchMock)
    const onChanged = vi.fn()

    render(<IncomeToggle transactionId={ID} incomeMarked={false} onChanged={onChanged} />)
    await userEvent.click(screen.getByRole("checkbox", { name: /income/i }))

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/transactions/${ID}/income`,
      expect.objectContaining({ method: "PUT" }),
    )
    expect(onChanged).toHaveBeenCalledWith(true)
  })

  it("DELETEs when unchecked and reports the change", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal("fetch", fetchMock)
    const onChanged = vi.fn()

    render(<IncomeToggle transactionId={ID} incomeMarked={true} onChanged={onChanged} />)
    await userEvent.click(screen.getByRole("checkbox", { name: /income/i }))

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/transactions/${ID}/income`,
      expect.objectContaining({ method: "DELETE" }),
    )
    expect(onChanged).toHaveBeenCalledWith(false)
  })

  it("surfaces an error and does not report a change on a failed save", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }))
    const onChanged = vi.fn()

    render(<IncomeToggle transactionId={ID} incomeMarked={false} onChanged={onChanged} />)
    await userEvent.click(screen.getByRole("checkbox", { name: /income/i }))

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn.t save/i)
    expect(onChanged).not.toHaveBeenCalled()
  })

  it("reflects the prop, so a parent refetch keeps the checkbox consistent", () => {
    vi.stubGlobal("fetch", vi.fn())
    const { rerender } = render(<IncomeToggle transactionId={ID} incomeMarked={false} />)
    expect(screen.getByRole("checkbox", { name: /income/i })).not.toBeChecked()
    rerender(<IncomeToggle transactionId={ID} incomeMarked={true} />)
    expect(screen.getByRole("checkbox", { name: /income/i })).toBeChecked()
  })
})
