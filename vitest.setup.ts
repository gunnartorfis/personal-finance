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

// Base UI's Menu/Popover (floating-ui + roving focus) call these DOM APIs jsdom doesn't implement.
// Stub them so a menu opens and its items are focusable/queryable under tests.
Element.prototype.scrollIntoView ??= () => {}
Element.prototype.hasPointerCapture ??= () => false
Element.prototype.setPointerCapture ??= () => {}
Element.prototype.releasePointerCapture ??= () => {}
globalThis.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof globalThis.matchMedia

// RTL auto-cleanup only registers with Vitest globals; we don't use globals, so
// unmount rendered trees between tests ourselves to keep the DOM isolated.
afterEach(() => {
  cleanup()
})
