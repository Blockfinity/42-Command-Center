/**
 * Mission Impacts Layer
 * =====================
 * Pulsing impact glow at aggressive-mission targets. Radius + opacity animated.
 *
 * Consumes: arc:upsert, arc:remove, snapshot from sources.
 * Subscribes to: "game-engine" (aggressive missions).
 */

import type { MapLayerSpec, NormalizedEvent } from "../types";
import { emptyCollection, greatCircle } from "../utils/geo";

const SOURCE_ID = "vectors-agg-impact";

export const missionImpactsLayer: MapLayerSpec = {
  id: "mission-impacts",
  minZoom: 0,
  sources: ["game-engine"],

  mount: (ctx) => {
    const map = ctx.map;

    map.addSource(SOURCE_ID, {
      type: "geojson",
      data: emptyCollection(),
    });

    map.addLayer({
      id: "vectors-agg-impact",
      type: "circle",
      source: SOURCE_ID,
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 0, 8, 4, 10, 8, 12],
        "circle-color": "#fff",
        "circle-opacity": 0.5,
        "circle-blur": 1,
        "circle-stroke-width": 0,
      },
    });
  },

  unmount: (map) => {
    if (map.getLayer("vectors-agg-impact")) map.removeLayer("vectors-agg-impact");
    if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
  },

  onEvent: (event: NormalizedEvent, ctx) => {
    const map = ctx.map;
    const src = map.getSource(SOURCE_ID) as any;
    if (!src) return;

    if (event.type === "snapshot" && event.arcs) {
      // Only aggressive, active/complete missions
      const impacts = event.arcs
        .filter((a) => a.props.aggressive === 1 && (a.props.status === "ACTIVE" || a.props.status === "COMPLETE"))
        .map((a) => ({
          type: "Feature" as const,
          properties: { id: a.id, ...a.props },
          geometry: { type: "Point" as const, coordinates: [a.props.targetLng, a.props.targetLat] },
        }));
      src.setData({ type: "FeatureCollection", features: impacts });
    }
    // Incremental updates handled by snapshot path — at 2s cadence, snapshots
    // are frequent enough. Per-arc events can be added for future delta sources.
  },

  animate: (ctx, t: number) => {
    const map = ctx.map;
    if (map.getLayer("vectors-agg-impact")) {
      try {
        const impactR = 10 + 4 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2));
        map.setPaintProperty("vectors-agg-impact", "circle-radius", [
          "interpolate",
          ["linear"],
          ["zoom"],
          0,
          impactR - 2,
          4,
          impactR,
          8,
          impactR + 2,
        ]);
      } catch {
        /* layer not ready */
      }
    }
  },
};
