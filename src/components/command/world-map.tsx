"use client";

import * as React from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { feature } from "topojson-client";
import type { FeatureCollection, Geometry, GeoJSON } from "geojson";
import worldTopo from "world-atlas/countries-10m.json";
import type {
  GameState,
  Outpost,
  FactionId,
  Mission,
  Territory,
  ActivityPing,
} from "@/lib/types";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// PERFORMANCE / SCALING NOTES
// ---------------------------------------------------------------------------
// At true scale, outposts cluster into region aggregates, pings are downsampled
// by viewport, and the engine would emit deltas. This client renders the visible
// hemisphere only — pings outside ~100° of map center are dropped (equirectangular
// distance check), mission arcs are only built for ACTIVE/COMPLETE missions, and
// outpost clustering collapses dense regions into single circle+count markers
// below zoom 5. The rAF animation loops are throttled to 12–20fps so the render
// cost stays bounded even with hundreds of moving pings.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// World data (computed once at module scope)
// ---------------------------------------------------------------------------
const worldFeat = feature(
  worldTopo as any,
  (worldTopo as any).objects.countries
) as unknown as FeatureCollection<Geometry>;

/** Graticule line features every 15°. */
function makeGraticule(step: number): GeoJSON.FeatureCollection {
  const lines: GeoJSON.Feature[] = [];
  for (let lng = -180; lng <= 180; lng += step) {
    const coords: [number, number][] = [];
    for (let lat = -85; lat <= 85; lat += 2) coords.push([lng, lat]);
    lines.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } });
  }
  for (let lat = -75; lat <= 75; lat += step) {
    const coords: [number, number][] = [];
    for (let lng = -180; lng <= 180; lng += 2) coords.push([lng, lat]);
    lines.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } });
  }
  return { type: "FeatureCollection", features: lines };
}
const graticuleFeat = makeGraticule(15);

const oceanFeature: GeoJSON.Feature = {
  type: "Feature",
  properties: {},
  geometry: { type: "Polygon", coordinates: [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]]] },
};

// ---------------------------------------------------------------------------
// Geo helpers
// ---------------------------------------------------------------------------

/** Spherical linear interpolation between two [lng,lat] points → great-circle arc. */
function greatCircle(a: [number, number], b: [number, number], n = 48): [number, number][] {
  const toCart = ([lng, lat]: [number, number]) => {
    const rl = (lng * Math.PI) / 180, p = (lat * Math.PI) / 180;
    return [Math.cos(p) * Math.cos(rl), Math.cos(p) * Math.sin(rl), Math.sin(p)];
  };
  const fromCart = ([x, y, z]: number[]) =>
    [(Math.atan2(y, x) * 180) / Math.PI, (Math.asin(Math.max(-1, Math.min(1, z))) * 180) / Math.PI] as [number, number];
  const ca = toCart(a), cb = toCart(b);
  const dot = ca[0] * cb[0] + ca[1] * cb[1] + ca[2] * cb[2];
  const omega = Math.acos(Math.min(1, Math.max(-1, dot)));
  if (omega < 0.0001) return [a, b];
  const sinO = Math.sin(omega);
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const k1 = Math.sin((1 - t) * omega) / sinO;
    const k2 = Math.sin(t * omega) / sinO;
    pts.push(fromCart([k1 * ca[0] + k2 * cb[0], k1 * ca[1] + k2 * cb[1], k1 * ca[2] + k2 * cb[2]]));
  }
  return pts;
}

/** Sample a point at fraction t (0..1) along a great-circle arc. */
function greatCirclePoint(a: [number, number], b: [number, number], t: number): [number, number] {
  const toCart = ([lng, lat]: [number, number]) => {
    const rl = (lng * Math.PI) / 180, p = (lat * Math.PI) / 180;
    return [Math.cos(p) * Math.cos(rl), Math.cos(p) * Math.sin(rl), Math.sin(p)];
  };
  const fromCart = ([x, y, z]: number[]) =>
    [(Math.atan2(y, x) * 180) / Math.PI, (Math.asin(Math.max(-1, Math.min(1, z))) * 180) / Math.PI] as [number, number];
  const ca = toCart(a), cb = toCart(b);
  const dot = ca[0] * cb[0] + ca[1] * cb[1] + ca[2] * cb[2];
  const omega = Math.acos(Math.min(1, Math.max(-1, dot)));
  if (omega < 0.0001) return a;
  const sinO = Math.sin(omega);
  const k1 = Math.sin((1 - t) * omega) / sinO;
  const k2 = Math.sin(t * omega) / sinO;
  return fromCart([k1 * ca[0] + k2 * cb[0], k1 * ca[1] + k2 * cb[1], k1 * ca[2] + k2 * cb[2]]);
}

