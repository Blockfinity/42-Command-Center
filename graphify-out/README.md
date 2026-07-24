# graphify-out/

This folder contains the **graphify knowledge graph** for the 42-Command-Center
repo. Committed to git so any agent that clones gets the pre-built graph.

## Files

| File | Purpose | Who reads it |
|---|---|---|
| `graph.json` | Knowledge graph (1065 nodes, 2096 edges, 124 communities). | Query via `graphify query/path/explain` — **do not bulk-read** |
| `GRAPH_REPORT.md` | Plain-language structural map. | Read **once per session** |
| `AUDIT.md` | Built-vs-unbuilt audit findings. | Read for "where is the project at" |
| `graph.html` | Interactive D3 visualization. | Open in browser (human use) |
| `manifest.json` | Build manifest. | Freshness checks |

## How to query

```bash
export PATH=/home/z/graphify-venv/bin:$PATH
graphify query "how does the game engine tick loop work"
graphify path "submitStrike" "factionUpdate"
graphify explain "gameEngine"
graphify affected "factionAI"
graphify god-nodes
```

## How to refresh

```bash
graphify update .               # incremental, seconds
graphify . --code-only          # full rebuild
make audit                      # regenerate AUDIT.md
```

Pre-commit hook auto-refreshes on commit.

## Privacy

Built with `--code-only` — zero LLM calls, zero network calls, zero telemetry.
Query logging disabled. `.env` files auto-skipped as sensitive.
