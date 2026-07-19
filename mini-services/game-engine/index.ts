// 42 — Game Engine (real-time source of truth) — port 3003
// Holds the authoritative in-memory GameState, runs the game loop, and
// broadcasts snapshots to every connected commander via socket.io.
//
// ===========================================================================
// SCALING ARCHITECTURE NOTE
// ===========================================================================
// At true multi-million scale the engine would:
//   (a) shard state by region (each territory or sector is an independent
//       actor with its own ingress queue and authoritative slice of the map),
//   (b) emit delta updates instead of full snapshots (only changed fields
//       flow over the wire, drastically reducing bandwidth per client),
//   (c) batch action ingress (debounce + coalesce client actions at an edge
//       gateway before they ever touch authoritative state).
// This in-memory single-process demo validates the visualization layer —
// the broadcast is small enough at ~16 garrisons + ~80 pings + 12 territories
// that we can afford the simplicity of a full-state snapshot every 2s.
// ===========================================================================
//
// This file is now the TRANSPORT LAYER only — HTTP server + socket.io wiring.
// Game logic lives in src/logic.ts, state building in src/state.ts, static
// data in src/data.ts, and action handling in src/actions.ts.

import { createServer } from "http";
import { Server } from "socket.io";
import type { ClientAction } from "../../src/lib/types";
import { buildInitialState } from "./src/state";
import { tick, TICK_MS } from "./src/logic";
import { handleAction } from "./src/actions";

const PORT = 3003;

// ---------------------------------------------------------------------------
// Authoritative game state (in-memory)
// ---------------------------------------------------------------------------
let state = buildInitialState();

// ---------------------------------------------------------------------------
// HTTP + Socket.io setup
// ---------------------------------------------------------------------------
const httpServer = createServer((req, res) => {
  // simple health + snapshot endpoint so the Next API can read initial state
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, tick: state.tick }));
    return;
  }
  if (req.url === "/state") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(state));
    return;
  }
  res.writeHead(404);
  res.end("not found");
});

const io = new Server(httpServer, {
  // Path WITHOUT the default trailing slash: the Next.js rewrite proxy
  // forwards "/socket.io" (no slash), and engine.io's default path check
  // ("/socket.io/") would 404 it. A bare "/socket.io" prefix matches both
  // forms. Our own HTTP routes (/health, /state) are unaffected. Caddy
  // still forwards based on the XTransformPort query param.
  path: "/socket.io",
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 60000,
  pingInterval: 25000,
});

io.on("connection", (socket) => {
  console.log(`[engine] commander connected: ${socket.id}`);
  socket.emit("state", state);
  socket.on("action", (a: ClientAction) => {
    const result = handleAction(state, a);
    socket.emit("action-result", result);
  });
  socket.on("disconnect", () => console.log(`[engine] disconnected: ${socket.id}`));
  socket.on("error", (err: any) => console.error(`[engine] socket error`, err));
});

setInterval(() => {
  tick(state);
  io.emit("state", state);
}, TICK_MS);

httpServer.listen(PORT, () => {
  console.log(`[42] game engine listening on :${PORT}`);
});

process.on("SIGTERM", () => httpServer.close(() => process.exit(0)));
process.on("SIGINT", () => httpServer.close(() => process.exit(0)));
