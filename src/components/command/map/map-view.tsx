// ---------------------------------------------------------------------------
// MapView — the main map component that replaces the monolithic world-map.tsx.
//
// This is a thin shell:
//   1. Creates a container div
//   2. Initializes the map-controller (MapLibre + globe + auto-rotate + resetHome)
//   3. Renders the LayerHost (which mounts all layers + sources + rAF loop)
//   4. Renders HUD overlays (bearing readout, territory summary, placement hint)
//
// Data flow: the game-engine source adapter subscribes to the zustand store
// and emits NormalizedEvents → the layer-host routes them to layers. This
// component does NOT pass state to layers — it only reads state for HUD display.
//
// To add a new data source (42, AORDF, future AR app):
//   1. Create sources/<name>.source.ts
//   2. Add it to BOOT_SOURCES in registry/sources.ts
//   Layers that subscribe to the new source's ID receive data automatically.
//
// To add a new visualization:
//   1. Create layers/<name>.layer.ts
//   2. Append it to LAYERS in registry/layers.ts
//   No other changes needed.
// ---------------------------------------------------------------------------

"use client";

import * as React from "react";
import type maplibregl from "maplibre-gl";
import { useCommand } from "@/stores/command";
import { createMap, type MapController } from "./map-controller";
import { LayerHost } from "./layer-host";
import type { MapInteraction } from "./types";
import { formatTotalActions } from "./utils/geo";
import { cn } from "@/lib/utils";

interface MapViewProps {
  /** Initial camera center [lng, lat]. Computed by the parent from the operative's home outpost. */
  initialCenter: [number, number];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onMapClick: (lat: number, lng: number) => void;
  placementMode: boolean;
}

export function MapView({
  initialCenter,
  selectedId,
  onSelect,
  onMapClick,
  placementMode,
}: MapViewProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [map, setMap] = React.useState<maplibregl.Map | null>(null);
  const [bearing, setBearing] = React.useState(0);
  const [centerLat, setCenterLat] = React.useState(0);

  // Read state from the store for HUD readouts (NOT for layer data —
  // layer data flows through the source adapter).
  const state = useCommand((s) => s.state);

  // Keep latest props in refs so the interaction object identity is stable.
  const selectedIdRef = React.useRef(selectedId);
  const onSelectRef = React.useRef(onSelect);
  const onMapClickRef = React.useRef(onMapClick);
  const placementRef = React.useRef(placementMode);
  React.useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
  React.useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  React.useEffect(() => { onMapClickRef.current = onMapClick; }, [onMapClick]);
  React.useEffect(() => { placementRef.current = placementMode; }, [placementMode]);

  // ---- Create the map once ----
  React.useEffect(() => {
    if (!containerRef.current) return;

    const controller = createMap({
      container: containerRef.current,
      center: initialCenter,
    });
    const m = controller.map;

    // Expose the controller on the map instance so the layer-host can call
    // resetHome() on empty-ocean clicks (globe-reset feature).
    (m as unknown as { _controller?: MapController })._controller = controller;

    setMap(m);

    // Debug hook — exposes the map instance for QA testing (zoom, inspect layers).
    if (typeof window !== "undefined") {
      (window as unknown as { __map?: maplibregl.Map }).__map = m;
    }

    const onMove = () => {
      setBearing(Math.round(m.getBearing()));
      setCenterLat(Math.round(m.getCenter().lat));
    };
    m.on("move", onMove);
    onMove();

    return () => {
      m.off("move", onMove);
      controller.destroy();
    };
  }, []);

  // ---- Stable interaction object ----
  const interaction: MapInteraction = React.useMemo(
    () => ({
      get selectedId() { return selectedIdRef.current; },
      get placementMode() { return placementRef.current; },
      onSelect: (id) => onSelectRef.current(id),
      onMapClick: (lat, lng) => onMapClickRef.current(lat, lng),
    }),
    [],
  );

  // ---- Territory control summary for HUD ----
  const territorySummary = React.useMemo(() => {
    const c = { FANG: 0, HAMMER: 0, RESOLUTE: 0, CONTESTED: 0 };
    if (state) {
      for (const t of state.territories) {
        if (t.controller) c[t.controller]++;
        else c.CONTESTED++;
      }
    }
    return c;
  }, [state]);

  const cursor = placementMode ? "cursor-crosshair" : "cursor-grab";

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      {/* Flat black backdrop behind the transparent WebGL canvas */}
      <div className="pointer-events-none absolute inset-0 bg-black" />

      {/* MapLibre canvas — all graphics are WebGL layers ON the globe surface */}
      <div
        ref={containerRef}
        className={cn(cursor)}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: "50%",
          height: "135%",
          transform: "translateY(-50%)",
        }}
      />

      {/* LayerHost mounts all gameplay layers + sources once the map is ready */}
      {map && <LayerHost map={map} interaction={interaction} />}

      {/* Coordinate readout (bottom-left) */}
      <div className="pointer-events-none absolute bottom-3 left-4 font-mono text-[9px] tracking-[0.14em] text-white/40">
        GLOBE · LIMB LOCK · ROT {bearing}°/{centerLat}°
      </div>

      {/* Network load readout (top-right) */}
      {state && (
        <div className="pointer-events-none absolute right-4 top-3 text-right font-mono text-[9px] tracking-[0.14em] text-white/40">
          NET LOAD · {state.networkLoad}M ACT/S · {formatTotalActions(state.totalActions)} TOTAL
        </div>
      )}

      {/* Territory control summary (bottom-center) */}
      <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 font-mono text-[9px] tracking-[0.14em] text-white/40">
        FANG {territorySummary.FANG} · HAMMER {territorySummary.HAMMER} · RESOLUTE {territorySummary.RESOLUTE} · CONTESTED {territorySummary.CONTESTED}
      </div>

      {/* Placement hint */}
      {placementMode && (
        <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 border border-white/30 bg-black/70 px-3 py-1.5 font-mono text-[10px] tracking-[0.2em] text-white/90 backdrop-blur">
          CLICK GLOBE TO DEPLOY OUTPOST · ESC TO CANCEL
        </div>
      )}
    </div>
  );
}
