// ---------------------------------------------------------------------------
// Layer host — the orchestrator that mounts layers, routes NormalizedEvents,
// and runs the rAF animation loop.
//
// Responsibilities:
//   1. After map load: call addSources() + addLayers() for every layer in LAYERS
//   2. Subscribe to the source registry → route source:set events to layers
//      that subscribe to the matching sourceId
//   3. Register a single map click handler that dispatches to layer onClick()
//      handlers in order (first handler that calls e.preventDefault() wins)
//   4. Register hover handlers for each layer's feature layers
//   5. Run a single rAF loop that calls every layer's animate() if present
//   6. On unmount: call destroy() on every layer, stop sources, cancel rAF
//
// The layer-host is the ONLY component that touches the map instance directly
// (besides the controller). Layers receive the map via their callbacks.
// ---------------------------------------------------------------------------

"use client";

import * as React from "react";
import type maplibregl from "maplibre-gl";
import type { NormalizedEvent, MapInteraction } from "./types";
import { LAYERS } from "./registry/layers";
import { sourceRegistry } from "./registry/sources";
import { MapProvider } from "./map-context";

interface LayerHostProps {
  map: maplibregl.Map;
  interaction: MapInteraction;
  children?: React.ReactNode;
}

export function LayerHost({ map, interaction, children }: LayerHostProps) {
  const interactionRef = React.useRef(interaction);
  React.useEffect(() => { interactionRef.current = interaction; }, [interaction]);

  React.useEffect(() => {
    let rafId: number | null = null;
    let mounted = true;

    // ---- Map readiness guard ----
    // MapLibre throws "can't access property X, this.style is undefined" if
    // you call getSource/getLayer/setPaintProperty/etc. after map.remove()
    // has run (style is nulled) or before the style has loaded. During
    // unmount there's a race: map-controller.destroy() calls map.remove(),
    // but this effect's cleanup (unsubscribe + stopAll) runs slightly later.
    // Any source emission in that window would crash onData. This guard
    // protects ALL layers from that race — no per-layer try/catch needed.
    const isMapReady = (): boolean =>
      !!map.style && !(map as unknown as { _removed?: boolean })._removed;

    const onReady = () => {
      if (!mounted) return;

      // 1. Mount all layers: sources first, then render layers.
      for (const layer of LAYERS) {
        layer.addSources?.(map);
      }
      for (const layer of LAYERS) {
        layer.addLayers?.(map);
      }

      // 2. Subscribe to source events → route to layers.
      const unsubscribe = sourceRegistry.subscribe((event: NormalizedEvent) => {
        if (event.type === "source:set") {
          // Guard: skip if the map has been removed or style isn't ready.
          // This is the root-cause fix for the "this.style is undefined"
          // crash that happened during unmount races.
          if (!isMapReady()) return;
          for (const layer of LAYERS) {
            if (layer.sourceIds.includes(event.sourceId)) {
              layer.onData?.(map, event.sourceId, event.data);
            }
          }
        }
      });

      // 3. Start all sources (they emit NormalizedEvents via the registry bus).
      sourceRegistry.startAll();

      // 4. Single click handler — dispatches to layer onClick() in order.
      //
      // CLICK VS DOUBLE-CLICK DISAMBIGUATION:
      // A 250ms delay distinguishes single from double clicks. The pending
      // single-click is cancelled if a dblclick arrives within 250ms — so
      // double-clicking ONLY triggers the 3x zoom (map-controller's onDblClick),
      // never the deselect/reset logic. Without this, every double-click would
      // fire two single-clicks (deselect + reset) before the zoom, fighting it.
      let clickTimer: ReturnType<typeof setTimeout> | null = null;
      const CLICK_DELAY_MS = 250;

      const onClick = (e: maplibregl.MapMouseEvent & { features?: unknown[] }) => {
        // If a previous click is pending, this is a double-click — cancel the
        // pending single-click and let the dblclick handler (3x zoom) take over.
        if (clickTimer !== null) {
          clearTimeout(clickTimer);
          clickTimer = null;
          return;
        }
        // Schedule the single-click logic after a short delay. If a second
        // click arrives before the delay expires, it's cancelled above.
        clickTimer = setTimeout(() => {
          clickTimer = null;
          const ctx = { interaction: interactionRef.current };
          // Let each layer try to handle the click. If a layer calls
          // e.preventDefault(), subsequent layers skip.
          let handled = false;
          for (const layer of LAYERS) {
            if (handled) break;
            if (!layer.onClick) continue;
            // Create a wrapper event that tracks preventDefault.
            let prevented = false;
            const wrappedE = {
              ...e,
              preventDefault: () => { prevented = true; },
            };
            layer.onClick(map, wrappedE as never, ctx);
            if (prevented) {
              handled = true;
              break;
            }
          }
          // If no layer handled it → empty-ocean / empty-ground click.
          if (!handled) {
            const intr = interactionRef.current;
            if (intr.placementMode) {
              intr.onMapClick(e.lngLat.lat, e.lngLat.lng);
            } else {
              // Deselect the active garrison (if any).
              intr.onSelect(null);
              // Globe reset (ease back to home) — only at low zoom. At street
              // zoom, clicking empty ground just deselects; resetting the camera
              // all the way to globe view would be disorienting.
              if (map.getZoom() < 10) {
                const controller = (map as unknown as { _controller?: { resetHome: () => void } })._controller;
                controller?.resetHome();
              }
            }
          }
        }, CLICK_DELAY_MS);
      };
      map.on("click", onClick);

      // 5. Hover handlers — for each layer that has onHover, register
      //    mouseenter/mouseleave on all render layers. We query the map's
      //    style to find which layer IDs belong to which MapLayerSpec.
      //    For simplicity, we register a single move handler that checks
      //    all garrison layers for cursor management.
      const onMove = () => {
        const intr = interactionRef.current;
        map.getCanvas().style.cursor = intr.placementMode ? "crosshair" : "grab";
      };
      const setPointer = () => {
        const intr = interactionRef.current;
        map.getCanvas().style.cursor = intr.placementMode ? "crosshair" : "pointer";
      };
      const setGrab = () => {
        const intr = interactionRef.current;
        map.getCanvas().style.cursor = intr.placementMode ? "crosshair" : "grab";
      };
      // Garrison hover → pointer (all garrison marker layers).
      // Note: garrison-clusters layer was removed when clustering was disabled
      // (every garrison now renders as an individual marker at all zoom levels).
      [
        "garrison-square",
        "garrison-code",
        "garrison-select",
        "garrison-hitbox",
      ].forEach((layerId) => {
        if (map.getLayer(layerId)) {
          map.on("mouseenter", layerId, setPointer);
          map.on("mouseleave", layerId, setGrab);
        }
      });
      map.getCanvas().style.cursor = "grab";
      map.on("move", onMove);

      // 6. Single rAF animation loop — calls every layer's animate().
      // Throttled to ~30fps (33ms) instead of 60fps — the pulse/mission
      // animations are visually indistinguishable above 30fps, and this
      // halves the number of setPaintProperty calls (which trigger WebGL
      // repaints). Also gated on document visibility: when the tab is
      // hidden, rAF is throttled to ~1fps by the browser anyway, but we
      // skip the animate() calls entirely to avoid wasted CPU.
      const ANIMATE_INTERVAL_MS = 33; // ~30fps
      let lastAnimateTick = 0;
      const animateLoop = () => {
        if (!mounted) return;
        if (document.hidden) {
          rafId = requestAnimationFrame(animateLoop);
          return;
        }
        const now = performance.now();
        if (now - lastAnimateTick >= ANIMATE_INTERVAL_MS) {
          lastAnimateTick = now;
          // Guard: skip animate() calls if the map has been removed. Some
          // layers (outposts) wrap their paint calls in try/catch, but not
          // all do — this central guard protects every layer uniformly.
          if (isMapReady()) {
            for (const layer of LAYERS) {
              layer.animate?.(map, now);
            }
          }
        }
        rafId = requestAnimationFrame(animateLoop);
      };
      rafId = requestAnimationFrame(animateLoop);

      // Cleanup
      return () => {
        if (rafId !== null) cancelAnimationFrame(rafId);
        if (clickTimer !== null) clearTimeout(clickTimer);
        map.off("click", onClick);
        map.off("move", onMove);
        ["garrison-square", "garrison-code", "garrison-select", "garrison-hitbox"].forEach((layerId) => {
          if (map.getLayer(layerId)) {
            map.off("mouseenter", layerId, setPointer);
            map.off("mouseleave", layerId, setGrab);
          }
        });
        unsubscribe();
        sourceRegistry.stopAll();
        for (const layer of LAYERS) {
          layer.destroy?.(map);
        }
      };
    };

    if (map.loaded()) {
      const cleanup = onReady();
      return cleanup;
    } else {
      map.on("load", onReady);
      return () => {
        mounted = false;
        if (rafId !== null) cancelAnimationFrame(rafId);
        map.off("load", onReady);
      };
    }
  }, [map]);

  return React.createElement(MapProvider, { map, interaction, children });
}
