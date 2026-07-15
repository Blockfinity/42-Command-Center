// ---------------------------------------------------------------------------
// Map controller — MapLibre initialization, camera, globe projection, and
// the auto-rotate interaction loop.
//
// MONOCHROMATIC COMMAND-CENTER GLOBE. No external map tiles — the entire
// basemap is rendered from local GeoJSON (world-atlas 110m + a generated
// graticule). This keeps the aesthetic pure black-and-white / cinematic
// (dark ocean void, dark landmass silhouettes, white country outlines, faint
// lat-long grid) AND makes the globe load instantly with zero network
// requests for tiles.
//
// Gameplay layers (garrisons, missions, territory, activity pings) are mounted
// on top by the layer-host after the map loads.
//
// The controller stores the initial "home" camera and exposes resetHome()
// so the layer-host can implement the "click empty ocean → reset globe" feature.
// ---------------------------------------------------------------------------

import maplibregl from "maplibre-gl";
import type { FeatureCollection, Geometry, GeoJSON } from "geojson";
import { feature } from "topojson-client";
// 110m resolution (108 KB) instead of 10m (3.5 MB) — plenty for globe zoom 0-8,
// saves ~3.4 MB of inlined JSON from the dynamic map chunk.
import worldTopo from "world-atlas/countries-110m.json";

// ---- Static world data (computed once at module scope) ----
const worldFeat = feature(
  worldTopo as never,
  (worldTopo as never).objects.countries,
) as unknown as FeatureCollection<Geometry>;

const oceanFeature: GeoJSON.Feature = {
  type: "Feature",
  properties: {},
  geometry: { type: "Polygon", coordinates: [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]]] },
};

// ---- Graticule (lat/long grid) — generated once, adds the tactical ----
// command-center grid feel without any external tiles. Meridians + parallels
// every 30°. Cheap static GeoJSON (~24 line features).
function buildGraticule(): GeoJSON.FeatureCollection {
  const lines: GeoJSON.Feature[] = [];
  // Meridians (longitude lines) every 30° from -180..180.
  for (let lng = -180; lng <= 180; lng += 30) {
    const coords: number[][] = [];
    for (let lat = -85; lat <= 85; lat += 5) coords.push([lng, lat]);
    lines.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } });
  }
  // Parallels (latitude lines) every 30° from -90..90.
  for (let lat = -90; lat <= 90; lat += 30) {
    const coords: number[][] = [];
    for (let lng = -180; lng <= 180; lng += 5) coords.push([lng, lat]);
    lines.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } });
  }
  return { type: "FeatureCollection", features: lines };
}
const graticule = buildGraticule();

export interface CreateMapOptions {
  container: HTMLElement;
  center: [number, number];
  zoom?: number;
}

export interface MapController {
  map: maplibregl.Map;
  /** Ease the camera back to the initial home view (center/zoom/bearing/pitch). */
  resetHome: () => void;
  /** Pause auto-rotate for the given duration (ms). Used during easeTo resets. */
  pauseAutoRotate: (ms: number) => void;
  /** Destroy the map + all listeners + rAF loops. */
  destroy: () => void;
}

/**
 * Create the MapLibre map instance with the continuous dark monochrome base style.
 * Returns the controller with resetHome + destroy helpers.
 */
