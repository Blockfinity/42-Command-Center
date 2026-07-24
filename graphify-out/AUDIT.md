# AUDIT.md — Built vs Unbuilt Audit for the 42 repo

> **Generated:** 2026-07-24 01:20 UTC  
> **From commit:** `1cbe3c5`  
> **Graph:** 1065 nodes, 2096 edges, 124 communities  
> **Method:** structural diff of `graphify-out/graph.json` against `PROJECT_BIBLE.md` + `README.md`  
> **Privacy:** fully local, no LLM, no network calls

This audit diffs what the codebase **structurally contains** (from the graphify
graph) against what the specs **declare should exist** (from PROJECT_BIBLE.md and
README.md). It is a structural audit, not a behavioral/runtime audit. See
`AGENTS.md` § Privacy and the conversation worklog for audit scope and blind spots.

---

## 1. Component Coverage (declared vs built)

| Component | Declared? | Folder exists? | Files | Graph nodes | Graph edges | Critical (per Bible)? | Finding |
|---|---|---|---|---|---|---|---|
| `src/app` | ✅ | ✅ | 12 | 30 | 74 | ⚠️ YES | ✅ Built (30 nodes, 74 edges) |
| `src/components` | ✅ | ✅ | 91 | 492 | 1229 | no | ✅ Built (492 nodes, 1229 edges) |
| `src/hooks` | ✅ | ✅ | 3 | 32 | 78 | no | ✅ Built (32 nodes, 78 edges) |
| `src/lib` | ✅ | ✅ | 14 | 149 | 805 | ⚠️ YES | ✅ Built (149 nodes, 805 edges) |
| `mini-services` | ✅ | ✅ | 9 | 53 | 169 | ⚠️ YES | ✅ Built (53 nodes, 169 edges) |
| `prisma` | ✅ | ✅ | 1 | 0 | 0 | no | ⚠️ Folder exists but no graph nodes (empty or all-ignored files) |
| `scripts` | ✅ | ✅ | 2 | 5 | 5 | no | ⚠️ Thin (5 nodes) — possibly incomplete |
| `docs` | ✅ | ✅ | 1 | 0 | 0 | no | ⚠️ Folder exists but no graph nodes (empty or all-ignored files) |
| `public` | ✅ | ✅ | 10 | 0 | 0 | no | ⚠️ Folder exists but no graph nodes (empty or all-ignored files) |

## 2. Critical Systems Status (per PROJECT_BIBLE.md §5)

PROJECT_BIBLE.md declares these systems as foundational and high-risk-if-damaged.
Here is their structural status from the graph:

| System | Graph evidence | Finding |
|---|---|---|
| Game engine tick loop | 6 node(s) matching `tick` | ✅ Present (6 nodes, 1 in expected folder) |
| Faction system (FANG/HAMMER/RESOLUTE) | 24 node(s) matching `faction` | ✅ Present (24 nodes, 17 in expected folder) |
| Auth (Telegram + wallet + dev-passgate) | 39 node(s) matching `auth` | ✅ Present (39 nodes, 19 in expected folder) |
| Socket.io real-time transport | 18 node(s) matching `socket` | ✅ Present (18 nodes, 2 in expected folder) |
| MapLibre 3D globe | 103 node(s) matching `map` | ✅ Present (103 nodes, 71 in expected folder) |
| Prisma persistence | 5 node(s) matching `prisma` | ✅ Present (5 nodes, 0 in expected folder) |
| ARIA AI co-pilot | 9 node(s) matching `aria` | ✅ Present (9 nodes, 0 in expected folder) |

## 3. Stub / Incomplete Markers (13 found)

These are TODO/FIXME/NotImplemented/placeholder/WIP markers in real 42 code
(excludes `swarm-deps/`, `archive/`, `test_reports/`). Each is a potential
incomplete-work finding. Triage by component.

### By file

| File | Count | Markers |
|---|---|---|
| `src/components/command/map/map-controller.ts` | 4 | wip |
| `examples/websocket/frontend.tsx` | 2 | placeholder |
| `.githooks/pre-reset` | 1 | wip |
| `src/components/ui/command.tsx` | 1 | placeholder |
| `src/components/ui/input.tsx` | 1 | placeholder |
| `src/components/ui/select.tsx` | 1 | placeholder |
| `src/components/ui/textarea.tsx` | 1 | placeholder |
| `src/components/ui/toast.tsx` | 1 | wip |
| `src/lib/map/style.ts` | 1 | hack |

### Highest-signal markers (first 30)

