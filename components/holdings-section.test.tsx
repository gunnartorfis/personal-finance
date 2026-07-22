import { screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

// The inline BalanceEntryForm calls useRouter for the post-save refresh.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { HoldingsSection } from "@/components/holdings-section"
import type { AccountBalance, NetWorth } from "@/lib/dashboard/net-worth"
import { formatDate } from "@/lib/format/date"
import { renderWithIntl as render } from "@/lib/test/render"

const NET_WORTH: NetWorth = { total: 1_000_000, accountCount: 2, asOf: new Date("2026-03-01Z") }
const ACCOUNTS: AccountBalance[] = [
  { id: "a1", name: "InteractiveBrokers", balance: 600_000 },
  { id: "a2", name: "Cash", balance: 400_000 },
]

function renderSection(
  props: Partial<React.ComponentProps<typeof HoldingsSection>> = {},
  opts?: { locale?: "en" | "is" }
) {
  return render(
    <HoldingsSection
      netWorth={"netWorth" in props ? (props.netWorth ?? null) : NET_WORTH}
      accounts={props.accounts ?? ACCOUNTS}
      currency={props.currency ?? "ISK"}
      balancesAgeDays={props.balancesAgeDays}
    />,
    opts
  )
}

describe("HoldingsSection", () => {
  it("shows the total and a per-account breakdown", () => {
    renderSection()
    expect(screen.getByText("Holdings")).toBeInTheDocument()
    expect(screen.getByText("Total")).toBeInTheDocument()
    expect(screen.getByText(/1,000,000/)).toBeInTheDocument()
    expect(screen.getByText("InteractiveBrokers")).toBeInTheDocument()
    expect(screen.getByText(/600,000/)).toBeInTheDocument()
    expect(screen.getByText("Cash")).toBeInTheDocument()
    expect(screen.getByText(/400,000/)).toBeInTheDocument()
    expect(screen.getByText("60%")).toBeInTheDocument() // 600k / 1M
    expect(screen.getByText("40%")).toBeInTheDocument() // 400k / 1M
  })

  it("shows the UTC-anchored 'as of' date for the total", () => {
    renderSection()
    const asOf = formatDate(NET_WORTH.asOf, "en", { dateStyle: "medium", timeZone: "UTC" })
    expect(screen.getByText(`as of ${asOf}`)).toBeInTheDocument()
  })

  it("omits accounts that have no recorded balance from the breakdown", () => {
    renderSection({
      accounts: [
        { id: "a1", name: "InteractiveBrokers", balance: 600_000 },
        { id: "a2", name: "Unfunded", balance: null },
      ],
    })
    expect(screen.getByText("InteractiveBrokers")).toBeInTheDocument()
    expect(screen.queryByText("Unfunded")).not.toBeInTheDocument()
  })

  it("invites entry (no total) when no balance is recorded yet", () => {
    renderSection({
      netWorth: null,
      accounts: [{ id: "a1", name: "InteractiveBrokers", balance: null }],
    })
    expect(screen.getByText(/Add your account balances/i)).toBeInTheDocument()
    expect(screen.queryByText("Total")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Add balances" })).toBeInTheDocument()
  })

  it("renders nothing when the household has no accounts", () => {
    const { container } = renderSection({ netWorth: null, accounts: [] })
    expect(container).toBeEmptyDOMElement()
  })

  it("nudges to update when balances are at least 30 days old", () => {
    renderSection({ balancesAgeDays: 35 }) // ~5 weeks
    expect(screen.getByText(/5 weeks old/)).toBeInTheDocument()
  })

  it("shows no staleness nudge when balances are fresh", () => {
    renderSection({ balancesAgeDays: 3 })
    expect(screen.queryByText(/weeks old/)).not.toBeInTheDocument()
  })

  it("localizes the section for the is catalog", () => {
    renderSection({}, { locale: "is" })
    expect(screen.getByText("Eignir")).toBeInTheDocument()
  })
})
