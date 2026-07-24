# Makefile for 42-Command-Center — graphify + stash + audit task targets
# Platform-neutral discovery layer: any agent that runs `make` or `make help`
# discovers the full memory stack (graphify + stash) and how to use it.

GRAPHIFY ?= /home/z/graphify-venv/bin/graphify
STASH_VENV ?= /home/z/stash-venv
STASH_DIR ?= vendor/stash

.PHONY: help graph graph-update audit query path explain watch \
        stash-up stash-down stash-setup stash-ls stash-share stash-read \
        stash-audit session-end session-context

help: ## Show this help
	@echo "42-Command-Center — graphify (structural memory) + stash (session memory)"
	@echo ""
	@echo "GRAPHIFY (what the code IS):"
	@echo "  make graph         Build the knowledge graph (full, code-only, local)"
	@echo "  make graph-update  Refresh the graph incrementally after edits (seconds)"
	@echo "  make audit         Regenerate graphify-out/AUDIT.md"
	@echo "  make query Q='..'  Query the graph"
	@echo "  make path A='x' B='y'  Trace path between two nodes"
	@echo "  make explain N='x' Explain a node"
	@echo "  make watch         Watch mode — live graph updates as you edit"
	@echo ""
	@echo "STASH (what agents DID):"
	@echo "  make stash-setup   One-time: install stash CLI from vendor/stash/ into a venv"
	@echo "  make stash-up      Start the local stash backend (docker-compose.local.yml)"
	@echo "  make stash-down    Stop the local stash backend"
	@echo "  make stash-ls      List prior agent sessions for this repo"
	@echo "  make stash-share   Share the current session's transcript to local stash"
	@echo "  make stash-read ID=...  Read a specific session transcript"
	@echo "  make stash-audit   Verify vendor/stash/ has no live upstream URLs (privacy)"
	@echo ""
	@echo "SESSION PROTOCOL:"
	@echo "  make session-end          Refresh graph + audit + stash-share + WORKLOG prompt"
	@echo "  make session-context Q='..'  UNIFIED query: graphify + stash in one answer"
	@echo ""

# ----------------------------- GRAPHIFY ---------------------------------

graph: ## Full graph rebuild (code-only, local, no LLM, no phone-home)
	$(GRAPHIFY) . --code-only
	$(MAKE) audit

graph-update: ## Incremental graph update (seconds, no LLM)
	$(GRAPHIFY) update .
	$(MAKE) audit

audit: ## Regenerate AUDIT.md from the graph
	python3 scripts/generate_audit.py

query: ## Query the graph: make query Q='how does auth work'
	$(GRAPHIFY) query "$(Q)"

path: ## Trace path: make path A='nodeA' B='nodeB'
	$(GRAPHIFY) path "$(A)" "$(B)"

explain: ## Explain a node: make explain N='nodeName'
	$(GRAPHIFY) explain "$(N)"

watch: ## Watch mode — live graph updates
	$(GRAPHIFY) watch .

# ----------------------------- STASH ------------------------------------

stash-setup: ## One-time: install stash CLI from vendor/stash/ into a venv
	python3 -m venv $(STASH_VENV)
	$(STASH_VENV)/bin/pip install --upgrade pip
	$(STASH_VENV)/bin/pip install -e $(STASH_DIR)/cli
	$(STASH_VENV)/bin/pip install -e $(STASH_DIR)/sdk
	@echo ""
	@echo "stash CLI installed at $(STASH_VENV)/bin/stash"
	@echo "Start backend with: make stash-up"

stash-up: ## Start the local stash backend (docker-compose.local.yml)
	cd $(STASH_DIR) && docker compose -f docker-compose.local.yml up -d
	@echo ""
	@echo "stash backend starting at http://localhost:8001"
	@echo "Stop with: make stash-down"

stash-down: ## Stop the local stash backend
	cd $(STASH_DIR) && docker compose -f docker-compose.local.yml down

stash-ls: ## List prior agent sessions for this repo
	$(STASH_VENV)/bin/stash sessions list

