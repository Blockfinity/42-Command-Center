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

// ── Boot sequence ─────────────────────────────────────────────────────────
//
// Two phases:
//   1. BOOT (silent, pre-click) — firmware/hardware init. ~1.6s.
//      Bar fills 0 → ~46%. Button stays disabled until complete.
//      No sound (browsers block audio before user gesture).
//
//   2. UPLINK (with sound, post-click) — VirtuCorp + AORDF handshake. ~1.8s.
//      Bar fills ~46 → 100%. Each line plays a deep "boot" tick.
//      Final line plays a "powerOn" rising sweep.
//      onConnect() is called immediately on click so the parent can start
//      fetching state in parallel; the terminal sequence plays on top.
//
// Implementation note: we use a counter + setTimeout-per-render pattern
// (NOT setInterval). Each render schedules exactly one timeout; React's
// cleanup cancels it when the counter changes. This is immune to React
// Strict Mode double-invocation — no duplicated or skipped lines.

const BOOT_LINES: string[] = [
  "VIRTUCORP SECURE TERMINAL · v4.2.1",
  "▸ Booting operative firmware [OK]",
  "▸ Mounting /dev/akkadia0 [OK]",
  "▸ Tactical overlay modules [LOADED]",
  "▸ ARIA cognitive core [READY]",
  "▸ Operative biometrics [VERIFIED]",
];

const UPLINK_LINES: string[] = [
  "▸ ESTABLISHING SECURE UPLINK",
  "▸ Requesting AORDF authentication token [GRANTED]",
  "▸ Synchronizing with VirtuCorp servers [SYNCED]",
  "▸ Network topology · 16 nodes · 12 territories [LOADED]",
  "▸ Faction state sync · FANG ▸ HAMMER ▸ RESOLUTE [OK]",
  "▸ Compute mesh · 2.1M actions/sec [ONLINE]",
  "▸ UPLINK ESTABLISHED",
];

