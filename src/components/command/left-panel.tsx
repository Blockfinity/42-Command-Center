"use client";

import * as React from "react";
import { useCommand } from "@/stores/command";
import type { NavView } from "./nav-rail";
import { cn } from "@/lib/utils";
import { FACTIONS, MISSION_META, NETWORK_CURRENCY, FACTION_TOKEN, type FactionId, type GarrisonType, type MissionType, type Garrison, type CurrencyId } from "@/lib/types";
import { fmtUptime, FACTION_MARK_GLYPH } from "@/lib/format";
import { Target, SatelliteDish, BrainCircuit, Rocket, ScanEye, ListChecks, Terminal, Orbit, ArrowLeft, ChevronRight, Crosshair, Zap, Eye, Shield, Hammer, Satellite, AlertTriangle } from "lucide-react";
import { pickBestSource, listIntelTargets, missionCostLabel, canAfford, currencySymbol, missionCostCurrency } from "@/lib/strike-plan";

const SEV_COLOR: Record<string, string> = {
  INFO: "text-white/55",
  WARN: "text-white",
  CRITICAL: "text-white text-glow",
  SUCCESS: "text-white/80",
};

export function LeftPanel({ view, onNav }: { view: NavView | null; onNav: (v: NavView) => void }) {
  const state = useCommand((s) => s.state);
  if (!state) return null;
  if (!view || view === "MAP") return null;
  return (
    <aside className="pointer-events-auto absolute left-14 top-16 bottom-9 z-20 hidden w-96 shrink-0 flex-col border-r border-white/10 bg-black/70 backdrop-blur-md md:flex">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <span className="font-mono text-[10px] tracking-mega text-white/70">{view}</span>
        <span className="font-mono text-[8px] tracking-wide-2 text-white/30">SOL {state.sol.toString().padStart(4, "0")}</span>
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
    </aside>
  );
}

function PanelSection({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="border-b border-white/8 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[9px] tracking-mega text-white/45">{title}</span>
        {right}
      </div>
      {children}
    </div>
  );
}

function MapSummary() {
  const state = useCommand((s) => s.state)!;
  const op = state.operative;
  const myFaction = state.factions[op.faction];
  const mine = state.garrisons.filter((o) => o.faction === op.faction);
  return (
    <>
      <PanelSection title={`STATION · ${op.faction}`}>
        <div className="grid grid-cols-2 gap-y-1.5 font-mono text-[10px]">
          <Row k="CODENAME" v={op.codename} />
          <Row k="TIER" v={op.tier} />
          <Row k="AUTHORITY" v={`${op.authority}`} />
          <Row k="DOCTRINE" v={myFaction.motto} />
          <Row k="GARRISONS" v={`${mine.length}`} />
          <Row k="COMPUTE" v={`${myFaction.compute} TF`} />
          <Row k="TERRITORIES" v={`${myFaction.territories}`} />
          <Row k="THREAT" v={`${myFaction.threat}`} />
        </div>
      </PanelSection>
      <PanelSection title="FLEET STATUS">
        <div className="space-y-1.5">
          {mine.slice(0, 8).map((o) => (
            <div key={o.id} className="flex items-center justify-between font-mono text-[10px]">
              <span className="flex items-center gap-1.5 text-white/75">
                <span className="text-white/55">{FACTION_MARK_GLYPH[o.faction]}</span>
                {o.name}
              </span>
              <span className="flex items-center gap-1.5 text-white/45">
                <span className={cn("pip", o.status === "ONLINE" ? "" : o.status === "OFFLINE" ? "pip--dim" : "pip--crit")} style={{ width: 5, height: 5 }} />
                {o.type === "Safehouse" ? "SAFEHOUSE" : "TAC"}
              </span>
            </div>
          ))}
          {mine.length === 0 && <Empty label="NO GARRISONS DEPLOYED" />}
        </div>
      </PanelSection>
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <>
      <span className="text-white/40">{k}</span>
      <span className="text-right text-white/85">{v}</span>
    </>
  );
}

