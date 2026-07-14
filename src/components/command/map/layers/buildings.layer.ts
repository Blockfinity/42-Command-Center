// ---------------------------------------------------------------------------
// Buildings layer — 3D fill-extrusion from vector tile building footprints.
//
// SurveilTrack-style dark gray 3D cityscape: dark extruded bodies with bright
// white top caps and crisp white edges. Height is amplified at street zoom so
// the cityscape reads with cinematic depth (matching the reference's tall,
// blocky isometric buildings).
//
// Uses the "vector-tiles" source added by map-controller (when available).
// Renders only at zoom 12+ (city/street level). Below that, invisible.
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

    // 3D building extrusions — dark gray bodies with a bright white top cap.
    // fill-extrusion-height uses render_height (meters), amplified 1.6× at
    // street zoom for cinematic prominence. Fallback to a flat 8m when the
    // property is missing (some tiles omit it).
    map.addLayer({
      id: "buildings-3d",
      type: "fill-extrusion",
      source: VECTOR_SRC,
      "source-layer": "building",
      minzoom: 12,
      paint: {
        "fill-extrusion-color": "#161616",
        "fill-extrusion-height": [
          "interpolate",
          ["linear"],
          ["zoom"],
          12, ["*", ["coalesce", ["get", "render_height"], 8], 1.0],
          15, ["*", ["coalesce", ["get", "render_height"], 8], 1.6],
          18, ["*", ["coalesce", ["get", "render_height"], 8], 2.0],
        ],
        "fill-extrusion-base": [
          "coalesce",
          ["get", "render_min_height"],
          0,
        ],
        "fill-extrusion-opacity": 0.92,
        "fill-extrusion-vertical-gradient": true,
      },
    });

    // Building top highlights — a second fill-extrusion layer rendering only
    // the roof plane (base = height) in bright white so the cityscape gets
    // the crisp rooftop definition seen in the SurveilTrack reference.
    map.addLayer({
      id: "buildings-top",
      type: "fill-extrusion",
      source: VECTOR_SRC,
      "source-layer": "building",
      minzoom: 13,
      paint: {
        "fill-extrusion-color": "#e8e8e8",
        "fill-extrusion-height": [
          "interpolate",
          ["linear"],
          ["zoom"],
          13, ["*", ["coalesce", ["get", "render_height"], 8], 1.2],
          15, ["*", ["coalesce", ["get", "render_height"], 8], 1.6],
          18, ["*", ["coalesce", ["get", "render_height"], 8], 2.0],
        ],
        "fill-extrusion-base": [
          "interpolate",
          ["linear"],
          ["zoom"],
          13, ["*", ["coalesce", ["get", "render_height"], 8], 1.2],
          15, ["*", ["coalesce", ["get", "render_height"], 8], 1.6],
          18, ["*", ["coalesce", ["get", "render_height"], 8], 2.0],
        ],
        "fill-extrusion-opacity": 0.18,
        "fill-extrusion-vertical-gradient": false,
      },
    });

    // Building footprints — faint white outline at city zoom for definition.
    map.addLayer({
      id: "buildings-edge",
      type: "line",
      source: VECTOR_SRC,
      "source-layer": "building",
      minzoom: 14,
      paint: {
        "line-color": "#ffffff",
        "line-width": ["interpolate", ["linear"], ["zoom"], 14, 0.3, 16, 0.6, 18, 0.9],
        "line-opacity": 0.4,
      },
    });
  },

  destroy(map) {
    if (map.getLayer("buildings-3d")) map.removeLayer("buildings-3d");
    if (map.getLayer("buildings-top")) map.removeLayer("buildings-top");
    if (map.getLayer("buildings-edge")) map.removeLayer("buildings-edge");
  },
};
