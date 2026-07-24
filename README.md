# 42-Command-Center

The command-center / control-plane UI for [Network 42](https://github.com/Blockfinity/42) —
a decentralized compute platform for the sovereign web.

> **Status:** scaffolding phase — this repo is being set up. Code will land here
> as the command-center UI is built.

---

> **AI agents (Claude Code, Codex, Cursor, Fable 5, Kimi, GLM-5, Aider, OpenCode, etc.):**
> read [`AGENTS.md`](./AGENTS.md) before working in this repo. It documents the
> two memory layers installed here — **graphify** (structural code map at
> `graphify-out/`) and **stash** (agent session memory at `vendor/stash/`) — and
> the query/refresh protocol that saves tokens and prevents forgetting.

---

## Memory stack

| Layer | What it remembers | Where |
|---|---|---|
| **Graphify** (structural) | What the code IS — functions, classes, dependencies, communities | `graphify-out/` |
| **Stash** (temporal) | What agents DID — session transcripts, prompts, decisions, edits | `vendor/stash/` (local backend at `http://localhost:8001`) |

The graphify graph is currently empty (this repo has no code yet). It will
populate automatically on the first commit that adds code, via the pre-commit
hook.

## Quick start for agents

```bash
make help          # see all available targets
make graph         # build the knowledge graph (once code exists)
make audit         # regenerate AUDIT.md
make stash-up      # start the local stash backend
make session-end   # refresh graph + audit + show WORKLOG.md template
```

## Privacy

- **Graphify** runs fully local in `--code-only` mode. No LLM, no telemetry, no phone-home.
- **Stash** is vendored at `vendor/stash/` with all upstream-SaaS URLs patched to
  `http://localhost:8001` and all telemetry modules hard-no-op'd. See
  `vendor/stash/PRIVACY_PATCH.md` for the full patch record.

Verify at any time: `make stash-audit`
