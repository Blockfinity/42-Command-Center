// ---------------------------------------------------------------------------
// Map style — the static MapLibre style specification for the 3D globe.
// Extracted from world-map.tsx so the style can be reasoned about and edited
// independently of the React component that consumes it.
// ---------------------------------------------------------------------------

import maplibregl from "maplibre-gl";
import type { FeatureCollection, Geometry, GeoJSON } from "geojson";
import { feature } from "topojson-client";
import worldTopo from "world-atlas/countries-10m.json";

// ---------------------------------------------------------------------------
// World data (computed once at module scope)
// ---------------------------------------------------------------------------
export const worldFeat = feature(
  worldTopo as any,
  (worldTopo as any).objects.countries
) as unknown as FeatureCollection<Geometry>;

/** Graticule line features every 15°. */
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
export const graticuleFeat = makeGraticule(15);

export const oceanFeature: GeoJSON.Feature = {
  type: "Feature",
  properties: {},
  geometry: { type: "Polygon", coordinates: [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]]] },
};

// ---------------------------------------------------------------------------
// Base raster source — REAL 1:1 Earth satellite imagery (Esri World Imagery).
// Free raster tiles, no API key, no server. Desaturated + darkened via native
// MapLibre raster paint properties to produce a "night-vision tactical satellite"
// base that fits the monochrome aesthetic.
//
// PRODUCTION SCALING NOTE: For millions of users, swap the Esri endpoint for a
// self-hosted Protomaps PMTiles file (single static file, OSM vector tiles,
// no per-request cost, scales via CDN). The `sources.satellite` entry below
// is the only line that needs to change.
// ---------------------------------------------------------------------------
const esriWorldImagery = {
  type: "raster" as const,
  tiles: [
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  ],
  tileSize: 256,
  attribution: "Esri, Maxar, Earthstar Geographics",
  maxzoom: 19,
};

// ---------------------------------------------------------------------------
// The full style spec. Globe projection is set here (not as a post-load hack)
// so it is active from first render.
// ---------------------------------------------------------------------------
export const mapStyle: maplibregl.StyleSpecification = {
  version: 8,
  projection: { type: "globe" } as any,
  sources: {
    // Real 1:1 satellite Earth (raster tiles — no server, no API key)
    satellite: esriWorldImagery,
    world: { type: "geojson", data: worldFeat as unknown as GeoJSON.GeoJSON },
    ocean: { type: "geojson", data: { type: "FeatureCollection", features: [oceanFeature] } },
    graticule: { type: "geojson", data: graticuleFeat as unknown as GeoJSON.GeoJSON },
  },
  layers: [
    // --- BASE: real satellite Earth, desaturated + darkened to monochrome tactical ---
    {
      id: "satellite-base",
      type: "raster",
      source: "satellite",
      paint: {
        "raster-opacity": 1.0,
        // Partial desaturate → near-grayscale but keeps faint land/water tonal separation
        "raster-saturation": -0.85,
        // Keep brightness readable — the satellite must stay visible under the tactical UI
        "raster-brightness-min": 0,
        "raster-brightness-max": 0.85,
        // Gentle contrast bump so land/water separation reads
        "raster-contrast": 0.15,
        // Slight hue rotate is a no-op on grayscale but keeps the pipeline honest
        "raster-hue-rotate": 0,
      },
    },
    // Deep-black ocean tint — VERY low opacity so the satellite shows through
    // but the void-space feel is preserved. (Cannot mask ocean-only with a
    // single rect polygon, so keep this subtle.)
    { id: "ocean-fill", type: "fill", source: "ocean", paint: { "fill-color": "#000000", "fill-opacity": 0.10 } },
    { id: "graticule", type: "line", source: "graticule", paint: { "line-color": "#fff", "line-opacity": 0.06, "line-width": 0.4 } },
    // Landmass fill — faint white wash so continents read as "ours" not "photo"
    { id: "countries-fill", type: "fill", source: "world", paint: {
      "fill-color": "#fff",
      "fill-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.03, 3, 0.03, 6, 0.03],
    } },
    // Coastlines + borders — white vector lines on top of the satellite for the
    // stylized tactical-map look. Zoom-responsive width.
    { id: "countries-line", type: "line", source: "world", paint: {
      "line-color": "#fff",
      "line-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.45, 3, 0.55, 6, 0.70],
      "line-width": ["interpolate", ["linear"], ["zoom"], 0, 0.5, 2, 0.8, 4, 1.2, 6, 1.8, 8, 2.4],
    } },
  ],
};

// ---------------------------------------------------------------------------
// Faction sprite generation — canvas → ImageData → map.addImage
// FANG = hexagon ⬡, HAMMER = diamond ◆, RESOLUTE = square ■
// Rendered as white monochrome shapes on transparent background.
// ---------------------------------------------------------------------------
export type FactionShape = "hex" | "diamond" | "square";

export function makeFactionIcon(shape: FactionShape): { width: number; height: number; data: Uint8ClampedArray } {
  const S = 48; // canvas size
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext("2d")!;
  ctx.translate(S / 2, S / 2);
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#ffffff";
  const r = S * 0.32; // shape radius

  ctx.beginPath();
  if (shape === "hex") {
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 2;
      const x = r * Math.cos(a);
      const y = r * Math.sin(a);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  } else if (shape === "diamond") {
    ctx.moveTo(0, -r);
    ctx.lineTo(r, 0);
    ctx.lineTo(0, r);
    ctx.lineTo(-r, 0);
    ctx.closePath();
  } else {
    // square
    ctx.rect(-r * 0.82, -r * 0.82, r * 1.64, r * 1.64);
  }
  ctx.fill();

  const img = ctx.getImageData(0, 0, S, S);
  return { width: S, height: S, data: img.data };
}

/**
 * Street-level unit marker — a crisp white square with a thin dark outline,
 * matching the SurveilTrack ground-view reference (plain white square markers
 * with alphanumeric codes). Rendered at zoom 12+ when the camera is at city
 * /street level; the faction-shape sprites take over at globe/region zoom.
 */
export function makeStreetMarker(): { width: number; height: number; data: Uint8ClampedArray } {
  const S = 32;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext("2d")!;
  ctx.translate(S / 2, S / 2);
  const r = S * 0.34;
  // Dark outline (separates the square from buildings/roads behind it).
  ctx.fillStyle = "#000000";
  ctx.fillRect(-r - 1, -r - 1, r * 2 + 2, r * 2 + 2);
  // White square fill.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(-r, -r, r * 2, r * 2);
  // Subtle inner dot for definition.
  ctx.fillStyle = "#000000";
  ctx.fillRect(-1.5, -1.5, 3, 3);
  const img = ctx.getImageData(0, 0, S, S);
  return { width: S, height: S, data: img.data };
}
