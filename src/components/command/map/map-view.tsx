// ---------------------------------------------------------------------------
// MapView — the main map component that replaces the monolithic world-map.tsx.
//
// This is a thin shell:
//   1. Creates a container div
//   2. Initializes the map-controller (MapLibre + globe + auto-rotate + resetHome)
//   3. Renders the LayerHost (which mounts all layers + sources + rAF loop)
//   4. Renders HUD overlays (bearing readout, territory summary, placement hint,
//      SurveilTrack-style ground-view chrome: UnitInfoPanel, zoom controls,
//      City/District/Street layer tabs)
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
import { Plus, Minus, Maximize2 } from "lucide-react";
import { useCommand } from "@/stores/command";
import { createMap, type MapController } from "./map-controller";
import { LayerHost } from "./layer-host";
import type { MapInteraction } from "./types";
import { formatTotalActions } from "./utils/geo";
import { UnitInfoPanel } from "./unit-info-panel";
import { cn } from "@/lib/utils";

interface MapViewProps {
  /** Initial camera center [lng, lat]. Computed by the parent from the operative's home outpost. */
  initialCenter: [number, number];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onMapClick: (lat: number, lng: number) => void;
  placementMode: boolean;
}

/** Layer-tab presets — zoom + pitch combos matching the SurveilTrack reference. */
const LAYER_TABS = [
  { id: "CITY", label: "City", zoom: 12, pitch: 45 },
  { id: "DISTRICT", label: "District", zoom: 14, pitch: 55 },
  { id: "STREET", label: "Street", zoom: 16, pitch: 60 },
] as const;

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
  const [activeTab, setActiveTab] = React.useState<string | null>(null);

  // Read state from the store for HUD readouts + the selected outpost (for
  // the ground-view UnitInfoPanel). Layer data flows through the source adapter.
  const state = useCommand((s) => s.state);
  const setGroundView = useCommand((s) => s.setGroundView);
  const selectedOutpost = React.useMemo(
    () => state?.outposts.find((o) => o.id === selectedId) ?? null,
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
      // Clear the active layer tab if the user zoomed away from any preset.
      // (compare rounded zoom to the presets)
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

  // ---- Ground-view visibility (SurveilTrack chrome shows at city/street zoom) ----
  const isGroundView = zoom >= 12;
  // Sync to the store so command-deck can hide the floating OutpostDetailCard
  // (the UnitInfoPanel replaces it at street zoom to avoid overlap/duplication).
  React.useEffect(() => { setGroundView(isGroundView); }, [isGroundView, setGroundView]);

  // ---- Layer tab click → ease to preset (centered on selected outpost or current center) ----
  const handleTab = React.useCallback(
    (tab: (typeof LAYER_TABS)[number]) => {
      if (!map) return;
      // Pause auto-rotate so its per-frame jumpTo doesn't cancel the easeTo.
      const ctrl = (map as unknown as { _controller?: MapController })._controller;
      ctrl?.pauseAutoRotate(1500);
      const center = selectedOutpost
        ? ([selectedOutpost.lng, selectedOutpost.lat] as [number, number])
        : ([map.getCenter().lng, map.getCenter().lat] as [number, number]);
      setActiveTab(tab.id);
      map.easeTo({ center, zoom: tab.zoom, pitch: tab.pitch, duration: 900 });
    },
    [map, selectedOutpost],
  );

  // ---- Zoom controls ----
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
  const toggleFullscreen = React.useCallback(() => {
    if (!map) return;
    const ctrl = (map as unknown as { _controller?: MapController })._controller;
    ctrl?.resetHome();
  }, [map]);

  const cursor = placementMode ? "cursor-crosshair" : "cursor-grab";

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      {/* Flat black backdrop behind the transparent WebGL canvas */}
      <div className="pointer-events-none absolute inset-0 bg-black" />

      {/* MapLibre canvas — all graphics are WebGL layers ON the globe surface.
          Container fills the parent with no CSS transform — transforms break
          MapLibre's project()/queryRenderedFeatures coordinate alignment. */}
      <div
        ref={containerRef}
        className={cn("absolute inset-0", cursor)}
      />

      {/* LayerHost mounts all gameplay layers + sources once the map is ready */}
      {map && <LayerHost map={map} interaction={interaction} />}

      {/* ===== SurveilTrack-style ground-view chrome (city/street zoom only) ===== */}

      {/* Layer tabs — City / District / Street (top-center, below the header) */}
      <div
        className={cn(
          "pointer-events-auto absolute left-1/2 top-20 z-20 flex -translate-x-1/2 transition-opacity duration-300",
          isGroundView || zoom >= 8 ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <div className="flex border border-white/25 bg-black/80 backdrop-blur">
          {LAYER_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTab(tab)}
              className={cn(
                "px-3 py-1 font-mono text-[9px] tracking-[0.18em] transition-colors",
                activeTab === tab.id
                  ? "bg-white/15 text-white"
                  : "text-white/45 hover:text-white/80",
                tab.id !== "CITY" && "border-l border-white/15",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Unit info panel — floating left-center, shown when a unit is selected + ground view */}
      <UnitInfoPanel outpost={selectedOutpost} visible={isGroundView} />

      {/* Zoom controls — bottom-right */}
      <div
        className={cn(
          "pointer-events-auto absolute bottom-8 right-4 z-20 flex flex-col gap-1 transition-opacity duration-300",
          isGroundView ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
      >
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
          onClick={toggleFullscreen}
          aria-label="Reset view"
          className="flex h-8 w-8 items-center justify-center border border-white/25 bg-black/80 text-white/85 backdrop-blur transition-colors hover:bg-white/15 hover:text-white"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ===== HUD readouts ===== */}

      {/* Coordinate readout (bottom-left) */}
      <div className="pointer-events-none absolute bottom-3 left-4 font-mono text-[9px] tracking-[0.14em] text-white/40">
        {isGroundView
          ? `GROUND · Z${zoom.toFixed(1)} · ROT ${bearing}°`
          : `GLOBE · LIMB LOCK · ROT ${bearing}°/${centerLat}°`}
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
          CLICK GLOBE TO DEPLOY OUTPOST · ESC TO CANCEL
        </div>
      )}
    </div>
  );
}
