# 42 Command Center — Backend Integration Specification

> Status: **REVIEW MODE — requirements locked, implementation not started.**
>
> This document is the single source of truth for how the frontend connects to
> the real backend (Wallet, AORDF, 42 node-client service). It supersedes the
> mock `mini-services/game-engine` behavior wherever they conflict.
>
> Every "Lock" below was confirmed in conversation. Items marked **PENDING**
> still need user confirmation before implementation.

---

## 1. Source-of-truth map

| # | Data / capability | Source of truth | Current mock state | Action |
|---|---|---|---|---|
| 1 | VOTC balance | **Wallet** (on-chain read) | `NETWORK_CURRENCY="VOTC"` is a string constant; no wallet adapter | Build wallet source adapter |
| 2 | VOTC potential earnings | **AORDF** (sole calculator) | No earnings concept; `buildPoints` is game-internal | Replace with AORDF earnings adapter |
| 3 | Attacks & defenses | **AORDF** (origin) → FE display | Mocked by `logic.ts` `spawnMission`/`resolveMission` | Replace with AORDF mission stream |
| 4 | Realtime discovery feed | **AORDF** (realtime stream) | Mocked by engine tick loop (`events`, `activityPings`) | Replace with AORDF event stream |
| 5 | Safehouse / Tactical placement | **42** (authorization) | `place-outpost` in `actions.ts` is unconditional | Gate on node-running attestation |
| 6 | Sol cycle (airdrop epoch) | **42** (sole calculator) | `sol` is a mock day counter, bumped every ~minute in `logic.ts:432` | Replace with 42-declared cycle |
| 7 | Placement once per device | **42** (enforcement) | No device identity, no cap | Add device fingerprint + 42 cap check |

---

## 2. Device & placement model

```
1 wallet  →  N devices
              ├─ device A: FULL node      → can place 1 SAFEHOUSE  (lifetime, one-shot)
              ├─ device B: PARTIAL node   → can place 1 TACTICAL   (lifetime, one-shot)
              └─ device C: no node        → cannot place
```

**Placement authorization is a triple gate** (all three required, none skippable):

1. **Wallet owns the device** — wallet signature
2. **Device is running the matching node type** — node-client attestation, source = 42
   - `SAFEHOUSE` placement ← requires **FULL node** on the device
   - `TACTICAL` placement ← requires **PARTIAL node** on the device
3. **Device has not placed yet** — lifetime cap, source = 42

The frontend **never** decides this locally. It asks 42 "can this device place?" and renders the answer.

**Open question (PENDING):** Does the node-running gate also apply to **FULL** outposts? Current assumption: FULL outposts are faction-anchor infrastructure (pre-existing HQs / NPC nodes), **not user-placeable**. Confirm before implementation.

---

## 3. Sol cycle (airdrop epoch)

**Hybrid cadence: target window + 42-declared boundary.**

| Aspect | Value |
|---|---|
| Default target cadence | 24h ("sol" = day, fits the name). Configurable by 42. **PENDING: confirm 24h vs 7d.** |
| Cycle ID | Monotonic integer (`solCycle: 1247`), increments at each close |
| Earnings accrual | **Continuous** — AORDF pushes earning events throughout the cycle |
| Final tally | **42-only**, at cycle close — reads AORDF ledger, computes per-wallet amount, signs, emits `cycle:closed` |
| Airdrop distribution | Fires at (or shortly after) close |
| Frontend display | `SOL CYCLE 1247 · closes in 14h 23m` + `last airdrop +1,284 VOTC` badge |
| Real-time | Subscribe to `cycle:opened` / `cycle:closed` from 42. **Never compute the boundary client-side** — show *estimated* countdown, snap to *actual* on 42's emit. |

**Data flow:**
```
AORDF ─(continuous earning events)─→ 42 ledger
42 ─(at close: tally + sign + emit cycle:closed)─→ frontend
wallet ─(post-airdrop read)─→ VOTC balance
```

**Naming lock:** Display label = **"Sol cycle"**. Field rename: `GameState.sol` → `GameState.solCycle: number` (cycle ID, not a tick counter). Mock increment-every-minute logic in `logic.ts:432` gets deleted.

**New 42-supplied fields:**
- `solCycleClosesAt: number` (epoch ms, estimated)
- `lastAirdrop?: { cycleId: number; amount: number; at: number }`

---

## 4. Token economics

### 4.1 Token model

| Token | Scope | Source |
|---|---|---|
| **VOTC** | Network currency — balance, airdrop earnings | Wallet (balance) / AORDF→42 (earnings) |
| **FANG / HAMMER / RESOLUTE** | Faction tokens — action costs | AORDF (pricing + execution) |

