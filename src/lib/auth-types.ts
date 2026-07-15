// ===== 42 — Auth domain types (isomorphic) =====
// Shared between the Next.js API routes (server), the Zustand auth store
// (client), and the game engine (port 3003). Keep framework-agnostic and
// free of Node-only APIs so it can be imported anywhere.

import type { FactionId } from "@/lib/types";

/** How the operative authenticated. */
export type AuthMethod = "dev-passgate" | "wallet" | "telegram";

/** Auth state machine for the UI. */
export type AuthStatus = "idle" | "loading" | "authenticated" | "error";

/**
 * Node tier — 42's hardware-capability classification (NOT the AORDF
 * operative rank). Owned by 42's node record.
 *
 * NOTE (naming collision, per architecture doc): "tier" means two things:
 *   • 42 node tier  → basic / advanced / elite  (this field)
 *   • AORDF rank    → OII / OIII / …            (see `rank` below)
 * Never blur the two in UI vocabulary.
 */
export type NodeTier = "basic" | "advanced" | "elite";

/**
 * The fused operative profile — the single source of truth for "who is the
 * current user." Assembled from 42's `/api/user/me` (which mirrors AORDF's
 * votc / rank / faction via the bidirectional webhook) plus AORDF-direct
 * fields where relevant.
 *
 * Read priority in the frontend: auth session profile > game-state operative
 * (synthetic fallback). The profile-area.data hook swaps to this.
 */
export interface OperativeProfile {
  /** 42 user id (wallet address or telegram-derived id). */
  id: string;
  /** Display codename, e.g. "CMDR. OXFORD". */
  codename: string;
  /** AORDF-assigned faction. Single source = AORDF, mirrored into 42. */
  faction: FactionId;
  /** 42 node tier (hardware). Mapped into the legacy Operative.tier enum. */
  tier: "BASIC" | "ELITE" | "ARCHON";
  /** AORDF operative rank icon, e.g. "OII" / "OIII". null if unknown. */
  rank: string | null;
  /** V.O.T.C balance (AORDF economy, mirrored into 42 /api/user/me). */
  votc: number;
  /** Wallet address if authed via wallet-login, else null. */
  walletAddress: string | null;
  /** Telegram id if authed via telegram, else null. */
  telegramId: string | null;
  /** 0–100 quality score (42 heartbeat-derived). */
  quality: number;
  /** True when this session was minted by the local Dev Passgate fallback
   *  (42 backend unreachable). Drives a "DEV" badge in the UI. */
  isDev: boolean;
}

/**
 * A live session — the JWT + the resolved profile. Persisted to localStorage
 * by the auth store and attached to every 42-bound request (Authorization
 * header) and to the socket handshake (auth.token).
 */
export interface Session {
  token: string;
  profile: OperativeProfile;
  method: AuthMethod;
  /** epoch ms — when the session was issued. */
  issuedAt: number;
  /** epoch ms — when the token expires (0 = never). */
  expiresAt: number;
  isDev: boolean;
}

/** Successful login result. */
export interface LoginOk {
  ok: true;
  session: Session;
}

/** Failed login result. */
export interface LoginErr {
  ok: false;
  error: string;
}

export type LoginResult = LoginOk | LoginErr;

// ── Dev-token payload (isomorphic, no crypto — verify happens server-side) ──
// Token shape:  dev.<base64url(payload-json)>.<hmac>
// The game engine and client may DECODE the payload to read the operative
// identity for display/ack. They MUST NOT trust it as authoritative — only
// the Next.js API routes (which hold AUTH_DEV_SECRET) verify the HMAC before
// proxying to 42. #2 (fusion bridge) will enforce verification server-side.

export const DEV_TOKEN_PREFIX = "dev.";

export interface DevTokenPayload {
  sub: string; // operative id
  codename: string;
  faction: FactionId;
  tier: "BASIC" | "ELITE" | "ARCHON";
  rank: string | null;
  votc: number;
  iat: number; // issued at (epoch ms)
  exp: number; // expires at (epoch ms)
  dev: true;
}
