# Makefile for 42-Command-Center — graphify + audit targets
GRAPHIFY ?= /home/z/graphify-venv/bin/graphify

.PHONY: help graph graph-update audit query path explain watch

help:
	@echo "42-Command-Center — graphify + audit targets"
	@echo ""
	@echo "  make graph         Build the knowledge graph (full, code-only, local)"
	@echo "  make graph-update  Refresh the graph incrementally after edits"
	@echo "  make audit         Regenerate graphify-out/AUDIT.md"
	@echo "  make query Q='..'  Query the graph"
	@echo "  make path A='x' B='y'  Trace path between two nodes"
	@echo "  make explain N='x' Explain a node"
	@echo "  make watch         Watch mode — live graph updates"
	@echo ""

graph:
	$(GRAPHIFY) . --code-only
	$(MAKE) audit

graph-update:
	$(GRAPHIFY) update .
	$(MAKE) audit

audit:
	python3 scripts/generate_audit.py

query:
	$(GRAPHIFY) query "$(Q)"

path:
	$(GRAPHIFY) path "$(A)" "$(B)"

explain:
	$(GRAPHIFY) explain "$(N)"

watch:
	$(GRAPHIFY) watch .
