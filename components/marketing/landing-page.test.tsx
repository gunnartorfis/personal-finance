import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { LandingPage } from "@/components/marketing/landing-page"
import { renderWithIntl as render } from "@/lib/test/render"

describe("LandingPage", () => {
  it("renders the hero pitch", () => {
    render(<LandingPage />)
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /see where the money actually goes/i,
      })
    ).toBeInTheDocument()
  })

  it("points every conversion CTA at the sign-up route", () => {
    render(<LandingPage />)
    const ctas = screen.getAllByRole("link", {
      name: /start for free|get started|go premium/i,
    })
    expect(ctas.length).toBeGreaterThan(0)
    for (const cta of ctas) {
      expect(cta).toHaveAttribute("href", "/auth/sign-up")
    }
  })

  it("points every sign-in action at the sign-in route", () => {
    render(<LandingPage />)
    const signIns = screen.getAllByRole("link", { name: /^sign in$/i })
    expect(signIns.length).toBeGreaterThan(0)
    for (const link of signIns) {
      expect(link).toHaveAttribute("href", "/auth/sign-in")
    }
  })

  it("presents both pricing tiers with Premium recommended", () => {
    render(<LandingPage />)
    expect(screen.getByRole("heading", { name: "Free" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Premium" })).toBeInTheDocument()
    expect(screen.getByText("Recommended")).toBeInTheDocument()
  })

  it("groups the product features across the full surface", () => {
    render(<LandingPage />)
    // Group headings.
    expect(
      screen.getByRole("heading", { name: "See where the money actually goes" })
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Built for your household, owned by you",
      })
    ).toBeInTheDocument()
    // A representative feature from each theme, including recently shipped ones.
    expect(screen.getByText("AI classification")).toBeInTheDocument()
    expect(screen.getByText("Automatic categories")).toBeInTheDocument()
    expect(screen.getByText("Recurring & subscriptions")).toBeInTheDocument()
    expect(screen.getByText("Category budgets")).toBeInTheDocument()
    expect(screen.getByText("Balance checks")).toBeInTheDocument()
    expect(screen.getByText("Your data, always yours")).toBeInTheDocument()
  })

  it("surfaces the semantic Category axis (ADR-0020) in the pitch and the preview", () => {
    render(<LandingPage />)
    // The pitch mentions sorting by category, not just type (hero + feature copy).
    expect(screen.getAllByText(/by category/i).length).toBeGreaterThan(0)
    // The product-preview card shows a Spending-by-category breakdown beside Spending by type.
    expect(screen.getByText("Spending by category")).toBeInTheDocument()
    expect(screen.getByText("Groceries")).toBeInTheDocument()
  })
})
