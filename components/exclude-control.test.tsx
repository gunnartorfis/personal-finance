import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ExcludeControl } from "@/components/exclude-control"

afterEach(() => {
  vi.unstubAllGlobals()
})

const ID = "11111111-1111-1111-1111-111111111111"
const endpoint = `/api/transactions/${ID}/exclude`

describe("ExcludeControl", () => {
  it("excludes with a reason: opens the form, PUTs the note, and reports the change", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal("fetch", fetchMock)
    const onChanged = vi.fn()

    render(
      <ExcludeControl
        transactionId={ID}
        excluded={false}
        note={null}
        onChanged={onChanged}
      />
    )
    await userEvent.click(screen.getByRole("button", { name: /^exclude$/i }))
    await userEvent.type(
      screen.getByRole("textbox", { name: /reason/i }),
      "grandma's vacuum"
    )
    await userEvent.click(screen.getByRole("button", { name: /^exclude$/i }))

    expect(fetchMock).toHaveBeenCalledWith(
      endpoint,
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ note: "grandma's vacuum" }),
      })
    )
    expect(onChanged).toHaveBeenCalledWith({
      excluded: true,
      note: "grandma's vacuum",
    })
  })

  it("excludes with no reason: PUTs without a body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal("fetch", fetchMock)
    const onChanged = vi.fn()

    render(
      <ExcludeControl
        transactionId={ID}
        excluded={false}
        note={null}
        onChanged={onChanged}
      />
    )
    await userEvent.click(screen.getByRole("button", { name: /^exclude$/i }))
    await userEvent.click(screen.getByRole("button", { name: /^exclude$/i }))

    expect(fetchMock).toHaveBeenCalledWith(
      endpoint,
      expect.objectContaining({ method: "PUT" })
    )
    expect(fetchMock.mock.calls[0][1]).not.toHaveProperty("body")
    expect(onChanged).toHaveBeenCalledWith({ excluded: true, note: null })
  })

  it("re-includes an excluded row (DELETE) and shows the reason", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal("fetch", fetchMock)
    const onChanged = vi.fn()

    render(
      <ExcludeControl
        transactionId={ID}
        excluded
        note="grandma's vacuum"
        onChanged={onChanged}
      />
    )
    expect(screen.getByText(/excluded/i)).toBeInTheDocument()
    expect(screen.getByText(/grandma's vacuum/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: /include/i }))

    expect(fetchMock).toHaveBeenCalledWith(
      endpoint,
      expect.objectContaining({ method: "DELETE" })
    )
    expect(onChanged).toHaveBeenCalledWith({ excluded: false, note: null })
  })

  it("surfaces an error and does not report a change on a failed save", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 })
    )
    const onChanged = vi.fn()

    render(
      <ExcludeControl
        transactionId={ID}
        excluded={false}
        note={null}
        onChanged={onChanged}
      />
    )
    await userEvent.click(screen.getByRole("button", { name: /^exclude$/i }))
    await userEvent.click(screen.getByRole("button", { name: /^exclude$/i }))

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn.t save/i)
    expect(onChanged).not.toHaveBeenCalled()
  })
})
