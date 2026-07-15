"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

type GatePhase = "idle" | "connecting" | "ready" | "failed";

/**
 * UplinkGate — the cinematic first screen of "42".
 *
 * Flow:
 *   1. IDLE      — emblem + diagnostics scroll + "ESTABLISH UPLINK" button (the gate)
 *   2. CONNECTING— button press triggers a handshake sequence (key exchange, sync, etc.)
 *   3. READY     — uplink established → onEnter() fires → parent reveals command deck
 *   4. FAILED    — if the backend never delivers state, a RETRY button appears
 *
 * This is a deliberate entry gate. The command deck does NOT mount until the
 * operative clicks through.
 */
export function UplinkGate({
  onEnter,
  bootError,
}: {
  onEnter: () => void;
  bootError: boolean;
}) {
  const [phase, setPhase] = React.useState<GatePhase>("idle");
  const [progress, setProgress] = React.useState(0);
  const [logLines, setLogLines] = React.useState<string[]>([]);

  // auto-advance the connecting → ready transition based on progress
  React.useEffect(() => {
    if (phase !== "connecting") return;
    if (progress >= 100) {
      const t = setTimeout(() => {
        setPhase("ready");
        // brief pause on "UPLINK ESTABLISHED" then enter
        setTimeout(onEnter, 650);
      }, 220);
      return () => clearTimeout(t);
    }
  }, [phase, progress, onEnter]);

  // if a boot error surfaces while connecting, surface the retry state
  React.useEffect(() => {
    if (bootError && phase === "connecting") {
      setPhase("failed");
      setProgress(0);
    }
  }, [bootError, phase]);

  function beginUplink() {
    if (phase === "connecting" || phase === "ready") return;
    setPhase("connecting");
    setProgress(0);
    setLogLines([]);

    const steps: { pct: number; msg: string }[] = [
      { pct: 8, msg: "INIT // SECURE CHANNEL REQUEST" },
      { pct: 20, msg: "HANDSHAKE // NODE 42-AXIOM" },
      { pct: 34, msg: "KEY EXCHANGE // ECDH-R5" },
      { pct: 48, msg: "AUTH // OPERATIVE TOKEN VERIFIED" },
      { pct: 62, msg: "SYNC // ORBITAL TELEMETRY" },
      { pct: 76, msg: "SYNC // FACTION STATE VECTOR" },
      { pct: 88, msg: "SYNC // MISSION QUEUE" },
      { pct: 97, msg: "FINALIZE // COMMAND DECK LOCKED" },
      { pct: 100, msg: "UPLINK ESTABLISHED" },
    ];

    let i = 0;
    const tick = () => {
      if (i >= steps.length) return;
      const step = steps[i];
      setProgress(step.pct);
      setLogLines((prev) => [...prev, step.msg]);
      i++;
      if (i < steps.length) {
        timer = window.setTimeout(tick, 240 + Math.random() * 220);
      }
    };
    let timer = window.setTimeout(tick, 120);
  }

  function retry() {
    setPhase("idle");
    setProgress(0);
    setLogLines([]);
  }

  return (
    <div className="scanlines vignette relative flex h-full w-full items-center justify-center overflow-hidden bg-black">
      {/* engineering grids */}
      <div className="grid-overlay--major absolute inset-0 opacity-50" />
      <div className="grid-overlay absolute inset-0 opacity-40" />

      {/* slow drifting radial spotlight */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        initial={{ opacity: 0.4 }}
        animate={{ opacity: [0.35, 0.6, 0.35] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 45%, oklch(1 0 0 / 0.08), transparent 70%)",
        }}
      />

      {/* corner HUD readouts */}
      <CornerReadouts phase={phase} progress={progress} />

      {/* center stack */}
      <div className="relative z-10 flex w-full max-w-xl flex-col items-center px-6">
        <AnimatePresence mode="wait">
          {/* ---- IDLE / CONNECTING / FAILED: emblem + log + button ---- */}
          {(phase === "idle" || phase === "connecting" || phase === "failed") && (
            <motion.div
              key="gate"
              className="flex w-full flex-col items-center"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            >
              {/* emblem */}
              <div className="brackets relative mb-7">
                <motion.div
                  className="flex h-24 w-24 items-center justify-center border border-white/45 text-5xl font-bold tracking-tight text-white text-glow"
                  animate={{ opacity: [1, 0.55, 1, 0.8, 1] }}
                  transition={{ duration: 5, repeat: Infinity, ease: "linear" }}
                >
                  42
                </motion.div>
                {/* sonar pulse rings while connecting */}
                {phase === "connecting" && (
                  <>
                    <span className="pulse-ring pointer-events-none absolute inset-0 border border-white/40" />
                    <span
                      className="pulse-ring pointer-events-none absolute inset-0 border border-white/30"
                      style={{ animationDelay: "1.2s" }}
                    />
                  </>
                )}
              </div>

              {/* title */}
              <div className="mb-1 font-mono text-[20px] font-bold tracking-mega text-white text-glow">
                COMMAND DECK
              </div>
              <div className="mb-8 font-mono text-[11px] tracking-mega text-white/45">
                {"// CLASSIFIED · OPERATIVE ACCESS ONLY"}
              </div>

              {/* diagnostics log (appears once connecting) */}
              <div className="mb-7 h-28 w-full max-w-md overflow-hidden border border-white/12 bg-white/[0.02] px-4 py-2.5 font-mono text-[10px] tracking-wide-2 text-white/65">
                <AnimatePresence initial={false}>
                  {logLines.length === 0 && (
                    <motion.div
                      key="hint"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="text-white/35"
                    >
                      <span className="blink">█</span> STANDBY FOR OPERATIVE AUTHENTICATION
                    </motion.div>
                  )}
                  {logLines.map((line, idx) => {
                    const isFinal = idx === logLines.length - 1;
                    return (
                      <motion.div
                        key={`${idx}-${line}`}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        className={cn(
                          "flex items-center gap-2 leading-relaxed",
                          isFinal && phase === "connecting" && "text-white",
                          line.startsWith("UPLINK") && "text-white text-glow",
                        )}
                      >
                        <span className="text-white/35">▸</span>
                        <span>{line}</span>
                        {isFinal && phase === "connecting" && (
                          <span className="blink text-white">█</span>
                        )}
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>

              {/* progress bar (connecting) */}
              <AnimatePresence>
                {phase === "connecting" && (
                  <motion.div
                    className="mb-7 w-full max-w-md"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                  >
                    <div className="mb-1.5 flex items-center justify-between font-mono text-[9px] tracking-wide-2 text-white/45">
                      <span>UPLINK NEGOTIATION</span>
                      <span className="tabular-nums text-white/70">
                        {progress.toString().padStart(3, "0")}%
                      </span>
                    </div>
                    <div className="h-1 w-full overflow-hidden bg-white/10">
                      <motion.div
                        className="h-full bg-white"
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.3, ease: "easeOut" }}
                        style={{ boxShadow: "0 0 10px oklch(1 0 0 / 0.7)" }}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* action button */}
              {phase === "idle" && (
                <motion.button
                  onClick={beginUplink}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="brackets group relative flex items-center gap-3 border border-white/50 bg-white/[0.03] px-8 py-3.5 font-mono text-[13px] font-bold tracking-mega text-white text-glow transition-colors hover:bg-white/[0.08]"
                >
                  <span className="h-2 w-2 bg-white shadow-[0_0_10px_oklch(1_0_0/0.9)]" />
                  ESTABLISH UPLINK
                  <span className="text-white/50 transition-transform group-hover:translate-x-1">→</span>
                </motion.button>
              )}

              {phase === "connecting" && (
                <div className="flex items-center gap-3 font-mono text-[12px] tracking-mega text-white/70">
                  <span className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="h-2 w-2 bg-white/80"
                        style={{ animation: `blink 1s steps(1) infinite`, animationDelay: `${i * 0.18}s` }}
                      />
                    ))}
                  </span>
                  NEGOTIATING SECURE LINK…
                </div>
              )}

              {phase === "failed" && (
                <div className="flex flex-col items-center gap-4">
                  <div className="font-mono text-[12px] tracking-mega text-white">
                    {"// UPLINK FAILED · NODE UNREACHABLE"}
                  </div>
                  <motion.button
                    onClick={retry}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="brackets flex items-center gap-3 border border-white/50 bg-white/[0.03] px-7 py-3 font-mono text-[12px] font-bold tracking-mega text-white transition-colors hover:bg-white/[0.08]"
                  >
                    ↻ RETRY UPLINK
                  </motion.button>
                </div>
              )}
            </motion.div>
          )}

          {/* ---- READY: brief "UPLINK ESTABLISHED" flash ---- */}
          {phase === "ready" && (
            <motion.div
              key="ready"
              className="flex flex-col items-center"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.04 }}
              transition={{ duration: 0.4 }}
            >
              <div className="brackets mb-5 flex h-24 w-24 items-center justify-center border border-white/70 text-5xl font-bold tracking-tight text-white text-glow">
                42
              </div>
              <motion.div
                className="font-mono text-[18px] font-bold tracking-mega text-white text-glow"
                animate={{ opacity: [0.6, 1, 0.6] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              >
                UPLINK ESTABLISHED
              </motion.div>
              <div className="mt-2 font-mono text-[10px] tracking-mega text-white/45">
                ENTERING COMMAND DECK…
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* footer directive */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 font-mono text-[9px] tracking-mega text-white/30">
        42 // ORBITAL COMMAND NETWORK · AUTHORIZED PERSONNEL ONLY
      </div>
    </div>
  );
}

function CornerReadouts({ phase, progress }: { phase: GatePhase; progress: number }) {
  const stamp = React.useMemo(() => {
    const d = new Date();
    return `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${String(d.getUTCDate()).padStart(2, "0")} · ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC`;
  }, []);

  return (
    <>
      <div className="pointer-events-none absolute left-4 top-4 font-mono text-[9px] tracking-mega text-white/35">
        ◤ NODE 42 · ORBITAL UPLINK
      </div>
      <div className="pointer-events-none absolute right-4 top-4 font-mono text-[9px] tracking-mega text-white/35">
        {stamp}
      </div>
      <div className="pointer-events-none absolute bottom-4 left-4 font-mono text-[9px] tracking-mega text-white/35">
        ◣ CHANNEL: ENC-AES256
      </div>
      <div className="pointer-events-none absolute bottom-4 right-4 font-mono text-[9px] tracking-mega text-white/35">
        STATUS:{" "}
        <span className={cn(phase === "connecting" && "text-white", phase === "ready" && "text-white text-glow")}>
          {phase === "idle" ? "STANDBY" : phase === "connecting" ? `LINK ${progress}%` : phase === "ready" ? "ONLINE" : "ERROR"}
        </span>
      </div>
    </>
  );
}