**There is no BP (build points) equivalent.** The current `Outpost.buildPoints` field and every BP label/gate in the UI are removed entirely.

### 4.2 Action cost rules

| Action kind | Cost token | Determined by | Example label |
|---|---|---|---|
| ATTACK (DRONE_STRIKE, CYBER_ATTACK, ESPIONAGE) | **Target faction's token** | AORDF live quote | `42 HAMMER` (FANG→HAMMER) |
| DEFEND (RAISE SHIELDS) | **Own faction's token** | AORDF live quote | `18 FANG` |
| BUILD (REINFORCE) | **Own faction's token** | AORDF live quote | `30 FANG` |
| RECON | **Own faction's token** | AORDF live quote | `12 FANG` |
| UPGRADE | **Own faction's token** | AORDF live quote | `75 FANG` |

**Cost-determination flow:**
```
User clicks "LAUNCH DRONE STRIKE" on a HAMMER outpost (attacker = FANG)
  ↓
Frontend: "need quote for ATTACK:DRONE_STRIKE src=FANG tgt=HAMMER"
  ↓
AORDF adapter: returns { token: "HAMMER", amount: 42 }
  ↓
Frontend renders button: "LAUNCH DRONE STRIKE · 14s · 42 HAMMER"
  ↓
User confirms → AORDF executes (token transfer + mission spawn)
  ↓
AORDF emits mission event → discovery feed → frontend displays
```

The static `MISSION_META.*.cost` numbers go away. Every cost is a **live AORDF quote**, labeled with the **correct token symbol** derived from action type + faction relationship. Frontend never hardcodes per-button token symbols.

### 4.3 Code locations to change

#### Type layer (`src/lib/types.ts`)
| Line | Current | New |
|---|---|---|
| `Outpost.buildPoints` (L37) | `buildPoints: number` | **Remove.** Per-faction token balance lives on the wallet, not per-outpost. |
| `MISSION_META.*.cost` (L207+) | `cost: 40` (BP-denominated) | Replace with `{ token: FactionId, amount: number }` — but **amount comes from AORDF at action time**, so static cost is either removed or kept only as a dev mock placeholder. |
| `OutpostBrief.votcAtStake` (L150) | Already VOTC | Keep. |
| `GameState.sol` (L177) | Mock day counter | Rename to `solCycle: number`; add `solCycleClosesAt: number`; add `lastAirdrop?: { cycleId, amount, at }` |
| `GameState.operative` | No balance fields | Add `walletVotc: number` (settled, from wallet), `pendingVotc: number` (this cycle, from AORDF) |

#### Backend mock (`mini-services/game-engine/src/`)
| File / line | Current | New |
|---|---|---|
| `state.ts:38` | `buildPoints: s.type === "FULL" ? 60 : 20` | Remove field |
| `actions.ts:30-36` | BUILD checks `src.buildPoints < cost`, decrements | AORDF handles cost; mock just succeeds/fails per AORDF adapter. BP gate removed. |
| `actions.ts:46-49` | Initial `buildPoints` per outpost type | Remove |
| `actions.ts:85-89` | UPGRADE checks/decrements `buildPoints` | AORDF-gated, BP removed |
| `actions.ts:41-79` | `place-outpost` unconditional | Add triple gate: wallet signature + node attestation + device cap. Reject if any fails. |
| `logic.ts:247-251` | CYBER_ATTACK steals `buildPoints` | Replace: stolen resource is the **target faction's token**. AORDF-decided. |
| `logic.ts:275` | RECON awards `src.buildPoints += 6` | Replace: RECON grants intel, not BP. No token minting locally. |
| `logic.ts:341` | `o.buildPoints += rate * sec * (o.health / o.maxHealth)` | **Delete entirely.** VOTC accrual is owned by AORDF, not the engine. |
| `logic.ts:432` | `if (state.tick % 30 === 0) state.sol += 1` | **Delete.** Sol cycle is 42-declared, not engine-ticked. |

