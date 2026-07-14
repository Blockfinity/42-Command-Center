"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useCommand } from "@/stores/command";
import { CommandBar } from "@/components/command/command-bar";
import { NavRail, type NavView } from "@/components/command/nav-rail";
import { LeftPanel } from "@/components/command/left-panel";
import { StatusBar } from "@/components/command/status-bar";
import { BootScreen } from "@/components/command/boot-screen";
import { Toaster } from "@/components/ui/toaster";
import { useToast } from "@/hooks/use-toast";
import { useSfx } from "@/hooks/use-sfx";
import { useClockData } from "@/components/command/header/clock-area.data";
import { MISSION_META, type GarrisonType } from "@/lib/types";

// MapView is client-only (MapLibre WebGL) — load dynamically.
// This is the modular map platform: src/components/command/map/
const MapView = dynamic(() => import("@/components/command/map/map-view").then((m) => m.MapView), {
  ssr: false,
  loading: () => <div className="flex h-full w-full items-center justify-center bg-black" />,
});

// GarrisonDetailCard is only shown when a garrison is selected — lazy-load
// it so framer-motion + the card's own deps stay out of the initial bundle.
const GarrisonDetailCard = dynamic(
  () => import("@/components/command/outpost-detail-card").then((m) => m.GarrisonDetailCard),
  { ssr: false },
);

