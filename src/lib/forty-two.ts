// ===== 42 — Backend client (server-only) =====
// Proxies auth + user calls to the real 42 backend (FastAPI), and mints
// local dev sessions when the 42 backend is not configured / unreachable.
//
// WHY PROXY THROUGH NEXT.JS INSTEAD OF CALLING 42 DIRECTLY FROM THE CLIENT:
//   1. Keeps the 42 backend URL server-side (not exposed to the browser).
//   2. Avoids CORS headaches with the 42 FastAPI service.
//   3. Lets the fusion layer merge 42 + AORDF data server-side (later).
//   4. The client only ever talks to same-origin /api/auth/* routes.
//
// Token flow:
//   • Login routes (dev-passgate / wallet-login / telegram) return a JWT.
//   • The client persists it (localStorage) and sends it as
//     `Authorization: Bearer <token>` on subsequent /api/auth/* calls.
//   • This module forwards that header to 42 verbatim.

import { createHmac } from "node:crypto";
import type {
  AuthMethod,
  DevTokenPayload,
  LoginResult,
  OperativeProfile,
  Session,
} from "@/lib/auth-types";
import { DEV_TOKEN_PREFIX } from "@/lib/auth-types";
import type { FactionId } from "@/lib/types";

// ── Configuration ─────────────────────────────────────────────────────────
/** 42 backend base URL, e.g. https://api.42.example — empty when unconfigured. */
export const FORTY_TWO_URL = process.env.FORTY_TWO_BACKEND_URL?.replace(/\/$/, "") ?? "";

/** Secret used to sign dev tokens. In dev it defaults to a fixed string. */
const DEV_SECRET = process.env.AUTH_DEV_SECRET ?? "42-dev-passgate-secret";

/** Dev session lifetime (24h). */
const DEV_TTL_MS = 24 * 60 * 60 * 1000;

/** Per-request timeout for 42 backend calls. */
const FORTY_TWO_TIMEOUT_MS = 8000;

export function isFortyTwoConfigured(): boolean {
  return FORTY_TWO_URL.length > 0;
}

// ── 42 proxy ──────────────────────────────────────────────────────────────
interface ProxyOpts {
  method?: "GET" | "POST";
  path: string; // e.g. "/api/auth/wallet-login"
  body?: unknown;
  token?: string | null; // forwarded as Authorization: Bearer
}

/**
 * Forward a call to the 42 backend. Throws on network error / timeout / non-2xx.
 * Returns the parsed JSON (or null for empty bodies).
 */
