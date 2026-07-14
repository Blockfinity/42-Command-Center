// ---------------------------------------------------------------------------
// Map geo utilities — re-export the battle-tested spherical geometry functions
// from @/lib/map/geo so layer files can import from a single local path.
//
// These are pure functions: great-circle arcs, geographic circles, angular
// distance culling, and action-count formatting.
// ---------------------------------------------------------------------------

export {
  greatCircle,
  greatCirclePoint,
  geoCircle,
  approxAngularDist,
  formatTotalActions,
} from "@/lib/map/geo";
