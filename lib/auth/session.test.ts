import { beforeEach, describe, expect, it, vi } from "vitest"

const { currentUser } = vi.hoisted(() => ({ currentUser: vi.fn() }))
vi.mock("@clerk/nextjs/server", () => ({ currentUser }))
import { getCurrentUser } from "./session"

const identity = {
  id: "user_synthetic", primaryEmailAddressId: "primary",
  emailAddresses: [
    { id: "other", emailAddress: "other@example.invalid", verification: { status: "verified" } },
    { id: "primary", emailAddress: "member@example.invalid", verification: { status: "verified" } },
  ],
}

beforeEach(() => { currentUser.mockReset(); currentUser.mockResolvedValue(identity) })

describe("Clerk identity boundary", () => {
  it("uses only the backend primary email for household invitations", async () => {
    expect(await getCurrentUser()).toEqual({
      id: "user_synthetic", email: "member@example.invalid", emailVerified: true,
    })
  })
  it("reads the authoritative backend user for fresh verification callers", async () => {
    await getCurrentUser({ fresh: true })
    expect(currentUser).toHaveBeenCalledOnce()
  })
  it("does not treat a verified secondary email as verification of the primary", async () => {
    currentUser.mockResolvedValue({ ...identity, emailAddresses: [
      identity.emailAddresses[0], { ...identity.emailAddresses[1], verification: { status: "unverified" } },
    ] })
    expect((await getCurrentUser())?.emailVerified).toBe(false)
  })
  it("fails closed for signed-out users and missing primary email", async () => {
    currentUser.mockResolvedValue(null)
    expect(await getCurrentUser()).toBeNull()
    currentUser.mockResolvedValue({ ...identity, primaryEmailAddressId: "missing" })
    expect(await getCurrentUser()).toBeNull()
  })
})
