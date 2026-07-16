// ---------------------------------------------------------------------------
// Client action handlers — process player commands (launch mission, place
// garrison, upgrade, request briefing). Mutates GameState + emits result.
// Extracted from index.ts for testability.
// ---------------------------------------------------------------------------

import {
  type GameState,
  type Garrison,
  type ClientAction,
  type CurrencyId,
  type MissionType,
  type FactionId,
  MISSION_META,
  NETWORK_CURRENCY,
  missionCurrency,
} from "../../../src/lib/types";
import { uid, now } from "./state";
import { spawnMission, recalcFactions, pushEvent } from "./logic";
import { FACTION_TOKEN } from "../../../src/lib/factions";

export type ActionResult = { ok: boolean; error?: string; note?: string };

/** Resolve the currency for a mission per the token economy:
 *  • ATTACK (DRONE_STRIKE, CYBER_ATTACK, ESPIONAGE) → TARGET faction's token
 *  • DEFEND / RECON → SOURCE (your) faction's token
 *  • BUILD → VOTC */
function costCurrency(
  type: MissionType,
  sourceFaction: FactionId,
  target: Garrison | null
): CurrencyId {
  const targetFaction = target && target.faction !== sourceFaction
    ? target.faction
    : sourceFaction;
  return missionCurrency(type, sourceFaction, targetFaction);
}

/** Symbol for display. */
function currencySymbol(c: CurrencyId): string {
  return c === "VOTC" ? NETWORK_CURRENCY : FACTION_TOKEN[c];
}

export function handleAction(state: GameState, action: ClientAction): ActionResult {
  try {
    switch (action.kind) {
      case "launch-mission": {
        const src = state.garrisons.find((o) => o.id === action.sourceId);
        const tgt = state.garrisons.find((o) => o.id === action.targetId);
        if (!src || !tgt) {
          return { ok: false, error: "Invalid source or target." };
        }
        if (src.faction === tgt.faction && action.missionType !== "BUILD" && action.missionType !== "DEFEND") {
          return { ok: false, error: "Cannot strike a friendly garrison." };
        }
        // ===== Token economy — deduct from operative's wallet =====
        // ATTACK → target faction's token; DEFEND/RECON → own faction's token;
        // BUILD → VOTC. BUILD/DEFEND/RECON are self-targeted (src === tgt).
        const effectiveTarget = action.missionType === "BUILD" || action.missionType === "DEFEND"
          ? src  // self-targeted → currency resolves to source faction
          : tgt;
        const cost = MISSION_META[action.missionType].cost;
        if (cost > 0) {
          const c = costCurrency(action.missionType, src.faction, effectiveTarget);
          if (state.operative.wallet[c] < cost) {
            return {
              ok: false,
              error: `Insufficient ${currencySymbol(c)} (need ${cost}, have ${Math.floor(state.operative.wallet[c])}).`,
            };
          }
          state.operative.wallet[c] -= cost;
        }
        const targetId = action.missionType === "BUILD" ? src.id : action.targetId;
        spawnMission(state, action.missionType, src.id, targetId, src.faction);
        return { ok: true };
      }
      case "place-garrison": {
        // Per-type deploy spec. Safehouse = full node daemon (heavy),
        // Tactical Safehouse = edge plugin (light striker).
        const spec =
          action.type === "Safehouse"
            ? { health: 80, maxHealth: 100, compute: 30, buildPoints: 25, level: 1 }
            : { health: 45, maxHealth: 55, compute: 9, buildPoints: 8, level: 1 }; // Tactical Safehouse
        const op: Garrison = {
          id: uid("op"),
          name: action.name || `${state.operative.faction} NODE ${state.garrisons.length + 1}`,
          type: action.type,
          faction: state.operative.faction,
          lat: action.lat,
          lng: action.lng,
          level: spec.level,
          health: spec.health,
          maxHealth: spec.maxHealth,
          compute: spec.compute,
          uptime: 0,
          buildPoints: spec.buildPoints,
          status: "ONLINE",
          establishedAt: now(),
        };
        state.garrisons.push(op);
        const deployMsg =
          action.type === "Safehouse"
            ? `Safehouse ${op.name} entrenched at ${op.lat.toFixed(2)}, ${op.lng.toFixed(2)}.`
            : `Tactical Safehouse ${op.name} deployed at ${op.lat.toFixed(2)}, ${op.lng.toFixed(2)}.`;
        pushEvent(state, {
          type: "DEPLOY",
          message: deployMsg,
          severity: "SUCCESS",
          faction: op.faction,
        });
        recalcFactions(state);
        return { ok: true };
      }
      case "upgrade-garrison": {
        const o = state.garrisons.find((x) => x.id === action.id);
        if (!o) {
          return { ok: false, error: "Garrison not found." };
        }
        const cost = 50 + o.level * 25;
        if (o.buildPoints < cost) {
          return { ok: false, error: `Need ${cost} build points.` };
        }
        o.buildPoints -= cost;
        o.level += 1;
        o.maxHealth += 25;
        o.health = Math.min(o.maxHealth, o.health + 20);
        o.compute += o.type === "Safehouse" ? 10 : 3;
        pushEvent(state, {
          type: "UPGRADE",
          message: `${o.name} upgraded to level ${o.level}.`,
          severity: "SUCCESS",
          faction: o.faction,
        });
        return { ok: true };
      }
      case "request-briefing": {
        // Engine can't call the LLM (it lives in the Next API). Ask client to fetch
        // from /api/ai/briefing instead. Acknowledge here so the UI can show a hint.
        return { ok: true, note: "Use /api/ai/briefing" };
      }
    }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "unknown error" };
  }
}
