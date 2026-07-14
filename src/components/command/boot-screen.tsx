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
// Single-phase design (per user request):
//   • IDLE (pre-click) — only the title, subtitle, and "ESTABLISH UPLINK"
//     button are shown. The terminal box + progress bar are HIDDEN until
//     the operative clicks. The button is enabled immediately (no
//     "INITIALIZING..." gate).
//
//   • CONNECTING (post-click) — the terminal box + progress bar fade in,
//     then the full boot sequence streams line-by-line. Each line plays a
//     deep "boot" tick. The bar fills 0 → 100% as lines print.
//
//   • DONE — when the last line prints, the "link established" cinematic
//     stinger (/sounds/link-established.mp3) plays, the button flips to
//     "UPLINK ESTABLISHED", and after a short beat onConnect() fires so
//     the parent loads the command deck.
//
// All audio happens after the user gesture, so browser autoplay policies
// are satisfied.
//
// Implementation note: counter + setTimeout-per-render pattern (NOT
// setInterval). Each render schedules exactly one timeout; React's cleanup
// cancels it when the counter changes. Immune to Strict Mode double-mount.

const BOOT_SEQUENCE: string[] = [
  "VIRTUCORP SECURE TERMINAL · v4.2.1",
  "▸ Booting operative firmware [OK]",
  "▸ ARIA cognitive core [READY]",
  "▸ Operative biometrics [VERIFIED]",
  "▸ ESTABLISHING SECURE UPLINK",
  "▸ Requesting AORDF authentication token [GRANTED]",
  "▸ Synchronizing with VirtuCorp servers [SYNCED]",
  "▸ Network topology · 16 nodes · 12 territories [LOADED]",
  "▸ Faction state sync · FANG ▸ HAMMER ▸ RESOLUTE [OK]",
  "▸ Compute mesh · 2.1M actions/sec [ONLINE]",
  "▸ UPLINK ESTABLISHED",
];

const TOTAL_LINES = BOOT_SEQUENCE.length;
const LINE_INTERVAL = 240; // ms per line

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
  // NOTE: `phase` stays "connecting" through completion. We use a separate
  // `done` flag (NOT a phase change) so the done-effect's deps don't change
  // — otherwise React's cleanup would cancel the onConnect timeout.
  const [phase, setPhase] = React.useState<"idle" | "connecting">("idle");
  const [lineCount, setLineCount] = React.useState(0);
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

  // ── Stream boot lines one-by-one with a tick per line ──────────────────
  React.useEffect(() => {
    if (phase !== "connecting" || lineCount >= TOTAL_LINES) return;
    const timer = setTimeout(() => {
      setLineCount((c) => c + 1);
      sfxRef.current.play("boot");
    }, LINE_INTERVAL);
    return () => clearTimeout(timer);
  }, [phase, lineCount]);

  // ── When the last line prints: play the "link established" stinger,
  //    mark done, fire onConnect.
  React.useEffect(() => {
    if (phase === "connecting" && lineCount >= TOTAL_LINES && !firedRef.current) {
      firedRef.current = true;
      setDone(true);
      // Real cinematic stinger for the uplink-established moment.
      sfxRef.current.playAsset("/sounds/link-established.mp3", { volume: 0.85 });
      const t = setTimeout(() => onConnectRef.current(), 420);
      return () => clearTimeout(t);
    }
  }, [phase, lineCount]);

  // Auto-scroll terminal to bottom when lines change
  React.useEffect(() => {
    if (termRef.current) {
      termRef.current.scrollTop = termRef.current.scrollHeight;
    }
  }, [lineCount]);

  const lines = BOOT_SEQUENCE.slice(0, lineCount);
  const progress = Math.min(100, Math.round((lineCount / TOTAL_LINES) * 100));
  const showPanel = phase !== "idle"; // box + bar appear only after click

  function handleClick() {
    if (phase !== "idle" || bootError) return;
    sfx.resume();
    sfx.play("transition");
    setPhase("connecting");
    // onConnect() is called by the done-effect after the boot sequence
    // completes, so the full cinematic + "link established" stinger play first.
  }

  // Button label + state
  const buttonLabel = bootError
    ? "RETRY UPLINK"
    : done
      ? "UPLINK ESTABLISHED"
      : phase === "connecting"
        ? "ESTABLISHING UPLINK..."
        : "ESTABLISH UPLINK";
  const buttonDisabled = phase !== "idle" || bootError;

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

        {/* terminal log pane + progress bar — hidden until ESTABLISH UPLINK is clicked */}
        {showPanel && (
          <div className="boot-panel-in flex w-[min(90vw,420px)] flex-col gap-3">
            {/* progress bar + percentage counter */}
            <div className="flex items-center gap-3">
              <div className="h-px w-full overflow-hidden bg-white/15">
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
              className="boot-terminal thin-scroll h-[132px] w-full overflow-y-auto border border-white/15 bg-white/[0.02] p-3 text-left backdrop-blur-sm"
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
          </div>
        )}

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
