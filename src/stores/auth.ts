"use client";

import { create } from "zustand";
import type {
  AuthMethod,
  AuthStatus,
  LoginResult,
  OperativeProfile,
  Session,
} from "@/lib/auth-types";
import { clearSession, loadSession, saveSession } from "@/lib/auth";

// ===== 42 — Auth store (client) =====
// Holds the live session, exposes login methods that hit the Next.js auth
// API routes (which proxy to 42 / mint local dev sessions), and persists the
// session to localStorage so a refresh restores the operative.
//
// The token is also readable via `loadToken()` (auth.ts) for the socket
// handshake in command.ts — kept separate so the socket can read it without
// subscribing to the store.

interface AuthStore {
  session: Session | null;
  status: AuthStatus;
  error: string | null;

  /** Restore a persisted session from localStorage (call on app mount). */
  restore: () => void;

  /** One-click dev login. Works with or without the 42 backend. */
  loginDevPassgate: (opts?: { codename?: string; faction?: string }) => Promise<LoginResult>;

  /** Wallet-login: client posts {address, signature, message} (the wallet
   *  signs the message off-chain). Requires 42 backend configured. */
  loginWallet: (address: string, signature: string, message: string) => Promise<LoginResult>;

  /** Telegram-login: client posts the Telegram-verified payload. Requires 42. */
  loginTelegram: (payload: Record<string, unknown>) => Promise<LoginResult>;

  /** Refresh the fused profile from 42 /api/user/me (or decode dev token). */
  refreshProfile: () => Promise<void>;

  /** Log out — clears local session. */
  logout: () => void;
}

function toLoginResult(session: Session): LoginResult {
  return { ok: true, session };
}

export const useAuth = create<AuthStore>((set, get) => ({
  session: null,
  status: "idle",
  error: null,

  restore: () => {
    const session = loadSession();
    if (session) {
      set({ session, status: "authenticated", error: null });
    }
  },

  loginDevPassgate: async (opts) => {
    set({ status: "loading", error: null });
    try {
      const res = await fetch("/api/auth/dev-passgate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(opts ?? {}),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`dev-passgate ${res.status}: ${t.slice(0, 160)}`);
      }
      const result = (await res.json()) as LoginResult;
      if (!result.ok) throw new Error(result.error);
      saveSession(result.session);
      set({ session: result.session, status: "authenticated", error: null });
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "dev-passgate failed";
      set({ status: "error", error: msg });
      return { ok: false, error: msg };
    }
  },

  loginWallet: async (address, signature, message) => {
    set({ status: "loading", error: null });
    try {
      const res = await fetch("/api/auth/wallet-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, signature, message }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`wallet-login ${res.status}: ${t.slice(0, 160)}`);
      }
      const result = (await res.json()) as LoginResult;
      if (!result.ok) throw new Error(result.error);
      saveSession(result.session);
      set({ session: result.session, status: "authenticated", error: null });
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "wallet-login failed";
      set({ status: "error", error: msg });
      return { ok: false, error: msg };
    }
  },

  loginTelegram: async (payload) => {
    set({ status: "loading", error: null });
    try {
      const res = await fetch("/api/auth/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`telegram ${res.status}: ${t.slice(0, 160)}`);
      }
      const result = (await res.json()) as LoginResult;
      if (!result.ok) throw new Error(result.error);
      saveSession(result.session);
      set({ session: result.session, status: "authenticated", error: null });
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "telegram login failed";
      set({ status: "error", error: msg });
      return { ok: false, error: msg };
    }
  },

  refreshProfile: async () => {
    const { session } = get();
    if (!session) return;
    try {
      const res = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (!res.ok) return;
      const profile = (await res.json()) as OperativeProfile | null;
      if (profile) {
        const next: Session = { ...session, profile };
        saveSession(next);
        set({ session: next });
      }
    } catch {
      /* non-fatal — keep existing session */
    }
  },

  logout: () => {
    // Fire-and-forget the server logout (best-effort).
    const { session } = get();
    if (session) {
      fetch("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.token}` },
      }).catch(() => {});
    }
    clearSession();
    set({ session: null, status: "idle", error: null });
  },
}));

// Convenience selector hooks (avoid re-renders on unrelated fields).
export const useSession = () => useAuth((s) => s.session);
export const useAuthStatus = () => useAuth((s) => s.status);
