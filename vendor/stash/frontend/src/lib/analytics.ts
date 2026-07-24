"use client";

// Product telemetry for the web app — HARD-DISABLED in this vendored copy.
//
// ORIGINAL (upstream fergana-labs/stash): batched fire-and-forget POST to
// /api/v1/analytics/events with auth token, dedupe logic, and a pagehide
// flush. Mirrored cli/telemetry.py.
//
// PRIVACY PATCH (applied for Blockfinity/42 vendoring, 2026-07-24):
//   - track() is a hard no-op. It does not push to a queue, does not schedule
//     a flush, does not call getAuthToken, and does not fetch.
//   - All fetch/queue/timer code paths removed.
//   - The `getAuthToken` import is retained for type-compatibility with
//     existing call sites but is never invoked.
//
// Rationale: see vendor/stash/PRIVACY_PATCH.md. The 42 repo's privacy posture
// requires zero phone-home behavior by default.

import { getAuthToken } from "./api";

// Marked as used to satisfy bundlers that complain about unused imports
// when tree-shaking strips the no-op body.
void getAuthToken;

export function track(
  _event: string,
  _properties?: Record<string, unknown>,
  _opts?: { dedupeKey?: string; dedupeMs?: number },
): void {
  // No-op. Telemetry is permanently disabled in this vendored copy.
  return;
}
