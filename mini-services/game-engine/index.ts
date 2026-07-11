// 42 — Game Engine (real-time source of truth) — port 3003
// Holds the authoritative in-memory GameState, runs the game loop, and
// broadcasts snapshots to every connected commander via socket.io.

// ===========================================================================
// SCALING ARCHITECTURE NOTE
// ===========================================================================
// At true multi-million scale the engine would:
//   (a) shard state by region (each territory or sector is an independent
//       actor with its own ingress queue and authoritative slice of the map),
//   (b) emit delta updates instead of full snapshots (only changed fields
//       flow over the wire, drastically reducing bandwidth per client),
//   (c) batch action ingress (debounce + coalesce client actions at an edge
//       gateway before they ever touch authoritative state).
// This in-memory single-process demo validates the visualization layer —
// the broadcast is small enough at ~16 outposts + ~80 pings + 12 territories
// that we can afford the simplicity of a full-state snapshot every 2s.
// ===========================================================================

import { createServer } from "http";
import { Server } from "socket.io";
import {
  type GameState,
  type GameEvent,
  type Outpost,
  type Mission,
  type FactionId,
  type Faction,
  type MissionType,
  type ThreatLevel,
  type Briefing,
  type Recommendation,
  type ClientAction,
  type Territory,
  type ActivityPing,
  FACTIONS,
  FACTION_META,
  MISSION_META,
} from "../../src/lib/types";

