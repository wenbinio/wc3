# WC3 custom-map AI — prior art, and the gap (2026-08-09)

Question answered: **does a good AI for a Warcraft III custom map exist,
and what can we reuse?** Answer: **no, and almost nothing.** Evidence
classes: [M] measured by reading code/bytes/APIs, [W] documented by a
primary source, [F] folklore. Related: wc3-canon-invariants.md,
translation-candidates-2026-08.md (wave 6d, the Korean 컴까기 genre).

## 1. The engine's native AI system

The map script's ENTIRE AI interface is six natives [M]: `StartMeleeAI`,
`StartCampaignAI`, `CommandAI`, `PauseCompAI`, `GetAIDifficulty`, plus the
guard-position trio. `MeleeStartingAI()` (Blizzard.j:15080) routes each
`MAP_CONTROL_COMPUTER` slot to `PickMeleeAI` → a named `.ai` file in the
archive's `Scripts\` folder. **MPQ override is the whole install
mechanism** — a map shipping `Scripts\human.ai` replaces Blizzard's.

An `.ai` script is plain JASS compiled against `common.j + common.ai`
(123 natives) [M]. Blizzard's own `human.ai` (2003, 649 lines, shipped
verbatim inside maps we read) contains **not one per-unit order**: combat
is declared as unit-type quantities, a scalar `force_level()`, four
booleans and a point. Everything below that — who attacks whom, when to
back off, spell timing — is engine C++ ("captains"), unexposed and
untunable. On a custom map every input it reads is meaningless (altars,
mines owned, peon assignments, expansions).

**Important correction to the obvious hypothesis**: the VM is not the
limitation, **the library is** [M]. Because `common.j` is loaded in the AI
VM, an `.ai` script can ignore every melee native and run `StartThread` +
`Sleep(0.1)` loops issuing `IssueTargetOrder` per unit — AMAI does exactly
this. So "the native AI system is the wrong tool" is true of
`common.ai`'s MODEL, and false if read as "the `.ai` file is the wrong
host". (Unmeasured: whether `StartMeleeAI` initialises cleanly on a
non-melee map. AMAI's `main()` calls `GetPlayerStartLocationLoc`, so at
minimum start locations are needed. A 30-minute in-game experiment.)

Documented ceiling of the native attack captain [W], from the JASS
Campaign AI 2.0 author: it cannot be stopped from chasing stray unit
groups, and **it stops a winning attack** — clears its target's proximity
and goes home while enemy structures sit just outside the planned radius.

## 2. AMAI — the only large body of working WC3 combat-AI code

Ships INSIDE the map archive [M]: `Scripts/common.ai` 1,215,096 bytes
(31,537 lines, 834 functions) + four race brains + Blizzard's 2003
originals kept as fallback. Two unrelated Korean maps carry it
byte-identically; their own `war3map.j` has zero AI references beyond the
stock `MeleeStartingAI()` call. The 컴까기 doctrine "the map IS the AI
script" is literally true.

Architecture [M]: a cooperative scheduler on one AI thread — a binary-heap
job queue with `Sleep(0.05)` granularity, jobs re-arming on a period.
Combat jobs and their REAL tick rates: micro-units 1s (flee below
max(30% HP, 100)), micro-hero 1s (HP delta + enemy/ally density, TP-scroll
logic, **surround detection**: enemy density > 5 and moved ≤225 units last
tick → teleport home), focus-fire **2s**, retreat control 2s (ally vs
enemy `GetUnitStrength` sums against two interpolated thresholds).

Its focus-fire priority is a real function [M]: lowest-HP hero *if*
`hero_hp < 35 × ranged ally strength` or the hero is disabled; else
lowest-HP **disabled** unit (movespeed 0 = ensnared/webbed) unless the
plain lowest-HP unit has `hp×3 < disabled_hp`; else lowest-HP unit; else
building. Then it gathers own units within 600 (ranged) / 250 (melee),
**excludes units mid-channel on a hardcoded list of 11 channelled
ultimates**, and issues a group attack. Its kite is one rule: a damaged
(<70%) ranged unit facing a nearer, not-faster melee attacker within 150
→ move 400 units directly away, re-arm guard position in 1s.

