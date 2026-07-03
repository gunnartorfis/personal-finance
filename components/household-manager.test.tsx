import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { HouseholdManager } from "@/components/household-manager"
import { renderWithIntl as render } from "@/lib/test/render"

const members = [{ id: "m1", authUserId: "u1", name: "Alex", email: "a@x.is" }]

describe("HouseholdManager", () => {
  it("renders members, the invite form (Premium), and the danger zone", () => {
    render(
      <HouseholdManager
        plan="Premium"
        cap={10}
        currentUserId="u1"
        initialMembers={members}
        initialInvites={[]}
      />
    )
    expect(screen.getByRole("heading", { name: /members/i })).toBeInTheDocument()
    expect(screen.getByText("Alex")).toBeInTheDocument()
    expect(screen.getByText("You")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /create invite/i })).toBeInTheDocument()
    // Sole member → only the Delete Household affordance in the danger zone.
    expect(screen.getByRole("button", { name: /delete household/i })).toBeInTheDocument()
  })

  it("offers Leave (not just Delete) when other members remain", () => {
    render(
      <HouseholdManager
        plan="Premium"
        cap={10}
        currentUserId="u1"
        initialMembers={[
          ...members,
          { id: "m2", authUserId: "u2", name: "Sam", email: "s@x.is" },
        ]}
        initialInvites={[]}
      />
    )
    expect(screen.getByRole("button", { name: /leave household/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /delete household/i })).toBeInTheDocument()
  })

  it("shows the Premium upsell instead of the invite form on Free", () => {
    render(
      <HouseholdManager
        plan="Free"
        cap={10}
        currentUserId="u1"
        initialMembers={members}
        initialInvites={[]}
      />
    )
    expect(screen.getByText(/Premium feature/i)).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /create invite/i })
    ).not.toBeInTheDocument()
  })
})
