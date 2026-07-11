"use client";

import * as React from "react";
import { useCommand } from "@/stores/command";
import { useProfileData } from "./profile-area.data";
import { HoverDetail, DetailHeader, DetailRow, DetailBody, DetailNote } from "./hover-detail";
import { FACTION_META, FACTION_TOKEN } from "@/lib/types";
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

  const detail = (
    <>
      <DetailHeader title="OPERATIVE DOSSIER" />
      <DetailBody>
        <DetailRow label="CODENAME" value={data.codename} />
        <DetailRow label="HANDLE" value={handle} />
        <DetailRow label="RANK" value={TIER_INSIGNIA[data.tier] ?? "O"} valueClass="text-white" />
        <DetailRow label="TIER" value={data.tier} />
        <DetailRow label="FACTION" value={`${FACTION_MARK_GLYPH[data.faction]} ${meta.name}`} />
        <DetailRow label="AUTHORITY" value={op.authority.toString().padStart(3, "0")} />
      </DetailBody>
      <DetailNote>
        <span className="text-white/70">“{meta.motto}”</span>
        <br />
        <span className="text-white/35">{FACTION_TOKEN[data.faction]} TOKEN · CLEARANCE {data.tier}</span>
      </DetailNote>
    </>
  );

  return (
    <HoverDetail detail={detail} align="right">
      <div className="pointer-events-auto flex h-full items-center gap-2.5 px-4">
        <div className="hidden flex-col gap-0.5 text-right leading-none sm:flex">
          <div className="text-[15px] font-bold tracking-wide-2 text-white">{handle}</div>
          <div className="text-[10px] tracking-wide-2 text-white/45">{data.tier}</div>
        </div>
        <div
          className="flex h-10 w-10 items-center justify-center border border-white/40 text-[18px] font-bold tracking-tight text-white text-glow"
          style={{ fontFamily: "var(--font-stencil), monospace" }}
          title={`Rank: ${data.tier}`}
        >
          O
        </div>
      </div>
    </HoverDetail>
  );
}
