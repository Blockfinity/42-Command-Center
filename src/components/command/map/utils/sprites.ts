// ---------------------------------------------------------------------------
// Map sprite utilities — re-export faction icon generation from @/lib/map/style
// and faction shape constants from @/lib/factions.
//
// Layer files use makeFactionIcon() to register WebGL symbol-layer sprites.
// ---------------------------------------------------------------------------

export { makeFactionIcon, makeStreetMarker, type FactionShape } from "@/lib/map/style";
export { FACTION_ICON } from "@/lib/factions";