#### Frontend UI
| File / line | Current | New |
|---|---|---|
| `right-panel.tsx:233` | `BUILD PTS` metric tile | Replace with faction-token balance tile: `FANG 1,284` |
| `right-panel.tsx:244` | `+LV · ${buildCost} BP` | `+LV · ${cost} FANG` (own token, cost from AORDF quote) |
| `right-panel.tsx:245` | `disabled={op.buildPoints < buildCost}` | `disabled={factionTokenBalance < cost}` |
| `right-panel.tsx:253` | `+HULL · FREE` (DEFEND) | `+HULL · ${cost} FANG` — **not free** |
| `right-panel.tsx:261` | `+BP · FREE` (RECON) | `+INTEL · ${cost} FANG` |
| `right-panel.tsx:269-270` | `${upgradeCost} BP` + `disabled={op.buildPoints < upgradeCost}` | `${cost} FANG` + `disabled={factionTokenBalance < cost}` |
| `right-panel.tsx:279, 285, 291` | Attack buttons show only duration | Add cost: `14s · ${cost} HAMMER` (target faction, updates when target selected) |
| `outpost-detail-card.tsx:176, 215-216, 232, 240-241` | Same BP labels | Same replacement (second surface mirroring right-panel) |
| `api/ai/briefing/route.ts:39, 102` | `lowBp = mine.find(o => o.buildPoints < 20)` + `buildPoints` in prompt | Remove BP from prompt. Replace with faction-token balance framing. |
| `api/ai/outpost-briefing/route.ts:91` | Sends `buildPoints` to LLM | Remove |

---

## 5. VOTC accrual model

```
                       ┌─ uptime (per-outpost, from node client telemetry)
AORDF reward formula ← ┤─ health (per-outpost, from AORDF mission/combat events)
                       └─ other items (PENDING — see §5.2)
                            ↓
                       VOTC minted to wallet
                            ↓
                  ┌── pending (this cycle) ── AORDF ledger (live read)
              VOTC ┤
                  └── balance (settled) ──── wallet (post-airdrop read)
                            ↓
                  At sol cycle close: 42 reads AORDF ledger,
                  signs final tally, distributes airdrop → wallet
```

### 5.1 Role separation

| Role | Owner |
|---|---|
| Measure **uptime** | Node client (device) → reports to AORDF |
| Track **health** changes | AORDF (missions/attacks modify it; AORDF reads it back for rewards) |
| **Calculate** VOTC earned | AORDF (sole formula owner) |
| **Distribute** at cycle close | 42 (reads AORDF ledger, signs, airdrops) |
| **Display** | Frontend (read-only, both pending and settled) |

### 5.2 "Other items" in the formula — PENDING

User specified "uptime and health and other items". Candidates:

| Possible input | Source | Why it might matter |
|---|---|---|
| Compute contribution (TFLOPS) | Node client | Reward proportional to work done, not just time |
| Outpost level | AORDF | Higher-level outposts earn more per unit time |
| Territory control bonus | AORDF | Holding contested territory pays a multiplier |
| Faction victory bonus | AORDF | Winning faction of last cycle gets a boost |
| Successful defenses | AORDF | Count of attacks repelled this cycle |
| Network load share | AORDF | What % of network actions this node processed |

**PENDING:** Which of these (or others) are actually in the formula? And is the formula **public** (players see the weights) or **opaque** (AORDF returns a number, FE shows inputs but not formula)?

### 5.3 Data model changes

