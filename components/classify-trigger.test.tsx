import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ClassifyTrigger } from "@/components/classify-trigger"

afterEach(() => vi.unstubAllGlobals())

/** Queue of `POST /api/classify` responses, consumed in order (one per batch). */
function stubClassify(batches: Array<{ classified: number; failed: number; capped: number }>) {
  let i = 0
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    expect(url).toBe("/api/classify")
    expect(init?.method).toBe("POST")
    const body = batches[Math.min(i, batches.length - 1)]
    i += 1
    return { ok: true, json: async () => body }
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

describe("ClassifyTrigger", () => {
  it("drains every pending batch and shows the totals", async () => {
    const fetchMock = stubClassify([
      { classified: 25, failed: 0, capped: 0 },
      { classified: 5, failed: 1, capped: 0 },
      { classified: 0, failed: 0, capped: 0 },
    ])
    render(<ClassifyTrigger />)
    await userEvent.click(screen.getByRole("button", { name: /classify pending/i }))

    expect(await screen.findByText(/30 classified/i)).toBeInTheDocument()
    expect(screen.getByText(/1 failed/i)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it("runs once automatically when autoRun is set", async () => {
    stubClassify([
      { classified: 2, failed: 0, capped: 0 },
      { classified: 0, failed: 0, capped: 0 },
    ])
    render(<ClassifyTrigger autoRun />)
    expect(await screen.findByText(/2 classified/i)).toBeInTheDocument()
  })

  it("surfaces an error when a batch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })),
    )
    render(<ClassifyTrigger />)
    await userEvent.click(screen.getByRole("button", { name: /classify pending/i }))
    expect(await screen.findByRole("alert")).toBeInTheDocument()
  })

  it("notes when the Free cap pauses classification", async () => {
    stubClassify([{ classified: 0, failed: 0, capped: 4 }])
    render(<ClassifyTrigger />)
    await userEvent.click(screen.getByRole("button", { name: /classify pending/i }))
    expect(await screen.findByText(/free plan limit/i)).toBeInTheDocument()
  })
})
