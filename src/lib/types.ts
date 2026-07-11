// ===== 42 — Shared domain types =====
// These types are the contract between the websocket game engine (port 3003),
// the API routes, and the React client. Keep them framework-agnostic.

export type FactionId = "FANG" | "HAMMER" | "RESOLUTE";

export const FACTIONS: FactionId[] = ["FANG", "HAMMER", "RESOLUTE"];

export type OutpostType = "FULL" | "TACTICAL" | "SAFEHOUSE";

export type OutpostStatus = "ONLINE" | "DEGRADED" | "OFFLINE" | "UNDER_ATTACK";

export type MissionType =
  | "DRONE_STRIKE"
  | "CYBER_ATTACK"
  | "ESPIONAGE"
  | "RECON"
  | "BUILD"
  | "DEFEND";

export type MissionStatus = "QUEUED" | "ACTIVE" | "COMPLETE" | "FAILED";

export type EventSeverity = "INFO" | "WARN" | "CRITICAL" | "SUCCESS";

export interface Outpost {
  id: string;
  name: string;
  type: OutpostType;
  faction: FactionId;
  lat: number;
  lng: number;
  level: number;
  health: number;
  maxHealth: number;
  compute: number; // TFLOPS contributed to faction
  uptime: number; // seconds
  buildPoints: number; // accrued from uptime, spent on upgrades
  status: OutpostStatus;
  establishedAt: number; // epoch ms
}

export interface Faction {
  id: FactionId;
  name: string;
  motto: string;
  strength: number; // 0-100 aggregate
  compute: number; // total TFLOPS
  territories: number; // count of controlled regions
  outposts: number;
  threat: number; // 0-100 perceived threat to others
}

export interface Mission {
  id: string;
  type: MissionType;
  status: MissionStatus;
  sourceId: string; // outpost id
  targetId: string; // outpost id (or self for BUILD/DEFEND)
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
}

// ===== Territory system =====
// The globe is partitioned into named geographic regions. Factions fight for
// control of these regions by holding the strongest outposts within them.
// Control is recomputed every tick from aggregate outpost influence (level +
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
 * Per-outpost "quick brief" — a short, AI-generated situational assessment
 * for a single outpost (own = unit readiness; rival = intel snapshot).
 * Triggered from the OutpostDetailCard "REQUEST PRIORITY BRIEFING" action.
 */
export type OutpostBriefPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface OutpostBrief {
  /** 1–2 sentence situational assessment of this specific outpost. */
  assessment: string;
  /** 1 sentence recommended action (offensive for rivals, defensive/build for own). */
  recommendation: string;
  /** Priority band — drives the badge color. */
  priority: OutpostBriefPriority;
  /** 0–100 model confidence. */
  confidence: number;
  /** Estimated VOTC value at stake (compute/territory denominated in network currency). */
  votcAtStake: number;
  /** Faction token denomination this outpost accrues/spends (FANG | HAMMER | RESOLUTE). */
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

export const FACTION_TOKEN: Record<FactionId, string> = {
  FANG: "FANG",
  HAMMER: "HAMMER",
  RESOLUTE: "RESOLUTE",
};

export interface GameState {
  tick: number;
  sol: number; // simulated "day" counter
  clock: number; // epoch ms
  factions: Record<FactionId, Faction>;
  outposts: Outpost[];
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
}

// ===== Client → Server socket actions =====
export type ClientAction =
  | { kind: "launch-mission"; missionType: MissionType; sourceId: string; targetId: string }
  | { kind: "place-outpost"; type: OutpostType; lat: number; lng: number; name?: string }
  | { kind: "upgrade-outpost"; id: string }
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
    desc: "Kinetic drone swarm assault. Damages target outpost, reduces health and uptime.",
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
    desc: "Deploy sleeper probes. Reveals rival mission queue and lowers their threat rating.",
  },
  RECON: {
    label: "RECON",
    verb: "Scan",
    duration: 10,
    cost: 12,
    desc: "Orbital sweep of a sector. Boosts your faction threat intel and morale.",
  },
  BUILD: {
    label: "BUILD",
    verb: "Construct",
    duration: 16,
    cost: 0,
    desc: "Reinforce an outpost. Costs build points, raises level and max health.",
  },
  DEFEND: {
    label: "DEFEND",
    verb: "Fortify",
    duration: 12,
    cost: 0,
    desc: "Raise shields on an outpost. Temporarily blocks incoming strikes.",
  },
};

export const FACTION_META: Record<FactionId, { name: string; motto: string }> = {
  FANG: { name: "FANG", motto: "Hunt as one." },
  HAMMER: { name: "HAMMER", motto: "Forge. Strike. Endure." },
  RESOLUTE: { name: "RESOLUTE", motto: "Steadfast, vigilant." },
};
