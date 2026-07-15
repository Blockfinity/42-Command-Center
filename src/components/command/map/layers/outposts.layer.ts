// ---------------------------------------------------------------------------
// Garrisons layer — white square markers with alphanumeric unit codes.
//
// SINGLE-TIER RENDERING (matches the SurveilTrack reference):
//   • Country/globe zoom (0–5): clustered white circle summaries
//   • Region/street zoom (5+): individual white square markers with
//     alphanumeric unit codes (e.g. "FNG-3300-NYC"), bright + crisp.
//
// ONE CONTINUOUS experience — the same white-square marker aesthetic at all
// zoom levels where individual garrisons are visible. No two-mode transition.
//
// Consumes source: "game:garrisons" (clustered GeoJSON points).
// Handles garrison click selection via the interaction context.
// ---------------------------------------------------------------------------

import type maplibregl from "maplibre-gl";
import type { FeatureCollection, Geometry } from "geojson";
import type { MapLayerSpec } from "../types";
import { GAME_SOURCE_IDS } from "../sources/game-engine.source";
import { makeStreetMarker } from "../utils/sprites";

const SRC = "garrisons-src";

// ---- Cached garrison features for reliable lngLat-based click hit-testing ----
// queryRenderedFeatures is unreliable under the globe projection + pitch (symbol
// and circle layers don't query consistently). Instead, onClick uses the click's
// lngLat to find the nearest cached garrison within a threshold. This is 100%
// projection-independent.
let cachedGarrisons: { id: string; lng: number; lat: number }[] = [];

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

export const garrisonsLayer: MapLayerSpec = {
  id: "garrisons",
  sourceIds: [GAME_SOURCE_IDS.garrisons],

  addSources(map) {
    map.addSource(SRC, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
      cluster: true,
      clusterRadius: 36,
      clusterMaxZoom: 4,
      promoteId: "id",
    });

    // Register the white-square marker sprite (used at all zoom levels).
    if (!map.hasImage("street-marker")) {
      map.addImage("street-marker", makeStreetMarker());
    }
  },

  addLayers(map) {
    // ===== SELECTION / UNDER-ATTACK PULSE (animated, all zoom levels) =====
    map.addLayer({
      id: "garrison-pulse",
      type: "circle",
      source: SRC,
      filter: ["any", ["==", ["get", "selected"], 1], ["==", ["get", "underAttack"], 1]],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 0, 14, 4, 20, 8, 28, 12, 16, 16, 22],
        "circle-color": "#fff",
        "circle-opacity": 0.25,
        "circle-blur": 0.8,
        "circle-stroke-width": 0,
      },
    });

    // ===== INDIVIDUAL GARRISON MARKERS (zoom 5+) =====

    // --- Garrison: transparent hitbox (reliable click target) ---
    // Symbol layers aren't reliably returned by queryRenderedFeatures under
    // pitch, so this invisible circle layer acts as the click target.
    map.addLayer({
      id: "garrison-hitbox",
      type: "circle",
      source: SRC,
      filter: ["!", ["has", "point_count"]],
      minzoom: 5,
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 8, 8, 10, 12, 12, 14, 14, 16, 16, 18, 18],
        "circle-color": "rgba(0,0,0,0)",
        "circle-stroke-color": "rgba(0,0,0,0)",
        "circle-stroke-width": 0,
        "circle-opacity": 0,
      },
    });

    // --- Garrison: white square marker (SurveilTrack-style, all zoom levels) ---
    map.addLayer({
      id: "garrison-square",
      type: "symbol",
      source: SRC,
      filter: ["!", ["has", "point_count"]],
      minzoom: 5,
      layout: {
        "icon-image": "street-marker",
        "icon-size": ["interpolate", ["linear"], ["zoom"], 5, 0.35, 8, 0.5, 12, 0.65, 14, 0.75, 16, 0.85, 18, 1.0],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        "symbol-sort-key": ["match", ["get", "type"], "Safehouse", 2, 1],
      },
      paint: {
        "icon-opacity": ["case", ["==", ["get", "offline"], 1], 0.4, 1],
      },
    });

    // --- Garrison: alphanumeric unit code label (e.g. "FNG-3300-NYC") ---
    map.addLayer({
      id: "garrison-code",
      type: "symbol",
      source: SRC,
      filter: ["!", ["has", "point_count"]],
      minzoom: 7,
      layout: {
        "text-field": "{code}",
        "text-font": ["Noto Sans Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 7, 8, 10, 9, 13, 11, 16, 13, 18, 14],
        "text-offset": [0, 1.4],
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

    // --- Garrison: selection bracket (brighter ring under the square) ---
    map.addLayer({
      id: "garrison-select",
      type: "circle",
      source: SRC,
      filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "selected"], 1]],
      minzoom: 5,
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 10, 8, 13, 12, 15, 16, 18, 18, 20],
        "circle-color": "rgba(0,0,0,0)",
        "circle-stroke-color": "#ffffff",
        "circle-stroke-opacity": 0.9,
        "circle-stroke-width": 1.5,
      },
    });

    // ===== CLUSTERS (globe/country zoom only — zoom 0–4) =====

    map.addLayer({
      id: "garrison-clusters",
      type: "circle",
      source: SRC,
      filter: ["has", "point_count"],
      maxzoom: 5,
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 0, 16, 4, 22],
        "circle-color": "rgba(255,255,255,0.08)",
        "circle-stroke-color": "#fff",
        "circle-stroke-width": 0.6,
        "circle-stroke-opacity": 0.5,
      },
    });
    map.addLayer({
      id: "garrison-cluster-label",
      type: "symbol",
      source: SRC,
      filter: ["has", "point_count"],
      maxzoom: 5,
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
    // Cache non-cluster garrison points for reliable lngLat-based click hit-testing.
    const fc = data as FeatureCollection<Geometry>;
    if (fc && Array.isArray(fc.features)) {
      cachedGarrisons = fc.features
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
      if (map.getLayer("garrison-pulse")) {
        map.setPaintProperty("garrison-pulse", "circle-opacity", pulse);
        map.setPaintProperty("garrison-pulse", "circle-radius", [
          "interpolate", ["linear"], ["zoom"],
          0, 14 + radiusBoost, 4, 20 + radiusBoost, 8, 28 + radiusBoost, 12, 16, 16, 22,
        ]);
      }
    } catch {
      /* layer not ready */
    }
  },

  onClick(map, e, ctx) {
    // ---- Primary hit-test: nearest garrison to the click's lngLat ----
    // queryRenderedFeatures is unreliable under the globe projection + pitch
    // (symbol/circle layers don't query consistently), so we use the click's
    // geographic coordinates to find the nearest cached garrison within a
    // zoom-aware threshold. This is 100% projection-independent.
    const lngLat = e.lngLat as { lng: number; lat: number };
    const zoom = map.getZoom();
    // Click tolerance in meters — shrinks at higher zoom (markers are visually
    // closer together). Generous at street zoom because the globe+pitch
    // unproject() has ~500m of positional error vs the rendered marker.
    const thresholdMeters = zoom < 5 ? 50000 : zoom < 8 ? 8000 : zoom < 12 ? 2000 : 1200;

    let nearest: { id: string; dist: number } | null = null;
    for (const op of cachedGarrisons) {
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
      layers: ["garrison-clusters"],
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
