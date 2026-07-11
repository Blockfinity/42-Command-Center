"use client";

import * as React from "react";
import { useSfx } from "@/hooks/use-sfx";
import type { FactionId } from "@/lib/types";

/**
 * Faction wallpaper map — each operative sees their own faction's insignia
 * as a faint, decoupled background wallpaper on the boot screen.
 */
const FACTION_WALLPAPER: Record<FactionId, string> = {
  FANG: "/fang-logo.jpg",
  HAMMER: "/hammer-logo.jpg",
  RESOLUTE: "/resolute-logo.jpg",
};

/**
 * BootScreen — full-screen gate shown until the commander clicks
 * "ESTABLISH UPLINK". Renders a cinematic monochrome boot sequence:
 *
 *   • Faction insignia as a large, barely-visible decoupled wallpaper that
 *     fades in over 3s then breathes perpetually (0.045↔0.075 opacity).
 *   • "42" stencil numeral (no box) with text-glow.
 *   • "// CLASSIFIED · OPERATIVE ACCESS ONLY" subtitle.
 *   • Loading bar (CSS-driven, 0→88% hold) + percentage counter.
 *   • ESTABLISH UPLINK button with slow pulsating glow (gate-pulse 3.6s).
 *   • Corner labels: VIRTUCORP (top-left), 42 // AKKADIA OBITAL DEFENSE
 *     FACILITY · AUTHORIZED PERSONNEL ONLY (bottom-center).
 *   • All text inherits a very subtle chromatic-split glitch (boot-text-glitch
 *     7s) — constant baseline RGB-split with a ~300ms position-jitter burst
 *     every 7s.
 *
 * After click, the parent (CommandDeck) starts the socket + /api/state fetch
 * and this screen is unmounted once `state` arrives.
 */
export function BootScreen({
  onConnect,
  bootError,
  faction,
}: {
  onConnect: () => void;
  bootError: boolean;
  faction: FactionId;
}) {
  const sfx = useSfx();

  return (
    <div className="boot-content-in vignette absolute inset-0 z-50 flex flex-col items-center justify-center bg-black scanlines">
      {/* grid backdrop */}
      <div className="grid-overlay--major absolute inset-0 opacity-40" />

      {/* faction wallpaper — decoupled background, fades in then breathes */}
      <img
        src={FACTION_WALLPAPER[faction]}
        alt=""
        aria-hidden="true"
        className="boot-faction-wallpaper pointer-events-none absolute left-1/2 top-1/2 h-[90%] w-[90%] -translate-x-1/2 -translate-y-1/2 select-none object-contain"
        style={{ filter: "grayscale(1) contrast(1.2)" }}
      />

      {/* center stack */}
      <div className="relative z-10 flex flex-col items-center gap-6 px-6 text-center">
        {/* title — 42 stencil numeral, no box */}
        <h1
          className="flicker text-2xl font-bold tracking-wider text-white text-glow sm:text-5xl"
          style={{ fontFamily: "var(--font-stencil), monospace" }}
        >
          42
        </h1>

        {/* subtitle */}
        <div className="font-mono text-[10px] tracking-wide-2 text-white/45">
          {bootError ? (
            <span className="text-white blink">UPLINK FAILED — RETRY</span>
          ) : (
            <span>{"// CLASSIFIED · OPERATIVE ACCESS ONLY"}</span>
          )}
        </div>

        {/* loading bar — CSS-driven, 0→88% hold (or fast loop on error) */}
        <div className="h-px w-56 overflow-hidden bg-white/15 sm:w-72">
          <div
            className={bootError ? "boot-bar-fill--err h-full bg-white/70" : "boot-bar-fill h-full bg-white/70"}
            style={{ boxShadow: "0 0 6px oklch(1 0 0 / 0.6)" }}
          />
        </div>

        {/* CTA — slow pulsating glow */}
        <button
          onClick={() => { sfx.resume(); sfx.play("key"); onConnect(); }}
          className="gate-pulse group relative mt-2 border border-white/40 bg-black/50 px-8 py-3 font-mono text-[12px] font-bold tracking-mega text-white backdrop-blur-sm transition-colors hover:border-white hover:bg-white/10"
        >
          <span className="text-white/45 group-hover:text-white/70">▶ </span>
          ESTABLISH UPLINK
        </button>
      </div>

      {/* corner labels */}
      <div className="pointer-events-none absolute left-4 top-4 font-mono text-[10px] tracking-mega text-white/40">
        VIRTUCORP
      </div>
      <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 text-center font-mono text-[10px] tracking-mega text-white/40">
        42 // AKKADIA OBITAL DEFENSE FACILITY · AUTHORIZED PERSONNEL ONLY
      </div>
    </div>
  );
}
