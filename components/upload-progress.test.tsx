import { render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { UploadProgress } from "@/components/upload-progress"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("UploadProgress", () => {
  it("renders the settled percentage from the progress endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ total: 4, pending: 2, classified: 1, failed: 1, done: false }),
      }),
    )

    render(<UploadProgress uploadId="u1" />)

    // classified + failed = 2 of 4 settled => 50%
    expect(await screen.findByText("50%")).toBeInTheDocument()
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50")
  })

  it("shows a completed state and stops polling once done", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ total: 3, pending: 0, classified: 3, failed: 0, done: true }),
    })
    vi.stubGlobal("fetch", fetchMock)

    render(<UploadProgress uploadId="u2" />)

    expect(await screen.findByText("100%")).toBeInTheDocument()
    expect(screen.getByText(/complete/i)).toBeInTheDocument()
    // done === true => the component must not schedule another poll
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith("/api/uploads/u2/progress")
  })

  it("surfaces a retrying state when the endpoint errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }))

    render(<UploadProgress uploadId="u3" />)

    expect(await screen.findByText(/retrying/i)).toBeInTheDocument()
  })
})
