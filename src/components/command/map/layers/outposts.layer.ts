// ---------------------------------------------------------------------------
// Outposts layer — faction markers, health rings, clustering, selection pulse.
//
// TWO-TIER RENDERING (matches the SurveilTrack ground-view reference):
//   • Globe/region zoom (0–12): faction-shape sprites (hex/diamond/square),
//     health rings, glow halos, selection pulse — the cinematic command view.
//   • City/street zoom (12+): plain white square markers with alphanumeric
//     unit codes (e.g. "FNG-3300-NYC"), bright + crisp like the reference.
//
// The two tiers cross-fade via zoom-interpolated opacity so the transition
// from globe to ground is seamless.
//
// Consumes source: "game:outposts" (clustered GeoJSON points).
// Handles outpost click selection via the interaction context.
// ---------------------------------------------------------------------------

import type maplibregl from "maplibre-gl";
import type { FeatureCollection, Geometry } from "geojson";
import type { MapLayerSpec } from "../types";
import { GAME_SOURCE_IDS } from "../sources/game-engine.source";
import { makeFactionIcon, makeStreetMarker, FACTION_ICON } from "../utils/sprites";
import type { FactionId } from "@/lib/types";

const SRC = "outposts-src";

// ---- Cached outpost features for reliable lngLat-based click hit-testing ----
// queryRenderedFeatures is unreliable under the globe projection + pitch (symbol
// and circle layers don't query consistently). Instead, onClick uses the click's
// lngLat to find the nearest cached outpost within a threshold. This is 100%
// projection-independent.
let cachedOutposts: { id: string; lng: number; lat: number }[] = [];

