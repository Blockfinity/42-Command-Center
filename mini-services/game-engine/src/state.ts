// ---------------------------------------------------------------------------
// State initialization — builds the initial GameState from seed data.
// Extracted from index.ts for testability (logic without transport).
// ---------------------------------------------------------------------------

import {
  type GameState,
  type GameEvent,
  type Outpost,
  type FactionId,
  type Faction,
  type Territory,
  FACTIONS,
} from "../../../src/lib/types";
import { TERRITORY_DEFS, OUTPOST_SEED, FACTION_SEED, type SeedSpec } from "./data";

let _id = 0;
export const uid = (p: string) => `${p}-${(_id++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
export const now = () => Date.now();
export const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
export const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

export function makeOutpost(s: SeedSpec): Outpost {
  const baseCompute = s.type === "FULL" ? 42 : 11;
  const baseHealth = s.type === "FULL" ? 100 : 55;
  return {
    id: uid("op"),
    name: s.name,
    type: s.type,
    faction: s.faction,
    lat: s.lat,
    lng: s.lng,
    level: s.type === "FULL" ? 2 : 1,
    health: baseHealth,
    maxHealth: baseHealth,
    compute: baseCompute,
    uptime: Math.floor(Math.random() * 60000),
    buildPoints: s.type === "FULL" ? 60 : 20,
    status: "ONLINE",
    establishedAt: now() - Math.floor(Math.random() * 86400000),
  };
}

export function makeFaction(id: FactionId, outposts: Outpost[]): Faction {
  const mine = outposts.filter((o) => o.faction === id);
  return {
    id,
    name: FACTION_SEED[id].name,
    motto: FACTION_SEED[id].motto,
    strength: clamp(40 + mine.length * 6),
    compute: mine.reduce((a, o) => a + o.compute, 0),
    territories: 0, // recomputed by recalcFactions() on the first tick
    outposts: mine.length,
    threat: clamp(30 + mine.filter((o) => o.type === "FULL").length * 8),
  };
}

export function buildInitialState(): GameState {
  const outposts = OUTPOST_SEED.map(makeOutpost);
  const factions = {} as Record<FactionId, Faction>;
  for (const f of FACTIONS) factions[f] = makeFaction(f, outposts);

  const territories: Territory[] = TERRITORY_DEFS.map((d) => ({
    id: d.id,
    name: d.name,
    polygon: d.polygon,
    center: d.center,
    controller: null,
    control: 0,
    influence: { FANG: 0, HAMMER: 0, RESOLUTE: 0 },
  }));

  const events: GameEvent[] = [
    {
      id: uid("ev"),
      type: "BOOT",
      timestamp: now(),
      message: "42 command deck online. Verifiable compute fabric synchronized.",
      severity: "SUCCESS",
    },
    {
      id: uid("ev"),
      type: "BOOT",
      timestamp: now(),
      message: "Three factions detected across the grid: FANG · HAMMER · RESOLUTE.",
      severity: "INFO",
    },
  ];

  return {
    tick: 0,
    sol: 893,
    clock: now(),
    factions,
    outposts,
    missions: [],
    events,
    threatLevel: "GREEN",
    operative: {
      id: "OP-DEV-CMDR",
      codename: "CMDR. OXFORD",
      tier: "ELITE",
      faction: "FANG",
      authority: 72,
    },
    territories,
    activityPings: [],
    networkLoad: 1.4,
    totalActions: 847_000_000,
  };
}
