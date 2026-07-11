import { useCommand } from "@/stores/command";
import type { FactionId, Operative } from "@/lib/types";

/**
 * useProfileData — data source for the ProfileArea header component.
 *
 * Returns the operative profile summary (codename, tier, faction, initials
 * badge), or `null` while the game state handshake is in flight.
 *
 * ── Pluggable data source ───────────────────────────────────────────────
 * Currently reads `state.operative` from the `useCommand` store. To source
 * the operative profile from an auth/session API instead, replace this
 * implementation — keep the `ProfileData | null` return type and the
 * presentation component is unchanged.
 * ────────────────────────────────────────────────────────────────────────
 */
export interface ProfileData {
  codename: string;
  tier: Operative["tier"];
  faction: FactionId;
  /** 1-2 char initials badge derived from the codename */
  initials: string;
}

export function useProfileData(): ProfileData | null {
  const state = useCommand((s) => s.state);
  if (!state) return null;

  const op = state.operative;
  const initials = op.codename
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2);

  return {
    codename: op.codename,
    tier: op.tier,
    faction: op.faction,
    initials,
  };
}
