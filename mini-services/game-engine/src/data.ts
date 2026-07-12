// ---------------------------------------------------------------------------
// Static world data — territory definitions, outpost seeds, ping type weights.
// Extracted from index.ts for separation of data from logic.
// ---------------------------------------------------------------------------

import type { FactionId } from "../../../src/lib/types";
import { FACTION_META } from "../../../src/lib/types";

// ---------------------------------------------------------------------------
// Territory definitions — named geographic regions factions fight to control.
// Polygons are closed rings WITHOUT a duplicated first point at the end.
// Coordinates are [lng, lat] to match GeoJSON convention.
// ---------------------------------------------------------------------------
export interface TerritoryDef {
  id: string;
  name: string;
  polygon: [number, number][];
  center: [number, number];
}

export const TERRITORY_DEFS: TerritoryDef[] = [
  {
    id: "NORTH_AMERICA",
    name: "North America",
    polygon: [
      [-168, 65], [-95, 72], [-65, 60], [-55, 48], [-95, 25], [-130, 48],
    ],
    center: [-100, 45],
  },
  {
    id: "SOUTH_AMERICA",
    name: "South America",
    polygon: [
      [-80, 12], [-50, 5], [-35, -5], [-40, -25], [-65, -55], [-75, -45], [-80, -15],
    ],
    center: [-65, -20],
  },
  {
    id: "EUROPE",
    name: "Europe",
    polygon: [
      [-10, 60], [25, 70], [40, 60], [40, 45], [10, 36], [-10, 40],
    ],
    center: [15, 50],
  },
  {
    id: "AFRICA",
    name: "Africa",
    polygon: [
      [-17, 35], [10, 37], [30, 32], [45, 12], [42, -10], [40, -35], [15, -35], [-15, 5],
    ],
    center: [20, 0],
  },
  {
    id: "MIDDLE_EAST",
    name: "Middle East",
    polygon: [
      [35, 40], [60, 40], [62, 25], [55, 12], [40, 12], [33, 30],
    ],
    center: [47, 28],
  },
  {
    id: "CENTRAL_ASIA",
    name: "Central Asia",
    polygon: [
      [40, 55], [80, 55], [87, 49], [80, 38], [55, 38], [45, 45],
    ],
    center: [65, 47],
  },
  {
    id: "SOUTH_ASIA",
    name: "South Asia",
    polygon: [
      [60, 35], [85, 30], [92, 22], [80, 6], [70, 8], [60, 22],
    ],
    center: [75, 22],
  },
  {
    id: "EAST_ASIA",
    name: "East Asia",
    polygon: [
      [85, 50], [135, 50], [145, 40], [135, 25], [110, 18], [95, 28], [85, 40],
    ],
    center: [115, 38],
  },
  {
    id: "SOUTHEAST_ASIA",
    name: "Southeast Asia",
    polygon: [
      [95, 25], [115, 25], [140, 10], [135, -10], [110, -10], [95, 5],
    ],
    center: [115, 5],
  },
  {
    id: "OCEANIA",
    name: "Oceania",
    polygon: [
      [112, -10], [155, -10], [160, -25], [140, -40], [115, -35], [113, -22],
    ],
    center: [135, -25],
  },
  {
    id: "ARCTIC",
    name: "Arctic",
    polygon: [
      [-170, 88], [-60, 88], [40, 88], [150, 88], [150, 70], [-60, 70],
    ],
    center: [-30, 80],
  },
  {
    id: "ATLANTIC",
    name: "Atlantic",
    polygon: [
      [-60, 65], [-10, 70], [10, 60], [-5, 40], [-30, 25], [-60, 40], [-65, 55],
    ],
    center: [-30, 50],
  },
];

// ---------------------------------------------------------------------------
// Activity ping types — weighted so TRAFFIC dominates (most common network
// action) and STRIKE is rare (kinetic events are uncommon).
// ---------------------------------------------------------------------------
export const PING_TYPE_WEIGHTS: Array<{ type: string; w: number }> = [
  { type: "TRAFFIC", w: 40 },
  { type: "BUILD", w: 20 },
  { type: "SCAN", w: 15 },
  { type: "DEPLOY", w: 10 },
  { type: "BREACH", w: 8 },
  { type: "STRIKE", w: 7 },
];
export const PING_W_TOTAL = PING_TYPE_WEIGHTS.reduce((a, t) => a + t.w, 0);

export function pickWeightedPingType(): string {
  let r = Math.random() * PING_W_TOTAL;
  for (const t of PING_TYPE_WEIGHTS) {
    r -= t.w;
    if (r <= 0) return t.type;
  }
  return "TRAFFIC";
}

// ---------------------------------------------------------------------------
// Initial world state — 3 factions with outposts seeded across the globe
// ---------------------------------------------------------------------------
export const FACTION_SEED: Record<FactionId, { name: string; motto: string }> = {
  FANG: FACTION_META.FANG,
  HAMMER: FACTION_META.HAMMER,
  RESOLUTE: FACTION_META.RESOLUTE,
};

export interface SeedSpec {
  name: string;
  faction: FactionId;
  type: "FULL" | "TACTICAL";
  lat: number;
  lng: number;
}

export const OUTPOST_SEED: SeedSpec[] = [
  // FANG — pack hunters, distributed across stable datacenter corridors
  { name: "Fang Prime", faction: "FANG", type: "FULL", lat: 40.71, lng: -74.0 },     // New York
  { name: "Fang West", faction: "FANG", type: "FULL", lat: 51.5, lng: -0.12 },       // London
  { name: "Fang Delta", faction: "FANG", type: "TACTICAL", lat: 35.68, lng: 139.69 },// Tokyo
  { name: "Fang Vault", faction: "FANG", type: "TACTICAL", lat: 25.2, lng: 55.27 },  // Dubai
  { name: "Fang South", faction: "FANG", type: "TACTICAL", lat: -33.86, lng: 151.2 },// Sydney

  // HAMMER — aggressive, mobile, coastal strike nodes
  { name: "Hammer Anvil", faction: "HAMMER", type: "FULL", lat: 37.77, lng: -122.4 },  // San Francisco
  { name: "Hammer Forge", faction: "HAMMER", type: "FULL", lat: 59.33, lng: 18.06 },    // Stockholm
  { name: "Hammer Reach", faction: "HAMMER", type: "TACTICAL", lat: 1.35, lng: 103.81 },// Singapore
  { name: "Hammer Cape", faction: "HAMMER", type: "TACTICAL", lat: -34.6, lng: -58.38 },// Buenos Aires
  { name: "Hammer Reef", faction: "HAMMER", type: "TACTICAL", lat: -22.9, lng: -43.2 },// Rio fallback (close to cape)
  { name: "Hammer Horn", faction: "HAMMER", type: "TACTICAL", lat: 55.75, lng: 37.61 },// Moscow

  // RESOLUTE — steadfast, frontier, offshore
  { name: "Resolute Stand", faction: "RESOLUTE", type: "FULL", lat: 22.32, lng: 114.17 },   // Hong Kong
  { name: "Resolute Watch", faction: "RESOLUTE", type: "FULL", lat: 41.01, lng: 28.97 },     // Istanbul
  { name: "Resolute Drift", faction: "RESOLUTE", type: "TACTICAL", lat: 6.52, lng: 3.37 },  // Lagos
  { name: "Resolute Mirage", faction: "RESOLUTE", type: "TACTICAL", lat: 30.04, lng: 31.23 },// Cairo
  { name: "Resolute Glacier", faction: "RESOLUTE", type: "TACTICAL", lat: 64.13, lng: -21.94 },// Reykjavik
];
