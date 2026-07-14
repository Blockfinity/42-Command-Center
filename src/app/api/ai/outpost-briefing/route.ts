import { NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import type { Garrison, GarrisonBrief, GarrisonBriefPriority, FactionId, ThreatLevel } from "@/lib/types";

// POST /api/ai/outpost-briefing
// Body: { garrison, operativeFaction, sol, threatLevel }
// Returns: GarrisonBrief — AI-generated per-garrison situational assessment.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  garrison?: Garrison;
  operativeFaction?: FactionId;
  sol?: number;
  threatLevel?: ThreatLevel;
}

function fallback(garrison: Garrison, isMine: boolean): GarrisonBrief {
  const hp = garrison.health / garrison.maxHealth;
  const priority: GarrisonBriefPriority =
    garrison.status === "UNDER_ATTACK" ? "CRITICAL"
    : garrison.status === "OFFLINE" ? "HIGH"
    : hp < 0.4 ? "HIGH"
    : hp < 0.7 ? "MEDIUM"
    : "LOW";
  const assessment = isMine
    ? `${garrison.name} (${garrison.type}) holds ${Math.round(garrison.health)}/${garrison.maxHealth} hull at level ${garrison.level}. ${garrison.status === "UNDER_ATTACK" ? "Under direct fire — shields critical." : garrison.status === "OFFLINE" ? "Signal lost." : "Operational."}`
    : `${garrison.name} is a ${garrison.type === "Safehouse" ? "full" : "tactical"} node of ${garrison.faction}. Hull at ${Math.round(garrison.health)}/${garrison.maxHealth}. ${garrison.status === "UNDER_ATTACK" ? "Currently absorbing fire — window of opportunity." : garrison.status === "OFFLINE" ? "Dark — no signal." : "Active and surveilling."}`;
  const recommendation = isMine
    ? garrison.status === "UNDER_ATTACK"
      ? "Raise shields immediately; reinforce hull with BUILD."
      : hp < 0.6
        ? "Reinforce with BUILD to restore hull integrity."
        : "Hold position; recon to accrue build points."
    : hp < 0.4
      ? "Commit a DRONE_STRIKE to finish the wounded node."
      : garrison.status === "OFFLINE"
        ? "Inert target — infiltrate with ESPIONAGE for intel."
        : "Probe with ESPIONAGE before committing kinetic assets.";
  return {
    assessment,
    recommendation,
    priority,
    confidence: 68,
    votcAtStake: Math.round(garrison.compute * (garrison.type === "Safehouse" ? 120 : 40)),
    token: garrison.faction,
    generatedAt: Date.now(),
  };
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }
  const { garrison, operativeFaction, sol, threatLevel } = body;
  if (!garrison || !operativeFaction) {
    return NextResponse.json({ error: "missing-garrison" }, { status: 400 });
  }
  const isMine = garrison.faction === operativeFaction;

  try {
    const zai = await ZAI.create();

    const system = `You are ARIA, the AI operations co-pilot aboard the 42 command deck.
You generate SHORT per-garrison situational briefs for a gamified decentralized compute network.
Three factions (FANG, HAMMER, RESOLUTE) wage real-time wargames across a real world map.
For OWN garrisons: assess unit readiness. For RIVAL garrisons: provide an intel snapshot.
Respond with STRICT JSON only, no prose, matching this schema:
{
  "assessment": "string — 1-2 sentences, present-tense, military tone",
  "recommendation": "string — one sentence, actionable, offensive for rivals / defensive for own",
  "priority": "LOW | MEDIUM | HIGH | CRITICAL",
  "confidence": 0-100,
  "votcAtStake": number
}
"votcAtStake" = estimated VOTC value at stake (compute × duration factor).`;

    const user = `Garrison:
${JSON.stringify({
  name: garrison.name,
  faction: garrison.faction,
  type: garrison.type,
  level: garrison.level,
  health: Math.round(garrison.health),
  maxHealth: garrison.maxHealth,
  compute: garrison.compute,
  uptime: garrison.uptime,
  buildPoints: Math.round(garrison.buildPoints),
  status: garrison.status,
  establishedAt: garrison.establishedAt,
})}

Context:
- Operative faction: ${operativeFaction} (this garrison is ${isMine ? "OURS" : "RIVAL"})
- SOL cycle: ${sol}
- Global threat: ${threatLevel}

Generate the ${isMine ? "unit readiness" : "intel snapshot"} brief now.`;

    const completion = await zai.chat.completions.create({
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      thinking: { type: "disabled" },
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    let parsed: GarrisonBrief;
    try {
      const cleaned = raw.replace(/^```json\s*|\s*```$/g, "").trim();
      parsed = JSON.parse(cleaned) as GarrisonBrief;
      parsed.token = garrison.faction;
      parsed.generatedAt = Date.now();
      if (!parsed.assessment || !parsed.recommendation) throw new Error("incomplete");
    } catch {
      parsed = fallback(garrison, isMine);
    }
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json(fallback(garrison, isMine));
  }
}
