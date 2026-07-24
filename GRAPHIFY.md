# GRAPHIFY.md

This repository has a **graphify knowledge graph** installed at `graphify-out/`.

The graph is currently **empty** — this repo is in scaffolding phase and has no
code yet. As code lands, the pre-commit hook (`.git/hooks/pre-commit`) will
refresh the graph automatically on every commit.

Before grepping or reading source files, read `AGENTS.md` for the full usage
protocol, then read `graphify-out/GRAPH_REPORT.md` for the structural map and
`graphify-out/AUDIT.md` for the built-vs-unbuilt audit.

```bash
graphify query "<question>"     # query the graph
graphify path "A" "B"           # trace between two nodes
graphify explain "node"         # explain a node
graphify update .               # refresh after edits (local, no LLM)
```

Privacy: graphify runs fully local in `--code-only` mode. No telemetry, no
phone-home. See `AGENTS.md` § Privacy guarantees for the verified details.
