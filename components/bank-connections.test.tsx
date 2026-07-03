import { screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { BankConnections } from "@/components/bank-connections"
import { renderWithIntl as render } from "@/lib/test/render"
import type { ConnectionView } from "@/lib/open-banking/connections-view"

const view = (o: Partial<ConnectionView> = {}): ConnectionView => ({
  id: "c1",
  institutionName: "Landsbankinn",
  status: "active",
  isDisconnected: false,
  accounts: [{ id: "a1", name: "Debit" }],
  ...o,
})

describe("BankConnections", () => {
  it("renders nothing when there are no connections", () => {
    const { container } = render(<BankConnections connections={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("lists a connection with its accounts and a disconnect action", () => {
    render(<BankConnections connections={[view()]} />)
    expect(screen.getByText("Landsbankinn")).toBeInTheDocument()
    expect(screen.getByText("Connected")).toBeInTheDocument()
    expect(screen.getByText("Debit")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /^disconnect landsbankinn/i })
    ).toBeInTheDocument()
  })

  it("marks a disconnected connection and offers no action", () => {
    render(
      <BankConnections
        connections={[
          view({
            status: "revoked",
            isDisconnected: true,
            institutionName: "Arion",
          }),
        ]}
      />
    )
    expect(screen.getByText("Disconnected")).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /disconnect arion/i })
    ).not.toBeInTheDocument()
  })
})
