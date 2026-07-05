import { render, screen } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { DashboardView } from "@/lib/dashboard/dashboard-view"
import en from "@/messages/en.json"

// Mock the tenant guard (keeps Neon Auth / next/headers out of jsdom) and the data loader, so the
// page test exercises pure assembly of the already-tested modules.
const {
  requireHousehold,
  loadDashboardView,
  loadSavingsProgress,
  loadNetWorthPanel,
  loadBalanceChecks,
} = vi.hoisted(() => ({
  requireHousehold: vi.fn(),
  loadDashboardView: vi.fn(),
  loadSavingsProgress: vi.fn(),
  loadNetWorthPanel: vi.fn(),
  loadBalanceChecks: vi.fn(),
}))
vi.mock("@/lib/household/current", () => ({ requireHousehold }))
// RECENT_MONTHS is a plain re-exported constant the page reads for the category chart's period label.
vi.mock("@/lib/dashboard/dashboard-view", () => ({ loadDashboardView, RECENT_MONTHS: 3 }))
vi.mock("@/lib/dashboard/balance-check", () => ({ loadBalanceChecks }))
vi.mock("@/lib/savings/assessment", () => ({ loadSavingsProgress }))
vi.mock("@/lib/dashboard/net-worth", async (importOriginal) => ({
  // Keep computeRunwayMonths et al. real (the section imports them); only stub the loader.
  ...(await importOriginal<typeof import("@/lib/dashboard/net-worth")>()),
  loadNetWorthPanel,
}))
// resolveRequestLocale reads cookies() (request scope, unavailable in jsdom); pin
// it to en so the currency assertions below stay en-US.
vi.mock("@/lib/i18n/locale", () => ({
  resolveRequestLocale: () => Promise.resolve("en"),
}))
// The Recharts-backed spending-trend chart calls useRouter at render for bar-click navigation.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
// getTranslations reads the request config (unavailable in jsdom); back it with
// the en catalog so the page's strings render in English. Interpolates {values}
// so the mock stays faithful once the page uses interpolated keys.
vi.mock("next-intl/server", () => ({
  getTranslations: async (ns: keyof typeof en) =>
    (key: string, values?: Record<string, string | number>) => {
      const template = (en[ns] as Record<string, string>)[key] ?? `${ns}.${key}`
      return values
        ? template.replace(/\{(\w+)\}/g, (_, name) =>
            name in values ? String(values[name]) : `{${name}}`
          )
        : template
    },
}))

// The page tree includes Client-Component descendants that call useTranslations
// (e.g. ThisMonthHero); provide the catalog so they render under the same locale.
async function renderPage(cycle?: string) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      {await DashboardPage({ searchParams: Promise.resolve(cycle ? { cycle } : {}) })}
    </NextIntlClientProvider>
  )
}

import DashboardPage from "@/app/(app)/dashboard/page"

const VIEW: DashboardView = {
  hero: {
    month: "2026-03",
    isCurrent: true,
    spentSoFar: 100000,
    cardSpend: 100000,
    offCardFixed: 0,
    spendByType: {
      income: 0,
      expense: -100000,
      net: -100000,
      byExpenseType: { Fixed: -60000, Necessary: 0, "Nice to have": -40000, "": 0 },
      unclassified: 0,
    },
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
    categoryBreakdown: { expense: -100000, byCategory: { groceries: -100000 }, uncategorized: 0 },
    categories: [{ id: "groceries", labelKey: "groceries", label: null }],
    topMerchants: [{ merchant: "BONUS", spending: 100000, share: 1 }],
    movers: {
      merchants: [{ name: "BONUS", lastMonth: 400, baselineAverage: 100, delta: 300, deltaPct: 300 }],
      categories: [],
    },
    recurring: { subscriptions: [], committedMonthlyTotal: 0 },
    budgetStatus: { envelopes: [], totalBudget: 0, totalSpent: 0, totalRemaining: 0 },
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
  financialHealth: {
    completedCycles: 3,
    hasEnoughHistory: true,
    avgMonthlySaving: 50000,
    avgMonthlyIncome: 250000,
    savingsRate: 0.2,
    monthlyBurn: 200000,
    profitableCount: 3,
    streakConsidered: 3,
  },
}

describe("DashboardPage", () => {
  beforeEach(() => {
    requireHousehold.mockReset()
    loadDashboardView.mockReset()
    loadSavingsProgress.mockReset()
    loadNetWorthPanel.mockReset()
    loadBalanceChecks.mockReset()
    requireHousehold.mockResolvedValue({
      repo: {},
      plan: "Premium",
      billingCurrency: "ISK",
    })
    loadDashboardView.mockResolvedValue(VIEW)
    // No savings goal by default, so the progress card stays hidden.
    loadSavingsProgress.mockResolvedValue(null)
    // No accounts by default, so the net-worth block stays hidden.
    loadNetWorthPanel.mockResolvedValue({ netWorth: null, accounts: [] })
    // No balance drifts by default, so the balance-check card stays hidden.
    loadBalanceChecks.mockResolvedValue([])
  })

  it("assembles the action band, hero, and the over-time modules in order", async () => {
    await renderPage()

    expect(screen.getByRole("heading", { level: 1, name: "Dashboard" })).toBeInTheDocument()
    // Action band: all-clear (nothing pending/failed, Premium).
    expect(screen.getByText(/all caught up/i)).toBeInTheDocument()
    // Hero.
    expect(screen.getByText(/Spending so far/i)).toBeInTheDocument()
    // Financial health section.
    expect(screen.getByText("Financial health")).toBeInTheDocument()
    expect(screen.getByText("20%")).toBeInTheDocument()
    // Modules.
    expect(screen.getByText("Spending trend")).toBeInTheDocument()
    expect(screen.getByText("Where it goes")).toBeInTheDocument()
    expect(screen.getByText("Top merchants")).toBeInTheDocument()
    expect(screen.getByText("Biggest movers")).toBeInTheDocument()
    // Single-account household -> account breakdown hidden.
    expect(screen.queryByText("Spending by account")).not.toBeInTheDocument()
    // No savings goal -> progress card hidden.
    expect(screen.queryByRole("link", { name: /savings goal/i })).not.toBeInTheDocument()

    expect(loadDashboardView).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Date),
      expect.objectContaining({ plan: "Premium", count: 12, selectedKey: expect.any(String) }),
    )
  })

  it("shows the savings progress card when a goal exists", async () => {
    loadSavingsProgress.mockResolvedValue({
      title: null,
      target: 1_200_000,
      saved: 500_000,
      percent: 42,
      currency: "ISK",
    })

    await renderPage()

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

    await renderPage()

    expect(screen.getByText("Spending by account")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /3 expenses need review/i })).toBeInTheDocument()
    expect(screen.queryByText(/all caught up/i)).not.toBeInTheDocument()
  })
})
