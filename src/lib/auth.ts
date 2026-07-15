// ===== 42 — Auth utilities (isomorphic) =====
// Token encode/decode + localStorage persistence helpers. NO Node-only APIs
// so this file is safe to import from the client, the game engine (bun), and
// Next.js server routes alike.
//
// Verification (HMAC) lives in `forty-two.ts` (server-only). This module
// only DECODES dev-token payloads for display/ack purposes — never trusts
// them as authoritative.

import type {
  DevTokenPayload,
  Session,
} from "@/lib/auth-types";
import { DEV_TOKEN_PREFIX } from "@/lib/auth-types";

// ── base64url helpers (work in browser + bun + node) ──────────────────────
function b64urlEncode(s: string): string {
  // btoa is available in browser + bun + node 16+. Fall back to Buffer.
  if (typeof btoa === "function") {
    return btoa(unescape(encodeURIComponent(s)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }
  return Buffer.from(s, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlDecode(s: string): string {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const std = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  if (typeof atob === "function") {
    return decodeURIComponent(escape(atob(std)));
  }
  return Buffer.from(std, "base64").toString("utf8");
}

/**
 * Decode a dev-token's payload WITHOUT verifying the HMAC. Returns null if
 * the token is not a dev token or the payload is malformed.
 *
 * Use this to read the operative identity for display/ack. Do NOT use it to
 * authorize actions — only the server (forty-two.ts) verifies the signature.
 */
export function decodeDevTokenPayload(token: string | null | undefined): DevTokenPayload | null {
  if (!token || !token.startsWith(DEV_TOKEN_PREFIX)) return null;
  try {
    const rest = token.slice(DEV_TOKEN_PREFIX.length);
    const parts = rest.split(".");
    if (parts.length < 2) return null;
    const json = b64urlDecode(parts[0]);
    const payload = JSON.parse(json) as DevTokenPayload;
    if (payload.dev !== true) return null;
    return payload;
  } catch {
    return null;
  }
}

/** True if the token is a locally-minted dev token (vs a real 42 JWT). */
export function isDevToken(token: string | null | undefined): boolean {
  return !!token && token.startsWith(DEV_TOKEN_PREFIX);
}

// ── localStorage persistence (client-only, guarded) ───────────────────────
const SESSION_KEY = "42.session";

export function loadSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as Session;
    // Expired? drop it.
    if (session.expiresAt && session.expiresAt < Date.now()) {
      window.localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function saveSession(session: Session): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* storage full / disabled — non-fatal */
  }
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SESSION_KEY);
  } catch {
    /* non-fatal */
  }
}

/** Read the raw token from localStorage (for the socket handshake in
 *  non-React contexts). Returns null on the server or if no session. */
export function loadToken(): string | null {
  return loadSession()?.token ?? null;
}
