// ---------------------------------------------------------------------------
// Map controller — MapLibre initialization, camera, globe projection, and
// the auto-rotate interaction loop.
//
// ONE CONTINUOUS 3D MAP (Google Earth style). No two-mode transition.
// Pure dark monochrome basemap at ALL zoom levels — dark ocean fill, dark
// water bodies, subtle country outlines at low zoom, white road lines,
// 3D building extrusions at city zoom. Matches the SurveilTrack reference:
// solid dark buildings, white road network, dark gray water, white square
// markers with alphanumeric codes.
//
// The controller stores the initial "home" camera and exposes resetHome()
// so the layer-host can implement the "click empty ocean → reset globe" feature.
//
// The controller does NOT know about gameplay layers or data sources — those
// are mounted by the layer-host after the map loads.
// ---------------------------------------------------------------------------

import maplibregl from "maplibre-gl";
import type { FeatureCollection, Geometry, GeoJSON } from "geojson";
import { feature } from "topojson-client";
// 110m resolution (108 KB) instead of 10m (3.5 MB) — plenty for globe zoom 0-8,
// saves ~3.4 MB of inlined JSON from the dynamic map chunk.
import worldTopo from "world-atlas/countries-110m.json";
import { buildRasterSource, buildVectorSource } from "./tile-provider";

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

  // Vector tile source (roads/buildings/water/landuse). Null on Esri
  // (satellite-only provider) — roads/buildings layers skip mounting.
  const vectorSource = buildVectorSource();
  // Raster satellite source — the actual base imagery (Esri World Imagery
  // by default). This is what makes the globe VISIBLE instead of near-black.
  const rasterSource = buildRasterSource();

  const map = new maplibregl.Map({
    container,
    style: {
      version: 8,
      projection: { type: "globe" } as never,
      sources: {
        // Satellite raster tiles — the visible base layer.
        satellite: rasterSource,
        world: { type: "geojson", data: worldFeat as unknown as GeoJSON.GeoJSON },
        ocean: { type: "geojson", data: { type: "FeatureCollection", features: [oceanFeature] } },
        ...(vectorSource ? { "vector-tiles": vectorSource } : {}),
      },
      layers: [
        // ---- Satellite imagery base (BOTTOM layer — the visible globe) ----
        // Dark, moody "night-Earth" aesthetic per the reference images:
        // heavy desaturation (near-grayscale), deep brightness reduction,
        // slight contrast so land/water distinction holds at low brightness.
        { id: "satellite-base", type: "raster", source: "satellite", paint: {
          "raster-saturation": -0.9,
          "raster-brightness-min": 0.0,
          "raster-brightness-max": 0.35,
          "raster-contrast": 0.15,
          "raster-opacity": 1.0,
          "raster-fade-duration": 0,
        } },

        // ---- Solid dark ocean base (transparent — satellite shows oceans) ----
        // Kept as a fallback: if satellite tiles are still loading or fail,
        // the ocean fill provides a dark backdrop. Opacity 0 once tiles arrive
        // (satellite already renders ocean imagery).
        { id: "ocean-fill", type: "fill", source: "ocean", paint: {
          "fill-color": "#050506",
          "fill-opacity": 0.0,
        } },

        // ---- Water bodies (rivers, lakes, harbors) from vector tiles ----
        ...(vectorSource ? [{
          id: "water-fill",
          type: "fill" as const,
          source: "vector-tiles",
          "source-layer": "water",
          paint: {
            "fill-color": "#1a1a1f",
            "fill-opacity": 0.3,
          },
        }] : []),

        // ---- Landuse (parks, urban fabric) — subtle texture variation ----
        ...(vectorSource ? [{
          id: "landuse-fill",
          type: "fill" as const,
          source: "vector-tiles",
          "source-layer": "landuse",
          paint: {
            "fill-color": "#0a0a0c",
            "fill-opacity": 0.4,
          },
        }] : []),

        // ---- Country outlines (globe/region zoom only) ----
        // White outlines on top of the satellite imagery for geopolitical context.
        // Fade out at region zoom so roads/buildings take over.
        { id: "countries-fill", type: "fill", source: "world", paint: {
          "fill-color": "#0a0a0a",
          "fill-opacity": 0.0,
        } },
        {
          id: "countries-line",
          type: "line",
          source: "world",
          paint: {
            "line-color": "#ffffff",
            "line-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.35, 4, 0.30, 8, 0.0],
            "line-width": ["interpolate", ["linear"], ["zoom"], 0, 0.5, 2, 0.7, 4, 0.9],
          },
        },
      ],
    },
    center,
    zoom,
    maxZoom: 18,
    minZoom: 0,
    // Max pitch 80° allows dramatic 3D cityscape views when zoomed in —
    // gives the full Google-Earth-style oblique perspective for 3D buildings.
    maxPitch: 80,
    bearing: 0,
    pitch: 0,
    attributionControl: false,
    // Gesture controls — all enabled so the user can rotate/tilt/pan freely
    // at any zoom level. Right-click drag (or Ctrl+drag) rotates; two-finger
    // trackpad / pinch rotates + tilts on touch devices.
    dragRotate: true,
    dragPan: true,
    scrollZoom: true,
    touchZoomRotate: true,
    touchPitch: true,
    keyboard: true,
    // Built-in double-click zoom is DISABLED — we use a custom dblclick
    // handler below that zooms 3 levels (not the default 1) centered on the
    // click point.
    doubleClickZoom: false,
    antialias: true,
  });

  // ---- Custom double-click: zoom 3 levels toward the click point ----
  // MapLibre's built-in doubleClickZoom only jumps 1 zoom level. The user
  // wants double-click to zoom in 3x for fast navigation. We keep the click
  // point as the zoom center (like the built-in) and ease smoothly. Pauses
  // auto-rotate so it doesn't fight the zoom animation.
  const onDblClick = (e: maplibregl.MapMouseEvent) => {
    pauseAutoRotate(1500);
    const current = map.getZoom();
    const target = Math.min(current + 3, 18);
    map.easeTo({
      center: e.lngLat,
      zoom: target,
      duration: 600,
    });
  };
  map.on("dblclick", onDblClick);

  // ---- Auto-pitch: ease to isometric (50°) when zooming into city level ----
  // Continuous Google Earth-like experience: flat globe at low zoom, tilts
  // to isometric 3D cityscape as you zoom into streets.
  //
  // ROBUST against cancelled animations: instead of tracking state transitions
  // (which breaks when a rapid zoomIn() cancels a mid-flight pitch easeTo,
  // leaving the pitch stuck at an intermediate value), we check the ACTUAL
  // pitch against the target on every zoomend. If they're significantly off,
  // we re-ease. The 15° threshold avoids fighting manual dragRotate adjustments.
  const PITCH_TILT_ZOOM = 9;     // zoom threshold: tilt at 9+
  const PITCH_TILTED = 50;       // target pitch when tilted
  const PITCH_FLAT = 0;          // target pitch when flat
  const PITCH_THRESHOLD = 15;    // re-ease if |actual - target| > this
  const onZoomEnd = () => {
    const z = map.getZoom();
    const p = map.getPitch();
    const target = z >= PITCH_TILT_ZOOM ? PITCH_TILTED : PITCH_FLAT;
    if (Math.abs(p - target) > PITCH_THRESHOLD) {
      map.easeTo({ pitch: target, duration: 600 });
    }
  };
  map.on("zoomend", onZoomEnd);

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
        // Negative delta = clockwise rotation when viewed from above the North
        // Pole, which makes the visible surface drift from right to left on
        // its axis (westward) — the natural "spinning globe" feel.
        map.setBearing(map.getBearing() - 0.06);
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
    // Ease back to home camera (center/zoom/bearing/pitch=0). The zoomend
    // auto-pitch handler will keep pitch at 0 since home zoom < 9.
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
    map.off("zoomend", onZoomEnd);
    map.off("dblclick", onDblClick);
    container.removeEventListener("pointerdown", onInteract);
    container.removeEventListener("wheel", onInteract);
    container.removeEventListener("touchstart", onInteract);
    map.remove();
  };

  return { map, resetHome, pauseAutoRotate, destroy };
}
