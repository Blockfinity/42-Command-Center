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
  const { container, center, zoom = 1.584 } = opts;

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
    // Gesture controls — native handlers cover pan, scroll-zoom, touch
    // pinch-zoom, touch twist-rotate, and touch swipe-tilt. dragRotate is
    // DISABLED: native right-click/shift/ctrl rotate is replaced by custom
    // Google Earth-style mouse handlers (right-click zoom+tilt, middle-mouse
    // rotate, shift-drag tilt, ctrl-drag look) defined below.
    //
    // NOTE: touchZoomRotate (touch pinch + twist) is independent of dragRotate
    // in maplibre-gl v5+, so touch rotate still works with dragRotate: false.
    dragRotate: false,
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

  // ---- Auto-tilt: continuous pitch that scales with zoom (Google Earth style) ----
  // Flat (0°) at globe/region zoom (zoom ≤ 8), ramps continuously to ~55° by
  // zoom 15 (oblique 3D cityscape). This gives the "automatic tilt adjustment"
  // that accompanies zoom in Google Earth — zooming in tilts toward the
  // horizon, zooming out returns to top-down.
  //
  // targetPitchForZoom is shared with the right-click-drag zoom gesture so the
  // tilt stays consistent whether zooming via scroll, double-click, or right-drag.
  //
  // suppressZoomEnd is set during right-click drag (which sets pitch inline on
  // every mousemove) so the easeTo here doesn't fight the live drag updates.
  //
  // ROBUST against cancelled animations: we check the ACTUAL pitch against the
  // target on every zoomend and re-ease only if they're significantly off. The
  // 10° threshold avoids fighting small manual adjustments while still snapping
  // back to the auto-tilt curve after large zoom changes.
  const PITCH_THRESHOLD = 10;    // re-ease if |actual - target| > this
  let suppressZoomEnd = false;   // true during right-click drag (pitch set inline)
  const targetPitchForZoom = (z: number): number => {
    if (z <= 8) return 0;
    if (z >= 15) return 55;
    return (z - 8) * (55 / 7);   // linear ramp 0°→55° across zoom 8→15
  };
  const onZoomEnd = () => {
    if (suppressZoomEnd) return;
    const z = map.getZoom();
    const p = map.getPitch();
    const target = targetPitchForZoom(z);
    if (Math.abs(p - target) > PITCH_THRESHOLD) {
      map.easeTo({ pitch: target, duration: 600 });
    }
  };
  map.on("zoomend", onZoomEnd);

  // ---- Google Earth-style mouse gestures ----
  // Native MapLibre handlers cover: left-drag pan, scroll zoom, double-click
  // zoom, touch pinch-zoom, touch two-finger twist-rotate, touch two-finger
  // swipe-tilt. dragRotate is DISABLED (above) so native right-click/shift/ctrl
  // rotate never fires — we implement those gestures manually to match Google
  // Earth's control scheme exactly:
  //
  //   Right-click drag (up/down)        → Zoom in/out + automatic tilt adjustment
  //   Middle-mouse drag (left/right)    → Rotate / spin view (bearing)
  //   Shift + left-click drag (up/down) → Tilt view (pitch)
  //   Ctrl/Cmd + left-click drag        → First-person look (pitch + bearing)
  //   Double-click                      → Zoom in 3x, centered on click [above]
  //   Left-click drag                   → Pan  [native dragPan]
  //   Scroll wheel                      → Zoom [native scrollZoom]
  //
  // Touch (native MapLibre touchZoomRotate + touchPitch):
  //   Double-tap           → Zoom in [handler above]
  //   Pinch in/out         → Zoom out/in
  //   One-finger drag      → Pan
  //   Two-finger twist     → Rotate
  //   Two-finger swipe up  → Tilt toward horizon
  //   Two-finger swipe down → Tilt toward top-down
  const canvas = map.getCanvas();

  type GestureState = {
    type: "right-zoom" | "middle-rotate" | "shift-tilt" | "ctrl-look";
    startX: number;
    startY: number;
    startZoom: number;
    startPitch: number;
    startBearing: number;
  };
  let activeGesture: GestureState | null = null;

  const onCanvasMouseDown = (e: MouseEvent) => {
    const button = e.button;
    // Shift + left-click → tilt
    if (button === 0 && e.shiftKey) {
      activeGesture = {
        type: "shift-tilt",
        startX: e.clientX, startY: e.clientY,
        startZoom: map.getZoom(), startPitch: map.getPitch(), startBearing: map.getBearing(),
      };
      // Suppress native dragPan so it doesn't pan while we tilt.
      if (map.dragPan.isEnabled()) map.dragPan.disable();
      pauseAutoRotate(3000);
      e.preventDefault();
      return;
    }
    // Ctrl/Cmd + left-click → first-person look (pitch + bearing)
    if (button === 0 && (e.ctrlKey || e.metaKey)) {
      activeGesture = {
        type: "ctrl-look",
        startX: e.clientX, startY: e.clientY,
        startZoom: map.getZoom(), startPitch: map.getPitch(), startBearing: map.getBearing(),
      };
      if (map.dragPan.isEnabled()) map.dragPan.disable();
      pauseAutoRotate(3000);
      e.preventDefault();
      return;
    }
    // Right-click → zoom + automatic tilt
    if (button === 2) {
      activeGesture = {
        type: "right-zoom",
        startX: e.clientX, startY: e.clientY,
        startZoom: map.getZoom(), startPitch: map.getPitch(), startBearing: map.getBearing(),
      };
      suppressZoomEnd = true;
      pauseAutoRotate(3000);
      e.preventDefault();
      return;
    }
    // Middle-click → rotate (bearing)
    if (button === 1) {
      activeGesture = {
        type: "middle-rotate",
        startX: e.clientX, startY: e.clientY,
        startZoom: map.getZoom(), startPitch: map.getPitch(), startBearing: map.getBearing(),
      };
      pauseAutoRotate(3000);
      e.preventDefault();
      return;
    }
  };
  // Capture phase so we run BEFORE MapLibre's own bubble-phase mousedown handlers.
  canvas.addEventListener("mousedown", onCanvasMouseDown, true);

  // Suppress the browser context menu on right-click over the canvas.
  const onContextMenu = (e: MouseEvent) => e.preventDefault();
  canvas.addEventListener("contextmenu", onContextMenu);

  const onMouseMove = (e: MouseEvent) => {
    if (!activeGesture) return;
    const dx = e.clientX - activeGesture.startX;
    const dy = e.clientY - activeGesture.startY;
    switch (activeGesture.type) {
      case "right-zoom": {
        // Drag up (negative dy) = zoom in; drag down (positive dy) = zoom out.
        // ~0.012 zoom levels per pixel → 100px drag ≈ 1.2 zoom levels.
        const newZoom = Math.max(0, Math.min(18, activeGesture.startZoom - dy * 0.012));
        // Automatic tilt: pitch scales continuously with the new zoom.
        map.jumpTo({ zoom: newZoom, pitch: targetPitchForZoom(newZoom) });
        break;
      }
      case "middle-rotate": {
        // Horizontal drag rotates bearing. Drag right = rotate clockwise.
        map.jumpTo({ bearing: activeGesture.startBearing - dx * 0.25 });
        break;
      }
      case "shift-tilt": {
        // Vertical drag tilts. Drag down = tilt toward horizon; up = top-down.
        const newPitch = Math.max(0, Math.min(80, activeGesture.startPitch + dy * 0.35));
        map.jumpTo({ pitch: newPitch });
        break;
      }
      case "ctrl-look": {
        // First-person look: vertical = pitch, horizontal = bearing.
        const newPitch = Math.max(0, Math.min(80, activeGesture.startPitch + dy * 0.35));
        map.jumpTo({
          pitch: newPitch,
          bearing: activeGesture.startBearing - dx * 0.25,
        });
        break;
      }
    }
  };
  window.addEventListener("mousemove", onMouseMove);

  const endGesture = () => {
    if (!activeGesture) return;
    const wasRightZoom = activeGesture.type === "right-zoom";
    activeGesture = null;
    // Re-enable native dragPan (disabled during shift/ctrl gestures).
    if (!map.dragPan.isEnabled()) map.dragPan.enable();
    if (wasRightZoom) {
      suppressZoomEnd = false;
    }
  };
  window.addEventListener("mouseup", endGesture);

  // Cancel any active gesture if the window loses focus (e.g. alt-tab mid-drag).
  const onBlurGesture = () => {
    if (activeGesture) {
      activeGesture = null;
      if (!map.dragPan.isEnabled()) map.dragPan.enable();
      suppressZoomEnd = false;
    }
  };
  window.addEventListener("blur", onBlurGesture);

  // ---- Auto-spin loop (pauses 3.5s after user interaction) ----
  // SPIN ON AXIS, not view rotation. We shift the center longitude eastward
  // over time so the visible surface drifts westward (right → left) under a
  // fixed camera — the planet rotates on its axis. This is fundamentally
  // different from setBearing, which rotates the whole view like clock hands
  // sweeping around the dial.
  //
  // Throttled to ~20fps and gated on document visibility to avoid wasted
  // GPU repaints when the tab is hidden or the user is interacting.
  //
  // Only spins at globe/region zoom (zoom < 9). At city/street zoom, panning
  // the center would teleport the view and fight user exploration, so we
  // skip it — the auto-pitch handler keeps the 3D cityscape steady.
  const SPIN_ZOOM_MAX = 9;
  const SPIN_LNG_DELTA = 0.06; // degrees eastward per tick → surface drifts west
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
        // Only spin when looking at the globe/region. At city zoom the user
        // is exploring — auto-panning would be disorienting.
        if (map.getZoom() < SPIN_ZOOM_MAX) {
          const c = map.getCenter();
          // Incrementing longitude = camera drifts east = surface drifts
          // west (right → left) across the visible disk. Normalize to
          // [-180, 180] so the value doesn't grow unbounded over long
          // sessions (MapLibre handles wrapping in rendering, but keeping
          // the stored value bounded is cleaner).
          const newLng = c.lng + SPIN_LNG_DELTA;
          const wrappedLng = ((newLng + 180) % 360 + 360) % 360 - 180;
          // jumpTo = instant set, no animation. At 20fps with a 0.06° delta
          // the motion reads as smooth continuous spin (same visual cadence
          // as the old setBearing approach, just translating instead of
          // rotating the view).
          map.jumpTo({ center: [wrappedLng, c.lat] });
        }
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
    canvas.removeEventListener("mousedown", onCanvasMouseDown, true);
    canvas.removeEventListener("contextmenu", onContextMenu);
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", endGesture);
    window.removeEventListener("blur", onBlurGesture);
    map.remove();
  };

  return { map, resetHome, pauseAutoRotate, destroy };
}
