"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useCommand } from "@/stores/command";
import { fmtUptime, FACTION_MARK_GLYPH, outpostNumber, outpostNumberStr } from "@/lib/format";
import {
  MISSION_META,
  NETWORK_CURRENCY,
  FACTION_TOKEN,
  type Garrison,
  type FactionId,
  type GarrisonBrief,
  type GarrisonBriefPriority,
  type CurrencyId,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { useSfx } from "@/hooks/use-sfx";
import { Crosshair, Zap, Eye, Shield, Satellite, Hammer, X, Radio, Loader2 } from "lucide-react";
import { FACTION_LOGO } from "@/lib/factions";
import {
  pickBestSource,
  missionCostLabel,
  missionCostCurrency,
  canAfford,
  currencySymbol,
} from "@/lib/strike-plan";

/**
 * Priority → badge styling (monochrome intensity).
 */
const PRIORITY_STYLE: Record<GarrisonBriefPriority, string> = {
  LOW: "text-white/50 border-white/15",
  MEDIUM: "text-white/75 border-white/30",
  HIGH: "text-white border-white/60",
  CRITICAL: "text-white border-white/80 blink",
};

/**
 * GarrisonDetailCard — free-floating quick-view card shown when any garrison
 * is clicked on the globe. Rich detail panel matching the command-deck
 * aesthetic: node identity, hull integrity, metrics grid, and contextual
 * action buttons (reinforce/defend/recon/upgrade for own garrisons;
 * strike/cyber/espionage for rival garrisons).
 *
 * Close behaviors (PERSISTENT PANEL — no document pointerdown listener):
 *   • click the X button → explicit close
 *   • press ESC → close (handled by command-deck.tsx keydown effect)
 *   • click the SAME garrison again → toggle close (parent's
 *     handleGarrisonSelect: id === selectedId → select(null))
 *   • click ANOTHER garrison → swap (parent sets new selectedId)
 *   • click EMPTY ocean on the map → close (map's general click handler)
 *   • click on nav rail / header / status bar / left panel → NO-OP
 *     (the card stays open; no document-level listener to interfere)
 *
 * Positioned as a floating overlay on the LEFT side, next to the nav rail
 * hot-key icons (left-14 top-20), so it never sits behind them.
 * Responsive: full-width on mobile, fixed 320px on sm+.
 *
 * "REQUEST PRIORITY BRIEFING" — bottom section. Click → fetches a short
 * AI per-garrison brief (own = unit readiness, rival = intel snapshot)
 * from /api/ai/outpost-briefing. Denominated in VOTC + faction token.
 */
export function GarrisonDetailCard({
  garrison,
  onClose,
}: {
  garrison: Garrison | null;
  onClose: () => void;
}) {
  // NOTE: No document-level pointerdown listener.
  // The card is a PERSISTENT panel — it only closes via the X button,
  // ESC key (command-deck.tsx), or map click (toggle/swap/empty-ocean).
  // This prevents the "click anywhere and it disappears" bug that occurred
  // when clicking on nav rail icons, the header, or the status bar.
  const cardRef = React.useRef<HTMLDivElement>(null);

  return (
    <AnimatePresence>
      {garrison && (
        <motion.div
          ref={cardRef}
          initial={{ opacity: 0, y: 12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          data-garrison-detail-card
          className="hud-card hud-corners pointer-events-auto absolute left-14 top-20 z-50 flex max-h-[calc(100vh-8rem)] w-[calc(100vw-4rem)] max-w-80 flex-col sm:left-16 sm:w-80"
          role="dialog"
          aria-label={`Outpost ${outpostNumber(garrison.faction)} details`}
        >
          {/* ── node identity ─────────────────────────────────────────── */}
          <div className="flex items-start gap-3 border-b border-white/10 px-4 py-3">
            <img
              src={FACTION_LOGO[garrison.faction]}
              alt={`${garrison.faction} insignia`}
              className="h-12 w-12 shrink-0 border border-white/30 object-cover"
              style={{ filter: "grayscale(1) contrast(1.3) brightness(1.1)" }}
            />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="font-mono text-[9px] tracking-mega text-white/45">
                <span className="text-white/65">{FACTION_MARK_GLYPH[garrison.faction]}</span>{" "}
                {garrison.faction} · {garrison.type === "Safehouse" ? "SAFEHOUSE" : "TACTICAL SAFEHOUSE"}
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-[22px] font-bold tracking-mega text-white text-glow">
                  {outpostNumberStr(garrison.faction)}
                </span>
                <span className="font-mono text-[10px] tracking-wide-2 text-white/40">OUTPOST</span>
              </div>
              <div className="font-mono text-[12px] font-bold tracking-wide text-white">
                {garrison.name.toUpperCase()}
              </div>
              <div className="flex items-center gap-2 font-mono text-[9px] tracking-wide-2 text-white/40">
                <span>{garrison.lat.toFixed(2)}°, {garrison.lng.toFixed(2)}°</span>
                <span className="flex items-center gap-1" title={`Level ${garrison.level}`}>
                  {[1, 2, 3].map((n) => (
                    <span key={n} className={cn("lvl-pip", garrison.level >= n && "lvl-pip--on")} />
                  ))}
                </span>
              </div>
              {/* faction token indicator — each faction mints its own token
                  (HAMMER | FANG | RESOLUTE); VOTC is the network currency */}
              <div className="mt-1 flex items-center gap-2 font-mono text-[9px] tracking-wide-2 text-white/45">
                <span className="text-white/70">{FACTION_TOKEN[garrison.faction]}</span>
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
              <StatusBadge status={garrison.status} />
            </div>
          </div>

          {/* ── scrollable body ───────────────────────────────────────── */}
          <div className="thin-scroll overflow-y-auto">
            {/* hull integrity */}
            <div className="border-b border-white/8 px-4 py-3">
              <div className="flex justify-between font-mono text-[9px] tracking-wide-2 text-white/45">
                <span>HULL INTEGRITY</span>
                <span className="text-white/75">
                  {Math.round(garrison.health)}/{garrison.maxHealth}
                </span>
              </div>
              <div className="seg-track mt-1.5 h-2">
                <div
                  className={cn(
                    "seg-fill",
                    garrison.health / garrison.maxHealth <= 0.5 && "seg-fill--dim",
                    garrison.health / garrison.maxHealth <= 0.2 && "blink",
                  )}
                  style={{ width: `${Math.max(0, (garrison.health / garrison.maxHealth) * 100)}%` }}
                />
              </div>
            </div>

            {/* metrics grid */}
            <div className="grid grid-cols-2 gap-px border-b border-white/8 bg-white/8">
              <Metric k="COMPUTE" v={`${garrison.compute}`} unit="TF" />
              <Metric k="UPTIME" v={fmtUptime(garrison.uptime * 1000)} />
              <Metric k="BUILD PTS" v={`${Math.floor(garrison.buildPoints)}`} />
              <Metric k="ESTABLISHED" v={fmtUptime(Date.now() - garrison.establishedAt)} />
            </div>

            {/* actions */}
            <ActionList garrison={garrison} />
          </div>

          {/* ── REQUEST PRIORITY BRIEFING (bottom section) ──────────────
              Click → fetches a short AI per-garrison brief. Own garrison =
              unit readiness; rival = intel snapshot. Denominated in VOTC
              + the garrison's faction token. Stays pinned at the bottom,
              outside the scroll area, so it's always reachable. */}
          <PriorityBriefing garrison={garrison} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── action list ──────────────────────────────────────────────────────────

function ActionList({ garrison }: { garrison: Garrison }) {
  const state = useCommand((s) => s.state);
  const sendAction = useCommand((s) => s.sendAction);
  const setPending = useCommand((s) => s.setPendingMission);

  if (!state) return null;
  const isMine = garrison.faction === state.operative.faction;
  const myFaction = state.operative.faction;
  const upgradeCost = 50 + garrison.level * 25;

  // ── Rival garrison: confirm buttons with cost + auto-source-pick ──────
  // Each attack auto-picks the closest eligible own garrison and commits
  // immediately — no source-picker dance. Shows currency-aware cost
  // (target faction token) and disables with a warning if unaffordable
  // or no eligible source exists.
  if (!isMine) {
    const source = pickBestSource(state, garrison.id);
    const hasSource = source !== null;
    const attackTypes: { type: "DRONE_STRIKE" | "CYBER_ATTACK" | "ESPIONAGE"; icon: typeof Crosshair }[] = [
      { type: "DRONE_STRIKE", icon: Crosshair },
      { type: "CYBER_ATTACK", icon: Zap },
      { type: "ESPIONAGE", icon: Eye },
    ];
    // The currency all three attacks cost = target faction's token.
    const tgtCurrency: CurrencyId = garrison.faction;
    const tgtBalance = state.operative.wallet[tgtCurrency];

    return (
      <div className="space-y-2 p-4">
        {/* WalletStrip — shows the target faction token balance */}
        <div className="flex items-center justify-between border border-white/15 px-2 py-1 font-mono text-[9px] tracking-wide-2 text-white/60">
          <span className="text-white/40">{garrison.faction} TOKEN</span>
          <span>
            {Math.floor(tgtBalance)} <span className="text-white/55">{currencySymbol(tgtCurrency)}</span>
          </span>
        </div>
        {attackTypes.map(({ type, icon: Icon }) => {
          const meta = MISSION_META[type];
          const costLabel = missionCostLabel(type, myFaction, garrison);
          const affordable = canAfford(state, type, garrison);
          const canStrike = affordable && hasSource;
          return (
            <button
              key={type}
              disabled={!canStrike}
              onClick={() => {
                if (!source) return;
                sendAction({
                  kind: "launch-mission",
                  missionType: type,
                  sourceId: source.id,
                  targetId: garrison.id,
                });
              }}
              className={cn(
                "weapon-card flex w-full items-center justify-between border px-3 py-2 font-mono text-[10px] font-bold tracking-wide-2 transition-colors",
                canStrike
                  ? "border-white/40 text-white hover:bg-white hover:text-black"
                  : "cursor-not-allowed border-white/10 text-white/30"
              )}
            >
              <div className="flex items-center gap-2">
                <Icon size={12} strokeWidth={1.5} />
                <span>CONFIRM {meta.label}</span>
              </div>
              <span className="text-white/60">
                {costLabel} · {meta.duration}s
              </span>
            </button>
          );
        })}
        {!hasSource && (
          <div className="font-mono text-[9px] leading-snug text-white/35 blink">
            ⚠ NO ELIGIBLE SOURCE GARRISON — DEPLOY MORE NODES
          </div>
        )}
        {hasSource && tgtBalance < MISSION_META.DRONE_STRIKE.cost && (
          <div className="font-mono text-[9px] leading-snug text-white/35 blink">
            ⚠ INSUFFICIENT {currencySymbol(tgtCurrency)} — EARN MORE VIA COMBAT
          </div>
        )}
        {hasSource && (
          <div className="font-mono text-[9px] text-white/30">
            AUTO-SOURCE: {source!.name}
          </div>
        )}
      </div>
    );
  }

  // ── Own garrison: reinforce/defend/recon/upgrade ─────────────────────
  // BUILD costs VOTC (universal currency). DEFEND costs your faction token.
  // RECON costs your faction token. UPGRADE uses garrison-local buildPoints.
  const buildCost = MISSION_META.BUILD.cost; // VOTC
  const defendCost = MISSION_META.DEFEND.cost; // own faction token
  const reconCost = MISSION_META.RECON.cost; // own faction token
  const votcBalance = state.operative.wallet.VOTC;
  const ownTokenBalance = state.operative.wallet[myFaction];
  const canBuild = votcBalance >= buildCost;
  const canDefend = ownTokenBalance >= defendCost;
  const canRecon = ownTokenBalance >= reconCost;
  const canUpgrade = garrison.buildPoints >= upgradeCost;

  return (
    <div className="space-y-2 p-4">
      {/* WalletStrip — VOTC + own faction token */}
      <div className="grid grid-cols-2 gap-1">
        <div className={cn(
          "flex items-center justify-between border px-2 py-1 font-mono text-[9px] tracking-wide-2",
          canBuild ? "border-white/15 text-white/60" : "border-white/8 text-white/30"
        )}>
          <span className="text-white/40">VOTC</span>
          <span>{Math.floor(votcBalance)}</span>
        </div>
        <div className={cn(
          "flex items-center justify-between border px-2 py-1 font-mono text-[9px] tracking-wide-2",
          canDefend || canRecon ? "border-white/15 text-white/60" : "border-white/8 text-white/30"
        )}>
          <span className="text-white/40">{currencySymbol(myFaction)}</span>
          <span>{Math.floor(ownTokenBalance)}</span>
        </div>
      </div>
      <ActionBtn
        icon={Hammer}
        label="REINFORCE (BUILD)"
        meta={`${buildCost} ${NETWORK_CURRENCY}`}
        disabled={!canBuild}
        onClick={() =>
          sendAction({ kind: "launch-mission", missionType: "BUILD", sourceId: garrison.id, targetId: garrison.id })
        }
      />
      <ActionBtn
        icon={Shield}
        label="RAISE SHIELDS (DEFEND)"
        meta={`${defendCost} ${currencySymbol(myFaction)}`}
        disabled={!canDefend}
        onClick={() =>
          sendAction({ kind: "launch-mission", missionType: "DEFEND", sourceId: garrison.id, targetId: garrison.id })
        }
      />
      <ActionBtn
        icon={Satellite}
        label="ORBITAL RECON"
        meta={`${reconCost} ${currencySymbol(myFaction)}`}
        disabled={!canRecon}
        onClick={() =>
          sendAction({ kind: "launch-mission", missionType: "RECON", sourceId: garrison.id, targetId: garrison.id })
        }
      />
      <ActionBtn
        icon={Hammer}
        label={`UPGRADE TO LV ${garrison.level + 1}`}
        meta={`${upgradeCost} BP`}
        disabled={!canUpgrade}
        onClick={() => sendAction({ kind: "upgrade-garrison", id: garrison.id })}
      />
    </div>
  );
}

// ── priority briefing section (bottom, pinned) ───────────────────────────

function PriorityBriefing({ garrison }: { garrison: Garrison }) {
  const state = useCommand((s) => s.state);
  const sfx = useSfx();
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [brief, setBrief] = React.useState<GarrisonBrief | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // reset whenever the garrison changes (switching garrisons in the card) —
  // "adjust state during render" pattern (avoids setState-in-effect cascades)
  const [prevGarrisonId, setPrevGarrisonId] = React.useState(garrison.id);
  if (prevGarrisonId !== garrison.id) {
    setPrevGarrisonId(garrison.id);
    setOpen(false);
    setBrief(null);
    setError(null);
    setLoading(false);
  }

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
          garrison,
          operativeFaction: state.operative.faction,
          sol: state.sol,
          threatLevel: state.threatLevel,
        }),
      });
      if (!res.ok) throw new Error(`briefing ${res.status}`);
      const b = (await res.json()) as GarrisonBrief;
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
        aria-controls="garrison-brief-body"
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
            id="garrison-brief-body"
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
                      {garrison.faction === state?.operative.faction
                        ? "UNIT READINESS · " + FACTION_TOKEN[garrison.faction]
                        : "INTEL SNAPSHOT · " + FACTION_TOKEN[garrison.faction]}
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
