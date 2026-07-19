// 42 — unified production launcher (single container / single process group).
//
// The platform runs two processes:
//   1. game engine (socket.io, authoritative state) on :3003 — TypeScript,
//      executed via tsx straight from source (it has no build step).
//   2. Next.js standalone server on :${PORT:-3000} — serves the app and
//      proxies /socket.io + /engine to the engine (see next.config.ts).
//
// Either process dying takes the group down so the orchestrator restarts it.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

const children = [];
let shuttingDown = false;

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) c.kill("SIGTERM");
  // Give children a moment to exit cleanly, then hard-exit.
  setTimeout(() => process.exit(code), 1500).unref();
}

function run(name, cmd, args, env = {}) {
  const child = spawn(cmd, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  children.push(child);
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    console.error(`[42] ${name} exited (code=${code} signal=${signal}) — shutting down group`);
    shutdown(code ?? 1);
  });
  return child;
}

run("engine", npx, ["tsx", "mini-services/game-engine/index.ts"]);
run("web", process.execPath, [".next/standalone/server.js"], {
  PORT: process.env.PORT ?? "3000",
  HOSTNAME: process.env.HOSTNAME ?? "0.0.0.0",
  NODE_ENV: "production",
});

process.on("SIGTERM", () => shutdown(0));
process.on("SIGINT", () => shutdown(0));
