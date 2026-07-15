/**
 * Territory Halos Layer
 * =====================
 * Per-outpost influence circles (FULL outposts only). Faint fill + dashed outline.
 *
 * Consumes: polygon:upsert, polygon:remove, snapshot from sources.
 * Subscribes to: "game-engine" (halos derived from outposts).
 */

import type { MapLayerSpec, NormalizedEvent } from "../types";
import { polygonsToCollection, emptyCollection } from "../utils/geo";

const SOURCE_ID = "halos";

export const territoryHalosLayer: MapLayerSpec = {
  id: "territory-halos",
  minZoom: 0,
  sources: ["game-engine"],

  mount: (ctx) => {
    const map = ctx.map;

    map.addSource(SOURCE_ID, {
      type: "geojson",
      data: emptyCollection(),
    });

    // Faint fill
    map.addLayer({
      id: "halos-fill",
      type: "fill",
      source: SOURCE_ID,
      paint: {
        "fill-color": "#fff",
        "fill-opacity": 0.025,
      },
    });

    // Dashed outline
    map.addLayer({
      id: "halos-line",
      type: "line",
      source: SOURCE_ID,
      paint: {
        "line-color": "#fff",
        "line-opacity": 0.2,
        "line-width": 0.7,
        "line-dasharray": [
          "case",
          ["==", ["get", "dashed"], 1],
          ["literal", [4, 3]],
          ["literal", [1, 0]],
        ],
      },
    });
  },

  unmount: (map) => {
    ["halos-line", "halos-fill"].forEach((id) => {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
  },

  onEvent: (event: NormalizedEvent, ctx) => {
    const map = ctx.map;
    const src = map.getSource(SOURCE_ID) as any;
    if (!src) return;

    if (event.type === "snapshot" && event.polygons) {
      const halos = event.polygons.filter((p) => p.id.startsWith("halo-"));
      src.setData(polygonsToCollection(halos));
    } else if (event.type === "polygon:upsert") {
      if (!event.polygon.id.startsWith("halo-")) return;
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
      if (!event.id.startsWith("halo-")) return;
      const currentData = src._data as any;
      const features = (currentData?.features ?? []).filter(
        (f: any) => f.properties?.id !== event.id,
      );
      src.setData({ type: "FeatureCollection", features });
    }
  },
};
