"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useClockData } from "./clock-area.data";

/**
 * ClockArea — connection link indicator (pure presentation).
 *
 * The system clock has been moved to a bottom-left HUD overlay (see
 * command-deck.tsx); this area now shows only the live uplink status.
 *
 * Data source: see `clock-area.data.ts` (`useClockData`). Swap that file to
 * plug this area into a different data source — this component is unchanged.
 */
export function ClockArea() {
  const data = useClockData();
  if (!data) return null;

  return (
    <div className="pointer-events-auto ml-auto flex h-full items-center gap-2.5 border-r border-white/15 px-4">
      <div className="flex items-center gap-1.5">
        <span className={cn("pip", data.connected ? "" : "pip--dim")} />
        <span className="text-[10px] tracking-wide-2 text-white/55">{data.connected ? "LINK" : "NO LINK"}</span>
      </div>
    </div>
  );
}
