"use client";

import { create } from "zustand";
import type {
  GameState,
  Briefing,
  ClientAction,
  MissionType,
  GarrisonType,
} from "@/lib/types";

// socket.io-client is lazy-imported inside getSocket() so it stays OUT of the
// initial client JS bundle (~40KB saved). It's only needed after the user
// clicks ESTABLISH UPLINK — by which point the boot screen has been visible
// for ~2.6s, plenty of time for the dynamic import to resolve. The type-only
// import below is erased at compile time (zero runtime cost).
import type { Socket } from "socket.io-client";

interface CommandStore {
  state: GameState | null;
  connected: boolean;
  briefing: Briefing | null;
  briefingLoading: boolean;
  selectedGarrisonId: string | null;
  // mission launcher draft
  pendingMission: { type: MissionType; sourceId: string | null } | null;
  placementMode: { type: GarrisonType } | null;
  socket: Socket | null;
  // actions
  init: () => () => void;
  sendAction: (a: ClientAction) => void;
  selectGarrison: (id: string | null) => void;
  setPendingMission: (m: { type: MissionType; sourceId: string | null } | null) => void;
  setPlacementMode: (m: { type: GarrisonType } | null) => void;
  fetchBriefing: () => Promise<void>;
  clearBriefing: () => void;
}

let socketSingleton: Socket | null = null;
let socketPromise: Promise<Socket> | null = null;

/**
 * Lazily import + create the socket.io connection. The socket.io-client
 * library (~40KB) is code-split into a separate chunk that only loads when
 * the user actually clicks ESTABLISH UPLINK — keeping it out of the initial
 * page bundle for faster hydration.
 */
function getSocket(): Promise<Socket> {
  if (socketSingleton) return Promise.resolve(socketSingleton);
  if (socketPromise) return socketPromise;
  socketPromise = import("socket.io-client").then(({ io }) => {
    socketSingleton = io("/", {
      // Allow polling handshake (reliably forwarded by Caddy) then upgrade
      // to websocket for real-time ticks.
      transports: ["polling", "websocket"],
      query: { XTransformPort: "3003" },
      reconnection: true,
      reconnectionDelay: 800,
    });
    return socketSingleton;
  });
  return socketPromise;
}

export const useCommand = create<CommandStore>((set, get) => ({
  state: null,
  connected: false,
  briefing: null,
  briefingLoading: false,
  selectedGarrisonId: null,
  pendingMission: null,
  placementMode: null,
  socket: null,

  init: () => {
    let disposed = false;
    let socket: Socket | null = null;
    let onState: ((s: GameState) => void) | null = null;
    let onConnect: (() => void) | null = null;
    let onDisconnect: (() => void) | null = null;

    getSocket().then((s) => {
      if (disposed) return; // unmounted before socket resolved
      socket = s;
      set({ socket: s });

      onState = (st: GameState) => set({ state: st });
      onConnect = () => set({ connected: true });
      onDisconnect = () => set({ connected: false });

      s.on("state", onState);
      s.on("connect", onConnect);
      s.on("disconnect", onDisconnect);

      if (!s.connected) s.connect();
    });

    return () => {
      disposed = true;
      if (socket && onState && onConnect && onDisconnect) {
        socket.off("state", onState);
        socket.off("connect", onConnect);
        socket.off("disconnect", onDisconnect);
      }
    };
  },

  sendAction: (a) => {
    const socket = get().socket;
    if (!socket) return;
    socket.emit("action", a);
  },

  selectGarrison: (id) => set({ selectedGarrisonId: id }),

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
