import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { SavingsProgressCard } from "@/components/savings-progress-card"
import { renderWithIntl as render } from "@/lib/test/render"

describe("SavingsProgressCard", () => {
  it("renders nothing without progress", () => {
    const { container } = render(
      <SavingsProgressCard progress={null} locale="en" />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it("shows saved of target with a meter and links to /savings", () => {
    render(
      <SavingsProgressCard
        progress={{
          target: 1_200_000,
          saved: 500_000,
          percent: 42,
          currency: "ISK",
        }}
        locale="en"
      />
    )
    expect(screen.getByRole("link", { name: /savings goal/i })).toHaveAttribute(
      "href",
      "/savings"
    )
    expect(screen.getByText("ISK 500,000")).toBeInTheDocument()
    expect(screen.getByText(/of ISK 1,200,000/)).toBeInTheDocument()
    const meter = screen.getByRole("meter")
    expect(meter).toHaveAttribute("aria-valuenow", "42")
  })

  it("floors a negative saved at an empty meter", () => {
    render(
      <SavingsProgressCard
        progress={{
          target: 1_200_000,
          saved: -300_000,
          percent: 0,
          currency: "ISK",
        }}
        locale="en"
      />
    )
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "0")
  })
})
