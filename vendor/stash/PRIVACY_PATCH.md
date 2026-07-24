# PRIVACY PATCH — Blockfinity/42 vendored copy of Stash

> **Upstream:** [fergana-labs/stash](https://github.com/fergana-labs/stash) (MIT)
> **Vendored into Blockfinity/42 on:** 2026-07-24
> **Patch purpose:** make stash **private by default** — zero phone-home, zero telemetry, local-only operation.

This document records every source-level modification made to the upstream
stash source before committing it under `vendor/stash/`. It exists so that:

1. Future maintainers can see exactly what was changed and why.
2. Future upstream syncs can re-apply the patches deterministically.
3. Privacy reviewers can audit the diff without diffing 17MB of source.

---

## Why we patched instead of using upstream as-is

Upstream stash ships with **fire-and-forget product telemetry** that posts to
`api.joinstash.ai` (the SaaS backend) on every CLI invocation, every web UI
event, and every chrome-extension action. The telemetry code swallows network
errors silently, which is the exact privacy anti-pattern Blockfinity/42 will
not ship: silent failures mean data could be flowing externally without the
user noticing if the URL ever pointed anywhere off-host.

The 42 repo's privacy posture requires **zero phone-home behavior by default,
not opt-out**. We therefore patched the source rather than relying on env vars.

---

## What was patched

### 1. CLI telemetry — `cli/telemetry.py`

**Before:** `record(command)` reads config, spawns a daemon thread, and POSTs
to `/api/v1/analytics/events` on the configured backend. Opt-out only via
`STASH_TELEMETRY=0`.

**After:** `record(command)` is a hard no-op. The function is still importable
so existing call sites (`from .telemetry import record`) work unchanged.

### 2. Frontend telemetry — `frontend/src/lib/analytics.ts`

**Before:** `track()` batches events, schedules a 1s flush timer, and POSTs to
`/api/v1/analytics/events` with the user's auth token. Also registers a
`pagehide` flush.

**After:** `track()` is a hard no-op. No queue, no timer, no fetch, no
`getAuthToken` call. The `getAuthToken` import is retained for type
compatibility with call sites but never invoked.

### 3. SDK default URL — `sdk/src/stash_sdk/client.py`

**Before:** `DEFAULT_BASE_URL = "https://api.joinstash.ai"`

**After:** `DEFAULT_BASE_URL = "http://localhost:8001"`

Callers can still override via `base_url=` arg or `STASH_URL` env var, but the
default never reaches the upstream SaaS.

### 4. CLI default URL — `cli/config.py`

**Before:** `PRODUCTION_BASE_URL = "https://api.joinstash.ai"`

**After:** `PRODUCTION_BASE_URL = "http://localhost:8001"`

Users can still set `base_url` in `~/.stash/config.json` or `.stash` manifest
to point elsewhere, but the default never reaches the upstream SaaS.

### 5. Claude plugin default URL — `plugins/claude-plugin/scripts/config.py`

Same patch as #4.

### 6. Generic agent plugin default URL — `stashai/plugin/agent_config.py`

Same patch as #4. This covers all per-agent plugins that delegate to
`stashai.plugin` (codex, cursor, gemini, opencode, openclaw).

### 7. Chrome extension default URL — `chrome_extension/src/lib/stash.ts` and `chrome_extension/src/background.ts`

**Before:** `DEFAULT_API_BASE = 'https://api.joinstash.ai'`

**After:** `DEFAULT_API_BASE = 'http://localhost:8001'`

The chrome extension is not used by the 42 repo, but patched for completeness.

### 8. Marketing site (www/) default URLs — 11 files

All `const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.joinstash.ai"`
defaults in `www/app/` changed to `http://localhost:8001`. The marketing site is
not run by the 42 repo, but patched so no dormant code path can reach upstream.

### 9. Onboarding display text — `frontend/src/app/onboarding/page.tsx`

A curl command shown to users in the onboarding UI was updated to point at
localhost for consistency with the patched defaults.

---

## What was NOT patched (and why)

These upstream references to `api.joinstash.ai` were intentionally left in place
because they are not live HTTP calls:

- **`cli/main.py:132, 4087, 4538`** — conditional branches that check IF a
  user-configured URL equals the upstream SaaS (e.g. to redirect signin to
  `joinstash.ai/connect-token`). These only fire if a user explicitly
  configures the upstream URL in their config, which is the user's choice.
- **`chrome_extension/src/background.ts:194`** — same pattern: a conditional
  redirect that only fires if `apiBase === 'https://api.joinstash.ai'`.
- **Patch-documentation comments** — the "Default changed from ..." comments
  we added to each patched file mention the old URL by name for traceability.

If you want to strip even these conditional references, search for
`api.joinstash.ai` and remove the conditional branches — but doing so would
break the signin redirect logic for users who explicitly configure the
upstream SaaS.

---

## Verifying the patch

Run this from the repo root to confirm no live HTTP calls to the upstream SaaS
remain in the vendored copy:

```bash
# Should return ONLY patch comments and conditional branches (no live calls):
grep -rEn 'api\.joinstash\.ai' vendor/stash/ \
  --include="*.py" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" \
  | grep -vE 'PRIVACY PATCH|Default changed|comment|set base_url|explicitly' \
  | grep -vE '=== .*api\.joinstash\.ai|if .*api\.joinstash\.ai|managed_hosts'
```

Expected output: empty (or only the conditional branches documented above).

---

## Re-applying the patch after an upstream sync

If you sync from upstream stash in the future:

1. Re-run `grep -rEn 'api\.joinstash\.ai'` on the new source.
2. For each match that is NOT a conditional branch or comment, apply the
   equivalent patch (change the URL to `http://localhost:8001`).
3. Re-audit `cli/telemetry.py` and `frontend/src/lib/analytics.ts` — if
   upstream changed the telemetry surface, update the no-op patches
   accordingly.
4. Re-run the verification grep above.
5. Append a dated entry to this document describing what changed.

---

## License

Stash is MIT-licensed (see `vendor/stash/LICENSE`). These patches are
compatible with the MIT license and are themselves released under MIT.
