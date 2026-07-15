import { NextResponse } from "next/server";
import { resolveProfile } from "@/lib/forty-two";
import type { OperativeProfile } from "@/lib/auth-types";

export const runtime = "nodejs";

// GET /api/auth/me
// Header: Authorization: Bearer <token>
// Returns the fused operative profile (42 /api/user/me, or decoded dev token).
//
// Used by the auth store's refreshProfile() to pull the latest votc/rank/faction
// after the 42↔AORDF webhook has updated the user record.
export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: "missing token" }, { status: 401 });
  }
  const profile: OperativeProfile | null = await resolveProfile(token);
  if (!profile) {
    return NextResponse.json({ error: "unable to resolve profile" }, { status: 502 });
  }
  return NextResponse.json(profile);
}