const TOTAL_LINES = BOOT_LINES.length + UPLINK_LINES.length;
const LINE_INTERVAL = 260; // ms per line

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
  const [phase, setPhase] = React.useState<"boot" | "uplink">("boot");
  const [bootCount, setBootCount] = React.useState(0);
  const [uplinkCount, setUplinkCount] = React.useState(0);
  const [done, setDone] = React.useState(false);

  const termRef = React.useRef<HTMLDivElement>(null);

  // Refs for sfx/onConnect — useSfx returns a new object literal each render,
  // and onConnect may change identity too. If these were in effect dep arrays,
  // the cleanup would cancel pending setTimeouts on every re-render. Refs
  // keep the timeouts alive while always calling the latest version.
  const sfxRef = React.useRef(sfx);
  const onConnectRef = React.useRef(onConnect);
  const firedRef = React.useRef(false);
  React.useEffect(() => { sfxRef.current = sfx; });
  React.useEffect(() => { onConnectRef.current = onConnect; });

  // ── Phase 1: BOOT — increment bootCount until all BOOT_LINES printed ───
  React.useEffect(() => {
    if (phase !== "boot" || bootCount >= BOOT_LINES.length) return;
    const timer = setTimeout(() => setBootCount((c) => c + 1), LINE_INTERVAL);
    return () => clearTimeout(timer);
  }, [phase, bootCount]);

  // ── Phase 2: UPLINK — increment uplinkCount with sound ────────────────
  React.useEffect(() => {
    if (phase !== "uplink" || uplinkCount >= UPLINK_LINES.length) return;
    const timer = setTimeout(() => {
      setUplinkCount((c) => c + 1);
      sfxRef.current.play("boot");
    }, LINE_INTERVAL);
    return () => clearTimeout(timer);
  }, [phase, uplinkCount]);

  // ── Mark done + play powerOn sweep when UPLINK completes ──────────────
  // Then call onConnect() so the parent starts the socket + state fetch.
  // Delaying onConnect until the boot sequence finishes ensures the user
  // sees the full cinematic (bar → 100%, powerOn sweep) before the deck loads.
  React.useEffect(() => {
    if (phase === "uplink" && uplinkCount >= UPLINK_LINES.length && !firedRef.current) {
      firedRef.current = true;
      setDone(true);
      sfxRef.current.play("powerOn");
      const t = setTimeout(() => onConnectRef.current(), 350);
      return () => clearTimeout(t);
    }
  }, [phase, uplinkCount]);

  // Auto-scroll terminal to bottom when lines change
  const lines = [
    ...BOOT_LINES.slice(0, bootCount),
    ...UPLINK_LINES.slice(0, uplinkCount),
  ];

  React.useEffect(() => {
    if (termRef.current) {
      termRef.current.scrollTop = termRef.current.scrollHeight;
    }
  }, [bootCount, uplinkCount]);

  const bootReady = phase === "boot" && bootCount >= BOOT_LINES.length;
  const progress = Math.min(100, Math.round((lines.length / TOTAL_LINES) * 100));

  function handleClick() {
    if (!bootReady || phase === "uplink") return;
    sfx.resume();
    sfx.play("transition");
    setPhase("uplink");
    // onConnect() is called by the done-effect after the UPLINK sequence
    // completes, so the full boot animation + powerOn sweep play first.
  }

  // Button label + state
  const buttonLabel = bootError
    ? "RETRY UPLINK"
    : phase === "uplink"
      ? done
        ? "UPLINK ESTABLISHED"
        : "ESTABLISHING UPLINK..."
      : bootReady
        ? "ESTABLISH UPLINK"
        : "INITIALIZING...";
  const buttonDisabled = !bootReady || phase === "uplink" || bootError;

  return (
    <div className="boot-content-in vignette absolute inset-0 z-50 flex flex-col items-center justify-center bg-black scanlines">
      {/* grid backdrop */}
      <div className="grid-overlay--major absolute inset-0 opacity-40" />

      {/* faction wallpaper — decoupled background */}
      <img
        src={FACTION_WALLPAPER[faction]}
        alt=""
        aria-hidden="true"
        className="boot-faction-wallpaper pointer-events-none absolute left-1/2 top-1/2 h-[90%] w-[90%] -translate-x-1/2 -translate-y-1/2 select-none object-contain"
        style={{ filter: "grayscale(1) contrast(1.2)" }}
      />

      {/* center stack */}
      <div className="relative z-10 flex flex-col items-center gap-5 px-6 text-center">
        {/* title — 42 stencil numeral */}
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

        {/* progress bar + percentage counter */}
        <div className="flex items-center gap-3">
          <div className="h-px w-56 overflow-hidden bg-white/15 sm:w-72">
            <div
              className="h-full bg-white/70 transition-[width] duration-200 ease-out"
              style={{
                width: `${progress}%`,
                boxShadow: "0 0 6px oklch(1 0 0 / 0.6)",
              }}
            />
          </div>
          <span className="font-mono text-[10px] tabular-nums text-white/60">
            {progress.toString().padStart(3, "0")}%
          </span>
        </div>

        {/* terminal log pane */}
        <div
          ref={termRef}
          className="boot-terminal thin-scroll h-[132px] w-[min(90vw,420px)] overflow-y-auto border border-white/15 bg-white/[0.02] p-3 text-left backdrop-blur-sm"
        >
          <div className="font-mono text-[10px] leading-[1.7] text-white/55">
            {lines.map((line, i) => {
              const isLast = i === lines.length - 1;
              return (
                <div
                  key={i}
                  className={
                    isLast && done
                      ? "boot-line-in whitespace-pre-wrap text-white/90"
                      : "boot-line-in whitespace-pre-wrap"
                  }
                >
                  {line}
                </div>
              );
            })}
            {!done && (
              <span className="boot-cursor inline-block text-white/80">▌</span>
            )}
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={handleClick}
          disabled={buttonDisabled}
          className={`group relative mt-1 border px-8 py-3 font-mono text-[12px] font-bold tracking-mega backdrop-blur-sm transition-all ${
            buttonDisabled
              ? "cursor-not-allowed border-white/15 bg-black/30 text-white/30"
              : "gate-pulse border-white/40 bg-black/50 text-white hover:border-white hover:bg-white/10"
          }`}
        >
          <span className="text-white/45 group-hover:text-white/70">▶ </span>
          {buttonLabel}
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