export async function proxyFortyTwo<T = unknown>(opts: ProxyOpts): Promise<T> {
  if (!isFortyTwoConfigured()) {
    throw new Error("42 backend not configured (FORTY_TWO_BACKEND_URL unset)");
  }
  const url = `${FORTY_TWO_URL}${opts.path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FORTY_TWO_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    };
    const res = await fetch(url, {
      method: opts.method ?? "POST",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`42 ${opts.path} → ${res.status}: ${text.slice(0, 200)}`);
    }
    const text = await res.text();
    return (text ? JSON.parse(text) : null) as T;
  } finally {
    clearTimeout(timer);
  }
}

// ── Dev-token signing (server-only, HMAC-SHA256) ──────────────────────────
function b64urlBuf(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlStr(s: string): string {
  return b64urlBuf(Buffer.from(s, "utf8"));
}

/** Sign a dev-token payload. Shape: dev.<b64url(payload)>.<b64url(hmac)>. */
function signDevToken(payload: DevTokenPayload): string {
  const body = b64urlStr(JSON.stringify(payload));
  const sig = createHmac("sha256", DEV_SECRET).update(body).digest();
  return `${DEV_TOKEN_PREFIX}${body}.${b64urlBuf(sig)}`;
}

/** Verify a dev token's HMAC. Returns the payload if valid, else null. */
export function verifyDevToken(token: string | null | undefined): DevTokenPayload | null {
  if (!token || !token.startsWith(DEV_TOKEN_PREFIX)) return null;
  try {
    const rest = token.slice(DEV_TOKEN_PREFIX.length);
    const [body, sig] = rest.split(".");
    if (!body || !sig) return null;
    const expected = createHmac("sha256", DEV_SECRET).update(body).digest();
    const got = Buffer.from(sig.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    if (expected.length !== got.length || !expected.equals(got)) return null;
    const payload = JSON.parse(
      Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
    ) as DevTokenPayload;
    if (payload.dev !== true) return null;
    if (payload.exp && payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// ── Dev-session issuance (local fallback when 42 is unreachable) ──────────
const DEV_CODENAMES = [
  "CMDR. OXFORD",
  "CMDR. VANTA",
  "CMDR. HALCYON",
  "CMDR. RAVEN",
  "CMDR. SOLOMON",
  "CMDR. AKIRA",
];
const DEV_FACTIONS: FactionId[] = ["FANG", "HAMMER", "RESOLUTE"];

function pickDevCodename(codename?: string): string {
  if (codename && codename.trim().length > 0) {
    const c = codename.trim().toUpperCase();
    return c.startsWith("CMDR.") ? c : `CMDR. ${c}`;
  }
  return DEV_CODENAMES[Math.floor(Math.random() * DEV_CODENAMES.length)];
}

function pickDevFaction(faction?: string): FactionId {
  if (faction && (DEV_FACTIONS as string[]).includes(faction.toUpperCase())) {
    return faction.toUpperCase() as FactionId;
  }
  return DEV_FACTIONS[Math.floor(Math.random() * DEV_FACTIONS.length)];
}

/**
 * Mint a local dev session. Used when the 42 backend is not configured or
 * unreachable, so the auth flow can be exercised end-to-end in dev. The
 * resulting token is a signed dev token (HMAC) that the game engine can
 * decode to identify the operative. Clearly marked `isDev: true`.
 */
export function issueDevSession(opts: {
  codename?: string;
  faction?: string;
  method?: AuthMethod;
}): Session {
  const codename = pickDevCodename(opts.codename);
  const faction = pickDevFaction(opts.faction);
  const id = `dev-${codename.replace(/[^A-Z0-9]/gi, "-").toLowerCase()}`;
  const now = Date.now();
  const payload: DevTokenPayload = {
    sub: id,
    codename,
    faction,
    tier: "ELITE",
    rank: "OIII",
    votc: 12_500 + Math.floor(Math.random() * 8_000),
    iat: now,
    exp: now + DEV_TTL_MS,
    dev: true,
  };
  const token = signDevToken(payload);
  const profile: OperativeProfile = {
    id,
    codename,
    faction,
    tier: "ELITE",
    rank: "OIII",
    votc: payload.votc,
    walletAddress: null,
    telegramId: null,
    quality: 78 + Math.floor(Math.random() * 18),
    isDev: true,
  };
  return {
    token,
    profile,
    method: opts.method ?? "dev-passgate",
    issuedAt: now,
    expiresAt: now + DEV_TTL_MS,
    isDev: true,
  };
}

/**
 * Try the real 42 dev-passgate; fall back to a local dev session if 42 is
 * not configured or the call fails. Returns a LoginResult always.
 *
 * 42 contract (assumed): POST /api/auth/dev-passgate { codename?, faction? }
 *   → 200 { token, user: { id, codename, faction, ... } }
 *
 * If 42's response shape differs, map it here — this is the single seam.
 */
export async function devPassgateLogin(opts: {
  codename?: string;
  faction?: string;
}): Promise<LoginResult> {
  if (isFortyTwoConfigured()) {
    try {
      const r = await proxyFortyTwo<{
        token: string;
        user?: Record<string, unknown>;
      }>({
        path: "/api/auth/dev-passgate",
        body: { codename: opts.codename, faction: opts.faction },
      });
      // Map 42's user record into our OperativeProfile. Fields are
      // best-effort — 42 mirrors AORDF's votc/rank/faction into /api/user/me,
      // but the dev-passgate response may be lighter. Fill gaps with defaults.
      const u = r.user ?? {};
      const profile: OperativeProfile = {
        id: String(u.id ?? u.wallet_address ?? "dev"),
        codename: String(u.codename ?? u.moniker ?? pickDevCodename(opts.codename)),
        faction: ((u.faction as string) ?? pickDevFaction(opts.faction)) as FactionId,
        tier: ((u.tier as string) ?? "ELITE") as OperativeProfile["tier"],
        rank: (u.rank_icon as string) ?? "OIII",
        votc: Number(u.votc ?? 0),
        walletAddress: (u.wallet_address as string) ?? null,
        telegramId: (u.telegram_id as string) ?? null,
        quality: Number(u.quality ?? 90),
        isDev: false,
      };
      const now = Date.now();
      return {
        ok: true,
        session: {
          token: r.token,
          profile,
          method: "dev-passgate",
          issuedAt: now,
          expiresAt: now + DEV_TTL_MS,
          isDev: false,
        },
      };
    } catch (e) {
      // Fall through to local dev session. Logged server-side for awareness.
      console.warn("[auth] 42 dev-passgate failed, falling back to local dev session:", e);
    }
  }
  const session = issueDevSession({ ...opts, method: "dev-passgate" });
  return { ok: true, session };
}

/**
 * Resolve the fused operative profile from 42's /api/user/me. Used by
 * /api/auth/me to refresh the profile. For dev tokens, decodes locally.
 */
export async function resolveProfile(token: string): Promise<OperativeProfile | null> {
  // Dev token → decode locally (no 42 round-trip needed).
  const dev = verifyDevToken(token);
  if (dev) {
    return {
      id: dev.sub,
      codename: dev.codename,
      faction: dev.faction,
      tier: dev.tier,
      rank: dev.rank,
      votc: dev.votc,
      walletAddress: null,
      telegramId: null,
      quality: 88,
      isDev: true,
    };
  }
  if (!isFortyTwoConfigured()) return null;
  try {
    const u = await proxyFortyTwo<Record<string, unknown>>({
      method: "GET",
      path: "/api/user/me",
      token,
    });
    return {
      id: String(u.id ?? u.wallet_address ?? ""),
      codename: String(u.codename ?? u.moniker ?? "OPERATIVE"),
      faction: (u.faction as FactionId) ?? "FANG",
      tier: ((u.tier as string) ?? "ELITE") as OperativeProfile["tier"],
      rank: (u.rank_icon as string) ?? null,
      votc: Number(u.votc ?? 0),
      walletAddress: (u.wallet_address as string) ?? null,
      telegramId: (u.telegram_id as string) ?? null,
      quality: Number(u.quality ?? 0),
      isDev: false,
    };
  } catch {
    return null;
  }
}
