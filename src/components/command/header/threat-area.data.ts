import { useCommand } from "@/stores/command";
import { THREAT_META } from "@/lib/format";
import type { ThreatLevel } from "@/lib/types";

/**
 * useThreatData — data source for the ThreatArea header component.
 *
 * Returns the current global threat level + its display metadata (label, pip
 * class), or `null` while the game state handshake is in flight.
 *
 * ── Pluggable data source ───────────────────────────────────────────────
 * Currently reads `state.threatLevel` from the `useCommand` store.
 * Replace this implementation to source threat from an external intel feed
 * — keep the `ThreatData | null` return type and the presentation component
 * is unchanged.
 * ────────────────────────────────────────────────────────────────────────
 */
export interface ThreatData {
  level: ThreatLevel;
  label: string;
  pip: string;
  /** true when the level warrants the critical pip variant */
  critical: boolean;
}

export function useThreatData(): ThreatData | null {
  const state = useCommand((s) => s.state);
  if (!state) return null;

  const level = state.threatLevel;
  const meta = THREAT_META[level];
  return {
    level,
    label: meta.label,
    pip: meta.pip,
    critical: level === "RED" || level === "BLACK",
  };
}
