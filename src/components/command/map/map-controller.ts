// ---------------------------------------------------------------------------
// Map controller — MapLibre initialization, camera, globe projection, and
// the auto-rotate interaction loop.
//
// This is the low-level controller. It creates the MapLibre instance, sets up
// the base style (satellite + coastlines + graticule), handles camera centering,
// and runs the auto-rotate rAF loop that pauses on user interaction.
//
// The controller also stores the initial "home" camera and exposes resetHome()
// so the layer-host can implement the "click empty ocean → reset globe" feature.
//
// The controller does NOT know about gameplay layers or data sources — those
// are mounted by the layer-host after the map loads.
// ---------------------------------------------------------------------------

import maplibregl from "maplibre-gl";
import type { FeatureCollection, Geometry, GeoJSON } from "geojson";
import { feature } from "topojson-client";
import worldTopo from "world-atlas/countries-10m.json";
import { buildRasterSource, buildVectorSource } from "./tile-provider";

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
 * Create the MapLibre map instance with the base tactical style.
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

  // Conditionally add the vector tile source (roads/buildings/labels).
  // Only present when the active provider ships vector tiles (MapTiler, self-hosted).
  // Esri satellite-only baseline has no vector tiles — layers that reference
  // this source skip mounting when it's absent.
  const vectorSource = buildVectorSource();

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
        ...(vectorSource ? { "vector-tiles": vectorSource } : {}),
      },
      layers: [
        // Real satellite Earth — desaturated + darkened to monochrome tactical.
        // Fades OUT at city zoom (11→13) so the stylized dark-mono cityscape
        // (dark bg + lighter-gray water + 3D buildings + white roads) takes over,
        // matching the SurveilTrack ground-view aesthetic.
        {
          id: "satellite-base",
          type: "raster",
          source: "satellite",
          paint: {
            "raster-opacity": ["interpolate", ["linear"], ["zoom"], 0, 1.0, 10, 1.0, 12, 0.55, 13.5, 0.0],
            "raster-saturation": -0.85,
            "raster-brightness-min": 0,
            "raster-brightness-max": 0.85,
            "raster-contrast": 0.15,
            "raster-hue-rotate": 0,
          },
        },
        // Dark monochrome ground base — fades IN as satellite fades out.
        // Solid near-black so 3D buildings + white roads read clearly.
        { id: "ocean-fill", type: "fill", source: "ocean", paint: {
          "fill-color": "#070708",
          "fill-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.10, 11, 0.10, 13, 0.92, 15, 0.96],
        } },
        // Water bodies (vector tiles) — lighter gray, only when vector tiles exist.
        // Renders above the dark ground base so rivers/harbors read as lighter gray.
        ...(vectorSource ? [{
          id: "water-fill",
          type: "fill" as const,
          source: "vector-tiles",
          "source-layer": "water",
          minzoom: 10,
          paint: {
            "fill-color": "#1c1c20",
            "fill-opacity": ["interpolate", ["linear"], ["zoom"], 10, 0.0, 12, 0.85, 14, 1.0],
          },
        }] : []),
        // Water line outline (shoreline definition)
        ...(vectorSource ? [{
          id: "water-line",
          type: "line" as const,
          source: "vector-tiles",
          "source-layer": "water",
          minzoom: 13,
          paint: {
            "line-color": "#ffffff",
            "line-width": ["interpolate", ["linear"], ["zoom"], 13, 0.3, 16, 0.7],
            "line-opacity": 0.25,
          },
        }] : []),
        // Landuse (parks, urban fabric) — subtle dark texture variation at city zoom
        ...(vectorSource ? [{
          id: "landuse-fill",
          type: "fill" as const,
          source: "vector-tiles",
          "source-layer": "landuse",
          minzoom: 12,
          paint: {
            "fill-color": "#0c0c0e",
            "fill-opacity": 0.6,
          },
        }] : []),
        { id: "graticule", type: "line", source: "graticule", paint: {
          "line-color": "#fff",
          "line-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.06, 11, 0.06, 13, 0.0],
          "line-width": 0.4,
        } },
        { id: "countries-fill", type: "fill", source: "world", paint: {
          "fill-color": "#fff",
          "fill-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.03, 11, 0.03, 13, 0.0],
        } },
        {
          id: "countries-line",
          type: "line",
          source: "world",
          paint: {
            "line-color": "#fff",
            "line-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.45, 3, 0.55, 6, 0.70, 11, 0.70, 13, 0.0],
            "line-width": ["interpolate", ["linear"], ["zoom"], 0, 0.5, 2, 0.8, 4, 1.2, 6, 1.8, 8, 2.4],
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

  // ---- Auto-pitch: ease to isometric (55°) when zooming into city level ----
  // Gives the SurveilTrack-style 3D cityscape view automatically. Reverts to
  // flat (0°) when zooming back out to globe view. Only fires on threshold
  // crossing (flat↔iso) so it doesn't fight mid-zoom user rotation.
  let lastPitchState: "flat" | "iso" = "flat";
  const onZoom = () => {
    const z = map.getZoom();
    const p = map.getPitch();
    // Threshold 12 aligns with the City layer-tab preset (zoom 12, pitch 45)
    // and the ground-view chrome (zoom ≥ 12). Below 12 → flat globe view.
    const wantIso = z >= 12;
    const state: "flat" | "iso" = wantIso ? "iso" : "flat";
    if (state === lastPitchState) return;
    lastPitchState = state;
    if (wantIso && p < 25) {
      map.easeTo({ pitch: 55, duration: 700 });
    } else if (!wantIso && p > 25) {
      map.easeTo({ pitch: 0, duration: 700 });
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
