"use client";

import * as React from "react";
import { useCommand } from "@/stores/command";
import { HEADER_AREAS } from "@/components/command/header/header-registry";

/**
 * CommandBar — free-floating header orchestrator.
 *
 * Renders the areas declared in `header/header-registry.ts` in order. Each
 * area is an independent component that pulls its own data via its co-located
 * `.data.ts` hook — this file owns no data and no area-specific markup.
 *
 * To add / remove / reorder header areas, edit `header-registry.ts` only.
 */
export function CommandBar() {
  const hasState = useCommand((s) => !!s.state);

  if (!hasState) {
    // No-state branch: nothing to render during boot
    return null;
  }

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex h-16 items-stretch bg-black/60 font-mono backdrop-blur-sm">
      {HEADER_AREAS.map(({ id, Area }) => (
        <Area key={id} />
      ))}
    </header>
  );
}
