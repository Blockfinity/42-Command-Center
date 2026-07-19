"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * NavButton — shared shell for a nav-rail icon button.
 *
 * Obsidian HUD variant: square hard-edged button with corner-bracket chrome
 * on hover/active, an active notch on the left edge, the hotkey numeral in
 * the bottom-right corner, and an optional live count badge (top-right).
 * Tooltip appears to the right on hover.
 */
export function NavButton({
  active,
  icon: Icon,
  label,
  hotkey,
  badge,
  onChange,
}: {
  active: boolean;
  icon: React.ElementType;
  label: string;
  hotkey: string;
  /** live count shown as a luminous badge (e.g. active missions, intel targets) */
  badge?: number;
  onChange: () => void;
}) {
  return (
    <button
      onClick={onChange}
      title={`${label} [${hotkey}]`}
      className={cn(
        "hud-corners pointer-events-auto group relative flex h-10 w-10 items-center justify-center border transition-all duration-150",
        active
          ? "border-white/70 bg-white/10 text-white shadow-[0_0_16px_rgba(255,255,255,0.15)] backdrop-blur-sm"
          : "border-white/10 bg-black/45 text-white/45 backdrop-blur-sm hover:border-white/35 hover:text-white"
      )}
    >
      <Icon size={16} strokeWidth={active ? 2 : 1.5} />

      {/* hotkey numeral */}
      <span
        className={cn(
          "pointer-events-none absolute bottom-[2px] right-[3px] font-mono text-[7px] leading-none",
          active ? "text-white/80" : "text-white/25 group-hover:text-white/50"
        )}
      >
        {hotkey}
      </span>

      {/* live count badge */}
      {badge !== undefined && badge > 0 && (
        <span className="nav-badge">{badge > 99 ? "99" : badge}</span>
      )}

      {/* tooltip */}
      <span className="hud-card pointer-events-none absolute left-12 z-50 hidden whitespace-nowrap px-2 py-1 font-mono text-[9px] tracking-wide-2 text-white/90 group-hover:block">
        {label.toUpperCase()} <span className="text-white/40">· [{hotkey}]</span>
      </span>

      {active && <span className="nav-notch" />}
    </button>
  );
}
