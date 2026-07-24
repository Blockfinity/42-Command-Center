#!/usr/bin/env bash
# scripts/session-context.sh — unified memory query across graphify + stash.
#
# Returns a single token-efficient answer combining:
#   1. Structural state from graphify (what the code IS)
#   2. Temporal state from stash (what prior agents DID)
#
# Usage:
#   make session-context Q="how does proof of compute work"
#   scripts/session-context.sh "how does proof of compute work"
#   scripts/session-context.sh "proof_of_compute_v3"   # also tries as node id
#
# Design:
#   - Runs `graphify query` to find relevant structural nodes
#   - Runs `stash search` to find prior agent sessions matching the question
#   - For each graphify node id found, ALSO searches stash for sessions that
#     touched that node (this is where the WORKLOG.md "Graphify nodes touched"
#     convention pays off — agents record node ids in their worklog entries,
#     which stash indexes when the worklog is shared via `make stash-share`)
#   - Falls back gracefully if either tool is missing or the stash backend
#     is down — the question still gets answered from whichever layer is up
#   - Does NOT cap either tool: graphify runs native (no --budget override),
#     stash searches use a high limit (1000) so nothing is forgotten
#
# Privacy:
#   - graphify runs locally (--code-only, no LLM, no network)
#   - stash runs locally (http://localhost:8001, no upstream)
#   - No data leaves the machine
#
# Exit codes:
#   0  at least one source answered
#   1  neither source answered (graphify missing AND stash down/missing)

set -uo pipefail

GRAPHIFY="${GRAPHIFY_BIN:-/home/z/graphify-venv/bin/graphify}"
STASH="${STASH_BIN:-/home/z/stash-venv/bin/stash}"

if [ "$#" -lt 1 ] || [ -z "${1:-}" ]; then
  echo "Usage: $0 \"<question or node id>\"" >&2
  echo "  make session-context Q=\"how does auth work\"" >&2
  exit 1
fi

QUESTION="$1"

echo "============================================================"
echo " UNIFIED MEMORY QUERY"
echo " Question: $QUESTION"
echo "============================================================"
echo ""

# ---------------------------------------------------------------------------
# Layer 1: GRAPHIFY (structural — what the code IS)
# ---------------------------------------------------------------------------
GRAPHIFY_ANSWERED=0
GRAPHIFY_NODES=""

if [ -x "$GRAPHIFY" ]; then
  echo "─── GRAPHIFY (structural map) ──────────────────────────────"
  # Capture graphify's NATIVE query output, then echo it back uncapped.
  # No --budget override — graphify uses its own native default. Agents who want
  # a different budget should call `graphify query` directly.
  OUT=$("$GRAPHIFY" query "$QUESTION" 2>&1) || true
  if [ -n "$OUT" ] && [ "$OUT" != "" ]; then
    echo "$OUT"
    GRAPHIFY_ANSWERED=1
    # Extract node ids from graphify output. Node ids look like
    # "backend_routes_auth_login" or "frontend_src_app_page" — underscored paths.
    # We grep for the canonical graphify node-id pattern.
    GRAPHIFY_NODES=$(echo "$OUT" | grep -oE '[a-z][a-z0-9_]*_[a-z0-9_]+' | sort -u)
  else
    echo "(graphify returned no answer — graph may be empty or stale)"
  fi
  echo ""
else
  echo "─── GRAPHIFY (structural map) ──────────────────────────────"
  echo "(graphify binary not found at $GRAPHIFY — install with: python3 -m venv /home/z/graphify-venv && /home/z/graphify-venv/bin/pip install graphify)"
  echo ""
fi

# ---------------------------------------------------------------------------
# Layer 2: STASH (temporal — what prior agents DID)
# ---------------------------------------------------------------------------
STASH_ANSWERED=0

stash_search() {
  local query="$1"
  local label="$2"
  if [ ! -x "$STASH" ]; then
    echo "(stash CLI not found at $STASH — install with: make stash-setup)"
    return 1
  fi
  # Try the search. If the backend is down, stash prints an error and exits
  # non-zero — we swallow it and report the failure cleanly.
  local out
  out=$("$STASH" search "$query" --include-sources sessions -n 1000 2>&1) || true
  if echo "$out" | grep -qiE 'connection|refused|error|down|unreachable'; then
    echo "(stash backend unreachable — start with: make stash-up)"
    return 1
  fi
  if [ -z "$out" ] || [ "$out" = "" ]; then
    return 1
  fi
  echo "─── STASH: $label ──────────────────────────────────────────"
  echo "$out"
  echo ""
  return 0
}

# 2a. Search stash for the question itself
if stash_search "$QUESTION" "prior sessions matching question"; then
  STASH_ANSWERED=1
fi

# 2b. For each graphify node id found, search stash for sessions that touched
# that node. This relies on the WORKLOG.md "Graphify nodes touched:" convention
# — agents record node ids when they end a session, and stash indexes the
# worklog when shared.
if [ -n "$GRAPHIFY_NODES" ] && [ -x "$STASH" ]; then
  echo "─── STASH: sessions that touched related graphify nodes ────"
  FOUND_NODE_SESSION=0
  while IFS= read -r node; do
    [ -z "$node" ] && continue
    out=$("$STASH" search "$node" --include-sources sessions -n 1000 2>&1) || true
    if [ -n "$out" ] && ! echo "$out" | grep -qiE 'connection|refused|error|down|unreachable|no results|no matches'; then
      echo "  node: $node"
      echo "$out" | sed 's/^/    /'
      FOUND_NODE_SESSION=1
    fi
  done <<< "$GRAPHIFY_NODES"
  if [ "$FOUND_NODE_SESSION" -eq 0 ]; then
    echo "(no prior stash sessions reference these graphify nodes yet)"
  fi
  echo ""
  STASH_ANSWERED=1
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo "============================================================"
echo " SUMMARY"
echo "============================================================"
echo "  graphify:  $([ $GRAPHIFY_ANSWERED -eq 1 ] && echo 'answered ✓' || echo 'no answer ✗')"
echo "  stash:     $([ $STASH_ANSWERED -eq 1 ] && echo 'answered ✓' || echo 'no answer ✗')"
echo ""

if [ $GRAPHIFY_ANSWERED -eq 0 ] && [ $STASH_ANSWERED -eq 0 ]; then
  echo "Neither memory layer answered. Possible causes:"
  echo "  - graphify binary missing (install: python3 -m pip install graphify)"
  echo "  - stash backend down (start: make stash-up)"
  echo "  - question doesn't match any code structure or prior session"
  echo ""
  echo "Falling back to reading source directly is acceptable but burns more"
  echo "tokens. Re-run this query after fixing the missing layer."
  exit 1
fi

echo "Next steps:"
echo "  - Drill into a specific node:      graphify explain \"<node_id>\""
echo "  - Read a prior session transcript: make stash-read ID=<session-id>"
echo "  - Trace impact before refactoring: graphify affected \"<node_id>\""
echo ""
exit 0
