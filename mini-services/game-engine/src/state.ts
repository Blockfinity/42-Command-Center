// ---------------------------------------------------------------------------
// State initialization — builds the initial GameState from seed data.
// Extracted from index.ts for testability (logic without transport).
// ---------------------------------------------------------------------------

import {
  type GameState,
  type GameEvent,
  type Garrison,
  type FactionId,
  type Faction,
  type Territory,
  FACTIONS,
} from "../../../src/lib/types";
import { TERRITORY_DEFS, GARRISON_SEED, FACTION_SEED, type SeedSpec } from "./data";

let _id = 0;
export const uid = (p: string) => `${p}-${(_id++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
export const now = () => Date.now();
export const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
export const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

export function makeGarrison(s: SeedSpec): Garrison {
  const baseCompute = s.type === "Safehouse" ? 42 : 11;
  const baseHealth = s.type === "Safehouse" ? 100 : 55;
  return {
    id: uid("op"),
    name: s.name,
    type: s.type,
    faction: s.faction,
    lat: s.lat,
    lng: s.lng,
    level: s.type === "Safehouse" ? 2 : 1,
    health: baseHealth,
    maxHealth: baseHealth,
    compute: baseCompute,
    uptime: Math.floor(Math.random() * 60000),
    buildPoints: s.type === "Safehouse" ? 60 : 20,
    status: "ONLINE",
    establishedAt: now() - Math.floor(Math.random() * 86400000),
  };
}

export function makeFaction(id: FactionId, garrisons: Garrison[]): Faction {
  const mine = garrisons.filter((o) => o.faction === id);
  return {
    id,
    name: FACTION_SEED[id].name,
    motto: FACTION_SEED[id].motto,
    strength: clamp(40 + mine.length * 6),
    compute: mine.reduce((a, o) => a + o.compute, 0),
    territories: 0, // recomputed by recalcFactions() on the first tick
    garrisons: mine.length,
    threat: clamp(30 + mine.filter((o) => o.type === "Safehouse").length * 8),
  };
}

export function buildInitialState(): GameState {
  const garrisons = GARRISON_SEED.map(makeGarrison);
  const factions = {} as Record<FactionId, Faction>;
  for (const f of FACTIONS) factions[f] = makeFaction(f, garrisons);

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
    garrisons,
    missions: [],
    events,
    threatLevel: "GREEN",
    operative: {
      id: "OP-DEV-CMDR",
      codename: "CMDR. OXFORD",
      tier: "ELITE",
      faction: "FANG",
      authority: 72,
      // Starting wallet — enough to launch a few strikes + builds. Accrues
      // passively from garrison uptime (see accrueWallet in logic.ts).
      wallet: {
        VOTC: 500,
        FANG: 200,
        HAMMER: 200,
        RESOLUTE: 200,
      },
    },
    territories,
    activityPings: [],
    networkLoad: 1.4,
    totalActions: 847_000_000,
    // Intel ledger starts EMPTY — no enemy safehouse seeding. Fills
    // organically as the operative runs ESPIONAGE missions against rivals.
    intel: [],
  };
}
