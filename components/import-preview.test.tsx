import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { ImportPreview, type UploadPreviewData } from "@/components/import-preview"
import { renderWithIntl as render } from "@/lib/test/render"

const base: UploadPreviewData = {
  header: ["Col A", "Col B", "Col C", "Col D"],
  detectedMapping: { date: 0, merchant: 1, category: 2, amount: 3 },
  mappingSource: "ai",
  unmatchedRoles: [],
  rows: [{ sourceRow: 0, date: "2026-01-01", amount: -100, merchant: "Cafe", rawCategory: "Food" }],
  newCount: 5,
  duplicateCount: 2,
  wholeFileDuplicate: false,
}

describe("ImportPreview", () => {
  it("shows the account, new and duplicate counts, and a sample row", () => {
    render(
      <ImportPreview preview={base} accountName="Visa" busy={false} onConfirm={vi.fn()} onCancel={vi.fn()} />,
    )
    expect(screen.getByText(/Visa/)).toBeInTheDocument()
    expect(screen.getByText(/5 new/i)).toBeInTheDocument()
    expect(screen.getByText(/2 already imported/i)).toBeInTheDocument()
    expect(screen.getByText("Cafe")).toBeInTheDocument()
  })

  it("confirms with the detected mapping when it is complete", async () => {
    const onConfirm = vi.fn()
    render(
      <ImportPreview preview={base} accountName="Visa" busy={false} onConfirm={onConfirm} onCancel={vi.fn()} />,
    )
    await userEvent.click(screen.getByRole("button", { name: /confirm import/i }))
    expect(onConfirm).toHaveBeenCalledWith({ date: 0, merchant: 1, category: 2, amount: 3 })
  })

  it("disables confirm until every role is mapped", async () => {
    const onConfirm = vi.fn()
    const preview: UploadPreviewData = {
      ...base,
      mappingSource: "none",
      detectedMapping: { date: 0, merchant: 1, category: 2 }, // amount unmatched
      unmatchedRoles: ["amount"],
    }
    render(
      <ImportPreview preview={preview} accountName="Visa" busy={false} onConfirm={onConfirm} onCancel={vi.fn()} />,
    )
    const confirm = screen.getByRole("button", { name: /confirm import/i })
    expect(confirm).toBeDisabled()

    // Map the missing amount role to a column, then confirm becomes available.
    await userEvent.selectOptions(screen.getByLabelText(/amount/i), "3")
    expect(confirm).toBeEnabled()
    await userEvent.click(confirm)
    expect(onConfirm).toHaveBeenCalledWith({ date: 0, merchant: 1, category: 2, amount: 3 })
  })

  it("shows a 'nothing new' notice and no confirm for a whole-file duplicate", () => {
    const onCancel = vi.fn()
    render(
      <ImportPreview
        preview={{ ...base, wholeFileDuplicate: true }}
        accountName="Visa"
        busy={false}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    )
    expect(screen.getByText(/nothing new to import/i)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /confirm import/i })).not.toBeInTheDocument()
  })
})
