"use client";

import * as React from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoJSON } from "geojson";
import type {
  GameState,
  Outpost,
  FactionId,
  ActivityPing,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatTotalActions } from "@/lib/map/geo";
import { mapStyle, makeFactionIcon } from "@/lib/map/style";
import {
  outpostsToGeoJSON,
  halosToGeoJSON,
  missionsToGeoJSON,
  progressHeadsToGeoJSON,
  territoriesToGeoJSON,
  pingsToGeoJSON,
  missionImpactsToGeoJSON,
  FACTION_ICON,
} from "@/lib/map/converters";
import { addGameplaySources, addGameplayLayers } from "@/lib/map/layers";

// ---------------------------------------------------------------------------
// PERFORMANCE / SCALING NOTES
// ---------------------------------------------------------------------------
// At true scale, outposts cluster into region aggregates, pings are downsampled
// by viewport, and the engine would emit deltas. This client renders the visible
// hemisphere only — pings outside ~100° of map center are dropped (equirectangular
// distance check), mission arcs are only built for ACTIVE/COMPLETE missions, and
// outpost clustering collapses dense regions into single circle+count markers
// below zoom 5. The rAF animation loops are throttled to 12–20fps so the render
// cost stays bounded even with hundreds of moving pings.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
interface WorldMapProps {
  state: GameState;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onMapClick: (lat: number, lng: number) => void;
  placementMode: boolean;
}

