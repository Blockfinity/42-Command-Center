// ---------------------------------------------------------------------------
// Faction configuration — the single source of truth for all faction constants.
//
// Consolidates: FACTION_META (name/motto), FACTION_TOKEN (currency symbol),
// FACTION_MARK_GLYPH (unicode glyph), FACTION_ICON (map shape),
// FACTION_LOGO (image path), FACTION_OUTPOST_NUMBER (designation number).
//
// Previously these were scattered across types.ts, format.ts, converters.ts,
// outpost-detail-card.tsx, and brand-area.data.ts. Now they all live here.
// The old locations re-export from this file for backward compatibility.
// ---------------------------------------------------------------------------

import type { FactionId } from "@/lib/types";
import type { FactionShape } from "@/lib/map/style";

/** Faction display metadata: name + motto. */
export const FACTION_META: Record<FactionId, { name: string; motto: string }> = {
  FANG: { name: "FANG", motto: "Hunt as one." },
  HAMMER: { name: "HAMMER", motto: "Forge. Strike. Endure." },
  RESOLUTE: { name: "RESOLUTE", motto: "Steadfast, vigilant." },
};

/** Faction token symbol (each faction mints its own token; VOTC is network currency). */
export const FACTION_TOKEN: Record<FactionId, string> = {
  FANG: "FANG",
  HAMMER: "HAMMER",
  RESOLUTE: "RESOLUTE",
};

/** Unicode glyph for each faction (used in HUD text, panels, detail card). */
export const FACTION_MARK_GLYPH: Record<FactionId, string> = {
  FANG: "⬡",
  HAMMER: "◆",
  RESOLUTE: "■",
};

/** Map sprite shape for each faction (rendered as WebGL symbol icons). */
export const FACTION_ICON: Record<FactionId, FactionShape> = {
  FANG: "hex",
  HAMMER: "diamond",
  RESOLUTE: "square",
};

/** Logo image path for each faction (in /public/). */
export const FACTION_LOGO: Record<FactionId, string> = {
  FANG: "/fang-logo.jpg",
  HAMMER: "/hammer-logo.jpg",
  RESOLUTE: "/resolute-logo.jpg",
};

/** Per-faction command-node outpost designation number (FANG→33, HAMMER→21, RESOLUTE→07). */
export const FACTION_OUTPOST_NUMBER: Record<FactionId, number> = {
  FANG: 33,
  HAMMER: 21,
  RESOLUTE: 7,
};

/** Raw outpost designation number for a faction (e.g. 33, 21, 7). */
export function outpostNumber(faction: FactionId): number {
  return FACTION_OUTPOST_NUMBER[faction];
}

/** Zero-padded 2-digit outpost designation string (e.g. "33", "21", "07"). */
export function outpostNumberStr(faction: FactionId): string {
  return FACTION_OUTPOST_NUMBER[faction].toString().padStart(2, "0");
}