stash-share: ## Share the current session's transcript to local stash
	$(STASH_VENV)/bin/stash share
	@echo ""
	@echo "Session shared to local stash. Append a summary to WORKLOG.md."

stash-read: ## Read a specific session transcript: make stash-read ID=<session-id>
	$(STASH_VENV)/bin/stash sessions read "$(ID)"

stash-audit: ## Verify vendor/stash/ has no live upstream URLs (privacy check)
	@echo "Auditing vendor/stash/ for live upstream URLs..."
	@matches=$$(grep -rEn 'api\.joinstash\.ai' vendor/stash/ \
	  --include="*.py" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" \
	  2>/dev/null | grep -vE 'PRIVACY PATCH|Default changed|comment|set base_url|explicitly|managed_hosts|=== |if .*api\.joinstash\.ai' || true); \
	if [ -n "$$matches" ]; then \
	  echo "WARNING: potential live upstream URLs found:"; \
	  echo "$$matches"; \
	  echo ""; \
	  echo "Inspect these manually. See vendor/stash/PRIVACY_PATCH.md for what's expected."; \
	  exit 1; \
	else \
	  echo "OK: no live upstream URLs found. All api.joinstash.ai references are"; \
	  echo "    either patch comments or conditional branches (see PRIVACY_PATCH.md)."; \
	fi

# ----------------------------- SESSION PROTOCOL -------------------------

session-end: ## Refresh graph + audit + stash-share + show WORKLOG template
	$(GRAPHIFY) update .
	$(MAKE) audit
	@echo ""
	@echo "=========================================="
	@echo "GRAPH REFRESHED — now share session to stash (optional)"
	@echo "=========================================="
	@if [ -x "$(STASH_VENV)/bin/stash" ]; then \
	  if $(STASH_VENV)/bin/stash status >/dev/null 2>&1; then \
	    echo "[stash] backend reachable — sharing session..."; \
	    $(STASH_VENV)/bin/stash share || echo "[stash] share failed (continuing)"; \
	    echo "[stash] session shared to local stash backend"; \
	  else \
	    echo "[stash] backend not reachable — start with: make stash-up"; \
	    echo "[stash] skipping share (you can run 'make stash-share' later)"; \
	  fi; \
	else \
	  echo "[stash] CLI not installed — install with: make stash-setup"; \
	  echo "[stash] skipping share"; \
	fi
	@echo ""
	@echo "=========================================="
	@echo "SESSION END — append the following to WORKLOG.md:"
	@echo "=========================================="
	@echo "---"
	@echo "Date: $$(date -u +%Y-%m-%d_%H:%M)_UTC"
	@echo "Agent: <your name>"
	@echo "Session: <brief session goal>"
	@echo ""
	@echo "What I did:"
	@echo "- <step 1>"
	@echo ""
	@echo "Graphify nodes touched:"
	@echo "- <node_id_1> — <one-line description of what changed>"
	@echo "- <node_id_2> — <one-line description of what changed>"
	@echo '  (run: graphify query "<your task>"  to find node ids)'
	@echo '  (next agent runs: make session-context Q="<node_id>"  to recover)'
	@echo '  (this session as prior context - the cross-reference bridge)' 
	@echo ""
	@echo "Decisions made:"
	@echo "- <decision + rationale>"
	@echo ""
	@echo "What's next:"
	@echo "- <next task>"
	@echo ""
	@echo "Blockers / notes:"
	@echo "- <notes>"
	@echo ""
	@echo "=========================================="
	@echo "Then: git add graphify-out/ WORKLOG.md && git commit"
	@echo "(stash share already done above if backend was reachable)"

session-context: ## UNIFIED query: graphify + stash in one answer. Usage: make session-context Q='how does auth work'
	@if [ -z "$(Q)" ]; then \
	  echo "Usage: make session-context Q=\"<question or node id>\""; \
	  echo "Example: make session-context Q=\"how does proof of compute work\""; \
	  exit 1; \
	fi
	./scripts/session-context.sh "$(Q)"
