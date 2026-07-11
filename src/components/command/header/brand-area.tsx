"use client";

import * as React from "react";
import { useCommand } from "@/stores/command";
import { useBrandData } from "./brand-area.data";
import { HoverDetail, DetailHeader, DetailRow, DetailBody, DetailNote } from "./hover-detail";
import { FACTION_META, FACTION_TOKEN, NETWORK_CURRENCY } from "@/lib/types";
import { FACTION_MARK_GLYPH, outpostNumberStr } from "@/lib/format";

/**
 * BrandArea — faction logo + OUTPOST designation number (pure presentation).
 *
 * The outpost number is dynamic per-faction:
 *   FANG → 33, HAMMER → 21, RESOLUTE → 07
 * driven by the operative's faction from the live game state.
 *
 * On hover, reveals a compact detail popover with the faction identity,
 * motto, and command-node designation.
 *
 * Data source: see `brand-area.data.ts` (`useBrandData`). Swap that file to
 * plug this area into a different data source — this component is unchanged.
 */
export function BrandArea() {
  const data = useBrandData();
  const state = useCommand((s) => s.state);

  if (!data || !state) return null;

  const fac = state.factions[data.faction];
  const meta = FACTION_META[data.faction];
  const myOutposts = state.outposts.filter((o) => o.faction === data.faction);
  const opNumber = outpostNumberStr(data.faction);

  const detail = (
    <>
      <DetailHeader title="COMMAND NODE" />
      <DetailBody>
        <DetailRow label="DESIGNATION" value={`OUTPOST ${opNumber}`} />
        <DetailRow label="FACTION" value={`${FACTION_MARK_GLYPH[data.faction]} ${meta.name}`} />
        <DetailRow label="TYPE" value="FULL NODE" />
        <DetailRow label="TERRITORIES" value={fac.territories} />
        <DetailRow label="TOKEN" value={FACTION_TOKEN[data.faction]} />
      </DetailBody>
      <DetailNote>
        <span className="text-white/70">“{meta.motto}”</span>
        <br />
        <span className="text-white/35">{NETWORK_CURRENCY} NETWORK · {myOutposts.length} NODES</span>
      </DetailNote>
    </>
  );

  return (
    <HoverDetail detail={detail} align="left">
      <div className="pointer-events-auto flex h-full items-center gap-2.5 border-r border-white/15 px-4">
        <img
          src={data.factionLogo}
          alt={`${data.faction} insignia`}
          className="h-10 w-10 object-contain"
          style={{ filter: "grayscale(1) contrast(1.3) brightness(1.1)" }}
        />
        <div className="text-[15px] font-bold tracking-wider text-white text-glow" style={{ fontFamily: "var(--font-stencil), monospace" }}>
          {opNumber}
        </div>
      </div>
    </HoverDetail>
  );
}
