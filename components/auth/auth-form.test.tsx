import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { authReturnPath } from "@/lib/auth/return-path"
import { renderWithIntl } from "@/lib/test/render"

import { AuthForm } from "./auth-form"

const { useSignIn, useSignUp } = vi.hoisted(() => ({
  useSignIn: vi.fn(),
  useSignUp: vi.fn(),
}))

vi.mock("@clerk/nextjs", () => ({
  useClerk: () => ({ loaded: true }),
  useSignIn,
  useSignUp,
}))

const ok = { error: null }

beforeEach(() => {
  useSignIn.mockReturnValue({ signIn: {} })
  useSignUp.mockReturnValue({ signUp: {} })
})

describe("AuthForm", () => {
  it("signs in with a verified email code", async () => {
    const signIn = {
      status: "needs_first_factor",
      finalize: vi.fn().mockResolvedValue(ok),
      emailCode: {
        sendCode: vi.fn().mockResolvedValue(ok),
        verifyCode: vi.fn(async () => {
          signIn.status = "complete"
          return ok
        }),
      },
    }
    useSignIn.mockReturnValue({ signIn })
    renderWithIntl(<AuthForm returnTo="/dashboard" />)
    const user = userEvent.setup()

    await user.type(
      screen.getByLabelText("Email address"),
      "member@example.com"
    )
    await user.click(screen.getByRole("button", { name: "Use an email code" }))
    await user.click(screen.getByRole("button", { name: "Send code" }))
    expect(signIn.emailCode.sendCode).toHaveBeenCalledWith({
      emailAddress: "member@example.com",
    })
    expect(signIn.finalize).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText("Verification code"), "123456")
    await user.click(screen.getByRole("button", { name: "Verify" }))
    expect(signIn.emailCode.verifyCode).toHaveBeenCalledWith({ code: "123456" })
    expect(signIn.finalize).toHaveBeenCalledOnce()
  })

  it("verifies a sign-up email before activating the session", async () => {
    const signUp = {
      status: "missing_requirements",
      unverifiedFields: ["email_address"],
      missingFields: [],
      password: vi.fn().mockResolvedValue(ok),
      finalize: vi.fn().mockResolvedValue(ok),
      verifications: {
        sendEmailCode: vi.fn().mockResolvedValue(ok),
        verifyEmailCode: vi.fn(async () => {
          signUp.status = "complete"
          return ok
        }),
      },
    }
    useSignUp.mockReturnValue({ signUp })
    renderWithIntl(<AuthForm signUpPage returnTo="/dashboard" />)
    const user = userEvent.setup()
    await user.type(
      screen.getByLabelText("Email address"),
      "member@example.com"
    )
    await user.type(screen.getByLabelText("Password"), "private password")
    await user.click(screen.getByRole("button", { name: "Create an account" }))
    expect(signUp.verifications.sendEmailCode).toHaveBeenCalledOnce()
    expect(signUp.finalize).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText("Verification code"), "123456")
    await user.click(screen.getByRole("button", { name: "Verify" }))
    expect(signUp.verifications.verifyEmailCode).toHaveBeenCalledWith({
      code: "123456",
    })
    expect(signUp.finalize).toHaveBeenCalledOnce()
  })

  it("requires device verification before finalizing a password sign-in", async () => {
    const signIn = {
      status: "needs_client_trust",
      supportedSecondFactors: [{ strategy: "email_code" }],
      password: vi.fn().mockResolvedValue(ok),
      finalize: vi.fn().mockResolvedValue(ok),
      mfa: {
        sendEmailCode: vi.fn().mockResolvedValue(ok),
        verifyEmailCode: vi.fn(async () => {
          signIn.status = "complete"
          return ok
        }),
      },
    }
    useSignIn.mockReturnValue({ signIn })
    renderWithIntl(<AuthForm returnTo="/dashboard" />)
    const user = userEvent.setup()

    await user.type(
      screen.getByLabelText("Email address"),
      "member@example.com"
    )
    await user.type(screen.getByLabelText("Password"), "private password")
    await user.click(screen.getByRole("button", { name: "Sign in" }))
    expect(signIn.mfa.sendEmailCode).toHaveBeenCalledOnce()
    expect(signIn.finalize).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText("Verification code"), "123456")
    await user.click(screen.getByRole("button", { name: "Verify" }))
    expect(signIn.mfa.verifyEmailCode).toHaveBeenCalledWith({ code: "123456" })
    expect(signIn.finalize).toHaveBeenCalledOnce()
  })

  it("requires a verified reset code before accepting a new password", async () => {
    const signIn = {
      status: "needs_first_factor",
      create: vi.fn().mockResolvedValue(ok),
      finalize: vi.fn().mockResolvedValue(ok),
      resetPasswordEmailCode: {
        sendCode: vi.fn().mockResolvedValue(ok),
        verifyCode: vi.fn(async () => {
          signIn.status = "needs_new_password"
          return ok
        }),
        submitPassword: vi.fn(async () => {
          signIn.status = "complete"
          return ok
        }),
      },
    }
    useSignIn.mockReturnValue({ signIn })
    renderWithIntl(<AuthForm returnTo="/dashboard" />)
    const user = userEvent.setup()

    await user.click(
      screen.getByRole("button", { name: "Forgot your password?" })
    )
    await user.type(
      screen.getByLabelText("Email address"),
      "member@example.com"
    )
    await user.click(screen.getByRole("button", { name: "Send code" }))
    expect(signIn.create).toHaveBeenCalledWith({
      identifier: "member@example.com",
    })
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument()

    await user.type(screen.getByLabelText("Verification code"), "123456")
    await user.click(screen.getByRole("button", { name: "Verify" }))
    await user.type(screen.getByLabelText("New password"), "different password")
    await user.click(screen.getByRole("button", { name: "Reset password" }))
    expect(signIn.resetPasswordEmailCode.submitPassword).toHaveBeenCalledWith({
      password: "different password",
      signOutOfOtherSessions: true,
    })
    expect(signIn.finalize).toHaveBeenCalledOnce()
  })
})

describe("authReturnPath", () => {
  it.each([
    "//example.test",
    "/\\example.test",
    "https://example.test",
    "/a/..//example.test",
    ["//example.test"],
  ])("rejects non-local destination %j", (target) =>
    expect(authReturnPath(target)).toBe("/dashboard")
  )

  it("preserves a local route, query, and fragment", () => {
    expect(authReturnPath("/join?source=email#invitation")).toBe(
      "/join?source=email#invitation"
    )
  })
})
