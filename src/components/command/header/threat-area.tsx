"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useCommand } from "@/stores/command";
import { useThreatData } from "./threat-area.data";
import { HoverDetail, DetailHeader, DetailRow, DetailBody, DetailNote } from "./hover-detail";
import type { ThreatLevel } from "@/lib/types";

/**
 * ThreatArea — threat level indicator (pure presentation).
 *
 * On hover, reveals a compact detail popover explaining the current threat
 * level and its operational implications.
 *
 * Data source: see `threat-area.data.ts` (`useThreatData`). Swap that file to
 * plug this area into a different data source — this component is unchanged.
 */
const THREAT_DETAIL: Record<ThreatLevel, { status: string; guidance: string }> = {
  GREEN: {
    status: "NOMINAL",
    guidance: "All sectors quiet. Routine operations permitted. Maintain standard recon cadence.",
  },
  AMBER: {
    status: "ELEVATED",
    guidance: "Hostile activity detected. Reinforce perimeter nodes. Hold defensive posture.",
  },
  RED: {
    status: "HOSTILE",
    guidance: "Active engagement likely. Raise shields on critical nodes. Authorize preemptive strikes.",
  },
  BLACK: {
    status: "CRITICAL",
    guidance: "Multi-vector assault in progress. All hands to battle stations. Defend command node.",
  },
};

export function ThreatArea() {
  const data = useThreatData();
  const state = useCommand((s) => s.state);

  if (!data || !state) return null;

  const detail = THREAT_DETAIL[data.level];

  const underAttack = state.outposts.filter((o) => o.status === "UNDER_ATTACK").length;
  const activeHostile = state.missions.filter(
    (m) => m.status === "ACTIVE" && m.faction !== state.operative.faction,
  ).length;

  return (
    <HoverDetail detail={
      <>
        <DetailHeader title="THREAT ASSESSMENT" />
        <DetailBody>
          <DetailRow label="LEVEL" value={data.label} valueClass="text-white" />
          <DetailRow label="STATUS" value={detail.status} />
          <DetailRow label="HOSTILE OPS" value={activeHostile.toString().padStart(2, "0")} valueClass={activeHostile > 0 ? "text-white" : undefined} />
          <DetailRow label="UNDER FIRE" value={underAttack.toString().padStart(2, "0")} valueClass={underAttack > 0 ? "text-white blink" : undefined} />
        </DetailBody>
        <DetailNote>{detail.guidance}</DetailNote>
      </>
    } align="left">
      <div className="pointer-events-auto flex h-full items-center gap-2.5 border-r border-white/15 px-4">
        <span className={cn(data.pip, data.critical ? "pip--crit" : "pip")} />
        <div className="flex flex-col gap-0.5 leading-none">
          <div className="text-[10px] tracking-wide-2 text-white/45">THREAT LEVEL</div>
          <div className="text-[15px] font-bold tracking-wide-2 text-white text-glow">
            {data.label}
          </div>
        </div>
      </div>
    </HoverDetail>
  );
}
