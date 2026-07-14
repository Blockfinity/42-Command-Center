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

### 2.1 Terminology (user-facing names locked)

| Internal / backend | User-facing name | How it runs |
|---|---|---|
| Full node (daemon) | **Safehouse** | Background daemon process |
| Partial node (plugin) | **Tactical Safehouse** | Browser/plugin-based, not a daemon |
| ~~"full node" / "partial node"~~ | — | **Do not use these terms in UI** |

### 2.2 Device model

```
1 wallet  →  N devices
              ├─ device A: Safehouse installed      → can place 1 SAFEHOUSE  (lifetime, one-shot)
              ├─ device B: Tactical Safehouse installed → can place 1 TACTICAL  (lifetime, one-shot)
              └─ device C: nothing installed        → cannot place
```

### 2.3 Placement = activation (locked)

The flow is **install → place → run**, not install-and-run:

```
1. INSTALL    user downloads Safehouse or Tactical Safehouse software onto device
              → node exists but is DORMANT (not running, not earning, not reporting)
2. PLACE      user opens 42, connects wallet, picks location on map, places
              → placement ACTIVATES the node — it starts running,
                reports uptime to AORDF, begins earning VOTC
3. RUN        activated node runs continuously (until device dies or user stops)
```

**Before placement:** the node is installed but dormant.
**After placement:** the node is activated and running.
**Placement is the activation step** — there is no separate "start" command.

### 2.4 Placement authorization (triple gate)

Placement is authorized only when all three conditions hold. The frontend **never** decides this locally — it asks 42 "can this device place?" and renders the answer.

1. **Wallet owns the device** — wallet signature
2. **Device has the matching software installed but not yet activated** — node-client attestation, source = 42
   - `SAFEHOUSE` placement ← requires **Safehouse** (daemon) installed on the device
   - `TACTICAL` placement ← requires **Tactical Safehouse** (plugin) installed on the device
3. **Device has not placed yet** — lifetime cap, source = 42

### 2.5 Faction HQ outposts — they don't exist (locked)

**Confirmed:** Pre-existing faction HQ outposts do **not** exist in the real system. Every outpost on the map is user-placed (Safehouse or Tactical Safehouse). Factions have no home bases.

**Action:** The mock seed data faction HQs (Fang Prime, Hammer Forge, Resolute Stand, etc., currently `type: "FULL"`) get removed. The `OutpostType` enum becomes `"SAFEHOUSE" | "TACTICAL"` only — `"FULL"` is removed entirely (per lock 22).

### 2.6 Terminology — CORRECTED (locked)

The previous version of this spec conflated "codename" and "faction". The correct terminology is:

| Term | What it is | Who assigns | Fixed? |
|---|---|---|---|
| **Outpost** | Top-level group (3 exist: #33 FANG, #21 HAMMER, #7 RESOLUTE; more added as story progresses) | System (story-driven) | Yes, per outpost |
| **Outpost number** | 33, 21, 7 (identifier of the outpost) | System | Yes |
| **Faction name** | FANG, HAMMER, RESOLUTE (the outpost's faction name) | System | Yes |
| **Moniker** | User's personal username/handle | User, on AORDF | Fixed once chosen |
| **Safehouse name** | User's chosen name for their placed Safehouse | User, at placement | User-chosen |

A user's full identity = **moniker** (personal) + **outpost# + faction** (which group they joined). Example: moniker "GhostHunter", belonging to Outpost 33 FANG.

**Display format:** "Outpost 33 FANG" (not "FANG faction", not "codename FANG"). The word "faction" stays out of the UI — FANG/HAMMER/RESOLUTE appear only as part of the outpost identity string.

### 2.7 User identity flow (locked)

```
1. User on AORDF does "create safehouse" special mission
2. User selects an outpost to join on AORDF (Outpost 33 FANG / 21 HAMMER / 7 RESOLUTE)
3. User chooses their moniker (personal handle) on AORDF
4. AORDF redirects them to 42 with their identity:
   { outpostNumber: 33, factionName: "FANG", moniker: "GhostHunter" }
5. User downloads Safehouse software, returns to 42
6. User picks location on 42's map, names their Safehouse, places → activates
7. Future visits to 42 with wallet → 42 already knows
   "you are GhostHunter, Outpost 33 FANG"
```

**Critical:** The outpost# + faction + moniker are assigned on **AORDF**, not 42. 42 receives it as the user's identity (read-only). The outpost# + faction are **fixed** — Outpost 33 is always FANG. Permanent. The moniker is fixed once chosen.

When a user returns to 42 directly with their wallet (not via AORDF), 42 already knows their outpost#, faction, and moniker — no re-selection, no onboarding flow.

### 2.8 No "faction" language in frontend (locked, corrected)

The word "faction" never appears in frontend UI strings. FANG/HAMMER/RESOLUTE are **faction names** (part of the outpost identity), displayed as "Outpost 33 FANG" — never as "FANG faction".

| Layer | Term |
|---|---|
| Backend code (internal) | `faction`, `FactionId` — acceptable as internal type names |
| Frontend UI strings | **Never "faction"** — display as "Outpost {number} {factionName}" (e.g., "Outpost 33 FANG") |
| User's personal handle | **"Moniker"** (AORDF's term) — not "codename", not "username" in UI |

### 2.9 Outpost structure (locked)

There are exactly 3 outposts currently. More will be added as the story progresses. Each outpost has:
- **Outpost number** (33, 21, 7) — fixed identifier
- **Faction name** (FANG, HAMMER, RESOLUTE) — fixed

Future example: "Outpost 11 Viper" (doesn't exist yet — story-driven expansion).

Users **join** an existing outpost on AORDF. They do not get assigned a new outpost number. The outpost# + faction are properties of the outpost itself, not per-user assignments.

**42 has no visibility into outpost/faction assignment.** AORDF owns it entirely. 42 receives the user's identity (outpost# + faction + moniker) as read-only data.

### 2.10 Critical code conflict (PENDING — needs confirmation before refactor)

The current codebase has a naming collision that contradicts the terminology above:

```typescript
// src/lib/types.ts — CURRENT (conflicts with user terminology)
export interface Outpost {
  id: string;
  name: string;
  type: OutpostType;  // "FULL" | "TACTICAL" | "SAFEHOUSE"
  faction: FactionId;
  ...
}
```

Here, `Outpost` = a **placed structure** (what the user calls a Safehouse/Tactical Safehouse). But in the user's vocabulary, **"Outpost" = the top-level faction group** (Outpost 33 FANG). These are completely different things.

**Proposed fix (not yet applied — pending confirmation):**
- Rename current `Outpost` type → `Safehouse` (the placed structure)
- Rename `OutpostType` → `SafehouseType` = `"SAFEHOUSE" | "TACTICAL"` (drop `"FULL"`)
- Introduce a new `Outpost` type for the top-level group: `{ number: number; factionName: string }`
- Each `Safehouse` references its outpost: `outpostNumber: number` (33/21/7)

This rename touches ~17 files (every file that imports `Outpost`). Will not apply until confirmed.

### 2.11 Ownership model (locked)

| Concept | Owner |
|---|---|
| Safehouse / Tactical Safehouse (the outpost) | **The user's wallet** (whoever placed it owns it) |
| Faction (FANG / HAMMER / RESOLUTE) | Allegiance, not ownership — the user picks a faction, their outposts fight for that faction |
| Outpost name | User-chosen at placement (per lock 20) |
| User's handle/name | Shown on preview card only during successful sabotage (per lock 21) |

The faction doesn't "own" outposts; users do. Faction is just which side you fight for.

### 2.12 User-named outposts (locked)

Users name their own Safehouses and Tactical Safehouses at placement time. The `Outpost.name` field becomes user-provided (was auto-generated "FANG NODE 5" in the mock). The alphanumeric code (FNG-2155-NYC) is separate and system-generated — both display together.

### 2.13 Sabotage attribution (locked, detail deferred)

The placing user's handle (`Outpost.ownerName`) appears on the outpost preview card — **but only visible during successful sabotage**. When someone sabotages your outpost, you see their name. The exact visibility rules (how long the name shows, who can see it, retroactive vs. live) are **deferred to later**.

---

## 3. Sol cycle (airdrop epoch)

**Hybrid cadence: 24h target window + 42-declared boundary.**

| Aspect | Value |
|---|---|
| Default target cadence | **24h** ("sol" = day, fits the name). Configurable by 42. |
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

### 5.2 VOTC formula — owned entirely by AORDF, public

**AORDF is the game.** It owns the full game logic: attacks, defenses, missions, the VOTC earnings formula, outpost health, discovery feed, mission pricing, token execution. The formula is **public through AORDF** (not through 42).

The user specified the formula takes "uptime and health and other items" as inputs, but the complete input set and weights are AORDF's business — **42 does not enumerate, compute, or hide the formula.** 42's job is to pull the right data from AORDF and display it.

**Scaling note:** Start by pulling the right data from AORDF (pending + settled VOTC, per-outpost accrual if AORDF exposes it). Optimize/scale later once the data shape is confirmed.

### 5.3 Architecture — AORDF is the game, 42 is a viewer + cycle declarer

| Layer | Owns | Doesn't own |
|---|---|---|
| **AORDF** | Game logic (attacks, defenses, missions), VOTC formula (public), outpost health, discovery feed, mission pricing, token execution | Sol cycle declaration, airdrop distribution |
| **42** | Sol cycle boundaries, airdrop distribution (reads AORDF ledger at close), map-based viewer for AORDF activity | Game logic, VOTC formula, mission pricing |
| **Wallet** | VOTC balance (settled, on-chain) | Earnings calculation |
| **Node client** | Uptime telemetry → reports to AORDF | Rewards |

**User entry points:**
- Most users enter via **AORDF** (primary game interface)
- Some users enter via **42** with their wallet (map-centric view)

**PENDING (Q1):** Can 42 submit actions (attacks, defenses, missions) to AORDF on behalf of the user, or must users go to AORDF to launch any action (with 42 being read-only)? The current 42 frontend has attack/defend buttons — if 42 is read-only, those buttons get removed; if 42 can submit to AORDF, they stay but route through AORDF as executor.

### 5.4 Data model changes

| Field | Current | New |
|---|---|---|
| `Outpost.buildPoints` | per-outpost BP accrual | **Remove** (BP doesn't exist; AORDF accrues VOTC at wallet level) |
| `Outpost.uptime` | per-outpost seconds | **Keep** — but *authoritative* uptime is measured by the node client and reported to AORDF. `outpost.uptime` becomes a display cache of the last known AORDF-reported value, not a locally-incremented counter. |
| `Outpost.health` / `maxHealth` | per-outpost | **Keep** — AORDF is source of truth (missions modify it), frontend displays. |
| `Outpost.name` | auto-generated "FANG NODE 5" | **User-provided at placement** (per lock 20) |
| `Outpost.ownerName` | doesn't exist | **Add** — placing user's handle; shown on preview card only during sabotage (per lock 21) |
| `Outpost.ownerWallet` | doesn't exist | **Add** — placing user's wallet address; for ownership verification |
| `OutpostType` enum | `"FULL" \| "TACTICAL" \| "SAFEHOUSE"` | **Remove `"FULL"`** (per lock 22). Final values depend on §2.5 (do faction HQs exist?). If no faction HQs: `"SAFEHOUSE" \| "TACTICAL"`. |
| `GameState.operative` | no balance fields | Add: `walletVotc: number` (settled), `pendingVotc: number` (this cycle, from AORDF) |
| Per-outpost accrual breakdown | doesn't exist | **Add** — Option B confirmed (per lock 23). AORDF must expose per-outpost accrual. |

### 5.5 Frontend display — Option B confirmed

**Option B — wallet total + per-outpost breakdown (locked):**
```
┌─────────────────────────────────────┐
│ VOTC BALANCE     PENDING (CYCLE 1247)│
│ 12,847           +1,284              │
├─────────────────────────────────────┤
│ EARNINGS BREAKDOWN                  │
│ ▸ FNG-2155-NYC    +412 VOTC         │
│   4617h uptime · 78% health · 30 TF │
│ ▸ FNG-3300-LON    +318 VOTC         │
│   2891h uptime · 92% health · 30 TF │
│ ▸ FNG-0892-TYO    +554 VOTC         │
│   6102h uptime · 65% health · 30 TF │
└─────────────────────────────────────┘
```

**Rationale:** Gives the player a reason to care about each outpost's health and uptime, which drives the gameplay loop (defend to keep health up = keep earning). Requires AORDF to expose per-outpost accrual breakdown, not just a wallet total.

---

## 6. Wallet UX — rank insignia as wallet proxy

**No traditional wallet UI.** There is no "Connect Wallet" button, no wallet address display, no MetaMask popup. The wallet is invisible to the user.

### 6.1 The rank insignia IS the wallet button (locked)

The user's rank insignia (computed from outpost level / achievements) doubles as the wallet interaction surface:

| Interaction | Behavior |
|---|---|
| **Hover** the rank insignia | Display balances — VOTC balance (settled) + pending this cycle |
| **Click** the rank insignia | Open wallet actions — sign transactions, etc. |

The user never sees a wallet address. They see their rank, and they interact with the rank insignia as their wallet proxy.

### 6.2 Implications

- The rank insignia component must exist (it's the user's rank/level display).
- A hover-tooltip shows VOTC balance + pending earnings (Option B breakdown can live here or in a separate panel — TBD).
- Clicking the rank insignia triggers wallet-side actions (signing, etc.) — the actual wallet connection is abstracted away from the user.
- No "Connect Wallet" CTA anywhere in the UI.
- No wallet address string ever displayed.

### 6.3 Rank computation — AORDF (locked)

**Rank computation is handled by AORDF**, not 42. Same pattern as the VOTC formula — 42 displays the rank AORDF computes, doesn't calculate it. The rank insignia's level/progression is read-only data from AORDF.

---

## 7. Architecture — source adapter split

The current `mini-services/game-engine` is a single monolithic mock that synthesizes everything. To connect to the real backend it must split into distinct source adapters. The registry/source architecture in `src/components/command/map/registry/sources.ts` was designed for exactly this swap.

### 7.1 Proposed source layout

```
sources/
  wallet.source.ts      → VOTC balance (on-chain read)
  aordf.source.ts       → earnings, attacks/defenses, discovery feed, mission pricing
  sol-cycle.source.ts   → airdrop epoch (42-computed)
  game-engine.source.ts → retain ONLY as a dev/mock fallback
```

The frontend's `NormalizedEvent` vocabulary (`point:upsert`, `arc:upsert`, `heat:batch`, `ping:batch`) already abstracts over the source — so swapping the mock engine for real AORDF/wallet/sol-cycle sources is a registry swap, not a rewrite.

### 7.2 NormalizedEvent contract (existing, retained)

| Event | Producer | Consumer |
|---|---|---|
| `point:upsert` | AORDF (outpost state), wallet (balance) | Layer host → outposts layer |
| `arc:upsert` | AORDF (missions) | Layer host → missions layer |
| `polygon:upsert` / `polygon:takeover` | AORDF (territory control) | Layer host → territory layer |
| `heat:batch` | AORDF (activity density) | Layer host → heat layer |
| `ping:batch` | AORDF (realtime actions) | Layer host → pings layer |
| `cycle:opened` / `cycle:closed` | 42 | Frontend store → sol cycle display |

---

## 8. Consolidated lock list

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
| 16 | User-facing names: **Safehouse** (daemon/full node) + **Tactical Safehouse** (plugin/partial node) only — never "full node"/"partial node" in UI | ✅ Locked |
| 17 | Placement = activation: install → place → run. Node is dormant until placed; placement activates it | ✅ Locked |
| 18 | Sol cycle cadence = **24h** (target), 42-declared close | ✅ Locked |
| 19 | AORDF is the game (owns all game logic, formula, pricing, health, discovery). 42 is a viewer + sol-cycle declarer + airdrop distributor. Formula is public through AORDF | ✅ Locked |
| 20 | Users name their own Safehouses/Tactical Safehouses at placement time (custom name, not auto-generated) | ✅ Locked |
| 21 | User's handle (`ownerName`) appears on outpost preview card — only visible during successful sabotage. Detail deferred. | ✅ Locked |
| 22 | No "node" or "full" terminology anywhere — frontend OR backend. `OutpostType` enum removes `"FULL"`. Safehouse = daemon, Tactical Safehouse = plugin. | ✅ Locked |
| 23 | VOTC earnings display = Option B (wallet total + per-outpost accrual breakdown) | ✅ Locked |
| 24 | Outpost# + faction + moniker assigned on AORDF (not 42). 42 receives it as identity. | ✅ Locked |
| 25 | Outpost#/faction is **fixed** — Outpost 33 is always FANG. Permanent. Moniker fixed once chosen. | ✅ Locked |
| 26 | **No "faction" language in frontend UI strings.** FANG/HAMMER/RESOLUTE are faction names displayed as "Outpost 33 FANG". User's personal handle = "moniker" (not "codename"). Backend can keep `FactionId` internally. *(Corrected — previous version wrongly called FANG/HAMMER/RESOLUTE "codenames")* | ✅ Locked |
| 27 | **No traditional wallet UI** — no "Connect Wallet" button, no wallet address display. Wallet is invisible. | ✅ Locked |
| 28 | Rank insignia IS the wallet button. Click → wallet actions. | ✅ Locked |
| 29 | Hover rank insignia → display balances (VOTC + pending). | ✅ Locked |
| 30 | **"Outpost" = top-level group** (3 exist: #33 FANG, #21 HAMMER, #7 RESOLUTE). More added as story progresses. Each has outpost# + faction name (fixed). | ✅ Locked |
| 31 | **"Moniker" = user's personal handle** (AORDF's term). User-chosen, fixed. Not "codename". | ✅ Locked |
| 32 | Users JOIN an existing outpost on AORDF. Outpost# + faction are properties of the outpost, not assigned per-user. | ✅ Locked |
| 33 | **Rank computation = AORDF.** 42 displays AORDF's rank, doesn't compute it. | ✅ Locked |
| 34 | Future outposts: outpost number + faction name (e.g., "Outpost 11 Viper"). Story-driven expansion. | ✅ Locked |
| 35 | **42 has no visibility into outpost/faction assignment.** AORDF owns it entirely. 42 receives user identity (outpost# + faction + moniker) as read-only. | ✅ Locked |

### Open questions (PENDING — need user confirmation before implementation)

| # | Question | Context | Status |
|---|---|---|---|
| Q1 | Can 42 submit actions to AORDF, or must users go to AORDF to launch attacks? | §5.3. Determines whether attack/defend buttons stay in 42 or get removed. | **DEFERRED** — buttons stay as connectors for now; decision later |
| Q6 | Code conflict: rename current `Outpost` type → `Safehouse`? | §2.10. Current code's `Outpost` = placed structure, but user's "Outpost" = top-level group. Rename touches ~17 files. | **PENDING** |

### Resolved questions

| # | Question | Resolution |
|---|---|---|
| ~~Q1~~ | ~~Does the node-running gate apply to FULL outposts?~~ | Confirmed: faction anchors (currently `FULL` type) are **not user-placeable** — only Safehouse and Tactical Safehouse are. |
| ~~Q2~~ | ~~Sol cycle default cadence: 24h or 7d?~~ | **24h** locked. §3. |
| ~~Q3~~ | ~~What's in "other items" of the VOTC formula?~~ | Reframed: AORDF owns the full formula; 42 doesn't enumerate inputs. §5.2. |
| ~~Q4~~ | ~~Formula public or opaque?~~ | **Public through AORDF**, not 42. §5.2. |
| ~~Q5~~ | ~~Per-outpost accrual breakdown in UI: Option A or B?~~ | **Option B** locked (lock 23). §5.5. |
| ~~Q6~~ | ~~Do pre-existing faction HQ outposts exist in the real system?~~ | **No.** Every outpost is user-placed. `OutpostType` = `"SAFEHOUSE" \| "TACTICAL"` only. §2.5. |
| ~~Q7~~ | ~~How is the codename assigned to a new outpost number?~~ | Not range-based, not independent. Outpost# + faction are fixed properties of the outpost itself. Users join an existing outpost. §2.9. |
| ~~Q8~~ | ~~What's the user-facing label format for codenames?~~ | "Outpost 33 FANG". User's personal handle = "moniker". §2.6, §2.8. |
| ~~Q9~~ | ~~What determines the user's rank?~~ | **AORDF** computes rank. 42 displays it. §6.3. |

---

## 9. Implementation status

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