/** Haversine distance in meters between two [lng,lat] points. */
function haversineMeters(aLng: number, aLat: number, bLng: number, bLat: number): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export const outpostsLayer: MapLayerSpec = {
  id: "outposts",
  sourceIds: [GAME_SOURCE_IDS.outposts],

  addSources(map) {
    map.addSource(SRC, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
      cluster: true,
      clusterRadius: 32,
      clusterMaxZoom: 5,
      promoteId: "id",
    });

    // Register faction sprite icons (globe view).
    (["FANG", "HAMMER", "RESOLUTE"] as FactionId[]).forEach((f) => {
      if (!map.hasImage(`faction-${f}`)) {
        map.addImage(`faction-${f}`, makeFactionIcon(FACTION_ICON[f]));
      }
    });

    // Register the street-level white-square marker (ground view).
    if (!map.hasImage("street-marker")) {
      map.addImage("street-marker", makeStreetMarker());
    }
  },

  addLayers(map) {
    // ===== GLOBE TIER (zoom 0–12) =====

    // --- Outpost: soft halo glow (fades out at street zoom) ---
    map.addLayer({
      id: "outpost-glow",
      type: "circle",
      source: SRC,
      filter: ["!", ["has", "point_count"]],
      maxzoom: 13,
      paint: {
        "circle-radius": [
          "interpolate", ["linear"], ["zoom"],
          0, ["+", ["match", ["get", "type"], "FULL", 8, 6], ["*", ["get", "level"], 0.8]],
          4, ["+", ["match", ["get", "type"], "FULL", 12, 9], ["*", ["get", "level"], 1.0]],
          8, ["+", ["match", ["get", "type"], "FULL", 18, 13], ["*", ["get", "level"], 1.3]],
        ],
        "circle-color": "#fff",
        "circle-opacity": [
          "case", ["==", ["get", "isMine"], 1],
          ["interpolate", ["linear"], ["zoom"], 0, 0.35, 11, 0.35, 13, 0.0],
          ["interpolate", ["linear"], ["zoom"], 0, 0.15, 11, 0.15, 13, 0.0],
        ],
        "circle-blur": 1.5,
        "circle-stroke-width": 0,
      },
    });

    // --- Outpost: SAFEHOUSE fortified double-ring aura ---
    map.addLayer({
      id: "outpost-safehouse-aura",
      type: "circle",
      source: SRC,
      filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "type"], "SAFEHOUSE"]],
      maxzoom: 13,
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 0, 12, 4, 17, 8, 24],
        "circle-color": "#fff",
        "circle-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.06, 11, 0.06, 13, 0.0],
        "circle-stroke-color": "#fff",
        "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.5, 11, 0.5, 13, 0.0],
        "circle-stroke-width": 1.5,
      },
    });

    // --- Outpost: selection / under-attack pulse ring (animated, both tiers) ---
    map.addLayer({
      id: "outpost-pulse",
      type: "circle",
      source: SRC,
      filter: ["any", ["==", ["get", "selected"], 1], ["==", ["get", "underAttack"], 1]],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 0, 14, 4, 22, 8, 34, 13, 16, 16, 22],
        "circle-color": "#fff",
        "circle-opacity": 0.25,
        "circle-blur": 0.8,
        "circle-stroke-width": 0,
      },
    });

    // --- Outpost: health ring (globe tier only) ---
    map.addLayer({
      id: "outpost-health-ring",
      type: "circle",
      source: SRC,
      filter: ["!", ["has", "point_count"]],
      maxzoom: 13,
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"],
          0, ["match", ["get", "type"], "FULL", 11, 8],
          4, ["match", ["get", "type"], "FULL", 16, 11],
          8, ["match", ["get", "type"], "FULL", 24, 16]],
        "circle-color": "rgba(0,0,0,0)",
        "circle-stroke-color": "#fff",
        "circle-stroke-opacity": [
          "case",
          ["==", ["get", "offline"], 1],
          ["interpolate", ["linear"], ["zoom"], 0, 0.12, 11, 0.12, 13, 0.0],
          ["interpolate", ["linear"], ["zoom"],
            0, ["interpolate", ["linear"], ["get", "healthPct"], 0, 0.2, 1, 0.9],
            11, ["interpolate", ["linear"], ["get", "healthPct"], 0, 0.2, 1, 0.9],
            13, 0.0],
        ],
        "circle-stroke-width": 1.4,
        "circle-opacity": ["case", ["==", ["get", "offline"], 1], 0.3, 0],
      },
    });

    // --- Outpost: faction shape (globe tier only — maxzoom 12) ---
    map.addLayer({
      id: "outpost-shape",
      type: "symbol",
      source: SRC,
      filter: ["!", ["has", "point_count"]],
      maxzoom: 12,
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

    // ===== STREET TIER (zoom 12+) =====

    // --- Outpost: transparent hitbox (reliable click target) ---
    // Symbol layers aren't reliably returned by queryRenderedFeatures under
    // pitch, so this invisible circle layer acts as the street-level click
    // target. Radius matches the visible marker size.
    map.addLayer({
      id: "outpost-street-hitbox",
      type: "circle",
      source: SRC,
      filter: ["!", ["has", "point_count"]],
      minzoom: 12,
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 11, 14, 14, 16, 16, 18, 18],
        "circle-color": "rgba(0,0,0,0)",
        "circle-stroke-color": "rgba(0,0,0,0)",
        "circle-stroke-width": 0,
        "circle-opacity": 0,
      },
    });

    // --- Outpost: white square marker (SurveilTrack-style) ---
    map.addLayer({
      id: "outpost-street-square",
      type: "symbol",
      source: SRC,
      filter: ["!", ["has", "point_count"]],
      minzoom: 12,
      layout: {
        "icon-image": "street-marker",
        "icon-size": ["interpolate", ["linear"], ["zoom"], 12, 0.55, 14, 0.7, 16, 0.85, 18, 1.0],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        "symbol-sort-key": ["match", ["get", "type"], "FULL", 2, 1],
      },
      paint: {
        "icon-opacity": ["case", ["==", ["get", "offline"], 1], 0.4, 1],
      },
    });

    // --- Outpost: alphanumeric unit code label (e.g. "FNG-3300-NYC") ---
    map.addLayer({
      id: "outpost-street-code",
      type: "symbol",
      source: SRC,
      filter: ["!", ["has", "point_count"]],
      minzoom: 13,
      layout: {
        "text-field": "{code}",
        "text-font": ["Noto Sans Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 13, 9, 15, 11, 17, 13],
        "text-offset": [0, 1.5],
        "text-anchor": "top",
        "text-allow-overlap": false,
        "text-ignore-placement": false,
        "text-max-width": 10,
      },
      paint: {
        "text-color": "#ffffff",
        "text-halo-color": "#000000",
        "text-halo-width": 2.5,
        "text-opacity": ["case", ["==", ["get", "offline"], 1], 0.5, 0.95],
      },
    });

    // --- Outpost: selection bracket (street tier — a brighter ring under the square) ---
    map.addLayer({
      id: "outpost-street-select",
      type: "circle",
      source: SRC,
      filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "selected"], 1]],
      minzoom: 12,
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 12, 15, 16, 18, 20],
        "circle-color": "rgba(0,0,0,0)",
        "circle-stroke-color": "#ffffff",
        "circle-stroke-opacity": 0.9,
        "circle-stroke-width": 1.5,
      },
    });

    // ===== CLUSTERS (globe tier only) =====

    map.addLayer({
      id: "outpost-clusters",
      type: "circle",
      source: SRC,
      filter: ["has", "point_count"],
      maxzoom: 6,
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
      source: SRC,
      filter: ["has", "point_count"],
      maxzoom: 6,
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
  },

  onData(map, _sourceId, data) {
    const src = map.getSource(SRC) as maplibregl.GeoJSONSource | undefined;
    if (src) src.setData(data);
    // Cache non-cluster outpost points for reliable lngLat-based click hit-testing.
    const fc = data as FeatureCollection<Geometry>;
    if (fc && Array.isArray(fc.features)) {
      cachedOutposts = fc.features
        .filter((f) => !f.properties?.point_count && f.geometry?.type === "Point")
        .map((f) => {
          const c = (f.geometry as { coordinates: [number, number] }).coordinates;
          return { id: (f.properties as { id: string }).id, lng: c[0], lat: c[1] };
        });
    }
  },

  animate(map, now) {
    // Pulse the selection / under-attack ring.
    const t = (now % 1800) / 1800;
    const pulse = 0.15 + 0.25 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2));
    const radiusBoost = 4 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2));
    try {
      if (map.getLayer("outpost-pulse")) {
        map.setPaintProperty("outpost-pulse", "circle-opacity", pulse);
        map.setPaintProperty("outpost-pulse", "circle-radius", [
          "interpolate", ["linear"], ["zoom"],
          0, 14 + radiusBoost, 4, 22 + radiusBoost, 8, 34 + radiusBoost, 13, 16, 16, 22,
        ]);
      }
    } catch {
      /* layer not ready */
    }
  },

  onClick(map, e, ctx) {
    // ---- Primary hit-test: nearest outpost to the click's lngLat ----
    // queryRenderedFeatures is unreliable under the globe projection + pitch
    // (symbol/circle layers don't query consistently), so we use the click's
    // geographic coordinates to find the nearest cached outpost within a
    // zoom-aware threshold. This is 100% projection-independent.
    const lngLat = e.lngLat as { lng: number; lat: number };
    const zoom = map.getZoom();
    // Click tolerance in meters — shrinks at higher zoom (markers are visually
    // closer together). Generous at street zoom because the globe+pitch
    // unproject() has ~500m of positional error vs the rendered marker.
    // Outposts are typically >10km apart, so a 1.2km threshold won't misselect.
    const thresholdMeters = zoom < 6 ? 50000 : zoom < 10 ? 8000 : zoom < 13 ? 2000 : 1200;

    let nearest: { id: string; dist: number } | null = null;
    for (const op of cachedOutposts) {
      const d = haversineMeters(lngLat.lng, lngLat.lat, op.lng, op.lat);
      if (d <= thresholdMeters && (!nearest || d < nearest.dist)) {
        nearest = { id: op.id, dist: d };
      }
    }

    if (nearest && ctx?.interaction) {
      e.preventDefault();
      const isCurrentlySelected = nearest.id === ctx.interaction.selectedId;
      ctx.interaction.onSelect(isCurrentlySelected ? null : nearest.id);
      return;
    }

    // ---- Cluster hit-test (globe view) → zoom in to expand ----
    const pt = e.point as { x: number; y: number };
    const tol = 16;
    const box: [[number, number], [number, number]] = [
      [pt.x - tol, pt.y - tol],
      [pt.x + tol, pt.y + tol],
    ];
    const clusterFeats = map.queryRenderedFeatures(box, {
      layers: ["outpost-clusters"],
    });
    if (clusterFeats.length > 0) {
      e.preventDefault();
      const f = clusterFeats[0];
      const clusterId = f.properties?.cluster_id as number;
      const src = map.getSource(SRC) as maplibregl.GeoJSONSource;
      if (src && clusterId !== undefined) {
        src.getClusterExpansionZoom(clusterId).then((zoom) => {
          const coords = (f.geometry as { coordinates: [number, number] }).coordinates;
          map.easeTo({ center: coords, zoom: Math.max(zoom, 3) });
        });
      }
    }
  },

  onHover(map, entering, ctx) {
    if (ctx?.interaction?.placementMode) {
      map.getCanvas().style.cursor = "crosshair";
    } else {
      map.getCanvas().style.cursor = entering ? "pointer" : "grab";
    }
  },
};
