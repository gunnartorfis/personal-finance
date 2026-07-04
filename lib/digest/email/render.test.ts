import { describe, expect, it } from "vitest"

import type { MonthlyDigestModel } from "../build-monthly"
import { renderMonthlyDigestEmail } from "./render"

function model(overrides: Partial<MonthlyDigestModel> = {}): MonthlyDigestModel {
  return {
    cycleKey: "2026-03",
    currency: "ISK",
    hasActivity: true,
    spending: 200_000,
    income: 500_000,
    difference: 300_000,
    spendingDelta: { abs: 40_000, pct: 0.25 },
    expenseSplit: [
      { type: "Fixed", amount: 120_000 },
      { type: "Necessary", amount: 50_000 },
      { type: "Nice to have", amount: 30_000 },
    ],
    topMovers: [{ name: "Bónus", amount: 90_000, delta: 50_000 }],
    savings: { onTrack: true, allowedNiceToHave: 45_000 },
    ...overrides,
  }
}

const urls = {
  unsubscribeUrl: "https://auratal.is/digest/unsubscribe?token=abc",
  dashboardUrl: "https://auratal.is/dashboard",
}

describe("renderMonthlyDigestEmail", () => {
  it("produces an HTML document", () => {
    const { html } = renderMonthlyDigestEmail({ model: model(), locale: "en", ...urls })
    expect(html).toMatch(/^<!DOCTYPE html>/i)
    expect(html).toContain("<html")
  })

  it("sets the document lang to the locale's BCP-47 tag", () => {
    expect(renderMonthlyDigestEmail({ model: model(), locale: "is", ...urls }).html).toContain('lang="is-IS"')
    expect(renderMonthlyDigestEmail({ model: model(), locale: "en", ...urls }).html).toContain('lang="en-US"')
  })

  it("localizes the subject with the cycle month (en)", () => {
    const { subject } = renderMonthlyDigestEmail({ model: model(), locale: "en", ...urls })
    expect(subject).toContain("March 2026")
  })

  it("localizes the subject with the cycle month (is)", () => {
    const { subject } = renderMonthlyDigestEmail({ model: model(), locale: "is", ...urls })
    expect(subject).toContain("mars 2026")
  })

  it("renders differently per locale", () => {
    const en = renderMonthlyDigestEmail({ model: model(), locale: "en", ...urls })
    const is = renderMonthlyDigestEmail({ model: model(), locale: "is", ...urls })
    expect(en.subject).not.toBe(is.subject)
    expect(en.html).not.toBe(is.html)
  })

  it("includes the dashboard CTA link and the unsubscribe link", () => {
    const { html } = renderMonthlyDigestEmail({ model: model(), locale: "en", ...urls })
    expect(html).toContain(urls.dashboardUrl)
    expect(html).toContain(urls.unsubscribeUrl)
  })

  it("shows each highlighted mover", () => {
    const { html } = renderMonthlyDigestEmail({ model: model(), locale: "en", ...urls })
    expect(html).toContain("Bónus")
  })

  it("shows the savings block when a goal exists", () => {
    const { html } = renderMonthlyDigestEmail({ model: model(), locale: "en", ...urls })
    expect(html.toLowerCase()).toContain("nice-to-have")
  })

  it("omits the savings block when there is no goal", () => {
    const { html } = renderMonthlyDigestEmail({ model: model({ savings: null }), locale: "en", ...urls })
    expect(html.toLowerCase()).not.toContain("nice-to-have")
  })

  it("formats the spending amount following the locale (is groups with a dot)", () => {
    const { html } = renderMonthlyDigestEmail({ model: model(), locale: "is", ...urls })
    expect(html).toContain("200.000")
  })
})
