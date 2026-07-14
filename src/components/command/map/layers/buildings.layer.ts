// ---------------------------------------------------------------------------
// Buildings layer — 3D fill-extrusion from vector tile building footprints.
//
// Uses the "vector-tiles" source added by map-controller (when available).
// Renders 3D building extrusions in dark gray with subtle white tops, only at
// zoom 14+ (city/street level). Below that, buildings would be invisible noise.
//
// OpenMapTiles building layer has `render_height` and `render_min_height`
// properties (in meters) which MapLibre's fill-extrusion uses directly.
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

export const buildingsLayer: MapLayerSpec = {
  id: "buildings",
  sourceIds: [],

  addLayers(map) {
    if (!map.getSource(VECTOR_SRC)) return;

    // 3D building extrusions — dark gray bodies with white tops.
    // fill-extrusion-height uses render_height (meters); fallback to a flat
    // 6m when the property is missing (some tiles omit it).
    map.addLayer({
      id: "buildings-3d",
      type: "fill-extrusion",
      source: VECTOR_SRC,
      "source-layer": "building",
      minzoom: 14,
      paint: {
        "fill-extrusion-color": "#1a1a1a",
        "fill-extrusion-height": [
          "coalesce",
          ["get", "render_height"],
          6,
        ],
        "fill-extrusion-base": [
          "coalesce",
          ["get", "render_min_height"],
          0,
        ],
        "fill-extrusion-opacity": 0.85,
        "fill-extrusion-vertical-gradient": true,
      },
    });

    // Building outlines — thin white edges at very high zoom for definition.
    map.addLayer({
      id: "buildings-edge",
      type: "line",
      source: VECTOR_SRC,
      "source-layer": "building",
      minzoom: 16,
      paint: {
        "line-color": "#ffffff",
        "line-width": 0.4,
        "line-opacity": 0.35,
      },
    });
  },

  destroy(map) {
    if (map.getLayer("buildings-3d")) map.removeLayer("buildings-3d");
    if (map.getLayer("buildings-edge")) map.removeLayer("buildings-edge");
  },
};
