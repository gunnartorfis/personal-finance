import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import Page from "@/app/page"

describe("Home page", () => {
  it("renders the heading", () => {
    render(<Page />)
    expect(
      screen.getByRole("heading", { level: 1, name: "Project ready!" })
    ).toBeInTheDocument()
  })
})
