// ---------------------------------------------------------------------------
// MapView — the main map component. ONE CONTINUOUS 3D MAP (Google Earth style).
//
// This is a thin shell:
//   1. Creates a container div
//   2. Initializes the map-controller (MapLibre + globe + auto-rotate + resetHome)
//   3. Renders the LayerHost (which mounts all layers + sources + rAF loop)
//   4. Renders HUD overlays (bearing readout, territory summary, placement hint,
//      SurveilTrack-style chrome: UnitInfoPanel when selected, zoom controls)
//
// No two-mode transition. Zoom is continuous from globe to street. The
// SurveilTrack aesthetic (dark monochrome, white roads, 3D buildings, white
// square markers with alphanumeric codes) is the basemap at ALL zoom levels.
//
// Data flow: the game-engine source adapter subscribes to the zustand store
// and emits NormalizedEvents → the layer-host routes them to layers. This
// component does NOT pass state to layers — it only reads state for HUD display.
// ---------------------------------------------------------------------------

"use client";

import * as React from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import type maplibregl from "maplibre-gl";
import { Plus, Minus, Maximize2 } from "lucide-react";
import { useCommand } from "@/stores/command";
import { createMap, type MapController } from "./map-controller";
import { LayerHost } from "./layer-host";
import type { MapInteraction } from "./types";
import { formatTotalActions } from "./utils/geo";
import { UnitInfoPanel } from "./unit-info-panel";
import { cn } from "@/lib/utils";

interface MapViewProps {
  /** Initial camera center [lng, lat]. Computed by the parent from the operative's home garrison. */
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
  const [zoom, setZoom] = React.useState(1.6);

  // Read state from the store for HUD readouts + the selected garrison (for
  // the UnitInfoPanel). Layer data flows through the source adapter.
  const state = useCommand((s) => s.state);
  const selectedGarrison = React.useMemo(
    () => state?.garrisons.find((o) => o.id === selectedId) ?? null,
    [state, selectedId],
  );

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
      setZoom(Math.round(m.getZoom() * 10) / 10);
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

  // ---- Zoom controls (always visible — Google Earth-like) ----
  const zoomIn = React.useCallback(() => {
    if (!map) return;
    (map as unknown as { _controller?: MapController })._controller?.pauseAutoRotate(800);
    map.zoomIn({ duration: 500 });
  }, [map]);
  const zoomOut = React.useCallback(() => {
    if (!map) return;
    (map as unknown as { _controller?: MapController })._controller?.pauseAutoRotate(800);
    map.zoomOut({ duration: 500 });
  }, [map]);
  const resetView = React.useCallback(() => {
    if (!map) return;
    (map as unknown as { _controller?: MapController })._controller?.resetHome();
  }, [map]);

  const cursor = placementMode ? "cursor-crosshair" : "cursor-grab";

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      {/* Flat black backdrop behind the transparent WebGL canvas */}
      <div className="pointer-events-none absolute inset-0 bg-black" />

      {/* MapLibre canvas — all graphics are WebGL layers ON the globe surface.
          Container fills the parent with h-full w-full (NOT absolute inset-0 —
          MapLibre's CSS sets .maplibregl-map { position: relative } which
          overrides Tailwind's absolute, breaking inset-0 sizing). */}
      <div
        ref={containerRef}
        className={cn("h-full w-full", cursor)}
      />

      {/* LayerHost mounts all gameplay layers + sources once the map is ready */}
      {map && <LayerHost map={map} interaction={interaction} />}

      {/* ===== SurveilTrack-style chrome ===== */}

      {/* Unit info panel — floating left-center, shown whenever a unit is selected */}
      <UnitInfoPanel garrison={selectedGarrison} visible={!!selectedGarrison} />

      {/* Zoom controls — bottom-right, always visible (Google Earth-like) */}
      <div className="pointer-events-auto absolute bottom-8 right-4 z-20 flex flex-col gap-1">
        <button
          onClick={zoomIn}
          aria-label="Zoom in"
          className="flex h-8 w-8 items-center justify-center border border-white/25 bg-black/80 text-white/85 backdrop-blur transition-colors hover:bg-white/15 hover:text-white"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          onClick={zoomOut}
          aria-label="Zoom out"
          className="flex h-8 w-8 items-center justify-center border border-white/25 bg-black/80 text-white/85 backdrop-blur transition-colors hover:bg-white/15 hover:text-white"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          onClick={resetView}
          aria-label="Reset view"
          className="flex h-8 w-8 items-center justify-center border border-white/25 bg-black/80 text-white/85 backdrop-blur transition-colors hover:bg-white/15 hover:text-white"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ===== HUD readouts ===== */}

      {/* Coordinate readout (bottom-left) */}
      <div className="pointer-events-none absolute bottom-3 left-4 font-mono text-[9px] tracking-[0.14em] text-white/40">
        Z{zoom.toFixed(1)} · ROT {bearing}°/{centerLat}°
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
        <div className="pointer-events-none absolute left-1/2 top-32 -translate-x-1/2 border border-white/30 bg-black/70 px-3 py-1.5 font-mono text-[10px] tracking-[0.2em] text-white/90 backdrop-blur">
          CLICK GLOBE TO DEPLOY GARRISON · ESC TO CANCEL
        </div>
      )}
    </div>
  );
}
