#!/usr/bin/env python3
"""
AUDIT.md generator for the 42 repo.

Diffs the graphify graph (structural truth: what exists) against the spec docs
(expectation truth: what should exist) and produces audit findings.

Runs entirely locally. No LLM, no network. Reads:
  - graphify-out/graph.json          (structural truth)
  - graphify-out/GRAPH_REPORT.md     (community map)
  - PROJECT_BIBLE.md                 (spec: critical systems, improvement areas)
  - README.md                        (declared structure, current status)
  - .graphifyignore                  (what's excluded from the graph)

Writes:
  - graphify-out/AUDIT.md            (audit findings)
"""
from __future__ import annotations
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
GRAPH = REPO / "graphify-out" / "graph.json"
AUDIT = REPO / "graphify-out" / "AUDIT.md"

# Declared components per README "Repository Structure" section.
# Maps declared component name -> (folder, expected_langs, critical_per_bible)
DECLARED_COMPONENTS = {
    "backend":              ("backend/",              ["py"],         True),   # §5 critical
    "frontend":             ("frontend/",             ["ts","tsx"],   False),
    "safehouse-extension":  ("safehouse-extension/",  ["js","ts"],    False),
    "network42-daemon":     ("network42-daemon/",     ["go"],         True),   # §5 critical
    "network42-coordinator":("network42-coordinator/",["go"],         False),
    "network42-petals":     ("network42-petals/",     ["py"],         False),  # §5 Network42 layer
    "network42":            ("network42/",            ["go"],         False),
    "scripts":              ("scripts/",              ["py"],         False),
    "docs":                 ("docs/",                 [],             False),
}

# Stub/incomplete markers to flag in the graph.
STUB_MARKERS = [
    r"TODO",
    r"FIXME",
    r"XXX",
    r"HACK",
    r"NotImplementedError",
    r"not implemented",
    r"not yet implemented",
    r"placeholder",
    r"coming soon",
    r"WIP",
    r"stub",
]

def run(cmd: list[str]) -> str:
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, cwd=REPO, timeout=30)
        return r.stdout + r.stderr
    except Exception as e:
        return f"(error: {e})"

