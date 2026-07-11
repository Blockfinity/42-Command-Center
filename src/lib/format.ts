import type { FactionId, Outpost, ThreatLevel } from "@/lib/types";

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

export const FACTION_MARK_GLYPH: Record<FactionId, string> = {
  FANG: "⬡",
  HAMMER: "◆",
  RESOLUTE: "■",
};

export function outpostGlyph(o: Outpost): string {
  return FACTION_MARK_GLYPH[o.faction];
}

/**
 * Per-faction command-node outpost designation number.
 * FANG → 33, HAMMER → 21, RESOLUTE → 07.
 * These are the canonical "home outpost" numbers shown in the brand badge
 * and the outpost detail card header.
 */
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

export function pct(n: number, d = 100): string {
  return `${Math.round((n / d) * 100)}%`;
}
