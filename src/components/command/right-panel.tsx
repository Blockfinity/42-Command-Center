"use client";

import * as React from "react";
import { useCommand } from "@/stores/command";
import { cn } from "@/lib/utils";
import { fmtUptime, FACTION_MARK_GLYPH } from "@/lib/format";
import { MISSION_META, type MissionType } from "@/lib/types";
import { Brain, Crosshair, Shield, Zap, Eye, Satellite, Hammer, X } from "lucide-react";

const MISSION_ICON: Record<MissionType, React.ElementType> = {
  DRONE_STRIKE: Crosshair,
  CYBER_ATTACK: Zap,
  ESPIONAGE: Eye,
  RECON: Satellite,
  BUILD: Hammer,
  DEFEND: Shield,
};

export function RightPanel() {
  const state = useCommand((s) => s.state);
  const selectedId = useCommand((s) => s.selectedGarrisonId);
  const pending = useCommand((s) => s.pendingMission);
  const briefing = useCommand((s) => s.briefing);
  const loading = useCommand((s) => s.briefingLoading);
  const fetchBriefing = useCommand((s) => s.fetchBriefing);
  const sendAction = useCommand((s) => s.sendAction);
  const select = useCommand((s) => s.selectGarrison);
  const setPending = useCommand((s) => s.setPendingMission);

  if (!state) return null;
  const sel = state.garrisons.find((o) => o.id === selectedId) ?? null;

  return (
    <aside className="hidden w-[22rem] shrink-0 flex-col border-l border-white/10 bg-black/60 lg:flex">
      {/* Priority briefing */}
      <div className="border-b border-white/10">
        <div className="flex items-center justify-between border-b border-white/8 px-3 py-2">
          <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-mega text-white/70">
            <Brain size={12} strokeWidth={1.5} /> PRIORITY BRIEFING
          </span>
          <span className="font-mono text-[8px] tracking-wide-2 text-white/30">ARIA · AI OPS</span>
        </div>
        <div className="p-3">
          {briefing ? (
            <div className="space-y-2.5">
              <p className="font-mono text-[10px] leading-snug text-white/85">{briefing.summary}</p>
              <p className="border-l border-white/20 pl-2 font-mono text-[9px] italic leading-snug text-white/45">
                {briefing.threatAssessment}
              </p>
              <div className="space-y-1.5">
                {briefing.recommendations.map((r) => {
                  // action format: "launch:TYPE:sourceId:targetId"
                  const parts = r.action.split(":");
                  const canExec = parts[0] === "launch" && parts[2] && parts[3];
                  return (
                    <div key={r.id} className="group relative border border-white/12 bg-white/3 p-2 hover:border-white/30">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] font-bold tracking-wide-2 text-white">
                          {r.id} · {r.title}
                        </span>
                        <span className="font-mono text-[8px] text-white/50">{r.confidence}%</span>
                      </div>
                      <div className="mt-0.5 font-mono text-[8px] leading-snug text-white/50">{r.rationale}</div>
                      <div className="mt-1.5 h-0.5 w-full bg-white/8">
                        <div className="h-full bg-white/70" style={{ width: `${r.confidence}%` }} />
                      </div>
                      {canExec && (
                        <button
                          onClick={() => {
                            sendAction({
                              kind: "launch-mission",
                              missionType: parts[1] as MissionType,
                              sourceId: parts[2],
                              targetId: parts[3],
                            });
                            select(parts[2]);
                          }}
                          className="mt-1.5 w-full border border-white/30 bg-white/5 py-1 font-mono text-[8px] tracking-wide-2 text-white hover:bg-white/15"
                        >
                          ▶ EXECUTE · {parts[1].replace("_", " ")}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <button
              onClick={fetchBriefing}
              disabled={loading}
              className="w-full border border-white/25 bg-white/5 py-3 font-mono text-[10px] tracking-mega text-white hover:bg-white/10 disabled:opacity-40"
            >
              {loading ? "// ANALYZING THEATRE…" : "▶ REQUEST PRIORITY BRIEFING"}
            </button>
          )}
        </div>
      </div>

      {/* Pending mission confirmation (target selection mode) */}
      {pending && (
        <div className="border-b border-white/10 bg-white/5 p-3">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="font-mono text-[9px] tracking-mega text-white/70">
              {MISSION_META[pending.type].label} · ARMED
            </span>
            <button onClick={() => setPending(null)} className="text-white/40 hover:text-white">
              <X size={12} />
            </button>
          </div>
          <p className="font-mono text-[9px] leading-snug text-white/55">
            {MISSION_META[pending.type].desc}
          </p>
          {!pending.sourceId ? (
            <div className="mt-2 font-mono text-[9px] text-white/50">
              ◆ SELECT A SOURCE GARRISON BELOW.
            </div>
          ) : (
            <div className="mt-2 font-mono text-[9px] text-white/70">
              ◆ SOURCE LOCKED. CLICK A RIVAL GARRISON ON THE MAP TO COMMIT.
            </div>
          )}
          <SourcePicker />
        </div>
      )}

      {/* Selected garrison detail */}
      <div className="flex-1 overflow-y-auto thin-scroll">
        {sel ? (
          <GarrisonDetail />
        ) : (
          <div className="p-6 text-center font-mono text-[9px] tracking-wide-2 text-white/30">
            ◇ SELECT A GARRISON ON THE MAP
            <br />
            <span className="text-white/20">TO INSPECT OR ENGAGE</span>
          </div>
        )}
      </div>
    </aside>
  );
}

function SourcePicker() {
  const state = useCommand((s) => s.state)!;
  const pending = useCommand((s) => s.pendingMission)!;
  const setPending = useCommand((s) => s.setPendingMission);
  const mine = state.garrisons.filter(
    (o) => o.faction === state.operative.faction && o.status !== "OFFLINE"
  );
  const isSelf = pending.type === "BUILD" || pending.type === "DEFEND" || pending.type === "RECON";
  return (
    <div className="mt-2 max-h-40 space-y-1 overflow-y-auto thin-scroll">
      {mine.map((o) => (
        <button
          key={o.id}
          onClick={() => {
            if (isSelf) {
              // self-targeting mission — commit immediately
              useCommand.getState().sendAction({
                kind: "launch-mission",
                missionType: pending.type,
                sourceId: o.id,
                targetId: o.id,
              });
              setPending(null);
            } else {
              setPending({ type: pending.type, sourceId: o.id });
            }
          }}
          className={cn(
            "flex w-full items-center justify-between border px-2 py-1 font-mono text-[9px] transition-colors",
            pending.sourceId === o.id
              ? "border-white/60 bg-white/10 text-white"
              : "border-white/8 text-white/60 hover:border-white/30 hover:text-white"
          )}
        >
          <span className="flex items-center gap-1.5">
            <span className="text-white/50">{FACTION_MARK_GLYPH[o.faction]}</span>
            {o.name}
          </span>
          <span className="text-white/40">LV{o.level}</span>
        </button>
      ))}
    </div>
  );
}

function GarrisonDetail() {
  const state = useCommand((s) => s.state)!;
  const selectedId = useCommand((s) => s.selectedGarrisonId)!;
  const sendAction = useCommand((s) => s.sendAction);
  const setPending = useCommand((s) => s.setPendingMission);
  const op = state.garrisons.find((o) => o.id === selectedId)!;
  const isMine = op.faction === state.operative.faction;
  const healthPct = (op.health / op.maxHealth) * 100;
  const upgradeCost = 50 + op.level * 25;
  const buildCost = 40 + op.level * 20;

  return (
    <div className="p-3">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-1.5 font-mono text-[8px] tracking-mega text-white/45">
            <span className="text-white/65">{FACTION_MARK_GLYPH[op.faction]}</span> {op.faction} ·{" "}
            {op.type === "Safehouse" ? "SAFEHOUSE" : "TACTICAL SAFEHOUSE"}
          </div>
          <div className="font-mono text-[14px] font-bold tracking-wide-2 text-white text-glow">{op.name}</div>
          <div className="font-mono text-[9px] text-white/40">
            {op.lat.toFixed(2)}°, {op.lng.toFixed(2)}° · LV {op.level}
          </div>
        </div>
        <StatusBadge status={op.status} />
      </div>

      {/* health bar */}
      <div className="mb-3">
        <div className="flex justify-between font-mono text-[8px] tracking-wide-2 text-white/45">
          <span>HULL INTEGRITY</span>
          <span className="text-white/75">{Math.round(op.health)}/{op.maxHealth}</span>
        </div>
        <div className="mt-1 h-2 w-full bg-white/8">
          <div
            className={cn("h-full transition-all", healthPct > 50 ? "bg-white/75" : healthPct > 20 ? "bg-white/55" : "bg-white blink")}
            style={{ width: `${Math.max(0, healthPct)}%` }}
          />
        </div>
      </div>

      {/* metrics grid */}
      <div className="mb-3 grid grid-cols-2 gap-2">
        <Metric k="COMPUTE" v={`${op.compute}`} unit="TF" />
        <Metric k="UPTIME" v={fmtUptime(op.uptime)} />
        <Metric k="BUILD PTS" v={`${Math.floor(op.buildPoints)}`} />
        <Metric k="ESTABLISHED" v={fmtUptime(Date.now() - op.establishedAt)} />
      </div>

      {/* actions */}
      <div className="space-y-1.5">
        {isMine ? (
          <>
            <ActionBtn
              icon={Hammer}
              label="REINFORCE (BUILD)"
              meta={`+LV · ${buildCost} BP`}
              disabled={op.buildPoints < buildCost}
              onClick={() => {
                sendAction({ kind: "launch-mission", missionType: "BUILD", sourceId: op.id, targetId: op.id });
              }}
            />
            <ActionBtn
              icon={Shield}
              label="RAISE SHIELDS (DEFEND)"
              meta={`+HULL · FREE`}
              onClick={() => {
                sendAction({ kind: "launch-mission", missionType: "DEFEND", sourceId: op.id, targetId: op.id });
              }}
            />
            <ActionBtn
              icon={Satellite}
              label="ORBITAL RECON"
              meta={`+BP · FREE`}
              onClick={() => {
                sendAction({ kind: "launch-mission", missionType: "RECON", sourceId: op.id, targetId: op.id });
              }}
            />
            <ActionBtn
              icon={Hammer}
              label={`UPGRADE TO LV ${op.level + 1}`}
              meta={`${upgradeCost} BP`}
              disabled={op.buildPoints < upgradeCost}
              onClick={() => sendAction({ kind: "upgrade-garrison", id: op.id })}
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
    </div>
  );
}

function Metric({ k, v, unit }: { k: string; v: string; unit?: string }) {
  return (
    <div className="border border-white/8 p-2">
      <div className="font-mono text-[8px] tracking-wide-2 text-white/40">{k}</div>
      <div className="font-mono text-[12px] font-bold tabular-nums text-white">
        {v} {unit && <span className="text-[8px] text-white/40">{unit}</span>}
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
      className="flex w-full items-center justify-between border border-white/12 bg-white/3 px-2 py-1.5 font-mono text-[10px] tracking-wide-2 text-white transition-colors hover:border-white/40 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
    >
      <span className="flex items-center gap-1.5">
        <Icon size={12} strokeWidth={1.5} /> {label}
      </span>
      <span className="text-[8px] text-white/45">{meta}</span>
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
    <span className={cn("border px-1.5 py-0.5 font-mono text-[8px] tracking-wide-2", map[status] ?? map.ONLINE)}>
      {status.replace("_", " ")}
    </span>
  );
}
