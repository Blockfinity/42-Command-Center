"use client";

import * as React from "react";
import { useCommand } from "@/stores/command";
import { useProfileData } from "./profile-area.data";
import { HoverDetail, DetailHeader, DetailRow, DetailBody, DetailNote } from "./hover-detail";
import { FACTION_META, FACTION_TOKEN, type Operative } from "@/lib/types";
import { FACTION_MARK_GLYPH } from "@/lib/format";

/**
 * ProfileArea — operative profile (handle + rank insignia badge).
 * Pure presentation.
 *
 * On hover, reveals a compact detail popover with the operative's dossier
 * (full codename, rank, tier, faction, authority).
 *
 * The rank prefix (e.g. "CMDR.") is stripped from the codename so only the
 * operative's handle is shown. The rank is represented in the badge box by
 * its single-letter insignia ("O") rendered in the military stencil font.
 *
 * Data source: see `profile-area.data.ts` (`useProfileData`). Swap that file
 * to plug this area into a different data source — this component is
 * unchanged.
 */

/** rank insignia letter per operative tier */
const TIER_INSIGNIA: Record<string, string> = {
  BASIC: "△",
  ELITE: "O",
  ARCHON: "✦",
};

export function ProfileArea() {
  const data = useProfileData();
  const state = useCommand((s) => s.state);
  if (!data || !state) return null;

  const handle = data.codename.replace(/^[A-Z]+\.\s*/, "");
  const meta = FACTION_META[data.faction];
  const op = state.operative;

  // Authority progression toward the next clearance tier (gamified XP).
  const TIER_ORDER: Operative["tier"][] = ["BASIC", "ELITE", "ARCHON"];
  const nextTier = TIER_ORDER[Math.min(TIER_ORDER.indexOf(data.tier) + 1, 2)];
  const atMax = data.tier === "ARCHON";

  const detail = (
    <>
      <DetailHeader title="OPERATIVE DOSSIER" />
      <DetailBody>
        <DetailRow label="CODENAME" value={data.codename} />
        <DetailRow label="HANDLE" value={handle} />
        <DetailRow label="RANK" value={TIER_INSIGNIA[data.tier] ?? "O"} valueClass="text-white" />
        <DetailRow label="TIER" value={data.tier} />
        <DetailRow label="FACTION" value={`${FACTION_MARK_GLYPH[data.faction]} ${meta.name}`} />
        <DetailRow label="AUTHORITY" value={`${op.authority.toString().padStart(3, "0")} / 100`} />
        <DetailRow label="VOTC" value={Math.floor(op.wallet.VOTC).toLocaleString()} />
        <DetailRow label={`${FACTION_TOKEN[data.faction]} TOKEN`} value={Math.floor(op.wallet[data.faction]).toLocaleString()} />
      </DetailBody>
      <DetailNote>
        <span className="text-white/70">“{meta.motto}”</span>
        <br />
        <span className="text-white/35">
          {atMax ? "MAX CLEARANCE REACHED" : `NEXT CLEARANCE: ${nextTier}`} · {FACTION_TOKEN[data.faction]} TOKEN
        </span>
      </DetailNote>
    </>
  );

  return (
    <HoverDetail detail={detail} align="right">
      <div className="pointer-events-auto flex h-full items-center gap-3 px-4">
        {/* wallet chips — the operative's war chest, always visible */}
        <div className="hidden flex-col items-end gap-1 leading-none lg:flex">
          <span className="chip" title="VOTC — network currency">
            <span className="text-white/40">VOTC</span>
            <span className="num-hero text-[10px] font-bold">{Math.floor(op.wallet.VOTC)}</span>
          </span>
          <span className="chip" title={`${FACTION_TOKEN[data.faction]} — faction token`}>
            <span className="text-white/40">{FACTION_TOKEN[data.faction]}</span>
            <span className="num-hero text-[10px] font-bold">{Math.floor(op.wallet[data.faction])}</span>
          </span>
        </div>

        <div className="hidden flex-col gap-1 text-right leading-none sm:flex">
          <div className="text-[14px] font-bold tracking-wide-2 text-white">{handle}</div>
          {/* authority progression bar toward next tier */}
          <div className="flex items-center justify-end gap-1.5">
            <span className="text-[8px] tracking-mega text-white/40">
              {atMax ? "MAX" : `→ ${nextTier}`}
            </span>
            <div className="xp-track w-20">
              <div className="xp-fill" style={{ width: `${Math.min(100, op.authority)}%` }} />
            </div>
            <span className="text-[8px] tabular-nums text-white/55">{op.authority}</span>
          </div>
          <div className="text-[9px] tracking-wide-2 text-white/45">{data.tier} CLEARANCE</div>
        </div>

        <div
          className="hud-corners flex h-10 w-10 items-center justify-center border border-white/45 bg-white/5 text-[18px] font-bold tracking-tight text-white text-glow"
          style={{ fontFamily: "var(--font-stencil), monospace" }}
          title={`Rank: ${data.tier}`}
        >
          {TIER_INSIGNIA[data.tier] ?? "O"}
        </div>
      </div>
    </HoverDetail>
  );
}
