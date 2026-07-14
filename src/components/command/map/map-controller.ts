// ---------------------------------------------------------------------------
// Map controller — MapLibre initialization, camera, globe projection, and
// the auto-rotate interaction loop.
//
// This is the low-level controller. It creates the MapLibre instance, sets up
// the base style (satellite + coastlines + graticule), handles camera centering,
// and runs the auto-rotate rAF loop that pauses on user interaction.
//
// The controller does NOT know about gameplay layers or data sources — those
// are mounted by the layer-host after the map loads.
// ---------------------------------------------------------------------------

import maplibregl from "maplibre-gl";
import type { FeatureCollection, Geometry, GeoJSON } from "geojson";
import { feature } from "topojson-client";
import worldTopo from "world-atlas/countries-10m.json";
import { buildRasterSource } from "./tile-provider";

// ---- Static world data (computed once at module scope) ----
const worldFeat = feature(
  worldTopo as never,
  (worldTopo as never).objects.countries,
) as unknown as FeatureCollection<Geometry>;

function makeGraticule(step: number): GeoJSON.FeatureCollection {
  const lines: GeoJSON.Feature[] = [];
  for (let lng = -180; lng <= 180; lng += step) {
    const coords: [number, number][] = [];
    for (let lat = -85; lat <= 85; lat += 2) coords.push([lng, lat]);
    lines.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } });
  }
  for (let lat = -75; lat <= 75; lat += step) {
    const coords: [number, number][] = [];
    for (let lng = -180; lng <= 180; lng += 2) coords.push([lng, lat]);
    lines.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } });
  }
  return { type: "FeatureCollection", features: lines };
}
const graticuleFeat = makeGraticule(15);

const oceanFeature: GeoJSON.Feature = {
  type: "Feature",
  properties: {},
  geometry: { type: "Polygon", coordinates: [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]]] },
};

export interface CreateMapOptions {
  container: HTMLElement;
  center: [number, number];
  zoom?: number;
}

/**
 * Create the MapLibre map instance with the base tactical style.
 * Returns the map + a cleanup function.
 */
export function createMap(opts: CreateMapOptions): {
  map: maplibregl.Map;
  destroy: () => void;
} {
  const { container, center, zoom = 1.6 } = opts;

  const map = new maplibregl.Map({
    container,
    style: {
      version: 8,
      projection: { type: "globe" } as never,
      sources: {
        satellite: buildRasterSource(),
        world: { type: "geojson", data: worldFeat as unknown as GeoJSON.GeoJSON },
        ocean: { type: "geojson", data: { type: "FeatureCollection", features: [oceanFeature] } },
        graticule: { type: "geojson", data: graticuleFeat as unknown as GeoJSON.GeoJSON },
      },
      layers: [
        // Real satellite Earth — desaturated + darkened to monochrome tactical
        {
          id: "satellite-base",
          type: "raster",
          source: "satellite",
          paint: {
            "raster-opacity": 1.0,
            "raster-saturation": -0.85,
            "raster-brightness-min": 0,
            "raster-brightness-max": 0.85,
            "raster-contrast": 0.15,
            "raster-hue-rotate": 0,
          },
        },
        { id: "ocean-fill", type: "fill", source: "ocean", paint: { "fill-color": "#000000", "fill-opacity": 0.10 } },
        { id: "graticule", type: "line", source: "graticule", paint: { "line-color": "#fff", "line-opacity": 0.06, "line-width": 0.4 } },
        { id: "countries-fill", type: "fill", source: "world", paint: { "fill-color": "#fff", "fill-opacity": 0.03 } },
        {
          id: "countries-line",
          type: "line",
          source: "world",
          paint: {
            "line-color": "#fff",
            "line-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.45, 3, 0.55, 6, 0.70],
            "line-width": ["interpolate", ["linear"], ["zoom"], 0, 0.5, 2, 0.8, 4, 1.2, 6, 1.8, 8, 2.4],
          },
        },
      ],
    },
    center,
    zoom,
    maxZoom: 8,
    minZoom: 0,
    bearing: 0,
    attributionControl: false,
    dragRotate: true,
    scrollZoom: true,
    touchZoomRotate: true,
    doubleClickZoom: true,
    antialias: true,
  });

  // ---- Auto-rotate loop (pauses 3.5s after user interaction) ----
  let lastInteract = performance.now();
  let rafId: number | null = null;

  const onInteract = () => { lastInteract = performance.now(); };
  container.addEventListener("pointerdown", onInteract);
  container.addEventListener("wheel", onInteract, { passive: true });
  container.addEventListener("touchstart", onInteract, { passive: true });

  const rotateLoop = () => {
    const now = performance.now();
    if (now - lastInteract > 3500) {
      const b = map.getBearing();
      map.jumpTo({ bearing: b + 0.05 });
    }
    rafId = requestAnimationFrame(rotateLoop);
  };
  rafId = requestAnimationFrame(rotateLoop);

  const destroy = () => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    container.removeEventListener("pointerdown", onInteract);
    container.removeEventListener("wheel", onInteract);
    container.removeEventListener("touchstart", onInteract);
    map.remove();
  };

  return { map, destroy };
}
