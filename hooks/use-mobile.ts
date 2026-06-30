import * as React from "react"

const MOBILE_BREAKPOINT = 768
const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(MOBILE_QUERY)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

/**
 * `true` when the viewport is below the mobile breakpoint. Modelled as an external store via
 * `useSyncExternalStore` so it stays reactive without a setState-in-effect and renders `false` on
 * the server (sidebar starts in its desktop layout, then corrects on hydration if needed).
 */
export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false,
  )
}
