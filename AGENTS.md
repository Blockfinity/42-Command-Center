# AGENTS.md — Agent instructions for the 42-Command-Center repo

> **Read this file first.** It is the canonical directive for any AI coding agent
> working in this repository, regardless of platform (Claude Code, Codex, Cursor,
> Fable 5, Kimi, GLM-5, Aider, OpenCode, etc.). Platform-specific entry-point
> files are intentionally NOT used — this single file is the source of truth.

## What this repo is

**42 Command Center** — a gamified real-time strategy command interface for a
decentralized compute network. Three factions (FANG, HAMMER, RESOLUTE) wage live
wargames across a 1:1 satellite Earth globe. Next.js 16 + TypeScript + Tailwind 4
+ shadcn/ui + zustand + framer-motion + MapLibre GL JS. Game engine is a socket.io
authoritative in-memory loop on :3003 (2s tick). Prisma + SQLite for persistence.
AI tactical co-pilot (ARIA) via server-side LLM route.

## The graphify knowledge graph (your codebase memory)

This repo has a **graphify knowledge graph** committed at `graphify-out/`. It is
a queryable structural map of the entire codebase (1065 nodes, 2096 edges, 124
communities). Consulting it before grepping source saves 35-55% tokens.

### BEFORE searching or reading source files — MANDATORY

1. **Read `graphify-out/GRAPH_REPORT.md` once per session** — structural map.
2. **For "where is X / who calls Y / what depends on Z" questions, query:**
   ```bash
   graphify query "<question>"            # BFS traversal
   graphify path "nodeA" "nodeB"          # shortest path
   graphify explain "nodeName"            # explain a node
   graphify affected "nodeName"           # reverse traversal
   graphify god-nodes                     # architectural hubs
   ```
   Binary at `/home/z/graphify-venv/bin/graphify`. Add to PATH:
   `export PATH=/home/z/graphify-venv/bin:$PATH`
3. **Only read raw source** when the graph points you to a specific function.

### After making changes — MANDATORY

1. **Refresh the graph:** `graphify update .` (incremental) or `graphify . --code-only` (full).
   Pre-commit hook does this automatically on commit.
2. **Regenerate audit:** `make audit`
3. **Append to `worklog.md`** (note: lowercase, existing file) — what you did, decisions, what's next.
4. **Commit `graphify-out/` + worklog + code changes together.**

## What lives where

```
graphify-out/
├── graph.json              # 1065 nodes, 2096 edges — QUERY, don't bulk-read
├── GRAPH_REPORT.md         # structural map — READ FIRST, once per session
├── AUDIT.md                # built-vs-unbuilt audit
├── graph.html              # interactive visualization (human use)
└── README.md               # self-describes the folder

src/
├── app/                    # Next.js App Router (page.tsx, layout.tsx, api/)
├── components/             # React components (command/, header/, nav/, ui/)
├── hooks/                  # React hooks
└── lib/                    # core libs (auth, db, factions, forty-two, map, sfx, strike-plan)

mini-services/game-engine/  # socket.io authoritative game loop on :3003
prisma/                     # schema.prisma + migrations
scripts/                    # tooling scripts
docs/                       # documentation
```

## Privacy (verified by source audit of graphify 0.9.25)

- `--code-only` mode: zero LLM calls, zero network calls, zero telemetry.
- Query logging OFF by default (`GRAPHIFY_QUERY_LOG_DISABLE=1`).
- No analytics SDKs, no background reporting, active SSRF protection.
- `.env` files auto-detected and skipped as sensitive.

## When the graph is stale

```bash
grep "Built from commit" graphify-out/GRAPH_REPORT.md
git rev-parse HEAD
# If differ and structural changes made: graphify . --code-only
```

## Cross-repo context

This repo pairs with the **42 backend** (Blockfinity/42) — the decentralized
compute platform this command center visualizes. If your work touches the
backend API contract or socket.io protocol, consult the 42 repo's graphify
graph (at `/home/z/work/42/graphify-out/` if working in this environment).
