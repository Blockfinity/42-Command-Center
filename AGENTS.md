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

### After making changes — MANDATORY

1. The git pre-commit hook (`.git/hooks/pre-commit`) auto-refreshes the graph
   on commit. You do not need to run it manually.
2. Regenerate the audit if structural changes occurred: `make audit`
3. Append to `WORKLOG.md` what you did, what you decided, what's next.
4. Commit `graphify-out/` + `WORKLOG.md` + your code changes together.

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
