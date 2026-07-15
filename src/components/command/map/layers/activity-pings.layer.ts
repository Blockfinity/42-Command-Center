// ---------------------------------------------------------------------------
// Activity pings layer — the "millions of actions" sonar visualization.
//
// Consumes source: "game:pings" (transient points with computed `age` 0..1).
// Renders: expanding sonar ring (fades as it grows) + bright core (fades over
// lifetime).
//
// Pings are aged by the source adapter (the `age` property is baked into each
// feature at emit time). This layer just renders them — no per-frame recalculation
// needed beyond what the source emits.
// ---------------------------------------------------------------------------

import type maplibregl from "maplibre-gl";
import type { MapLayerSpec } from "../types";
import { GAME_SOURCE_IDS } from "../sources/game-engine.source";

const SRC = "pings-src";

export const activityPingsLayer: MapLayerSpec = {
  id: "activity-pings",
  sourceIds: [GAME_SOURCE_IDS.pings],

  addSources(map) {
    map.addSource(SRC, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  },

  addLayers(map) {
    // --- Expanding sonar ring (fades as it grows) ---
    map.addLayer({
      id: "ping-ring",
      type: "circle",
      source: SRC,
      paint: {
        "circle-radius": [
          "interpolate", ["linear"], ["zoom"],
          0, ["interpolate", ["linear"], ["get", "age"], 0, 2, 1, 14],
          4, ["interpolate", ["linear"], ["get", "age"], 0, 3, 1, 22],
          8, ["interpolate", ["linear"], ["get", "age"], 0, 4, 1, 30],
        ],
        "circle-color": "#fff",
        "circle-opacity": ["interpolate", ["linear"], ["get", "age"], 0, 0.7, 1, 0],
        "circle-blur": 1.2,
        "circle-stroke-width": 0,
      },
    });
    // --- Bright core (fades over lifetime) ---
    map.addLayer({
      id: "ping-core",
      type: "circle",
      source: SRC,
      paint: {
        "circle-radius": 2,
        "circle-color": "#fff",
        "circle-opacity": ["interpolate", ["linear"], ["get", "age"], 0, 0.9, 0.8, 0],
        "circle-stroke-width": 0,
      },
    });
  },

  onData(map, _sourceId, data) {
    const src = map.getSource(SRC) as maplibregl.GeoJSONSource | undefined;
    if (src) src.setData(data);
  },
};
