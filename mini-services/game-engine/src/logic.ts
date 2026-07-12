// ---------------------------------------------------------------------------
// Game logic — the tick loop's pure-ish functions that mutate GameState.
// Extracted from index.ts so game rules can be reasoned about without the
// socket.io transport.
// ---------------------------------------------------------------------------

import {
  type GameState,
  type GameEvent,
  type Outpost,
  type Mission,
  type FactionId,
  type MissionType,
  type ThreatLevel,
  FACTIONS,
  MISSION_META,
} from "../../../src/lib/types";
import { uid, now, clamp, pick } from "./state";
import { pickWeightedPingType } from "./data";

export const TICK_MS = 2000; // game loop cadence

/** Equirectangular angular distance (degrees) between two lat/lng points.
 *  Good-enough approximation for the proximity-weighted influence calc. */
export function angularDist(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = lat1 - lat2;
  let dLng = lng1 - lng2;
  if (dLng > 180) dLng -= 360;
  else if (dLng < -180) dLng += 360;
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

export function pushEvent(state: GameState, ev: Omit<GameEvent, "id" | "timestamp">) {
  state.events.unshift({ ...ev, id: uid("ev"), timestamp: now() });
  if (state.events.length > 60) state.events.length = 60;
}

export function recalcFactions(state: GameState) {
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
export function recalcTerritories(state: GameState) {
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
        pushEvent(state, {
          type: "TERRITORY",
          message: `${t.name} now under ${newController} control.`,
          severity: "SUCCESS",
          faction: newController,
        });
      } else {
        pushEvent(state, {
          type: "TERRITORY",
          message: `${t.name} control CONTESTED.`,
          severity: "WARN",
        });
      }
    }
  }
}

export function recalcThreat(state: GameState) {
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

export function factionAiTurn(state: GameState) {
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
    spawnMission(state, type, src.id, tgt.id, f);
  }
}

export function spawnMission(state: GameState, type: MissionType, sourceId: string, targetId: string, faction: FactionId) {
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
    pushEvent(state, {
      type: "MISSION",
      message: `${meta.label} launched: ${src.name} → ${tgt?.name ?? "target"}.`,
      severity: "WARN",
      faction,
    });
  } else {
    pushEvent(state, {
      type: "MISSION",
      message: `${meta.label} underway from ${src.name}.`,
      severity: "INFO",
      faction,
    });
  }
}

export function progressMissions(state: GameState) {
  for (const m of state.missions) {
    if (m.status !== "ACTIVE") continue;
    const meta = MISSION_META[m.type];
    const inc = (100 / meta.duration) * (TICK_MS / 1000);
    m.progress = Math.min(100, m.progress + inc);
    m.eta = Math.max(0, m.eta - TICK_MS / 1000);
    if (m.progress >= 100) resolveMission(state, m);
  }
}

export function resolveMission(state: GameState, m: Mission) {
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
          pushEvent(state, {
            type: "STRIKE",
            message: `${tgt.name} (${tgt.faction}) OFFLINE — drone strike from ${src?.name ?? "?"}.`,
            severity: "CRITICAL",
            faction: m.faction,
          });
        } else {
          tgt.status = "DEGRADED";
          pushEvent(state, {
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
        pushEvent(state, {
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
        pushEvent(state, {
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
        pushEvent(state, {
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
        pushEvent(state, {
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
        pushEvent(state, {
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

export function accrueUptime(state: GameState) {
  for (const o of state.outposts) {
    if (o.status === "OFFLINE") {
      // offline outposts slowly auto-reboot so the theatre never fully dies
      if (Math.random() < 0.04) {
        o.health = Math.max(10, o.maxHealth * 0.25);
        o.status = "DEGRADED";
        pushEvent(state, {
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

export function ambientEvents(state: GameState) {
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
  pushEvent(state, { type: f.type, message: f.msg, severity: f.sev });
}

/**
 * Synthesize a planet-scale stream of activity pings — strikes, builds,
 * deployments, scans, breaches, and the ever-present TRAFFIC background hum.
 * 60% spawn near an existing outpost (jitter ±3°), 40% over random
 * land-ish latitudes. Each ping lives 5s; the array is capped at 80 (newest).
 */
export function spawnActivityPings(state: GameState) {
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

    const ping = {
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
export function updateNetworkLoad(state: GameState) {
  const next = state.networkLoad + (Math.random() - 0.5) * 0.3;
  state.networkLoad = Math.round(clamp(next, 0.6, 3.4) * 10) / 10;
  state.totalActions += Math.round(state.networkLoad * 1_000_000 * (TICK_MS / 1000));
}

/**
 * Run one full game tick: accrue uptime, progress missions, run faction AI,
 * emit ambient events, spawn pings, update network load, recompute territories
 * + factions + threat. Mutates `state` in place.
 */
export function tick(state: GameState) {
  state.tick += 1;
  state.clock = now();
  if (state.tick % 30 === 0) state.sol += 1; // every ~minute advance a "sol"
  accrueUptime(state);
  progressMissions(state);
  factionAiTurn(state);
  ambientEvents(state);
  spawnActivityPings(state);
  updateNetworkLoad(state);
  recalcTerritories(state);
  recalcFactions(state);
  recalcThreat(state);
}
