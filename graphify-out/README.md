# graphify-out/ — Knowledge graph for 42-Command-Center

> **Status:** EMPTY (scaffolding phase)
> **Reason:** this repo currently contains only `README.md` (a markdown stub).
>           Graphify's `--code-only` mode skips markdown, so no nodes were
>           extracted. As real code lands, the pre-commit hook will refresh
>           this folder automatically.

## What this folder will contain (once code exists)

| File | Purpose |
|---|---|
| `graph.json` | The knowledge graph (nodes + edges) — query with `graphify query`, never bulk-read |
| `GRAPH_REPORT.md` | Plain-language structural map — READ FIRST, once per session |
| `AUDIT.md` | Built-vs-unbuilt audit findings — read for "where are we at" |
| `graph.html` | Interactive D3 visualization (open in browser) |
| `manifest.json` | Graph build manifest (versions, timestamps) |
| `.graphify_root` | Marker file — tells graphify this is the graph root |

## Refreshing the graph

```bash
make graph         # full rebuild (code-only, local, no LLM, no phone-home)
make graph-update  # incremental refresh after edits (seconds, no LLM)
```

A git pre-commit hook at `.git/hooks/pre-commit` auto-refreshes the graph on
every commit that includes code-file changes. You do not need to run it manually.

## Privacy

Graphify runs fully local in `--code-only` mode. No LLM API calls during build.
No telemetry. Source audit confirmed no analytics SDKs, no background reporting
threads, active SSRF protection in `llm.py`. See `AGENTS.md` § Privacy.

## Staleness check

```bash
grep "Built from commit" GRAPH_REPORT.md   # when it exists
git rev-parse HEAD
# If they differ and you've made structural changes, rebuild:
make graph
```
