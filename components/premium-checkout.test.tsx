import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { PremiumCheckout } from "@/components/premium-checkout"

// Capture the config passed to AdyenCheckout so tests can drive its callbacks + assert wiring.
let lastConfig: Record<string, (...args: unknown[]) => void> & {
  environment?: string
  clientKey?: string
  session?: { id: string; sessionData: string }
}
const unmount = vi.fn()
const mount = vi.fn(() => dropinInstance)
const dropinInstance = { mount, unmount } // mount() returns the instance, which exposes unmount()
const AdyenCheckout = vi.fn(async (config: typeof lastConfig) => {
  lastConfig = config
  return { isCheckout: true }
})
// A regular (newable) function — the component calls `new Dropin(checkout)`; an arrow isn't a constructor.
const Dropin = vi.fn(function DropinMock() {
  return dropinInstance
})
vi.mock("@adyen/adyen-web", () => ({ AdyenCheckout: (c: typeof lastConfig) => AdyenCheckout(c), Dropin }))

function stubCheckout(clientKey = "test_ABC") {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    expect(url).toBe("/api/billing/checkout")
    expect(init?.method).toBe("POST")
    return { ok: true, json: async () => ({ id: "sess-1", sessionData: "data-1", clientKey }) }
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

beforeEach(() => {
  AdyenCheckout.mockClear()
  Dropin.mockClear()
  mount.mockClear()
  unmount.mockClear()
})
afterEach(() => vi.unstubAllGlobals())

describe("PremiumCheckout", () => {
  it("starts checkout for the chosen period and mounts the Drop-in", async () => {
    const fetchMock = stubCheckout()
    render(<PremiumCheckout />)

    await userEvent.selectOptions(screen.getByLabelText(/billing period/i), "annual")
    await userEvent.click(screen.getByRole("button", { name: /upgrade to premium/i }))

    const post = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === "POST")!
    expect(post[0]).toBe("/api/billing/checkout")
    expect(JSON.parse((post[1] as RequestInit).body as string)).toEqual({ period: "annual" })

    expect(AdyenCheckout).toHaveBeenCalledTimes(1)
    expect(lastConfig.session).toEqual({ id: "sess-1", sessionData: "data-1" })
    expect(lastConfig.clientKey).toBe("test_ABC")
    expect(lastConfig.environment).toBe("test")
    expect(mount).toHaveBeenCalledTimes(1)
  })

  it("derives the live environment from a live client key", async () => {
    stubCheckout("live_XYZ")
    render(<PremiumCheckout />)
    await userEvent.click(screen.getByRole("button", { name: /upgrade to premium/i }))
    expect(lastConfig.environment).toBe("live")
  })

  it("shows confirmation when the payment is authorised", async () => {
    stubCheckout()
    render(<PremiumCheckout />)
    await userEvent.click(screen.getByRole("button", { name: /upgrade to premium/i }))

    lastConfig.onPaymentCompleted({ resultCode: "Authorised" })
    expect(await screen.findByText(/premium is active/i)).toBeInTheDocument()
  })

  it("shows a pending notice for a non-authorised completion (e.g. Pending)", async () => {
    stubCheckout()
    render(<PremiumCheckout />)
    await userEvent.click(screen.getByRole("button", { name: /upgrade to premium/i }))

    lastConfig.onPaymentCompleted({ resultCode: "Pending" })
    expect(await screen.findByText(/once it.?s confirmed/i)).toBeInTheDocument()
    expect(screen.queryByText(/premium is active/i)).not.toBeInTheDocument()
  })

  it("surfaces a failed payment", async () => {
    stubCheckout()
    render(<PremiumCheckout />)
    await userEvent.click(screen.getByRole("button", { name: /upgrade to premium/i }))

    lastConfig.onPaymentFailed({})
    expect(await screen.findByRole("alert")).toBeInTheDocument()
  })

  it("tears down the Drop-in when the component unmounts", async () => {
    stubCheckout()
    const { unmount: unmountComponent } = render(<PremiumCheckout />)
    await userEvent.click(screen.getByRole("button", { name: /upgrade to premium/i }))
    expect(mount).toHaveBeenCalledTimes(1)

    unmountComponent()
    expect(unmount).toHaveBeenCalledTimes(1)
  })

  it("surfaces an error when the checkout request fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 502, json: async () => ({}) })))
    render(<PremiumCheckout />)
    await userEvent.click(screen.getByRole("button", { name: /upgrade to premium/i }))

    expect(await screen.findByRole("alert")).toBeInTheDocument()
    expect(AdyenCheckout).not.toHaveBeenCalled()
  })
})
