"""Telemetry for stash CLI commands — HARD-DISABLED in this vendored copy.

ORIGINAL (upstream fergana-labs/stash): fired-and-forget POST to the configured
backend's /api/v1/analytics/events on every CLI invocation, with an opt-out via
STASH_TELEMETRY=0.

PRIVACY PATCH (applied for Blockfinity/42 vendoring, 2026-07-24):
  - record() is a hard no-op. It does not read config, does not spawn a thread,
    does not open an HTTP client, and does not check STASH_TELEMETRY (the env
    var is honored as a redundant disable but is no longer required).
  - All network code paths removed.
  - This file is intentionally still importable so existing `from .telemetry
    import record` call sites in cli/ continue to work without modification.

Rationale: the 42 repo's privacy posture requires zero phone-home behavior by
default, not opt-out. Fire-and-forget telemetry that silently swallows network
errors is exactly the pattern we will not ship. If you want analytics for a
stash deployment, run the stash backend locally and inspect its
analytics_events table directly — never the upstream SaaS.
"""

from __future__ import annotations


def record(command: str) -> None:
    """No-op. Telemetry is permanently disabled in this vendored copy."""
    return None
