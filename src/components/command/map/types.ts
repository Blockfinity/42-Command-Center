// ---------------------------------------------------------------------------
// Map platform types — the contract between sources, layers, and the host.
//
// This is the foundation of the pluggable map architecture:
// - Sources connect to data backends and emit NormalizedEvents
// - Layers consume those events and render MapLibre visualizations
// - The host orchestrates: mounts layers, routes events, runs the rAF loop
//
// To add a new data source (e.g. 42 network, AORDF, future AR app):
//   1. Create a source adapter in sources/<name>.source.ts
//   2. Register it in BOOT_SOURCES (or call registry.register() at runtime)
//   3. Any layer that subscribes to that source's ID automatically receives data
//
// To add a new visualization:
//   1. Create a layer spec in layers/<name>.layer.ts
//   2. Append it to the LAYERS array in registry/layers.ts
//   The layer self-contains its mount, animation, and event handling.
// ---------------------------------------------------------------------------

import type maplibregl from "maplibre-gl";
import type { GeoJSON } from "geojson";

// ===== Normalized event vocabulary =====
// All sources emit these primitives. The host routes them to layers that
// subscribe to the matching sourceId.

export type NormalizedEvent =
  | { type: "source:set"; sourceId: string; data: GeoJSON.FeatureCollection }
  | { type: "source:clear"; sourceId: string };

// ===== Source spec =====
// A source adapter connects to a data backend (socket, REST, etc.) and emits
// NormalizedEvents. The host calls start() on boot (or on register()) and
// calls the returned stop() on unmount.

export interface MapSourceSpec {
  /** Unique identifier. Layers reference this in their `sourceIds` array. */
  id: string;
  /**
   * Start emitting events. Returns a cleanup function called on unmount.
   * `emit` is thread-safe — call it whenever new data arrives.
   */
  start: (emit: (event: NormalizedEvent) => void) => () => void;
}

// ===== Layer spec =====
// A layer declares its MapLibre sources + render layers, handles incoming
// data, optional animation, and optional click interaction.

export interface MapLayerSpec {
  /** Unique identifier for debugging / registration. */
  id: string;
  /** Source IDs this layer subscribes to. The host routes their events to onData(). */
  sourceIds: string[];
  /**
   * Add GeoJSON sources to the map. Called once on map load, before addLayers().
   * Use this to create empty sources that will be populated by events.
   */
  addSources?: (map: maplibregl.Map) => void;
  /**
   * Add render layers to the map. Called once on map load, after addSources().
   * Layers are added in the order they appear in the LAYERS array (bottom → top).
   */
  addLayers?: (map: maplibregl.Map) => void;
  /**
   * Handle new data for a subscribed source. Called when a source emits source:set.
   * Typically calls map.getSource(sourceId).setData(data).
   */
  onData?: (map: maplibregl.Map, sourceId: string, data: GeoJSON.FeatureCollection) => void;
  /**
   * Animation tick. Called every rAF frame if present.
   * Use for pulsing, opacity cycling, etc. Keep it cheap.
   */
  animate?: (map: maplibregl.Map, now: number) => void;
  /**
   * Map click handler. Called for every map click (in LAYERS array order).
   * Use `map.queryRenderedFeatures()` to check if this layer was hit, and
   * call `e.preventDefault()` to stop subsequent layers from processing.
   * The interaction context is passed so layers can call onSelect/onMapClick.
   */
  onClick?: (
    map: maplibregl.Map,
    e: maplibregl.MapMouseEvent & { features?: unknown[] },
    ctx: { interaction: MapInteraction | null },
  ) => void;
  /** Hover cursor management. Called on mouseenter/mouseleave for this layer's features. */
  onHover?: (
    map: maplibregl.Map,
    entering: boolean,
    ctx: { interaction: MapInteraction | null },
  ) => void;
  /** Cleanup. Called on unmount. */
  destroy?: (map: maplibregl.Map) => void;
}

// ===== Interaction context =====
// Passed from the host to layers that need user interaction (outpost selection,
// placement mode). This decouples layers from the global store.

export interface MapInteraction {
  selectedId: string | null;
  placementMode: boolean;
  onSelect: (id: string | null) => void;
  onMapClick: (lat: number, lng: number) => void;
}