export function WorldMap({ state, selectedId, onSelect, onMapClick, placementMode }: WorldMapProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<maplibregl.Map | null>(null);
  const lastInteractRef = React.useRef<number>(performance.now());
  const rafRotateRef = React.useRef<number | null>(null);
  const rafPulseRef = React.useRef<number | null>(null);
  const rafProgressRef = React.useRef<number | null>(null);
  const rafPingsRef = React.useRef<number | null>(null);
  const placementRef = React.useRef(placementMode);
  const onSelectRef = React.useRef(onSelect);
  const onMapClickRef = React.useRef(onMapClick);
  const activityPingsRef = React.useRef<ActivityPing[]>(state.activityPings ?? []);
  const missionsRef = React.useRef(state.missions);
  const outpostsRef = React.useRef(state.outposts);
  const lastProgressUpdateRef = React.useRef<number>(0);
  const lastPingUpdateRef = React.useRef<number>(0);
  const [bearing, setBearing] = React.useState(0);
  const [centerLat, setCenterLat] = React.useState(0);

  // Keep refs in sync with latest props
  React.useEffect(() => { placementRef.current = placementMode; }, [placementMode]);
  React.useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  React.useEffect(() => { onMapClickRef.current = onMapClick; }, [onMapClick]);
  React.useEffect(() => { activityPingsRef.current = state.activityPings ?? []; }, [state.activityPings]);
  React.useEffect(() => { missionsRef.current = state.missions; }, [state.missions]);
  React.useEffect(() => { outpostsRef.current = state.outposts; }, [state.outposts]);

  // ---- Territory control summary for HUD (recomputed when territories change) ----
  const territorySummary = React.useMemo(() => {
    const c = { FANG: 0, HAMMER: 0, RESOLUTE: 0, CONTESTED: 0 };
    for (const t of state.territories) {
      if (t.controller) c[t.controller]++;
      else c.CONTESTED++;
    }
    return c;
  }, [state.territories]);

  // ---- Initialise the map once ----
  React.useEffect(() => {
    if (!containerRef.current) return;

    const mine = state.outposts.find(
      (o) => o.faction === state.operative.faction && o.type === "FULL"
    );
    const center: [number, number] = mine ? [mine.lng, mine.lat] : [-32, 8];

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyle,
      center,
      zoom: 1.6,
      maxZoom: 8,
      minZoom: 0,
      bearing: 0,
      attributionControl: false,
      dragRotate: true,
      scrollZoom: true,
      touchZoomRotate: true,
      doubleClickZoom: true,
      antialias: true,
    });
    mapRef.current = map;
    // TEMP DEBUG: expose map instance for browser-based diagnostics
    (window as any).__map = map;

    map.on("load", () => {
      // Globe projection is set in the style spec (`projection: { type: "globe" }`),
      // so it is active from first render. No post-load setProjection needed.

      // ---- Faction shape sprites (WebGL symbol layer icons) ----
      (["FANG", "HAMMER", "RESOLUTE"] as FactionId[]).forEach((f) => {
        const icon = makeFactionIcon(FACTION_ICON[f]);
        if (!map.hasImage(`faction-${f}`)) {
          map.addImage(`faction-${f}`, icon as any);
        }
      });

      // ---- Gameplay sources + layers (defined in @/lib/map/layers) ----
      addGameplaySources(map, state, selectedId);
      addGameplayLayers(map);

      // ===========================================================
      // INTERACTION
      // ===========================================================

      // Click on a single outpost → select it
      map.on("click", "outpost-shape", (e: maplibregl.MapMouseEvent & { features?: any[] }) => {
        if (placementRef.current) return;
        e.preventDefault();
        const f = e.features?.[0];
        if (f) {
          const id = f.properties?.id as string;
          onSelectRef.current(id === selectedId ? null : id);
        }
      });
      // Also allow clicking the health ring (slightly larger hit area)
      map.on("click", "outpost-health-ring", (e: maplibregl.MapMouseEvent & { features?: any[] }) => {
        if (placementRef.current) return;
        e.preventDefault();
        const f = e.features?.[0];
        if (f) {
          const id = f.properties?.id as string;
          onSelectRef.current(id === selectedId ? null : id);
        }
      });

      // Click on a cluster → zoom in to expand
      map.on("click", "outpost-clusters", (e: maplibregl.MapMouseEvent & { features?: any[] }) => {
        e.preventDefault();
        const f = e.features?.[0];
        if (!f) return;
        const clusterId = f.properties?.cluster_id as number;
        const src = map.getSource("outposts") as maplibregl.GeoJSONSource;
        src.getClusterExpansionZoom(clusterId).then((zoom) => {
          map.easeTo({ center: [f.geometry.coordinates[0], f.geometry.coordinates[1]], zoom: Math.max(zoom, 3) });
        });
      });

      // Click on empty map → placement mode
      map.on("click", (e: maplibregl.MapMouseEvent) => {
        if (!placementRef.current) return;
        // If the click hit an outpost/cluster layer, skip placement
        const feats = map.queryRenderedFeatures(e.point, {
          layers: ["outpost-shape", "outpost-health-ring", "outpost-clusters"],
        });
        if (feats.length > 0) return;
        onMapClickRef.current(e.lngLat.lat, e.lngLat.lng);
      });

      // Hover cursor
      const setPointer = () => { map.getCanvas().style.cursor = placementRef.current ? "crosshair" : "pointer"; };
      const setGrab = () => { map.getCanvas().style.cursor = placementRef.current ? "crosshair" : "grab"; };
      map.on("mouseenter", "outpost-shape", setPointer);
      map.on("mouseenter", "outpost-health-ring", setPointer);
      map.on("mouseenter", "outpost-clusters", setPointer);
      map.on("mouseleave", "outpost-shape", setGrab);
      map.on("mouseleave", "outpost-health-ring", setGrab);
      map.on("mouseleave", "outpost-clusters", setGrab);
      map.getCanvas().style.cursor = "grab";

      // Track center/bearing for readout
      const onMove = () => {
        setBearing(Math.round(map.getBearing()));
        setCenterLat(Math.round(map.getCenter().lat));
      };
      map.on("move", onMove);
      onMove();
    });

    // Track user interaction for auto-rotate pause
    const onInteract = () => { lastInteractRef.current = performance.now(); };
    const el = containerRef.current;
    el.addEventListener("pointerdown", onInteract);
    el.addEventListener("wheel", onInteract, { passive: true });
    el.addEventListener("touchstart", onInteract, { passive: true });

    // ---- Auto-rotate loop ----
    const rotateLoop = () => {
      const now = performance.now();
      if (now - lastInteractRef.current > 3500 && !placementRef.current) {
        const b = map.getBearing();
        map.jumpTo({ bearing: b + 0.05 });
      }
      rafRotateRef.current = requestAnimationFrame(rotateLoop);
    };
    rafRotateRef.current = requestAnimationFrame(rotateLoop);

    // ---- Selection / under-attack pulse + impact glow + aggressive-line pulse ----
    const pulseLoop = () => {
      const t = (performance.now() % 1800) / 1800; // 1.8s cycle
      const pulse = 0.15 + 0.25 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2));
      const radiusBoost = 4 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2));
      const map = mapRef.current;
      if (map && map.getLayer("outpost-pulse")) {
        try {
          map.setPaintProperty("outpost-pulse", "circle-opacity", pulse);
          map.setPaintProperty("outpost-pulse", "circle-radius", ["interpolate", ["linear"], ["zoom"], 0, 14 + radiusBoost, 4, 22 + radiusBoost, 8, 34 + radiusBoost]);
        } catch { /* layer not ready */ }
      }
      // Pulsing impact glow at aggressive-mission targets
      if (map && map.getLayer("vectors-agg-impact")) {
        try {
          const impactR = 10 + 4 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2));
          map.setPaintProperty("vectors-agg-impact", "circle-radius", ["interpolate", ["linear"], ["zoom"], 0, impactR - 2, 4, impactR, 8, impactR + 2]);
        } catch { /* layer not ready */ }
      }
      // Subtle opacity pulse on aggressive mission lines (live feel)
      if (map && map.getLayer("vectors-agg-line")) {
        try {
          const linePulse = 0.78 + 0.07 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2));
          map.setPaintProperty("vectors-agg-line", "line-opacity", [
            "case",
            ["==", ["get", "status"], "ACTIVE"], linePulse,
            0.3,
          ]);
        } catch { /* layer not ready */ }
      }
      rafPulseRef.current = requestAnimationFrame(pulseLoop);
    };
    rafPulseRef.current = requestAnimationFrame(pulseLoop);

    // NOTE: the activity-ping + progress-head source updates are driven by a
    // single setInterval in a dedicated effect below (see "Live source pump").
    // That pattern survives React Strict Mode double-invocation reliably,
    // whereas nested rAF loops created inside this mount effect do not.

    return () => {
      if (rafRotateRef.current) cancelAnimationFrame(rafRotateRef.current);
      if (rafPulseRef.current) cancelAnimationFrame(rafPulseRef.current);
      el.removeEventListener("pointerdown", onInteract);
      el.removeEventListener("wheel", onInteract);
      el.removeEventListener("touchstart", onInteract);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // ---- Sync outposts source when state/selection changes ----
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource("outposts")) return;
    const src = map.getSource("outposts") as maplibregl.GeoJSONSource;
    src.setData(outpostsToGeoJSON(state.outposts, state.operative.faction, selectedId) as unknown as GeoJSON.GeoJSON);
  }, [state.outposts, state.operative.faction, selectedId]);

  // ---- Sync territory halos ----
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource("halos")) return;
    const src = map.getSource("halos") as maplibregl.GeoJSONSource;
    src.setData(halosToGeoJSON(state.outposts) as unknown as GeoJSON.GeoJSON);
  }, [state.outposts]);

  // ---- Sync territory control polygons (NEW) ----
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource("territories")) return;
    const src = map.getSource("territories") as maplibregl.GeoJSONSource;
    src.setData(territoriesToGeoJSON(state.territories) as unknown as GeoJSON.GeoJSON);
  }, [state.territories]);

  // ---- Sync mission vectors + impact points ----
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource("vectors-agg")) return;
    const mg = missionsToGeoJSON(state.missions, state.outposts);
    (map.getSource("vectors-agg") as maplibregl.GeoJSONSource).setData(mg.aggressive as unknown as GeoJSON.GeoJSON);
    (map.getSource("vectors-pass") as maplibregl.GeoJSONSource).setData(mg.passive as unknown as GeoJSON.GeoJSON);
    if (map.getSource("vectors-agg-impact")) {
      (map.getSource("vectors-agg-impact") as maplibregl.GeoJSONSource).setData(
        missionImpactsToGeoJSON(state.missions, state.outposts) as unknown as GeoJSON.GeoJSON,
      );
    }
  }, [state.missions, state.outposts]);

  // ---- Live source pump (progress heads + activity pings) ----
  // A single setInterval drives both transient layers. setInterval (vs rAF
  // nested inside the mount effect) reliably survives React Strict Mode
  // double-invocation and never goes stale from closed-over state — it reads
  // fresh data from refs every tick. Throttled to ~10fps for scale.
  React.useEffect(() => {
    const id = window.setInterval(() => {
      const map = mapRef.current;
      if (!map) return;
      const center = map.getCenter();
      const now = Date.now();
      try {
        if (map.getSource("activity-pings")) {
          const src = map.getSource("activity-pings") as maplibregl.GeoJSONSource;
          const pingData = pingsToGeoJSON(
            activityPingsRef.current,
            { lng: center.lng, lat: center.lat },
            now,
          );
          src.setData(pingData as unknown as GeoJSON.GeoJSON);
        }
        if (map.getSource("progress-heads")) {
          const src = map.getSource("progress-heads") as maplibregl.GeoJSONSource;
          src.setData(
            progressHeadsToGeoJSON(missionsRef.current, outpostsRef.current) as unknown as GeoJSON.GeoJSON,
          );
        }
      } catch {
        /* source not ready yet */
      }
    }, 100); // 100ms = 10fps — enough for sonar/progress motion, cheap at scale
    return () => window.clearInterval(id);
  }, []);

  const cursor = placementMode ? "cursor-crosshair" : "cursor-grab";

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      {/* Flat black backdrop behind the transparent WebGL canvas. */}
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

      {/* Coordinate readout (bottom-left) */}
      <div className="pointer-events-none absolute bottom-3 left-4 font-mono text-[9px] tracking-[0.14em] text-white/40">
        GLOBE · LIMB LOCK · ROT {bearing}°/{centerLat}°
      </div>

      {/* Network load readout (top-right) */}
      <div className="pointer-events-none absolute right-4 top-3 text-right font-mono text-[9px] tracking-[0.14em] text-white/40">
        NET LOAD · {state.networkLoad}M ACT/S · {formatTotalActions(state.totalActions)} TOTAL
      </div>

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
