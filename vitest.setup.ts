import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

// recharts' ResponsiveContainer observes its box via ResizeObserver, which jsdom
// doesn't implement. Stub it so chart components mount without throwing; the SVG
// stays 0×0 under jsdom, so chart tests assert on the HTML legend / sr-only data
// rather than rendered marks.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver

// RTL auto-cleanup only registers with Vitest globals; we don't use globals, so
// unmount rendered trees between tests ourselves to keep the DOM isolated.
afterEach(() => {
  cleanup()
})
