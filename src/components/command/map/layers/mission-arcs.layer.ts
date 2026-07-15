/**
 * Mission Arcs Layer
 * ==================
 * Great-circle mission vectors, split into aggressive (solid, dashed) and
 * passive (lighter, thinner). Aggressive lines have animated opacity pulse.
 *
 * Consumes: arc:upsert, arc:remove, snapshot from sources.
 * Subscribes to: "game-engine" (missions).
 */

import type { MapLayerSpec, NormalizedEvent } from "../types";
import { arcsToCollection, emptyCollection } from "../utils/geo";

const SOURCE_AGG = "vectors-agg";
const SOURCE_PASS = "vectors-pass";

export const missionArcsLayer: MapLayerSpec = {
  id: "mission-arcs",
  minZoom: 0,
  sources: ["game-engine"],

  mount: (ctx) => {
    const map = ctx.map;

    map.addSource(SOURCE_AGG, { type: "geojson", data: emptyCollection() });
    map.addSource(SOURCE_PASS, { type: "geojson", data: emptyCollection() });

    // Aggressive (solid-ish, dashed) — drone strikes, cyber attacks, espionage
    map.addLayer({
      id: "vectors-agg-line",
      type: "line",
      source: SOURCE_AGG,
      paint: {
        "line-color": "#fff",
        "line-opacity": ["case", ["==", ["get", "status"], "ACTIVE"], 0.85, 0.3],
        "line-width": 1.6,
        "line-dasharray": [3, 4],
      },
    });

    // Passive (lighter, thinner) — recon, build, defend
    map.addLayer({
      id: "vectors-pass-line",
      type: "line",
      source: SOURCE_PASS,
      paint: {
        "line-color": "#fff",
        "line-opacity": ["case", ["==", ["get", "status"], "ACTIVE"], 0.6, 0.2],
        "line-width": 0.9,
        "line-dasharray": [1, 5],
      },
    });
  },

  unmount: (map) => {
    ["vectors-pass-line", "vectors-agg-line"].forEach((id) => {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    [SOURCE_PASS, SOURCE_AGG].forEach((id) => {
      if (map.getSource(id)) map.removeSource(id);
    });
  },

  onEvent: (event: NormalizedEvent, ctx) => {
    const map = ctx.map;

    if (event.type === "snapshot" && event.arcs) {
      const aggressive = event.arcs.filter((a) => a.props.aggressive === 1);
      const passive = event.arcs.filter((a) => a.props.aggressive !== 1);
      const aggSrc = map.getSource(SOURCE_AGG) as any;
      const passSrc = map.getSource(SOURCE_PASS) as any;
      if (aggSrc) aggSrc.setData(arcsToCollection(aggressive));
      if (passSrc) passSrc.setData(arcsToCollection(passive));
    } else if (event.type === "arc:upsert") {
      const sourceId = event.arc.props.aggressive === 1 ? SOURCE_AGG : SOURCE_PASS;
      const src = map.getSource(sourceId) as any;
      if (!src) return;
      const currentData = src._data as any;
      const features = currentData?.features ?? [];
      const idx = features.findIndex((f: any) => f.properties?.id === event.arc.id);
      // Re-interpolate the great-circle arc
      const feature = {
        type: "Feature" as const,
        properties: { id: event.arc.id, ...event.arc.props },
        geometry: { type: "LineString" as const, coordinates: event.arc.props._coords ?? [[event.arc.from, event.arc.to]] },
      };
      // We need to re-interpolate — but the arc only has from/to. The source
      // adapter should pre-compute the great-circle. For simplicity, the
      // snapshot path handles full interpolation. Incremental updates use
      // the pre-computed coords if available, otherwise a 2-point line.
      if (idx >= 0) features[idx] = feature;
      else features.push(feature);
      src.setData({ type: "FeatureCollection", features });
    } else if (event.type === "arc:remove") {
      // Try both sources
      for (const sid of [SOURCE_AGG, SOURCE_PASS]) {
        const src = map.getSource(sid) as any;
        if (!src) continue;
        const currentData = src._data as any;
        const features = (currentData?.features ?? []).filter(
          (f: any) => f.properties?.id !== event.id,
        );
        src.setData({ type: "FeatureCollection", features });
      }
    }
  },

  animate: (ctx, t: number) => {
    const map = ctx.map;
    // Subtle opacity pulse on aggressive mission lines
    if (map.getLayer("vectors-agg-line")) {
      try {
        const linePulse = 0.78 + 0.07 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2));
        map.setPaintProperty("vectors-agg-line", "line-opacity", [
          "case",
          ["==", ["get", "status"], "ACTIVE"],
          linePulse,
          0.3,
        ]);
      } catch {
        /* layer not ready */
      }
    }
  },
};
