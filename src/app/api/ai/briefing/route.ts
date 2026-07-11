import { NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import type { GameState, Briefing, Recommendation } from "@/lib/types";

// POST /api/ai/briefing
// Body: { state: GameState }
// Returns: Briefing — AI-generated priority briefing with recommendations.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  state?: GameState;
}

function fallbackBriefing(state: GameState): Briefing {
  const mine = state.outposts.filter((o) => o.faction === state.operative.faction);
  const rivals = state.outposts.filter((o) => o.faction !== state.operative.faction);
  const underAttack = mine.filter((o) => o.status === "UNDER_ATTACK");
  const weak = rivals.find((o) => o.health < 40 && o.status !== "OFFLINE");
  const recs: Recommendation[] = [];
  if (underAttack[0]) {
    recs.push({
      id: "01",
      title: "RAISE SHIELDS",
      rationale: `${underAttack[0].name} is under direct attack. Fortify before hull breach.`,
      action: `launch:DEFEND:${underAttack[0].id}:${underAttack[0].id}`,
      confidence: 88,
    });
  }
  if (weak) {
    recs.push({
      id: "02",
      title: "STRIKE THE WOUNDED",
      rationale: `${weak.name} (${weak.faction}) is below 40% hull — finish it with a drone swarm.`,
      action: `launch:DRONE_STRIKE:${mine[0]?.id ?? ""}:${weak.id}`,
      confidence: 74,
    });
  }
  const lowBp = mine.find((o) => o.buildPoints < 20);
  if (lowBp) {
    recs.push({
      id: "03",
      title: "RECON FOR BUILD POINTS",
      rationale: `${lowBp.name} is starved of build points. A recon pass will replenish reserves.`,
      action: `launch:RECON:${lowBp.id}:${lowBp.id}`,
      confidence: 66,
    });
  }
  if (!recs.length) {
    recs.push({
      id: "01",
      title: "CONSOLIDATE TERRITORY",
      rationale: "No immediate threats. Reinforce your strongest outpost to extend the frontier.",
      action: `launch:BUILD:${mine[0]?.id ?? ""}:${mine[0]?.id ?? ""}`,
      confidence: 71,
    });
  }
  return {
    summary: `Command deck nominal. ${mine.length} outposts under your banner. Threat level ${state.threatLevel}.`,
    threatAssessment: `Rival factions field ${rivals.length} nodes. Aggregate rival strength is ${Math.round(
      (state.factions.HAMMER.strength + state.factions.RESOLUTE.strength) / 2
    )}.`,
    recommendations: recs,
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
  const state = body.state;
  if (!state) return NextResponse.json({ error: "missing-state" }, { status: 400 });

  try {
    const zai = await ZAI.create();

    const mine = state.outposts.filter((o) => o.faction === state.operative.faction);
    const rivals = state.outposts.filter((o) => o.faction !== state.operative.faction);

    const compact = {
      sol: state.sol,
      threat: state.threatLevel,
      operative: state.operative,
      factions: Object.values(state.factions).map((f) => ({
        id: f.id,
        strength: f.strength,
        compute: f.compute,
        threat: f.threat,
        outposts: f.outposts,
      })),
      myOutposts: mine.map((o) => ({
        name: o.name,
        type: o.type,
        level: o.level,
        health: Math.round(o.health),
        maxHealth: o.maxHealth,
        compute: o.compute,
        buildPoints: Math.round(o.buildPoints),
        status: o.status,
      })),
      rivalOutposts: rivals.map((o) => ({
        name: o.name,
        faction: o.faction,
        type: o.type,
        health: Math.round(o.health),
        status: o.status,
      })),
      activeMissions: state.missions
        .filter((m) => m.status === "ACTIVE")
        .map((m) => ({ type: m.type, label: m.label, faction: m.faction, progress: Math.round(m.progress) })),
      recentEvents: state.events.slice(0, 6).map((e) => ({ type: e.type, message: e.message, severity: e.severity })),
    };

    const system = `You are ARIA, the AI operations co-pilot aboard the 42 command deck.
You advise the commander of a gamified decentralized compute network where three factions
(FANG, HAMMER, RESOLUTE) wage real-time wargames across a real world map.
Outposts are full nodes; tactical outposts are browser-based worker nodes. Uptime accrues
build points, which reinforce territory. Mission types: DRONE_STRIKE, CYBER_ATTACK,
ESPIONAGE, RECON, BUILD, DEFEND.
Respond with STRICT JSON only, no prose, matching this schema:
{
  "summary": "string — one or two sentences, present-tense, military tone",
  "threatAssessment": "string — one sentence on the rival posture",
  "recommendations": [
    { "id": "01", "title": "UPPERCASE SHORT TITLE", "rationale": "one sentence why", "action": "launch:TYPE:sourceId:targetId", "confidence": 0-100 }
  ]
}
Give 2-3 recommendations, ordered by priority. The "action" must use real outpost ids from the data when possible.`;

    const user = `Current state:\n${JSON.stringify(compact)}

My outpost IDs (use as sourceId): ${JSON.stringify(mine.map((o) => ({ id: o.id, name: o.name })))}
Rival outpost IDs (use as targetId): ${JSON.stringify(rivals.map((o) => ({ id: o.id, name: o.name })))}

Generate the priority briefing now.`;

    const completion = await zai.chat.completions.create({
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      thinking: { type: "disabled" },
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    let parsed: Briefing;
    try {
      // tolerate markdown fences
      const cleaned = raw.replace(/^```json\s*|\s*```$/g, "").trim();
      parsed = JSON.parse(cleaned) as Briefing;
      parsed.generatedAt = Date.now();
      if (!parsed.recommendations?.length) throw new Error("empty");
    } catch {
      parsed = fallbackBriefing(state);
    }
    return NextResponse.json(parsed);
  } catch (e) {
    return NextResponse.json(fallbackBriefing(state));
  }
}
