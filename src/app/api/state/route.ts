import { NextResponse } from "next/server";
import type { GameState } from "@/lib/types";

// Proxy to the game engine on port 3003 for the initial snapshot.
export async function GET() {
  try {
    // Use 127.0.0.1 (not "localhost") to avoid IPv6 ::1 resolution failures —
    // the bun engine listens on IPv4 only.
    const res = await fetch("http://127.0.0.1:3003/state", { cache: "no-store" });
    if (!res.ok) throw new Error(`engine ${res.status}`);
    const state = (await res.json()) as GameState;
    return NextResponse.json(state);
  } catch (e) {
    return NextResponse.json(
      { error: "engine-unavailable", detail: e instanceof Error ? e.message : String(e) },
      { status: 503 }
    );
  }
}
