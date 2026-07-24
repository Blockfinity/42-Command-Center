# AGENTS.md — Agent instructions for the 42-Command-Center repo

> **Read this file first.** It is the canonical directive for any AI coding agent
> working in this repository, regardless of platform (Claude Code, Codex, Cursor,
> Fable 5, Kimi, GLM-5, Aider, OpenCode, etc.). Platform-specific entry-point
> files are intentionally NOT used — this single file is the source of truth.

## What this repo is

**42-Command-Center** — the command-center / control-plane UI for Network 42
(the decentralized compute platform; see sister repo `Blockfinity/42`).

This repo is in **scaffolding phase** — it currently contains only this AGENTS.md
and the memory-stack scaffolding. As real code lands here, the graphify graph
and AUDIT.md will populate automatically (refresh on commit via the pre-commit
hook).

## Two memory layers (use both)

This repo has **two complementary memory systems** installed:

| Layer | What it remembers | Where | When to consult |
|---|---|---|---|
| **Graphify** (structural) | What the code IS — functions, classes, dependencies, communities | `graphify-out/` | Before searching/reading source, to find where things live |
| **Stash** (temporal) | What agents DID — session transcripts, prompts, decisions, edits | `vendor/stash/` (runs locally at `http://localhost:8001`) | To recall prior decisions, recover session context, see what was tried |

**Graphify answers "where is X / who calls Y / how does W work".**
**Stash answers "what did the last agent try / why did they decide Z / what was the prior prompt".**

Use both. Reading only the graph loses prior decisions; reading only stash loses
the structural map.

### Native features — the PRIMARY path (use these directly, uncapped)

The reason these tools are installed is to use their **native capabilities
directly**. Do not let a wrapper stand between you and the tools. Nothing in
this repo caps either tool — graphify returns its full native answer, stash
returns full recall.

**Graphify — understand the code without reading it (once code exists here):**
```bash
graphify query "<question>"      # BFS traversal, matching nodes + edges (native)
graphify path "nodeA" "nodeB"    # shortest path between two nodes
graphify explain "nodeName"      # plain-language explanation of a node + neighbors
graphify affected "nodeName"     # reverse traversal — everything that impacts X
graphify god-nodes               # architectural hubs (highest blast radius)
make watch                       # live graph updates as you edit
```
The `graphify` binary lives at `/home/z/graphify-venv/bin/graphify`.
(The graph is currently empty — these populate as code lands.)

**Stash — never forget (full recall, no cap):**
```bash
make stash-ls                    # list ALL prior agent sessions
stash search "<query>"           # search every session + file — returns all matches
make stash-read ID=<id>          # read a full session transcript
make stash-share                 # push your session to local stash (also in make session-end)
```
The stash CLI lives at `/home/z/stash-venv/bin/stash` (install: `make stash-setup`).
Stash search returns everything that matched — nothing is truncated, nothing forgotten.

### Unified query (optional convenience — does NOT cap either tool)

For a single combined answer across both layers, you MAY run:
```bash
make session-context Q="how does the dashboard work"
```
This runs `graphify query` (native, uncapped) AND `stash search` (high limit,
uncapped) in one pass and merges structural + temporal results. It is a
convenience — it does not restrict either tool. If you only need one layer, use
the native commands above directly.

### Cross-reference convention (mandatory in WORKLOG.md)

When you end a session, the WORKLOG.md template includes a `Graphify nodes
touched:` field. **Fill it in.** This is the cross-reference bridge:

1. You record which graphify node IDs your session touched (e.g.
   `frontend_src_app_page_tsx`, `backend_routes_dashboard_py`).
2. `make stash-share` pushes your session transcript to local stash, which
   indexes the worklog text including those node IDs.
3. The next agent runs `make session-context Q="<node_id>"` and gets:
   - The structural explanation of that node (from graphify)
   - **Plus your prior session transcript** (from stash, matched on the node ID)

This is what makes the two layers actually integrated instead of just
co-installed. Without the cross-reference field filled in, the unified query
can only match on question text — it can't recover "what did the last agent do
to THIS specific node". With it filled in, it can.

## The graphify knowledge graph (your codebase memory)

The graphify graph lives at `graphify-out/`. **It is currently empty** because
this repo has no code yet — only README.md and the scaffolding files. As you
add code, the pre-commit hook will refresh the graph automatically.

### BEFORE searching or reading source files — MANDATORY (once code exists)

