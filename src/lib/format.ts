import type { FactionId, Garrison, ThreatLevel } from "@/lib/types";

// Faction constants (FACTION_MARK_GLYPH, FACTION_OUTPOST_NUMBER, outpostNumber,
// outpostNumberStr) now live in @/lib/factions — re-exported here for backward
// compatibility with existing imports from @/lib/format.
export {
  FACTION_MARK_GLYPH,
  FACTION_OUTPOST_NUMBER,
  outpostNumber,
  outpostNumberStr,
} from "@/lib/factions";

export function fmtUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export function fmtClock(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export const THREAT_META: Record<ThreatLevel, { label: string; pip: string; pulse?: boolean }> = {
  GREEN: { label: "GREEN", pip: "pip" },
  AMBER: { label: "AMBER", pip: "pip" },
  RED: { label: "RED", pip: "pip--crit" },
  BLACK: { label: "BLACK", pip: "pip--crit" },
};

// FACTION_MARK_GLYPH + garrison helpers re-exported from @/lib/factions (see top).

export function garrisonGlyph(o: Garrison): string {
  return FACTION_MARK_GLYPH[o.faction];
}

export function pct(n: number, d = 100): string {
  return `${Math.round((n / d) * 100)}%`;
}
