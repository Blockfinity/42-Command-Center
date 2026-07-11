import { NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import type { Outpost, OutpostBrief, OutpostBriefPriority, FactionId, ThreatLevel } from "@/lib/types";

// POST /api/ai/outpost-briefing
// Body: { outpost, operativeFaction, sol, threatLevel }
// Returns: OutpostBrief — AI-generated per-outpost situational assessment.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  outpost?: Outpost;
  operativeFaction?: FactionId;
  sol?: number;
  threatLevel?: ThreatLevel;
}

function fallback(outpost: Outpost, isMine: boolean): OutpostBrief {
  const hp = outpost.health / outpost.maxHealth;
  const priority: OutpostBriefPriority =
    outpost.status === "UNDER_ATTACK" ? "CRITICAL"
    : outpost.status === "OFFLINE" ? "HIGH"
    : hp < 0.4 ? "HIGH"
    : hp < 0.7 ? "MEDIUM"
    : "LOW";
  const assessment = isMine
    ? `${outpost.name} (${outpost.type}) holds ${Math.round(outpost.health)}/${outpost.maxHealth} hull at level ${outpost.level}. ${outpost.status === "UNDER_ATTACK" ? "Under direct fire — shields critical." : outpost.status === "OFFLINE" ? "Signal lost." : "Operational."}`
    : `${outpost.name} is a ${outpost.type === "FULL" ? "full" : "tactical"} node of ${outpost.faction}. Hull at ${Math.round(outpost.health)}/${outpost.maxHealth}. ${outpost.status === "UNDER_ATTACK" ? "Currently absorbing fire — window of opportunity." : outpost.status === "OFFLINE" ? "Dark — no signal." : "Active and surveilling."}`;
  const recommendation = isMine
    ? outpost.status === "UNDER_ATTACK"
      ? "Raise shields immediately; reinforce hull with BUILD."
      : hp < 0.6
        ? "Reinforce with BUILD to restore hull integrity."
        : "Hold position; recon to accrue build points."
    : hp < 0.4
      ? "Commit a DRONE_STRIKE to finish the wounded node."
      : outpost.status === "OFFLINE"
        ? "Inert target — infiltrate with ESPIONAGE for intel."
        : "Probe with ESPIONAGE before committing kinetic assets.";
  return {
    assessment,
    recommendation,
    priority,
    confidence: 68,
    votcAtStake: Math.round(outpost.compute * (outpost.type === "FULL" ? 120 : 40)),
    token: outpost.faction,
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
  const { outpost, operativeFaction, sol, threatLevel } = body;
  if (!outpost || !operativeFaction) {
    return NextResponse.json({ error: "missing-outpost" }, { status: 400 });
  }
  const isMine = outpost.faction === operativeFaction;

  try {
    const zai = await ZAI.create();

    const system = `You are ARIA, the AI operations co-pilot aboard the 42 command deck.
You generate SHORT per-outpost situational briefs for a gamified decentralized compute network.
Three factions (FANG, HAMMER, RESOLUTE) wage real-time wargames across a real world map.
For OWN outposts: assess unit readiness. For RIVAL outposts: provide an intel snapshot.
Respond with STRICT JSON only, no prose, matching this schema:
{
  "assessment": "string — 1-2 sentences, present-tense, military tone",
  "recommendation": "string — one sentence, actionable, offensive for rivals / defensive for own",
  "priority": "LOW | MEDIUM | HIGH | CRITICAL",
  "confidence": 0-100,
  "votcAtStake": number
}
"votcAtStake" = estimated VOTC value at stake (compute × duration factor).`;

    const user = `Outpost:
${JSON.stringify({
  name: outpost.name,
  faction: outpost.faction,
  type: outpost.type,
  level: outpost.level,
  health: Math.round(outpost.health),
  maxHealth: outpost.maxHealth,
  compute: outpost.compute,
  uptime: outpost.uptime,
  buildPoints: Math.round(outpost.buildPoints),
  status: outpost.status,
  establishedAt: outpost.establishedAt,
})}

Context:
- Operative faction: ${operativeFaction} (this outpost is ${isMine ? "OURS" : "RIVAL"})
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
    let parsed: OutpostBrief;
    try {
      const cleaned = raw.replace(/^```json\s*|\s*```$/g, "").trim();
      parsed = JSON.parse(cleaned) as OutpostBrief;
      parsed.token = outpost.faction;
      parsed.generatedAt = Date.now();
      if (!parsed.assessment || !parsed.recommendation) throw new Error("incomplete");
    } catch {
      parsed = fallback(outpost, isMine);
    }
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json(fallback(outpost, isMine));
  }
}
