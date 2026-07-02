import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { BankSyncGate } from "@/components/bank-sync-gate"

describe("BankSyncGate", () => {
  it("renders the connect action for a Premium household", () => {
    render(
      <BankSyncGate plan="Premium">
        <button type="button">Connect a bank</button>
      </BankSyncGate>,
    )
    expect(screen.getByRole("button", { name: /connect a bank/i })).toBeInTheDocument()
    expect(screen.queryByText(/upgrade to premium/i)).not.toBeInTheDocument()
  })

  it("shows an upgrade prompt instead of the connect action for a Free household", () => {
    render(
      <BankSyncGate plan="Free">
        <button type="button">Connect a bank</button>
      </BankSyncGate>,
    )
    expect(screen.queryByRole("button", { name: /connect a bank/i })).not.toBeInTheDocument()
    const link = screen.getByRole("link", { name: /upgrade to premium/i })
    expect(link).toHaveAttribute("href", "/settings/billing")
  })
})
