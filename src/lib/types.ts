// ===== 42 — Shared domain types =====
// These types are the contract between the websocket game engine (port 3003),
// the API routes, and the React client. Keep them framework-agnostic.

export type FactionId = "FANG" | "HAMMER" | "RESOLUTE";

export const FACTIONS: FactionId[] = ["FANG", "HAMMER", "RESOLUTE"];

export type GarrisonType = "Safehouse" | "Tactical Safehouse";

export type GarrisonStatus = "ONLINE" | "DEGRADED" | "OFFLINE" | "UNDER_ATTACK";

export type MissionType =
  | "DRONE_STRIKE"
  | "CYBER_ATTACK"
  | "ESPIONAGE"
  | "RECON"
  | "BUILD"
  | "DEFEND";

export type MissionStatus = "QUEUED" | "ACTIVE" | "COMPLETE" | "FAILED";

export type EventSeverity = "INFO" | "WARN" | "CRITICAL" | "SUCCESS";

export interface Garrison {
  id: string;
  name: string;
  type: GarrisonType;
  faction: FactionId;
  lat: number;
  lng: number;
  level: number;
  health: number;
  maxHealth: number;
  compute: number; // TFLOPS contributed to faction
  uptime: number; // seconds
  buildPoints: number; // accrued from uptime, spent on upgrades
  status: GarrisonStatus;
  establishedAt: number; // epoch ms
}

export interface Faction {
  id: FactionId;
  name: string;
  motto: string;
  strength: number; // 0-100 aggregate
  compute: number; // total TFLOPS
  territories: number; // count of controlled regions
  garrisons: number;
  threat: number; // 0-100 perceived threat to others
}

export interface Mission {
  id: string;
  type: MissionType;
  status: MissionStatus;
  sourceId: string; // garrison id
  targetId: string; // garrison id (or self for BUILD/DEFEND)
  faction: FactionId;
  progress: number; // 0-100
  eta: number; // seconds remaining
  startedAt: number;
  label: string;
}

export interface GameEvent {
  id: string;
  type: string;
  timestamp: number;
  message: string;
  severity: EventSeverity;
  faction?: FactionId;
}

export type ThreatLevel = "GREEN" | "AMBER" | "RED" | "BLACK";

export interface Operative {
  id: string;
  codename: string;
  tier: "BASIC" | "ELITE" | "ARCHON";
  faction: FactionId;
  authority: number; // 0-100
  /** Wallet balances — per-faction tokens + the universal VOTC currency.
   * Attack missions cost the TARGET faction's tokens. Defend costs your own
   * faction's tokens. BUILD/UPGRADE costs VOTC. Accrued passively from
   * garrison uptime + mission rewards. */
  wallet: {
    VOTC: number;
    FANG: number;
    HAMMER: number;
    RESOLUTE: number;
  };
}

// ===== Intel ledger =====
// Successful ESPIONAGE / RECON missions against rival garrisons reveal them
// as "intel targets" — appearing in the Strike Console's target list with
// their health/compute/level exposed. Intel expires after a TTL so the
// theatre reflects only recently-scouted rivals. The ledger starts EMPTY
// (no seeding) and fills organically through gameplay.
export interface IntelEntry {
  /** The scouted garrison id. */
  targetId: string;
  /** The faction that performed the recon (owns the intel). */
  ownerFaction: FactionId;
  /** Epoch ms — when the intel was gathered. Used for TTL expiry. */
  revealedAt: number;
  /** The mission type that produced this intel. */
  source: "ESPIONAGE" | "RECON";
}

// ===== Territory system =====
// The globe is partitioned into named geographic regions. Factions fight for
// control of these regions by holding the strongest garrisons within them.
// Control is recomputed every tick from aggregate garrison influence (level +
// health + proximity to the territory centroid). When the leading faction
// changes, an event is pushed and the region's fill flips on the globe.
export interface Territory {
  id: string;
  name: string;
  /** Polygon outline as [lng, lat][] (closed ring, no repeated last point). */
  polygon: [number, number][];
  /** Centroid [lng, lat] for label / glyph placement. */
  center: [number, number];
  /** Current controlling faction, or null when contested. */
  controller: FactionId | null;
  /** 0–100 dominance of the controller (how far ahead of the runner-up). */
  control: number;
  /** Per-faction influence sum inside this territory. */
  influence: Record<FactionId, number>;
}

// ===== Activity pings (scale: "millions of actions") =====
// Transient points representing live network actions across the globe — strikes
// launched, builds sealed, deployments, breaches, scans. The engine synthesizes
// a stream of these every tick to visualize planet-scale activity. Each ping
// lives a few seconds then fades. On the globe they render as expanding rings
// (a "heat" / sonar layer) so the world feels alive at multi-million-user scale.
export interface ActivityPing {
  id: string;
  lat: number;
  lng: number;
  /** 'STRIKE' | 'BUILD' | 'DEPLOY' | 'SCAN' | 'BREACH' | 'TRAFFIC' */
  type: string;
  faction: FactionId;
  /** 0–1 visual intensity (drives ring size + opacity). */
  intensity: number;
  /** epoch ms — used to age the ping out. */
  bornAt: number;
}

export interface Recommendation {
  id: string;
  title: string;
  rationale: string;
  action: string; // machine action, e.g. "launch:DRONE_STRIKE:src:tgt"
  confidence: number; // 0-100
}

