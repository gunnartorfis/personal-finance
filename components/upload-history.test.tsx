import { fireEvent, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }))

import { UploadHistory, type UploadHistoryItem } from "@/components/upload-history"
import { renderWithIntl as render } from "@/lib/test/render"

afterEach(() => {
  vi.restoreAllMocks()
  refresh.mockClear()
})

/** A view-model row with sensible defaults; override per test. */
function item(overrides: Partial<UploadHistoryItem> = {}): UploadHistoryItem {
  return {
    id: "u1",
    fileName: "march.csv",
    accountName: "Main",
    importedByName: "Alex",
    createdAt: "2026-03-01T09:00:00Z",
    undoneAt: null,
    undoneByName: null,
    transactionCount: 24,
    supersededByReimport: false,
    status: "active",
    ...overrides,
  }
}

describe("UploadHistory", () => {
  it("shows an empty state when there are no uploads", () => {
    render(<UploadHistory items={[]} />)
    expect(screen.getByText(/no uploads yet/i)).toBeInTheDocument()
  })

  it("renders active and undone rows with their details", () => {
    render(
      <UploadHistory
        items={[
          item({ id: "a", fileName: "march.csv", accountName: "Main", importedByName: "Alex", transactionCount: 24 }),
          item({
            id: "b",
            fileName: "feb.csv",
            accountName: "Savings",
            importedByName: "Robin",
            transactionCount: 10,
            status: "undone",
            undoneAt: "2026-04-01T09:00:00Z",
            undoneByName: "Sam",
          }),
        ]}
      />,
    )

    expect(screen.getByText("march.csv")).toBeInTheDocument()
    expect(screen.getByText("feb.csv")).toBeInTheDocument()
    expect(screen.getByText(/Main/)).toBeInTheDocument()
    expect(screen.getByText(/24 transactions/)).toBeInTheDocument()
    expect(screen.getByText(/Imported by Alex/)).toBeInTheDocument()
    // The undone row carries a status badge with the undoer attribution.
    expect(screen.getByText(/undone/i)).toBeInTheDocument()
    expect(screen.getByText(/by Sam/)).toBeInTheDocument()

    // Active row → Undo; undone row → Restore.
    expect(screen.getByRole("button", { name: /^undo$/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /restore/i })).toBeInTheDocument()
  })

  it("Undo reveals an inline confirm with the count, then posts to the undo endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"))
    render(<UploadHistory items={[item({ id: "u42", transactionCount: 24 })]} />)

    // First click only reveals the confirm affordance — no request yet.
    fireEvent.click(screen.getByRole("button", { name: /^undo$/i }))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByText(/24 transactions will be hidden/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: /^confirm$/i }))
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/uploads/u42/undo", { method: "POST" }),
    )
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it("the undo confirm can be cancelled without posting", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"))
    render(<UploadHistory items={[item({ id: "u7" })]} />)

    fireEvent.click(screen.getByRole("button", { name: /^undo$/i }))
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }))

    expect(screen.getByRole("button", { name: /^undo$/i })).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("Restore posts to the restore endpoint and refreshes", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"))
    render(
      <UploadHistory
        items={[item({ id: "u9", status: "undone", undoneAt: "2026-04-01T09:00:00Z", undoneByName: "Sam" })]}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: /restore/i }))
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/uploads/u9/restore", { method: "POST" }),
    )
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it("a re-imported (superseded) undone row shows the note instead of a Restore button", () => {
    render(
      <UploadHistory
        items={[
          item({
            id: "u3",
            status: "undone",
            undoneAt: "2026-04-01T09:00:00Z",
            undoneByName: "Sam",
            supersededByReimport: true,
          }),
        ]}
      />,
    )

    expect(screen.getByText(/already re-imported/i)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /restore/i })).not.toBeInTheDocument()
  })

  it("shows an inline error when undo fails, without refreshing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("no", { status: 500 }))
    render(<UploadHistory items={[item({ id: "u5" })]} />)

    fireEvent.click(screen.getByRole("button", { name: /^undo$/i }))
    fireEvent.click(screen.getByRole("button", { name: /^confirm$/i }))

    expect(await screen.findByRole("alert")).toHaveTextContent(/try again/i)
    expect(refresh).not.toHaveBeenCalled()
  })
})
