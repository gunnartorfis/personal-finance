import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { FreeCapStatusBanner } from "@/components/free-cap-status"
import type { FreeCapStatus } from "@/lib/billing/free-cap-status"

const status = (overrides: Partial<FreeCapStatus> = {}): FreeCapStatus => ({
  plan: "Free",
  unlimited: false,
  cap: 50,
  used: 12,
  remaining: 38,
  paused: false,
  ...overrides,
})

describe("FreeCapStatusBanner", () => {
  it("shows remaining runway for a Free household below the cap", () => {
    render(<FreeCapStatusBanner status={status()} />)
    expect(screen.getByText(/12 of 50 free AI classifications used/i)).toBeInTheDocument()
    expect(screen.getByText(/38 left/i)).toBeInTheDocument()
  })

  it("shows a paused alert at the cap", () => {
    render(<FreeCapStatusBanner status={status({ used: 50, remaining: 0, paused: true })} />)
    expect(screen.getByRole("alert")).toHaveTextContent(/AI classification paused/i)
    expect(screen.getByText(/upgrade to Premium/i)).toBeInTheDocument()
  })

  it("renders nothing for Premium", () => {
    const { container } = render(
      <FreeCapStatusBanner status={status({ plan: "Premium", unlimited: true, remaining: Infinity })} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
