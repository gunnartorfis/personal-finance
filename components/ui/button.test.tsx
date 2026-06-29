import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { Button } from "@/components/ui/button"

describe("Button", () => {
  it("renders its children", () => {
    render(<Button>Click me</Button>)
    expect(
      screen.getByRole("button", { name: "Click me" })
    ).toBeInTheDocument()
  })

  it("applies variant classes", () => {
    render(<Button variant="destructive">Delete</Button>)
    expect(screen.getByRole("button", { name: "Delete" })).toHaveClass(
      "text-destructive"
    )
  })

  it("calls onClick when pressed", async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Press</Button>)

    await user.click(screen.getByRole("button", { name: "Press" }))

    expect(onClick).toHaveBeenCalledOnce()
  })

  it("is disabled when the disabled prop is set", () => {
    render(<Button disabled>Nope</Button>)
    expect(screen.getByRole("button", { name: "Nope" })).toBeDisabled()
  })
})
