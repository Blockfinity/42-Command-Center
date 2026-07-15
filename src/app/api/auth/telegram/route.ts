import { NextResponse } from "next/server";
import { isFortyTwoConfigured, proxyFortyTwo } from "@/lib/forty-two";
import type { LoginResult, OperativeProfile, Session } from "@/lib/auth-types";
import type { FactionId } from "@/lib/types";

export const runtime = "nodejs";

// POST /api/auth/telegram
// Body: Telegram-verified payload ({ id, first_name, username, auth_date, hash, ... })
// Proxies to 42 POST /api/auth/telegram. Requires FORTY_TWO_BACKEND_URL.
//
// 42 trusts AORDF via this endpoint (AORDF bot → 42). The 42 backend verifies
// the Telegram hash against the bot token and issues a JWT.
export async function POST(req: Request) {
  if (!isFortyTwoConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Telegram login requires the 42 backend (FORTY_TWO_BACKEND_URL unset). Use Dev Passgate." } satisfies LoginResult,
      { status: 503 }
    );
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body." } satisfies LoginResult,
      { status: 400 }
    );
  }
  try {
    const r = await proxyFortyTwo<{ token: string; user?: Record<string, unknown> }>({
      path: "/api/auth/telegram",
      body,
    });
    const u = r.user ?? {};
    const profile: OperativeProfile = {
      id: String(u.id ?? body.id ?? ""),
      codename: String(u.codename ?? u.moniker ?? body.username ?? "OPERATIVE"),
      faction: ((u.faction as string) ?? "FANG") as FactionId,
      tier: ((u.tier as string) ?? "ELITE") as OperativeProfile["tier"],
      rank: (u.rank_icon as string) ?? null,
      votc: Number(u.votc ?? 0),
      walletAddress: null,
      telegramId: String(body.id ?? u.telegram_id ?? ""),
      quality: Number(u.quality ?? 0),
      isDev: false,
    };
    const now = Date.now();
    const session: Session = {
      token: r.token,
      profile,
      method: "telegram",
      issuedAt: now,
      expiresAt: now + 24 * 60 * 60 * 1000,
      isDev: false,
    };
    return NextResponse.json({ ok: true, session } satisfies LoginResult);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "telegram login failed" } satisfies LoginResult,
      { status: 502 }
    );
  }
}