/** Geographic circle polygon (for territory halos). */
function geoCircle(center: [number, number], radiusDeg: number, n = 48): GeoJSON.Polygon {
  const [clng, clat] = center;
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const brg = (i / n) * 2 * Math.PI;
    const dLat = (radiusDeg * Math.cos(brg)) / 1.0;
    const dLng = (radiusDeg * Math.sin(brg)) / Math.cos((clat * Math.PI) / 180);
    pts.push([clng + dLng, clat + dLat]);
  }
  return { type: "Polygon", coordinates: [pts] };
}

/**
 * Equirectangular angular distance in degrees between two [lng,lat] points.
 * Cheap (no trig per-call beyond one cos) — used to cull pings outside the
 * visible hemisphere so we don't feed the renderer geometry that won't be seen.
 */
function approxAngularDist(lng1: number, lat1: number, lng2: number, lat2: number): number {
  // Wrap longitude difference to [-180, 180] so pings near the antimeridian
  // are measured by the short way around, not the long way.
  let dLngRaw = lng2 - lng1;
  if (dLngRaw > 180) dLngRaw -= 360;
  else if (dLngRaw < -180) dLngRaw += 360;
  const dLng = dLngRaw * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180);
  const dLat = lat2 - lat1;
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

// ---------------------------------------------------------------------------
// Faction sprite generation — canvas → ImageData → map.addImage
// FANG = hexagon ⬡, HAMMER = diamond ◆, RESOLUTE = square ■
// Rendered as white monochrome shapes on transparent background.
// ---------------------------------------------------------------------------
function makeFactionIcon(shape: "hex" | "diamond" | "square"): { width: number; height: number; data: Uint8ClampedArray } {
  const S = 48; // canvas size
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext("2d")!;
  ctx.translate(S / 2, S / 2);
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#ffffff";
  const r = S * 0.32; // shape radius

  ctx.beginPath();
  if (shape === "hex") {
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 2;
      const x = r * Math.cos(a);
      const y = r * Math.sin(a);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  } else if (shape === "diamond") {
    ctx.moveTo(0, -r);
    ctx.lineTo(r, 0);
    ctx.lineTo(0, r);
    ctx.lineTo(-r, 0);
    ctx.closePath();
  } else {
    // square
    ctx.rect(-r * 0.82, -r * 0.82, r * 1.64, r * 1.64);
  }
  ctx.fill();

  const img = ctx.getImageData(0, 0, S, S);
  return { width: S, height: S, data: img.data };
}

const FACTION_ICON: Record<FactionId, "hex" | "diamond" | "square"> = {
  FANG: "hex",
  HAMMER: "diamond",
  RESOLUTE: "square",
};

// ---------------------------------------------------------------------------
// Monochrome map style — REAL 1:1 Earth base + stylized tactical overlay
// ---------------------------------------------------------------------------
// Base layer: Esri World Imagery (free satellite raster tiles, no API key).
//   This is TRUE 1:1 geography — actual satellite photography of every
//   coastline, island, road, and city on Earth. Equivalent to Google Earth
//   imagery but served as lightweight raster tiles (no server stack needed).
//   We desaturate + darken it via native MapLibre raster paint properties to
//   produce a "night-vision tactical satellite" base that fits the monochrome
//   aesthetic without breaking the wargame mood.
//
// Overlay: Natural Earth 10m vector coastlines/borders on top (the stylized
//   white-line look), plus the runtime gameplay layers (territories, outposts,
//   pings, missions, safehouses) added after map load.
//
// PRODUCTION SCALING NOTE: For millions of users, swap the Esri endpoint for a
//   self-hosted Protomaps PMTiles file (single static file, OSM vector tiles,
//   no per-request cost, scales via CDN). The `sources.satellite` entry below
//   is the only line that needs to change.
const esriWorldImagery = {
  type: "raster" as const,
  tiles: [
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  ],
  tileSize: 256,
  attribution: "Esri, Maxar, Earthstar Geographics",
  maxzoom: 19,
};