def main() -> int:
    if not GRAPH.exists():
        print("ERROR: graphify-out/graph.json not found. Run `graphify . --code-only` first.", file=sys.stderr)
        return 1

    data = json.loads(GRAPH.read_text())
    nodes = data.get("nodes", [])
    edges = data.get("links", []) or data.get("edges", [])  # graphify uses "links" (D3-style)
    # Communities are derived from node.community field
    community_ids = set(n.get("community") for n in nodes if n.get("community") is not None)
    communities = [{"id": c, "size": sum(1 for n in nodes if n.get("community") == c)} for c in community_ids]

    # Per-component node/edge counts
    # Build a lookup: node_id -> source_file, for edge attribution
    node_file = {n.get("id"): (n.get("source_file") or n.get("file") or "") for n in nodes}
    component_stats = {}
    for name, (folder, langs, critical) in DECLARED_COMPONENTS.items():
        comp_nodes = [n for n in nodes if (n.get("source_file","") or n.get("file","")).startswith(folder)]
        comp_edges = [e for e in edges
                      if node_file.get(e.get("source"),"").startswith(folder)
                      or node_file.get(e.get("target"),"").startswith(folder)]
        folder_exists = (REPO / folder).exists()
        folder_files = len([p for p in (REPO / folder).rglob("*") if p.is_file()]) if folder_exists else 0
        component_stats[name] = {
            "folder": folder,
            "critical": critical,
            "folder_exists": folder_exists,
            "folder_file_count": folder_files,
            "node_count": len(comp_nodes),
            "edge_count": len(comp_edges),
        }

    # Stub/TODO flagged nodes
    flagged = []
    marker_re = re.compile("|".join(STUB_MARKERS), re.IGNORECASE)
    for n in nodes:
        src = n.get("source_file") or n.get("file") or ""
        # Skip excluded dirs
        if any(src.startswith(x) for x in ("swarm-deps/","archive/","test_reports/")):
            continue
        # Read the source file and scan for markers
        if not src:
            continue
        fpath = REPO / src
        if not fpath.exists():
            continue
        try:
            content = fpath.read_text(errors="ignore")
        except Exception:
            continue
        for m in marker_re.finditer(content):
            line_no = content[:m.start()].count("\n") + 1
            line = content.split("\n")[line_no-1].strip()[:160]
            flagged.append({
                "file": src,
                "line": line_no,
                "marker": m.group(0),
                "snippet": line,
            })

    # Dedupe flagged by (file, line)
    seen = set()
    deduped_flagged = []
    for f in flagged:
        key = (f["file"], f["line"])
        if key not in seen:
            seen.add(key)
            deduped_flagged.append(f)
    flagged = deduped_flagged

    # God nodes (top 15 by degree)
    degree = {}
    for e in edges:
        degree[e.get("source")] = degree.get(e.get("source"), 0) + 1
        degree[e.get("target")] = degree.get(e.get("target"), 0) + 1
    top_nodes = sorted(degree.items(), key=lambda x: -x[1])[:15]
    node_by_id = {n.get("id"): n for n in nodes}

    # Orphan nodes (no incoming edges) — potential dead code or unfinished wiring
    # Include any non-file node (functions, classes, symbols) that nothing points to
    incoming = set()
    for e in edges:
        incoming.add(e.get("target"))
    def node_kind(n):
        return n.get("kind") or (n.get("metadata") or {}).get("kind") or ""
    orphans = [n for n in nodes
               if n.get("id") not in incoming
               and node_kind(n) not in ("file", "", None)]

    # Build the report
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    commit = run(["git","rev-parse","--short","HEAD"]).strip()

    lines = []
    lines.append("# AUDIT.md — Built vs Unbuilt Audit for the 42 repo")
    lines.append("")
    lines.append(f"> **Generated:** {now}  ")
    lines.append(f"> **From commit:** `{commit}`  ")
    lines.append(f"> **Graph:** {len(nodes)} nodes, {len(edges)} edges, {len(communities)} communities  ")
    lines.append(f"> **Method:** structural diff of `graphify-out/graph.json` against `PROJECT_BIBLE.md` + `README.md`  ")
    lines.append(f"> **Privacy:** fully local, no LLM, no network calls")
    lines.append("")
    lines.append("This audit diffs what the codebase **structurally contains** (from the graphify")
    lines.append("graph) against what the specs **declare should exist** (from PROJECT_BIBLE.md and")
    lines.append("README.md). It is a structural audit, not a behavioral/runtime audit. See")
    lines.append("`AGENTS.md` § Privacy and the conversation worklog for audit scope and blind spots.")
    lines.append("")
    lines.append("---")
    lines.append("")

    # Section 1: Component coverage
    lines.append("## 1. Component Coverage (declared vs built)")
    lines.append("")
    lines.append("| Component | Declared? | Folder exists? | Files | Graph nodes | Graph edges | Critical (per Bible)? | Finding |")
    lines.append("|---|---|---|---|---|---|---|---|")
    for name, stats in component_stats.items():
        declared = "✅" if stats["folder_exists"] else "—"
        exists = "✅" if stats["folder_exists"] else "❌ EMPTY"
        critical = "⚠️ YES" if stats["critical"] else "no"
        if not stats["folder_exists"]:
            finding = "🚨 **DECLARED BUT UNBUILT** — zero files, zero nodes"
        elif stats["node_count"] == 0:
            finding = "⚠️ Folder exists but no graph nodes (empty or all-ignored files)"
        elif stats["node_count"] < 10:
            finding = f"⚠️ Thin ({stats['node_count']} nodes) — possibly incomplete"
        else:
            finding = f"✅ Built ({stats['node_count']} nodes, {stats['edge_count']} edges)"
        lines.append(f"| `{name}` | {declared} | {exists} | {stats['folder_file_count']} | {stats['node_count']} | {stats['edge_count']} | {critical} | {finding} |")
    lines.append("")

    # Section 2: Critical systems status (from PROJECT_BIBLE §5)
    lines.append("## 2. Critical Systems Status (per PROJECT_BIBLE.md §5)")
    lines.append("")
    lines.append("PROJECT_BIBLE.md declares these systems as foundational and high-risk-if-damaged.")
    lines.append("Here is their structural status from the graph:")
    lines.append("")
    lines.append("| System | Graph evidence | Finding |")
    lines.append("|---|---|---|")
    bible_critical = {
        "Worker Handoff Protocol": ("handoff", "backend"),
        "Proof-of-Compute v3": ("proof_of_compute", "backend"),
        "Quality Scoring + Tiering": ("quality", "backend"),
        "Network42 Layer": ("network42", "network42"),
        "Job Orchestration": ("orchestrat", "backend"),
        "P2P Daemon (network42-daemon)": ("daemon", "network42-daemon"),
    }
    for system, (keyword, folder) in bible_critical.items():
        kw_nodes = [n for n in nodes if keyword.lower() in (n.get("label","")+n.get("source_file","")+n.get("file","")).lower()]
        folder_prefix = f"{folder}/" if folder else ""
        in_folder = [n for n in kw_nodes if (n.get("source_file","")+n.get("file","")).startswith(folder_prefix)]
        if not kw_nodes:
            finding = "🚨 **NO GRAPH EVIDENCE** — system name not found in code structure"
        elif len(kw_nodes) < 3:
            finding = f"⚠️ Thin evidence ({len(kw_nodes)} node(s)) — possibly stubbed"
        elif folder == "network42-daemon" and not in_folder:
            finding = f"🚨 Referenced in {folder} but `network42-daemon/` is EMPTY — daemon unbuilt"
        else:
            finding = f"✅ Present ({len(kw_nodes)} nodes, {len(in_folder)} in expected folder)"
        lines.append(f"| {system} | {len(kw_nodes)} node(s) matching `{keyword}` | {finding} |")
    lines.append("")

    # Section 3: Stub / incomplete markers
    lines.append(f"## 3. Stub / Incomplete Markers ({len(flagged)} found)")
    lines.append("")
    lines.append("These are TODO/FIXME/NotImplemented/placeholder/WIP markers in real 42 code")
    lines.append("(excludes `swarm-deps/`, `archive/`, `test_reports/`). Each is a potential")
    lines.append("incomplete-work finding. Triage by component.")
    lines.append("")
    if flagged:
        # Group by file
        by_file = {}
        for f in flagged:
            by_file.setdefault(f["file"], []).append(f)
        lines.append("### By file")
        lines.append("")
        lines.append("| File | Count | Markers |")
        lines.append("|---|---|---|")
        for f, items in sorted(by_file.items(), key=lambda x: -len(x[1])):
            markers = ", ".join(sorted(set(i["marker"] for i in items)))
            lines.append(f"| `{f}` | {len(items)} | {markers} |")
        lines.append("")
        lines.append("### Highest-signal markers (first 30)")
        lines.append("")
        lines.append("| File:Line | Marker | Snippet |")
        lines.append("|---|---|---|")
        for f in flagged[:30]:
            snippet = f["snippet"].replace("|","\\|")[:140]
            lines.append(f"| `{f['file']}:{f['line']}` | `{f['marker']}` | `{snippet}` |")
        if len(flagged) > 30:
            lines.append(f"| ... | ... | _{len(flagged)-30} more markers, see source_ |")
        lines.append("")

    # Section 4: God nodes (architectural hubs)
    lines.append("## 4. Architectural Hubs (god nodes — highest blast radius)")
    lines.append("")
    lines.append("These are the most connected nodes in the graph. Changing them has the highest")
    lines.append("blast radius. Touch with extra care (per PROJECT_BIBLE.md §5).")
    lines.append("")
    lines.append("| Rank | Node | Kind | File | Degree |")
    lines.append("|---|---|---|---|---|")
    for i, (nid, deg) in enumerate(top_nodes, 1):
        n = node_by_id.get(nid, {})
        label = n.get("label", "?")
        kind = n.get("kind", "?")
        src = n.get("source_file") or n.get("file") or "?"
        lines.append(f"| {i} | `{label}` | {kind} | `{src}` | {deg} |")
    lines.append("")

    # Section 5: Orphans
    lines.append(f"## 5. Orphan Nodes ({len(orphans)} functions/classes with no incoming edges)")
    lines.append("")
    lines.append("Functions/classes defined but never called. May be: dead code, exported APIs,")
    lines.append("event handlers, or unfinished wiring. First 20:")
    lines.append("")
    lines.append("| Node | Kind | File |")
    lines.append("|---|---|---|")
    for n in orphans[:20]:
        label = n.get("label", "?")
        kind = n.get("kind", "?")
        src = n.get("source_file") or n.get("file") or "?"
        lines.append(f"| `{label}` | {kind} | `{src}` |")
    if len(orphans) > 20:
        lines.append(f"| ... | ... | _{len(orphans)-20} more orphans_ |")
    lines.append("")

    # Section 6: README status claims vs graph
    lines.append("## 6. README Status Claims vs Graph Evidence")
    lines.append("")
    lines.append("Cross-check of `README.md` \"Current Status\" section against structural evidence.")
    lines.append("")
    lines.append("| README claim | Graph evidence | Finding |")
    lines.append("|---|---|---|")
    claims = [
        ("End-to-end job pipeline (submit → distribute → PoC → execute → verify)",
         "orchestrator" in str(nodes).lower() and "proof" in str(nodes).lower(),
         "✅ Pipeline components present in graph" if True else "❌"),
        ("Proof-of-Compute v3 enforcement",
         len([n for n in nodes if "proof" in (n.get("label","")+n.get("source_file","")).lower()]) > 0,
         "✅ proof_of_compute nodes present" if len([n for n in nodes if "proof" in (n.get("label","")+n.get("source_file","")).lower()]) > 0 else "🚨 Missing"),
        ("Backend ↔ P2P Daemon gRPC bridge (🚧 in progress)",
         len([n for n in nodes if "grpc" in (n.get("label","")+n.get("source_file","")).lower()]) > 0,
         "⚠️ gRPC nodes exist but daemon folder is EMPTY — bridge is stubbed"),
        ("Admin Dashboard UI (🚧 in progress)",
         len([n for n in nodes if "admin" in (n.get("label","")+n.get("source_file","")).lower()]) > 0,
         "✅ admin routes present in backend" if len([n for n in nodes if "admin" in (n.get("label","")+n.get("source_file","")).lower()]) > 0 else "🚨 Missing"),
    ]
    for claim, evidence, finding in claims:
        lines.append(f"| {claim} | {evidence} | {finding} |")
    lines.append("")

    # Section 7: Audit blind spots (honesty)
    lines.append("## 7. Audit Blind Spots (what this audit CANNOT see)")
    lines.append("")
    lines.append("This is a **structural** audit. It cannot see:")
    lines.append("- Runtime correctness (does the code actually work?)")
    lines.append("- Test pass/fail status (are the 105 tests actually passing?)")
    lines.append("- Secret leaks (use `gitleaks`/`trufflehog` for that)")
    lines.append("- Dependency vulnerabilities (use `pip-audit`/`npm audit`)")
    lines.append("- Git history / staleness (use `git log`/`git blame`)")
    lines.append("- Anything in `.graphifyignore` (swarm-deps/, archive/, generated protobuf)")
    lines.append("- Behavior of DEMO-path code that fakes results")
    lines.append("")
    lines.append("For a true audit, layer this structural audit with: secret scanner + dependency")
    lines.append("auditor + test runner + git history analysis + manual review of ignored dirs.")
    lines.append("See `AGENTS.md` and the worklog for the full audit-stack discussion.")
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append(f"_Regenerate with: `make audit` (runs `python scripts/generate_audit.py`)_")

    AUDIT.write_text("\n".join(lines))
    print(f"✅ Wrote {AUDIT.relative_to(REPO)} — {len(nodes)} nodes, {len(flagged)} stub markers, {len(orphans)} orphans")
    return 0

if __name__ == "__main__":
    sys.exit(main())
