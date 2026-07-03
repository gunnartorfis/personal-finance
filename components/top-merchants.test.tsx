import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { TopMerchants } from "@/components/top-merchants"
import type { MerchantSpend } from "@/lib/dashboard/top-merchants"

const MERCHANTS: MerchantSpend[] = [
  { merchant: "BONUS", spending: 500, share: 0.5 },
  { merchant: "N1", spending: 250, share: 0.25 },
]

describe("TopMerchants", () => {
  it("renders nothing when there are no merchants", () => {
    const { container } = render(<TopMerchants merchants={[]} currency="ISK" />)
    expect(container).toBeEmptyDOMElement()
  })

  it("lists each merchant with its amount and share", () => {
    render(<TopMerchants merchants={MERCHANTS} currency="ISK" />)
    expect(screen.getByText("Top merchants")).toBeInTheDocument()
    const items = screen.getAllByRole("listitem")
    expect(items).toHaveLength(2)
    expect(screen.getByText("BONUS")).toBeInTheDocument()
    expect(screen.getByText(/500/)).toBeInTheDocument()
    expect(screen.getByText("50%")).toBeInTheDocument()
    expect(screen.getByText("N1")).toBeInTheDocument()
    expect(screen.getByText("25%")).toBeInTheDocument()
  })
})
