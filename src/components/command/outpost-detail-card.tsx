"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useCommand } from "@/stores/command";
import { fmtUptime, FACTION_MARK_GLYPH, outpostNumber, outpostNumberStr } from "@/lib/format";
import {
  MISSION_META,
  NETWORK_CURRENCY,
  FACTION_TOKEN,
  type Outpost,
  type FactionId,
  type OutpostBrief,
  type OutpostBriefPriority,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { useSfx } from "@/hooks/use-sfx";
import { Crosshair, Zap, Eye, Shield, Satellite, Hammer, X, Radio, Loader2 } from "lucide-react";
import { FACTION_LOGO } from "@/lib/factions";

/**
 * Priority → badge styling (monochrome intensity).
 */
const PRIORITY_STYLE: Record<OutpostBriefPriority, string> = {
  LOW: "text-white/50 border-white/15",
  MEDIUM: "text-white/75 border-white/30",
  HIGH: "text-white border-white/60",
  CRITICAL: "text-white border-white/80 blink",
};

/**
 * OutpostDetailCard — free-floating quick-view card shown when any outpost
 * is clicked on the globe. Rich detail panel matching the command-deck
 * aesthetic: node identity, hull integrity, metrics grid, and contextual
 * action buttons (reinforce/defend/recon/upgrade for own outposts;
 * strike/cyber/espionage for rival outposts).
 *
 * Close behaviors:
 *   • click the SAME outpost again → toggle close (handled by parent's
 *     handleOutpostSelect: id === selectedId → select(null))
 *   • click ANOTHER outpost → swap (parent sets new selectedId)
 *   • click EMPTY ocean on the map → close (map's general click handler)
 *   • click ANYWHERE outside the card (nav, panels, bars, body) → close
 *     (this component's pointerdown listener)
 *   • click inside the card → no-op (listener skips card subtree)
 *   • click on the map canvas → no-op here (map handles its own close logic
 *     above; skipping prevents a race with outpost-mark selection)
 *
 * Positioned as an overlay in the map area (bottom-right). Free-floating
 * with a subtle backdrop-blur — no heavy container chrome.
 *
 * "REQUEST PRIORITY BRIEFING" — bottom section. Click → fetches a short
 * AI per-outpost brief (own = unit readiness, rival = intel snapshot)
 * from /api/ai/outpost-briefing. Denominated in VOTC + faction token.
 */
export function OutpostDetailCard({
  outpost,
  onClose,
}: {
  outpost: Outpost | null;
  onClose: () => void;
}) {
  const cardRef = React.useRef<HTMLDivElement>(null);

  // ---- click-outside-to-close ----
  // Listens for pointerdown anywhere on the document. Closes the card UNLESS
  // the click is (a) inside the card itself, or (b) inside the MapLibre map
  // canvas — the map handles its own close semantics (outpost toggle/swap,
  // empty-ocean close) and we must not race it.
  React.useEffect(() => {
    if (!outpost) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      // inside the card → keep open
      if (cardRef.current?.contains(target)) return;
      // inside the map canvas → let the map decide (toggle/swap/empty-close)
      const mapEl = document.querySelector(".maplibregl-map");
      if (mapEl?.contains(target)) return;
      // anywhere else outside → close
      onClose();
    };
    // capture phase so we evaluate before bubble handlers can stopPropagation
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [outpost, onClose]);

  return (
    <AnimatePresence>
      {outpost && (
        <motion.div
          ref={cardRef}
          initial={{ opacity: 0, y: 12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="pointer-events-auto absolute bottom-4 right-4 z-40 flex max-h-[calc(100%-2rem)] w-80 flex-col border border-white/20 bg-black/85 backdrop-blur-md"
          role="dialog"
          aria-label={`Outpost ${outpostNumber(outpost.faction)} details`}
        >
          {/* ── node identity ─────────────────────────────────────────── */}
          <div className="flex items-start gap-3 border-b border-white/10 px-4 py-3">
            <img
              src={FACTION_LOGO[outpost.faction]}
              alt={`${outpost.faction} insignia`}
              className="h-12 w-12 shrink-0 border border-white/30 object-cover"
              style={{ filter: "grayscale(1) contrast(1.3) brightness(1.1)" }}
            />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="font-mono text-[9px] tracking-mega text-white/45">
                <span className="text-white/65">{FACTION_MARK_GLYPH[outpost.faction]}</span>{" "}
                {outpost.faction} · {outpost.type === "FULL" ? "FULL NODE" : "TACTICAL NODE"}
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-[22px] font-bold tracking-mega text-white text-glow">
                  {outpostNumberStr(outpost.faction)}
                </span>
                <span className="font-mono text-[10px] tracking-wide-2 text-white/40">OUTPOST</span>
              </div>
              <div className="font-mono text-[12px] font-bold tracking-wide text-white">
                {outpost.name.toUpperCase()}
              </div>
              <div className="font-mono text-[9px] tracking-wide-2 text-white/40">
                {outpost.lat.toFixed(2)}°, {outpost.lng.toFixed(2)}° · LV {outpost.level}
              </div>
              {/* faction token indicator — each faction mints its own token
                  (HAMMER | FANG | RESOLUTE); VOTC is the network currency */}
              <div className="mt-1 flex items-center gap-2 font-mono text-[9px] tracking-wide-2 text-white/45">
                <span className="text-white/70">{FACTION_TOKEN[outpost.faction]}</span>
                <span className="text-white/25">TOKEN</span>
                <span className="text-white/20">·</span>
                <span>{NETWORK_CURRENCY} NETWORK</span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <button
                onClick={onClose}
                className="flex h-6 w-6 items-center justify-center border border-white/20 text-white/60 transition-colors hover:border-white/60 hover:text-white"
                aria-label="Close detail card"
              >
                <X size={12} strokeWidth={1.5} />
              </button>
              <StatusBadge status={outpost.status} />
            </div>
          </div>

          {/* ── scrollable body ───────────────────────────────────────── */}
          <div className="thin-scroll overflow-y-auto">
            {/* hull integrity */}
            <div className="border-b border-white/8 px-4 py-3">
              <div className="flex justify-between font-mono text-[9px] tracking-wide-2 text-white/45">
                <span>HULL INTEGRITY</span>
                <span className="text-white/75">
                  {Math.round(outpost.health)}/{outpost.maxHealth}
                </span>
              </div>
              <div className="mt-1.5 h-2 w-full bg-white/8">
                <div
                  className={cn(
                    "h-full transition-all",
                    outpost.health / outpost.maxHealth > 0.5
                      ? "bg-white/75"
                      : outpost.health / outpost.maxHealth > 0.2
                        ? "bg-white/55"
                        : "bg-white blink",
                  )}
                  style={{ width: `${Math.max(0, (outpost.health / outpost.maxHealth) * 100)}%` }}
                />
              </div>
            </div>

            {/* metrics grid */}
            <div className="grid grid-cols-2 gap-px border-b border-white/8 bg-white/8">
              <Metric k="COMPUTE" v={`${outpost.compute}`} unit="TF" />
              <Metric k="UPTIME" v={fmtUptime(outpost.uptime * 1000)} />
              <Metric k="BUILD PTS" v={`${Math.floor(outpost.buildPoints)}`} />
              <Metric k="ESTABLISHED" v={fmtUptime(Date.now() - outpost.establishedAt)} />
            </div>

            {/* actions */}
            <ActionList outpost={outpost} />
          </div>

          {/* ── REQUEST PRIORITY BRIEFING (bottom section) ──────────────
              Click → fetches a short AI per-outpost brief. Own outpost =
              unit readiness; rival = intel snapshot. Denominated in VOTC
              + the outpost's faction token. Stays pinned at the bottom,
              outside the scroll area, so it's always reachable. */}
          <PriorityBriefing outpost={outpost} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── action list ──────────────────────────────────────────────────────────

function ActionList({ outpost }: { outpost: Outpost }) {
  const state = useCommand((s) => s.state);
  const sendAction = useCommand((s) => s.sendAction);
  const setPending = useCommand((s) => s.setPendingMission);

  if (!state) return null;
  const isMine = outpost.faction === state.operative.faction;
  const upgradeCost = 50 + outpost.level * 25;
  const buildCost = 40 + outpost.level * 20;

  return (
    <div className="space-y-2 p-4">
      {isMine ? (
        <>
          <ActionBtn
            icon={Hammer}
            label="REINFORCE (BUILD)"
            meta={`+LV · ${buildCost} BP`}
            disabled={outpost.buildPoints < buildCost}
            onClick={() =>
              sendAction({ kind: "launch-mission", missionType: "BUILD", sourceId: outpost.id, targetId: outpost.id })
            }
          />
          <ActionBtn
            icon={Shield}
            label="RAISE SHIELDS (DEFEND)"
            meta="+HULL · FREE"
            onClick={() =>
              sendAction({ kind: "launch-mission", missionType: "DEFEND", sourceId: outpost.id, targetId: outpost.id })
            }
          />
          <ActionBtn
            icon={Satellite}
            label="ORBITAL RECON"
            meta="+BP · FREE"
            onClick={() =>
              sendAction({ kind: "launch-mission", missionType: "RECON", sourceId: outpost.id, targetId: outpost.id })
            }
          />
          <ActionBtn
            icon={Hammer}
            label={`UPGRADE TO LV ${outpost.level + 1}`}
            meta={`${upgradeCost} BP`}
            disabled={outpost.buildPoints < upgradeCost}
            onClick={() => sendAction({ kind: "upgrade-outpost", id: outpost.id })}
          />
        </>
      ) : (
        <>
          <ActionBtn
            icon={Crosshair}
            label="LAUNCH DRONE STRIKE"
            meta={`${MISSION_META.DRONE_STRIKE.duration}s`}
            onClick={() => setPending({ type: "DRONE_STRIKE", sourceId: null })}
          />
          <ActionBtn
            icon={Zap}
            label="CYBER ATTACK"
            meta={`${MISSION_META.CYBER_ATTACK.duration}s`}
            onClick={() => setPending({ type: "CYBER_ATTACK", sourceId: null })}
          />
          <ActionBtn
            icon={Eye}
            label="ESPIONAGE"
            meta={`${MISSION_META.ESPIONAGE.duration}s`}
            onClick={() => setPending({ type: "ESPIONAGE", sourceId: null })}
          />
        </>
      )}
    </div>
  );
}

// ── priority briefing section (bottom, pinned) ───────────────────────────

function PriorityBriefing({ outpost }: { outpost: Outpost }) {
  const state = useCommand((s) => s.state);
  const sfx = useSfx();
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [brief, setBrief] = React.useState<OutpostBrief | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // reset whenever the outpost changes (switching outposts in the card)
  React.useEffect(() => {
    setOpen(false);
    setBrief(null);
    setError(null);
    setLoading(false);
  }, [outpost.id]);

  async function handleRequest() {
    if (!state) return;
    if (loading) return;
    sfx.play("key");
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/outpost-briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outpost,
          operativeFaction: state.operative.faction,
          sol: state.sol,
          threatLevel: state.threatLevel,
        }),
      });
      if (!res.ok) throw new Error(`briefing ${res.status}`);
      const b = (await res.json()) as OutpostBrief;
      setBrief(b);
      sfx.play("confirm");
    } catch {
      setError("UPLINK FAILED — RETRY");
      sfx.play("deny");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border-t border-white/15">
      {/* trigger row */}
      <button
        onClick={handleRequest}
        disabled={loading}
        className={cn(
          "flex w-full items-center justify-between gap-2 px-4 py-2.5 font-mono text-[11px] font-bold tracking-wide-2 text-white transition-colors hover:bg-white/10 disabled:cursor-wait disabled:opacity-60",
          !open && "border-t-0",
        )}
        aria-expanded={open}
        aria-controls="outpost-brief-body"
      >
        <span className="flex items-center gap-2">
          {loading ? (
            <Loader2 size={13} strokeWidth={1.5} className="animate-spin" />
          ) : (
            <Radio size={13} strokeWidth={1.5} className={open ? "text-white" : "text-white/70"} />
          )}
          {brief ? "PRIORITY BRIEFING" : "REQUEST PRIORITY BRIEFING"}
        </span>
        <span className="text-[9px] text-white/45">
          {loading ? "TRANSMITTING…" : open ? "▲" : "▼"}
        </span>
      </button>

      {/* brief body — appears below the trigger when open */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id="outpost-brief-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="space-y-2.5 px-4 py-3 font-mono text-[10px] leading-relaxed tracking-wide text-white/75">
              {loading && !brief && !error && (
                <div className="flex items-center gap-2 text-white/55">
                  <Loader2 size={11} strokeWidth={1.5} className="animate-spin" />
                  <span className="tracking-wide-2">DECRYPTING SIGNAL…</span>
                </div>
              )}
              {error && (
                <div className="text-white blink tracking-wide-2">{error}</div>
              )}
              {brief && (
                <>
                  <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
                    <span className="text-[9px] tracking-mega text-white/40">
                      {outpost.faction === state?.operative.faction
                        ? "UNIT READINESS · " + FACTION_TOKEN[outpost.faction]
                        : "INTEL SNAPSHOT · " + FACTION_TOKEN[outpost.faction]}
                    </span>
                    <span
                      className={cn(
                        "border px-1.5 py-0.5 text-[8px] tracking-wide-2",
                        PRIORITY_STYLE[brief.priority],
                      )}
                    >
                      {brief.priority}
                    </span>
                  </div>
                  <p className="text-white/85">{brief.assessment}</p>
                  <p className="text-white/65">
                    <span className="text-white/40">REC → </span>
                    {brief.recommendation}
                  </p>
                  <div className="flex items-center justify-between border-t border-white/10 pt-1.5 text-[9px] tracking-wide-2 text-white/45">
                    <span>
                      <span className="text-white/30">AT STAKE · </span>
                      <span className="text-white/75 tabular-nums">
                        {brief.votcAtStake.toLocaleString()} {NETWORK_CURRENCY}
                      </span>
                    </span>
                    <span>
                      <span className="text-white/30">CONF · </span>
                      <span className="text-white/75 tabular-nums">{brief.confidence}%</span>
                    </span>
                  </div>
                  <button
                    onClick={handleRequest}
                    disabled={loading}
                    className="mt-1 w-full border border-white/15 bg-white/3 px-2 py-1.5 text-center text-[9px] tracking-wide-2 text-white/70 transition-colors hover:border-white/40 hover:text-white disabled:opacity-50"
                  >
                    {loading ? "RE-QUERYING…" : "↻ REFRESH BRIEFING"}
                  </button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── sub-components ───────────────────────────────────────────────────────

function Metric({ k, v, unit }: { k: string; v: string; unit?: string }) {
  return (
    <div className="bg-black/60 px-4 py-2.5">
      <div className="font-mono text-[9px] tracking-wide-2 text-white/40">{k}</div>
      <div className="font-mono text-[14px] font-bold tabular-nums text-white">
        {v} {unit && <span className="text-[9px] text-white/40">{unit}</span>}
      </div>
    </div>
  );
}

function ActionBtn({
  icon: Icon,
  label,
  meta,
  onClick,
  disabled,
}: {
  icon: React.ElementType;
  label: string;
  meta: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center justify-between border border-white/12 bg-white/3 px-3 py-2 font-mono text-[11px] tracking-wide-2 text-white transition-colors hover:border-white/40 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
    >
      <span className="flex items-center gap-2">
        <Icon size={13} strokeWidth={1.5} /> {label}
      </span>
      <span className="text-[9px] text-white/45">{meta}</span>
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ONLINE: "text-white/70 border-white/25",
    DEGRADED: "text-white border-white/50",
    UNDER_ATTACK: "text-white border-white/70 blink",
    OFFLINE: "text-white/30 border-white/10",
  };
  return (
    <span className={cn("border px-2 py-0.5 font-mono text-[9px] tracking-wide-2 whitespace-nowrap", map[status] ?? map.ONLINE)}>
      {status.replace("_", " ")}
    </span>
  );
}
