import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { renderWithIntl } from "@/lib/test/render"

import { ActivityLogView } from "./activity-log-view"

type Entry = Parameters<typeof ActivityLogView>[0]["entries"][number]

function entry(overrides: Partial<Entry>): Entry {
  return {
    id: "e1",
    householdId: "h1",
    memberId: "m1",
    actorName: "Ada",
    action: "transaction.excluded",
    payload: {},
    createdAt: new Date("2026-03-15T10:30:00Z"),
    ...overrides,
  } as Entry
}

describe("ActivityLogView", () => {
  it("shows the empty state when there are no entries", () => {
    renderWithIntl(<ActivityLogView entries={[]} />)
    expect(screen.getByText("No activity yet.")).toBeInTheDocument()
  })

  it("renders the actor, a human action label, and the payload subject", () => {
    renderWithIntl(
      <ActivityLogView
        entries={[entry({ payload: { transactionId: "t1", merchant: "Netto" } })]}
      />,
    )
    expect(screen.getByText("Ada")).toBeInTheDocument()
    expect(screen.getByText("excluded a transaction")).toBeInTheDocument()
    expect(screen.getByText("Netto")).toBeInTheDocument()
  })

  it("localizes the action label in Icelandic", () => {
    renderWithIntl(<ActivityLogView entries={[entry({ action: "member.left" })]} />, {
      locale: "is",
    })
    expect(screen.getByText("yfirgaf heimilið")).toBeInTheDocument()
  })

  it("falls back to a generic label for an unknown action", () => {
    renderWithIntl(<ActivityLogView entries={[entry({ action: "something.brand.new" })]} />)
    expect(screen.getByText("made a change")).toBeInTheDocument()
  })

  it("renders a machine-readable timestamp for each entry", () => {
    const { container } = renderWithIntl(
      <ActivityLogView entries={[entry({ createdAt: new Date("2026-03-15T10:30:00Z") })]} />,
    )
    const time = container.querySelector("time")
    expect(time).toHaveAttribute("dateTime", "2026-03-15T10:30:00.000Z")
  })

  it("picks the invitee email as the subject when there is no merchant", () => {
    renderWithIntl(
      <ActivityLogView
        entries={[entry({ action: "invite.created", payload: { email: "spouse@x.is" } })]}
      />,
    )
    expect(screen.getByText("spouse@x.is")).toBeInTheDocument()
  })
})
