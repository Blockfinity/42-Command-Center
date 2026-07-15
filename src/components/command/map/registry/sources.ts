// ---------------------------------------------------------------------------
// Source registry — runtime source management + event bus.
//
// Sources are the data backbone of the map. Each source connects to a backend
// (socket, REST, etc.) and emits NormalizedEvents. The host routes those events
// to layers that subscribe to the matching sourceId.
//
// BOOT_SOURCES is the static list of sources started on map boot.
// To add a source at runtime (hot-plug): call registry.register(spec).
//
// ┌─────────────────────────────────────────────────────────────────────┐
// │  FUTURE: 42 source adapter                                         │
// │  When the 42 backend is ready, create sources/forty-two.source.ts   │
// │  and add it to BOOT_SOURCES. It will emit the same NormalizedEvents │
// │  and existing layers will consume the data with zero code changes.  │
// └─────────────────────────────────────────────────────────────────────┘
// ---------------------------------------------------------------------------

import type { MapSourceSpec, NormalizedEvent } from "../types";
import { gameEngineSource } from "../sources/game-engine.source";

/** Sources started on map boot. Append to add new data backends. */
export const BOOT_SOURCES: MapSourceSpec[] = [
  gameEngineSource,
  // fortyTwoSource,   // ← future: 42 DePIN network adapter
  // aordfSource,      // ← future: AORDF gamification layer adapter
];

// ===== Runtime registry + event bus =====

type EventListener = (event: NormalizedEvent) => void;

class SourceRegistry {
  private sources = new Map<string, MapSourceSpec>();
  private stopFns = new Map<string, () => void>();
  private listeners = new Set<EventListener>();
  private started = false;
  private busEmit: ((event: NormalizedEvent) => void) | null = null;

  /** Subscribe to all source events. Returns an unsubscribe function. */
  subscribe(fn: EventListener): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  /** Register a source (can be called before or after boot). */
  register(spec: MapSourceSpec): void {
    this.sources.set(spec.id, spec);
    // If the host is already running, start this source immediately.
    if (this.started && this.busEmit) {
      this.startSource(spec, this.busEmit);
    }
  }

  /** Start all registered sources. Called by the layer-host on map load. */
  startAll(): void {
    if (this.started) return;
    this.started = true;
    // The bus emits to all subscribers (the layer-host subscribes to route
    // events to layers).
    this.busEmit = (event: NormalizedEvent) => {
      for (const fn of this.listeners) fn(event);
    };
    for (const spec of this.sources.values()) {
      this.startSource(spec, this.busEmit);
    }
  }

  private startSource(
    spec: MapSourceSpec,
    emit: (event: NormalizedEvent) => void,
  ): void {
    const stop = spec.start(emit);
    this.stopFns.set(spec.id, stop);
  }

  /** Stop all sources. Called by the layer-host on unmount. */
  stopAll(): void {
    for (const stop of this.stopFns.values()) {
      try { stop(); } catch { /* noop */ }
    }
    this.stopFns.clear();
    this.started = false;
    this.busEmit = null;
  }
}

/** Singleton registry instance. */
export const sourceRegistry = new SourceRegistry();

// Pre-register boot sources so they're ready when the host starts.
for (const spec of BOOT_SOURCES) {
  sourceRegistry.register(spec);
}
