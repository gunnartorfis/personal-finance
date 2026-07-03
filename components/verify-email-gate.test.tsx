import { screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { VerifyEmailGate } from "@/components/verify-email-gate"
import { renderWithIntl as render } from "@/lib/test/render"

vi.mock("@/lib/auth/client", () => ({
  authClient: { sendVerificationEmail: vi.fn(), signOut: vi.fn() },
}))

describe("VerifyEmailGate", () => {
  it("renders the verify prompt with the email and the primary actions", () => {
    render(<VerifyEmailGate email="you@x.is" />)
    expect(screen.getByRole("heading", { name: /verify your email/i })).toBeInTheDocument()
    expect(screen.getByText("you@x.is")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /verified my email/i })
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /resend verification email/i })
    ).toBeInTheDocument()
  })
})
