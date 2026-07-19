"use client";

// ---------------------------------------------------------------------------
// UnitInfoPanel — SurveilTrack-style ground-view unit detail card.
//
// Shown when a garrison is selected AND the camera is zoomed into city/street
// level (zoom ≥ 12). Renders a floating black panel with:
//   • A wireframe garrison-tower illustration (white strokes on black)
//   • Status dot + alphanumeric unit code (e.g. "FNG-3300-NYC")
//   • Power / Session / Signal telemetry rows
//   • PERFORMANCE / HEALTH tabs with a live progress bar
//
// Complements (does not replace) the existing GarrisonDetailCard — that card is
// the full tactical action console; this is the cinematic ground-view readout
// that matches the SurveilTrack reference aesthetic.
// ---------------------------------------------------------------------------

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Garrison } from "@/lib/types";
import { garrisonUnitCode } from "@/lib/map/converters";
import { fmtUptime } from "@/lib/format";
import { cn } from "@/lib/utils";

interface UnitInfoPanelProps {
  garrison: Garrison | null;
  visible: boolean;
}

type Tab = "PERFORMANCE" | "HEALTH";

/** Status → monochrome luminance + label (the deck is strictly B&W). */
function statusMeta(op: Garrison): { color: string; label: string; blink?: boolean } {
  switch (op.status) {
    case "ONLINE":
      return { color: "#ffffff", label: "ACTIVE" };
    case "DEGRADED":
      return { color: "rgba(255,255,255,0.55)", label: "DEGRADED" };
    case "UNDER_ATTACK":
      return { color: "#ffffff", label: "UNDER FIRE", blink: true };
    case "OFFLINE":
      return { color: "rgba(255,255,255,0.25)", label: "OFFLINE" };
    default:
      return { color: "rgba(255,255,255,0.25)", label: "UNKNOWN" };
  }
}

/** Signal quality bucket from health pct (drives the "Signal" row). */
function signalMeta(healthPct: number): { color: string; label: string } {
  if (healthPct > 0.66) return { color: "#ffffff", label: "STRONG" };
  if (healthPct > 0.33) return { color: "rgba(255,255,255,0.55)", label: "MODERATE" };
  return { color: "rgba(255,255,255,0.3)", label: "WEAK" };
}

/** Wireframe garrison-tower illustration — pure SVG, monochrome white on black. */
function WireframeGarrison() {
  return (
    <svg viewBox="0 0 120 96" className="h-24 w-full" fill="none" stroke="#fff" strokeWidth="1">
      {/* Signal emission arcs (top) */}
      <path d="M 38 28 Q 60 12 82 28" opacity="0.4" />
      <path d="M 30 32 Q 60 6 90 32" opacity="0.25" />
      <path d="M 22 36 Q 60 0 98 36" opacity="0.12" />
      {/* Antenna array */}
      <line x1="60" y1="30" x2="60" y2="14" />
      <line x1="60" y1="18" x2="52" y2="14" />
      <line x1="60" y1="18" x2="68" y2="14" />
      <circle cx="60" cy="12" r="1.5" fill="#fff" />
      {/* Mast — tapered tower */}
      <line x1="48" y1="78" x2="54" y2="32" />
      <line x1="72" y1="78" x2="66" y2="32" />
      {/* Cross bracing */}
      <line x1="50" y1="70" x2="70" y2="58" opacity="0.6" />
      <line x1="70" y1="70" x2="50" y2="58" opacity="0.6" />
      <line x1="51" y1="50" x2="69" y2="42" opacity="0.6" />
      <line x1="69" y1="50" x2="51" y2="42" opacity="0.6" />
      <line x1="52" y1="38" x2="68" y2="34" opacity="0.6" />
      <line x1="68" y1="38" x2="52" y2="34" opacity="0.6" />
      {/* Center node (computing core) */}
      <rect x="55" y="44" width="10" height="10" opacity="0.85" />
      <line x1="55" y1="49" x2="65" y2="49" opacity="0.5" />
      {/* Base platform */}
      <line x1="40" y1="80" x2="80" y2="80" strokeWidth="1.5" />
      <line x1="44" y1="84" x2="76" y2="84" opacity="0.5" />
      <line x1="48" y1="88" x2="72" y2="88" opacity="0.25" />
      {/* Corner brackets */}
      <path d="M 8 8 L 8 16 M 8 8 L 16 8" opacity="0.6" />
      <path d="M 112 8 L 112 16 M 112 8 L 104 8" opacity="0.6" />
      <path d="M 8 88 L 8 80 M 8 88 L 16 88" opacity="0.6" />
      <path d="M 112 88 L 112 80 M 112 88 L 104 88" opacity="0.6" />
    </svg>
  );
}

