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
import worldTopo from "world-atlas/countries-10m.json";
import { buildVectorSource } from "./tile-provider";

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

  // Vector tile source (roads/buildings/water/landuse). Required for the
  // dark monochrome aesthetic — the basemap IS the vector tiles.
  const vectorSource = buildVectorSource();

  const map = new maplibregl.Map({
    container,
    style: {
      version: 8,
      projection: { type: "globe" } as never,
      sources: {
        world: { type: "geojson", data: worldFeat as unknown as GeoJSON.GeoJSON },
        ocean: { type: "geojson", data: { type: "FeatureCollection", features: [oceanFeature] } },
        ...(vectorSource ? { "vector-tiles": vectorSource } : {}),
      },
      layers: [
        // ---- Solid dark ocean base (visible at ALL zoom levels) ----
        // This is the canvas the vector tiles render on top of. Near-black
        // so the white roads + dark buildings read with maximum contrast.
        { id: "ocean-fill", type: "fill", source: "ocean", paint: {
          "fill-color": "#050506",
          "fill-opacity": 1.0,
        } },

        // ---- Water bodies (rivers, lakes, harbors) from vector tiles ----
        // Dark gray — lighter than the ocean base so water features read
        // as distinct from land. Visible at all zooms (continuous).
        ...(vectorSource ? [{
          id: "water-fill",
          type: "fill" as const,
          source: "vector-tiles",
          "source-layer": "water",
          paint: {
            "fill-color": "#1a1a1f",
            "fill-opacity": 1.0,
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
            "fill-opacity": 1.0,
          },
        }] : []),

        // ---- Country outlines (globe/region zoom only) ----
        // Subtle white outlines that fade out as roads take over at region zoom.
        // Provides continental context at globe view without competing with roads.
        { id: "countries-fill", type: "fill", source: "world", paint: {
          "fill-color": "#0a0a0a",
          "fill-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.5, 8, 0.0],
        } },
        {
          id: "countries-line",
          type: "line",
          source: "world",
          paint: {
            "line-color": "#ffffff",
            "line-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.25, 4, 0.30, 8, 0.0],
            "line-width": ["interpolate", ["linear"], ["zoom"], 0, 0.5, 2, 0.7, 4, 0.9],
          },
        },
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
  let lastInteract = performance.now();
  let rafId: number | null = null;
  let pauseUntil = 0;

  const onInteract = () => { lastInteract = performance.now(); };
  container.addEventListener("pointerdown", onInteract);
  container.addEventListener("wheel", onInteract, { passive: true });
  container.addEventListener("touchstart", onInteract, { passive: true });

  const rotateLoop = () => {
    const now = performance.now();
    if (now - lastInteract > 3500 && now > pauseUntil) {
      const b = map.getBearing();
      map.jumpTo({ bearing: b + 0.05 });
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
