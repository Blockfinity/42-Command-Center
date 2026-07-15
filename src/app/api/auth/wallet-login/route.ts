import { NextResponse } from "next/server";
import { isFortyTwoConfigured, proxyFortyTwo } from "@/lib/forty-two";
import type { LoginResult, OperativeProfile, Session } from "@/lib/auth-types";
import type { FactionId } from "@/lib/types";

export const runtime = "nodejs";

// POST /api/auth/wallet-login
// Body: { address, signature, message }
// Proxies to 42 POST /api/auth/wallet-login. Requires FORTY_TWO_BACKEND_URL.
//
// 42 contract (assumed): { address, signature, message } → { token, user }
// This route maps 42's `user` into our OperativeProfile.
export async function POST(req: Request) {
  if (!isFortyTwoConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Wallet login requires the 42 backend (FORTY_TWO_BACKEND_URL unset). Use Dev Passgate." } satisfies LoginResult,
      { status: 503 }
    );
  }
  let body: { address?: string; signature?: string; message?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body." } satisfies LoginResult,
      { status: 400 }
    );
  }
  if (!body.address || !body.signature || !body.message) {
    return NextResponse.json(
      { ok: false, error: "Missing address / signature / message." } satisfies LoginResult,
      { status: 400 }
    );
  }
  try {
    const r = await proxyFortyTwo<{ token: string; user?: Record<string, unknown> }>({
      path: "/api/auth/wallet-login",
      body: { address: body.address, signature: body.signature, message: body.message },
    });
    const u = r.user ?? {};
    const profile: OperativeProfile = {
      id: String(u.id ?? body.address),
      codename: String(u.codename ?? u.moniker ?? "OPERATIVE"),
      faction: ((u.faction as string) ?? "FANG") as FactionId,
      tier: ((u.tier as string) ?? "ELITE") as OperativeProfile["tier"],
      rank: (u.rank_icon as string) ?? null,
      votc: Number(u.votc ?? 0),
      walletAddress: body.address,
      telegramId: null,
      quality: Number(u.quality ?? 0),
      isDev: false,
    };
    const now = Date.now();
    const session: Session = {
      token: r.token,
      profile,
      method: "wallet",
      issuedAt: now,
      expiresAt: now + 24 * 60 * 60 * 1000,
      isDev: false,
    };
    return NextResponse.json({ ok: true, session } satisfies LoginResult);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "wallet-login failed" } satisfies LoginResult,
      { status: 502 }
    );
  }
}
