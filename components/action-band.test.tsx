import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { ActionBand } from "@/components/action-band"
import type { FreeCapStatus } from "@/lib/billing/free-cap-status"
import type { DashboardActionBand } from "@/lib/dashboard/dashboard-view"

const PREMIUM: FreeCapStatus = {
  plan: "Premium",
  unlimited: true,
  cap: 50,
  used: 0,
  remaining: Infinity,
  paused: false,
}
const FREE_PAUSED: FreeCapStatus = {
  plan: "Free",
  unlimited: false,
  cap: 50,
  used: 50,
  remaining: 0,
  paused: true,
}

function band(overrides: Partial<DashboardActionBand> = {}): DashboardActionBand {
  return {
    reviewBacklog: 0,
    pendingCount: 0,
    failedCount: 0,
    freeCap: PREMIUM,
    reconnect: [],
    allClear: false,
    ...overrides,
  }
}

describe("ActionBand", () => {
  it("shows a review-backlog link to transactions when there is a backlog", () => {
    render(<ActionBand actionBand={band({ reviewBacklog: 5 })} />)
    const link = screen.getByRole("link", { name: /5 expenses need review/i })
    expect(link).toHaveAttribute("href", "/transactions")
  })

  it("uses singular copy for a single unreviewed expense", () => {
    render(<ActionBand actionBand={band({ reviewBacklog: 1 })} />)
    expect(screen.getByRole("link", { name: /1 expense needs review/i })).toBeInTheDocument()
  })

  it("surfaces pending transactions with a Classify pending affordance", () => {
    render(<ActionBand actionBand={band({ pendingCount: 95 })} />)
    expect(screen.getByText(/95 transactions awaiting classification/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /classify pending/i })).toBeInTheDocument()
  })

  it("uses singular copy for a single pending transaction", () => {
    render(<ActionBand actionBand={band({ pendingCount: 1 })} />)
    expect(screen.getByText(/1 transaction awaiting classification/i)).toBeInTheDocument()
  })

  it("hides the pending card while the Free cap is paused (banner carries the CTA)", () => {
    render(<ActionBand actionBand={band({ pendingCount: 95, freeCap: FREE_PAUSED })} />)
    expect(screen.getByText(/AI classification paused/i)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /classify pending/i })).not.toBeInTheDocument()
  })

  it("surfaces failed classifications with a retry-only affordance", () => {
    render(<ActionBand actionBand={band({ failedCount: 3 })} />)
    expect(screen.getByText(/3 classifications failed/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /retry 3 failed/i })).toBeInTheDocument()
    // The failed card is retry-focused — no general "Classify pending" button here.
    expect(screen.queryByRole("button", { name: /classify pending/i })).not.toBeInTheDocument()
  })

  it("shows the Free-cap paused alert (reusing FreeCapStatusBanner)", () => {
    render(<ActionBand actionBand={band({ freeCap: FREE_PAUSED })} />)
    expect(screen.getByText(/AI classification paused/i)).toBeInTheDocument()
  })

  it("surfaces a bank connection needing reconnect (reusing ConnectionAlerts)", () => {
    render(<ActionBand actionBand={band({ reconnect: [{ id: "c1", institutionName: "Landsbankinn", reason: "expired" }] })} />)
    expect(screen.getByText(/consent for Landsbankinn has expired/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /reconnect landsbankinn/i })).toBeInTheDocument()
  })

  it("shows an all-clear state and nothing else when nothing needs attention", () => {
    render(<ActionBand actionBand={band({ allClear: true, freeCap: PREMIUM })} />)
    expect(screen.getByText(/all caught up/i)).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /review/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/failed/i)).not.toBeInTheDocument()
  })
})
