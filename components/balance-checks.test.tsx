import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { BalanceChecks } from "@/components/balance-checks"
import type { AccountBalanceCheck } from "@/lib/dashboard/balance-check"
import { renderWithIntl as render } from "@/lib/test/render"

const check = (
  name: string,
  drift: number,
  matches: boolean,
): AccountBalanceCheck => ({
  accountId: name,
  name,
  check: { expected: 0, derived: 0, drift, matches },
})

describe("BalanceChecks", () => {
  it("renders nothing when every account matches", () => {
    const { container } = render(
      <BalanceChecks checks={[check("Bank", 0, true)]} currency="ISK" locale="en" />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it("lists drifted accounts with a missing/duplicate hint and omits matching ones", () => {
    render(
      <BalanceChecks
        checks={[check("Bank", 20_000, false), check("Card", -5_000, false), check("Savings", 0, true)]}
        currency="ISK"
        locale="en"
      />,
    )
    expect(screen.getByText("Balance check")).toBeInTheDocument()
    expect(screen.getByText("Bank")).toBeInTheDocument()
    expect(screen.getByText(/20[.,]000 unaccounted for/)).toBeInTheDocument()
    expect(screen.getByText("Card")).toBeInTheDocument()
    expect(screen.getByText(/5[.,]000 extra/)).toBeInTheDocument()
    // A matching account is not listed.
    expect(screen.queryByText("Savings")).not.toBeInTheDocument()
  })
})
