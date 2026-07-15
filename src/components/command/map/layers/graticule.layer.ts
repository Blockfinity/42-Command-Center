/**
 * Graticule Layer
 * ===============
 * Lat/lng grid lines on the globe. Already in the base style spec.
 * Registry placeholder for future zoom-responsive graticule density.
 */

import type { MapLayerSpec } from "../types";

export const graticuleLayer: MapLayerSpec = {
  id: "graticule",
  minZoom: 0,
  sources: [],
  mount: () => {
    // Graticule is in the base style spec.
  },
};
