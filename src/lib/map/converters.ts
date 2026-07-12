// ---------------------------------------------------------------------------
// Data converters — domain state → GeoJSON FeatureCollections for WebGL layers.
// Extracted from world-map.tsx for testability and separation of concerns.
// Pure functions: (domain state) → GeoJSON. No MapLibre, no React, no DOM.
// ---------------------------------------------------------------------------

import type { GeoJSON } from "geojson";
import type {
  Outpost,
  FactionId,
  Mission,
  Territory,
  ActivityPing,
} from "@/lib/types";
import { greatCircle, greatCirclePoint, geoCircle, approxAngularDist } from "@/lib/map/geo";
import { FACTION_ICON } from "@/lib/factions";

// Re-export so existing imports from @/lib/map/converters keep working.
export { FACTION_ICON };

/** Outposts → GeoJSON points with rich properties for data-driven styling. */
export function outpostsToGeoJSON(outposts: Outpost[], operativeFaction: FactionId, selectedId: string | null): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: outposts.map((op) => {
      const healthPct = op.maxHealth > 0 ? Math.max(0, Math.min(1, op.health / op.maxHealth)) : 0;
      return {
        type: "Feature" as const,
        properties: {
          id: op.id,
          name: op.name,
          faction: op.faction,
          type: op.type,
          level: op.level,
          healthPct,
          status: op.status,
          isMine: op.faction === operativeFaction ? 1 : 0,
          selected: op.id === selectedId ? 1 : 0,
          underAttack: op.status === "UNDER_ATTACK" ? 1 : 0,
          offline: op.status === "OFFLINE" ? 1 : 0,
          icon: FACTION_ICON[op.faction],
        },
        geometry: { type: "Point", coordinates: [op.lng, op.lat] },
      };
    }),
  };
}

/** Territory halos → GeoJSON polygons (FULL outposts only). */
export function halosToGeoJSON(outposts: Outpost[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: outposts
      .filter((o) => o.type === "FULL" && o.status !== "OFFLINE")
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
export function missionsToGeoJSON(missions: Mission[], outposts: Outpost[]): {
  aggressive: GeoJSON.FeatureCollection;
  passive: GeoJSON.FeatureCollection;
} {
  const active = missions.filter((m) => m.status === "ACTIVE" || m.status === "COMPLETE");
  const aggressive: GeoJSON.Feature[] = [];
  const passive: GeoJSON.Feature[] = [];
  for (const m of active) {
    const src = outposts.find((o) => o.id === m.sourceId);
    const tgt = outposts.find((o) => o.id === m.targetId);
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
export function progressHeadsToGeoJSON(missions: Mission[], outposts: Outpost[]): GeoJSON.FeatureCollection {
  const active = missions.filter((m) => m.status === "ACTIVE");
  return {
    type: "FeatureCollection",
    features: active.map((m) => {
      const src = outposts.find((o) => o.id === m.sourceId);
      const tgt = outposts.find((o) => o.id === m.targetId);
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
export function missionImpactsToGeoJSON(missions: Mission[], outposts: Outpost[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const m of missions) {
    if (m.status !== "ACTIVE") continue;
    if (m.type !== "DRONE_STRIKE" && m.type !== "CYBER_ATTACK") continue;
    const tgt = outposts.find((o) => o.id === m.targetId);
    if (!tgt) continue;
    features.push({
      type: "Feature" as const,
      properties: { id: m.id, type: m.type, progress: m.progress },
      geometry: { type: "Point", coordinates: [tgt.lng, tgt.lat] },
    });
  }
  return { type: "FeatureCollection", features };
}
