"use client";

import * as React from "react";
import { useCommand } from "@/stores/command";
import type { NavView } from "./nav-rail";
import { cn } from "@/lib/utils";
import { FACTIONS, MISSION_META, type FactionId, type MissionType, type CurrencyId } from "@/lib/types";
import { fmtUptime, FACTION_MARK_GLYPH } from "@/lib/format";
import { Target, SatelliteDish, BrainCircuit, Rocket, ScanEye, ListChecks, Terminal, ArrowLeft, ChevronRight, Crosshair, Zap, Eye, Shield, Hammer, Satellite, AlertTriangle, Play } from "lucide-react";
import { pickBestSource, listIntelTargets, missionCostLabel, canAfford, currencySymbol } from "@/lib/strike-plan";

/* Severity → mono glyph + tone (kill-feed coding) */
const SEV_GLYPH: Record<string, string> = {
  INFO: "◇",
  WARN: "▲",
  CRITICAL: "◆",
  SUCCESS: "●",
};
const SEV_COLOR: Record<string, string> = {
  INFO: "text-white/45",
  WARN: "text-white/85",
  CRITICAL: "text-white text-glow",
  SUCCESS: "text-white/70",
};

/* Weapon-class tag per mission profile */
const WEAPON_CLASS: Record<MissionType, string> = {
  DRONE_STRIKE: "KINETIC",
  CYBER_ATTACK: "INTRUSION",
  ESPIONAGE: "COVERT",
  RECON: "SURVEY",
  BUILD: "LOGISTICS",
  DEFEND: "COUNTERMEASURE",
};

const VIEW_INDEX: Record<string, string> = {
  FEED: "02", STRIKE: "03", QUEUE: "04", AI: "05", INTEL: "06", DEPLOY: "07", CONFIG: "08",
};

export function LeftPanel({ view, onNav }: { view: NavView | null; onNav: (v: NavView) => void }) {
  const state = useCommand((s) => s.state);
  if (!state) return null;
  if (!view || view === "MAP") return null;
  return (
    <aside className="pointer-events-auto absolute bottom-11 left-16 top-[4.75rem] z-20 hidden w-[24rem] shrink-0 md:block">
      <div className="hud-card hud-corners flex h-full flex-col">
        <div className="hud-head">
          <span className="hud-head-index">{VIEW_INDEX[view] ?? "00"}</span>
          <span>{view}</span>
          <span className="ml-auto flex items-center gap-2 text-white/30">
            <span>SOL {state.sol.toString().padStart(4, "0")}</span>
            <span className="chip chip--dim !py-0">ESC</span>
          </span>
        </div>
        <div className="thin-scroll flex-1 overflow-y-auto">
          {view === "FEED" && <DiscoveryFeed />}
          {view === "INTEL" && <FactionIntel />}
          {view === "STRIKE" && <StrikeConsole onNav={onNav} />}
          {view === "QUEUE" && <MissionQueue />}
          {view === "AI" && <AIBriefingMini onNav={onNav} />}
          {view === "DEPLOY" && <DeployPanel />}
          {view === "CONFIG" && <ConfigPanel />}
        </div>
      </div>
    </aside>
  );
}

function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <span className="font-mono text-[9px] tracking-mega text-white/45">{children}</span>
      {right}
    </div>
  );
}

