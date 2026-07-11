"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * NavButton — shared shell for a nav-rail icon button.
 *
 * Floating-HUD variant: no container chrome, just the button. Active state
 * uses a translucent backdrop blur; inactive is a faint outline that
 * brightens on hover. Tooltip appears to the right on hover.
 */
export function NavButton({
  active,
  icon: Icon,
  label,
  hotkey,
  onChange,
}: {
  active: boolean;
  icon: React.ElementType;
  label: string;
  hotkey: string;
  onChange: () => void;
}) {
  return (
    <button
      onClick={onChange}
      title={`${label} [${hotkey}]`}
      className={cn(
        "pointer-events-auto group relative flex h-9 w-9 items-center justify-center border transition-colors",
        active
          ? "border-white/60 bg-black/50 text-white backdrop-blur-sm"
          : "border-transparent text-white/45 hover:border-white/30 hover:bg-black/40 hover:text-white"
      )}
    >
      <Icon size={16} strokeWidth={1.5} />
      <span className="pointer-events-none absolute left-11 z-50 hidden whitespace-nowrap border border-white/20 bg-black/90 px-2 py-1 font-mono text-[9px] tracking-wide-2 text-white/90 backdrop-blur-sm group-hover:block">
        {label.toUpperCase()} · [{hotkey}]
      </span>
      {active && <span className="absolute -left-2 h-5 w-[2px] bg-white" />}
    </button>
  );
}
