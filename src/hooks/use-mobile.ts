import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  // useSyncExternalStore keeps this in sync with the media query without a
  // setState-in-effect cascade on mount.
  return React.useSyncExternalStore(
    (onStoreChange) => {
      const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
      mql.addEventListener("change", onStoreChange)
      return () => mql.removeEventListener("change", onStoreChange)
    },
    () => window.innerWidth < MOBILE_BREAKPOINT,
    () => false,
  )
}