export function UnitInfoPanel({ garrison, visible }: UnitInfoPanelProps) {
  const [tab, setTab] = React.useState<Tab>("PERFORMANCE");

  // Live "preparing details" progress — animates toward a target derived from
  // the garrison's compute, giving the panel a living, telemetry-stream feel.
  const targetPct = garrison
    ? Math.round(Math.max(5, Math.min(99, (garrison.compute / 120) * 100)))
    : 0;
  const [progress, setProgress] = React.useState(0);
  // Reset the telemetry animation when the selected garrison changes —
  // "adjust state during render" pattern (avoids setState-in-effect).
  const [prevGarrisonId, setPrevGarrisonId] = React.useState(garrison?.id);
  if (garrison?.id !== prevGarrisonId) {
    setPrevGarrisonId(garrison?.id);
    setProgress(0);
  }
  React.useEffect(() => {
    if (!garrison) return;
    let raf = 0;
    const start = performance.now();
    const dur = 1400;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      // ease-out
      const eased = 1 - Math.pow(1 - t, 3);
      setProgress(Math.round(eased * targetPct));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [garrison, targetPct]);

  const show = visible && garrison;

  return (
    <AnimatePresence>
      {show && garrison && (
        <motion.div
          key={garrison.id}
          initial={{ opacity: 0, x: 24, y: 8 }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          exit={{ opacity: 0, x: 24, y: 8 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
          className={cn(
            "hud-card hud-corners pointer-events-auto absolute z-20 w-[252px]",
            "right-4 top-20",
          )}
        >
          {/* Header bar — status + unit code */}
          <div className="flex items-center gap-2 border-b border-white/15 px-3 py-2">
            <span
              className={cn("inline-block h-2 w-2 rounded-full", statusMeta(garrison).blink && "blink")}
              style={{
                backgroundColor: statusMeta(garrison).color,
                boxShadow: `0 0 6px ${statusMeta(garrison).color}`,
              }}
            />
            <span className={cn("font-mono text-[9px] tracking-[0.18em] text-white/80", statusMeta(garrison).blink && "blink")}>
              {statusMeta(garrison).label}
            </span>
            <span className="ml-auto font-mono text-[10px] tracking-[0.14em] text-white">
              {garrisonUnitCode(garrison)}
            </span>
          </div>

          {/* Wireframe illustration */}
          <div className="relative border-b border-white/15 bg-[#050505] px-3 py-2">
            <WireframeGarrison />
            <div className="absolute right-2 top-2 font-mono text-[8px] tracking-[0.2em] text-white/40">
              {garrison.type}
            </div>
          </div>

          {/* Telemetry rows */}
          <div className="space-y-2 px-3 py-3">
            <TelemetryRow
              label="POWER"
              value={`${Math.round((garrison.compute / 120) * 100)}%`}
              bar={Math.min(1, garrison.compute / 120)}
            />
            <div className="flex items-center justify-between font-mono text-[9px] tracking-[0.16em]">
              <span className="text-white/45">SESSION</span>
              <span className="text-white/85">
                {garrison.uptime > 0 ? fmtUptime(garrison.uptime * 1000) : "0s"}
              </span>
            </div>
            <div className="flex items-center justify-between font-mono text-[9px] tracking-[0.16em]">
              <span className="text-white/45">SIGNAL</span>
              <span className="flex items-center gap-1.5 text-white/85">
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{
                    backgroundColor: signalMeta(garrison.health / garrison.maxHealth).color,
                  }}
                />
                {signalMeta(garrison.health / garrison.maxHealth).label}
              </span>
            </div>
          </div>

          {/* Tabs + progress */}
          <div className="border-t border-white/15 px-3 py-2.5">
            <div className="mb-2 flex gap-1">
              {(["PERFORMANCE", "HEALTH"] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    "flex-1 border px-2 py-1 font-mono text-[8px] tracking-[0.18em] transition-colors",
                    tab === t
                      ? "border-white/60 bg-white/10 text-white"
                      : "border-white/10 text-white/40 hover:text-white/70",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="h-1 w-full bg-white/10">
              <div
                className="h-full bg-white transition-[width] duration-100"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-1.5 flex items-center justify-between font-mono text-[8px] tracking-[0.16em]">
              <span className="text-white/85">
                {tab === "PERFORMANCE" ? `${progress}%` : `${Math.round((garrison.health / garrison.maxHealth) * 100)}%`}
              </span>
              <span className="text-white/35">
                {tab === "PERFORMANCE"
                  ? progress < targetPct
                    ? "PREPARING PERFORMANCE DETAILS..."
                    : "PERFORMANCE STREAM LOCKED"
                  : "HULL INTEGRITY NOMINAL"}
              </span>
            </div>
          </div>

          {/* Footer — node name + level */}
          <div className="flex items-center justify-between border-t border-white/15 px-3 py-1.5 font-mono text-[8px] tracking-[0.18em] text-white/45">
            <span>{garrison.name}</span>
            <span>LVL {garrison.level.toString().padStart(2, "0")}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** A labeled telemetry row with an optional mini progress bar. */
function TelemetryRow({ label, value, bar }: { label: string; value: string; bar?: number }) {
  return (
    <div className="font-mono text-[9px] tracking-[0.16em]">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-white/45">{label}</span>
        <span className="text-white/85">{value}</span>
      </div>
      {bar !== undefined && (
        <div className="h-0.5 w-full bg-white/10">
          <div className="h-full bg-white/70" style={{ width: `${Math.round(bar * 100)}%` }} />
        </div>
      )}
    </div>
  );
}