/* ── DISCOVERY FEED — kill-feed with severity glyphs ─────────────────────── */
function DiscoveryFeed() {
  const state = useCommand((s) => s.state)!;
  return (
    <div className="p-3">
      <SectionTitle
        right={<span className="flex items-center gap-1.5 font-mono text-[8px] tracking-wide-2 text-white/40"><span className="pip blink" style={{ width: 4, height: 4 }} /> LIVE</span>}
      >
        <span className="flex items-center gap-1.5"><SatelliteDish size={11} strokeWidth={1.5} /> SIGNAL INTERCEPTS</span>
      </SectionTitle>
      <div className="space-y-1.5">
        {state.events.map((e) => (
          <div
            key={e.id}
            className={cn(
              "feed-item-in border-l pl-2.5 pr-1 py-1",
              e.severity === "CRITICAL" ? "crit-flash border-white/70" : "border-white/15"
            )}
          >
            <div className="flex items-center gap-2">
              <span className={cn("font-mono text-[9px]", SEV_COLOR[e.severity])}>
                {SEV_GLYPH[e.severity] ?? "◇"}
              </span>
              <span className="font-mono text-[8px] tracking-wide-2 text-white/30 tabular-nums">
                {new Date(e.timestamp).toISOString().slice(11, 19)}
              </span>
              <span className={cn("font-mono text-[8px] tracking-wide-2", SEV_COLOR[e.severity] ?? "text-white/55")}>
                {e.severity}
              </span>
              {e.faction && (
                <span className="font-mono text-[8px] tracking-wide-2 text-white/35">{e.faction}</span>
              )}
            </div>
            <div className="mt-0.5 font-mono text-[10px] leading-snug text-white/80">{e.message}</div>
          </div>
        ))}
        {state.events.length === 0 && <Empty label="AWAITING SIGNAL" />}
      </div>
    </div>
  );
}

