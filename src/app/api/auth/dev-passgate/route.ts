import { NextResponse } from "next/server";
import { devPassgateLogin } from "@/lib/forty-two";
import type { LoginResult } from "@/lib/auth-types";

export const runtime = "nodejs";

// POST /api/auth/dev-passgate
// Body: { codename?: string, faction?: string }
// Returns: LoginResult — a real 42 session if configured, else a local dev session.
//
// This is the primary dev entry point. It always succeeds (when 42 is down it
// mints a local dev token) so the auth flow can be exercised end-to-end.
export async function POST(req: Request) {
  let body: { codename?: string; faction?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body is fine */
  }
  const result: LoginResult = await devPassgateLogin({
    codename: body.codename,
    faction: body.faction,
  });
  return NextResponse.json(result);
}
