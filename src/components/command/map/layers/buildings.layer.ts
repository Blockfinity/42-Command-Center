// ---------------------------------------------------------------------------
// Buildings layer — 3D fill-extrusion from vector tile building footprints.
//
// SurveilTrack-style dark 3D cityscape: solid dark extruded bodies with
// subtle white top caps and crisp white edge outlines at street zoom.
// Height scales continuously with zoom for a cinematic depth effect.
//
// ONE CONTINUOUS experience: buildings appear at region zoom (zoom 10+)
// and scale up smoothly to street zoom. No hard mode transition.
//
// Uses the "vector-tiles" source added by map-controller (when available).
// OpenMapTiles building layer has `render_height` and `render_min_height`
// properties (in meters) which MapLibre's fill-extrusion uses directly.
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

export const buildingsLayer: MapLayerSpec = {
  id: "buildings",
  sourceIds: [],

  addLayers(map) {
    if (!map.getSource(VECTOR_SRC)) return;

    // 3D building extrusions — solid dark bodies.
    // fill-extrusion-height uses render_height (meters), amplified continuously
    // across zoom for cinematic prominence. Fallback to a flat 8m when the
    // property is missing (some tiles omit it).
    map.addLayer({
      id: "buildings-3d",
      type: "fill-extrusion",
      source: VECTOR_SRC,
      "source-layer": "building",
      minzoom: 10,
      paint: {
        "fill-extrusion-color": "#0d0d0f",
        "fill-extrusion-height": [
          "interpolate",
          ["linear"],
          ["zoom"],
          10, ["*", ["coalesce", ["get", "render_height"], 8], 0.4],
          12, ["*", ["coalesce", ["get", "render_height"], 8], 0.8],
          14, ["*", ["coalesce", ["get", "render_height"], 8], 1.3],
          16, ["*", ["coalesce", ["get", "render_height"], 8], 1.8],
          18, ["*", ["coalesce", ["get", "render_height"], 8], 2.2],
        ],
        "fill-extrusion-base": [
          "coalesce",
          ["get", "render_min_height"],
          0,
        ],
        "fill-extrusion-opacity": 0.96,
        "fill-extrusion-vertical-gradient": true,
      },
    });

    // Building top highlights — a second fill-extrusion layer rendering only
    // the roof plane (base = height) in bright white so the cityscape gets
    // crisp rooftop definition at street zoom (matching the reference).
    map.addLayer({
      id: "buildings-top",
      type: "fill-extrusion",
      source: VECTOR_SRC,
      "source-layer": "building",
      minzoom: 12,
      paint: {
        "fill-extrusion-color": "#e8e8e8",
        "fill-extrusion-height": [
          "interpolate",
          ["linear"],
          ["zoom"],
          12, ["*", ["coalesce", ["get", "render_height"], 8], 0.8],
          14, ["*", ["coalesce", ["get", "render_height"], 8], 1.3],
          16, ["*", ["coalesce", ["get", "render_height"], 8], 1.8],
          18, ["*", ["coalesce", ["get", "render_height"], 8], 2.2],
        ],
        "fill-extrusion-base": [
          "interpolate",
          ["linear"],
          ["zoom"],
          12, ["*", ["coalesce", ["get", "render_height"], 8], 0.8],
          14, ["*", ["coalesce", ["get", "render_height"], 8], 1.3],
          16, ["*", ["coalesce", ["get", "render_height"], 8], 1.8],
          18, ["*", ["coalesce", ["get", "render_height"], 8], 2.2],
        ],
        "fill-extrusion-opacity": [
          "interpolate", ["linear"], ["zoom"],
          12, 0.0,
          14, 0.12,
          16, 0.20,
          18, 0.25,
        ],
        "fill-extrusion-vertical-gradient": false,
      },
    });

    // Building footprints — faint white outline at street zoom for definition.
    map.addLayer({
      id: "buildings-edge",
      type: "line",
      source: VECTOR_SRC,
      "source-layer": "building",
      minzoom: 13,
      paint: {
        "line-color": "#ffffff",
        "line-width": ["interpolate", ["linear"], ["zoom"], 13, 0.3, 16, 0.6, 18, 0.9],
        "line-opacity": 0.35,
      },
    });
  },

  destroy(map) {
    if (map.getLayer("buildings-3d")) map.removeLayer("buildings-3d");
    if (map.getLayer("buildings-top")) map.removeLayer("buildings-top");
    if (map.getLayer("buildings-edge")) map.removeLayer("buildings-edge");
  },
};
