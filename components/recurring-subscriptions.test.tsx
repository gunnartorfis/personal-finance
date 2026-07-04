import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { RecurringSubscriptions } from "@/components/recurring-subscriptions"
import type { RecurringSummary } from "@/lib/dashboard/recurring"
import { renderWithIntl as render } from "@/lib/test/render"

const SUMMARY: RecurringSummary = {
  subscriptions: [
    { merchant: "GYM", monthlyAmount: 8_900, occurrences: 3, lastMonth: "2026-04" },
    { merchant: "SPOTIFY", monthlyAmount: 1_490, occurrences: 6, lastMonth: "2026-04" },
  ],
  committedMonthlyTotal: 10_390,
}

describe("RecurringSubscriptions", () => {
  it("renders nothing when no subscriptions were detected", () => {
    const { container } = render(
      <RecurringSubscriptions
        recurring={{ subscriptions: [], committedMonthlyTotal: 0 }}
        currency="ISK"
        locale="en"
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it("lists each subscription with its monthly amount, occurrence count, and committed total", () => {
    render(<RecurringSubscriptions recurring={SUMMARY} currency="ISK" locale="en" />)
    expect(screen.getByText("Subscriptions")).toBeInTheDocument()
    expect(screen.getAllByRole("listitem")).toHaveLength(2)
    expect(screen.getByText("GYM")).toBeInTheDocument()
    expect(screen.getByText("SPOTIFY")).toBeInTheDocument()
    expect(screen.getByText("3 months")).toBeInTheDocument()
    expect(screen.getByText("6 months")).toBeInTheDocument()
    // Committed monthly total is rendered (10,390 with grouping).
    expect(screen.getByText(/10[.,]390/)).toBeInTheDocument()
  })

  it("uses the singular form for a subscription seen in exactly one month", () => {
    render(
      <RecurringSubscriptions
        recurring={{
          subscriptions: [{ merchant: "NEWSUB", monthlyAmount: 990, occurrences: 1, lastMonth: "2026-04" }],
          committedMonthlyTotal: 990,
        }}
        currency="ISK"
        locale="en"
      />,
    )
    expect(screen.getByText("1 month")).toBeInTheDocument()
  })
})
