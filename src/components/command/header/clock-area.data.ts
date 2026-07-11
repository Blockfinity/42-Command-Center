import * as React from "react";
import { useCommand } from "@/stores/command";
import { fmtClock } from "@/lib/format";

/**
 * useClockData — data source for the ClockArea header component.
 *
 * Returns the local system clock (formatted) + the live link status, or
 * `null` while the game state handshake is in flight.
 *
 * ── Pluggable data source ───────────────────────────────────────────────
 * The clock is currently driven by a local 1s interval and the link status
 * comes from the `useCommand` store's socket connection flag. To source the
 * clock from a server time-sync or NTP feed, replace the interval below —
 * keep the `ClockData | null` return type and the presentation component is
 * unchanged.
 * ────────────────────────────────────────────────────────────────────────
 */
export interface ClockData {
  /** formatted HH:MM:SS string */
  clockLabel: string;
  connected: boolean;
}

export function useClockData(): ClockData | null {
  const state = useCommand((s) => s.state);
  const connected = useCommand((s) => s.connected);
  const [clock, setClock] = React.useState(Date.now());

  React.useEffect(() => {
    const t = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!state) return null;
  return { clockLabel: fmtClock(clock), connected };
}