export function createMap(opts: CreateMapOptions): MapController {
  const { container, center, zoom = 1.6 } = opts;

  // Stash the home camera so resetHome() can ease back to exactly the boot view.
  const homeCamera = {
    center,
    zoom,
    bearing: 0,
    pitch: 0,
  };

  const map = new maplibregl.Map({
    container,
    style: {
      version: 8,
      projection: { type: "globe" } as never,
      sources: {
        // Pure local GeoJSON — zero external tile requests. Instant load,
        // fully offline-capable, and keeps the strict monochromatic aesthetic.
        ocean: { type: "geojson", data: { type: "FeatureCollection", features: [oceanFeature] } },
        world: { type: "geojson", data: worldFeat as unknown as GeoJSON.GeoJSON },
        graticule: { type: "geojson", data: graticule },
      },
      layers: [
        // ---- Solid dark ocean (BOTTOM — the void / "space" backdrop) ----
        // Fully opaque so the globe reads as a dark sphere, not a transparent
        // canvas. This is what makes the globe visibly present without any
        // satellite imagery.
        { id: "ocean-fill", type: "fill", source: "ocean", paint: {
          "fill-color": "#050507",
          "fill-opacity": 1.0,
        } },

        // ---- Landmass silhouettes ----
        // Slightly lighter than the ocean so continents read as dark shapes
        // against the void. Subtle — keeps the monochrome cinematic tone.
        { id: "countries-fill", type: "fill", source: "world", paint: {
          "fill-color": "#0e0e12",
          "fill-opacity": 1.0,
        } },

        // ---- Graticule (lat/long grid) ----
        // Faint white grid lines — the tactical command-center feel. Very low
        // opacity so it reads as a display overlay, not clutter. Fades out at
        // high zoom so it never competes with gameplay markers.
        { id: "graticule-line", type: "line", source: "graticule", paint: {
          "line-color": "#ffffff",
          "line-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.07, 4, 0.05, 8, 0.0],
          "line-width": 0.4,
        } },

        // ---- Country outlines ----
        // White outlines for geopolitical context. Clearly visible at globe
        // zoom, fade out approaching street zoom so gameplay markers dominate.
        { id: "countries-line", type: "line", source: "world", paint: {
          "line-color": "#ffffff",
          "line-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.42, 4, 0.38, 8, 0.10],
          "line-width": ["interpolate", ["linear"], ["zoom"], 0, 0.6, 2, 0.8, 4, 1.0],
        } },
      ],
    },
    center,
    zoom,
    maxZoom: 18,
    minZoom: 0,
    maxPitch: 70,
    bearing: 0,
    pitch: 0,
    attributionControl: false,
    dragRotate: true,
    scrollZoom: true,
    touchZoomRotate: true,
    doubleClickZoom: true,
    antialias: true,
  });

  // ---- Auto-pitch: ease to isometric (50°) when zooming into city level ----
  // Continuous Google Earth-like experience: flat globe at low zoom, tilts
  // to isometric 3D cityscape as you zoom into streets. Smooth threshold
  // crossing so it doesn't fight mid-zoom user rotation.
  let lastPitchState: "flat" | "tilted" = "flat";
  const onZoom = () => {
    const z = map.getZoom();
    const p = map.getPitch();
    // Start tilting at zoom 8 (region level), full tilt by zoom 12.
    const wantTilt = z >= 9;
    const state: "flat" | "tilted" = wantTilt ? "tilted" : "flat";
    if (state === lastPitchState) return;
    lastPitchState = state;
    if (wantTilt && p < 30) {
      map.easeTo({ pitch: 50, duration: 800 });
    } else if (!wantTilt && p > 30) {
      map.easeTo({ pitch: 0, duration: 800 });
    }
  };
  map.on("zoomend", onZoom);

  // ---- Auto-rotate loop (pauses 3.5s after user interaction) ----
  // Throttled to ~20fps and gated on document visibility to avoid wasted
  // GPU repaints when the tab is hidden or the user is interacting.
  let lastInteract = performance.now();
  let rafId: number | null = null;
  let pauseUntil = 0;
  let lastRotateTick = 0;
  const ROTATE_INTERVAL_MS = 50; // ~20fps — smooth enough for slow rotation

  const onInteract = () => { lastInteract = performance.now(); };
  container.addEventListener("pointerdown", onInteract);
  container.addEventListener("wheel", onInteract, { passive: true });
  container.addEventListener("touchstart", onInteract, { passive: true });

  const rotateLoop = () => {
    if (document.hidden) {
      rafId = requestAnimationFrame(rotateLoop);
      return;
    }
    const now = performance.now();
    if (now - lastRotateTick >= ROTATE_INTERVAL_MS) {
      lastRotateTick = now;
      if (now - lastInteract > 3500 && now > pauseUntil) {
        // setBearing is cheaper than jumpTo (no camera recomputation overhead).
        map.setBearing(map.getBearing() + 0.06);
      }
    }
    rafId = requestAnimationFrame(rotateLoop);
  };
  rafId = requestAnimationFrame(rotateLoop);

  const pauseAutoRotate = (ms: number) => {
    lastInteract = performance.now();
    pauseUntil = performance.now() + ms;
  };

  const resetHome = () => {
    // Pause auto-rotate for 3.5s to cover the 900ms ease + margin.
    // NOTE: do NOT call map.stop() — calling stop() in the same tick as easeTo
    // prevents the ease from starting (MapLibre quirk).
    pauseAutoRotate(3500);
    // Reset auto-pitch tracking so zooming back in re-engages isometric view.
    lastPitchState = "flat";
    map.easeTo({
      center: homeCamera.center,
      zoom: homeCamera.zoom,
      bearing: homeCamera.bearing,
      pitch: homeCamera.pitch,
      duration: 900,
    });
  };

  const destroy = () => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    map.off("zoomend", onZoom);
    container.removeEventListener("pointerdown", onInteract);
    container.removeEventListener("wheel", onInteract);
    container.removeEventListener("touchstart", onInteract);
    map.remove();
  };

  return { map, resetHome, pauseAutoRotate, destroy };
}
