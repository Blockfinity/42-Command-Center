import { useCommand } from "@/stores/command";
import type { FactionId } from "@/lib/types";
import { FACTION_LOGO } from "@/lib/factions";

/**
 * useBrandData — data source for the BrandArea header component.
 *
 * Returns the operative's faction id + resolved logo path, or `null` while the
 * game state handshake is in flight.
 *
 * ── Pluggable data source ───────────────────────────────────────────────
 * Currently reads from the `useCommand` zustand store (fed by the socket.io
 * game engine on port 3003). To plug this area into a different source
 * (REST endpoint, GraphQL, another store, static config), replace the
 * implementation below — keep the return type `BrandData | null` and the
 * presentation component will work unchanged.
 * ────────────────────────────────────────────────────────────────────────
 */
export interface BrandData {
  faction: FactionId;
  factionLogo: string;
}

export function useBrandData(): BrandData | null {
  const state = useCommand((s) => s.state);
  if (!state) return null;
  const { faction } = state.operative;
  return { faction, factionLogo: FACTION_LOGO[faction] };
}
