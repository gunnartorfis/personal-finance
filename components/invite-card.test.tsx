import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { InviteCard } from "@/components/invite-card"
import { renderWithIntl as render } from "@/lib/test/render"

describe("InviteCard", () => {
  it("frames the invite by the inviter with member count and expiry", () => {
    render(
      <InviteCard
        invitedEmail="you@x.is"
        inviterName="Alex Jónsson"
        inviterEmail="a@x.is"
        memberCount={2}
        expiresAt={new Date(Date.now() + 90 * 3_600_000)}
        locator={{ inviteId: "i1" }}
      />
    )
    expect(screen.getByRole("heading", { name: /Alex invited you/i })).toBeInTheDocument()
    expect(screen.getByText("2 members")).toBeInTheDocument()
    expect(screen.getByText(/Expires in \d+ days/)).toBeInTheDocument()
  })

  it("warns when accepting would delete the invitee's current household", () => {
    render(
      <InviteCard
        invitedEmail="you@x.is"
        inviterName={null}
        inviterEmail="a@x.is"
        memberCount={1}
        expiresAt={new Date(Date.now() + 90 * 3_600_000)}
        locator={{ inviteId: "i1" }}
        consequence="delete"
      />
    )
    expect(screen.getByRole("alert")).toHaveTextContent(/permanently deletes/i)
    // Single member → singular copy.
    expect(screen.getByText("1 member")).toBeInTheDocument()
  })
})
