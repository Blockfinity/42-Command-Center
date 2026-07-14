// ---------------------------------------------------------------------------
// Data converters — domain state → GeoJSON FeatureCollections for WebGL layers.
// Extracted from world-map.tsx for testability and separation of concerns.
// Pure functions: (domain state) → GeoJSON. No MapLibre, no React, no DOM.
// ---------------------------------------------------------------------------

import type { GeoJSON } from "geojson";
import type {
  Garrison,
  FactionId,
  Mission,
  Territory,
  ActivityPing,
} from "@/lib/types";
import { greatCircle, greatCirclePoint, geoCircle, approxAngularDist } from "@/lib/map/geo";
import { FACTION_ICON } from "@/lib/factions";

// Re-export so existing imports from @/lib/map/converters keep working.
export { FACTION_ICON };

// ---- Alphanumeric unit codes (SurveilTrack-style: FNG-3300-NYC) ----
// Format: {faction 3-letter}-{4-digit}-{3-letter region}. Deterministic per
// garrison id so the code is stable across reconnects/reloads.
const FACTION_CODE: Record<FactionId, string> = {
  FANG: "FNG",
  HAMMER: "HMR",
  RESOLUTE: "RSL",
};

/** Coarse lat/lng → 3-letter region code (for the unit-code suffix). */
function regionCode(lat: number, lng: number): string {
  if (lng < -100) return lat > 35 ? "SEA" : lat > 15 ? "LAX" : "MEX";
  if (lng < -60) return lat > 35 ? "NYC" : lat > -15 ? "MIA" : "SAO";
  if (lng < -20) return lat > 35 ? "LON" : "CAI";
  if (lng < 20) return lat > 35 ? "BER" : lat > 0 ? "CAI" : "JNB";
  if (lng < 60) return lat > 50 ? "MOW" : lat > 25 ? "DXB" : "BOM";
  if (lng < 100) return lat > 35 ? "BEI" : "SIN";
  if (lng < 140) return lat > 35 ? "TYO" : "MNL";
  return lat > -30 ? "SYD" : "AKL";
}

/** Stable 4-digit number (1000–9999) from a string id hash. */
function hash4(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return 1000 + (Math.abs(h) % 9000);
}

/** Build the SurveilTrack-style unit code, e.g. "FNG-3300-NYC". */
export function garrisonUnitCode(op: Garrison): string {
  return `${FACTION_CODE[op.faction]}-${hash4(op.id)}-${regionCode(op.lat, op.lng)}`;
}

/** Garrisons → GeoJSON points with rich properties for data-driven styling. */
export function garrisonsToGeoJSON(garrisons: Garrison[], operativeFaction: FactionId, selectedId: string | null): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: garrisons.map((op) => {
      const healthPct = op.maxHealth > 0 ? Math.max(0, Math.min(1, op.health / op.maxHealth)) : 0;
      const computePct = Math.max(0, Math.min(1, op.compute / 120)); // ~120 TFLOPS = 100%
      const uptimeHr = Math.floor(op.uptime / 3600);
      return {
        type: "Feature" as const,
        properties: {
          id: op.id,
          name: op.name,
          faction: op.faction,
          type: op.type,
          level: op.level,
          healthPct,
          computePct,
          uptimeHr,
          status: op.status,
          isMine: op.faction === operativeFaction ? 1 : 0,
          selected: op.id === selectedId ? 1 : 0,
          underAttack: op.status === "UNDER_ATTACK" ? 1 : 0,
          offline: op.status === "OFFLINE" ? 1 : 0,
          icon: FACTION_ICON[op.faction],
          code: garrisonUnitCode(op),
        },
        geometry: { type: "Point", coordinates: [op.lng, op.lat] },
      };
    }),
  };
}

/** Territory halos → GeoJSON polygons (Safehouse garrisons only). */
export function halosToGeoJSON(garrisons: Garrison[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: garrisons
      .filter((o) => o.type === "Safehouse" && o.status !== "OFFLINE")
      .map((o) => ({
        type: "Feature" as const,
        properties: {
          faction: o.faction,
          level: o.level,
          dashed: o.faction !== "FANG" ? 1 : 0,
        },
        geometry: geoCircle([o.lng, o.lat], 7 + o.level * 1.3),
      })),
  };
}