export function CommandDeck() {
  const state = useCommand((s) => s.state);
  const init = useCommand((s) => s.init);
  const connected = useCommand((s) => s.connected);
  const selectedId = useCommand((s) => s.selectedGarrisonId);
  const select = useCommand((s) => s.selectGarrison);
  const pending = useCommand((s) => s.pendingMission);
  const setPending = useCommand((s) => s.setPendingMission);
  const placement = useCommand((s) => s.placementMode);
  const setPlacement = useCommand((s) => s.setPlacementMode);
  const sendAction = useCommand((s) => s.sendAction);
  const { toast } = useToast();
  const sfx = useSfx();
  const clock = useClockData();

  const [view, setView] = React.useState<NavView | null>(null);
  const [started, setStarted] = React.useState(false);
  const [bootError, setBootError] = React.useState(false);

  // ---- prefetch the map chunk while the user is on the boot screen ----
  // The map dynamic chunk (~2MB prod) is the single heaviest resource. By
  // triggering the import on mount (before the user even clicks ESTABLISH
  // UPLINK), the download overlaps with the boot screen idle time + the
  // 2.6s boot sequence, instead of starting after state arrives.
  React.useEffect(() => {
    void import("@/components/command/map/map-view");
  }, []);

  // ---- connect gate: only start socket after user clicks ESTABLISH UPLINK ----
  // BootScreen owns the click sound (transition cue + uplink sequence);
  // parent just resumes AudioContext + flips the started flag.
  function handleConnect() {
    sfx.resume();
    setStarted(true);
  }

  // ---- boot socket + fallback fetch (only after started) ----
  React.useEffect(() => {
    if (!started) return;
    const cleanup = init();
    sfx.startTicking(170);

    fetch("/api/state")
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (s && !useCommand.getState().state) {
          useCommand.setState({ state: s });
        }
        sfx.stopTicking();
      })
      .catch(() => {
        sfx.stopTicking();
        setBootError(true);
      });
    return cleanup;
  }, [started]);

  // ---- action-result toast feedback ----
  React.useEffect(() => {
    if (!started) return;
    const socket = useCommand.getState().socket;
    if (!socket) return;
    const onResult = (r: { ok: boolean; error?: string; note?: string }) => {
      if (!r.ok && r.error) {
        sfx.play("deny");
        toast({ title: "ACTION DENIED", description: r.error, variant: "destructive" });
      } else if (r.ok) {
        sfx.play("confirm");
      }
    };
    socket.on("action-result", onResult);
    return () => {
      socket.off("action-result", onResult);
    };
  }, [connected, started]);

  // ---- ESC cancels + number-key nav ----
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPlacement(null);
        setPending(null);
        select(null);
      }
      const navMap: Record<string, NavView> = {
        "1": "MAP", "2": "FEED", "3": "STRIKE", "4": "QUEUE",
        "5": "AI", "6": "INTEL", "7": "DEPLOY", "8": "CONFIG",
      };
      if (navMap[e.key] && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag !== "INPUT" && tag !== "TEXTAREA") setView(navMap[e.key]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setPlacement, setPending, select]);

  // ---- nav with panel-open sound ----
  function handleNav(v: NavView) {
    if (v !== view) {
      sfx.play("transition");
    } else {
      sfx.play("click");
    }
    setView(v);
  }

  // ---- garrison selection ----
  function handleGarrisonSelect(id: string | null) {
    if (!id) {
      select(null);
      return;
    }
    const target = state?.garrisons.find((o) => o.id === id);
    if (!target || !state) {
      select(id);
      return;
    }
    // pending strike flow — don't toggle-close mid-strike
    if (pending && pending.sourceId) {
      const isAggressive = ["DRONE_STRIKE", "CYBER_ATTACK", "ESPIONAGE"].includes(pending.type);
      const srcMine = state.garrisons.find((o) => o.id === pending.sourceId)?.faction === state.operative.faction;
      if (isAggressive && target.faction !== state.operative.faction && srcMine) {
        sendAction({
          kind: "launch-mission",
          missionType: pending.type,
          sourceId: pending.sourceId,
          targetId: id,
        });
        sfx.play("confirm");
        toast({
          title: "MISSION COMMITTED",
          description: `${MISSION_META[pending.type].label}: → ${target.name}`,
        });
        setPending(null);
        select(id);
        return;
      }
    }
    // toggle: clicking the already-selected garrison closes the quick view
    if (id === selectedId) {
      sfx.play("click");
      select(null);
      return;
    }
    sfx.play("select");
    select(id);
  }

  function handleMapClick(lat: number, lng: number) {
    if (!placement) return;
    const type: GarrisonType = placement.type;
    sendAction({ kind: "place-garrison", type, lat, lng });
    sfx.play("place");
    toast({
      title: "GARRISON DEPLOYED",
      description: `${type === "Safehouse" ? "Safehouse" : "Tactical Safehouse"} at ${lat.toFixed(2)}°, ${lng.toFixed(2)}°`,
    });
    setPlacement(null);
  }

  const hasState = !!state;

  // ---- compute initial map center from operative's home garrison ----
  const initialCenter: [number, number] = React.useMemo(() => {
    if (!state) return [-32, 8];
    const mine = state.garrisons.find(
      (o) => o.faction === state.operative.faction && o.type === "Safehouse",
    );
    return mine ? [mine.lng, mine.lat] : [-32, 8];
  }, [state]);

  // ---- garrison detail card (shown for any selected garrison) ----
  const selectedGarrison = selectedId ? state?.garrisons.find((o) => o.id === selectedId) ?? null : null;

  // ---- render ----
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black scanlines">
      {/* Boot gate — shown until state arrives (keeps loading bar visible during handshake) */}
      {(!started || !hasState) && (
        <BootScreen
          onConnect={handleConnect}
          bootError={bootError}
          faction={state?.operative.faction ?? "FANG"}
        />
      )}

      {/* Command deck — full-screen map with HUD overlays */}
      {hasState && (
        <>
          {/* Full-screen map stage */}
          <main className="vignette absolute inset-0 bg-black">
            <div className="grid-overlay--major absolute inset-0 opacity-20" />
            <MapView
              initialCenter={initialCenter}
              selectedId={selectedId}
              onSelect={handleGarrisonSelect}
              onMapClick={handleMapClick}
              placementMode={!!placement}
            />

            {/* HUD corner overlays */}
            {state && (
              <>
                <div className="pointer-events-none absolute right-4 top-20 font-mono text-[10px] tracking-mega text-white/45">
                  {state.garrisons.length} NODES · {state.missions.filter((m) => m.status === "ACTIVE").length} OPS
                </div>
                {clock && (
                  <div className="pointer-events-none absolute bottom-12 left-20 font-mono text-[10px] tracking-mega text-white/45">
                    SYSTEM TIME {clock.clockLabel}
                  </div>
                )}
                {placement && (
                  <div className="pointer-events-none absolute bottom-16 left-1/2 -translate-x-1/2 border border-white/30 bg-black/70 px-4 py-1.5 font-mono text-[10px] tracking-wide-2 text-white backdrop-blur">
                    ● PLACEMENT ARMED · {placement.type} · CLICK TO EMPLACE
                  </div>
                )}
                {pending && pending.sourceId && (
                  <div className="pointer-events-none absolute bottom-16 left-1/2 -translate-x-1/2 border border-white/30 bg-black/70 px-4 py-1.5 font-mono text-[10px] tracking-wide-2 text-white backdrop-blur">
                    ◆ {MISSION_META[pending.type].label} ARMED · CLICK RIVAL GARRISON TO COMMIT
                  </div>
                )}
              </>
            )}

            {/* Garrison detail card — free-floating quick view for any selected garrison. */}
            <GarrisonDetailCard
              garrison={selectedGarrison}
              onClose={() => select(null)}
            />
          </main>

          {/* HUD overlays — floating over the canvas, no bars */}
          <CommandBar />
          <NavRail view={view} onChange={handleNav} />
          <LeftPanel view={view} onNav={handleNav} />
          <StatusBar />
        </>
      )}

      {/* Toaster — moved here from layout.tsx so it's client-only (not in SSR path) */}
      <Toaster />
    </div>
  );
}