| Field | Current | New |
|---|---|---|
| `Outpost.buildPoints` | per-outpost BP accrual | **Remove** (BP doesn't exist; AORDF accrues VOTC at wallet level) |
| `Outpost.uptime` | per-outpost seconds | **Keep** — but *authoritative* uptime is measured by the node client and reported to AORDF. `outpost.uptime` becomes a display cache of the last known AORDF-reported value, not a locally-incremented counter. |
| `Outpost.health` / `maxHealth` | per-outpost | **Keep** — AORDF is source of truth (missions modify it), frontend displays. |
| `GameState.operative` | no balance fields | Add: `walletVotc: number` (settled), `pendingVotc: number` (this cycle, from AORDF) |
| Per-outpost accrual breakdown | doesn't exist | **PENDING Option A/B** (see §5.4) |

### 5.4 Frontend display options

**Option A — wallet-level only:**
```
VOTC BALANCE    PENDING (CYCLE 1247)
12,847          +1,284
```

**Option B — wallet + per-outpost contribution (recommended):**
```
VOTC BALANCE    PENDING (CYCLE 1247)
12,847          +1,284

[per-outpost detail card shows:
  FANG-2155-NYC contributes +412 VOTC this cycle
  based on 4617h uptime · 78% health · 30 TF compute]
```

**Recommendation: Option B** — gives the player a reason to care about each outpost's health and uptime, which drives the gameplay loop (defend to keep health up = keep earning). Requires AORDF to expose per-outpost accrual breakdown.

---

## 6. Architecture — source adapter split

The current `mini-services/game-engine` is a single monolithic mock that synthesizes everything. To connect to the real backend it must split into distinct source adapters. The registry/source architecture in `src/components/command/map/registry/sources.ts` was designed for exactly this swap.

### 6.1 Proposed source layout

```
sources/
  wallet.source.ts      → VOTC balance (on-chain read)
  aordf.source.ts       → earnings, attacks/defenses, discovery feed, mission pricing
  sol-cycle.source.ts   → airdrop epoch (42-computed)
  game-engine.source.ts → retain ONLY as a dev/mock fallback
```

The frontend's `NormalizedEvent` vocabulary (`point:upsert`, `arc:upsert`, `heat:batch`, `ping:batch`) already abstracts over the source — so swapping the mock engine for real AORDF/wallet/sol-cycle sources is a registry swap, not a rewrite.

### 6.2 NormalizedEvent contract (existing, retained)

| Event | Producer | Consumer |
|---|---|---|
| `point:upsert` | AORDF (outpost state), wallet (balance) | Layer host → outposts layer |
| `arc:upsert` | AORDF (missions) | Layer host → missions layer |
| `polygon:upsert` / `polygon:takeover` | AORDF (territory control) | Layer host → territory layer |
| `heat:batch` | AORDF (activity density) | Layer host → heat layer |
| `ping:batch` | AORDF (realtime actions) | Layer host → pings layer |
| `cycle:opened` / `cycle:closed` | 42 | Frontend store → sol cycle display |

---

## 7. Consolidated lock list

| # | Lock | Status |
|---|---|---|
| 1 | VOTC balance ← wallet (on-chain read) | ✅ Locked |
| 2 | VOTC earnings ← AORDF (sole calculator, inputs = uptime + health + other items) | ✅ Locked |
| 3 | Attacks/defenses ← AORDF (origin), display only in FE | ✅ Locked |
| 4 | Discovery feed ← AORDF (realtime stream) | ✅ Locked |
| 5 | SAFEHOUSE placement ← FULL-node device; TACTICAL ← PARTIAL-node device; gated by 42 | ✅ Locked |
| 6 | Sol cycle ← 42-computed airdrop epoch; hybrid cadence; name "Sol cycle" locked | ✅ Locked |
| 7 | Placement = once per device, lifetime (enforced by 42) | ✅ Locked |
| 8 | Attacks cost target faction's token; defenses cost own faction's token; AORDF prices live | ✅ Locked |
| 9 | No BP — `Outpost.buildPoints` removed everywhere; "BUILD PTS" tile replaced with VOTC/earnings display | ✅ Locked |
| 10 | Static `MISSION_META.*.cost` removed; replaced by live AORDF quote `{ token, amount }` | ✅ Locked |
| 11 | FE labels show correct token symbol derived from action type + faction relationship | ✅ Locked |
| 12 | VOTC accrual formula owned by AORDF — `logic.ts:341` accrual line deleted; FE displays AORDF-reported pending + wallet-settled balance | ✅ Locked |
| 13 | Uptime measured by node client → reported to AORDF; `Outpost.uptime` becomes display cache | ✅ Locked |
| 14 | Health tracked by AORDF — missions modify it, reward calc reads it | ✅ Locked |
| 15 | Sol cycle naming: display = "Sol cycle"; field = `solCycle` (cycle ID); mock increment deleted | ✅ Locked |

### Open questions (PENDING — need user confirmation before implementation)

| # | Question | Context |
|---|---|---|
| Q1 | Does the node-running gate apply to FULL outposts? | Current assumption: FULL = faction-anchor, not user-placeable. §2. |
| Q2 | Sol cycle default cadence: 24h or 7d? | §3. |
| Q3 | What's in "other items" of the VOTC formula? | §5.2. |
| Q4 | Formula public or opaque? | §5.2. |
| Q5 | Per-outpost accrual breakdown in UI: Option A or B? | §5.4. Recommendation: B. |

---

## 8. Implementation status

**No code has been changed yet.** This document is the requirements spec only.

When implementation begins, the order of operations should be:

1. **Type layer** — apply field renames/removals in `src/lib/types.ts` + `src/lib/factions.ts`
2. **Backend mock cleanup** — strip BP/sol-tick logic from `mini-services/game-engine/src/`
3. **Source adapter scaffolding** — create `wallet.source.ts`, `aordf.source.ts`, `sol-cycle.source.ts` (initially as typed stubs returning the right shapes)
4. **Frontend UI labels** — replace BP labels with token-correct labels in `right-panel.tsx` + `outpost-detail-card.tsx`
5. **Briefing prompt cleanup** — remove BP from `api/ai/briefing/route.ts` + `api/ai/outpost-briefing/route.ts`
6. **Placement gate** — add triple-gate to `place-outpost` action
7. **Live AORDF quote** — wire the cost-determination flow
8. **Wallet + earnings display** — replace "BUILD PTS" tile with VOTC balance + pending
9. **Sol cycle display** — add cycle ID + countdown + last-airdrop badge
10. **Registry swap** — switch from mock game-engine source to real adapters (behind config flag for dev fallback)
