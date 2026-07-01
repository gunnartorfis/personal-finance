import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { LandingPage } from "@/components/marketing/landing-page"

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

  it("lists the core product features", () => {
    render(<LandingPage />)
    expect(screen.getByText("AI classification")).toBeInTheDocument()
    expect(screen.getByText("Real net profit")).toBeInTheDocument()
    expect(screen.getByText("Statement cycles")).toBeInTheDocument()
  })
})
