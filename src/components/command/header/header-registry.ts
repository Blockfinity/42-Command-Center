import type { ComponentType } from "react";
import { BrandArea } from "./brand-area";
import { StatsArea } from "./stats-area";
import { ThreatArea } from "./threat-area";
import { StandingsArea } from "./standings-area";
import { ProfileArea } from "./profile-area";

/**
 * HeaderArea — contract every header area component satisfies.
 * Areas are stateless from the orchestrator's perspective: they each pull
 * their own data via their co-located `.data.ts` hook.
 */
export type HeaderArea = ComponentType;

/**
 * HEADER_AREAS — ordered registry of header area components.
 *
 * The CommandBar orchestrator renders these left → right in array order.
 *
 * Note: ClockArea (LINK indicator) has been removed — the live uplink
 * status now lives on the bottom-left of the NavRail as the "LIVE" pip,
 * driven by the same `connected` store flag.
 *
 * ── To add a new header area ────────────────────────────────────────────
 *   1. Create `<name>-area.tsx`  (presentation)  + `<name>-area.data.ts`
 *      (data-source hook) in this folder.
 *   2. Import the component here and append `{ id: "<name>", Area: <Comp> }`
 *      to this array.
 * The orchestrator needs no other change.
 * ── To remove / reorder ─────────────────────────────────────────────────
 *   Edit this array only. Each area is fully self-contained.
 * ────────────────────────────────────────────────────────────────────────
 */
export const HEADER_AREAS: { id: string; Area: HeaderArea }[] = [
  { id: "brand", Area: BrandArea },
  { id: "stats", Area: StatsArea },
  { id: "threat", Area: ThreatArea },
  { id: "standings", Area: StandingsArea },
  { id: "profile", Area: ProfileArea },
];
