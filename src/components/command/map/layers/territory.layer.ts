// ---------------------------------------------------------------------------
// Territory layer — control polygons + per-outpost influence halos.
//
// Consumes source: "game:territories" (merged polygons + halos).
// Renders: territory fill (opacity by control %), territory outline (dashed
// when contested), territory labels, halo fill + dashed outline.
//
// This layer demonstrates the pattern: addSources creates empty GeoJSON
// sources, addLayers creates the MapLibre render layers, onData populates
// the source when the game-engine emits new state.
// ---------------------------------------------------------------------------

import type maplibregl from "maplibre-gl";
import type { MapLayerSpec } from "../types";
import { GAME_SOURCE_IDS } from "../sources/game-engine.source";

const SRC = "territory-src";

export const territoryLayer: MapLayerSpec = {
  id: "territory",
  sourceIds: [GAME_SOURCE_IDS.territories],

  addSources(map) {
    map.addSource(SRC, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  },

  addLayers(map) {
    // --- Territory control: fill (opacity driven by control %) ---
    map.addLayer({
      id: "territory-fill",
      type: "fill",
      source: SRC,
      filter: ["==", ["get", "kind"], "territory"],
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
      source: SRC,
      filter: ["==", ["get", "kind"], "territory"],
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
    // --- Territory label ---
    try {
      map.addLayer({
        id: "territory-label",
        type: "symbol",
        source: SRC,
        filter: ["==", ["get", "kind"], "territory"],
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
      /* Noto Sans not available */
    }

    // --- Per-outpost influence halos: faint fill + dashed outline ---
    map.addLayer({
      id: "halos-fill",
      type: "fill",
      source: SRC,
      filter: ["==", ["get", "kind"], "halo"],
      paint: {
        "fill-color": "#fff",
        "fill-opacity": 0.025,
      },
    });
    map.addLayer({
      id: "halos-line",
      type: "line",
      source: SRC,
      filter: ["==", ["get", "kind"], "halo"],
      paint: {
        "line-color": "#fff",
        "line-opacity": 0.2,
        "line-width": 0.7,
        "line-dasharray": ["case", ["==", ["get", "dashed"], 1], ["literal", [4, 3]], ["literal", [1, 0]]],
      },
    });
  },

  onData(map, _sourceId, data) {
    const src = map.getSource(SRC) as maplibregl.GeoJSONSource | undefined;
    if (src) src.setData(data);
  },
};
