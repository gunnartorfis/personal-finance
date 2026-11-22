import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { expect, it, vi } from "vitest"

import { renderWithIntl } from "@/lib/test/render"

import { ReverificationProvider, useAppReverification } from "./reverification"

const { useSession, complete, cancel } = vi.hoisted(() => ({
  useSession: vi.fn(),
  complete: vi.fn(),
  cancel: vi.fn(),
}))

vi.mock("@clerk/nextjs", () => ({
  useSession,
  useReverification:
    (
      _action: unknown,
      {
        onNeedsReverification,
      }: { onNeedsReverification: (value: unknown) => void }
    ) =>
    () =>
      onNeedsReverification({ level: "first_factor", complete, cancel }),
}))

function ProtectedAction() {
  const act = useAppReverification(async () => undefined)
  return <button onClick={() => void act()}>Protected action</button>
}

it("only retries the protected action after the provider verifies the session", async () => {
  const startVerification = vi.fn().mockResolvedValue({
    status: "needs_first_factor",
    supportedFirstFactors: [
      { strategy: "email_code", emailAddressId: "primary" },
    ],
  })
  const prepareFirstFactorVerification = vi.fn().mockResolvedValue(undefined)
  const attemptFirstFactorVerification = vi
    .fn()
    .mockRejectedValueOnce(new Error())
    .mockResolvedValue({ status: "complete" })
  useSession.mockReturnValue({
    session: {
      id: "session",
      startVerification,
      prepareFirstFactorVerification,
      attemptFirstFactorVerification,
    },
  })
  renderWithIntl(
    <ReverificationProvider>
      <ProtectedAction />
    </ReverificationProvider>
  )
  const user = userEvent.setup()

  await user.click(screen.getByRole("button", { name: "Protected action" }))
  const prompt = within(
    screen.getByRole("dialog", { name: "Confirm it’s you" })
  )
  await user.click(prompt.getByRole("button", { name: "Continue" }))
  expect(startVerification).toHaveBeenCalledWith({ level: "first_factor" })
  expect(prepareFirstFactorVerification).toHaveBeenCalledWith({
    strategy: "email_code",
    emailAddressId: "primary",
  })

  await user.type(prompt.getByLabelText("Verification code"), "123456")
  await user.click(prompt.getByRole("button", { name: "Verify" }))
  expect(await prompt.findByRole("alert")).toHaveTextContent("Couldn’t verify")
  expect(complete).not.toHaveBeenCalled()

  await user.click(prompt.getByRole("button", { name: "Verify" }))
  expect(complete).toHaveBeenCalledOnce()
  expect(cancel).not.toHaveBeenCalled()
})