const mapStyle: maplibregl.StyleSpecification = {
  version: 8,
  projection: { type: "globe" } as any,
  sources: {
    // Real 1:1 satellite Earth (raster tiles — no server, no API key)
    satellite: esriWorldImagery,
    world: { type: "geojson", data: worldFeat as unknown as GeoJSON.GeoJSON },
    ocean: { type: "geojson", data: { type: "FeatureCollection", features: [oceanFeature] } },
    graticule: { type: "geojson", data: graticuleFeat as unknown as GeoJSON.GeoJSON },
  },
  layers: [
    // --- BASE: real satellite Earth, desaturated + darkened to monochrome tactical ---
    {
      id: "satellite-base",
      type: "raster",
      source: "satellite",
      paint: {
        "raster-opacity": 1.0,
        // Partial desaturate → near-grayscale but keeps faint land/water tonal separation
        "raster-saturation": -0.85,
        // Keep brightness readable — the satellite must stay visible under the tactical UI
        "raster-brightness-min": 0,
        "raster-brightness-max": 0.85,
        // Gentle contrast bump so land/water separation reads
        "raster-contrast": 0.15,
        // Slight hue rotate is a no-op on grayscale but keeps the pipeline honest
        "raster-hue-rotate": 0,
      },
    },
    // Deep-black ocean tint — VERY low opacity so the satellite shows through
    // but the void-space feel is preserved. (Cannot mask ocean-only with a
    // single rect polygon, so keep this subtle.)
    { id: "ocean-fill", type: "fill", source: "ocean", paint: { "fill-color": "#000000", "fill-opacity": 0.10 } },
    { id: "graticule", type: "line", source: "graticule", paint: { "line-color": "#fff", "line-opacity": 0.06, "line-width": 0.4 } },
    // Landmass fill — faint white wash so continents read as "ours" not "photo"
    { id: "countries-fill", type: "fill", source: "world", paint: {
      "fill-color": "#fff",
      "fill-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.03, 3, 0.03, 6, 0.03],
    } },
    // Coastlines + borders — white vector lines on top of the satellite for the
    // stylized tactical-map look. Zoom-responsive width.
    { id: "countries-line", type: "line", source: "world", paint: {
      "line-color": "#fff",
      "line-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.45, 3, 0.55, 6, 0.70],
      "line-width": ["interpolate", ["linear"], ["zoom"], 0, 0.5, 2, 0.8, 4, 1.2, 6, 1.8, 8, 2.4],
    } },
  ],
};

// ---------------------------------------------------------------------------
// Data converters — domain state → GeoJSON FeatureCollections for WebGL layers
// ---------------------------------------------------------------------------

