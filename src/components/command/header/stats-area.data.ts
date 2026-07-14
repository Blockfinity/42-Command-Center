import { useCommand } from "@/stores/command";

/**
 * useStatsData — data source for the StatsArea header component.
 *
 * Returns the operative-faction garrison/compute aggregates shown in the live
 * status cluster (ACTIVE NODES / ELITE / COMPUTE / SOL), or `null` while the
 * game state handshake is in flight.
 *
 * ── Pluggable data source ───────────────────────────────────────────────
 * Currently derived from the `useCommand` store (socket.io game engine).
 * Replace this implementation to feed the stats cluster from a different
 * source — keep the `StatsData | null` return type and the presentation
 * component is unchanged.
 * ────────────────────────────────────────────────────────────────────────
 */
export interface StatsData {
  activeNodes: number;
  totalNodes: number;
  eliteCount: number;
  compute: number;
  sol: number;
}

export function useStatsData(): StatsData | null {
  const state = useCommand((s) => s.state);
  if (!state) return null;

  const op = state.operative;
  const myFaction = state.factions[op.faction];
  const myGarrisons = state.garrisons.filter((o) => o.faction === op.faction);

  return {
    activeNodes: myGarrisons.filter((o) => o.status !== "OFFLINE").length,
    totalNodes: myGarrisons.length,
    eliteCount: myGarrisons.filter((o) => o.type === "Safehouse").length,
    compute: myFaction.compute,
    sol: state.sol,
  };
}
