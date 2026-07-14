"use client";

import * as React from "react";
import { useCommand } from "@/stores/command";
import { useStandingsData } from "./standings-area.data";
import { HoverDetail, DetailHeader, DetailBody, DetailNote } from "./hover-detail";
import { FACTION_META, type FactionId } from "@/lib/types";
import { FACTION_MARK_GLYPH } from "@/lib/format";

/**
 * StandingsArea — compact faction strength standings (pure presentation).
 *
 * On hover, reveals a compact detail popover with the full breakdown for all
 * three factions (compute, territories, garrisons, threat).
 *
 * Data source: see `standings-area.data.ts` (`useStandingsData`). Swap that
 * file to plug this area into a different data source — this component is
 * unchanged.
 */
export function StandingsArea() {
  const data = useStandingsData();
  const state = useCommand((s) => s.state);
  if (!data || !state) return null;

  const detail = (
    <>
      <DetailHeader title="FACTION STANDINGS" />
      <DetailBody>
        {data.standings.map((s) => {
          const fac = state.factions[s.id as FactionId];
          const meta = FACTION_META[s.id as FactionId];
          return (
            <div key={s.id} className="border-b border-white/8 px-3 py-1.5 last:border-b-0">
              <div className="flex items-center justify-between font-mono text-[10px] tracking-wide-2">
                <span className="flex items-center gap-1.5 text-white/80">
                  <span className="text-white/55">{FACTION_MARK_GLYPH[s.id as FactionId]}</span>
                  {meta.name}
                  {s.isMine && <span className="text-white/35">· YOU</span>}
                </span>
                <span className="tabular-nums font-bold text-white">{s.strength.toString().padStart(3, "0")}</span>
              </div>
              <div className="mt-0.5 flex items-center justify-between font-mono text-[9px] tracking-wide-2 text-white/40">
                <span>{fac.compute} TF · {fac.territories} TERR</span>
                <span>THREAT {fac.threat}</span>
              </div>
            </div>
          );
        })}
      </DetailBody>
      <DetailNote>
        Strength is an aggregate of compute, territory, and node integrity.
      </DetailNote>
    </>
  );

  return (
    <HoverDetail detail={detail} align="center">
      <div className="pointer-events-auto flex h-full flex-1 items-stretch">
        {data.standings.map((s) => (
          <div
            key={s.id}
            className="flex h-full items-center gap-2.5 border-r border-white/15 px-4"
          >
            <span className="text-[11px] tracking-mega text-white/55">{s.name}</span>
            <span className="text-[15px] font-bold tabular-nums text-white">{s.strength.toString().padStart(3, "0")}</span>
          </div>
        ))}
      </div>
    </HoverDetail>
  );
}