/* ── FACTION INTEL — dossier cards with mono pattern swatches ────────────── */
function FactionIntel() {
  const state = useCommand((s) => s.state)!;
  return (
    <div className="p-3">
      <SectionTitle>
        <span className="flex items-center gap-1.5"><ScanEye size={11} strokeWidth={1.5} /> FACTION DOSSIERS</span>
      </SectionTitle>
      <div className="space-y-2.5">
        {FACTIONS.map((f: FactionId) => {
          const fac = state.factions[f];
          const isMine = f === state.operative.faction;
          return (
            <div key={f} className={cn("hud-card p-2.5", isMine && "hud-card--lit")}>
              <div className="mb-1 flex items-center justify-between">
                <span className="flex items-center gap-2 font-mono text-[11px] font-bold tracking-wide-2 text-white">
                  <span className={`swatch swatch--${f}`} aria-hidden />
                  {fac.name}
                </span>
                {isMine && <span className="chip chip--solid !text-[7px]">YOURS</span>}
              </div>
              <div className="font-mono text-[9px] italic text-white/40">"{fac.motto}"</div>
              <div className="mt-2 space-y-1.5">
                <SegBar label="STRENGTH" v={fac.strength} />
                <SegBar label="THREAT" v={fac.threat} dim={!isMine} />
                <SegBar label="COMPUTE" v={Math.min(100, fac.compute / 4)} raw={`${fac.compute} TF`} dim={!isMine} />
              </div>
              <div className="mt-2 flex justify-between border-t border-white/8 pt-1.5 font-mono text-[8px] tracking-wide-2 text-white/40">
                <span>{fac.garrisons} GARRISONS</span>
                <span>{fac.territories} TERRITORIES</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SegBar({ label, v, raw, dim }: { label: string; v: number; raw?: string; dim?: boolean }) {
  return (
    <div>
      <div className="mb-0.5 flex items-center justify-between font-mono text-[8px] tracking-wide-2 text-white/40">
        <span>{label}</span>
        <span className="tabular-nums text-white/75">{raw ?? `${Math.round(v)}`}</span>
      </div>
      <div className="seg-track">
        <div className={cn("seg-fill", dim && "seg-fill--dim")} style={{ width: `${Math.max(2, Math.min(100, v))}%` }} />
      </div>
    </div>
  );
}

/* ── Wallet strip — currency balance readout ─────────────────────────────── */
function WalletStrip({ currency, balance }: { currency: CurrencyId; balance: number }) {
  const sym = currencySymbol(currency);
  const affordable = balance > 0;
  return (
    <div
      className={cn(
        "flex items-center justify-between border px-2 py-1 font-mono text-[9px] tracking-wide-2",
        affordable ? "border-white/20 text-white/75" : "border-white/10 text-white/30"
      )}
    >
      <span className="text-white/40">{sym} BALANCE</span>
      <span className="num-hero text-[10px] font-bold">{Math.floor(balance)}</span>
    </div>
  );
}

/* ── STRIKE CONSOLE — weapon-select cards + intel target list ────────────── */
function StrikeConsole({ onNav }: { onNav: (v: NavView) => void }) {
  const state = useCommand((s) => s.state)!;
  const pending = useCommand((s) => s.pendingMission);
  const setPending = useCommand((s) => s.setPendingMission);
  const sendAction = useCommand((s) => s.sendAction);
  const select = useCommand((s) => s.selectGarrison);

  const armedType = pending?.type ?? null;
  const ATTACK_TYPES: MissionType[] = ["DRONE_STRIKE", "CYBER_ATTACK", "ESPIONAGE"];
  const isAttackArmed = armedType && ATTACK_TYPES.includes(armedType);

  // ── STEP 2: intel target cards ──────────────────────────────────────────
  if (isAttackArmed) {
    const meta = MISSION_META[armedType!];
    const targets = listIntelTargets(state);
    const myFaction = state.operative.faction;

    return (
      <div className="flex h-full flex-col p-3">
        <SectionTitle right={<span className="chip">STEP 2 / 2</span>}>
          <span className="flex items-center gap-1.5"><Target size={11} strokeWidth={1.5} /> TARGET SELECTION</span>
        </SectionTitle>

        {/* armed mission banner + back */}
        <button
          onClick={() => setPending(null)}
          className="weapon-card mb-3 flex w-full items-center gap-2.5 border border-white/30 bg-white/6 px-2.5 py-2 text-left transition-colors hover:border-white/60 hover:bg-white/10"
        >
          <ArrowLeft size={12} strokeWidth={1.5} className="shrink-0 text-white/60" />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] font-bold tracking-wide-2 text-white text-glow">{meta.label}</span>
              <span className="chip chip--solid !text-[7px]">ARMED</span>
            </div>
            <div className="font-mono text-[8px] leading-snug text-white/45">{meta.desc}</div>
          </div>
        </button>

        {/* target faction token balances */}
        {targets.length > 0 && (
          <div className="mb-3 space-y-1">
            <div className="font-mono text-[8px] tracking-mega text-white/35">TARGET FACTION TOKENS</div>
            {FACTIONS.filter((f) => f !== myFaction).map((f) => (
              <WalletStrip key={f} currency={f} balance={state.operative.wallet[f]} />
            ))}
          </div>
        )}

        <div className="mb-2 font-mono text-[9px] tracking-mega text-white/45">
          INTEL TARGETS · <span className="text-white">{targets.length}</span> REVEALED
        </div>
        <div className="thin-scroll flex-1 space-y-2 overflow-y-auto">
          {targets.length === 0 && (
            <div className="border border-dashed border-white/15 p-4 text-center">
              <AlertTriangle size={16} strokeWidth={1.5} className="mx-auto mb-2 text-white/40" />
              <div className="font-mono text-[9px] leading-snug text-white/50">
                NO INTEL TARGETS REVEALED.<br />
                RUN ESPIONAGE ON A RIVAL GARRISON<br />
                TO ADD IT TO THE STRIKE LIST.
              </div>
              <button
                onClick={() => setPending({ type: "ESPIONAGE", sourceId: null })}
                className="mt-3 border border-white/30 px-3 py-1 font-mono text-[9px] tracking-wide-2 text-white/80 transition-colors hover:border-white/60 hover:text-white"
              >
                ARM ESPIONAGE
              </button>
            </div>
          )}
          {targets.map((tgt) => {
            const source = pickBestSource(state, tgt.id);
            const costLabel = missionCostLabel(armedType!, myFaction, tgt);
            const affordable = canAfford(state, armedType!, tgt);
            const hasSource = source !== null;
            const canStrike = affordable && hasSource;
            const hull = Math.round((tgt.health / tgt.maxHealth) * 100);
            return (
              <div
                key={tgt.id}
                className={cn(
                  "hud-card p-2.5 transition-colors",
                  canStrike ? "hover:hud-card--lit" : "opacity-55"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`swatch swatch--${tgt.faction}`} aria-hidden />
                    <span className="font-mono text-[10px] font-bold tracking-wide-2 text-white">{tgt.name}</span>
                    <span className="font-mono text-[8px] tracking-wide-2 text-white/40">{tgt.faction}</span>
                  </div>
                  <span className="font-mono text-[8px] tabular-nums text-white/45">LV{tgt.level}</span>
                </div>

                {/* hull integrity */}
                <div className="mt-1.5">
                  <div className="mb-0.5 flex justify-between font-mono text-[8px] tracking-wide-2 text-white/40">
                    <span>HULL INTEGRITY</span>
                    <span className="tabular-nums text-white/75">{hull}%</span>
                  </div>
                  <div className="seg-track">
                    <div className="seg-fill seg-fill--dim" style={{ width: `${hull}%` }} />
                  </div>
                </div>

                <div className="mt-1.5 flex gap-3 font-mono text-[8px] text-white/45">
                  <span>TFLOPS {tgt.compute}</span>
                  <span>UPTIME {fmtUptime(tgt.uptime)}</span>
                </div>

                <button
                  disabled={!canStrike}
                  onClick={() => {
                    if (!source) return;
                    sendAction({
                      kind: "launch-mission",
                      missionType: armedType!,
                      sourceId: source.id,
                      targetId: tgt.id,
                    });
                    setPending(null);
                  }}
                  className={cn(
                    "weapon-card mt-2 flex w-full items-center justify-between border px-2.5 py-1.5 font-mono text-[9px] font-bold tracking-wide-2 transition-colors",
                    canStrike
                      ? "border-white/50 text-white hover:bg-white hover:text-black"
                      : "cursor-not-allowed border-white/10 text-white/25"
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    <Crosshair size={10} strokeWidth={2} />
                    COMMIT {meta.label}
                  </span>
                  <span className={canStrike ? "opacity-70" : ""}>
                    {!hasSource ? "NO SOURCE" : costLabel} · {meta.duration}s
                  </span>
                </button>
                {!hasSource && (
                  <div className="mt-1 font-mono text-[8px] text-white/40 blink">▲ NO ELIGIBLE SOURCE GARRISON</div>
                )}
                {hasSource && !affordable && (
                  <div className="mt-1 font-mono text-[8px] text-white/40 blink">▲ INSUFFICIENT FUNDS</div>
                )}
                {hasSource && (
                  <div className="mt-1 font-mono text-[8px] text-white/30">
                    SOURCE: {source!.name} (auto-selected)
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── STEP 1: weapon selection ────────────────────────────────────────────
  const mine = state.garrisons.filter((o) => o.faction === state.operative.faction && o.status !== "OFFLINE");
  const types: MissionType[] = ["DRONE_STRIKE", "CYBER_ATTACK", "ESPIONAGE", "RECON", "BUILD", "DEFEND"];
  const intelCount = listIntelTargets(state).length;

  return (
    <div className="p-3">
      <SectionTitle right={<span className="chip">STEP 1 / 2</span>}>
        <span className="flex items-center gap-1.5"><Target size={11} strokeWidth={1.5} /> MISSION PROFILES</span>
      </SectionTitle>
      <p className="mb-3 font-mono text-[9px] leading-snug text-white/40">
        SELECT A WEAPON SYSTEM. ATTACKS REQUIRE INTEL TARGETS — RUN ESPIONAGE
        TO EXPOSE RIVAL GARRISONS. BUILD / DEFEND / RECON TARGET YOUR OWN NODES.
      </p>

      {/* intel counter */}
      <div className="mb-3 flex items-center justify-between border border-white/12 bg-white/3 px-2.5 py-1.5 font-mono text-[9px] tracking-wide-2">
        <span className="text-white/50">INTEL TARGETS</span>
        <span className={cn("num-hero text-[11px] font-bold", intelCount === 0 && "text-white/25")}>
          {intelCount} REVEALED
        </span>
      </div>

      {/* weapon cards */}
      <div className="space-y-1.5">
        {types.map((t) => {
          const meta = MISSION_META[t];
          const isAttack = ATTACK_TYPES.includes(t);
          const Icon = t === "DRONE_STRIKE" ? Crosshair
            : t === "CYBER_ATTACK" ? Zap
            : t === "ESPIONAGE" ? Eye
            : t === "RECON" ? Satellite
            : t === "BUILD" ? Hammer
            : Shield;
          return (
            <button
              key={t}
              onClick={() => {
                setPending({ type: t, sourceId: null });
                if (!isAttack) onNav("MAP");
              }}
              className="weapon-card group flex w-full items-center gap-2.5 border border-white/10 bg-black/30 p-2 text-left transition-colors hover:border-white/45 hover:bg-white/6"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center border border-white/15 bg-white/4 text-white/60 transition-colors group-hover:border-white/50 group-hover:text-white">
                <Icon size={14} strokeWidth={1.5} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="font-mono text-[10px] font-bold tracking-wide-2 text-white">{meta.label}</span>
                  <span className="chip chip--dim !py-0 !text-[7px]">{WEAPON_CLASS[t]}</span>
                </span>
                <span className="mt-0.5 block truncate font-mono text-[8px] leading-snug text-white/40">{meta.desc}</span>
                <span className="mt-1 flex gap-2 font-mono text-[8px] text-white/35">
                  <span>{meta.duration}s</span>
                  {meta.cost > 0 ? (
                    <span>{isAttack ? "TGT TOKEN" : t === "BUILD" ? "VOTC" : "OWN TOKEN"} · {meta.cost}</span>
                  ) : (
                    <span>FREE</span>
                  )}
                </span>
              </span>
              <ChevronRight size={11} strokeWidth={1.5} className="shrink-0 text-white/25 transition-colors group-hover:text-white/70" />
            </button>
          );
        })}
      </div>

      {/* own garrisons */}
      <div className="mt-3 border-t border-white/8 pt-3">
        <SectionTitle>YOUR GARRISONS · {mine.length}</SectionTitle>
        <div className="space-y-1">
          {mine.map((o) => (
            <button
              key={o.id}
              onClick={() => {
                select(o.id);
                onNav("MAP");
              }}
              className="flex w-full items-center justify-between border border-white/8 px-2 py-1.5 font-mono text-[10px] text-white/70 transition-colors hover:border-white/35 hover:text-white"
            >
              <span className="flex items-center gap-2">
                <span className={cn("pip", o.status === "ONLINE" ? "" : o.status === "OFFLINE" ? "pip--dim" : "pip--crit")} style={{ width: 4, height: 4 }} />
                {o.name}
              </span>
              <span className="flex items-center gap-1.5">
                {[1, 2, 3].map((n) => (
                  <span key={n} className={cn("lvl-pip", o.level >= n && "lvl-pip--on")} />
                ))}
                <span className="ml-1 text-white/40">{fmtUptime(o.uptime)}</span>
              </span>
            </button>
          ))}
          {mine.length === 0 && <Empty label="NO AVAILABLE SOURCES" />}
        </div>
      </div>
    </div>
  );
}

/* ── MISSION QUEUE — animated in-flight ops ──────────────────────────────── */
function MissionQueue() {
  const state = useCommand((s) => s.state)!;
  const active = state.missions.filter((m) => m.status === "ACTIVE");
  const done = state.missions.filter((m) => m.status !== "ACTIVE");
  return (
    <div className="p-3">
      <SectionTitle right={<span className="chip">{active.length} ACTIVE</span>}>
        <span className="flex items-center gap-1.5"><ListChecks size={11} strokeWidth={1.5} /> OPERATIONS IN FLIGHT</span>
      </SectionTitle>
      <div className="space-y-2">
        {active.map((m) => {
          const meta = MISSION_META[m.type];
          return (
            <div key={m.id} className="hud-card p-2.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 font-mono text-[10px] font-bold tracking-wide-2 text-white">
                  {meta.label}
                  <span className="chip chip--dim !py-0 !text-[7px]">{WEAPON_CLASS[m.type]}</span>
                </span>
                <span className="font-mono text-[8px] tracking-wide-2 text-white/40">{m.faction}</span>
              </div>
              <div className="mt-0.5 font-mono text-[9px] text-white/55">{m.label}</div>
              <div className="seg-track mt-2 h-[7px]">
                <div className="stripe-fill" style={{ width: `${m.progress}%` }} />
              </div>
              <div className="mt-1 flex justify-between font-mono text-[8px] tracking-wide-2 text-white/40">
                <span className="num-hero text-[9px] font-bold">{Math.round(m.progress)}%</span>
                <span>ETA {Math.ceil(m.eta)}s</span>
              </div>
            </div>
          );
        })}
        {active.length === 0 && <Empty label="NO ACTIVE MISSIONS" />}
      </div>
      {done.length > 0 && (
        <div className="mt-4 border-t border-white/8 pt-3">
          <SectionTitle>RECENTLY RESOLVED</SectionTitle>
          <div className="space-y-1">
            {done.slice(0, 8).map((m) => (
              <div key={m.id} className="flex items-center justify-between font-mono text-[9px] text-white/40">
                <span>{MISSION_META[m.type].label}</span>
                <span className={cn("chip !py-0 !text-[7px]", m.status === "COMPLETE" ? "chip--solid" : "chip--dim")}>
                  {m.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── AI BRIEFING — ARIA terminal with executable recommendations ─────────── */
function AIBriefingMini({ onNav }: { onNav: (v: NavView) => void }) {
  const briefing = useCommand((s) => s.briefing);
  const loading = useCommand((s) => s.briefingLoading);
  const fetchBriefing = useCommand((s) => s.fetchBriefing);
  const sendAction = useCommand((s) => s.sendAction);

  /** Parse "launch:TYPE:sourceId:targetId" into a client action. */
  function execute(action: string) {
    const [kind, type, sourceId, targetId] = action.split(":");
    if (kind !== "launch" || !type || !sourceId || !targetId) return;
    sendAction({
      kind: "launch-mission",
      missionType: type as MissionType,
      sourceId,
      targetId,
    });
  }

  return (
    <div className="p-3">
      <SectionTitle right={<span className="chip">ARIA v2</span>}>
        <span className="flex items-center gap-1.5"><BrainCircuit size={11} strokeWidth={1.5} /> TACTICAL CO-PILOT</span>
      </SectionTitle>
      <button
        onClick={fetchBriefing}
        disabled={loading}
        className="weapon-card mb-3 flex w-full items-center justify-center gap-2 border border-white/40 bg-white/6 py-2 font-mono text-[10px] font-bold tracking-mega text-white transition-colors hover:bg-white hover:text-black disabled:opacity-40 disabled:hover:bg-white/6 disabled:hover:text-white"
      >
        <Play size={11} strokeWidth={2} />
        {loading ? "// ANALYZING…" : "REQUEST PRIORITY BRIEFING"}
      </button>
      {briefing ? (
        <div className="space-y-2.5">
          <div className="hud-card p-2.5">
            <div className="mb-1 font-mono text-[8px] tracking-mega text-white/35">SITUATION</div>
            <p className="font-mono text-[10px] leading-snug text-white/85">{briefing.summary}</p>
            <p className="mt-1.5 border-t border-white/8 pt-1.5 font-mono text-[9px] italic leading-snug text-white/45">
              {briefing.threatAssessment}
            </p>
          </div>
          <div className="space-y-2">
            {briefing.recommendations.map((r) => (
              <div key={r.id} className="hud-card p-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] font-bold tracking-wide-2 text-white">
                    <span className="text-white/40">{r.id}</span> · {r.title}
                  </span>
                </div>
                <div className="mt-1 font-mono text-[8px] leading-snug text-white/45">{r.rationale}</div>
                {/* confidence readout */}
                <div className="mt-2">
                  <div className="mb-0.5 flex justify-between font-mono text-[8px] tracking-wide-2 text-white/35">
                    <span>CONFIDENCE</span>
                    <span className="tabular-nums text-white/75">{r.confidence}%</span>
                  </div>
                  <div className="seg-track">
                    <div className="seg-fill" style={{ width: `${r.confidence}%` }} />
                  </div>
                </div>
                <button
                  onClick={() => execute(r.action)}
                  className="weapon-card mt-2 flex w-full items-center justify-center gap-1.5 border border-white/40 px-2 py-1.5 font-mono text-[9px] font-bold tracking-wide-2 text-white transition-colors hover:bg-white hover:text-black"
                >
                  <Crosshair size={10} strokeWidth={2} /> EXECUTE
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <Empty label="NO BRIEFING ON FILE" />
      )}
      <button
        onClick={() => onNav("MAP")}
        className="mt-3 w-full border border-white/10 py-1.5 font-mono text-[9px] tracking-wide-2 text-white/50 transition-colors hover:border-white/35 hover:text-white"
      >
        ← BACK TO MAP
      </button>
    </div>
  );
}

/* ── DEPLOY — node-class cards with capability ratings ───────────────────── */
function DeployPanel() {
  const setPlacement = useCommand((s) => s.setPlacementMode);
  const placement = useCommand((s) => s.placementMode);
  return (
    <div className="p-3">
      <SectionTitle>
        <span className="flex items-center gap-1.5"><Rocket size={11} strokeWidth={1.5} /> GARRISON FABRICATION</span>
      </SectionTitle>
      <p className="mb-3 font-mono text-[9px] leading-snug text-white/40">
        CHOOSE A NODE CLASS, THEN CLICK ANY POSITION ON THE GLOBE TO EMPLACE
        IT. UPTIME ACCRUES BUILD POINTS + TOKEN YIELD.
      </p>
      <div className="space-y-2">
        <DeployCard
          active={placement?.type === "Safehouse"}
          onClick={() => setPlacement(placement?.type === "Safehouse" ? null : { type: "Safehouse" })}
          title="SAFEHOUSE"
          sub="DEDICATED HARDWARE · HIGH COMPUTE · SLOW TO RAISE"
          stats={[["COMPUTE", 90], ["RAISE SPEED", 30], ["YIELD", 85]]}
        />
        <DeployCard
          active={placement?.type === "Tactical Safehouse"}
          onClick={() => setPlacement(placement?.type === "Tactical Safehouse" ? null : { type: "Tactical Safehouse" })}
          title="TACTICAL SAFEHOUSE"
          sub="BROWSER WORKER · LIGHT COMPUTE · FAST TO RAISE"
          stats={[["COMPUTE", 40], ["RAISE SPEED", 85], ["YIELD", 35]]}
        />
      </div>
      {placement && (
        <div className="alert-banner mt-3 p-2 font-mono text-[9px] leading-snug text-white/85">
          ● PLACEMENT ARMED · CLICK GLOBE TO DEPLOY A {placement.type.toUpperCase()} NODE. PRESS ESC TO ABORT.
        </div>
      )}
    </div>
  );
}

function DeployCard({
  active, onClick, title, sub, stats,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  sub: string;
  stats: [string, number][];
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "weapon-card w-full border p-2.5 text-left transition-colors",
        active ? "border-white/60 bg-white/10" : "border-white/10 bg-black/30 hover:border-white/35"
      )}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] font-bold tracking-wide-2 text-white">{title}</span>
        {active && <span className="chip chip--solid !text-[7px]">ARMED</span>}
      </div>
      <div className="mt-0.5 font-mono text-[8px] leading-snug text-white/40">{sub}</div>
      <div className="mt-2 space-y-1">
        {stats.map(([label, v]) => (
          <div key={label} className="flex items-center gap-2">
            <span className="w-20 font-mono text-[7px] tracking-wide-2 text-white/35">{label}</span>
            <div className="seg-track flex-1">
              <div className="seg-fill seg-fill--dim" style={{ width: `${v}%` }} />
            </div>
          </div>
        ))}
      </div>
    </button>
  );
}

/* ── CONFIG ──────────────────────────────────────────────────────────────── */
function ConfigPanel() {
  return (
    <div className="p-3">
      <SectionTitle>
        <span className="flex items-center gap-1.5"><Terminal size={11} strokeWidth={1.5} /> FABRIC PARAMETERS</span>
      </SectionTitle>
      <div className="hud-card p-2.5">
        <div className="space-y-2 font-mono text-[10px] text-white/60">
          <CfgRow k="FABRIC" v="42 // v0.42.0" />
          <CfgRow k="VERIFICATION" v="CRYPTO · ON" />
          <CfgRow k="TICK RATE" v="0.5 HZ" />
          <CfgRow k="PROJECTION" v="GLOBE" />
          <CfgRow k="UPLINK" v="SOCKET.IO :3003" />
        </div>
      </div>
    </div>
  );
}
function CfgRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between border-b border-white/8 pb-1.5 last:border-b-0 last:pb-0">
      <span className="text-white/40">{k}</span>
      <span className="text-white/85">{v}</span>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="border border-dashed border-white/10 py-6 text-center font-mono text-[9px] tracking-wide-2 text-white/25">
      {label}
    </div>
  );
}
