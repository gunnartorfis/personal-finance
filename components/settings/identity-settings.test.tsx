import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { renderWithIntl } from "@/lib/test/render"

import { AccountProfileSettings } from "./account-profile-settings"
import { AccountSecuritySettings } from "./account-security-settings"

const { useUser, refresh } = vi.hoisted(() => ({
  useUser: vi.fn(),
  refresh: vi.fn(),
}))

vi.mock("@clerk/nextjs", () => ({
  useUser,
  useSession: () => ({ session: { id: "current" } }),
  useReverification: (action: unknown) => action,
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}))

describe("identity settings", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("verifies a new email before offering to make it primary", async () => {
    const address = {
      id: "new",
      emailAddress: "new@example.com",
      verification: { status: "unverified" },
      prepareVerification: vi.fn(),
      attemptVerification: vi.fn(async () => {
        address.verification.status = "verified"
        return address
      }),
    }
    const user = {
      id: "user",
      primaryEmailAddressId: "primary",
      emailAddresses: [
        {
          id: "primary",
          emailAddress: "current@example.com",
          verification: { status: "verified" },
        },
      ],
      createEmailAddress: vi.fn(async () => {
        user.emailAddresses.push(address)
        return address
      }),
      reload: vi.fn(),
      update: vi.fn(),
    }
    useUser.mockReturnValue({ isLoaded: true, user })
    const input = userEvent.setup()
    renderWithIntl(<AccountProfileSettings />)

    await input.type(
      screen.getByLabelText("New email address"),
      "new@example.com"
    )
    await input.click(screen.getByRole("button", { name: "Add email" }))
    expect(address.prepareVerification).toHaveBeenCalledWith({
      strategy: "email_code",
    })
    expect(screen.queryByRole("button", { name: "Make primary" })).toBeNull()
    expect(user.update).not.toHaveBeenCalled()

    await input.type(screen.getByLabelText("Verification code"), "123456")
    await input.click(screen.getByRole("button", { name: "Verify email" }))
    expect(address.attemptVerification).toHaveBeenCalledWith({ code: "123456" })
    expect(user.update).not.toHaveBeenCalled()

    await input.click(
      await screen.findByRole("button", { name: "Make primary" })
    )
    expect(user.update).toHaveBeenCalledWith({ primaryEmailAddressId: "new" })
  })

  it("revokes only the selected other session after confirmation", async () => {
    const current = {
      id: "current",
      status: "active",
      latestActivity: { browserName: "Safari" },
      lastActiveAt: new Date(),
      revoke: vi.fn(),
    }
    const other = {
      ...current,
      id: "other",
      latestActivity: { browserName: "Chrome" },
      revoke: vi.fn(),
    }
    useUser.mockReturnValue({
      isLoaded: true,
      user: {
        id: "user",
        getSessions: vi.fn().mockResolvedValue([current, other]),
      },
    })
    const input = userEvent.setup()
    renderWithIntl(<AccountSecuritySettings />)

    const currentRow = (await screen.findByText("Current session")).closest(
      "li"
    )!
    expect(within(currentRow).queryByRole("button")).toBeNull()
    await input.click(screen.getByRole("button", { name: "Sign out" }))
    expect(other.revoke).not.toHaveBeenCalled()
    await input.click(screen.getByRole("button", { name: "Confirm sign-out" }))

    expect(other.revoke).toHaveBeenCalledOnce()
    expect(current.revoke).not.toHaveBeenCalled()
    expect(screen.queryByText("Chrome")).toBeNull()
    expect(screen.getByText("Safari")).toBeInTheDocument()
  })

  it("uses the user's current password and clears the fields after saving", async () => {
    const updatePassword = vi.fn()
    useUser.mockReturnValue({
      isLoaded: true,
      user: {
        id: "user",
        passwordEnabled: true,
        updatePassword,
        getSessions: vi.fn().mockResolvedValue([]),
      },
    })
    const input = userEvent.setup()
    renderWithIntl(<AccountSecuritySettings />)

    const current = screen.getByLabelText("Current password")
    const next = screen.getByLabelText("New password")
    await input.type(current, "old password")
    await input.type(next, "new password")
    await input.click(screen.getByRole("button", { name: "Change password" }))

    expect(updatePassword).toHaveBeenCalledWith({
      currentPassword: "old password",
      newPassword: "new password",
    })
    expect(current).toHaveValue("")
    expect(next).toHaveValue("")
  })
})
