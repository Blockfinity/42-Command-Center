/**
 * Satellite Base Layer
 * ====================
 * The satellite raster base is already in the style spec (from tile-provider),
 * so this layer module is a no-op for mount — it exists for registry completeness
 * and to handle provider-specific zoom adjustments in the future.
 *
 * The actual raster layer is added by buildBaseStyle() in tile-provider.ts.
 * This module ensures the layer registry has a "base" entry and can be
 * extended later (e.g. for cloud overlay, time-of-day imagery swap, etc.).
 */

import type { MapLayerSpec } from "../types";

export const satelliteBaseLayer: MapLayerSpec = {
  id: "satellite-base",
  minZoom: 0,
  sources: [], // no external source — base map is in the style spec
  mount: () => {
    // The satellite layer is already in the style spec.
    // No additional sources or layers to add here.
  },
};
