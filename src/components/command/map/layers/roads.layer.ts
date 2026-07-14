// ---------------------------------------------------------------------------
// Roads layer — vector tile roads from the active provider.
//
// Uses the "vector-tiles" source added by map-controller (when available).
// Renders thin white road lines with opacity by road class — motorways and
// trunks are brightest, service roads and paths are dimmest. Shown only at
// zoom 6+ (country/continent view needs roads; globe view doesn't).
//
// This layer demonstrates the "no-source-subscription" pattern: it doesn't
// consume NormalizedEvents — it renders directly from the vector tile source.
// sourceIds is empty so the host routes no events to it.
//
// If the active provider has no vector tiles (Esri satellite-only), this
// layer's addLayers() is a no-op.
// ---------------------------------------------------------------------------

import type maplibregl from "maplibre-gl";
import type { MapLayerSpec } from "../types";

const VECTOR_SRC = "vector-tiles";

export const roadsLayer: MapLayerSpec = {
  id: "roads",
  sourceIds: [],

  addLayers(map) {
    if (!map.getSource(VECTOR_SRC)) return;

    // Roads — opacity by class. OpenMapTiles schema:
    // class: motorway | trunk | primary | secondary | tertiary | minor | service | path
    map.addLayer({
      id: "roads-line",
      type: "line",
      source: VECTOR_SRC,
      "source-layer": "transportation",
      minzoom: 6,
      filter: ["!=", ["get", "class"], "path"],
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": "#ffffff",
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          6, 0.3,
          10, 0.6,
          14, 1.2,
          18, 2.4,
        ],
        "line-opacity": [
          "match",
          ["get", "class"],
          ["motorway", "trunk"], 0.55,
          ["primary"], 0.42,
          ["secondary"], 0.32,
          ["tertiary"], 0.24,
          ["minor", "service"], 0.16,
          0.10,
        ],
      },
    });

    // Paths — separate layer, dimmer, only at higher zoom
    map.addLayer({
      id: "roads-path",
      type: "line",
      source: VECTOR_SRC,
      "source-layer": "transportation",
      minzoom: 12,
      filter: ["==", ["get", "class"], "path"],
      paint: {
        "line-color": "#ffffff",
        "line-width": ["interpolate", ["linear"], ["zoom"], 12, 0.2, 16, 0.5],
        "line-opacity": 0.12,
        "line-dasharray": [2, 2],
      },
    });
  },

  destroy(map) {
    if (map.getLayer("roads-line")) map.removeLayer("roads-line");
    if (map.getLayer("roads-path")) map.removeLayer("roads-path");
  },
};
