// ---------------------------------------------------------------------------
// Client action handlers — process player commands (launch mission, place
// outpost, upgrade, request briefing). Mutates GameState + emits result.
// Extracted from index.ts for testability.
// ---------------------------------------------------------------------------

import {
  type GameState,
  type Outpost,
  type ClientAction,
  MISSION_META,
} from "../../../src/lib/types";
import { uid, now } from "./state";
import { spawnMission, recalcFactions, pushEvent } from "./logic";

export type ActionResult = { ok: boolean; error?: string; note?: string };

export function handleAction(state: GameState, action: ClientAction): ActionResult {
  try {
    switch (action.kind) {
      case "launch-mission": {
        const src = state.outposts.find((o) => o.id === action.sourceId);
        const tgt = state.outposts.find((o) => o.id === action.targetId);
        if (!src || !tgt) {
          return { ok: false, error: "Invalid source or target." };
        }
        if (src.faction === tgt.faction && action.missionType !== "BUILD" && action.missionType !== "DEFEND") {
          return { ok: false, error: "Cannot strike a friendly outpost." };
        }
        if (action.missionType === "BUILD") {
          const cost = 40 + src.level * 20;
          if (src.buildPoints < cost) {
            return { ok: false, error: `Need ${cost} build points (have ${Math.floor(src.buildPoints)}).` };
          }
          src.buildPoints -= cost;
        }
        const targetId = action.missionType === "BUILD" ? src.id : action.targetId;
        spawnMission(state, action.missionType, src.id, targetId, src.faction);
        return { ok: true };
      }
      case "place-outpost": {
        // Per-type deploy spec. FULL = heavy anchor, TACTICAL = light striker,
        // SAFEHOUSE = fortified bolt-hole (low compute, durable, defensive).
        const spec =
          action.type === "FULL"
            ? { health: 80, maxHealth: 100, compute: 30, buildPoints: 25, level: 1 }
            : action.type === "SAFEHOUSE"
            ? { health: 70, maxHealth: 70, compute: 6, buildPoints: 5, level: 1 }
            : { health: 45, maxHealth: 55, compute: 9, buildPoints: 8, level: 1 }; // TACTICAL
        const op: Outpost = {
          id: uid("op"),
          name: action.name || `${state.operative.faction} NODE ${state.outposts.length + 1}`,
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
        state.outposts.push(op);
        const deployMsg =
          action.type === "SAFEHOUSE"
            ? `Safehouse ${op.name} entrenched at ${op.lat.toFixed(2)}, ${op.lng.toFixed(2)}.`
            : `${op.type === "FULL" ? "Outpost" : "Tactical outpost"} ${op.name} deployed at ${op.lat.toFixed(2)}, ${op.lng.toFixed(2)}.`;
        pushEvent(state, {
          type: "DEPLOY",
          message: deployMsg,
          severity: "SUCCESS",
          faction: op.faction,
        });
        recalcFactions(state);
        return { ok: true };
      }
      case "upgrade-outpost": {
        const o = state.outposts.find((x) => x.id === action.id);
        if (!o) {
          return { ok: false, error: "Outpost not found." };
        }
        const cost = 50 + o.level * 25;
        if (o.buildPoints < cost) {
          return { ok: false, error: `Need ${cost} build points.` };
        }
        o.buildPoints -= cost;
        o.level += 1;
        o.maxHealth += 25;
        o.health = Math.min(o.maxHealth, o.health + 20);
        o.compute += o.type === "FULL" ? 10 : 3;
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