Telling detail [M]: `RemoveGuardPosition` / `RecycleGuardPosition` /
`ClearCaptainTargets` appear throughout — **AMAI spends real effort
fighting the engine captain that keeps re-issuing guard positions
underneath it.** That is the cost of micro-ing inside the native AI's
world.

**Melee-only by the authors' explicit instruction** [W]: "please don't try
to use it on completely custom maps… It will make no difference." Code
agrees [M] — strip melee and nothing runs. But the general machinery IS
transferable: job-queue scheduler, `GetUnitStrength`, density/centroid
helpers, the focus-fire priority function, the kite rule, surround
detection, flee interpolation — ~90% plain `common.j`. Licence:
non-commercial, credit required, **permission required for use in your own
mod**. Authored in JASS + config, built by Perl, installed via a bundled
MPQEditor.

## 3. Custom-map AI as actually practiced

- **Castle Fight (8.3) Legendary AI** — the best readable custom-map AI
  found [M]. 13,991 lines, unobfuscated. Makes **one decision per AI
  player every 10 SECONDS**, and that decision is *which building or item
  to buy*: it scores the race's buildable units for counter-picks against
  enemy armour/attack types, scores 11 items, scores a tower build, takes
  the max. Two genuine AoE-targeting routines (`FindDensestArea` grid scan
  for a strike item and a heal). **It issues zero movement orders to
  combat units** — in Castle Fight units auto-walk and auto-fight. It also
  cheats openly (gold→lumber conversion, free food).
- **澄海3C with AI** — 52 named AI triggers [M]: attacked-reactions with
  60s self-disables, a hardcoded per-spell counter table (radius 4000 for
  four specific channels), invisibility detection, idle-relocation on a 2s
  poll, and hero-to-lane assignment by `GetRandomInt(1,3)`. Honest shape:
  **~52 reflexes, hardcoded constants, random lane choice, no scoring
  function, no plan.**
- **Farmer vs Hunter AI** — target selection is `GroupPickRandomUnit`;
  the core action is `SetUnitPositionLoc(hunter, farmerLoc)`, i.e. **the
  bot teleports onto its target** before attacking [M]. A cheating
  scripted harasser, not an AI. (Recorded because it is widely felt to be
  "decent" — it is decent because it does not have to search.)
- **The genre control**: **Warhammer: Tides of Chaos** (247 hosted/mo,
  14,028 editor saves, 22 slots) has **ZERO AI** [M] — `StartMeleeAI` 0,
  `CommandAI` 0, AI-named functions 0, and all 20 `MAP_CONTROL_COMPUTER`
  references are *exclusions*: the map's entire relationship to a computer
  player is "treat it as an empty slot". Same for **Footmen vs Grunts**
  (118/mo, 35,629 editor saves): "AI" means a **+20 gold / +5 lumber drip
  every 5 seconds**.
- **DotA AI is dead** [M/W] — the AI line topped out around 6.83d; the
  live DotA in the canon (3,667 hosted/mo) has none.
- Community-canonical method [W]: a Hive tutorial recommending hand-rolled
  GUI finite state machines. No library, no framework.

## 4. The headline findings

1. **No good custom-map AI exists.** The best one decides every 10
   seconds and never moves a combat unit.
2. **100% of measured "hard" AIs achieve difficulty by CHEATING** —
   Korean 컴까기 (+5000 gold/lumber every 600s), Castle Fight (resource
   conversion, free food), Farmer vs Hunter (teleport-to-target). **Nobody
   has a competence dial; everybody has a resource dial.**
3. **Slot FILLING is free and universal; slot PLAYING is the unmet need**
   [M]. Every live host bot descends from GHost++, whose `!comp <slot>
   <skill>` seats a `MAP_CONTROL_COMPUTER` player with a difficulty. On a
   custom map that never calls `StartMeleeAI`, it is an inert player that
   owns units and does nothing — and real maps then go out of their way to
   exclude it.
