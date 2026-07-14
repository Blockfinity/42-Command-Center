// ---------------------------------------------------------------------------
// Game-engine source adapter — bridges the zustand game-state store into the
// map's NormalizedEvent vocabulary.
//
// This is the working template for source adapters. When the 42 backend is
// ready, create a sibling file (forty-two.source.ts) that follows the same
// shape: start(emit) → subscribe to a data source → translate domain state
// into GeoJSON FeatureCollections → emit source:set events.
//
// Data flow:
//   The command-deck's init() connects the :3003 socket and stores GameState
//   in the zustand store. This adapter subscribes to the store and converts
//   each state update into 4 GeoJSON FeatureCollections (one per layer-group).
//   No second socket connection — single source of truth.
//
// The adapter emits to 4 source IDs:
//   - "game:outposts"     — outpost points (clustered)
//   - "game:territories"  — territory control polygons + per-outpost halos
//   - "game:missions"     — mission arcs + impact points + progress heads
//   - "game:pings"        — activity pings (transient sonar layer)
// ---------------------------------------------------------------------------

import type { GeoJSON } from "geojson";
import type { MapSourceSpec, NormalizedEvent } from "../types";
import type { GameState } from "@/lib/types";
import {
  outpostsToGeoJSON,
  halosToGeoJSON,
  missionsToGeoJSON,
  progressHeadsToGeoJSON,
  territoriesToGeoJSON,
  pingsToGeoJSON,
  missionImpactsToGeoJSON,
} from "@/lib/map/converters";

// Zustand store — imported lazily to avoid circular deps during SSR.
// The store is created in @/stores/command and holds the single socket connection.
import { useCommand } from "@/stores/command";

/** The 4 source IDs this adapter emits. Layers reference these in sourceIds. */
export const GAME_SOURCE_IDS = {
  outposts: "game:outposts",
  territories: "game:territories",
  missions: "game:missions",
  pings: "game:pings",
} as const;

/**
 * Convert a full GameState into 4 GeoJSON FeatureCollections for the 4 source IDs.
 * This is the translation layer between domain state and the map's normalized vocabulary.
 *
 * Each feature is tagged with a "kind" property so layers can filter by geometry role
 * (e.g. "arc" vs "impact" vs "progress" in the missions source).
 */
function gameStateToSources(
  state: GameState,
  selectedId: string | null,
  now: number,
): Record<string, GeoJSON.FeatureCollection> {
  // ---- Outposts ----
  const outpostsFC = outpostsToGeoJSON(state.outposts, state.operative.faction, selectedId);

  // ---- Territories (control polygons + per-outpost halos, merged) ----
  const territoriesFC = territoriesToGeoJSON(state.territories);
  // Tag territory features with kind="territory"
  for (const f of territoriesFC.features) {
    (f.properties as Record<string, unknown>) = { ...(f.properties ?? {}), kind: "territory" };
  }
  const halosFC = halosToGeoJSON(state.outposts);
  // Tag halo features with kind="halo"
  for (const f of halosFC.features) {
    (f.properties as Record<string, unknown>) = { ...(f.properties ?? {}), kind: "halo" };
  }
  const mergedTerritories: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: [...territoriesFC.features, ...halosFC.features],
  };

  // ---- Missions (arcs + impacts + progress heads, merged) ----
  const mg = missionsToGeoJSON(state.missions, state.outposts);
  // Tag arc features with kind="arc" + aggressive flag
  for (const f of mg.aggressive.features) {
    (f.properties as Record<string, unknown>) = { ...(f.properties ?? {}), kind: "arc", aggressive: 1 };
  }
  for (const f of mg.passive.features) {
    (f.properties as Record<string, unknown>) = { ...(f.properties ?? {}), kind: "arc", aggressive: 0 };
  }
  const impactsFC = missionImpactsToGeoJSON(state.missions, state.outposts);
  for (const f of impactsFC.features) {
    (f.properties as Record<string, unknown>) = { ...(f.properties ?? {}), kind: "impact" };
  }
  const progressFC = progressHeadsToGeoJSON(state.missions, state.outposts);
  for (const f of progressFC.features) {
    (f.properties as Record<string, unknown>) = { ...(f.properties ?? {}), kind: "progress" };
  }
  const mergedMissions: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: [
      ...mg.aggressive.features,
      ...mg.passive.features,
      ...impactsFC.features,
      ...progressFC.features,
    ],
  };

  // ---- Pings (culled by viewport distance + age) ----
  // Use [0,0] as center — conservative (keeps all pings visible). The layer
  // ages them via the `age` property baked in at convert time.
  const pingsFC = pingsToGeoJSON(state.activityPings ?? [], { lng: 0, lat: 0 }, now);

  return {
    [GAME_SOURCE_IDS.outposts]: outpostsFC,
    [GAME_SOURCE_IDS.territories]: mergedTerritories,
    [GAME_SOURCE_IDS.missions]: mergedMissions,
    [GAME_SOURCE_IDS.pings]: pingsFC,
  };
}

export const gameEngineSource: MapSourceSpec = {
  id: "game-engine",
  start(emit: (event: NormalizedEvent) => void) {
    let destroyed = false;
    let currentSelected: string | null = null;

    function emitState(state: GameState) {
      if (destroyed) return;
      const sources = gameStateToSources(state, currentSelected, Date.now());
      for (const [sourceId, data] of Object.entries(sources)) {
        emit({ type: "source:set", sourceId, data });
      }
    }

    // ---- Subscribe to the zustand store ----
    // The store holds the single socket connection (created by command-deck's init()).
    // We watch state + selectedOutpostId changes and re-emit.
    const unsubState = useCommand.subscribe((s, prev) => {
      if (s.state !== prev.state && s.state) {
        currentSelected = s.selectedOutpostId;
        emitState(s.state);
      } else if (s.selectedOutpostId !== prev.selectedOutpostId && s.state) {
        currentSelected = s.selectedOutpostId;
        emitState(s.state);
      }
    });

    // Emit initial state if already available (e.g. hot-reload).
    const initial = useCommand.getState().state;
    if (initial) {
      currentSelected = useCommand.getState().selectedOutpostId;
      emitState(initial);
    }

    return () => {
      destroyed = true;
      unsubState();
    };
  },
};
