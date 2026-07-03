import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { NextIntlClientProvider } from "next-intl"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import { LocaleSwitcher } from "@/components/locale-switcher"
import { SidebarProvider } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import en from "@/messages/en.json"
import is from "@/messages/is.json"

const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }))

beforeAll(() => {
  // SidebarProvider → useIsMobile → matchMedia (absent in jsdom).
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  refresh.mockReset()
})

function renderSwitcher(locale: "is" | "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "is" ? is : en}>
      <TooltipProvider>
        <SidebarProvider>
          <LocaleSwitcher />
        </SidebarProvider>
      </TooltipProvider>
    </NextIntlClientProvider>
  )
}

describe("LocaleSwitcher", () => {
  it("offers the other language and switches to it, then refreshes", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal("fetch", fetchMock)

    renderSwitcher("is") // current is → offers English
    await userEvent.click(screen.getByRole("button", { name: /English/i }))

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/settings/locale",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ locale: "en" }),
      })
    )
    expect(refresh).toHaveBeenCalled()
  })

  it("offers Icelandic when the current locale is English", () => {
    renderSwitcher("en")
    expect(screen.getByRole("button", { name: /Íslenska/i })).toBeInTheDocument()
  })

  it("does not refresh when the request fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false })
    vi.stubGlobal("fetch", fetchMock)

    renderSwitcher("is")
    await userEvent.click(screen.getByRole("button", { name: /English/i }))

    expect(fetchMock).toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })
})
