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
    topCategories: [
      { kind: "category", labelKey: "groceries", label: null, amount: 104_200, share: 0.38 },
      { kind: "category", labelKey: null, label: "Sundlaug", amount: 40_300, share: 0.15 },
      { kind: "other", count: 6, amount: 27_650, share: 0.1 },
      { kind: "uncategorized", amount: 12_000, share: 0.04 },
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

  it("declares a utf-8 charset so Icelandic characters survive older clients", () => {
    const { html } = renderMonthlyDigestEmail({ model: model(), locale: "is", ...urls })
    // Attribute names are case-insensitive in HTML; React emits `charSet`, clients read it as charset.
    expect(html.toLowerCase()).toContain('charset="utf-8"')
  })

  it("lays out rows in tables, not flexbox (Outlook renders with the Word engine)", () => {
    const { html } = renderMonthlyDigestEmail({ model: model(), locale: "en", ...urls })
    expect(html).toContain("<table")
    expect(html).not.toContain("flex")
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

  it("renders the top-categories section: localized seed label, custom literal, Other + Uncategorized", () => {
    const { html } = renderMonthlyDigestEmail({ model: model(), locale: "en", ...urls })
    expect(html).toContain("Top categories")
    expect(html).toContain("Groceries") // seed row localized via the categories catalog
    expect(html).toContain("Sundlaug") // custom row shows its literal label
    expect(html).toContain("Other (6)")
    expect(html).toContain("Uncategorized")
  })

  it("localizes the top-categories copy in Icelandic", () => {
    const { html } = renderMonthlyDigestEmail({ model: model(), locale: "is", ...urls })
    expect(html).toContain("Efstu flokkar")
    expect(html).toContain("Óflokkað")
    expect(html).toContain("Annað (6)")
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
