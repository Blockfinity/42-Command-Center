// ---------------------------------------------------------------------------
// Layer registry — the ordered array of all map layers.
//
// Layers are mounted in array order (bottom → top z-order). To add a new
// visualization:
//   1. Create a layer spec in layers/<name>.layer.ts
//   2. Import + append it to this array
//   The layer-host automatically mounts its sources, layers, animation, and
//   click handlers. No other code changes needed.
// ---------------------------------------------------------------------------

import type { MapLayerSpec } from "../types";
import { roadsLayer } from "../layers/roads.layer";
import { buildingsLayer } from "../layers/buildings.layer";
import { territoryLayer } from "../layers/territory.layer";
import { outpostsLayer } from "../layers/outposts.layer";
import { missionsLayer } from "../layers/missions.layer";
import { activityPingsLayer } from "../layers/activity-pings.layer";

/** Ordered layer list (bottom → top). Append to add new visualizations. */
export const LAYERS: MapLayerSpec[] = [
  // --- Base vector layers (roads/buildings) — provider-dependent ---
  roadsLayer,
  buildingsLayer,
  // --- Gameplay layers ---
  territoryLayer,
  activityPingsLayer,
  missionsLayer,
  outpostsLayer,
];