function DiscoveryFeed() {
  const state = useCommand((s) => s.state)!;
  return (
    <div className="p-3">
      <div className="mb-2 flex items-center gap-2 font-mono text-[9px] tracking-mega text-white/45">
        <SatelliteDish size={11} strokeWidth={1.5} /> LIVE DISCOVERY FEED
      </div>
      <div className="space-y-2">
        {state.events.map((e) => (
          <div key={e.id} className="border-l border-white/15 pl-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[8px] tracking-wide-2 text-white/35">
                {new Date(e.timestamp).toISOString().slice(11, 19)}
              </span>
              <span className={cn("font-mono text-[8px] tracking-wide-2", SEV_COLOR[e.severity] ?? "text-white/55")}>
                {e.severity}
              </span>
              {e.faction && (
                <span className="font-mono text-[8px] tracking-wide-2 text-white/35">{e.faction}</span>
              )}
            </div>
            <div className="font-mono text-[10px] leading-snug text-white/80">{e.message}</div>
          </div>
        ))}
        {state.events.length === 0 && <Empty label="AWAITING SIGNAL" />}
      </div>
    </div>
  );
}

function FactionIntel() {
  const state = useCommand((s) => s.state)!;
  return (
    <div className="p-3">
      <div className="mb-3 flex items-center gap-2 font-mono text-[9px] tracking-mega text-white/45">
        <ScanEye size={11} strokeWidth={1.5} /> FACTION INTEL
      </div>
      <div className="space-y-3">
        {FACTIONS.map((f: FactionId) => {
          const fac = state.factions[f];
          const isMine = f === state.operative.faction;
          return (
            <div key={f} className={cn("border border-white/10 p-2", isMine && "bg-white/5")}>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-mono text-[11px] font-bold tracking-wide-2 text-white">
                  <span className="text-white/70">{FACTION_MARK_GLYPH[f]}</span> {fac.name}
                </span>
                {isMine && <span className="font-mono text-[8px] tracking-wide-2 text-white/50">[YOURS]</span>}
              </div>
              <div className="font-mono text-[9px] italic text-white/45">"{fac.motto}"</div>
              <div className="mt-2 space-y-1">
                <Bar label="STRENGTH" v={fac.strength} />
                <Bar label="THREAT" v={fac.threat} />
                <Bar label="COMPUTE" v={Math.min(100, fac.compute / 4)} raw={`${fac.compute} TF`} />
              </div>
              <div className="mt-1.5 flex justify-between font-mono text-[9px] text-white/45">
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

function Bar({ label, v, raw }: { label: string; v: number; raw?: string }) {
  return (
    <div>
      <div className="flex items-center justify-between font-mono text-[8px] tracking-wide-2 text-white/45">
        <span>{label}</span>
        <span className="text-white/70">{raw ?? `${Math.round(v)}`}</span>
      </div>
      <div className="mt-0.5 h-1 w-full bg-white/8">
        <div className="h-full bg-white/70" style={{ width: `${Math.max(2, Math.min(100, v))}%` }} />
      </div>
    </div>
  );
}

// ── WalletStrip — compact currency display for the strike economy ────────
// Shows the operative's balance of a specific currency (or all four) so the
// player sees their war chest at the moment of spending. Used by the
// StrikeConsole and the GarrisonDetailCard rival action list.
function WalletStrip({ currency, balance }: { currency: CurrencyId; balance: number }) {
  const sym = currencySymbol(currency);
  const affordable = balance > 0;
  return (
    <div
      className={cn(
        "flex items-center justify-between border px-2 py-1 font-mono text-[9px] tracking-wide-2",
        affordable
          ? "border-white/20 text-white/70"
          : "border-white/10 text-white/35"
      )}
    >
      <span className="text-white/40">BALANCE</span>
      <span>
        {Math.floor(balance)} <span className="text-white/55">{sym}</span>
      </span>
    </div>
  );
}

function StrikeConsole({ onNav }: { onNav: (v: NavView) => void }) {
  const state = useCommand((s) => s.state)!;
  const pending = useCommand((s) => s.pendingMission);
  const setPending = useCommand((s) => s.setPendingMission);
  const sendAction = useCommand((s) => s.sendAction);
  const select = useCommand((s) => s.selectGarrison);

  // MODE 2: a mission type is armed — show intel-driven target list
  const armedType = pending?.type ?? null;

  // Attack missions only (DRONE_STRIKE, CYBER_ATTACK, ESPIONAGE) use the
  // intel-driven target flow. BUILD/DEFEND/RECON are self-targeted.
  const ATTACK_TYPES: MissionType[] = ["DRONE_STRIKE", "CYBER_ATTACK", "ESPIONAGE"];
  const isAttackArmed = armedType && ATTACK_TYPES.includes(armedType);

  // ── MODE 2: intel target cards ────────────────────────────────────────
  if (isAttackArmed) {
    const meta = MISSION_META[armedType!];
    const targets = listIntelTargets(state);
    const myFaction = state.operative.faction;

    return (
      <div className="flex h-full flex-col p-3">
        {/* step indicator */}
        <div className="mb-3 flex items-center gap-2 font-mono text-[9px] tracking-mega text-white/45">
          <Target size={11} strokeWidth={1.5} /> STRIKE CONSOLE
          <span className="ml-auto text-white/30">STEP 2 / 2</span>
        </div>

        {/* armed mission banner + back button */}
        <button
          onClick={() => setPending(null)}
          className="mb-3 flex w-full items-center gap-2 border border-white/20 bg-white/5 px-2 py-1.5 text-left transition-colors hover:border-white/40 hover:bg-white/10"
        >
          <ArrowLeft size={12} strokeWidth={1.5} className="text-white/60" />
          <div className="flex-1">
            <div className="font-mono text-[10px] font-bold tracking-wide-2 text-white">{meta.label}</div>
            <div className="font-mono text-[8px] leading-snug text-white/45">{meta.desc}</div>
          </div>
        </button>

        {/* wallet strip — shows the currency this attack costs (target faction token) */}
        {targets.length > 0 && (
          <div className="mb-3 space-y-1">
            <div className="font-mono text-[8px] tracking-mega text-white/35">TARGET FACTION TOKENS</div>
            {FACTIONS.filter((f) => f !== myFaction).map((f) => (
              <WalletStrip
                key={f}
                currency={f}
                balance={state.operative.wallet[f]}
              />
            ))}
          </div>
        )}

        {/* intel target list */}
        <div className="mb-2 font-mono text-[9px] tracking-mega text-white/45">
          INTEL TARGETS · {targets.length} REVEALED
        </div>
        <div className="flex-1 space-y-1.5 overflow-y-auto">
          {targets.length === 0 && (
            <div className="border border-dashed border-white/15 p-4 text-center">
              <AlertTriangle size={16} strokeWidth={1.5} className="mx-auto mb-2 text-white/40" />
              <div className="font-mono text-[9px] leading-snug text-white/50">
                NO INTEL TARGETS REVEALED.<br />
                RUN ESPIONAGE ON A RIVAL GARRISON<br />
                TO ADD IT TO THE STRIKE LIST.
              </div>
              <button
                onClick={() => {
                  setPending({ type: "ESPIONAGE", sourceId: null });
                }}
                className="mt-3 border border-white/30 px-3 py-1 font-mono text-[9px] tracking-wide-2 text-white/80 hover:border-white/60 hover:text-white"
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
            return (
              <div
                key={tgt.id}
                className={cn(
                  "border p-2 transition-colors",
                  canStrike
                    ? "border-white/20 hover:border-white/50"
                    : "border-white/8 opacity-60"
                )}
              >
                {/* target header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[10px] font-bold tracking-wide-2 text-white">
                      {tgt.name}
                    </span>
                    <span className="font-mono text-[8px] tracking-wide-2 text-white/40">
                      {tgt.faction}
                    </span>
                  </div>
                  <span className="font-mono text-[8px] text-white/40">
                    LV{tgt.level} · {Math.round(tgt.health / tgt.maxHealth * 100)}%
                  </span>
                </div>
                {/* target stats */}
                <div className="mt-1 flex gap-3 font-mono text-[8px] text-white/45">
                  <span>HULL {Math.round(tgt.health)}</span>
                  <span>TFLOPS {tgt.compute}</span>
                  <span>UPTIME {fmtUptime(tgt.uptime)}</span>
                </div>
                {/* confirm button */}
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
                    "mt-2 flex w-full items-center justify-between border px-2 py-1.5 font-mono text-[9px] font-bold tracking-wide-2 transition-colors",
                    canStrike
                      ? "border-white/40 text-white hover:border-white hover:bg-white/10"
                      : "cursor-not-allowed border-white/10 text-white/30"
                  )}
                >
                  <span>CONFIRM {meta.label}</span>
                  <span className="text-white/60">
                    {!hasSource ? "NO SOURCE" : costLabel} · {meta.duration}s
                  </span>
                </button>
                {!hasSource && (
                  <div className="mt-1 font-mono text-[8px] text-white/35 blink">
                    ⚠ NO ELIGIBLE SOURCE GARRISON
                  </div>
                )}
                {hasSource && !affordable && (
                  <div className="mt-1 font-mono text-[8px] text-white/35 blink">
                    ⚠ INSUFFICIENT FUNDS
                  </div>
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

  // ── MODE 1: mission profile selection ──────────────────────────────────
  const mine = state.garrisons.filter((o) => o.faction === state.operative.faction && o.status !== "OFFLINE");
  const types: MissionType[] = ["DRONE_STRIKE", "CYBER_ATTACK", "ESPIONAGE", "RECON", "BUILD", "DEFEND"];
  const intelCount = listIntelTargets(state).length;

  return (
    <div className="p-3">
      <div className="mb-3 flex items-center gap-2 font-mono text-[9px] tracking-mega text-white/45">
        <Target size={11} strokeWidth={1.5} /> STRIKE CONSOLE
        <span className="ml-auto text-white/30">STEP 1 / 2</span>
      </div>
      <p className="mb-3 font-mono text-[9px] leading-snug text-white/45">
        SELECT A MISSION PROFILE. ATTACKS REVEAL INTEL TARGETS IN STEP 2 —
        CONFIRM WITH AUTO-SELECTED SOURCE. BUILD/DEFEND/RECON TARGET YOUR OWN GARRISON.
      </p>

      {/* intel counter */}
      <div className="mb-3 flex items-center justify-between border border-white/10 px-2 py-1 font-mono text-[9px] tracking-wide-2 text-white/50">
        <span>INTEL TARGETS</span>
        <span className={cn("font-bold", intelCount > 0 ? "text-white" : "text-white/35")}>
          {intelCount} REVEALED
        </span>
      </div>

      {/* mission profile list */}
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
                if (isAttack) {
                  setPending({ type: t, sourceId: null });
                } else {
                  // self-targeted missions: go to map to pick own garrison
                  setPending({ type: t, sourceId: null });
                  onNav("MAP");
                }
              }}
              className="group w-full border border-white/10 p-2 text-left transition-colors hover:border-white/40 hover:bg-white/5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Icon size={11} strokeWidth={1.5} className="text-white/55 group-hover:text-white" />
                  <span className="font-mono text-[10px] font-bold tracking-wide-2 text-white">{meta.label}</span>
                </div>
                <ChevronRight size={10} strokeWidth={1.5} className="text-white/30 group-hover:text-white/60" />
              </div>
              <div className="mt-0.5 font-mono text-[8px] leading-snug text-white/45">{meta.desc}</div>
              <div className="mt-1 flex gap-2 font-mono text-[8px] text-white/35">
                <span>{meta.duration}s</span>
                {meta.cost > 0 && (
                  <span>
                    {isAttack ? "TGT TOKEN" : t === "BUILD" ? "VOTC" : "OWN TOKEN"} · {meta.cost}
                  </span>
                )}
                {meta.cost === 0 && <span>FREE</span>}
              </div>
            </button>
          );
        })}
      </div>

      {/* source garrisons (for self-targeted missions) */}
      <div className="mt-3 border-t border-white/8 pt-3">
        <div className="mb-1.5 font-mono text-[9px] tracking-mega text-white/45">YOUR GARRISONS</div>
        <div className="space-y-1">
          {mine.map((o) => (
            <button
              key={o.id}
              onClick={() => {
                select(o.id);
                onNav("MAP");
              }}
              className="flex w-full items-center justify-between border border-white/8 px-2 py-1 font-mono text-[10px] text-white/70 hover:border-white/30 hover:text-white"
            >
              <span>{o.name}</span>
              <span className="text-white/40">LV{o.level} · {fmtUptime(o.uptime)}</span>
            </button>
          ))}
          {mine.length === 0 && <Empty label="NO AVAILABLE SOURCES" />}
        </div>
      </div>
    </div>
  );
}

function MissionQueue() {
  const state = useCommand((s) => s.state)!;
  const active = state.missions.filter((m) => m.status === "ACTIVE");
  const done = state.missions.filter((m) => m.status !== "ACTIVE");
  return (
    <div className="p-3">
      <div className="mb-3 flex items-center gap-2 font-mono text-[9px] tracking-mega text-white/45">
        <ListChecks size={11} strokeWidth={1.5} /> MISSION QUEUE · {active.length} ACTIVE
      </div>
      <div className="space-y-2">
        {active.map((m) => {
          const meta = MISSION_META[m.type];
          return (
            <div key={m.id} className="border border-white/15 bg-white/3 p-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] font-bold tracking-wide-2 text-white">{meta.label}</span>
                <span className="font-mono text-[8px] tracking-wide-2 text-white/40">{m.faction}</span>
              </div>
              <div className="font-mono text-[9px] text-white/55">{m.label}</div>
              <div className="mt-1.5 h-1 w-full bg-white/8">
                <div className="h-full bg-white/70 transition-all" style={{ width: `${m.progress}%` }} />
              </div>
              <div className="mt-1 flex justify-between font-mono text-[8px] tracking-wide-2 text-white/40">
                <span>{Math.round(m.progress)}%</span>
                <span>ETA {Math.ceil(m.eta)}s</span>
              </div>
            </div>
          );
        })}
        {active.length === 0 && <Empty label="NO ACTIVE MISSIONS" />}
      </div>
      {done.length > 0 && (
        <div className="mt-4 border-t border-white/8 pt-3">
          <div className="mb-1.5 font-mono text-[9px] tracking-mega text-white/40">RECENTLY RESOLVED</div>
          <div className="space-y-1">
            {done.slice(0, 8).map((m) => (
              <div key={m.id} className="flex items-center justify-between font-mono text-[9px] text-white/40">
                <span>{MISSION_META[m.type].label}</span>
                <span>{m.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AIBriefingMini({ onNav }: { onNav: (v: NavView) => void }) {
  const briefing = useCommand((s) => s.briefing);
  const loading = useCommand((s) => s.briefingLoading);
  const fetchBriefing = useCommand((s) => s.fetchBriefing);
  return (
    <div className="p-3">
      <div className="mb-3 flex items-center gap-2 font-mono text-[9px] tracking-mega text-white/45">
        <BrainCircuit size={11} strokeWidth={1.5} /> AI BRIEFING · ARIA
      </div>
      <button
        onClick={fetchBriefing}
        disabled={loading}
        className="mb-3 w-full border border-white/30 bg-white/5 py-2 font-mono text-[10px] tracking-mega text-white hover:bg-white/10 disabled:opacity-40"
      >
        {loading ? "// ANALYZING…" : "▶ REQUEST PRIORITY BRIEFING"}
      </button>
      {briefing ? (
        <div className="space-y-2">
          <p className="font-mono text-[10px] leading-snug text-white/80">{briefing.summary}</p>
          <p className="font-mono text-[9px] italic leading-snug text-white/45">{briefing.threatAssessment}</p>
          <div className="space-y-1.5">
            {briefing.recommendations.map((r) => (
              <div key={r.id} className="border border-white/12 p-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] font-bold tracking-wide-2 text-white">{r.id} · {r.title}</span>
                  <span className="font-mono text-[8px] text-white/50">{r.confidence}%</span>
                </div>
                <div className="font-mono text-[8px] leading-snug text-white/45">{r.rationale}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <Empty label="NO BRIEFING ON FILE" />
      )}
      <button onClick={() => onNav("MAP")} className="mt-3 w-full border border-white/10 py-1.5 font-mono text-[9px] tracking-wide-2 text-white/50 hover:text-white">
        ← BACK TO MAP
      </button>
    </div>
  );
}

function DeployPanel() {
  const setPlacement = useCommand((s) => s.setPlacementMode);
  const placement = useCommand((s) => s.placementMode);
  return (
    <div className="p-3">
      <div className="mb-3 flex items-center gap-2 font-mono text-[9px] tracking-mega text-white/45">
        <Rocket size={11} strokeWidth={1.5} /> DEPLOY GARRISON
      </div>
      <p className="mb-3 font-mono text-[9px] leading-snug text-white/45">
        CHOOSE A NODE CLASS, THEN CLICK ANY POSITION ON THE WORLD MAP TO EMPLACE IT.
        UPTIME ACCRUES BUILD POINTS USED TO REINFORCE TERRITORY.
      </p>
      <div className="space-y-2">
        <DeployBtn
          active={placement?.type === "Safehouse"}
          onClick={() => setPlacement(placement?.type === "Safehouse" ? null : { type: "Safehouse" })}
          title="SAFEHOUSE"
          sub="DEDICATED HARDWARE · HIGH COMPUTE · SLOW TO RAISE"
        />
        <DeployBtn
          active={placement?.type === "Tactical Safehouse"}
          onClick={() => setPlacement(placement?.type === "Tactical Safehouse" ? null : { type: "Tactical Safehouse" })}
          title="TACTICAL SAFEHOUSE"
          sub="BROWSER WORKER · LIGHT COMPUTE · FAST TO RAISE"
        />
      </div>
      {placement && (
        <div className="mt-3 border border-white/20 bg-white/5 p-2 font-mono text-[9px] leading-snug text-white/70">
          ● PLACEMENT ARMED · CLICK MAP TO DEPLOY A {placement.type} NODE. PRESS ESC TO ABORT.
        </div>
      )}
    </div>
  );
}

function DeployBtn({ active, onClick, title, sub }: { active: boolean; onClick: () => void; title: string; sub: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full border p-2 text-left transition-colors",
        active ? "border-white/60 bg-white/10" : "border-white/10 hover:border-white/30"
      )}
    >
      <div className="font-mono text-[10px] font-bold tracking-wide-2 text-white">{title}</div>
      <div className="font-mono text-[8px] leading-snug text-white/45">{sub}</div>
    </button>
  );
}

function ConfigPanel() {
  return (
    <div className="p-3">
      <div className="mb-3 flex items-center gap-2 font-mono text-[9px] tracking-mega text-white/45">
        <Terminal size={11} strokeWidth={1.5} /> SYSTEM CONFIG
      </div>
      <div className="space-y-2 font-mono text-[10px] text-white/60">
        <CfgRow k="FABRIC" v="42 // v0.42.0" />
        <CfgRow k="VERIFICATION" v="CRYPTO · ON" />
        <CfgRow k="TICK RATE" v="0.5 HZ" />
        <CfgRow k="PROJECTION" v="GLOBE" />
        <CfgRow k="UPLINK" v="SOCKET.IO :3003" />
      </div>
    </div>
  );
}
function CfgRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between border-b border-white/8 pb-1.5">
      <span className="text-white/40">{k}</span>
      <span className="text-white/80">{v}</span>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return <div className="py-6 text-center font-mono text-[9px] tracking-wide-2 text-white/25">{label}</div>;
}
