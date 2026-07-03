import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { HouseholdReset } from "@/components/household-reset"
import { renderWithIntl as render } from "@/lib/test/render"

describe("HouseholdReset", () => {
  it("renders the danger-zone control and its rich description", () => {
    render(<HouseholdReset />)
    expect(
      screen.getByRole("button", { name: /reset transaction data/i })
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /danger zone/i })).toBeInTheDocument()
    // The <strong>all</strong> chunk from the rich-text description renders.
    expect(screen.getByText("all")).toBeInTheDocument()
  })
})
