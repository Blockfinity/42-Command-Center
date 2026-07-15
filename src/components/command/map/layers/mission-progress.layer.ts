/**
 * Mission Progress Layer
 * ======================
 * Moving comet heads (bright dots) that travel along mission arcs from source
 * to target. Position is interpolated from mission progress (0-100%).
 *
 * Consumes: arc:upsert, arc:remove, snapshot from sources.
 * Subscribes to: "game-engine" (active/complete missions).
 *
 * The layer maintains its own mission store and recomputes progress head
 * positions every animate() frame from the latest mission progress values.
 */

import type { MapLayerSpec, NormalizedEvent, MapArc } from "../types";
import { greatCirclePoint, emptyCollection } from "../utils/geo";

const SOURCE_ID = "progress-heads";

export const missionProgressLayer: MapLayerSpec = {
  id: "mission-progress",
  minZoom: 0,
  sources: ["game-engine"],

  mount: (ctx) => {
    const map = ctx.map;

    map.addSource(SOURCE_ID, {
      type: "geojson",
      data: emptyCollection(),
    });

    map.addLayer({
      id: "progress-heads",
      type: "circle",
      source: SOURCE_ID,
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

    // Store arcs for progress head computation
    (map as any).__arcs = [] as MapArc[];
  },

  unmount: (map) => {
    if (map.getLayer("progress-heads")) map.removeLayer("progress-heads");
    if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    delete (map as any).__arcs;
  },

  onEvent: (event: NormalizedEvent, ctx) => {
    const map = ctx.map;
    const arcs: MapArc[] = (map as any).__arcs ?? [];

    if (event.type === "snapshot" && event.arcs) {
      (map as any).__arcs = event.arcs.filter(
        (a) => a.props.status === "ACTIVE" || a.props.status === "COMPLETE",
      );
    } else if (event.type === "arc:upsert") {
      if (event.arc.props.status !== "ACTIVE" && event.arc.props.status !== "COMPLETE") {
        // Remove if now in a non-active state
        const idx = arcs.findIndex((a) => a.id === event.arc.id);
        if (idx >= 0) arcs.splice(idx, 1);
      } else {
        const idx = arcs.findIndex((a) => a.id === event.arc.id);
        if (idx >= 0) arcs[idx] = event.arc;
        else arcs.push(event.arc);
      }
      (map as any).__arcs = arcs;
    } else if (event.type === "arc:remove") {
      (map as any).__arcs = arcs.filter((a) => a.id !== event.id);
    }
  },

  animate: (ctx) => {
    const map = ctx.map;
    const src = map.getSource(SOURCE_ID) as any;
    if (!src) return;

    const arcs: MapArc[] = (map as any).__arcs ?? [];

    const features = arcs
      .map((a) => {
        const progress = (a.props.progress ?? 0) / 100;
        const pos = greatCirclePoint(a.from, a.to, Math.min(1, Math.max(0, progress)));
        return {
          type: "Feature" as const,
          properties: { id: a.id, ...a.props },
          geometry: { type: "Point" as const, coordinates: pos },
        };
      });

    src.setData({ type: "FeatureCollection", features });
  },
};
