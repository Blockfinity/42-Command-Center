/**
 * Territory Polygons Layer
 * ========================
 * Named geographic regions factions fight to control. Filled polygons with
 * opacity driven by control %, dashed outline when contested.
 *
 * Consumes: polygon:upsert, polygon:remove, snapshot from sources.
 * Subscribes to: "game-engine" (territories).
 */

import type { MapLayerSpec, NormalizedEvent } from "../types";
import { polygonsToCollection, emptyCollection } from "../utils/geo";

const SOURCE_ID = "territories";

export const territoryPolygonsLayer: MapLayerSpec = {
  id: "territory-polygons",
  minZoom: 0,
  sources: ["game-engine"],

  mount: (ctx) => {
    const map = ctx.map;

    map.addSource(SOURCE_ID, {
      type: "geojson",
      data: emptyCollection(),
    });

    // Fill (opacity driven by control %)
    map.addLayer({
      id: "territory-fill",
      type: "fill",
      source: SOURCE_ID,
      paint: {
        "fill-color": "#fff",
        "fill-opacity": [
          "case",
          ["==", ["get", "isContested"], 1],
          0.045,
          ["interpolate", ["linear"], ["get", "control"], 0, 0.06, 100, 0.17],
        ],
      },
    });

    // Outline (dashed when contested)
    map.addLayer({
      id: "territory-line",
      type: "line",
      source: SOURCE_ID,
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

    // Centroid label
    try {
      map.addLayer({
        id: "territory-label",
        type: "symbol",
        source: SOURCE_ID,
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
  },

  unmount: (map) => {
    ["territory-label", "territory-line", "territory-fill"].forEach((id) => {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
  },

  onEvent: (event: NormalizedEvent, ctx) => {
    const map = ctx.map;
    const src = map.getSource(SOURCE_ID) as any;
    if (!src) return;

    if (event.type === "snapshot" && event.polygons) {
      // Filter to only territory polygons (not halos)
      const territories = event.polygons.filter((p) => !p.id.startsWith("halo-"));
      src.setData(polygonsToCollection(territories));
    } else if (event.type === "polygon:upsert") {
      if (event.polygon.id.startsWith("halo-")) return; // halos handled by halos layer
      const currentData = src._data as any;
      const features = currentData?.features ?? [];
      const idx = features.findIndex((f: any) => f.properties?.id === event.polygon.id);
      const feature = {
        type: "Feature" as const,
        properties: { id: event.polygon.id, ...event.polygon.props },
        geometry: { type: "Polygon" as const, coordinates: event.polygon.coordinates },
      };
      if (idx >= 0) features[idx] = feature;
      else features.push(feature);
      src.setData({ type: "FeatureCollection", features });
    } else if (event.type === "polygon:remove") {
      if (event.id.startsWith("halo-")) return;
      const currentData = src._data as any;
      const features = (currentData?.features ?? []).filter(
        (f: any) => f.properties?.id !== event.id,
      );
      src.setData({ type: "FeatureCollection", features });
    }
  },
};
