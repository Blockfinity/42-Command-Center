// ---------------------------------------------------------------------------
// Gameplay layer definitions — the runtime MapLibre sources + layers added
// after map load (territories, halos, missions, pings, outposts, progress).
// Extracted from world-map.tsx for separation of concerns.
//
// These are pure data: layer specs + initial source factories. The component
// calls addGameplaySources() + addGameplayLayers() once on map load, then
// mutates source data via setData() on state changes.
// ---------------------------------------------------------------------------

import type maplibregl from "maplibre-gl";
import type { FactionId, GameState } from "@/lib/types";
import {
  outpostsToGeoJSON,
  halosToGeoJSON,
  missionsToGeoJSON,
  territoriesToGeoJSON,
  missionImpactsToGeoJSON,
  progressHeadsToGeoJSON,
} from "@/lib/map/converters";

/**
 * Add all gameplay GeoJSON sources to the map. Called once on map load.
 * `selectedId` and `state` seed the initial source data; subsequent updates
 * happen via setData() in the component's sync effects.
 */
export function addGameplaySources(
  map: maplibregl.Map,
  state: GameState,
  selectedId: string | null,
): void {
  // Outposts — clustered GeoJSON source (scales to many points)
  map.addSource("outposts", {
    type: "geojson",
    data: outpostsToGeoJSON(state.outposts, state.operative.faction, selectedId) as any,
    cluster: true,
    clusterRadius: 32,
    clusterMaxZoom: 5,
    promoteId: "id",
  });

  // Territory halos (legacy per-outpost influence circles)
  map.addSource("halos", {
    type: "geojson",
    data: halosToGeoJSON(state.outposts) as any,
  });

  // Territory control polygons (the "fight for territory" layer)
  map.addSource("territories", {
    type: "geojson",
    data: territoriesToGeoJSON(state.territories) as any,
  });

  // Activity pings ("millions of actions" sonar layer — starts empty, pumped live)
  map.addSource("activity-pings", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] } as any,
  });

  // Mission vectors (aggressive + passive)
  const mg = missionsToGeoJSON(state.missions, state.outposts);
  map.addSource("vectors-agg", { type: "geojson", data: mg.aggressive as any });
  map.addSource("vectors-pass", { type: "geojson", data: mg.passive as any });

  // Mission impact points (active aggressive mission targets — pulsing)
  map.addSource("vectors-agg-impact", {
    type: "geojson",
    data: missionImpactsToGeoJSON(state.missions, state.outposts) as any,
  });

  // Mission progress heads
  map.addSource("progress-heads", {
    type: "geojson",
    data: progressHeadsToGeoJSON(state.missions, state.outposts) as any,
  });
}

/**
 * Add all gameplay render layers to the map (bottom → top z-order).
 * Called once on map load, after addGameplaySources().
 */
export function addGameplayLayers(map: maplibregl.Map): void {
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

  // --- Outpost: soft halo glow (every outpost gets a halo) ---
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

  // --- Outpost: SAFEHOUSE fortified double-ring aura ---
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
}
