"use client";

import { create } from "zustand";
import type {
  GameState,
  Briefing,
  ClientAction,
  MissionType,
  OutpostType,
} from "@/lib/types";
import { io, type Socket } from "socket.io-client";

interface CommandStore {
  state: GameState | null;
  connected: boolean;
  briefing: Briefing | null;
  briefingLoading: boolean;
  selectedOutpostId: string | null;
  // mission launcher draft
  pendingMission: { type: MissionType; sourceId: string | null } | null;
  placementMode: { type: OutpostType } | null;
  socket: Socket | null;
  // actions
  init: () => () => void;
  sendAction: (a: ClientAction) => void;
  selectOutpost: (id: string | null) => void;
  setPendingMission: (m: { type: MissionType; sourceId: string | null } | null) => void;
  setPlacementMode: (m: { type: OutpostType } | null) => void;
  fetchBriefing: () => Promise<void>;
  clearBriefing: () => void;
}

let socketSingleton: Socket | null = null;

function getSocket(): Socket {
  if (!socketSingleton) {
    socketSingleton = io("/", {
      // Allow polling handshake (reliably forwarded by Caddy) then upgrade
      // to websocket for real-time ticks.
      transports: ["polling", "websocket"],
      query: { XTransformPort: "3003" },
      reconnection: true,
      reconnectionDelay: 800,
    });
  }
  return socketSingleton;
}

export const useCommand = create<CommandStore>((set, get) => ({
  state: null,
  connected: false,
  briefing: null,
  briefingLoading: false,
  selectedOutpostId: null,
  pendingMission: null,
  placementMode: null,
  socket: null,

  init: () => {
    const socket = getSocket();
    set({ socket });

    const onState = (s: GameState) => set({ state: s });
    const onConnect = () => set({ connected: true });
    const onDisconnect = () => set({ connected: false });

    socket.on("state", onState);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    if (!socket.connected) socket.connect();

    return () => {
      socket.off("state", onState);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  },

  sendAction: (a) => {
    const socket = get().socket;
    if (!socket) return;
    socket.emit("action", a);
  },

  selectOutpost: (id) => set({ selectedOutpostId: id }),

  setPendingMission: (m) => set({ pendingMission: m }),

  setPlacementMode: (m) => set({ placementMode: m }),

  fetchBriefing: async () => {
    const { state } = get();
    if (!state) return;
    set({ briefingLoading: true });
    try {
      const res = await fetch("/api/ai/briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state }),
      });
      if (!res.ok) throw new Error(`briefing ${res.status}`);
      const b = (await res.json()) as Briefing;
      set({ briefing: b, briefingLoading: false });
    } catch {
      set({ briefingLoading: false });
    }
  },

  clearBriefing: () => set({ briefing: null }),
}));
