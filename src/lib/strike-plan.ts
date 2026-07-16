// ---------------------------------------------------------------------------
// Strike-planning helpers — the shared contract between the StrikeConsole,
// the GarrisonDetailCard action list, and the game engine.
//
// Token economy (per user spec):
//   • ATTACK missions (DRONE_STRIKE, CYBER_ATTACK, ESPIONAGE) → cost the
//     TARGET faction's token. (Attacking HAMMER costs HAMMER tokens.)
//   • DEFEND / RECON → cost YOUR (source) faction's token.
//   • BUILD / UPGRADE → cost VOTC (the universal currency).
//
// Source picking: attacks auto-pick the closest eligible own garrison to the
// target (closest = strongest projection of force). Eligible = same faction as
// the operative, online, not under attack, and (for strikes) not the target
// itself. This removes the source-picker dance — the player just confirms.
//
// Intel gating: only garrisons revealed via ESPIONAGE/RECON appear as strike
// targets. The ledger is owned by the operative's faction and TTL-pruned by
// the engine. listIntelTargets() filters the live garrison list against it.
// ---------------------------------------------------------------------------

import {
  MISSION_META,
  missionCurrency,
  NETWORK_CURRENCY,
  type CurrencyId,
  type FactionId,
  type GameState,
  type Garrison,
  type MissionType,
} from "@/lib/types";
import { FACTION_TOKEN } from "@/lib/factions";

/** Haversine distance in km between two [lat, lng] points. */
function haversineKm(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number
): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) *
      Math.cos((bLat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Pick the best source garrison for a strike against `targetId`.
 * "Best" = closest eligible own garrison to the target.
 *
 * Eligible:
 *   • same faction as the operative
 *   • status !== OFFLINE
 *   • not the target itself
 *
 * Returns null when no eligible source exists (caller shows a disabled
 * confirm button with a "NO AVAILABLE SOURCES" warning).
 */
export function pickBestSource(
  state: GameState,
  targetId: string
): Garrison | null {
  const target = state.garrisons.find((o) => o.id === targetId);
  if (!target) return null;
  const myFaction = state.operative.faction;
  const candidates = state.garrisons.filter(
    (o) =>
      o.faction === myFaction &&
      o.id !== targetId &&
      o.status !== "OFFLINE"
  );
  if (candidates.length === 0) return null;
  let best = candidates[0];
  let bestD = haversineKm(
    best.lat,
    best.lng,
    target.lat,
    target.lng
  );
  for (let i = 1; i < candidates.length; i++) {
    const d = haversineKm(
      candidates[i].lat,
      candidates[i].lng,
      target.lat,
      target.lng
    );
    if (d < bestD) {
      best = candidates[i];
      bestD = d;
    }
  }
  return best;
}

/**
 * List rival garrisons currently revealed as intel targets for the operative's
 * faction. Combines the intel ledger (TTL-valid entries) with the live
 * garrison list so expired/destroyed garrisons are filtered out.
 *
 * Returns garrisons sorted by distance to the operative's nearest source
 * (closest first — the most strikable targets rise to the top).
 */
export function listIntelTargets(state: GameState): Garrison[] {
  const myFaction = state.operative.faction;
  const knownIds = new Set(
    state.intel
      .filter((e) => e.ownerFaction === myFaction)
      .map((e) => e.targetId)
  );
  return state.garrisons.filter(
    (o) => o.faction !== myFaction && knownIds.has(o.id)
  );
}

/**
 * The currency symbol for a given currency id — either "VOTC" or the
 * faction's token name (e.g. "FANG"). Used for display.
 */
export function currencySymbol(c: CurrencyId): string {
  return c === "VOTC" ? NETWORK_CURRENCY : FACTION_TOKEN[c];
}

/**
 * Resolve the currency for a mission given the operative's faction and a
 * target garrison. Convenience wrapper around missionCurrency().
 */
export function missionCostCurrency(
  type: MissionType,
  sourceFaction: FactionId,
  target: Garrison | null
): CurrencyId {
  // Self-targeted missions (BUILD/DEFEND/RECON on own garrison) — target
  // faction is the source faction.
  const targetFaction = target && target.faction !== sourceFaction
    ? target.faction
    : sourceFaction;
  return missionCurrency(type, sourceFaction, targetFaction);
}

/**
 * Build a human-readable cost label for a mission, e.g. "40 HAMMER" or
 * "FREE" or "50 VOTC".
 */
export function missionCostLabel(
  type: MissionType,
  sourceFaction: FactionId,
  target: Garrison | null
): string {
  const cost = MISSION_META[type].cost;
  if (cost === 0) return "FREE";
  const c = missionCostCurrency(type, sourceFaction, target);
  return `${cost} ${currencySymbol(c)}`;
}

/**
 * Check whether the operative can afford a mission given current wallet
 * balances and the token economy.
 */
export function canAfford(
  state: GameState,
  type: MissionType,
  target: Garrison | null
): boolean {
  const cost = MISSION_META[type].cost;
  if (cost === 0) return true;
  const c = missionCostCurrency(type, state.operative.faction, target);
  return state.operative.wallet[c] >= cost;
}

/**
 * Deduct the mission cost from the operative's wallet (engine-side helper).
 * Returns true if the deduction succeeded, false if unaffordable.
 */
export function deductCost(
  state: GameState,
  type: MissionType,
  target: Garrison | null
): boolean {
  const cost = MISSION_META[type].cost;
  if (cost === 0) return true;
  const c = missionCostCurrency(type, state.operative.faction, target);
  if (state.operative.wallet[c] < cost) return false;
  state.operative.wallet[c] -= cost;
  return true;
}