/** Outposts → GeoJSON points with rich properties for data-driven styling. */
function outpostsToGeoJSON(outposts: Outpost[], operativeFaction: FactionId, selectedId: string | null): GeoJSON.FeatureCollection {
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
function halosToGeoJSON(outposts: Outpost[]): GeoJSON.FeatureCollection {
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
function missionsToGeoJSON(missions: Mission[], outposts: Outpost[]): {
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
function progressHeadsToGeoJSON(missions: Mission[], outposts: Outpost[]): GeoJSON.FeatureCollection {
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
function territoriesToGeoJSON(territories: Territory[]): GeoJSON.FeatureCollection {
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
function pingsToGeoJSON(
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
function missionImpactsToGeoJSON(missions: Mission[], outposts: Outpost[]): GeoJSON.FeatureCollection {
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

/** Format total actions with K/M/B suffixes for the HUD readout. */
function formatTotalActions(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(n);
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
interface WorldMapProps {
  state: GameState;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onMapClick: (lat: number, lng: number) => void;
  placementMode: boolean;
}

export function WorldMap({ state, selectedId, onSelect, onMapClick, placementMode }: WorldMapProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<maplibregl.Map | null>(null);
  const lastInteractRef = React.useRef<number>(performance.now());
  const rafRotateRef = React.useRef<number | null>(null);
  const rafPulseRef = React.useRef<number | null>(null);
  const rafProgressRef = React.useRef<number | null>(null);
  const rafPingsRef = React.useRef<number | null>(null);
  const placementRef = React.useRef(placementMode);
  const onSelectRef = React.useRef(onSelect);
  const onMapClickRef = React.useRef(onMapClick);
  const activityPingsRef = React.useRef<ActivityPing[]>(state.activityPings ?? []);
  const missionsRef = React.useRef(state.missions);
  const outpostsRef = React.useRef(state.outposts);
  const lastProgressUpdateRef = React.useRef<number>(0);
  const lastPingUpdateRef = React.useRef<number>(0);
  const [bearing, setBearing] = React.useState(0);
  const [centerLat, setCenterLat] = React.useState(0);

  // Keep refs in sync with latest props
  React.useEffect(() => { placementRef.current = placementMode; }, [placementMode]);
  React.useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  React.useEffect(() => { onMapClickRef.current = onMapClick; }, [onMapClick]);
  React.useEffect(() => { activityPingsRef.current = state.activityPings ?? []; }, [state.activityPings]);
  React.useEffect(() => { missionsRef.current = state.missions; }, [state.missions]);
  React.useEffect(() => { outpostsRef.current = state.outposts; }, [state.outposts]);

  // ---- Territory control summary for HUD (recomputed when territories change) ----
  const territorySummary = React.useMemo(() => {
    const c = { FANG: 0, HAMMER: 0, RESOLUTE: 0, CONTESTED: 0 };
    for (const t of state.territories) {
      if (t.controller) c[t.controller]++;
      else c.CONTESTED++;
    }
    return c;
  }, [state.territories]);

  // ---- Initialise the map once ----
  React.useEffect(() => {
    if (!containerRef.current) return;

    const mine = state.outposts.find(
      (o) => o.faction === state.operative.faction && o.type === "FULL"
    );
    const center: [number, number] = mine ? [mine.lng, mine.lat] : [-32, 8];

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyle,
      center,
      zoom: 1.6,
      maxZoom: 8,
      minZoom: 0,
      bearing: 0,
      attributionControl: false,
      dragRotate: true,
      scrollZoom: true,
      touchZoomRotate: true,
      doubleClickZoom: true,
      antialias: true,
    });
    mapRef.current = map;
    // TEMP DEBUG: expose map instance for browser-based diagnostics
    (window as any).__map = map;

    map.on("load", () => {
      // Globe projection is set in the style spec (`projection: { type: "globe" }`),
      // so it is active from first render. No post-load setProjection needed.

      // ---- Faction shape sprites (WebGL symbol layer icons) ----
      (["FANG", "HAMMER", "RESOLUTE"] as FactionId[]).forEach((f) => {
        const icon = makeFactionIcon(FACTION_ICON[f]);
        if (!map.hasImage(`faction-${f}`)) {
          map.addImage(`faction-${f}`, icon as any);
        }
      });

      // ===========================================================
      // SOURCES
      // ===========================================================

      // Outposts — clustered GeoJSON source (scales to many points)
      map.addSource("outposts", {
        type: "geojson",
        data: outpostsToGeoJSON(state.outposts, state.operative.faction, selectedId),
        cluster: true,
        clusterRadius: 32,
        clusterMaxZoom: 5,
        promoteId: "id",
      });

      // Territory halos (legacy per-outpost influence circles)
      map.addSource("halos", {
        type: "geojson",
        data: halosToGeoJSON(state.outposts),
      });

      // Territory control polygons (NEW — the "fight for territory" layer)
      map.addSource("territories", {
        type: "geojson",
        data: territoriesToGeoJSON(state.territories),
      });

      // Activity pings (NEW — "millions of actions" sonar layer)
      map.addSource("activity-pings", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      // Mission vectors (aggressive + passive)
      const mg = missionsToGeoJSON(state.missions, state.outposts);
      map.addSource("vectors-agg", { type: "geojson", data: mg.aggressive });
      map.addSource("vectors-pass", { type: "geojson", data: mg.passive });

      // Mission impact points (active aggressive mission targets — pulsing)
      map.addSource("vectors-agg-impact", {
        type: "geojson",
        data: missionImpactsToGeoJSON(state.missions, state.outposts),
      });

      // Mission progress heads
      map.addSource("progress-heads", {
        type: "geojson",
        data: progressHeadsToGeoJSON(state.missions, state.outposts),
      });

      // ===========================================================
      // LAYERS (bottom → top)
      // ===========================================================

      // --- Territory control: fill (opacity driven by control %) ---
      map.addLayer({
        id: "territory-fill",
        type: "fill",
        source: "territories",
        paint: {
          "fill-color": "#fff",
          "fill-opacity": [
            "case",
            ["==", ["get", "isContested"], 1], 0.045,
            ["interpolate", ["linear"], ["get", "control"], 0, 0.06, 100, 0.17],
          ],
        },
      });
      // --- Territory control: outline (dashed when contested, solid otherwise) ---
      map.addLayer({
        id: "territory-line",
        type: "line",
        source: "territories",
        paint: {
          "line-color": "#fff",
          "line-opacity": ["case", ["==", ["get", "isContested"], 1], 0.35, 0.5],
          "line-width": 0.9,
          "line-dasharray": [
            "case",
            ["==", ["get", "isContested"], 1],
            ["literal", [5, 4]],
            ["literal", [1, 0]],
          ],
        },
      });
      // --- Territory control: centroid label (try/catch — Noto Sans may be missing) ---
      try {
        map.addLayer({
          id: "territory-label",
          type: "symbol",
          source: "territories",
          layout: {
            "text-field": "{name}",
            "text-size": 9,
            "text-font": ["Noto Sans Regular"],
            "text-letter-spacing": 0.1,
            "text-transform": "uppercase",
            "text-allow-overlap": false,
          },
          paint: {
            "text-color": "#fff",
            "text-opacity": 0.35,
          },
        });
      } catch {
        /* Noto Sans not available — territory labels omitted */
      }

      // --- Per-outpost influence halos: faint fill + dashed outline ---
      map.addLayer({
        id: "halos-fill",
        type: "fill",
        source: "halos",
        paint: {
          "fill-color": "#fff",
          "fill-opacity": 0.025,
        },
      });
      map.addLayer({
        id: "halos-line",
        type: "line",
        source: "halos",
        paint: {
          "line-color": "#fff",
          "line-opacity": 0.2,
          "line-width": 0.7,
          "line-dasharray": ["case", ["==", ["get", "dashed"], 1], ["literal", [4, 3]], ["literal", [1, 0]]],
        },
      });

      // --- Mission vectors: aggressive (solid-ish, dashed) ---
      // Opacity is animated in the pulseLoop for a subtle "live" feel.
      map.addLayer({
        id: "vectors-agg-line",
        type: "line",
        source: "vectors-agg",
        paint: {
          "line-color": "#fff",
          "line-opacity": ["case", ["==", ["get", "status"], "ACTIVE"], 0.85, 0.3],
          "line-width": 1.6,
          "line-dasharray": [3, 4],
        },
      });
      // --- Mission vectors: passive (lighter, thinner) ---
      map.addLayer({
        id: "vectors-pass-line",
        type: "line",
        source: "vectors-pass",
        paint: {
          "line-color": "#fff",
          "line-opacity": ["case", ["==", ["get", "status"], "ACTIVE"], 0.6, 0.2],
          "line-width": 0.9,
          "line-dasharray": [1, 5],
        },
      });

      // --- Mission vectors: aggressive impact glow at TARGET (pulsing) ---
      // Radius/opacity animated in pulseLoop so strikes-to-land feel imminent.
      map.addLayer({
        id: "vectors-agg-impact",
        type: "circle",
        source: "vectors-agg-impact",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 0, 8, 4, 10, 8, 12],
          "circle-color": "#fff",
          "circle-opacity": 0.5,
          "circle-blur": 1,
          "circle-stroke-width": 0,
        },
      });

      // --- Activity pings: expanding sonar ring (fades as it grows) ---
      map.addLayer({
        id: "ping-ring",
        type: "circle",
        source: "activity-pings",
        paint: {
          "circle-radius": [
            "interpolate", ["linear"], ["zoom"],
            0, ["interpolate", ["linear"], ["get", "age"], 0, 2, 1, 14],
            4, ["interpolate", ["linear"], ["get", "age"], 0, 3, 1, 22],
            8, ["interpolate", ["linear"], ["get", "age"], 0, 4, 1, 30],
          ],
          "circle-color": "#fff",
          "circle-opacity": ["interpolate", ["linear"], ["get", "age"], 0, 0.7, 1, 0],
          "circle-blur": 1.2,
          "circle-stroke-width": 0,
        },
      });
      // --- Activity pings: bright core (fades over lifetime) ---
      map.addLayer({
        id: "ping-core",
        type: "circle",
        source: "activity-pings",
        paint: {
          "circle-radius": 2,
          "circle-color": "#fff",
          "circle-opacity": ["interpolate", ["linear"], ["get", "age"], 0, 0.9, 0.8, 0],
          "circle-stroke-width": 0,
        },
      });

      // --- Outpost: soft halo glow (NEW — every outpost gets a halo) ---
      // Below the health ring; radius scales with level and zoom.
      map.addLayer({
        id: "outpost-glow",
        type: "circle",
        source: "outposts",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": [
            "interpolate", ["linear"], ["zoom"],
            0, ["+", ["match", ["get", "type"], "FULL", 8, 6], ["*", ["get", "level"], 0.8]],
            4, ["+", ["match", ["get", "type"], "FULL", 12, 9], ["*", ["get", "level"], 1.0]],
            8, ["+", ["match", ["get", "type"], "FULL", 18, 13], ["*", ["get", "level"], 1.3]],
          ],
          "circle-color": "#fff",
          "circle-opacity": ["case", ["==", ["get", "isMine"], 1], 0.35, 0.15],
          "circle-blur": 1.5,
          "circle-stroke-width": 0,
        },
      });

      // --- Outpost: SAFEHOUSE fortified double-ring aura (NEW) ---
      // Filtered to SAFEHOUSE outposts only — fill 0.06 + thick stroke = "fortified".
      map.addLayer({
        id: "outpost-safehouse-aura",
        type: "circle",
        source: "outposts",
        filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "type"], "SAFEHOUSE"]],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 0, 12, 4, 17, 8, 24],
          "circle-color": "#fff",
          "circle-opacity": 0.06,
          "circle-stroke-color": "#fff",
          "circle-stroke-opacity": 0.5,
          "circle-stroke-width": 1.5,
        },
      });

      // --- Outpost: selection / under-attack pulse ring (animated) ---
      // Filtered to selected OR under-attack outposts. Radius + opacity
      // animated via rAF setPaintProperty for a pulsing glow.
      map.addLayer({
        id: "outpost-pulse",
        type: "circle",
        source: "outposts",
        filter: ["any", ["==", ["get", "selected"], 1], ["==", ["get", "underAttack"], 1]],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 0, 14, 4, 22, 8, 34],
          "circle-color": "#fff",
          "circle-opacity": 0.25,
          "circle-blur": 0.8,
          "circle-stroke-width": 0,
        },
      });

      // --- Outpost: health ring (hollow circle, stroke-opacity = health%) ---
      // Only renders for unclustered points.
      map.addLayer({
        id: "outpost-health-ring",
        type: "circle",
        source: "outposts",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"],
            0, ["match", ["get", "type"], "FULL", 11, 8],
            4, ["match", ["get", "type"], "FULL", 16, 11],
            8, ["match", ["get", "type"], "FULL", 24, 16]],
          "circle-color": "rgba(0,0,0,0)",
          "circle-stroke-color": "#fff",
          "circle-stroke-opacity": [
            "case",
            ["==", ["get", "offline"], 1], 0.12,
            ["interpolate", ["linear"], ["get", "healthPct"], 0, 0.2, 1, 0.9]
          ],
          "circle-stroke-width": 1.4,
          "circle-opacity": ["case", ["==", ["get", "offline"], 1], 0.3, 0],
        },
      });

      // --- Outpost: faction shape (symbol layer with sprite icons) ---
      // The core mark — hex/diamond/square — rendered as a WebGL texture.
      map.addLayer({
        id: "outpost-shape",
        type: "symbol",
        source: "outposts",
        filter: ["!", ["has", "point_count"]],
        layout: {
          "icon-image": ["match", ["get", "faction"], "FANG", "faction-FANG", "HAMMER", "faction-HAMMER", "faction-RESOLUTE"],
          "icon-size": ["interpolate", ["linear"], ["zoom"],
            0, ["match", ["get", "type"], "FULL", 0.32, 0.22],
            4, ["match", ["get", "type"], "FULL", 0.44, 0.3],
            8, ["match", ["get", "type"], "FULL", 0.6, 0.42]],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "symbol-sort-key": ["match", ["get", "type"], "FULL", 2, 1],
        },
        paint: {
          "icon-opacity": ["case", ["==", ["get", "offline"], 1], 0.3, 1],
        },
      });

      // --- Outpost: cluster count label (for clustered points) ---
      map.addLayer({
        id: "outpost-clusters",
        type: "circle",
        source: "outposts",
        filter: ["has", "point_count"],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 0, 16, 8, 24],
          "circle-color": "rgba(255,255,255,0.10)",
          "circle-stroke-color": "#fff",
          "circle-stroke-width": 0.5,
          "circle-stroke-opacity": 0.5,
        },
      });
      map.addLayer({
        id: "outpost-cluster-label",
        type: "symbol",
        source: "outposts",
        filter: ["has", "point_count"],
        layout: {
          "text-field": "{point_count}",
          "text-font": ["Noto Sans Regular"],
          "text-size": 11,
          "text-allow-overlap": true,
        },
        paint: {
          "text-color": "#fff",
          "text-opacity": 0.85,
        },
      });

      // --- Mission: progress comet heads (bright moving dots with trailing blur) ---
      map.addLayer({
        id: "progress-heads",
        type: "circle",
        source: "progress-heads",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 0, 3, 4, 4.5, 8, 6],
          "circle-color": "#fff",
          "circle-opacity": 1,
          "circle-blur": 0.8,
          "circle-stroke-color": "#fff",
          "circle-stroke-width": 0.5,
          "circle-stroke-opacity": 0.4,
        },
      });

      // ===========================================================
      // INTERACTION
      // ===========================================================

      // Click on a single outpost → select it
      map.on("click", "outpost-shape", (e: maplibregl.MapMouseEvent & { features?: any[] }) => {
        if (placementRef.current) return;
        e.preventDefault();
        const f = e.features?.[0];
        if (f) {
          const id = f.properties?.id as string;
          onSelectRef.current(id === selectedId ? null : id);
        }
      });
      // Also allow clicking the health ring (slightly larger hit area)
      map.on("click", "outpost-health-ring", (e: maplibregl.MapMouseEvent & { features?: any[] }) => {
        if (placementRef.current) return;
        e.preventDefault();
        const f = e.features?.[0];
        if (f) {
          const id = f.properties?.id as string;
          onSelectRef.current(id === selectedId ? null : id);
        }
      });

      // Click on a cluster → zoom in to expand
      map.on("click", "outpost-clusters", (e: maplibregl.MapMouseEvent & { features?: any[] }) => {
        e.preventDefault();
        const f = e.features?.[0];
        if (!f) return;
        const clusterId = f.properties?.cluster_id as number;
        const src = map.getSource("outposts") as maplibregl.GeoJSONSource;
        src.getClusterExpansionZoom(clusterId).then((zoom) => {
          map.easeTo({ center: [f.geometry.coordinates[0], f.geometry.coordinates[1]], zoom: Math.max(zoom, 3) });
        });
      });

      // Click on empty map → placement mode
      map.on("click", (e: maplibregl.MapMouseEvent) => {
        if (!placementRef.current) return;
        // If the click hit an outpost/cluster layer, skip placement
        const feats = map.queryRenderedFeatures(e.point, {
          layers: ["outpost-shape", "outpost-health-ring", "outpost-clusters"],
        });
        if (feats.length > 0) return;
        onMapClickRef.current(e.lngLat.lat, e.lngLat.lng);
      });

      // Hover cursor
      const setPointer = () => { map.getCanvas().style.cursor = placementRef.current ? "crosshair" : "pointer"; };
      const setGrab = () => { map.getCanvas().style.cursor = placementRef.current ? "crosshair" : "grab"; };
      map.on("mouseenter", "outpost-shape", setPointer);
      map.on("mouseenter", "outpost-health-ring", setPointer);
      map.on("mouseenter", "outpost-clusters", setPointer);
      map.on("mouseleave", "outpost-shape", setGrab);
      map.on("mouseleave", "outpost-health-ring", setGrab);
      map.on("mouseleave", "outpost-clusters", setGrab);
      map.getCanvas().style.cursor = "grab";

      // Track center/bearing for readout
      const onMove = () => {
        setBearing(Math.round(map.getBearing()));
        setCenterLat(Math.round(map.getCenter().lat));
      };
      map.on("move", onMove);
      onMove();
    });

    // Track user interaction for auto-rotate pause
    const onInteract = () => { lastInteractRef.current = performance.now(); };
    const el = containerRef.current;
    el.addEventListener("pointerdown", onInteract);
    el.addEventListener("wheel", onInteract, { passive: true });
    el.addEventListener("touchstart", onInteract, { passive: true });

    // ---- Auto-rotate loop ----
    const rotateLoop = () => {
      const now = performance.now();
      if (now - lastInteractRef.current > 3500 && !placementRef.current) {
        const b = map.getBearing();
        map.jumpTo({ bearing: b + 0.05 });
      }
      rafRotateRef.current = requestAnimationFrame(rotateLoop);
    };
    rafRotateRef.current = requestAnimationFrame(rotateLoop);

    // ---- Selection / under-attack pulse + impact glow + aggressive-line pulse ----
    const pulseLoop = () => {
      const t = (performance.now() % 1800) / 1800; // 1.8s cycle
      const pulse = 0.15 + 0.25 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2));
      const radiusBoost = 4 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2));
      const map = mapRef.current;
      if (map && map.getLayer("outpost-pulse")) {
        try {
          map.setPaintProperty("outpost-pulse", "circle-opacity", pulse);
          map.setPaintProperty("outpost-pulse", "circle-radius", ["interpolate", ["linear"], ["zoom"], 0, 14 + radiusBoost, 4, 22 + radiusBoost, 8, 34 + radiusBoost]);
        } catch { /* layer not ready */ }
      }
      // Pulsing impact glow at aggressive-mission targets
      if (map && map.getLayer("vectors-agg-impact")) {
        try {
          const impactR = 10 + 4 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2));
          map.setPaintProperty("vectors-agg-impact", "circle-radius", ["interpolate", ["linear"], ["zoom"], 0, impactR - 2, 4, impactR, 8, impactR + 2]);
        } catch { /* layer not ready */ }
      }
      // Subtle opacity pulse on aggressive mission lines (live feel)
      if (map && map.getLayer("vectors-agg-line")) {
        try {
          const linePulse = 0.78 + 0.07 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2));
          map.setPaintProperty("vectors-agg-line", "line-opacity", [
            "case",
            ["==", ["get", "status"], "ACTIVE"], linePulse,
            0.3,
          ]);
        } catch { /* layer not ready */ }
      }
      rafPulseRef.current = requestAnimationFrame(pulseLoop);
    };
    rafPulseRef.current = requestAnimationFrame(pulseLoop);

    // NOTE: the activity-ping + progress-head source updates are driven by a
    // single setInterval in a dedicated effect below (see "Live source pump").
    // That pattern survives React Strict Mode double-invocation reliably,
    // whereas nested rAF loops created inside this mount effect do not.

    return () => {
      if (rafRotateRef.current) cancelAnimationFrame(rafRotateRef.current);
      if (rafPulseRef.current) cancelAnimationFrame(rafPulseRef.current);
      el.removeEventListener("pointerdown", onInteract);
      el.removeEventListener("wheel", onInteract);
      el.removeEventListener("touchstart", onInteract);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // ---- Sync outposts source when state/selection changes ----
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource("outposts")) return;
    const src = map.getSource("outposts") as maplibregl.GeoJSONSource;
    src.setData(outpostsToGeoJSON(state.outposts, state.operative.faction, selectedId) as unknown as GeoJSON.GeoJSON);
  }, [state.outposts, state.operative.faction, selectedId]);

  // ---- Sync territory halos ----
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource("halos")) return;
    const src = map.getSource("halos") as maplibregl.GeoJSONSource;
    src.setData(halosToGeoJSON(state.outposts) as unknown as GeoJSON.GeoJSON);
  }, [state.outposts]);

  // ---- Sync territory control polygons (NEW) ----
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource("territories")) return;
    const src = map.getSource("territories") as maplibregl.GeoJSONSource;
    src.setData(territoriesToGeoJSON(state.territories) as unknown as GeoJSON.GeoJSON);
  }, [state.territories]);

  // ---- Sync mission vectors + impact points ----
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource("vectors-agg")) return;
    const mg = missionsToGeoJSON(state.missions, state.outposts);
    (map.getSource("vectors-agg") as maplibregl.GeoJSONSource).setData(mg.aggressive as unknown as GeoJSON.GeoJSON);
    (map.getSource("vectors-pass") as maplibregl.GeoJSONSource).setData(mg.passive as unknown as GeoJSON.GeoJSON);
    if (map.getSource("vectors-agg-impact")) {
      (map.getSource("vectors-agg-impact") as maplibregl.GeoJSONSource).setData(
        missionImpactsToGeoJSON(state.missions, state.outposts) as unknown as GeoJSON.GeoJSON,
      );
    }
  }, [state.missions, state.outposts]);

  // ---- Live source pump (progress heads + activity pings) ----
  // A single setInterval drives both transient layers. setInterval (vs rAF
  // nested inside the mount effect) reliably survives React Strict Mode
  // double-invocation and never goes stale from closed-over state — it reads
  // fresh data from refs every tick. Throttled to ~10fps for scale.
  React.useEffect(() => {
    const id = window.setInterval(() => {
      const map = mapRef.current;
      if (!map) return;
      const center = map.getCenter();
      const now = Date.now();
      try {
        if (map.getSource("activity-pings")) {
          const src = map.getSource("activity-pings") as maplibregl.GeoJSONSource;
          const pingData = pingsToGeoJSON(
            activityPingsRef.current,
            { lng: center.lng, lat: center.lat },
            now,
          );
          src.setData(pingData as unknown as GeoJSON.GeoJSON);
        }
        if (map.getSource("progress-heads")) {
          const src = map.getSource("progress-heads") as maplibregl.GeoJSONSource;
          src.setData(
            progressHeadsToGeoJSON(missionsRef.current, outpostsRef.current) as unknown as GeoJSON.GeoJSON,
          );
        }
      } catch {
        /* source not ready yet */
      }
    }, 100); // 100ms = 10fps — enough for sonar/progress motion, cheap at scale
    return () => window.clearInterval(id);
  }, []);

  const cursor = placementMode ? "cursor-crosshair" : "cursor-grab";

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      {/* Flat black backdrop behind the transparent WebGL canvas. */}
      <div className="pointer-events-none absolute inset-0 bg-black" />

      {/* MapLibre canvas — all graphics are WebGL layers ON the globe surface */}
      <div
        ref={containerRef}
        className={cn(cursor)}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: "50%",
          height: "135%",
          transform: "translateY(-50%)",
        }}
      />

      {/* Coordinate readout (bottom-left) */}
      <div className="pointer-events-none absolute bottom-3 left-4 font-mono text-[9px] tracking-[0.14em] text-white/40">
        GLOBE · LIMB LOCK · ROT {bearing}°/{centerLat}°
      </div>

      {/* Network load readout (top-right) */}
      <div className="pointer-events-none absolute right-4 top-3 text-right font-mono text-[9px] tracking-[0.14em] text-white/40">
        NET LOAD · {state.networkLoad}M ACT/S · {formatTotalActions(state.totalActions)} TOTAL
      </div>

      {/* Territory control summary (bottom-center) */}
      <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 font-mono text-[9px] tracking-[0.14em] text-white/40">
        FANG {territorySummary.FANG} · HAMMER {territorySummary.HAMMER} · RESOLUTE {territorySummary.RESOLUTE} · CONTESTED {territorySummary.CONTESTED}
      </div>

      {/* Placement hint */}
      {placementMode && (
        <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 border border-white/30 bg-black/70 px-3 py-1.5 font-mono text-[10px] tracking-[0.2em] text-white/90 backdrop-blur">
          CLICK GLOBE TO DEPLOY OUTPOST · ESC TO CANCEL
        </div>
      )}
    </div>
  );
}
