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

  it("hides the Classify-pending button in retryOnly mode, keeping only retry", () => {
    render(<ClassifyTrigger failedCount={2} retryOnly />)
    expect(screen.queryByRole("button", { name: /classify pending/i })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: /retry 2 failed/i })).toBeInTheDocument()
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

  it("aborts the in-flight drain when unmounted", async () => {
    let signal: AbortSignal | undefined
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        signal = init?.signal ?? undefined
        if (init?.signal?.aborted) throw new DOMException("aborted", "AbortError")
        // never-settling queue: every batch reports progress, so the loop would run forever
        return { ok: true, json: async () => ({ classified: 25, failed: 0, capped: 0 }) }
      }),
    )
    const { unmount } = render(<ClassifyTrigger autoRun />)
    await vi.waitFor(() => expect(signal).toBeDefined())
    expect(signal!.aborted).toBe(false)

    unmount()
    expect(signal!.aborted).toBe(true)
  })

  it("shows no retry button when there are no failed rows", () => {
    stubClassify([{ classified: 0, failed: 0, capped: 0 }])
    render(<ClassifyTrigger failedCount={0} />)
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument()
  })

  it("requeues failed rows then drains them when Retry failed is clicked", async () => {
    const calls: string[] = []
    let drained = false
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        expect(init?.method).toBe("POST")
        calls.push(url)
        if (url === "/api/classify/retry") return { ok: true, json: async () => ({ reset: 3 }) }
        // First classify batch reports progress, the second reports none → loop ends.
        const body = drained
          ? { classified: 0, failed: 0, capped: 0 }
          : { classified: 3, failed: 0, capped: 0 }
        drained = true
        return { ok: true, json: async () => body }
      }),
    )
    render(<ClassifyTrigger failedCount={3} />)
    await userEvent.click(screen.getByRole("button", { name: /retry 3 failed/i }))

    expect(await screen.findByText(/3 classified/i)).toBeInTheDocument()
    expect(calls[0]).toBe("/api/classify/retry")
    expect(calls.slice(1).every((u) => u === "/api/classify")).toBe(true)
  })

  it("surfaces an error and does not drain when the retry reset fails", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/classify/retry") return { ok: false, status: 500, json: async () => ({}) }
      throw new Error("classify should not be called when reset fails")
    })
    vi.stubGlobal("fetch", fetchMock)
    render(<ClassifyTrigger failedCount={2} />)
    await userEvent.click(screen.getByRole("button", { name: /retry 2 failed/i }))

    expect(await screen.findByRole("alert")).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("notes when the Free cap pauses classification", async () => {
    stubClassify([{ classified: 0, failed: 0, capped: 4 }])
    render(<ClassifyTrigger />)
    await userEvent.click(screen.getByRole("button", { name: /classify pending/i }))
    expect(await screen.findByText(/free plan limit/i)).toBeInTheDocument()
  })
})
