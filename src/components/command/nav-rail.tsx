"use client";

import * as React from "react";
import { useCommand } from "@/stores/command";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav/nav-registry";
import { NavButton } from "./nav/nav-button";
import { listIntelTargets } from "@/lib/strike-plan";
import type { NavView } from "./nav/nav-types";

// Re-export so existing imports (`import type { NavView } from "./nav-rail"`)
// and `import { NavRail }` keep working unchanged.
export type { NavView };

/**
 * NavRail — free-floating icon sidebar orchestrator.
 *
 * Renders the nav items declared in `nav/nav-registry.ts` in order. Each
 * button carries a live gamified badge where the view has actionable
 * content: STRIKE → revealed intel targets, QUEUE → active missions,
 * FEED → critical events awaiting review.
 *
 * The footer hosts the live uplink indicator (pip + "LIVE"/"NO LINK" label),
 * driven by the command store's `connected` flag.
 */
export function NavRail({
  view,
  onChange,
}: {
  view: NavView | null;
  onChange: (v: NavView) => void;
}) {
  const connected = useCommand((s) => s.connected);
  const state = useCommand((s) => s.state);

  // Live badge counts per view (gamified "there's something here" signals).
  const badges = React.useMemo(() => {
    const b: Partial<Record<NavView, number>> = {};
    if (!state) return b;
    b.STRIKE = listIntelTargets(state).length;
    b.QUEUE = state.missions.filter((m) => m.status === "ACTIVE").length;
    b.FEED = state.events.filter((e) => e.severity === "CRITICAL").length;
    return b;
  }, [state]);

  return (
    <nav className="pointer-events-none absolute left-2 top-20 z-30 flex w-12 shrink-0 flex-col items-center gap-2 py-2.5">
      {NAV_ITEMS.map(({ view: itemView, icon, label, hotkey }) => (
        <NavButton
          key={itemView}
          active={view === itemView}
          icon={icon}
          label={label}
          hotkey={hotkey}
          badge={badges[itemView]}
          onChange={() => onChange(itemView)}
        />
      ))}

      <div className="mt-auto flex flex-col items-center gap-1 pt-2">
        <span className={cn("pip blink", connected ? "" : "pip--dim")} />
        <span className={cn("font-mono text-[8px] tracking-wide-2", connected ? "text-white/55" : "text-white/30")}>
          {connected ? "LIVE" : "NO LINK"}
        </span>
      </div>
    </nav>
  );
}
