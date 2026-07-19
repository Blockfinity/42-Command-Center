"use client";

import * as React from "react";
import { useCommand } from "@/stores/command";
import { useStatsData } from "./stats-area.data";
import { HoverDetail, DetailHeader, DetailRow, DetailBody, DetailNote } from "./hover-detail";

/**
 * StatsArea — live status cluster (pure presentation).
 *
 * On hover, reveals a compact detail popover with the full node/compute
 * breakdown for the operative's faction.
 *
 * Data source: see `stats-area.data.ts` (`useStatsData`). Swap that file to
 * plug this area into a different data source — this component is unchanged.
 */
export function StatsArea() {
  const data = useStatsData();
  const state = useCommand((s) => s.state);

  if (!data || !state) return null;

  const op = state.operative;
  const myGarrisons = state.garrisons.filter((o) => o.faction === op.faction);
  const full = myGarrisons.filter((o) => o.type === "Safehouse").length;
  const tactical = myGarrisons.filter((o) => o.type === "Tactical Safehouse").length;
  const offline = myGarrisons.filter((o) => o.status === "OFFLINE").length;
  const underAttack = myGarrisons.filter((o) => o.status === "UNDER_ATTACK").length;
  const degraded = myGarrisons.filter((o) => o.status === "DEGRADED").length;

  const detail = (
    <>
      <DetailHeader title="NETWORK STATUS" />
      <DetailBody>
        <DetailRow label="ACTIVE NODES" value={`${data.activeNodes.toString().padStart(2, "0")} / ${data.totalNodes}`} />
        <DetailRow label="SAFEHOUSES" value={full.toString().padStart(2, "0")} />
        <DetailRow label="TACTICAL" value={tactical.toString().padStart(2, "0")} />
        <DetailRow label="DEGRADED" value={degraded.toString().padStart(2, "0")} valueClass={degraded > 0 ? "text-white" : undefined} />
        <DetailRow label="UNDER FIRE" value={underAttack.toString().padStart(2, "0")} valueClass={underAttack > 0 ? "text-white blink" : undefined} />
        <DetailRow label="OFFLINE" value={offline.toString().padStart(2, "0")} valueClass={offline > 0 ? "text-white/50" : undefined} />
      </DetailBody>
      <DetailNote>
        COMPUTE {data.compute} TF VERIFIED · SOL {data.sol.toString().padStart(4, "0")} CYCLE
      </DetailNote>
    </>
  );

  return (
    <HoverDetail detail={detail} align="left">
      <div className="pointer-events-auto hidden h-full items-stretch md:flex">
        <Stat label="ACTIVE NODES" value={data.activeNodes.toString().padStart(2, "0")} sub={`${data.totalNodes} TOTAL`} />
        <Stat label="ELITE" value={data.eliteCount.toString().padStart(2, "0")} sub="SAFEHOUSES" />
        <Stat label="COMPUTE" value={`${data.compute}`} unit="TF" sub="VERIFIED" />
        <Stat label="SOL" value={data.sol.toString().padStart(4, "0")} sub="CYCLE" />
      </div>
    </HoverDetail>
  );
}

function Stat({ label, value, unit, sub }: { label: string; value: string; unit?: string; sub: string }) {
  return (
    <div className="flex h-full flex-col justify-center gap-0.5 border-r border-white/15 px-4 leading-none">
      <div className="text-[9px] tracking-mega text-white/40">{label}</div>
      <div className="flex items-baseline gap-1">
        <span className="num-hero text-[16px] font-bold">{value}</span>
        {unit && <span className="text-[9px] tracking-wide-2 text-white/45">{unit}</span>}
      </div>
      <div className="text-[8px] tracking-wide-2 text-white/30">{sub}</div>
    </div>
  );
}
