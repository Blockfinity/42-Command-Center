import { NextResponse } from "next/server";
import type { GameState } from "@/lib/types";

// Proxy to the game engine on port 3003 for the initial snapshot.
export async function GET() {
  try {
    const res = await fetch("http://localhost:3003/state", { cache: "no-store" });
    if (!res.ok) throw new Error(`engine ${res.status}`);
    const state = (await res.json()) as GameState;
    return NextResponse.json(state);
  } catch (e: {
    message?: string;
  }) {
    return NextResponse.json(
      { error: "engine-unavailable", detail: e?.message },
      { status: 503 }
    );
  }
}
