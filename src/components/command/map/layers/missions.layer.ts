// ---------------------------------------------------------------------------
// Missions layer — aggressive/passive arcs, impact glows, progress heads.
//
// Consumes source: "game:missions" (merged FeatureCollection containing
// LineString arcs + Point impacts + Point progress heads, distinguished by
// the "kind" property).
//
// Renders:
//   - Aggressive mission arcs (dashed, pulsing opacity for ACTIVE)
//   - Passive mission arcs (lighter, thinner)
//   - Impact glow at aggressive-mission targets (pulsing radius)
//   - Progress comet heads (bright moving dots)
// ---------------------------------------------------------------------------

import type maplibregl from "maplibre-gl";
import type { MapLayerSpec } from "../types";
import { GAME_SOURCE_IDS } from "../sources/game-engine.source";

const SRC = "missions-src";

export const missionsLayer: MapLayerSpec = {
  id: "missions",
  sourceIds: [GAME_SOURCE_IDS.missions],

  addSources(map) {
    map.addSource(SRC, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  },

  addLayers(map) {
    // --- Aggressive mission arcs (dashed, pulsing) ---
    map.addLayer({
      id: "vectors-agg-line",
      type: "line",
      source: SRC,
      filter: ["all", ["==", ["get", "kind"], "arc"], ["==", ["get", "aggressive"], 1]],
      paint: {
        "line-color": "#fff",
        "line-opacity": ["case", ["==", ["get", "status"], "ACTIVE"], 0.85, 0.3],
        "line-width": 1.6,
        "line-dasharray": [3, 4],
      },
    });
    // --- Passive mission arcs (lighter, thinner) ---
    map.addLayer({
      id: "vectors-pass-line",
      type: "line",
      source: SRC,
      filter: ["all", ["==", ["get", "kind"], "arc"], ["==", ["get", "aggressive"], 0]],
      paint: {
        "line-color": "#fff",
        "line-opacity": ["case", ["==", ["get", "status"], "ACTIVE"], 0.6, 0.2],
        "line-width": 0.9,
        "line-dasharray": [1, 5],
      },
    });
    // --- Impact glow at aggressive-mission targets (pulsing) ---
    map.addLayer({
      id: "vectors-agg-impact",
      type: "circle",
      source: SRC,
      filter: ["==", ["get", "kind"], "impact"],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 0, 8, 4, 10, 8, 12],
        "circle-color": "#fff",
        "circle-opacity": 0.5,
        "circle-blur": 1,
        "circle-stroke-width": 0,
      },
    });
    // --- Progress comet heads ---
    map.addLayer({
      id: "progress-heads",
      type: "circle",
      source: SRC,
      filter: ["==", ["get", "kind"], "progress"],
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
  },

  onData(map, _sourceId, data) {
    const src = map.getSource(SRC) as maplibregl.GeoJSONSource | undefined;
    if (src) src.setData(data);
  },

  animate(map, now) {
    const t = (now % 1800) / 1800;
    // Pulsing impact glow at aggressive-mission targets
    try {
      if (map.getLayer("vectors-agg-impact")) {
        const impactR = 10 + 4 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2));
        map.setPaintProperty("vectors-agg-impact", "circle-radius", [
          "interpolate", ["linear"], ["zoom"], 0, impactR - 2, 4, impactR, 8, impactR + 2,
        ]);
      }
    } catch { /* not ready */ }
    // Subtle opacity pulse on aggressive mission lines
    try {
      if (map.getLayer("vectors-agg-line")) {
        const linePulse = 0.78 + 0.07 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2));
        map.setPaintProperty("vectors-agg-line", "line-opacity", [
          "case",
          ["==", ["get", "status"], "ACTIVE"], linePulse,
          0.3,
        ]);
      }
    } catch { /* not ready */ }
  },
};
