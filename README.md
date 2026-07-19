# 42 — COMMAND CENTER

A gamified, real-time strategy command interface for a decentralized compute
network. Three factions — **FANG**, **HAMMER**, and **RESOLUTE** — wage live
wargames across a real 1:1 satellite Earth globe. Monochromatic black & white,
futuristic, cinematic.

## Stack

- **Frontend** — Next.js 16 (App Router, standalone output), TypeScript,
  Tailwind 4 + shadcn/ui, zustand, framer-motion, MapLibre GL JS (3D globe)
- **Game engine** — socket.io authoritative in-memory game loop on `:3003`
  (2s tick: uptime accrual, mission progression, faction AI, events)
- **Persistence** — Prisma + SQLite (operative profile, war log)
- **AI** — ARIA tactical co-pilot briefings via server-side LLM route

## Run (development)

```bash
npm install
(cd mini-services/game-engine && npm install)
npx prisma generate
npm run engine &   # game engine on :3003
npm run dev        # web on :3000
```

Open http://localhost:3000 — click **ESTABLISH UPLINK**.

## Run (production, one container)

```bash
docker build -t 42-command-center .
docker run -p 3000:3000 42-command-center
```

`npm start` launches both processes via `scripts/start-production.mjs`
(engine + Next standalone server); the web server proxies `/socket.io` and
`/engine/*` to the engine internally.

## Game loop

- Deploy garrisons (Safehouse / Tactical Safehouse) anywhere on the globe —
  uptime accrues build points.
- Run missions: **Drone Strike, Cyber Attack, Espionage, Recon, Build,
  Defend** — attacks require intel targets revealed via espionage.
- Economy: **VOTC** (network currency) + per-faction tokens pay for missions
  and upgrades.
- ARIA (AI co-pilot) issues priority briefings with executable
  recommendations.

See `PLATFORM-REPORT.md` for the full architecture inventory and PRD.
