import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { DigestPreferenceToggle } from "@/components/digest-preference-toggle"
import { renderWithIntl } from "@/lib/test/render"

const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }))

afterEach(() => {
  vi.unstubAllGlobals()
  refresh.mockReset()
})

describe("DigestPreferenceToggle", () => {
  it("reflects the current subscription in the switch state", () => {
    renderWithIntl(<DigestPreferenceToggle subscribed />)
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true")
  })

  it("shows off when unsubscribed", () => {
    renderWithIntl(<DigestPreferenceToggle subscribed={false} />)
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false")
  })

  it("persists the new state via PUT and refreshes", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal("fetch", fetchMock)

    renderWithIntl(<DigestPreferenceToggle subscribed />)
    await userEvent.click(screen.getByRole("switch"))

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/settings/digest",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ subscribed: false }) }),
    )
    expect(refresh).toHaveBeenCalled()
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false")
  })

  it("reverts the optimistic flip when the request fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false })
    vi.stubGlobal("fetch", fetchMock)

    renderWithIntl(<DigestPreferenceToggle subscribed />)
    await userEvent.click(screen.getByRole("switch"))

    expect(fetchMock).toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true")
  })
})
