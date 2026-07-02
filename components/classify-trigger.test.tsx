import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { StrictMode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ClassifyTrigger } from "@/components/classify-trigger"

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

/** The localStorage key ClassifyTrigger uses to mark a resumable drain in flight. */
const ACTIVE_KEY = "classify:active"

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

  it("renders a progress bar against the pending baseline, filling to 100% on completion", async () => {
    stubClassify([
      { classified: 6, failed: 0, capped: 0 },
      { classified: 4, failed: 0, capped: 0 },
      { classified: 0, failed: 0, capped: 0 },
    ])
    render(<ClassifyTrigger pendingCount={10} />)
    // The baseline count is surfaced on the button so it's visible (and survives reload) pre-run.
    await userEvent.click(screen.getByRole("button", { name: /classify pending \(10\)/i }))

    const bar = await screen.findByRole("progressbar", { name: /classification progress/i })
    await vi.waitFor(() => expect(bar).toHaveAttribute("aria-valuenow", "100"))
  })

  it("shows a progress bar for a retry-only drain, keyed off the failure count", async () => {
    let drained = false
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        expect(init?.method).toBe("POST")
        if (url === "/api/classify/retry") return { ok: true, json: async () => ({ reset: 3 }) }
        const body = drained
          ? { classified: 0, failed: 0, capped: 0 }
          : { classified: 3, failed: 0, capped: 0 }
        drained = true
        return { ok: true, json: async () => body }
      }),
    )
    render(<ClassifyTrigger failedCount={3} retryOnly />)
    await userEvent.click(screen.getByRole("button", { name: /retry 3 failed/i }))

    const bar = await screen.findByRole("progressbar", { name: /classification progress/i })
    await vi.waitFor(() => expect(bar).toHaveAttribute("aria-valuenow", "100"))
  })

  it("renders no progress bar when no pending baseline is given", () => {
    stubClassify([{ classified: 0, failed: 0, capped: 0 }])
    render(<ClassifyTrigger />)
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument()
  })

  it("auto-resumes a persisted drain on mount when resumable, without a click", async () => {
    stubClassify([
      { classified: 3, failed: 0, capped: 0 },
      { classified: 0, failed: 0, capped: 0 },
    ])
    window.localStorage.setItem(ACTIVE_KEY, "1")
    render(<ClassifyTrigger resumable pendingCount={3} />)
    // No click: the persisted flag + remaining pending drives the drain on mount.
    expect(await screen.findByText(/3 classified/i)).toBeInTheDocument()
    // Cleared once the queue drains, so a later load doesn't re-drive on its own.
    expect(window.localStorage.getItem(ACTIVE_KEY)).toBeNull()
  })

  it("does not abort the running drain when pendingCount changes (polling parent)", async () => {
    let signal: AbortSignal | undefined
    let calls = 0
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        signal = init?.signal ?? undefined
        if (init?.signal?.aborted) throw new DOMException("aborted", "AbortError")
        calls += 1
        // never-settling queue so the drain stays in flight across the re-renders below
        return { ok: true, json: async () => ({ classified: 25, failed: 0, capped: 0 }) }
      }),
    )
    window.localStorage.setItem(ACTIVE_KEY, "1")
    const { rerender } = render(<ClassifyTrigger resumable pendingCount={100} />)
    await vi.waitFor(() => expect(calls).toBeGreaterThan(0))
    const before = calls

    // A polling parent (the banner) feeds a decreasing count; this must NOT tear down the drain.
    rerender(<ClassifyTrigger resumable pendingCount={80} />)
    rerender(<ClassifyTrigger resumable pendingCount={60} />)

    expect(signal?.aborted).toBe(false)
    await vi.waitFor(() => expect(calls).toBeGreaterThan(before))
  })

  it("resumes under StrictMode's mount→cleanup→remount instead of getting stuck", async () => {
    let calls = 0
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.signal?.aborted) throw new DOMException("aborted", "AbortError")
        calls += 1
        // First couple of batches make progress, then the queue reports empty so the drain finishes.
        return {
          ok: true,
          json: async () =>
            calls <= 2
              ? { classified: 1, failed: 0, capped: 0 }
              : { classified: 0, failed: 0, capped: 0 },
        }
      }),
    )
    window.localStorage.setItem(ACTIVE_KEY, "1")
    render(
      <StrictMode>
        <ClassifyTrigger resumable pendingCount={50} />
      </StrictMode>,
    )
    // With the old ref-guard, StrictMode aborted the first drain and never restarted it (stuck on
    // "Classifying…"). The totals line only appears if the remount actually re-drove to completion.
    expect(await screen.findByText(/classified\./i)).toBeInTheDocument()
  })

  it("does not auto-resume when the persisted flag is absent", async () => {
    const fetchMock = stubClassify([{ classified: 0, failed: 0, capped: 0 }])
    render(<ClassifyTrigger resumable pendingCount={3} />)
    await screen.findByRole("button", { name: /classify pending/i })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("keeps the active flag when unmounted mid-drain so a later mount resumes", async () => {
    let signal: AbortSignal | undefined
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        signal = init?.signal ?? undefined
        if (init?.signal?.aborted) throw new DOMException("aborted", "AbortError")
        // never-settling queue so the drain is still in flight at unmount
        return { ok: true, json: async () => ({ classified: 25, failed: 0, capped: 0 }) }
      }),
    )
    window.localStorage.setItem(ACTIVE_KEY, "1")
    const { unmount } = render(<ClassifyTrigger resumable pendingCount={100} />)
    await vi.waitFor(() => expect(signal).toBeDefined())

    unmount()
    // Abort (refresh/nav) must NOT clear the flag — that's what lets the next page load resume.
    expect(window.localStorage.getItem(ACTIVE_KEY)).toBe("1")
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
