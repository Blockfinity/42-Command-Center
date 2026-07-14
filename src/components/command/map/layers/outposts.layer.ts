// ---------------------------------------------------------------------------
// Outposts layer — faction markers, health rings, clustering, selection pulse.
//
// Consumes source: "game:outposts" (clustered GeoJSON points).
// Renders: glow, safehouse aura, selection/under-attack pulse (animated),
// health ring, faction shape sprite, cluster circle + count label.
//
// This layer handles outpost click selection — it reads the interaction
// context from the map context to call onSelect().
// ---------------------------------------------------------------------------

import type maplibregl from "maplibre-gl";
import type { MapLayerSpec } from "../types";
import { GAME_SOURCE_IDS } from "../sources/game-engine.source";
import { makeFactionIcon, FACTION_ICON } from "../utils/sprites";
import type { FactionId } from "@/lib/types";

const SRC = "outposts-src";

export const outpostsLayer: MapLayerSpec = {
  id: "outposts",
  sourceIds: [GAME_SOURCE_IDS.outposts],

  addSources(map) {
    map.addSource(SRC, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
      cluster: true,
      clusterRadius: 32,
      clusterMaxZoom: 5,
      promoteId: "id",
    });

    // Register faction sprite icons.
    (["FANG", "HAMMER", "RESOLUTE"] as FactionId[]).forEach((f) => {
      if (!map.hasImage(`faction-${f}`)) {
        map.addImage(`faction-${f}`, makeFactionIcon(FACTION_ICON[f]));
      }
    });
  },

  addLayers(map) {
    // --- Outpost: soft halo glow ---
    map.addLayer({
      id: "outpost-glow",
      type: "circle",
      source: SRC,
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-radius": [
          "interpolate", ["linear"], ["zoom"],
          0, ["+", ["match", ["get", "type"], "FULL", 8, 6], ["*", ["get", "level"], 0.8]],
          4, ["+", ["match", ["get", "type"], "FULL", 12, 9], ["*", ["get", "level"], 1.0]],
          8, ["+", ["match", ["get", "type"], "FULL", 18, 13], ["*", ["get", "level"], 1.3]],
        ],
        "circle-color": "#fff",
        "circle-opacity": ["case", ["==", ["get", "isMine"], 1], 0.35, 0.15],
        "circle-blur": 1.5,
        "circle-stroke-width": 0,
      },
    });

    // --- Outpost: SAFEHOUSE fortified double-ring aura ---
    map.addLayer({
      id: "outpost-safehouse-aura",
      type: "circle",
      source: SRC,
      filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "type"], "SAFEHOUSE"]],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 0, 12, 4, 17, 8, 24],
        "circle-color": "#fff",
        "circle-opacity": 0.06,
        "circle-stroke-color": "#fff",
        "circle-stroke-opacity": 0.5,
        "circle-stroke-width": 1.5,
      },
    });

    // --- Outpost: selection / under-attack pulse ring (animated) ---
    map.addLayer({
      id: "outpost-pulse",
      type: "circle",
      source: SRC,
      filter: ["any", ["==", ["get", "selected"], 1], ["==", ["get", "underAttack"], 1]],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 0, 14, 4, 22, 8, 34],
        "circle-color": "#fff",
        "circle-opacity": 0.25,
        "circle-blur": 0.8,
        "circle-stroke-width": 0,
      },
    });

    // --- Outpost: health ring ---
    map.addLayer({
      id: "outpost-health-ring",
      type: "circle",
      source: SRC,
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"],
          0, ["match", ["get", "type"], "FULL", 11, 8],
          4, ["match", ["get", "type"], "FULL", 16, 11],
          8, ["match", ["get", "type"], "FULL", 24, 16]],
        "circle-color": "rgba(0,0,0,0)",
        "circle-stroke-color": "#fff",
        "circle-stroke-opacity": [
          "case",
          ["==", ["get", "offline"], 1], 0.12,
          ["interpolate", ["linear"], ["get", "healthPct"], 0, 0.2, 1, 0.9],
        ],
        "circle-stroke-width": 1.4,
        "circle-opacity": ["case", ["==", ["get", "offline"], 1], 0.3, 0],
      },
    });

    // --- Outpost: faction shape (symbol layer with sprite icons) ---
    map.addLayer({
      id: "outpost-shape",
      type: "symbol",
      source: SRC,
      filter: ["!", ["has", "point_count"]],
      layout: {
        "icon-image": ["match", ["get", "faction"], "FANG", "faction-FANG", "HAMMER", "faction-HAMMER", "faction-RESOLUTE"],
        "icon-size": ["interpolate", ["linear"], ["zoom"],
          0, ["match", ["get", "type"], "FULL", 0.32, 0.22],
          4, ["match", ["get", "type"], "FULL", 0.44, 0.3],
          8, ["match", ["get", "type"], "FULL", 0.6, 0.42]],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        "symbol-sort-key": ["match", ["get", "type"], "FULL", 2, 1],
      },
      paint: {
        "icon-opacity": ["case", ["==", ["get", "offline"], 1], 0.3, 1],
      },
    });

    // --- Outpost: cluster circle ---
    map.addLayer({
      id: "outpost-clusters",
      type: "circle",
      source: SRC,
      filter: ["has", "point_count"],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 0, 16, 8, 24],
        "circle-color": "rgba(255,255,255,0.10)",
        "circle-stroke-color": "#fff",
        "circle-stroke-width": 0.5,
        "circle-stroke-opacity": 0.5,
      },
    });
    map.addLayer({
      id: "outpost-cluster-label",
      type: "symbol",
      source: SRC,
      filter: ["has", "point_count"],
      layout: {
        "text-field": "{point_count}",
        "text-font": ["Noto Sans Regular"],
        "text-size": 11,
        "text-allow-overlap": true,
      },
      paint: {
        "text-color": "#fff",
        "text-opacity": 0.85,
      },
    });
  },

  onData(map, _sourceId, data) {
    const src = map.getSource(SRC) as maplibregl.GeoJSONSource | undefined;
    if (src) src.setData(data);
  },

  animate(map, now) {
    // Pulse the selection / under-attack ring.
    const t = (now % 1800) / 1800;
    const pulse = 0.15 + 0.25 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2));
    const radiusBoost = 4 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2));
    try {
      if (map.getLayer("outpost-pulse")) {
        map.setPaintProperty("outpost-pulse", "circle-opacity", pulse);
        map.setPaintProperty("outpost-pulse", "circle-radius", [
          "interpolate", ["linear"], ["zoom"],
          0, 14 + radiusBoost, 4, 22 + radiusBoost, 8, 34 + radiusBoost,
        ]);
      }
    } catch {
      /* layer not ready */
    }
  },

  onClick(map, e, ctx) {
    // Click on outpost-shape or health-ring → select
    const feats = map.queryRenderedFeatures(e.point, {
      layers: ["outpost-shape", "outpost-health-ring"],
    });
    if (feats.length > 0) {
      e.preventDefault();
      const id = (feats[0].properties as { id?: string }).id;
      if (id && ctx?.interaction) {
        const isCurrentlySelected = id === ctx.interaction.selectedId;
        ctx.interaction.onSelect(isCurrentlySelected ? null : id);
      }
      return;
    }
    // Click on cluster → zoom in to expand
    const clusterFeats = map.queryRenderedFeatures(e.point, {
      layers: ["outpost-clusters"],
    });
    if (clusterFeats.length > 0) {
      e.preventDefault();
      const f = clusterFeats[0];
      const clusterId = f.properties?.cluster_id as number;
      const src = map.getSource(SRC) as maplibregl.GeoJSONSource;
      if (src && clusterId !== undefined) {
        src.getClusterExpansionZoom(clusterId).then((zoom) => {
          const coords = (f.geometry as { coordinates: [number, number] }).coordinates;
          map.easeTo({ center: coords, zoom: Math.max(zoom, 3) });
        });
      }
    }
  },

  onHover(map, entering, ctx) {
    if (ctx?.interaction?.placementMode) {
      map.getCanvas().style.cursor = "crosshair";
    } else {
      map.getCanvas().style.cursor = entering ? "pointer" : "grab";
    }
  },
};
