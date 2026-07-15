import { NextResponse } from "next/server";
import { isFortyTwoConfigured, proxyFortyTwo } from "@/lib/forty-two";

export const runtime = "nodejs";

// POST /api/auth/logout
// Header: Authorization: Bearer <token>
// Best-effort: forwards to 42's logout endpoint if configured, then returns 200.
// The client clears its local session regardless of the 42 result.
export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (token && isFortyTwoConfigured()) {
    try {
      await proxyFortyTwo({ method: "POST", path: "/api/auth/logout", token });
    } catch {
      /* best-effort — client clears local session anyway */
    }
  }
  return NextResponse.json({ ok: true });
}
