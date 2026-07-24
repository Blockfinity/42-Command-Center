# STASH.md

This repository has **stash** vendored at `vendor/stash/` for **agent session
memory** — the orthogonal complement to graphify's structural memory.

- **Graphify** (see GRAPHIFY.md) = what the code **IS** (structural map)
- **Stash** = what agents **DID** (temporal/session log: prompts, decisions, edits)

Together they form a complete state picture for any agent picking up the repo.

## Quick start

```bash
make stash-up       # start the local stash backend (docker-compose.local.yml)
make stash-setup    # one-time: install stash CLI from vendor/stash/ into a venv
make stash-share    # share the current session's transcript to local stash
make stash-ls       # list prior agent sessions for this repo
make stash-down     # stop the local stash backend
```

## Privacy

Stash runs **fully local** in this repo. All default URLs in the vendored copy
have been patched to `http://localhost:8001` — the upstream `api.joinstash.ai`
SaaS is never contacted unless a user explicitly overrides the config. Telemetry
modules (`cli/telemetry.py`, `frontend/src/lib/analytics.ts`) are hard-no-op'd.

See `vendor/stash/PRIVACY_PATCH.md` for the full audit + patch record.

## Agent usage

When you start a session in this repo:
1. Read `AGENTS.md` (the canonical directive)
2. Read `graphify-out/GRAPH_REPORT.md` (structural state — once per session, when it exists)
3. Read the last 3-5 entries in `WORKLOG.md` (temporal state — what prior agents did)
4. Optionally `make stash-ls` to query prior session transcripts for richer context

When you end a session:
1. Append to `WORKLOG.md` (mandatory)
2. `make stash-share` to push the session transcript to local stash (optional but recommended)
3. `git add graphify-out/ WORKLOG.md` and commit so the next agent sees fresh state