| File:Line | Marker | Snippet |
|---|---|---|
| `.githooks/pre-reset:10` | `wip` | `# a destructive command wipes the working tree, the base is recoverable.` |
| `examples/websocket/frontend.tsx:128` | `placeholder` | `placeholder="Enter your username..."` |
| `examples/websocket/frontend.tsx:179` | `placeholder` | `placeholder="Type a message..."` |
| `src/components/command/map/map-controller.ts:166` | `wip` | `// pinch-zoom, touch twist-rotate, and touch swipe-tilt. dragRotate is` |
| `src/components/command/map/map-controller.ts:241` | `wip` | `// swipe-tilt. dragRotate is DISABLED (above) so native right-click/shift/ctrl` |
| `src/components/command/map/map-controller.ts:258` | `wip` | `//   Two-finger swipe up  → Tilt toward horizon` |
| `src/components/command/map/map-controller.ts:259` | `wip` | `//   Two-finger swipe down → Tilt toward top-down` |
| `src/components/ui/command.tsx:76` | `placeholder` | `"placeholder:text-muted-foreground flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-hidden disabled:cursor-not-allowed disabl` |
| `src/components/ui/input.tsx:11` | `placeholder` | `"file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input` |
| `src/components/ui/select.tsx:40` | `placeholder` | `"border-input data-[placeholder]:text-muted-foreground [&_svg:not([class*='text-'])]:text-muted-foreground focus-visible:border-ring focus-v` |
| `src/components/ui/textarea.tsx:10` | `placeholder` | `"border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:a` |
| `src/components/ui/toast.tsx:28` | `wip` | `"group pointer-events-auto relative flex w-full items-center justify-between space-x-2 overflow-hidden rounded-md border p-4 pr-6 shadow-lg ` |
| `src/lib/map/style.ts:65` | `hack` | `// The full style spec. Globe projection is set here (not as a post-load hack)` |

## 4. Architectural Hubs (god nodes — highest blast radius)

These are the most connected nodes in the graph. Changing them has the highest
blast radius. Touch with extra care (per PROJECT_BIBLE.md §5).

| Rank | Node | Kind | File | Degree |
|---|---|---|---|---|
| 1 | `cn()` | ? | `src/lib/utils.ts` | 256 |
| 2 | `dependencies` | ? | `package.json` | 73 |
| 3 | `lib/types.ts` | ? | `src/lib/types.ts` | 59 |
| 4 | `utils.ts` | ? | `src/lib/utils.ts` | 55 |
| 5 | `sidebar.tsx` | ? | `src/components/ui/sidebar.tsx` | 50 |
| 6 | `useCommand` | ? | `src/stores/command.ts` | 45 |
| 7 | `logic.ts` | ? | `mini-services/game-engine/src/logic.ts` | 40 |
| 8 | `left-panel.tsx` | ? | `src/components/command/left-panel.tsx` | 40 |
| 9 | `outpost-detail-card.tsx` | ? | `src/components/command/outpost-detail-card.tsx` | 36 |
| 10 | `react` | ? | `package.json` | 31 |
| 11 | `FactionId` | ? | `src/lib/types.ts` | 28 |
| 12 | `command.ts` | ? | `src/stores/command.ts` | 28 |
| 13 | `forty-two.ts` | ? | `src/lib/forty-two.ts` | 27 |
| 14 | `command-deck.tsx` | ? | `src/components/command/command-deck.tsx` | 27 |
| 15 | `converters.ts` | ? | `src/lib/map/converters.ts` | 26 |

## 5. Orphan Nodes (0 functions/classes with no incoming edges)

Functions/classes defined but never called. May be: dead code, exported APIs,
event handlers, or unfinished wiring. First 20:

| Node | Kind | File |
|---|---|---|

## 6. README Status Claims vs Graph Evidence

Cross-check of `README.md` "Current Status" section against structural evidence.

| README claim | Graph evidence | Finding |
|---|---|---|
| End-to-end job pipeline (submit → distribute → PoC → execute → verify) | False | ✅ Pipeline components present in graph |
| Proof-of-Compute v3 enforcement | False | 🚨 Missing |
| Backend ↔ P2P Daemon gRPC bridge (🚧 in progress) | False | ⚠️ gRPC nodes exist but daemon folder is EMPTY — bridge is stubbed |
| Admin Dashboard UI (🚧 in progress) | False | 🚨 Missing |

## 7. Audit Blind Spots (what this audit CANNOT see)

This is a **structural** audit. It cannot see:
- Runtime correctness (does the code actually work?)
- Test pass/fail status (are the 105 tests actually passing?)
- Secret leaks (use `gitleaks`/`trufflehog` for that)
- Dependency vulnerabilities (use `pip-audit`/`npm audit`)
- Git history / staleness (use `git log`/`git blame`)
- Anything in `.graphifyignore` (swarm-deps/, archive/, generated protobuf)
- Behavior of DEMO-path code that fakes results

For a true audit, layer this structural audit with: secret scanner + dependency
auditor + test runner + git history analysis + manual review of ignored dirs.
See `AGENTS.md` and the worklog for the full audit-stack discussion.

---

_Regenerate with: `make audit` (runs `python scripts/generate_audit.py`)_