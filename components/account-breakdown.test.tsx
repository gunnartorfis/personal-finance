import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { AccountBreakdown } from "@/components/account-breakdown"
import type { AccountSpend } from "@/lib/dashboard/account-breakdown"

const ACCOUNTS: AccountSpend[] = [
  { accountId: "a1", name: "Visa", spending: 600, share: 0.6 },
  { accountId: "a2", name: "Mastercard", spending: 400, share: 0.4 },
]

describe("AccountBreakdown", () => {
  it("renders nothing when accounts is null (single-account household)", () => {
    const { container } = render(<AccountBreakdown accounts={null} currency="ISK" />)
    expect(container).toBeEmptyDOMElement()
  })

  it("renders nothing when there are no accounts with spend", () => {
    const { container } = render(<AccountBreakdown accounts={[]} currency="ISK" />)
    expect(container).toBeEmptyDOMElement()
  })

  it("lists each account with its spend and share", () => {
    render(<AccountBreakdown accounts={ACCOUNTS} currency="ISK" />)
    expect(screen.getByText("Spending by account")).toBeInTheDocument()
    expect(screen.getAllByRole("listitem")).toHaveLength(2)
    expect(screen.getByText("Visa")).toBeInTheDocument()
    expect(screen.getByText(/600/)).toBeInTheDocument()
    expect(screen.getByText("60%")).toBeInTheDocument()
    expect(screen.getByText("Mastercard")).toBeInTheDocument()
    expect(screen.getByText("40%")).toBeInTheDocument()
  })
})
