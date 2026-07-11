import { useCommand } from "@/stores/command";
import { FACTIONS, type Faction, type FactionId } from "@/lib/types";

/**
 * useStandingsData — data source for the StandingsArea header component.
 *
 * Returns an ordered list of faction standings (name + strength) plus a flag
 * marking the operative's own faction, or `null` while the game state
 * handshake is in flight.
 *
 * ── Pluggable data source ───────────────────────────────────────────────
 * Currently reads `state.factions` + `state.operative.faction` from the
 * `useCommand` store. Replace this implementation to source standings from a
 * leaderboard API or other feed — keep the `StandingsData | null` return
 * type and the presentation component is unchanged.
 * ────────────────────────────────────────────────────────────────────────
 */
export interface FactionStanding {
  id: FactionId;
  name: string;
  strength: number;
  isMine: boolean;
}

export interface StandingsData {
  standings: FactionStanding[];
}

export function useStandingsData(): StandingsData | null {
  const state = useCommand((s) => s.state);
  if (!state) return null;

  const myFactionId = state.operative.faction;
  const standings: FactionStanding[] = FACTIONS.map((id) => {
    const fac: Faction = state.factions[id];
    return {
      id,
      name: fac.name,
      strength: fac.strength,
      isMine: id === myFactionId,
    };
  });

  return { standings };
}
