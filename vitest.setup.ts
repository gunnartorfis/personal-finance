import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

// RTL auto-cleanup only registers with Vitest globals; we don't use globals, so
// unmount rendered trees between tests ourselves to keep the DOM isolated.
afterEach(() => {
  cleanup()
})
