// ---------------------------------------------------------------------------
// Roads layer — vector tile roads from the active provider.
//
// SurveilTrack-style bright white road network on the dark base: a dark
// casing (outline) under each road class plus a crisp white center line,
// widening continuously with zoom so the network reads as the bright
// infrastructure grid seen in the reference.
//
// ONE CONTINUOUS experience: major roads appear at country zoom (zoom 4+),
// minor roads at region zoom, paths at city zoom. Smooth width scaling
// across the full zoom range — no mode transition.
//
// Uses the "vector-tiles" source added by map-controller (when available).
//
// This layer demonstrates the "no-source-subscription" pattern: it doesn't
// consume NormalizedEvents — it renders directly from the vector tile source.
// sourceIds is empty so the host routes no events to it.
//
// If the active provider has no vector tiles, this layer's addLayers() is a no-op.
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

    // 1. Road casing (dark outline under each road for separation from buildings).
    map.addLayer({
      id: "roads-casing",
      type: "line",
      source: VECTOR_SRC,
      "source-layer": "transportation",
      minzoom: 4,
      filter: ["!=", ["get", "class"], "path"],
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": "#000000",
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          4, 0.4,
          8, 0.7,
          12, 1.4,
          14, 2.2,
          16, 4.5,
          18, 8.0,
        ],
        "line-opacity": [
          "match",
          ["get", "class"],
          ["motorway", "trunk"], 0.85,
          ["primary"], 0.7,
          ["secondary"], 0.6,
          ["tertiary"], 0.5,
          ["minor", "service"], 0.4,
          0.3,
        ],
      },
    });

    // 2. Road center line — bright white, width by road class.
    map.addLayer({
      id: "roads-line",
      type: "line",
      source: VECTOR_SRC,
      "source-layer": "transportation",
      minzoom: 4,
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
          4, 0.2,
          8, 0.4,
          12, 0.8,
          14, 1.4,
          16, 2.8,
          18, 5.0,
        ],
        "line-opacity": [
          "match",
          ["get", "class"],
          ["motorway", "trunk"], 0.95,
          ["primary"], 0.85,
          ["secondary"], 0.75,
          ["tertiary"], 0.6,
          ["minor", "service"], 0.45,
          0.3,
        ],
      },
    });

    // 3. Paths — separate layer, dimmer, dashed, only at higher zoom.
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
        "line-opacity": 0.2,
        "line-dasharray": [2, 2],
      },
    });
  },

  destroy(map) {
    if (map.getLayer("roads-casing")) map.removeLayer("roads-casing");
    if (map.getLayer("roads-line")) map.removeLayer("roads-line");
    if (map.getLayer("roads-path")) map.removeLayer("roads-path");
  },
};
