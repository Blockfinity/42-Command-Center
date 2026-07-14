"use client";

import * as React from "react";
import { useCommand } from "@/stores/command";
import { useSfx } from "@/hooks/use-sfx";
import { cn } from "@/lib/utils";
import { Volume2, VolumeX } from "lucide-react";

/**
 * StatusBar — free-floating footer ticker.
 *
 * Floating-HUD variant: no full-width container. Each section is an
 * independent pill with its own `bg-black/50 backdrop-blur-sm` background,
 * separated by the flex layout.
 */
export function StatusBar() {
  const state = useCommand((s) => s.state);
  const connected = useCommand((s) => s.connected);
  const sfx = useSfx();
  if (!state) {
    return null;
  }
  const myFaction = state.factions[state.operative.faction];
  const activeMissions = state.missions.filter((m) => m.status === "ACTIVE").length;
  const underAttack = state.garrisons.filter((o) => o.status === "UNDER_ATTACK").length;
  const offline = state.garrisons.filter((o) => o.status === "OFFLINE").length;

  const tickerItems = [
    `SOL ${state.sol}`,
    `${myFaction.name} STR ${myFaction.strength}`,
    `${myFaction.compute} TF VERIFIED`,
    `${activeMissions} ACTIVE OPS`,
    `${underAttack} UNDER FIRE`,
    `${offline} OFFLINE`,
    `THREAT ${state.threatLevel}`,
    `FABRIC 42 // NOMINAL`,
    `VERIFICATION CRYPTO ON`,
    `UPLINK ${connected ? "STABLE" : "DEGRADED"}`,
  ];

  const sys = Array.from({ length: 12 }, (_, i) => i + 1);

  return (
    <footer className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex h-9 items-stretch font-mono text-[10px] tracking-wide-2">
      {/* left fixed metrics */}
      <div className="pointer-events-auto hidden items-center gap-5 bg-black/50 px-4 text-white/55 backdrop-blur-sm sm:flex">
        <span>OPS {activeMissions.toString().padStart(2, "0")}</span>
        <span className={cn(underAttack > 0 ? "text-white blink" : "text-white/55")}>FIRE {underAttack}</span>
        <span>DOWN {offline}</span>
      </div>

      {/* ticker */}
      <div className="relative flex-1 overflow-hidden bg-black/50 backdrop-blur-sm">
        <div className="ticker-track absolute flex h-full items-center gap-10 whitespace-nowrap px-4 text-white/45">
          {[...tickerItems, ...tickerItems].map((t, i) => (
            <span key={i} className="flex items-center gap-2.5">
              <span className="text-white/25">◇</span>
              <span className="text-white/65">{t}</span>
            </span>
          ))}
        </div>
      </div>

      {/* SFX mute toggle */}
      <div className="pointer-events-auto bg-black/50 backdrop-blur-sm">
        <button
          onClick={() => { sfx.resume(); sfx.toggle(); if (sfx.muted) { /* just muted */ } else sfx.play("click"); }}
          title={sfx.muted ? "SOUND OFF — click to enable" : "SOUND ON — click to mute"}
          className="flex h-full items-center gap-1.5 px-3 text-white/55 transition-colors hover:text-white"
        >
          {sfx.muted ? <VolumeX size={13} strokeWidth={1.5} /> : <Volume2 size={13} strokeWidth={1.5} />}
          <span className="hidden sm:inline">{sfx.muted ? "MUTE" : "SFX"}</span>
        </button>
      </div>

      {/* system indicators */}
      <div className="pointer-events-auto hidden items-center gap-2 bg-black/50 px-4 text-white/45 backdrop-blur-sm md:flex">
        <span className="text-white/30">SYS</span>
        {sys.map((n) => (
          <span
            key={n}
            className={cn(
              "inline-block h-1.5 w-1.5",
              n === 4 || n === 9 ? "bg-white/30" : "bg-white/70"
            )}
            title={`SYS ${n.toString().padStart(2, "0")}`}
          />
        ))}
        <span className="ml-2 text-white/55">ALL NOMINAL</span>
      </div>

      {/* clock/tick */}
      <div className="pointer-events-auto flex items-center gap-2.5 bg-black/50 px-4 text-white/55 backdrop-blur-sm">
        <span className="pip" />
        <span>TICK {state.tick.toString().padStart(6, "0")}</span>
      </div>
    </footer>
  );
}
