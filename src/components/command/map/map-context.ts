// ---------------------------------------------------------------------------
// Map context — React context for the MapLibre instance + interaction state.
//
// Layers consume this via useMapContext() to access the map for setData(),
// queryRenderedFeatures(), paint properties, etc. The interaction object
// provides onSelect / onMapClick / placementMode without coupling layers to
// the global zustand store.
// ---------------------------------------------------------------------------

"use client";

import * as React from "react";
import type maplibregl from "maplibre-gl";
import type { MapInteraction } from "./types";

interface MapContextValue {
  map: maplibregl.Map | null;
  interaction: MapInteraction | null;
}

const MapContext = React.createContext<MapContextValue>({
  map: null,
  interaction: null,
});

export function MapProvider({
  children,
  map,
  interaction,
}: {
  children: React.ReactNode;
  map: maplibregl.Map | null;
  interaction: MapInteraction | null;
}) {
  const value = React.useMemo(() => ({ map, interaction }), [map, interaction]);
  return React.createElement(MapContext.Provider, { value }, children);
}

export function useMapContext(): MapContextValue {
  return React.useContext(MapContext);
}