4. **There is no WC3 AI framework to adopt.** WurstStdlib2 has 100+
   packages and no AI package; Hive's systems are combat plumbing, not
   decision-making.

## 5. THE GAP — what a competent auto-spawn-micro AI must do that nothing does

1. **Run at micro tempo.** Everything measured decides at 0.5–10s (AMAI's
   fastest combat job is 1s, focus-fire 2s; Castle Fight 10s). Focus-fire,
   ability timing and retreat in a spawn war need ~0.1–0.25s, plus
   per-unit state (last order, time-since-order, current target,
   cooldowns) that nothing in the corpus keeps. AMAI's only per-unit
   memory is group membership.
2. **Own its units** rather than negotiating with an engine captain. In an
   auto-spawn map there is no captain to fight — and no prior art for what
   full ownership looks like.
3. **Score targets on damage and time-to-kill**, not lowest absolute HP.
   No prior art has an armour/attack-type table applied to TARGETING
   (Castle Fight has one, applied to production), no overkill avoidance,
   no "who is killing us fastest".
4. **Position continuously.** The entire corpus's positioning is AMAI's
   one 400-unit backstep. No surround, concave, focus arc, body-block,
   retreat-and-re-engage, or terrain use.
5. **Time and place abilities**, including holding a stun and reacting
   inside an enemy cast window. Nothing sequences its own kit.
6. **Keep a hero alive AND useful.** AMAI is retreat-only; no aim, no
   positioning for damage, no aggression decision.
7. **Decide push-vs-defend, and be willing to ignore its own base** — the
   exact documented failure of the native captain, unaddressed by every
   custom AI read.
8. **Be competent without cheating** — unexplored territory in this
   ecosystem.

## 6. Constraints on any build

- **Sim-testability** [M]: `lib/sim` loads `war3map.lua` only and THROWS
  on `scriptLanguage 0`, and has no `.ai` concept — so an `.ai`-hosted AI
  is 100% un-iterable in our harness. An in-map **Lua** AI is loadable,
  but the harness RECORDS orders rather than executing them (no movement,
  no auto-attack, no pathing; `GroupTargetOrder`, `GetUnitCurrentOrder`,
  `IsUnitInRange`, `UnitAlive`, `IsUnitVisible` are unimplemented →
  inert). **We can test decisions, never outcomes.** Teaching the sim
  movement + auto-attack + range is the highest-leverage tooling
  investment this program implies.
- **Language**: `.ai` is JASS-only; the map script can be Lua. Since the
  fleet and the sim are Lua, an **in-map Lua AI driven by our own timer**
  is the only design iterable with existing tooling — and it sidesteps the
  `common.ai` melee model entirely. The `CommandAI` /
  `CommandsWaiting`/`GetLastCommand` channel exists for map-script ↔ `.ai`
  interop if ever needed.

## 7. Sources (all re-fetchable)

jassdoc `common.ai` (123 natives, ground truth), `common.j`, `Blizzard.j`
(AI interface §; `MeleeStartingAI` @15080, `PickMeleeAI` @15045);
`SMUnlimited/AMAI` README + LICENSE; `Stannnnn/ghostpp` `ghost/game.cpp`
(`!comp`) + `game_base.cpp` (`ComputerSlot`); Hive threads
`jass-campaign-ai-2-0.334624`, `how-to-make-an-ai-for-your-map.245613`,
`castle-fight-8-3-legendary-ai.373300`. Maps read (storagebox
`/maps/<id>/<path>`): 418842, 424545 (AMAI-shipping KR), 196410 (FvH AI),
435666 (澄海3C AI, unobfuscated), 441745 (WToC — no AI), 447001 (FvG — no
AI).

**API note**: `wc3maps.com/api/search` caps at 24 results regardless of
`count`; this agent reports paging via the response's `cursor` field
(wave 6d recorded cursor as not accepted — reconcile before relying on
either).