const PORT = 3003;
const TICK_MS = 2000; // game loop cadence

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------
let _id = 0;
const uid = (p: string) => `${p}-${(_id++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const now = () => Date.now();
const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

/** Equirectangular angular distance (degrees) between two lat/lng points.
 *  Good-enough approximation for the proximity-weighted influence calc. */
function angularDist(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = lat1 - lat2;
  let dLng = lng1 - lng2;
  if (dLng > 180) dLng -= 360;
  else if (dLng < -180) dLng += 360;
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

// ---------------------------------------------------------------------------
// Territory definitions — named geographic regions factions fight to control.
// Polygons are closed rings WITHOUT a duplicated first point at the end.
// Coordinates are [lng, lat] to match GeoJSON convention.
// ---------------------------------------------------------------------------
interface TerritoryDef {
  id: string;
  name: string;
  polygon: [number, number][];
  center: [number, number];
}

const TERRITORY_DEFS: TerritoryDef[] = [
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
const PING_TYPE_WEIGHTS: Array<{ type: string; w: number }> = [
  { type: "TRAFFIC", w: 40 },
  { type: "BUILD", w: 20 },
  { type: "SCAN", w: 15 },
  { type: "DEPLOY", w: 10 },
  { type: "BREACH", w: 8 },
  { type: "STRIKE", w: 7 },
];
const PING_W_TOTAL = PING_TYPE_WEIGHTS.reduce((a, t) => a + t.w, 0);

function pickWeightedPingType(): string {
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
const FACTION_SEED: Record<FactionId, { name: string; motto: string }> = {
  FANG: FACTION_META.FANG,
  HAMMER: FACTION_META.HAMMER,
  RESOLUTE: FACTION_META.RESOLUTE,
};

interface SeedSpec {
  name: string;
  faction: FactionId;
  type: "FULL" | "TACTICAL";
  lat: number;
  lng: number;
}

const OUTPOST_SEED: SeedSpec[] = [
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

function makeOutpost(s: SeedSpec): Outpost {
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

function makeFaction(id: FactionId, outposts: Outpost[]): Faction {
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

function buildInitialState(): GameState {
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

let state: GameState = buildInitialState();
let briefing: Briefing | undefined;

// ---------------------------------------------------------------------------
// Game loop logic
// ---------------------------------------------------------------------------
function recalcFactions() {
  for (const f of FACTIONS) {
    const mine = state.outposts.filter((o) => o.faction === f);
    const online = mine.filter((o) => o.status !== "OFFLINE");
    const totalCompute = online.reduce((a, o) => a + o.compute * (o.health / o.maxHealth), 0);
    const avgHealth = mine.length ? mine.reduce((a, o) => a + o.health, 0) / mine.length : 0;
    state.factions[f].compute = Math.round(totalCompute);
    state.factions[f].outposts = mine.length;
    // Territory count is now driven by the territory-control layer, not by
    // raw FULL-outpost count (so capturing a region actually moves the needle).
    state.factions[f].territories = state.territories.filter((t) => t.controller === f).length;
    state.factions[f].strength = clamp(
      Math.round(avgHealth * 0.5 + (totalCompute / 20) + mine.length * 3)
    );
    state.factions[f].threat = clamp(
      mine.filter((o) => o.type === "FULL").length * 9 +
      state.missions.filter((m) => m.faction === f && m.status === "ACTIVE" && (m.type === "DRONE_STRIKE" || m.type === "CYBER_ATTACK")).length * 12
    );
  }
}

/**
 * Recompute territory control from outpost influence.
 *
 * Influence rules:
 *   - Only non-OFFLINE outposts contribute.
 *   - Base influence = level * (health / maxHealth) * proximityWeight.
 *   - proximityWeight = 1.0 if angular distance to centroid < 12°, else
 *     decays linearly to 0 at 30°.
 *   - FULL outposts get a 2× multiplier (offensive territorial anchor);
 *     SAFEHOUSE outposts get 0.5× (defensive — not built for territory).
 *
 * Control rules:
 *   - The leading faction wins only if its influence > 1.4 × the runner-up's
 *     AND its influence > 0.5. Otherwise the region is CONTESTED (null).
 *   - `control` is the leader's share of total influence, rounded to 0-100.
 *   - On controller change, a TERRITORY event is pushed (SUCCESS on capture,
 *     WARN when flipping back to contested).
 */
function recalcTerritories() {
  for (const t of state.territories) {
    const influence: Record<FactionId, number> = { FANG: 0, HAMMER: 0, RESOLUTE: 0 };
    const [tLng, tLat] = t.center;

    for (const o of state.outposts) {
      if (o.status === "OFFLINE") continue;
      const dist = angularDist(o.lat, o.lng, tLat, tLng);
      const weight = dist < 12 ? 1.0 : Math.max(0, 1 - dist / 30);
      if (weight <= 0) continue;
      let mult = 1;
      if (o.type === "FULL") mult = 2;
      else if (o.type === "SAFEHOUSE") mult = 0.5;
      influence[o.faction] += o.level * (o.health / o.maxHealth) * weight * mult;
    }

    t.influence = influence;

    // Rank factions by influence (descending).
    const ranked = FACTIONS.map((f) => ({ f, v: influence[f] })).sort((a, b) => b.v - a.v);
    const leader = ranked[0];
    const runnerUp = ranked[1];
    const sum = ranked.reduce((a, r) => a + r.v, 0);

    const prevController = t.controller;
    let newController: FactionId | null = null;
    let newControl = 0;
    const beatsRunnerUp = runnerUp.v <= 0 || leader.v > 1.4 * runnerUp.v;
    if (leader.v > 0.5 && beatsRunnerUp) {
      newController = leader.f;
      newControl = sum > 0 ? Math.round((leader.v / sum) * 100) : 0;
    }
    t.controller = newController;
    t.control = newControl;

    if (newController !== prevController) {
      if (newController) {
        pushEvent({
          type: "TERRITORY",
          message: `${t.name} now under ${newController} control.`,
          severity: "SUCCESS",
          faction: newController,
        });
      } else {
        pushEvent({
          type: "TERRITORY",
          message: `${t.name} control CONTESTED.`,
          severity: "WARN",
        });
      }
    }
  }
}

function recalcThreat() {
  const active = state.missions.filter((m) => m.status === "ACTIVE");
  const strikes = active.filter((m) => m.type === "DRONE_STRIKE").length;
  const cyber = active.filter((m) => m.type === "CYBER_ATTACK").length;
  const underAttack = state.outposts.filter((o) => o.status === "UNDER_ATTACK").length;
  const score = strikes * 3 + cyber * 2 + underAttack * 4;
  if (score === 0) state.threatLevel = "GREEN";
  else if (score <= 4) state.threatLevel = "AMBER";
  else if (score <= 9) state.threatLevel = "RED";
  else state.threatLevel = "BLACK";
}

function pushEvent(ev: Omit<GameEvent, "id" | "timestamp">) {
  state.events.unshift({ ...ev, id: uid("ev"), timestamp: now() });
  if (state.events.length > 60) state.events.length = 60;
}

function factionAiTurn() {
  // Grace period: no rival aggression for the first ~30s so the commander
  // can orient. After that, a measured chance a rival faction launches.
  if (state.tick < 15) return;
  for (const f of FACTIONS) {
    if (f === state.operative.faction) continue; // player faction acts via player
    if (Math.random() > 0.12) continue; // gentler cadence
    const mine = state.outposts.filter((o) => o.faction === f && o.status !== "OFFLINE");
    if (!mine.length) continue;
    const rivals = state.outposts.filter((o) => o.faction !== f && o.status !== "OFFLINE");
    if (!rivals.length) continue;
    // prefer striking the strongest rival for drama
    const tgt = pick(rivals);
    const src = pick(mine);
    const roll = Math.random();
    let type: MissionType;
    if (roll < 0.4) type = "DRONE_STRIKE";
    else if (roll < 0.7) type = "CYBER_ATTACK";
    else type = "ESPIONAGE";
    spawnMission(type, src.id, tgt.id, f);
  }
}

function spawnMission(type: MissionType, sourceId: string, targetId: string, faction: FactionId) {
  const meta = MISSION_META[type];
  const src = state.outposts.find((o) => o.id === sourceId);
  const tgt = state.outposts.find((o) => o.id === targetId);
  if (!src) return;
  const mission: Mission = {
    id: uid("ms"),
    type,
    status: "ACTIVE",
    sourceId,
    targetId,
    faction,
    progress: 0,
    eta: meta.duration,
    startedAt: now(),
    label: `${meta.label} · ${src.name} → ${tgt?.name ?? "?"}`,
  };
  state.missions.unshift(mission);
  if (state.missions.length > 40) state.missions.length = 40;
  if (type === "DRONE_STRIKE" || type === "CYBER_ATTACK") {
    if (tgt) tgt.status = "UNDER_ATTACK";
    pushEvent({
      type: "MISSION",
      message: `${meta.label} launched: ${src.name} → ${tgt?.name ?? "target"}.`,
      severity: "WARN",
      faction,
    });
  } else {
    pushEvent({
      type: "MISSION",
      message: `${meta.label} underway from ${src.name}.`,
      severity: "INFO",
      faction,
    });
  }
}

function progressMissions() {
  for (const m of state.missions) {
    if (m.status !== "ACTIVE") continue;
    const meta = MISSION_META[m.type];
    const inc = (100 / meta.duration) * (TICK_MS / 1000);
    m.progress = Math.min(100, m.progress + inc);
    m.eta = Math.max(0, m.eta - TICK_MS / 1000);
    if (m.progress >= 100) resolveMission(m);
  }
}

function resolveMission(m: Mission) {
  const src = state.outposts.find((o) => o.id === m.sourceId);
  const tgt = state.outposts.find((o) => o.id === m.targetId);
  m.status = "COMPLETE";
  switch (m.type) {
    case "DRONE_STRIKE": {
      if (tgt) {
        const dmg = 14 + Math.round(Math.random() * 12);
        tgt.health = Math.max(0, tgt.health - dmg);
        tgt.uptime = Math.max(0, tgt.uptime - 30000);
        tgt.compute = Math.max(1, tgt.compute - 4);
        if (tgt.health === 0) {
          tgt.status = "OFFLINE";
          pushEvent({
            type: "STRIKE",
            message: `${tgt.name} (${tgt.faction}) OFFLINE — drone strike from ${src?.name ?? "?"}.`,
            severity: "CRITICAL",
            faction: m.faction,
          });
        } else {
          tgt.status = "DEGRADED";
          pushEvent({
            type: "STRIKE",
            message: `${tgt.name} hit for ${dmg} hull damage.`,
            severity: "WARN",
            faction: m.faction,
          });
        }
      }
      break;
    }
    case "CYBER_ATTACK": {
      if (tgt) {
        const stolen = Math.min(tgt.buildPoints, 18 + Math.round(Math.random() * 22));
        tgt.buildPoints = Math.max(0, tgt.buildPoints - stolen);
        tgt.compute = Math.max(1, tgt.compute - 3);
        tgt.status = tgt.health > 0 ? "DEGRADED" : "OFFLINE";
        if (src) src.buildPoints += Math.round(stolen * 0.6);
        pushEvent({
          type: "CYBER",
          message: `Breach on ${tgt.name}: ${stolen} build points exfiltrated.`,
          severity: "WARN",
          faction: m.faction,
        });
      }
      break;
    }
    case "ESPIONAGE": {
      if (tgt) {
        state.factions[tgt.faction].threat = clamp(state.factions[tgt.faction].threat - 6);
        pushEvent({
          type: "ESPIONAGE",
          message: `Sleeper probes embedded in ${tgt.name}. Rival intent mapped.`,
          severity: "INFO",
          faction: m.faction,
        });
      }
      break;
    }
    case "RECON": {
      if (src) {
        src.buildPoints += 6;
        state.factions[m.faction].threat = clamp(state.factions[m.faction].threat + 3);
        pushEvent({
          type: "RECON",
          message: `Orbital recon complete over ${src.name}. Intel refreshed.`,
          severity: "SUCCESS",
          faction: m.faction,
        });
      }
      break;
    }
    case "BUILD": {
      if (tgt) {
        tgt.level += 1;
        tgt.maxHealth += 30;
        tgt.health = Math.min(tgt.maxHealth, tgt.health + 25);
        tgt.compute += tgt.type === "FULL" ? 12 : 4;
        tgt.status = "ONLINE";
        pushEvent({
          type: "BUILD",
          message: `${tgt.name} reinforced to level ${tgt.level}.`,
          severity: "SUCCESS",
          faction: m.faction,
        });
      }
      break;
    }
    case "DEFEND": {
      if (tgt) {
        tgt.health = Math.min(tgt.maxHealth, tgt.health + 20);
        tgt.status = "ONLINE";
        pushEvent({
          type: "DEFEND",
          message: `Shields raised on ${tgt.name}.`,
          severity: "INFO",
          faction: m.faction,
        });
      }
      break;
    }
  }
  // cleanup: remove old completed missions after a while
  state.missions = state.missions.filter(
    (x) => x.status === "ACTIVE" || now() - x.startedAt < 60000
  );
}

function accrueUptime() {
  for (const o of state.outposts) {
    if (o.status === "OFFLINE") {
      // offline outposts slowly auto-reboot so the theatre never fully dies
      if (Math.random() < 0.04) {
        o.health = Math.max(10, o.maxHealth * 0.25);
        o.status = "DEGRADED";
        pushEvent({
          type: "REBOOT",
          message: `${o.name} cold-boot sequence complete — back online at reduced capacity.`,
          severity: "INFO",
          faction: o.faction,
        });
      }
      continue;
    }
    const sec = TICK_MS / 1000;
    o.uptime += sec * 1000;
    const rate = o.type === "FULL" ? 0.8 : 0.3;
    o.buildPoints += rate * sec * (o.health / o.maxHealth);
    // self-repair when not under attack (faster, so the theatre stays alive)
    if (o.status !== "UNDER_ATTACK" && o.health < o.maxHealth) {
      o.health = Math.min(o.maxHealth, o.health + (o.type === "FULL" ? 1.1 : 0.6));
    }
    // recover from degraded
    if (o.status === "DEGRADED" && o.health > 60) o.status = "ONLINE";
  }
}

function ambientEvents() {
  if (Math.random() > 0.35) return;
  const flavors = [
    { type: "COMPUTE", msg: "Verified inference batch sealed on-chain. Integrity nominal.", sev: "INFO" as const },
    { type: "ANOMALY", msg: "Quantum simulation heartbeat drift detected in sector 7.", sev: "WARN" as const },
    { type: "NETWORK", msg: "Browser worker swarm rotated. Uptime fabric stable.", sev: "INFO" as const },
    { type: "INTEL", msg: "Encrypted burst from rival relay — origin triangulated.", sev: "INFO" as const },
    { type: "DRONE", msg: "Perimeter drone formation realigned to night pattern.", sev: "INFO" as const },
    { type: "POWER", msg: "Solar collector output fluctuating. Routing aux power.", sev: "WARN" as const },
  ];
  const f = pick(flavors);
  pushEvent({ type: f.type, message: f.msg, severity: f.sev });
}

/**
 * Synthesize a planet-scale stream of activity pings — strikes, builds,
 * deployments, scans, breaches, and the ever-present TRAFFIC background hum.
 * 60% spawn near an existing outpost (jitter ±3°), 40% over random
 * land-ish latitudes. Each ping lives 5s; the array is capped at 80 (newest).
 */
function spawnActivityPings() {
  const bornAt = now();
  const n = 4 + Math.floor(Math.random() * 7); // 4-10 inclusive
  for (let i = 0; i < n; i++) {
    let lat: number;
    let lng: number;
    if (Math.random() < 0.6 && state.outposts.length > 0) {
      const o = pick(state.outposts);
      lat = o.lat + (Math.random() - 0.5) * 6; // ±3°
      lng = o.lng + (Math.random() - 0.5) * 6;
    } else {
      // land-ish latitudes: -55 to 70, full longitude range
      lat = -55 + Math.random() * 125;
      lng = -180 + Math.random() * 360;
    }
    lat = clamp(lat, -90, 90);
    if (lng > 180) lng -= 360;
    else if (lng < -180) lng += 360;

    const ping: ActivityPing = {
      id: uid("ping"),
      lat,
      lng,
      type: pickWeightedPingType(),
      faction: pick(FACTIONS),
      intensity: 0.3 + Math.random() * 0.7,
      bornAt,
    };
    state.activityPings.push(ping);
  }

  // Prune expired (>5s old).
  const cutoff = bornAt - 5000;
  state.activityPings = state.activityPings.filter((p) => p.bornAt >= cutoff);

  // Cap at 80 — drop the oldest beyond 80. Array is already in chronological
  // order (newest pushed at end), so slice the tail.
  if (state.activityPings.length > 80) {
    state.activityPings = state.activityPings.slice(state.activityPings.length - 80);
  }
}

/**
 * Smoothed random walk for `networkLoad` (actions/sec in millions).
 * Bounded to [0.6, 3.4] M actions/sec, rounded to 1 decimal. Also accrues
 * `totalActions` so the counter climbs realistically every tick.
 */
function updateNetworkLoad() {
  const next = state.networkLoad + (Math.random() - 0.5) * 0.3;
  state.networkLoad = Math.round(clamp(next, 0.6, 3.4) * 10) / 10;
  state.totalActions += Math.round(state.networkLoad * 1_000_000 * (TICK_MS / 1000));
}

function tick() {
  state.tick += 1;
  state.clock = now();
  if (state.tick % 30 === 0) state.sol += 1; // every ~minute advance a "sol"
  accrueUptime();
  progressMissions();
  factionAiTurn();
  ambientEvents();
  spawnActivityPings();
  updateNetworkLoad();
  recalcTerritories();
  recalcFactions();
  recalcThreat();
  io.emit("state", state);
}

// ---------------------------------------------------------------------------
// Client actions
// ---------------------------------------------------------------------------
function handleAction(socket: any, action: ClientAction) {
  try {
    switch (action.kind) {
      case "launch-mission": {
        const src = state.outposts.find((o) => o.id === action.sourceId);
        const tgt = state.outposts.find((o) => o.id === action.targetId);
        if (!src || !tgt) {
          socket.emit("action-result", { ok: false, error: "Invalid source or target." });
          return;
        }
        const meta = MISSION_META[action.missionType];
        if ((action.missionType === "BUILD" || action.missionType === "DEFEND")) {
          // self-targeting; ensure target is source for build, or any friendly for defend
        } else if (src.faction === tgt.faction && action.missionType !== "BUILD" && action.missionType !== "DEFEND") {
          socket.emit("action-result", { ok: false, error: "Cannot strike a friendly outpost." });
          return;
        }
        if (action.missionType === "BUILD") {
          const cost = 40 + src.level * 20;
          if (src.buildPoints < cost) {
            socket.emit("action-result", { ok: false, error: `Need ${cost} build points (have ${Math.floor(src.buildPoints)}).` });
            return;
          }
          src.buildPoints -= cost;
        }
        const targetId = action.missionType === "BUILD" ? src.id : action.targetId;
        spawnMission(action.missionType, src.id, targetId, src.faction);
        socket.emit("action-result", { ok: true });
        break;
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
        pushEvent({
          type: "DEPLOY",
          message: deployMsg,
          severity: "SUCCESS",
          faction: op.faction,
        });
        recalcFactions();
        socket.emit("action-result", { ok: true });
        break;
      }
      case "upgrade-outpost": {
        const o = state.outposts.find((x) => x.id === action.id);
        if (!o) {
          socket.emit("action-result", { ok: false, error: "Outpost not found." });
          return;
        }
        const cost = 50 + o.level * 25;
        if (o.buildPoints < cost) {
          socket.emit("action-result", { ok: false, error: `Need ${cost} build points.` });
          return;
        }
        o.buildPoints -= cost;
        o.level += 1;
        o.maxHealth += 25;
        o.health = Math.min(o.maxHealth, o.health + 20);
        o.compute += o.type === "FULL" ? 10 : 3;
        pushEvent({
          type: "UPGRADE",
          message: `${o.name} upgraded to level ${o.level}.`,
          severity: "SUCCESS",
          faction: o.faction,
        });
        socket.emit("action-result", { ok: true });
        break;
      }
      case "request-briefing": {
        // Engine can't call the LLM (it lives in the Next API). Ask client to fetch
        // from /api/ai/briefing instead. Acknowledge here so the UI can show a hint.
        socket.emit("action-result", { ok: true, note: "Use /api/ai/briefing" });
        break;
      }
    }
  } catch (e: any) {
    socket.emit("action-result", { ok: false, error: e?.message ?? "unknown error" });
  }
}

// ---------------------------------------------------------------------------
// HTTP + Socket.io setup
// ---------------------------------------------------------------------------
const httpServer = createServer((req, res) => {
  // simple health + snapshot endpoint so the Next API can read initial state
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, tick: state.tick }));
    return;
  }
  if (req.url === "/state") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(state));
    return;
  }
  res.writeHead(404);
  res.end("not found");
});

const io = new Server(httpServer, {
  // Use the default engine.io path (/socket.io) so our own HTTP routes
  // (/health, /state) are not intercepted. Caddy still forwards based on
  // the XTransformPort query param.
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 60000,
  pingInterval: 25000,
});

io.on("connection", (socket) => {
  console.log(`[engine] commander connected: ${socket.id}`);
  socket.emit("state", state);
  socket.on("action", (a: ClientAction) => handleAction(socket, a));
  socket.on("disconnect", () => console.log(`[engine] disconnected: ${socket.id}`));
  socket.on("error", (err: any) => console.error(`[engine] socket error`, err));
});

setInterval(tick, TICK_MS);

httpServer.listen(PORT, () => {
  console.log(`[42] game engine listening on :${PORT}`);
});

process.on("SIGTERM", () => httpServer.close(() => process.exit(0)));
process.on("SIGINT", () => httpServer.close(() => process.exit(0)));
