// ---------------------------------------------------------------------------
// Garrisons layer — white square markers with alphanumeric unit codes.
//
// ALL-GARRISONS-ALWAYS-VISIBLE (no clustering):
//   • Every garrison (friendly + identified enemy) is rendered as an individual
//     white square marker at ALL zoom levels — from globe view (zoom 0) down
//     to street view (zoom 18+). No clustering, no appear/disappear on zoom.
//   • Globe/country zoom (0–5): small white squares (icon-size ~0.18–0.35)
//   • Region/street zoom (5+): larger white squares + alphanumeric unit codes
//     (e.g. "FNG-3300-NYC"), bright + crisp.
//
// ONE CONTINUOUS experience — the same white-square marker aesthetic at all
// zoom levels. Garrisons never vanish when zooming or panning.
//
// Consumes source: "game:garrisons" (non-clustered GeoJSON points).
// Handles garrison click selection via the interaction context.
// ---------------------------------------------------------------------------

import type maplibregl from "maplibre-gl";
import type { FeatureCollection, Geometry, Point } from "geojson";
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
      // NO clustering — every garrison is always rendered as an individual
      // marker. This was the root-cause fix for "garrisons appear and disappear
      // from the map": with clustering, spread-out garrisons at globe zoom
      // didn't form clusters (clusterRadius too small relative to globe scale),
      // and individual markers were hidden by minzoom:5 → empty map at low zoom.
      cluster: false,
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
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 0, 8, 2, 10, 4, 14, 8, 20, 12, 16, 16, 22],
        "circle-color": "#fff",
        "circle-opacity": 0.25,
        "circle-blur": 0.8,
        "circle-stroke-width": 0,
      },
    });

    // ===== INDIVIDUAL GARRISON MARKERS (ALL zoom levels — no minzoom) =====

    // --- Garrison: transparent hitbox (reliable click target) ---
    // Symbol layers aren't reliably returned by queryRenderedFeatures under
    // pitch, so this invisible circle layer acts as the click target.
    // No minzoom — clickable at every zoom level (globe → street).
    map.addLayer({
      id: "garrison-hitbox",
      type: "circle",
      source: SRC,
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 0, 6, 2, 7, 5, 8, 8, 10, 12, 12, 14, 14, 16, 16, 18, 18],
        "circle-color": "rgba(0,0,0,0)",
        "circle-stroke-color": "rgba(0,0,0,0)",
        "circle-stroke-width": 0,
        "circle-opacity": 0,
      },
    });

    // --- Garrison: white square marker (SurveilTrack-style, all zoom levels) ---
    // No minzoom — visible from globe view (zoom 0) onward. icon-size interpolates
    // from a small dot at globe zoom (0.18) up to a crisp square at street zoom (1.0).
    map.addLayer({
      id: "garrison-square",
      type: "symbol",
      source: SRC,
      layout: {
        "icon-image": "street-marker",
        "icon-size": ["interpolate", ["linear"], ["zoom"], 0, 0.18, 2, 0.24, 5, 0.35, 8, 0.5, 12, 0.65, 14, 0.75, 16, 0.85, 18, 1.0],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        "symbol-sort-key": ["match", ["get", "type"], "Safehouse", 2, 1],
      },
      paint: {
        "icon-opacity": ["case", ["==", ["get", "offline"], 1], 0.4, 1],
      },
    });

    // --- Garrison: alphanumeric unit code label (e.g. "FNG-3300-NYC") ---
    // Shown from zoom 6+ (was 7) — labels appear earlier so users can identify
    // garrisons at region zoom without needing to zoom all the way to street.
    map.addLayer({
      id: "garrison-code",
      type: "symbol",
      source: SRC,
      minzoom: 6,
      layout: {
        "text-field": "{code}",
        "text-font": ["Noto Sans Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 6, 8, 10, 9, 13, 11, 16, 13, 18, 14],
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
    // No minzoom — selection ring shows at every zoom level so the user can
    // see which garrison is selected even at globe view.
    map.addLayer({
      id: "garrison-select",
      type: "circle",
      source: SRC,
      filter: ["all", ["==", ["get", "selected"], 1]],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 0, 7, 2, 8, 5, 10, 8, 13, 12, 15, 16, 18, 18, 20],
        "circle-color": "rgba(0,0,0,0)",
        "circle-stroke-color": "#ffffff",
        "circle-stroke-opacity": 0.9,
        "circle-stroke-width": 1.5,
      },
    });
  },

  onData(map, _sourceId, data) {
    const src = map.getSource(SRC) as maplibregl.GeoJSONSource | undefined;
    if (src) src.setData(data);
    // Cache garrison points for reliable lngLat-based click hit-testing.
    // With clustering disabled, every feature is an individual garrison.
    const fc = data as FeatureCollection<Geometry>;
    if (fc && Array.isArray(fc.features)) {
      cachedGarrisons = fc.features
        .filter((f): f is typeof f & { geometry: Point } => f.geometry?.type === "Point")
        .map((f) => {
          const c = f.geometry.coordinates as [number, number];
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
          0, 8 + radiusBoost, 2, 10 + radiusBoost, 4, 14 + radiusBoost, 8, 20 + radiusBoost, 12, 16, 16, 22,
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
    //
    // Threshold is generous at low zoom (globe view — clicks are imprecise,
    // and the globe+pitch unproject() has ~500m of positional error even at
    // street zoom). At street zoom the threshold shrinks so adjacent
    // garrisons don't steal each other's clicks.
    const lngLat = e.lngLat as { lng: number; lat: number };
    const zoom = map.getZoom();
    const thresholdMeters =
      zoom < 2 ? 1_500_000 // ~1500km — globe view, whole-earth clicks
      : zoom < 4 ? 600_000   // ~600km — continent view
      : zoom < 6 ? 200_000   // ~200km — country view
      : zoom < 8 ? 50_000    // ~50km — region view
      : zoom < 12 ? 8_000    // ~8km — city view
      : 2_000;               // ~2km — street view (tight, markers are visually distinct)

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
  },

  onHover(map, entering, ctx) {
    if (ctx?.interaction?.placementMode) {
      map.getCanvas().style.cursor = "crosshair";
    } else {
      map.getCanvas().style.cursor = entering ? "pointer" : "grab";
    }
  },
};
