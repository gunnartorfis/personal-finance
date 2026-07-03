import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { DashboardView } from "@/lib/dashboard/dashboard-view"

// Mock the tenant guard (keeps Neon Auth / next/headers out of jsdom) and the data loader, so the
// page test exercises pure assembly of the already-tested modules.
const { requireHousehold, loadDashboardView, loadSavingsProgress } = vi.hoisted(() => ({
  requireHousehold: vi.fn(),
  loadDashboardView: vi.fn(),
  loadSavingsProgress: vi.fn(),
}))
vi.mock("@/lib/household/current", () => ({ requireHousehold }))
vi.mock("@/lib/dashboard/dashboard-view", () => ({ loadDashboardView }))
vi.mock("@/lib/savings/assessment", () => ({ loadSavingsProgress }))
// resolveRequestLocale reads cookies() (request scope, unavailable in jsdom); pin
// it to en so the currency assertions below stay en-US.
vi.mock("@/lib/i18n/locale", () => ({
  resolveRequestLocale: () => Promise.resolve("en"),
}))

import DashboardPage from "@/app/(app)/dashboard/page"

const VIEW: DashboardView = {
  hero: {
    month: "2026-03",
    spentSoFar: 100000,
    projected: 310000,
    income: 20000,
    difference: -80000,
    vsAveragePct: 12,
    trailingAverage: 312500,
    largestCharge: { merchant: "BIGSHOP", amount: 89000 },
  },
  modules: {
    hasEnoughHistory: true,
    completedMonths: 3,
    series: [
      { month: "2026-01", spending: 300000, income: 0, difference: -300000 },
      { month: "2026-02", spending: 350000, income: 0, difference: -350000 },
      { month: "2026-03", spending: 100000, income: 20000, difference: -80000 },
    ],
    categoryTrend: [
      {
        month: "2026-03",
        byExpenseType: { Fixed: 60000, Necessary: 0, "Nice to have": 40000, "": 0 },
        unclassified: 0,
      },
    ],
    categoryMostlyUnclassified: false,
    topMerchants: [{ merchant: "BONUS", spending: 100000, share: 1 }],
    movers: {
      merchants: [{ name: "BONUS", lastMonth: 400, baselineAverage: 100, delta: 300, deltaPct: 300 }],
      categories: [],
    },
    accounts: null,
  },
  actionBand: {
    reviewBacklog: 0,
    pendingCount: 0,
    failedCount: 0,
    freeCap: { plan: "Premium", unlimited: true, cap: 50, used: 0, remaining: Infinity, paused: false },
    reconnect: [],
    allClear: true,
  },
}

describe("DashboardPage", () => {
  beforeEach(() => {
    requireHousehold.mockReset()
    loadDashboardView.mockReset()
    loadSavingsProgress.mockReset()
    requireHousehold.mockResolvedValue({
      repo: {},
      plan: "Premium",
      billingCurrency: "ISK",
    })
    loadDashboardView.mockResolvedValue(VIEW)
    // No savings goal by default, so the progress card stays hidden.
    loadSavingsProgress.mockResolvedValue(null)
  })

  it("assembles the action band, hero, and the over-time modules in order", async () => {
    render(await DashboardPage())

    expect(screen.getByRole("heading", { level: 1, name: "Dashboard" })).toBeInTheDocument()
    // Action band: all-clear (nothing pending/failed, Premium).
    expect(screen.getByText(/all caught up/i)).toBeInTheDocument()
    // Hero.
    expect(screen.getByText(/Spending so far/i)).toBeInTheDocument()
    // Modules.
    expect(screen.getByText("Spending trend")).toBeInTheDocument()
    expect(screen.getByText("Where it goes")).toBeInTheDocument()
    expect(screen.getByText("Top merchants")).toBeInTheDocument()
    expect(screen.getByText("Biggest movers")).toBeInTheDocument()
    // Single-account household -> account breakdown hidden.
    expect(screen.queryByText("Spending by account")).not.toBeInTheDocument()
    // No savings goal -> progress card hidden.
    expect(screen.queryByRole("link", { name: /savings goal/i })).not.toBeInTheDocument()

    expect(loadDashboardView).toHaveBeenCalledWith(expect.anything(), expect.any(Date), {
      plan: "Premium",
    })
  })

  it("shows the savings progress card when a goal exists", async () => {
    loadSavingsProgress.mockResolvedValue({
      target: 1_200_000,
      saved: 500_000,
      percent: 42,
      currency: "ISK",
    })

    render(await DashboardPage())

    const card = screen.getByRole("link", { name: /savings goal/i })
    expect(card).toHaveAttribute("href", "/savings")
    expect(card).toHaveTextContent("ISK 500,000")
  })

  it("shows the account split and the review-backlog action for a multi-account household with work to do", async () => {
    loadDashboardView.mockResolvedValue({
      ...VIEW,
      modules: {
        ...VIEW.modules,
        accounts: [
          { accountId: "a1", name: "Visa", spending: 600, share: 0.6 },
          { accountId: "a2", name: "Mastercard", spending: 400, share: 0.4 },
        ],
      },
      actionBand: { ...VIEW.actionBand, reviewBacklog: 3, allClear: false },
    })

    render(await DashboardPage())

    expect(screen.getByText("Spending by account")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /3 expenses need review/i })).toBeInTheDocument()
    expect(screen.queryByText(/all caught up/i)).not.toBeInTheDocument()
  })
})
