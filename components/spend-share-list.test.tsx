import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { SpendShareList } from "@/components/spend-share-list"

describe("SpendShareList", () => {
  it("renders nothing when there are no items", () => {
    const { container } = render(<SpendShareList heading="Top merchants" items={[]} currency="ISK" />)
    expect(container).toBeEmptyDOMElement()
  })

  it("renders the heading and each item with amount and share", () => {
    render(
      <SpendShareList
        heading="Top merchants"
        items={[
          { key: "a", label: "BONUS", spending: 500, share: 0.5 },
          { key: "b", label: "N1", spending: 250, share: 0.25 },
        ]}
        currency="ISK"
      />,
    )
    expect(screen.getByText("Top merchants")).toBeInTheDocument()
    expect(screen.getAllByRole("listitem")).toHaveLength(2)
    expect(screen.getByText("BONUS")).toBeInTheDocument()
    expect(screen.getByText(/500/)).toBeInTheDocument()
    expect(screen.getByText("50%")).toBeInTheDocument()
    expect(screen.getByText("25%")).toBeInTheDocument()
  })

  it("renders the heading at the requested level", () => {
    render(
      <SpendShareList
        heading="Spending by account"
        items={[{ key: "a", label: "Visa", spending: 100, share: 1 }]}
        currency="ISK"
        headingLevel={3}
      />,
    )
    expect(screen.getByRole("heading", { level: 3, name: "Spending by account" })).toBeInTheDocument()
  })
})
