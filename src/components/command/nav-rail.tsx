"use client";

import * as React from "react";
import { useCommand } from "@/stores/command";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav/nav-registry";
import { NavButton } from "./nav/nav-button";
import type { NavView } from "./nav/nav-types";

// Re-export so existing imports (`import type { NavView } from "./nav-rail"`)
// and `import { NavRail }` keep working unchanged.
export type { NavView };

/**
 * NavRail — free-floating icon sidebar orchestrator (no container/background).
 *
 * Renders the nav items declared in `nav/nav-registry.ts` in order. Each item
 * is an independent component that wraps the shared `NavButton` shell — this
 * file owns no icon definitions.
 *
 * The footer hosts the live uplink indicator (pip + "LIVE"/"NO LINK" label),
 * driven by the command store's `connected` flag (the same socket state the
 * old header LINK readout used).
 *
 * To add / remove / reorder nav items, edit `nav/nav-registry.ts` only.
 */
export function NavRail({
  view,
  onChange,
}: {
  view: NavView | null;
  onChange: (v: NavView) => void;
}) {
  const connected = useCommand((s) => s.connected);

  return (
    <nav className="pointer-events-none absolute left-0 top-20 z-30 flex w-14 shrink-0 flex-col items-center gap-1.5 py-2.5">
      {NAV_ITEMS.map(({ view: itemView, icon, label, hotkey }) => (
        <NavButton
          key={itemView}
          active={view === itemView}
          icon={icon}
          label={label}
          hotkey={hotkey}
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
