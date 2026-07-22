import { screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

// The inline BalanceEntryForm calls useRouter for the post-save refresh.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { FinancialHealthSection } from "@/components/financial-health-section"
import type { FinancialHealth } from "@/lib/dashboard/financial-health"
import type { AccountBalance, NetWorth } from "@/lib/dashboard/net-worth"
import { formatDate } from "@/lib/format/date"
import { renderWithIntl as render } from "@/lib/test/render"

const HEALTH: FinancialHealth = {
  completedCycles: 6,
  hasEnoughHistory: true,
  avgMonthlySaving: 50000,
  avgMonthlyIncome: 250000,
  savingsRate: 0.2,
  monthlyBurn: 200000,
  profitableCount: 5,
  streakConsidered: 6,
}

const NET_WORTH: NetWorth = { total: 1_000_000, accountCount: 2, asOf: new Date("2026-03-01Z") }
const ACCOUNTS: AccountBalance[] = [
  { id: "a1", name: "Checking", balance: 600_000 },
  { id: "a2", name: "Savings", balance: 400_000 },
]

function renderSection(
  props: Partial<React.ComponentProps<typeof FinancialHealthSection>> = {},
  opts?: { locale?: "en" | "is" }
) {
  return render(
    <FinancialHealthSection
      health={props.health ?? HEALTH}
      // `in` (not ??) so an explicit `netWorth: null` isn't overridden by the default.
      netWorth={"netWorth" in props ? (props.netWorth ?? null) : NET_WORTH}
      accounts={props.accounts ?? ACCOUNTS}
      currency={props.currency ?? "ISK"}
    />,
    opts
  )
}

describe("FinancialHealthSection — profit & savings", () => {
  it("shows the savings rate as a percent, typical saving, and profit streak", () => {
    renderSection()
    expect(screen.getByText("Financial health")).toBeInTheDocument()
    expect(screen.getByText("Savings rate")).toBeInTheDocument()
    expect(screen.getByText("20%")).toBeInTheDocument()
    expect(screen.getByText(/Typical monthly saving/i)).toBeInTheDocument()
    expect(screen.getByText("5 of 6")).toBeInTheDocument()
    expect(screen.getByText(/healthy target/i)).toBeInTheDocument()
  })

  it("renders a negative savings rate with a minus sign", () => {
    renderSection({ health: { ...HEALTH, savingsRate: -0.1, avgMonthlySaving: -25000 } })
    expect(screen.getByText("-10%")).toBeInTheDocument()
  })

  it("falls back to a dash and hides the benchmark when the rate can't be computed", () => {
    renderSection({ health: { ...HEALTH, savingsRate: null } })
    expect(screen.getByText("—")).toBeInTheDocument()
    expect(screen.getByText("5 of 6")).toBeInTheDocument()
    expect(screen.queryByText(/healthy target/i)).not.toBeInTheDocument()
  })

  it("shows a neutral thin-data line instead of profit stats without enough history", () => {
    renderSection({
      health: {
        completedCycles: 1,
        hasEnoughHistory: false,
        avgMonthlySaving: null,
        avgMonthlyIncome: null,
        savingsRate: null,
        monthlyBurn: null,
        profitableCount: 1,
        streakConsidered: 1,
      },
    })
    expect(screen.getByText(/A few months of history/i)).toBeInTheDocument()
    expect(screen.queryByText("Savings rate")).not.toBeInTheDocument()
  })
})

describe("FinancialHealthSection — net worth & runway", () => {
  it("shows net worth and runway (net worth ÷ burn, floored)", () => {
    renderSection() // 1,000,000 / 200,000 = 5 months
    expect(screen.getByText("Net worth")).toBeInTheDocument()
    expect(screen.getByText(/1,000,000/)).toBeInTheDocument()
    expect(screen.getByText("Runway")).toBeInTheDocument()
    expect(screen.getByText("5 months")).toBeInTheDocument()
    expect(screen.getByText(/if income stopped/i)).toBeInTheDocument()
  })

  it("shows the 'as of' date beneath the net-worth figure", () => {
    renderSection()
    expect(screen.getByText(`as of ${formatDate(NET_WORTH.asOf, "en")}`)).toBeInTheDocument()
  })

  it("hides runway when burn is unknown but still shows net worth", () => {
    renderSection({ health: { ...HEALTH, monthlyBurn: null } })
    expect(screen.getByText("Net worth")).toBeInTheDocument()
    expect(screen.queryByText("Runway")).not.toBeInTheDocument()
  })

  it("prompts for balances and offers 'Add balances' when net worth is absent", () => {
    renderSection({
      netWorth: null,
      accounts: [{ id: "a1", name: "Checking", balance: null }],
    })
    expect(screen.getByText(/Add your account balances/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Add balances" })).toBeInTheDocument()
    expect(screen.queryByText("Net worth")).not.toBeInTheDocument()
  })

  it("offers 'Update balances' once a balance exists", () => {
    renderSection()
    expect(screen.getByRole("button", { name: "Update balances" })).toBeInTheDocument()
  })

  it("omits the whole net-worth block for a household with no accounts", () => {
    renderSection({ netWorth: null, accounts: [] })
    expect(screen.queryByText("Net worth")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /balances/i })).not.toBeInTheDocument()
    // The profit half still renders.
    expect(screen.getByText("Savings rate")).toBeInTheDocument()
  })

  it("localizes the section for the is catalog", () => {
    renderSection({}, { locale: "is" })
    expect(screen.getByText("Fjárhagsheilsa")).toBeInTheDocument()
    expect(screen.getByText("Hrein eign")).toBeInTheDocument()
  })
})
