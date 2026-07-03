import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { AcceptInvite } from "@/components/accept-invite"
import { renderWithIntl as render } from "@/lib/test/render"

describe("AcceptInvite", () => {
  it("offers accept + decline for a plain join", () => {
    render(<AcceptInvite inviteId="i1" />)
    expect(
      screen.getByRole("button", { name: /accept invitation/i })
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /decline/i })).toBeInTheDocument()
  })

  it("uses the destructive label when accepting deletes the current household", () => {
    render(<AcceptInvite inviteId="i1" consequence="delete" />)
    expect(
      screen.getByRole("button", { name: /delete household & join/i })
    ).toBeInTheDocument()
  })

  it("uses the leave label when other members remain", () => {
    render(<AcceptInvite inviteId="i1" consequence="leave" />)
    expect(screen.getByRole("button", { name: /leave & join/i })).toBeInTheDocument()
  })
})