/**
 * Per-garrison "quick brief" — a short, AI-generated situational assessment
 * for a single garrison (own = unit readiness; rival = intel snapshot).
 * Triggered from the GarrisonDetailCard "REQUEST PRIORITY BRIEFING" action.
 */
export type GarrisonBriefPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface GarrisonBrief {
  /** 1–2 sentence situational assessment of this specific garrison. */
  assessment: string;
  /** 1 sentence recommended action (offensive for rivals, defensive/build for own). */
  recommendation: string;
  /** Priority band — drives the badge color. */
  priority: GarrisonBriefPriority;
  /** 0–100 model confidence. */
  confidence: number;
  /** Estimated VOTC value at stake (compute/territory denominated in network currency). */
  votcAtStake: number;
  /** Faction token denomination this garrison accrues/spends (FANG | HAMMER | RESOLUTE). */
  token: FactionId;
  generatedAt: number;
}

export interface Briefing {
  summary: string;
  threatAssessment: string;
  recommendations: Recommendation[];
  generatedAt: number;
}

// ===== Currency =====
// The network's universal currency is VOTC. Each faction also mints its own
// token — named identically to the faction (FANG, HAMMER, RESOLUTE) — used
// for intra-faction upgrades, build-point conversion, and tribute.
export const NETWORK_CURRENCY = "VOTC" as const;

// Faction constants (FACTION_META, FACTION_TOKEN, etc.) now live in
// @/lib/factions — the single source of truth. Re-exported here for backward
// compatibility with existing imports from @/lib/types.
export { FACTION_TOKEN, FACTION_META } from "@/lib/factions";

export interface GameState {
  tick: number;
  sol: number; // simulated "day" counter
  clock: number; // epoch ms
  factions: Record<FactionId, Faction>;
  garrisons: Garrison[];
  missions: Mission[];
  events: GameEvent[];
  threatLevel: ThreatLevel;
  operative: Operative;
  briefing?: Briefing;
  /** Named geographic regions factions fight to control. */
  territories: Territory[];
  /** Transient live-action points (planet-scale activity visualization). */
  activityPings: ActivityPing[];
  /** Simulated global actions-per-second (millions) — the network load metric. */
  networkLoad: number;
  /** Total actions processed since boot (monotonic counter). */
  totalActions: number;
  /** Intel ledger — rival garrisons revealed via ESPIONAGE/RECON. Starts empty;
   * fills organically through gameplay. TTL-expired entries are pruned each tick. */
  intel: IntelEntry[];
}

// ===== Currency =====
// The network's universal currency is VOTC (used for BUILD/UPGRADE only).
// Each faction also mints its own token (FANG | HAMMER | RESOLUTE) — attack
// missions cost the TARGET faction's token, defend costs your OWN faction's
// token. This creates the strategic loop: to attack HAMMER you must hold
// HAMMER tokens (earned by defending against them or via intel trading).
export type CurrencyId = "VOTC" | FactionId;

/**
 * Resolve which currency a given mission costs, per the token economy:
 *   • ATTACK missions (DRONE_STRIKE, CYBER_ATTACK, ESPIONAGE) → TARGET faction's token
 *   • DEFEND → SOURCE (your) faction's token
 *   • RECON → SOURCE (your) faction's token
 *   • BUILD → VOTC
 */
export function missionCurrency(
  type: MissionType,
  sourceFaction: FactionId,
  targetFaction: FactionId
): CurrencyId {
  switch (type) {
    case "DRONE_STRIKE":
    case "CYBER_ATTACK":
    case "ESPIONAGE":
      return targetFaction;
    case "DEFEND":
    case "RECON":
      return sourceFaction;
    case "BUILD":
      return "VOTC";
  }
}

// ===== Client → Server socket actions =====
export type ClientAction =
  | { kind: "launch-mission"; missionType: MissionType; sourceId: string; targetId: string }
  | { kind: "place-garrison"; type: GarrisonType; lat: number; lng: number; name?: string }
  | { kind: "upgrade-garrison"; id: string }
  | { kind: "request-briefing" };

// ===== Helpers =====
export const MISSION_META: Record<
  MissionType,
  { label: string; verb: string; duration: number; cost: number; desc: string }
> = {
  DRONE_STRIKE: {
    label: "DRONE STRIKE",
    verb: "Strike",
    duration: 14,
    cost: 40,
    desc: "Kinetic drone swarm assault. Damages target garrison, reduces health and uptime.",
  },
  CYBER_ATTACK: {
    label: "CYBER ATTACK",
    verb: "Breach",
    duration: 18,
    cost: 30,
    desc: "Intrusion on target node. Steals build points and degrades compute output.",
  },
  ESPIONAGE: {
    label: "ESPIONAGE",
    verb: "Infiltrate",
    duration: 22,
    cost: 20,
    desc: "Sleeper probes. Costs target faction token. Reveals the rival as an intel target for strikes.",
  },
  RECON: {
    label: "RECON",
    verb: "Scan",
    duration: 10,
    cost: 12,
    desc: "Orbital sweep of a sector. Costs your faction token. Boosts threat intel and morale.",
  },
  BUILD: {
    label: "BUILD",
    verb: "Construct",
    duration: 16,
    cost: 25,
    desc: "Reinforce a garrison. Costs VOTC, raises level and max health.",
  },
  DEFEND: {
    label: "DEFEND",
    verb: "Fortify",
    duration: 12,
    cost: 15,
    desc: "Raise shields on a garrison. Costs your faction token. Blocks incoming strikes.",
  },
};

// FACTION_META is re-exported from @/lib/factions (see above, near FACTION_TOKEN).