/** Mission vectors → great-circle arcs, split into aggressive / passive. */
export function missionsToGeoJSON(missions: Mission[], garrisons: Garrison[]): {
  aggressive: GeoJSON.FeatureCollection;
  passive: GeoJSON.FeatureCollection;
} {
  const active = missions.filter((m) => m.status === "ACTIVE" || m.status === "COMPLETE");
  const aggressive: GeoJSON.Feature[] = [];
  const passive: GeoJSON.Feature[] = [];
  for (const m of active) {
    const src = garrisons.find((o) => o.id === m.sourceId);
    const tgt = garrisons.find((o) => o.id === m.targetId);
    if (!src || !tgt) continue;
    const arc = greatCircle([src.lng, src.lat], [tgt.lng, tgt.lat]);
    const isAgg = m.type === "DRONE_STRIKE" || m.type === "CYBER_ATTACK";
    const feat: GeoJSON.Feature = {
      type: "Feature",
      properties: { status: m.status, progress: m.progress, type: m.type },
      geometry: { type: "LineString", coordinates: arc },
    };
    (isAgg ? aggressive : passive).push(feat);
  }
  return {
    aggressive: { type: "FeatureCollection", features: aggressive },
    passive: { type: "FeatureCollection", features: passive },
  };
}

/** Active-mission progress heads → points sampled along great-circle arcs. */
export function progressHeadsToGeoJSON(missions: Mission[], garrisons: Garrison[]): GeoJSON.FeatureCollection {
  const active = missions.filter((m) => m.status === "ACTIVE");
  return {
    type: "FeatureCollection",
    features: active.map((m) => {
      const src = garrisons.find((o) => o.id === m.sourceId);
      const tgt = garrisons.find((o) => o.id === m.targetId);
      if (!src || !tgt) return null;
      const t = Math.max(0, Math.min(1, m.progress / 100));
      const pos = greatCirclePoint([src.lng, src.lat], [tgt.lng, tgt.lat], t);
      return {
        type: "Feature" as const,
        properties: { id: m.id, type: m.type, aggressive: m.type === "DRONE_STRIKE" || m.type === "CYBER_ATTACK" ? 1 : 0 },
        geometry: { type: "Point", coordinates: pos },
      };
    }).filter(Boolean) as GeoJSON.Feature[],
  };
}

/**
 * Territories → GeoJSON polygons for the territory control visualization.
 * Closes the polygon ring (the domain model stores "no repeated last point").
 */
export function territoriesToGeoJSON(territories: Territory[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: territories.map((t) => {
      const ring: [number, number][] =
        t.polygon.length > 0 && (t.polygon[0][0] !== t.polygon[t.polygon.length - 1][0] ||
                                 t.polygon[0][1] !== t.polygon[t.polygon.length - 1][1])
          ? [...t.polygon, t.polygon[0]]
          : t.polygon;
      return {
        type: "Feature" as const,
        properties: {
          id: t.id,
          name: t.name,
          controller: t.controller ?? "",
          control: t.control,
          isContested: t.controller ? 0 : 1,
        },
        geometry: { type: "Polygon", coordinates: [ring] },
      };
    }),
  };
}

/**
 * Activity pings → GeoJSON points with computed `age` (0..1, where 0 = just
 * born, 1 = expiring). Pings older than 5s (age ≥ 1) or farther than 100° from
 * the map center are culled to bound render cost.
 */
export function pingsToGeoJSON(
  pings: ActivityPing[],
  mapCenter: { lng: number; lat: number },
  now: number,
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const p of pings) {
    // Engine prunes pings at 5s but ticks every 2s, so effective max age is
    // ~7s. Use a 9000ms window with margin so pings never hit age=1 before the
    // engine recycles them — prevents flicker between socket updates.
    const age = Math.max(0, Math.min(1, (now - p.bornAt) / 9000));
    if (age >= 1) continue;
    if (approxAngularDist(mapCenter.lng, mapCenter.lat, p.lng, p.lat) > 100) continue;
    features.push({
      type: "Feature" as const,
      properties: {
        id: p.id,
        type: p.type,
        faction: p.faction,
        intensity: p.intensity,
        age,
      },
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
    });
  }
  return { type: "FeatureCollection", features };
}

/**
 * Active aggressive mission impact points — the TARGET endpoint of each
 * ACTIVE strike/cyber-attack mission. Rendered as a pulsing circle so the
 * user can see where blows are about to land.
 */
export function missionImpactsToGeoJSON(missions: Mission[], garrisons: Garrison[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const m of missions) {
    if (m.status !== "ACTIVE") continue;
    if (m.type !== "DRONE_STRIKE" && m.type !== "CYBER_ATTACK") continue;
    const tgt = garrisons.find((o) => o.id === m.targetId);
    if (!tgt) continue;
    features.push({
      type: "Feature" as const,
      properties: { id: m.id, type: m.type, progress: m.progress },
      geometry: { type: "Point", coordinates: [tgt.lng, tgt.lat] },
    });
  }
  return { type: "FeatureCollection", features };
}