1. Read `graphify-out/GRAPH_REPORT.md` once per session for the structural map.
2. For "where is X / who calls Y / how does feature W work" questions, query:
   ```bash
   graphify query "<question>"
   graphify path "nodeA" "nodeB"
   graphify explain "nodeName"
   graphify affected "nodeName"
   graphify god-nodes
   ```
   The `graphify` binary lives at `/home/z/graphify-venv/bin/graphify` in this
   environment. If it's not on PATH, use the full path or `python -m graphify`.
3. Only fall back to reading raw source when the graph points you to a specific
   function and you need its exact bytes.

### After making changes — MANDATORY (once code exists)

1. **Run `make session-end`** — this single command does the full close-out:
   - Refreshes the graphify graph (`graphify update .`)
   - Regenerates AUDIT.md
   - Pushes your session transcript to local stash (`stash share`) — only if
     the stash backend is reachable; skipped gracefully otherwise
   - Prints the WORKLOG.md template with the `Graphify nodes touched:` field
     for you to fill in
2. **Fill in the WORKLOG.md entry** — especially the `Graphify nodes touched:`
   field. This is the cross-reference bridge that lets the next agent recover
   your session via `make session-context Q="<node_id>"`.
3. **Commit `graphify-out/` + `WORKLOG.md` + your code changes together** so the
   next agent sees a consistent state. The pre-commit hook auto-refreshes the
   graph on commit; you don't need to run it manually.

## Context discipline (prevent forgetting on long sessions)

- Read `GRAPH_REPORT.md` ONCE per session, not per question.
- Never bulk-read `graph.json`. Always query it surgically.
- Offload decisions, progress, and TODOs to `WORKLOG.md` as you go.
- For sessions longer than ~60 minutes, prefer ending and starting fresh
  (re-orienting from AUDIT + WORKLOG) over continuing with bloated context.

## What lives where

```
graphify-out/                # knowledge graph (currently empty — will populate as code lands)
├── README.md                # self-describes the folder + staleness
├── (graph.json)             # populated by graphify build
├── (GRAPH_REPORT.md)        # populated by graphify build
├── (AUDIT.md)               # populated by `make audit`
└── (graph.html)             # populated by graphify build

README.md                    # human readme (currently a stub)
WORKLOG.md                   # what prior agents did, decisions, what's next — APPEND here
AGENTS.md                    # THIS FILE
GRAPHIFY.md                  # 5-line beacon (points here)
STASH.md                     # stash beacon (points here)
.graphifyignore              # controls what graphify indexes (KEEP vendor/ EXCLUDED)
.stash                       # stash manifest pinning base_url to localhost
Makefile                     # graph/audit/stash/session-end targets
vendor/stash/                # vendored stash source (privacy-patched, see PRIVACY_PATCH.md)
scripts/generate_audit.py    # audit regenerator
```

## The stash session-memory layer (what prior agents did)

Stash is vendored at `vendor/stash/` and runs **fully local** at
`http://localhost:8001`. See `STASH.md` for the quick-start commands.

### Privacy

Stash is **private by default** in this repo:
- All default URLs patched to `http://localhost:8001` (see `vendor/stash/PRIVACY_PATCH.md`)
- CLI telemetry (`cli/telemetry.py`) hard-no-op'd
- Frontend telemetry (`frontend/src/lib/analytics.ts`) hard-no-op'd
- Stash backend runs locally via `docker-compose.local.yml` — data never leaves the machine
- The `.stash` manifest at the repo root pins `base_url` to localhost

Verify at any time: `make stash-audit`

## Privacy guarantees (verified by source audit)

- Graphify runs **fully local** in `--code-only` mode. No LLM API calls during
  build. No telemetry. Source audit confirmed no analytics SDKs, no background
  reporting threads, active SSRF protection in `llm.py`.
- Stash runs **fully local** with all upstream-SaaS URLs patched to localhost
  and all telemetry modules hard-no-op'd. See `vendor/stash/PRIVACY_PATCH.md`
  for the full patch record.
- Your code never leaves the machine unless you explicitly enable an LLM backend
  for graphify semantic features, or explicitly configure stash to point at the
  upstream SaaS (off by default).

## When the graph is stale

The graph is a snapshot. Check freshness before trusting it:
```bash
grep "Built from commit" graphify-out/GRAPH_REPORT.md
git rev-parse HEAD
# If they differ and you've made structural changes, rebuild:
graphify . --code-only
```

## Reasoning guidance

- Use the Leiden community structure (in `GRAPH_REPORT.md`) as your module-level
  mental model. Before planning a change, identify which communities are affected.
- Use `graphify affected "X"` before refactoring to see what depends on X.
- Use `graphify god-nodes` to find architectural hubs — highest-blast-radius files.
