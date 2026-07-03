import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { ConnectionAlerts } from "@/components/connection-alerts"
import { renderWithIntl as render } from "@/lib/test/render"
import type { ReconnectPrompt } from "@/lib/open-banking/reconnect"

describe("ConnectionAlerts", () => {
  it("renders nothing when no connection needs attention", () => {
    const { container } = render(<ConnectionAlerts prompts={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("shows a reason message and a Reconnect action per connection", () => {
    const prompts: ReconnectPrompt[] = [
      { id: "a", institutionName: "Landsbankinn", reason: "expired" },
      { id: "b", institutionName: "Arion", reason: "error" },
    ]
    render(<ConnectionAlerts prompts={prompts} />)

    expect(
      screen.getByText(/consent for Landsbankinn has expired/i)
    ).toBeInTheDocument()
    expect(screen.getByText(/sync failed for Arion/i)).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /reconnect landsbankinn/i })
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /reconnect arion/i })
    ).toBeInTheDocument()
  })
})
