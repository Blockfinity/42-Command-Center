/**
 * Coastlines Layer
 * ================
 * Country coastlines and borders (white vector lines on top of satellite).
 * Already in the base style spec — this module is a registry placeholder
 * for future enhancements (e.g. contested-border highlighting).
 */

import type { MapLayerSpec } from "../types";

export const coastlinesLayer: MapLayerSpec = {
  id: "coastlines",
  minZoom: 0,
  sources: [],
  mount: () => {
    // Coastlines are in the base style spec (countries-fill + countries-line).
  },
};
