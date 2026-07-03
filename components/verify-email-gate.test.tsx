import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { VerifyEmailGate } from "@/components/verify-email-gate"
import { authClient } from "@/lib/auth/client"
import { renderWithIntl as render } from "@/lib/test/render"

vi.mock("@/lib/auth/client", () => ({
  authClient: { sendVerificationEmail: vi.fn(), signOut: vi.fn() },
}))

const sendVerificationEmail = vi.mocked(authClient.sendVerificationEmail)

beforeEach(() => sendVerificationEmail.mockReset())

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

  it("resends the verification email and reflects the sent state", async () => {
    sendVerificationEmail.mockResolvedValue({ error: null } as never)
    render(<VerifyEmailGate email="you@x.is" />)

    await userEvent.click(
      screen.getByRole("button", { name: /resend verification email/i })
    )

    expect(sendVerificationEmail).toHaveBeenCalledWith({
      email: "you@x.is",
      callbackURL: "/join",
    })
    expect(await screen.findByRole("button", { name: /check your inbox/i })).toBeInTheDocument()
  })
})
