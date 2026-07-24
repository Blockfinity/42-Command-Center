# GRAPHIFY.md

This repository has a **graphify knowledge graph** installed at `graphify-out/`.

Before grepping or reading source files, read `AGENTS.md` for the full usage
protocol, then read `graphify-out/GRAPH_REPORT.md` for the structural map and
`graphify-out/AUDIT.md` for the built-vs-unbuilt audit.

The graph is a queryable map of the entire codebase (1065 nodes, 2096 edges,
124 communities). Querying it instead of grepping source saves 35-55% tokens.

```bash
graphify query "<question>"     # query the graph
graphify path "A" "B"           # trace between two nodes
graphify explain "node"         # explain a node
graphify update .               # refresh after edits (local, no LLM)
```

Privacy: graphify runs fully local in `--code-only` mode. No telemetry, no
phone-home. See `AGENTS.md` for verified details.
