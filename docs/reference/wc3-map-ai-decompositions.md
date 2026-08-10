# How WC3 maps actually implement computer players — decompositions (2026-08-09)

**Question answered**: how do real Warcraft III maps drive a competent
computer player — do they use the engine's native AI subsystem, hand-roll
triggers, or run a hybrid — and what should `scripts/experimental/rome-ai/`
steal? Everything below is read out of shipped artifacts: `.ai` scripts and
`war3map.j`/`war3map.lua` pulled from MPQs, plus AMAI's own source tree.

Evidence classes: **[M]** measured by reading code or bytes in this session;
**[S]** measured by the corpus survey below; **[W]** documented by a primary
source. Companion: `wc3-ai-prior-art.md` (inference-heavy; §9 here lists the
corrections). Third-party maps were downloaded to scratch, read, and not
committed (Legal / gotcha 9).

---

## 1. The headline

**The engine ships a complete AI subsystem, and essentially nobody uses it.**
Two independent surveys:

| corpus | archives | readable script | reference ANY AI native | ship their own `.ai` |
|---|---|---|---|---|
| archive.org `wc3_maps_2002` (RoC era) | 5,350 | 5,292 | **82 (1.55%)** | **1 (0.02%)** [S] |
| wc3maps top-70 by `group_hosted_month` (live 2026 canon) | 70 | 52 | **6 (11.5%)** | **0** [S] |

And the 1.55% is softer than it looks. Of 79 corpus maps deep-scanned for the
script-name argument, **94 `StartMeleeAI` and 45 `StartCampaignAI` call sites
pass the literal string `"map.ai"`** — the World Editor's prefilled
placeholder. Hash-probing all 79 archives for `map.ai`, `war3map.ai`,
`Scripts\map.ai` and `war3mapImported\map.ai` returns **zero hits**: the file
does not exist in any of them [M]. Only **14 maps (0.26% of readable)** name a
script that could resolve, and every one of them names Blizzard's stock
`human.ai` / `orc.ai` / `undead.ai` / `elf.ai`. Exactly one map
(`(6)Newracemod28.w3m`) ships AI code of its own, and it does so by
MPQ-overriding Blizzard's `Scripts\orc.ai`, `Scripts\undead.ai` and
`Scripts\common.ai` — the AMAI install mechanism, in 2002.

The live canon is worse. Of the 6 top-70 maps that touch an AI native:
- **Risk Europe 4.10** and **CHAOS B1.A1** call `PauseCompAI(p, true)` on
  every `MAP_CONTROL_COMPUTER` slot — they switch the engine AI **off** [M];
- **Test of Balance v1.30** and **Balanced Hero Survival v21.0c** both call
  `StartMeleeAI(Player(20), "")` — an empty script name on a player index
  that is not a real slot: dead template code [M];
- **Survival Chaos 4.3 / Reborn** and **Line Tower Wars Reforged** use only
  `GetAIDifficulty` — as a multiplier on a resource handout [M].

**Zero of the top 70 hosted maps drive the engine AI. Zero ship an `.ai`.**

But the path *is* usable, and three artifacts prove it (§3, §4). So the honest
verdict is not "the engine AI doesn't work on custom maps" — it is **"the
engine AI works on custom maps and the scene never found out."**

---

## 2. What the engine subsystem actually gives you (ground truth)

`common.ai` exposes **123 natives** [M] (`amai/Natives.j`, which is the
verbatim AI-VM API list). The important thing is what they are *not*: they are
not a melee-only build-order DSL. Grouped:

- **Attack captain** — `CreateCaptains`, `CaptainAttack(x,y)`,
  `AttackMoveXY(x,y)`, `AttackMoveKill(unit)`, `CaptainVsUnits`,
  `CaptainVsPlayer`, `CaptainGoHome`, `TeleportCaptain`, `SetCaptainHome`,
  `ClearCaptainTargets`, `ShiftTownSpot`.
- **Captain state read-back** — `CaptainAtGoal`, `CaptainInCombat`,
  `CaptainIsHome`, `CaptainIsFull`, `CaptainIsEmpty`, `CaptainGroupSize`,
  `CaptainReadiness`, `CaptainReadinessHP`, `CaptainRetreating`.
- **Assault / wave manager** — `InitAssault`, `AddAssault(qty, unitid)`,
  `AddDefenders`, `SetStagePoint`, `SuicidePlayer`, `SuicidePlayerUnits`,
  `SuicideUnit`, `SuicideUnitEx`.
- **Target discovery** — `StartGetEnemyBase` / `WaitGetEnemyBase` /
  `GetEnemyBase` (an asynchronous, pathing-aware base search),
  `GetEnemyExpansion`, `GetMegaTarget`, `GetCreepCamp`, `TownThreatened`.
- **Threading** — `StartThread(code)`, `Sleep(real)`, plus the whole of
  `common.j` (AMAI calls `IssuePointOrder` 57×, `IssueTargetOrder` 33×,
  `GroupEnumUnitsInRange` 49×, `GetUnitCurrentOrder` 88× from inside `.ai`
  files) [M].
- **Map-script interop** — the map calls `CommandAI(player, cmd, data)`; the
  `.ai` reads `CommandsWaiting()`, `GetLastCommand()`, `GetLastData()`,
  `PopLastCommand()`.
- **Mode switch** — `SetMeleeAI()` vs `SetCampaignAI()`, chosen *inside* the
  script.

The five things a hand-rolled AI has to build and the engine hands over free,
in the exact language of our five playtest failures:

1. **`FormGroup(seconds, testReady)`** (Blizzard `common.ai`, in AMAI's
   `common_original.eai`) — blocks until `CaptainIsFull() and
   CaptainReadiness() >= 50` (50% HP), *with a timeout*:
   `exitwhen form_group_timeouts and (sleep_seconds < -60)` → "send anyway
   after 60 s". Staging with a deadline, in one call.
2. **`SleepUntilAtGoal()`** — `exitwhen CaptainRetreating()` /
   `CaptainAtGoal()` / **`CaptainIsHome() // failed to path and returned
   home`** / `CaptainIsEmpty()`. The engine already detects an unreachable
   objective and reports it as a state.
3. **Attack as a blocking procedure**: `AttackMoveKillA(target)` =
   `AttackMoveKill(target)` → `ReformUntilTargetDead(target)` →
   `SleepInCombat()`. The AI does not re-decide every tick; it issues one
   order and sleeps, which is why order counts stay near zero.
4. **`TownThreatened()`** — engine-side "am I under attack", used by the
   WE template as a single guard at attack-launch time.
5. **Movement, retreat and per-unit combat behaviour** are C++ captains; you
   never write them.

**Cost, from AMAI's own code**: you are now sharing your units with a captain
that keeps re-issuing guard positions underneath you. `RemoveGuardPosition`
appears **61 times** in AMAI [M], always in the pattern
"`RemoveGuardPosition(u)` → issue my own order →
`TQAddUnitJob(GetTimeToReachLoc(u, loc) + 1, RESET_GUARD_POSITION, 0, u)`" —
take the unit, order it, and hand it back after its estimated travel time.
That handoff protocol is the price of admission, and it is also a reusable
idea (§8).

**Documented ceiling** [W, carried from prior art]: the native attack captain
cannot be stopped chasing stray groups, and it stops a winning attack once its
target's proximity is cleared.

---

## 3. AMAI — the deepest existing WC3 combat AI, and it is a **hybrid**

Source: `github.com/SMUnlimited/AMAI` (cloned and read; ~24,700 lines of
`.eai` across `common.eai` 524 KB, `races.eai`, and **50 job files** under
`Jobs/`, preprocessed by Perl into the `common.ai` that ships inside maps).

**It is not "hand-rolled instead of the engine", and it is not "engine
instead of hand-rolled".** Counting call sites [M]:

```
RemoveGuardPosition 61   CaptainInCombat 22   AttackMoveXY 17   CaptainAtGoal 12
CaptainIsHome 11         AddAssault 11        CaptainRetreating 10  TeleportCaptain 9
CaptainIsEmpty 9         CaptainAttack 9      AttackMoveKill 8   SetCaptainHome 7
CaptainGoHome 7          ClearCaptainTargets 3  InitAssault 2    CreateCaptains 1
```

Macro movement is the engine captain; micro is hand-written on top; and a
sixth of the effort is spent arbitrating between the two.

### 3.1 The architecture worth stealing

- **A binary min-heap job queue on one AI thread** (`tq_time/tq_jid/tq_par`,
  `TQAddJobEx` → `TQUpHeap`, `common.eai:818–840`, `5854+`). Jobs re-arm
  themselves at the end of their own body.
- **Declarative job table** (`Jobs.txt`, 50 rows): job id, function call, a
  start condition, and an **initial start-time min/max** so jobs from
  different subsystems do not align on the same tick.
- **Load-adaptive tick rate**: every period is `k * sleep_multiplier`, and
  `GetSleepMultipler(aiCount) = LinearInterpolation(slm_start, slm_end,
  1.0, 2.0, aiCount) + GetRandomReal(-0.2, 0.2)` — with `slm_start=6,
  slm_end=18` in the TFT settings. Two AIs run at full rate; eighteen run at
  half rate; and the **±0.2 s jitter** guarantees N AIs never think on the
  same frame [M].
- **Real periods** (measured from the re-arm calls, not the table):
  `MICRO_UNITS` 1.5 s, `MICRO_HERO` 1 s, `FOCUSFIRE_CONTROL` 2 s,
  `RETREAT_CONTROL` 2 s — each × `sleep_multiplier`.

### 3.2 The army tracker — the piece rome-ai does not have

`Jobs/ARMY_TRACK.eai` maintains, **for every player including enemies**, a set
of clustered armies:

```
army_radius = 1500      army_future_mult = 3
per army: owner, army_loc (centroid), army_dir (centroid delta = velocity),
          army_future (projected position), army_strength (Σ GetUnitStrength),
          army_count, army_group
```

`TrackArmy` re-clusters by enumerating in `army_radius` of a live member,
excludes structures/peons/harvesting ghouls and anything already claimed by
`in_army_group`, dissolves any cluster of ≤1 unit, and recomputes
`army_dir = centroid − previous centroid`. `army_future` is the centroid
pushed `army_future_mult` steps along `army_dir`. `main_army` is whichever
cluster contains the major hero.

That feeds a **continuous threat field** rather than a "last attacked here"
reflex (`UpdateSpecificTownThreat`):

```
dist  = max(distance(army_future[i], town), full_threat_distance)      // 600
if distance(army_loc[i], town) < |army_dir[i]|
   and |angle(army_dir[i], town − army_loc[i])| <= 0.4 rad  then dist = 600
else dist = min(dist, distance(army_loc[i], town))
if dist <= no_threat_distance                                          // 3000
   threat = distance_threat_mult * army_strength[i] / dist^0.8         // mult 540
   ally armies subtract 0.3 * threat
```

Read that middle clause: **if an enemy army is heading at you within ~23° and
is closer than one step of its own travel, distance stops mattering.** Towns
are then ranked by `town_threat`, giving `most_threatened_player_town`,
`most_threatened_town` (ally) and `most_threatened_enemy_town` in one pass.

### 3.3 Interrupting a running attack

An AMAI attack is a **procedure that runs to completion**, not a per-tick
re-score. `CommonSleepUntilTargetDeadAM` (`common.eai:12825+`) is one loop
with explicit exits: `town_threat_break and town_threatened`, `break_attack`,
`isfleeing`, `CaptainIsEmpty()`, target dead / allied / invisible. Interrupts
are *flags set by other jobs*, not competing scores.

Inside the same loop is a **stall detector**, and it is exactly the shape our
round-3/4 "stall backstop" wants:

```
cur_dist = distance(army_loc[main_army], target)
if |cur_dist − last_dist| <= 300 then stuck_counter++ else stuck_counter = 0
if stuck_counter > 10 then
    MarkBadExpansion(current_expansion)          // persistent blacklist
    if not IsWaterExpansion(...) then AddWaterExpansion(...)   // reclassify
    break_attack = true ; return
```

Two things: the failure is **blacklisted**, not merely aborted; and an
objective that cannot be walked to is **reclassified as needing water**, which
is an inference about the map made from a failure, not from a graph.

### 3.4 Micro, verified

`flee_health_percentage = 0.25`, `flee_minimum_health = 100`
(`common.eai:277–278`), i.e. a unit is pulled out below
`max(25% max HP, 100)` — **prior art says 30%; the source says 25%** [M].
`FocusFireJob` gathers around `major_hero`'s position, around
`army_loc[main_army]`, and around every *other* army the AI owns, each within
`battle_radius`, then calls `FocusEnemyUnitsNearGroup` — so focus fire is
per-army, not global.

### 3.5 What is and is not transferable

**Melee-only by the authors' explicit instruction** [W, `README.md:148`]:
"Advanced Melee AI is made to be used on melee maps only so please don't try
to use it on completely custom maps (e.g Tower Defence). It will make no
difference on such maps." The README's own "Custom Maps" section
(`README.md:333`) only covers custom maps that are still melee-shaped
(halls, mines, the standard tech tree) and warns that a non-`Latest Patch`
data set strands the AI at Tier 2.

Licence is the real blocker for reuse: non-commercial, credit required,
redistribution allowed, but **"Users must ask for permission to use in their
own mod projects"** and the same licence must propagate. So AMAI is a
**design source**, not a dependency. Everything cited above (job heap, army
clustering, threat field, stall detector, travel-time handoff) is ~90% plain
`common.j` arithmetic and is reimplementable without copying code.

---

## 4. The World Editor ships an AI Editor, and custom maps use it

**Footmen Frenzy 9.0 AI** (wc3maps 417656) ships **eight** `.ai` scripts under
`war3mapImported\` — `TheARCHERClan.ai`, `TheFEARClan.ai`, `TheSHEEPClan.ai`,
`TheUNDEADClan.ai`, `TheWARRIORClan.ai`, `TheUNKILLABLEClan.ai`,
`TheDEFENDERClan.ai`, `TheOTHERClan.ai` — each ~640 lines, headed:

```
//   Warcraft III AI script
//   Generated by the Warcraft III World Editor
//   Date: Mon Sep 18 13:19:49 2006
```

and wired from `war3map.j` with twelve calls of the form

```jass
call StartMeleeAI( Player(10), "war3mapImported\\TheARCHERClan.ai" )
```

each guarded by a per-player condition and followed by a difficulty-graded
gold handout (`SetPlayerStateBJ(..., 100)` vs `750`).

**The map's own `war3map.w3i` says `isMeleeMap: false`, `useCustomForces:
true`, `useCustomTechtree: true`, `fixedPlayerSetting: true`, w3i v33** [M].
That is the empirical answer to the crux question: **the engine AI runs on a
non-melee custom map, driven from the map script, against custom unit types.**
`Footmen Frenzy 1000 AI 4.1` (418844) does the same with `AI\AII3.ai`, and
ships a second build, `war3mapImported\AII no attack waves.ai`, that differs
only by dropping the hero-skill table — evidence the author was A/B-ing the
generated script by hand.

### 4.1 The generated template, which is the whole policy surface

```jass
function main takes nothing returns nothing
    call InitAI()
    call SetPlayerName( ai_player, "The ARCHER Clan" )
    call InitOptions()          // ~15 SetX flags, incl. SetMeleeAI()
    call SelectHeroes()
    call CreateCaptains()
    call SetHeroLevels( function ChooseHeroSkill )
    call Sleep( 0.1 )
    call StartThread( function WorkerAssignment )
    call StartThread( function AttackAssignment )
    call PlayGame()
endfunction

function AttackAssignment takes nothing returns nothing
    call StaggerSleep( 0, 2 )
    loop
        loop
            call UpdateConditions()
            exitwhen (HaveMinimumAttackers() and not CaptainRetreating())
            call Sleep( 2 )
        endloop
        call RemoveInjuries() ; call ResetAttackUnits()
        call PrepareForces() ; call LaunchAttack()
    endloop
endfunction

function LaunchAttack takes nothing returns nothing
    if (TownThreatened()) then                      // home guard, one line
        call Sleep( 2 ) ; return
    endif
    // priority 1: GetAllianceTarget()   (a shared, ally-declared target)
    // priority 2: GetEnemyExpansion(), else StartGetEnemyBase/WaitGetEnemyBase/GetEnemyBase
    // priority 3: GetEnemyExpansion()
    // priority 4: GetMegaTarget()
    if (target != null) then
        call SetAllianceTarget( target )
        call FormGroup( 3, true )                   // stage: full + >=50% HP, 60s timeout
        call AttackMoveKillA( target )              // blocking: attack -> reform -> in-combat
        call AttackWaveUpdate()
    else
        call Sleep( 20 )
    endif
endfunction
```

`InitOptions` is the tuning surface and is one flag per behaviour:
`SetDefendPlayer`, `SetRandomPaths`, `SetTargetHeroes`, `SetHeroesFlee`,
`SetHeroesBuyItems`, `SetUnitsFlee`, `SetGroupsFlee`, `SetWatchMegaTargets`,
`SetIgnoreInjured`, `SetSlowChopping`, `SetCaptainChanges`,
`SetSmartArtillery`, `SetPeonsRepair`.

**That is ~60 lines of policy for a computer player that stages, attacks,
retreats, defends its base, picks and levels a hero, and coordinates with
allies through a shared alliance target.** Everything else in the 640-line
file is a `BuildPriorities()` ladder of `SetBuildAll(BUILD_UNIT|BUILD_UPGRADE,
qty, id, town)` and an `AddAttackUnit(min, max, id)` composition list.

The corresponding *campaign* path (`CampaignAI(farms, heroes)` +
`SuicideOnPoint(seconds, p, x, y)` + `CampaignAttackerEx` /
`CampaignDefenderEx` / `SetBuildAll`, all in Blizzard's `common.ai`) is
strictly *more* suited to a non-melee map: `SuicideOnPoint` attacks raw
coordinates rather than a discovered base, and the wave loop is
`FormGroup(5,true)` → `SuicidePlayer/AttackMoveXYA` → wait-for-combat →
wait-for-death, with `allow_signal_abort and CommandsWaiting() != 0` as the
map-script interrupt at every single loop head.

---

## 5. DotA's AI line is a **hybrid too**, and it hides the fact

`DotA IMBA 3.83c AI` (wc3maps 361738, 23,226 editor saves) — the live
`AI Plus` lineage descended from the BuffMePlz/PBMN DotA AI.

`(listfile)` declares 37 members and does **not** list any `.ai`. But the
script contains

```jass
call StartMeleeAI(Player(i),"AIScripts\\AI_Plus.ai")
```

and hash-probing that exact name recovers a **9,310-byte
`AIScripts/AI_Plus.ai`** out of the archive [M]. (Standard gotcha-4 territory:
enumerate by probe, not by listfile.)

**Division of labour** [M]:

- `war3map.j` (4.06 MB, 4,549 functions, **922 order calls**) does hero
  movement, laning, creeping, ganking and buying — ordinary triggers.
- `AI_Plus.ai` does **nothing but item usage**, on a **0.1 s** loop:

```jass
function main takes nothing returns nothing
    call InitAI() ; call Sleep(.1)
    set p = Player(GetAiPlayer())
    ...
    call StartThread( function I1_II )   // per-hero item loop, Sleep(.1)
    call StartThread( function I1_1I )   // a 0.1 s clock:  II1 = II1 + .1
    call PlayGame()
endfunction
```

  For each living, non-illusion hero it runs a **1200-range
  `GroupEnumUnitsInRange`** and computes: ally count, ally-hero count, enemy
  count within 700, enemy-hero count within 700 and 600, and the lowest-HP
  enemy hero **whose current HP is below the AI's own Dagon damage**
  (`I111I = 800 + GetHeroInt(s,true)*3` for the top level, scaling down to
  `400 + Int*1`). Blink, BKB and Dagon each get a boolean flag from an
  explicit condition — e.g. escape is `(enemyHeroesWithin700 > 2 and
  allyHeroes < 1) or (HP% < 20) or (enemyHeroesWithin700 > 0 and HP% < 50 and
  allyHeroes < 1)`.
- It keeps its **own cooldown ledger** against that 0.1 s clock
  (`I_I[1] = II1 + 25`, `I_I[2] = II1 + IIIII` where `IIIII` is 24–40 by
  Dagon level) because the AI VM cannot read real cooldowns.
- It contains a genuine engineering hack: `II1I(unit, item, slot)` fills the
  hero's empty inventory slots with dummy items so a specific item lands in a
  specific slot, because `UnitUseItem` resolves by slot.
- Interop runs **both ways**: the map sends `CommandAI(Player(12), 'dead',
  GetHandleId(u))` and `CommandAI(Player(12), 'n00L', GetHandleId(s))`
  (fourcc command codes, unit handle ids as data) [M], and the `.ai` signals
  back through `SetPlayerTechMaxAllowed(Player(0), <fourcc>, n)` used as a
  shared register across the VM boundary.

**This is the strongest existing answer to "score targets on damage, not
lowest HP"** — it is a literal lethality test — and it is the only artifact in
the corpus running combat logic at **0.1 s**.

### 5.1 Does it cheat? Yes — and it also has a real competence dial

Cheats, all graded by `GetAIDifficulty` [M]:
`SetPlayerHandicapXPBJ(pl, +15/+40/+80)` (and `+80/+130/+…` in a second mode);
gold injections `+100/N`, `+300/N` at hero pick; a damage multiplier
`1.1× / 1.2× / 1.3×` applied only to `MAP_CONTROL_COMPUTER`; and a
per-tick life **and** mana regeneration of `0.5% / 1.0% / 1.5%` of max, with
a second helping while visible to the enemy.

**But it also gates whether reflexes fire at all**:

```jass
function Jw takes unit it returns boolean
    return ((GetAIDifficulty(GetOwningPlayer(it)) != AI_DIFFICULTY_NEWBIE)
            or (GetRandomInt(1,5) <= 2))
endfunction
```

and, in the creep/aggro enumerators,
`(GetAIDifficulty(...) != AI_DIFFICULTY_NEWBIE) or (GetRandomInt(1,10) <= 7)`.
That is a **reaction-probability dial** — 40% and 70% respectively at the
lowest difficulty — layered on top of the resource cheats. Item-purchase
thresholds and hero-level gates are also difficulty-conditioned. So the claim
"nobody has a competence dial; everybody has a resource dial" is too strong:
the DotA line has both, with competence implemented as *stochastic
inattention* (§9).

---

## 6. The territory/economy genre — the shape closest to Fall of Rome

### 6.1 Survival Chaos 4.3 (2,835 hosted/mo) and Reborn v1.58a (4,203/mo)

The closest live artifact to Fall of Rome: base capture, income ticks, lanes,
no hero-micro requirement. Its AI, read from `Scripts\war3map.j` (3.64 MB,
14,219 functions, obfuscated identifiers) [M]:

- **Four identical trigger sets, one per computer slot** — the same GUI logic
  copy-pasted and re-indexed (`I6Q[5]`…`I6Q[8]`). No shared AI module.
- **Production is a conditional ladder**: periodic routines issuing
  `IssueTrainOrderByIdBJ(I7Q[1..3], unitId)` behind nested affordability
  checks, choosing which of three buildings trains what.
- **Combat is reactive, event-driven, and building-local**: on "unit is
  attacked", `IssueTrainOrderByIdBJ(GetAttackedUnitBJ(), ...)` — *the attacked
  building trains reinforcements* — plus hardcoded hero casts at the attacker
  (`IssueImmediateOrderBJ(hero,"stomp")`,
  `IssueTargetOrderBJ(hero,"chainlightning",GetAttacker())`).
- **Zero movement orders to combat units.** Survival Chaos units auto-march.
- **Difficulty is gold per kill**: `AdjustPlayerStateBJ(8, I6Q[5],
  PLAYER_STATE_RESOURCE_GOLD)` on INSANE, less on NORMAL.

**Verdict**: the most genre-adjacent working computer player in the live canon
decides *what to buy and which spell to press when poked*, and never decides
where an army goes — because the map moves armies for it.

### 6.2 Castle Fight DE Beta 9.23 (1,472/mo) — the best-engineered build AI found

Frotty's Wurst rewrite; the compiled `war3map.lua` is 9.8 MB. Its AI is a
first-class module, `AiExecutor`, with a state machine and ~60 methods [M]:

```
AiExecutor_fsm, AiExecutor_nextDecision, AiExecutor_stateTarget, AiExecutor_stateTime,
AiDecision(building, inCage, useCageWallPattern), AiPriorityState, AiBuildablesState,
decideNextBuilding, getNextWantedBuilding, getNextWantedBlockReason,
isNextWantedAffordableNow, shouldKeepSavingForCurrentDecision, isSavingForStrategicItem,
hasStrategicAuraProductionFoundation, isBehindCastlePatternExhausted, nextPowerPlant,
applyRegularSpotOffset, nextRegularFallbackSpot, shouldUseCageWallPatternForNextWanted,
reservePendingBuildTarget, moveOrBlinkTo, initializeBuildMovement,
hasPendingBuildOrder, getPendingBuildOrderId, getPendingBuildOrderAge,
isPendingBuildOrderStale, isBuilderStillTryingPendingBuildOrder, clearPendingBuildOrder,
clearInactiveConstruction, onConstructOrUpgrade, onConstructionCancelled,
onTrackedStructureDeath, invalidateBuiltSnapshot, getBuiltSnapshot, isBuildLocked
```

Still: it moves **one builder** and issues **build** orders. It never moves a
combat unit. But two ideas are directly reusable regardless of genre:

- **Order acknowledgement instead of order repetition.**
  `getBuilderCurrentOrderId` + `getPendingBuildOrderAge` +
  `isPendingBuildOrderStale` + `isBuilderStillTryingPendingBuildOrder` means
  the AI knows whether its last order *took*, and only re-issues when it
  provably did not.
- **Saving as an explicit state.** `shouldKeepSavingForCurrentDecision` /
  `nextWantedIsOnlySavingGold` / `isSavingForPresetStrategicItem` make
  "deliberately doing nothing right now" a first-class, inspectable decision —
  the thing rome-ai's round-4 CONSOLIDATE deadlock needed a possibility gate
  to express.

### 6.3 Risk Europe 4.10 (428/mo) — the genre control

TypeScript→Lua. Territory control, income ticks, elimination. Its entire
relationship to a computer player [M]:

```lua
while i < bj_MAX_PLAYERS do
  if GetPlayerController(Player(i)) == MAP_CONTROL_COMPUTER then
    PauseCompAI(Player(i), true)
  end
```

plus a slot pool that files computer slots into `extraSlots` — territory
owners, not players. **It turns the engine AI off and does not replace it.**

### 6.4 The Footmen family — the "AI" that is not one

- **Footmen vs Grunts 7.2.3** (302/mo, 35,629 editor saves): `Trig_AI_passive_
  income_Actions` is `AdjustPlayerStateBJ(20, Player(10), GOLD)` +
  `AdjustPlayerStateBJ(5, Player(10), LUMBER)` for players 10 and 11, and
  `Trig_init_AI_Teams_Actions` is `ShareEverythingWithTeam(Player(10))` [M].
  The "AI" is a resource drip on a shared-control slot the humans steer. Zero
  engine AI natives; 129 order calls, none of them an AI's.
- **Footmen Frenzy Solo 1.6** (691–2,298/mo — a *live map whose entire premise
  is playing versus the computer*): `udg_AI_player[]`, `udg_AI_on`,
  `udg_timer_AI_hero_pick` and a `Hero_Skills` trigger that auto-learns
  skills. That is the whole AI [M]. The barracks auto-produce and the spawns
  auto-attack-move; the computer picks a hero and levels it.

This answers the "FvH is deterministic but generally decent" observation
directly: **it is decent because the map removed the decisions.** Nothing in
the Footmen family issues a movement order to a combat unit. The design
absorbed the AI problem instead of solving it — the same trick as Castle
Fight, Survival Chaos, Legion TD, Direct Strike (12,250/mo, 280 order calls,
zero AI natives) and Tower Survivors (10,221/mo, 110 order calls, zero AI
natives) [S].

**That is the single most important structural fact in the live canon: every
top-hosted map with a satisfying computer opponent got there by making unit
movement automatic, not by writing an AI.** Fall of Rome did not do that, and
that is exactly why rome-ai exists.

---

## 7. Fall of Rome 1.06 itself — what it ships (target 5)

Decomposed fresh from wc3maps 421339 (`Fall of Rome1.06.w3x`, 18.8 MB,
368 archive members, w3i format_version 31, 1,130 editor saves, 27 hosted in
the last month) [M]:

- **`.ai` members: none.** Hash-probed and enumerated.
- **`war3map.j`: 9,821 lines, 605 functions.** Grep for
  `StartMeleeAI|StartCampaignAI|CommandAI|PauseCompAI|GetAIDifficulty|
  MeleeStartingAI` → **zero hits**. No `Trig_*` function name matches
  `ai|comp|bot|auto`. There is no dormant AI scaffolding to build on.
- All twelve slots are set `SetPlayerController(Player(n), MAP_CONTROL_USER)`
  — confirming DESIGN.md §1.8 and the module's self-enable design.
- The map calls `MeleeStartingVisibility()` but **not** `MeleeStartingAI()`.
- **All twelve `DefineStartLocation` calls are present** — which matters,
  because `InitAI()` and AMAI's `main()` need
  `GetPlayerStartLocationLoc`. But they are stacked in a 1,280-unit-wide row
  (`x = 25344 … 26624`, all at `y = 6912`) on a 480×480 map, i.e. a
  formality. An engine captain would treat one corner as home for all twelve
  factions until `SetCaptainHome(BOTH_CAPTAINS, x, y)` overrides it — which
  is a one-call fix, but it must be made deliberately.
- The map's own script issues only 41 `IssuePointOrderLocBJ` + 2
  `IssueTargetOrderBJ` — it is not competing with an AI for unit control.

**So: nothing to build on, and nothing in the way.** The `.ai` route is open
on this map, and start locations, the one hard prerequisite, exist.

---

## 8. Ranked: what Fall of Rome should steal, tied to the five failures

Ordered by (expected effect) × (evidence that it worked somewhere) ÷ (cost).

### S1 — Attacks as blocking procedures with interrupt flags, not per-tick re-scoring
*Fixes: armies that stand still; armies that pile at chokepoints.*
Every working AI read here — AMAI, the WE template, Blizzard's campaign AI —
expresses an attack as `stage → issue one order → sleep until a terminal
state → done`, with interrupts as **flags set by other subsystems**
(`break_attack`, `town_threat_break`, `isfleeing`, `CommandsWaiting()`), never
as a competing score. rome-ai re-scores six goals every tick and relies on
incumbency (+0.12) and a 9 s dwell to stop them vibrating — that is a
hysteresis patch over a control-flow problem the corpus solves structurally.
Round 4's own verdict ("neither was wrong at any single tick; both were wrong
over time") is the symptom. **Concretely**: give each goal a *commitment
object* with a start state, a terminal predicate and an explicit interrupt
set; score only when no commitment is live or an interrupt fires.

### S2 — Staging with a deadline (`FormGroup` semantics)
*Fixes: armies that stand still; armies that pile at chokepoints.*
`FormGroup(seconds, testReady)` blocks until `CaptainIsFull() and
CaptainReadiness() >= 50` **and unconditionally releases after 60 s of
overrun**. Round 4's CONSOLIDATE deadlock — "a food-capped AI wanted an army
it could never build, and the urge to sit at home rose all game" — is the
textbook failure this timeout exists to prevent. The possibility gate we
shipped is the right idea; the corpus's version is stronger because it is a
*deadline*, so it also survives cases the gate does not predict. Cost: a
timestamp and one comparison per goal.

### S3 — Cluster-and-project army tracking, and a continuous threat field
*Fixes: factions that never leave their own cities; defence tunnel vision
(round-2 finding 2); no opponent modelling (honest gap 4).*
AMAI's `ARMY_TRACK` + `UpdateSpecificTownThreat` (§3.2) is a complete,
tuned, tested design we can reimplement in a day: cluster every player's units
at radius 1500, keep centroid + velocity + strength, project 3 ticks ahead,
and score every owned point by `Σ strength / dist^0.8` with a 600-unit floor,
a 3000-unit horizon, a 23°-heading override and a 0.3× ally credit. This
replaces "defence centres on wherever we were attacked" with a ranked field,
and it is the cheapest available form of opponent modelling: rome-ai already
scans the world; it just does not *cluster* or *differentiate* what it sees.
The heading override in particular is what makes an AI leave home — a distant
army that is not heading at you stops generating defensive pull.

### S4 — A stall detector that blacklists and reclassifies
*Fixes: armies that walk to walls they cannot break.*
AMAI: `|Δdistance| ≤ 300` for 10 consecutive ticks → `MarkBadExpansion(target)`
(persistent) **and** `AddWaterExpansion(target)` (reclassify as needing a
boat) **and** `break_attack`. rome-ai has a stall backstop that force-opens a
gate; it does not remember. Round 4 established that connectivity is not
usefulness — a blacklist derived from *observed* failure is exactly the
missing bridge between the coarse point graph and reality, and costs one
array. The engine gives the same signal free as `CaptainIsHome()` — "failed to
path and returned home".

### S5 — Order acknowledgement instead of order repetition
*Fixes: the order storm (round-2 finding 1); armies that stand still.*
Castle Fight DE keeps `pendingBuildOrderId` + `pendingBuildOrderAge` +
`isPendingBuildOrderStale` + `isBuilderStillTryingPendingBuildOrder` and
re-issues only when the order provably did not take. AMAI's equivalent is
`GetUnitCurrentOrder(u)` (88 call sites) used as a filter before ordering
anything. rome-ai's README concedes the order-economy numbers are a model, not
a measurement, and that the residual cost is probably in
`AI_ScanWorld`/`AI_RefreshPointMemory`. A per-unit `{lastOrder, lastOrderTime,
lastTarget}` triple plus "skip if `GetUnitCurrentOrder` already equals what I
want" is the standard fix and it also *reduces* scan pressure, because units
with a live order need no decision.

### S6 — Jittered, load-adaptive tick periods
*Fixes: order spam → unit-lag stutter (playtest finding 1).*
`period = base * LinearInterpolation(6, 18, 1.0, 2.0, aiCount) +
GetRandomReal(-0.2, 0.2)`. With up to 11 AI slots in Fall of Rome, this alone
halves peak per-frame work and — via the jitter — removes the frame-aligned
spikes that a fixed period guarantees. AMAI additionally staggers *initial*
start times per job (`Jobs.txt` min/max columns) so subsystems never phase-lock.
Cheapest item on this list; do it first.

### S7 — Hero policy from AMAI `MICRO_HERO` + DotA `AI_Plus`
*Fixes: heroes that overcommit.*
Two independent artifacts agree on the shape: a **1 s** (AMAI) or **0.1 s**
(DotA) loop that reads HP delta, counts enemy and ally *heroes* in two rings
(700 / 600 in DotA; `battle_radius` in AMAI), and fires a disengage on an
explicit boolean — DotA's is `(enemyHeroes>2 and allyHeroes<1) or HP%<20 or
(enemyHeroes>0 and HP%<50 and allyHeroes<1)`; AMAI adds **surround detection**
(enemy density > 5 *and* moved ≤ 225 units since last tick → teleport home),
which catches the case a pure HP threshold cannot. Round 4 anchored the hero
leash to the objective and the formation; the missing half is a *density and
displacement* test, which needs only the army tracker from S3.

### S8 — The lethality test for target selection
*Fixes: nothing on the current list — but it is the highest-value idea in the
corpus and nobody else has it.*
DotA `AI_Plus` picks its burst target by "is this hero's current HP below the
damage I am about to do", scaled by the actual item level and the hero's
Intelligence. Fall of Rome's capture verb is *"attack a settlement below 500
HP and it flips"* — which is the same predicate in a different costume:
"can this force get this settlement under 500 before the garrison kills it".
rome-ai's SIEGE readiness gate is a force ratio; a time-to-threshold estimate
is strictly better and is directly computable from the CV table we already
have.

### S9 — Evaluate, do not adopt: hosting the AI in an `.ai` script
*Fixes: potentially all five, at a cost we cannot currently measure.*
This is the big one and it needs an experiment, not a decision. **Proven**:
`.ai` scripts run on non-melee custom maps with custom tech trees
(Footmen Frenzy 9.0 AI, `isMeleeMap:false`, w3i v33); the VM has all of
`common.j`; `CommandAI`/`CommandsWaiting` is a working two-way channel a
shipped map uses in anger (DotA `AI_Plus`); and Fall of Rome has the one
prerequisite (start locations). **Unproven and cheap to test in ~30 minutes
in-game**: whether `CreateCaptains()` + `SetCaptainHome(BOTH_CAPTAINS,x,y)` +
`AttackMoveXY(x,y)` actually gather and move Fall of Rome's squads when there
are no halls, no mines and no workers, and whether `FormGroup`/
`CaptainIsFull`/`CaptainReadiness` return meaningful values with an
`AddAssault` composition list of the map's own custom unit ids.

If that experiment passes, the trade is: **hand over movement, staging,
retreat, arrival detection and unreachability detection to the engine; keep
our goal scorer, structure-value table, gate/corridor model and PRNG in the
map script; connect them with `CommandAI` fourcc messages.** That deletes a
large fraction of `for-ai.j` and it deletes the order storm outright, because
a captain-driven attack issues one order per objective instead of per unit per
tick. If it fails, the fallback is S1–S8, which are all engine-independent.

Two costs to price in honestly:
- **`RemoveGuardPosition` tax** — 61 call sites in AMAI is the measured cost
  of micro-ing units the captain also owns. The handoff protocol is
  `RemoveGuardPosition(u)` → order → `TQAddUnitJob(GetTimeToReachLoc(u,loc)+1,
  RESET_GUARD_POSITION, 0, u)`, where `GetTimeToReachLoc = distance /
  GetUnitMoveSpeed` (default 15 s if speed is 0).
- **`lib/sim` cannot host it at all** — the sim is Lua-only and has no `.ai`
  concept, so an `.ai`-hosted AI is 100% un-iterable in our harness. That is
  the same wall the JASS module already hits (the sim cannot execute
  Fall of Rome either), so it is not a *new* loss — but it does mean the
  eval-harness item stays first in the queue either way.

---

## 9. What nobody has solved

Re-tested against artifacts rather than inferred:

1. **No AI in the corpus decides where an army goes on a map with real
   geography.** Castle Fight, Survival Chaos, Legion TD, Direct Strike, Tower
   Survivors, Footmen — all delegate movement to auto-march. AMAI delegates it
   to the engine captain and admits the captain's failure modes. The DotA line
   moves heroes along three fixed lanes. **Nobody scores a destination.**
   Fall of Rome's six-goal scorer over a point registry with corridor routing
   is, as far as these artifacts show, genuinely without precedent.
2. **Nobody has a route/terrain model.** Zero artifacts contain a gate,
   chokepoint, bridge or corridor concept. AMAI's only geometric maneuver is
   a 400-unit backstep and its only terrain inference is "the walk failed, so
   call it water". Our gate-projection + measured-frontage work (round 4's
   bridge fix) has no competitor.
3. **Nobody plans against a deadline.** Every AI read is either steady-state
   (melee, Castle Fight) or wave-scheduled (campaign `SuicideOnPlayer(seconds,
   p)`). Fall of Rome's readiness-gated capital window (t=810→1440 × force
   ratio) is ours alone.
4. **Nobody models opponents as *players*.** AMAI gets closest — it clusters
   and projects *armies* and ranks *towns* — but it still never asks "which
   opponent is doing the work". Our honest gap 4 remains an open problem for
   the whole ecosystem, not just for us.
5. **Determinism is unheard of.** Every AI read uses `GetRandomInt` freely.
   Our single Park-Miller stream with randomness withheld from retreat,
   write-off and capital thresholds has no analogue.
6. **Competence dials barely exist.** DotA `AI_Plus` has one — stochastic
   inattention — and that is the entire state of the art. Nobody scales
   *reasoning depth*, look-ahead, or information quality.

Where we are reinventing something that already exists and works better:

- **Staging, arrival detection, unreachability detection, retreat, formation
  movement and group reform.** Six subsystems, all present in `common.ai`,
  all reimplemented by hand in `for-ai.j`. This is the bulk of S9's argument.
- **The army manager.** Honest gap 5 says "still missing: a general
  multi-group army manager". `Jobs/ARMY_TRACK.eai` is one, tuned, in 200 lines.
- **Tick scheduling.** Our sliced world scan and order-economy policy are a
  bespoke solution to a problem AMAI answers with a heap, a declarative job
  table, staggered starts and a load-adaptive multiplier with jitter.
- **The stall backstop.** AMAI's version is older, simpler and remembers.

---

## 10. Corrections to `wc3-ai-prior-art.md`

That file is inference-heavy where this one is artifact-heavy. Corrections, in
descending importance:

1. **§1's framing that the engine AI is effectively unusable on a custom map
   is wrong, and the unmeasured question it flags is now measured.** A shipped,
   non-melee, custom-techtree map (`isMeleeMap: false`, w3i v33) runs **eight**
   World-Editor-generated `.ai` scripts through `StartMeleeAI` against custom
   unit ids (Footmen Frenzy 9.0 AI, wc3maps 417656). A second map does the same
   (Footmen Frenzy 1000 AI 4.1). What remains unmeasured is narrower and
   testable: whether the *captain* gathers and moves units on a map with no
   halls, mines or workers.
2. **§1 omits the World Editor's AI Editor.** The template it generates —
   `InitAI → InitOptions → SelectHeroes → CreateCaptains → SetHeroLevels →
   StartThread(WorkerAssignment) → StartThread(AttackAssignment) → PlayGame`,
   with a four-priority target ladder and `FormGroup`+`AttackMoveKillA` — is
   the single most reused AI artifact in the ecosystem and is only ~60 lines of
   actual policy.
3. **§3's "DotA AI is dead" is right about the live canon and wrong about the
   lineage's design.** The `AI Plus` line survives (IMBA 3.83c AI, 23,226
   editor saves) and is a **hybrid**: a hidden `AIScripts\AI_Plus.ai` runs
   per-hero item logic at **0.1 s**, driven by `CommandAI` fourcc messages from
   the map script. Prior art's §5.1 claim that "everything measured decides at
   0.5–10 s" is false: this decides at 0.1 s, and prior art's §5.3 claim that
   nobody scores targets on damage is also false — `AI_Plus` runs an explicit
   lethality test against its own burst damage.
4. **§4.2 "100% of measured hard AIs achieve difficulty by cheating… nobody
   has a competence dial" needs splitting.** The cheating half is confirmed and
   extended (IMBA adds an XP handicap, a 1.1/1.2/1.3× damage multiplier and a
   0.5/1.0/1.5%-of-max per-tick HP *and* mana regen). The competence half is
   refuted: the same map gates reflexes behind `GetRandomInt(1,5) <= 2` (40%)
   and `GetRandomInt(1,10) <= 7` (70%) at NEWBIE.
5. **§2's flee threshold is off by 5 points.** `common.eai:277–278` reads
   `flee_health_percentage = 0.25`, `flee_minimum_health = 100` → flee below
   `max(25% max HP, 100)`, not 30%.
6. **§2 undersells AMAI.** It describes the micro jobs but not `ARMY_TRACK`
   (cluster + velocity + projection for every player) or the town threat field
   — which are the parts most relevant to a territory game.
7. **§3's Footmen vs Grunts finding is confirmed and sharpened.** FvG 7.2.3's
   "AI" is `+20 gold / +5 lumber` to Players 10–11 **plus
   `ShareEverythingWithTeam`** — the humans drive those units. And the live
   *solo-versus-computer* map in the family (Footmen Frenzy Solo 1.6,
   691–2,298 hosted/mo) adds only an auto hero pick and auto skill learn.
8. **§4.3 ("slot filling is free, slot playing is the unmet need") is
   confirmed by the modern survey and strengthened**: 2 of the 6 top-70 maps
   that touch an AI native use `PauseCompAI` to switch the engine AI **off**.
9. **A methodological note for the earlier survey**: its `.ai`-member counts
   were taken from listfiles. IMBA hides `AIScripts\AI_Plus.ai` from its
   listfile; only a hash probe finds it (gotcha 4). Any future AI census must
   probe, not enumerate.

---

## 11. Method and sources (all re-fetchable)

- **AMAI**: `git clone --depth 1 https://github.com/SMUnlimited/AMAI` —
  `common.eai`, `common_original.eai` (Blizzard's 2003 `common.ai`, which is
  where the campaign-AI library is readable), `Natives.j` (the 123-native AI
  VM API), `Jobs/*.eai` (50 jobs), `Jobs.txt`, `README.md`, `LICENSE`.
- **Corpus survey (historical)**: `archive.org/metadata/wc3_maps_2002` →
  5,359 `.w3m`; downloaded in batches of 60 at concurrency 12, each opened
  with `lib/mpq.js` (`listFiles` + `probeExtract` of `war3map.j` /
  `Scripts\war3map.j` / `war3map.lua`), grepped for the six AI natives, the
  ten order natives and `MAP_CONTROL_COMPUTER`, then deleted. 5,350 scanned.
  The 79 hits were re-downloaded and deep-scanned for the AI script-name
  argument, then hash-probed for `map.ai`.
- **Corpus survey (live canon)**: `wc3maps.com/api/search?query=<q>&count=<n>`
  — **the `count` parameter switches the result ordering to
  `group_hosted_month` descending**, which is the live-canon ranking; without
  it the API returns id-descending noise and caps at 24 with a `cursor` that
  does not page. Union of ~50 single-token queries → 400 distinct maps → top
  70 downloaded via `storagebox.wc3maps.com/maps/<id>/<urlencoded path>` with
  a browser UA, scanned, deleted.
- **Maps decomposed** (wc3maps ids): 421339 Fall of Rome 1.06; 417656 Footmen
  Frenzy 9.0 AI; 418844 Footmen Frenzy 1000 AI 4.1; 361738 DotA IMBA 3.83c AI;
  439087 Castle Fight DE Beta 9.23; 425564 Survival Chaos 4.3; 446040 Survival
  Chaos Reborn v1.58a; 436962 Risk Europe 4.10; 447001 Footmen vs Grunts 7.2.3;
  443410 Footmen Frenzy Solo 1.6; 446806 Direct Strike 6.4.23; 430170 Tower
  Survivors v1.90; 445732 DotA v6.89Q; 446974 Test of Balance v1.30; 445408
  Balanced Hero Survival v21.0c; 444436 Line Tower Wars Reforged 12.2a.
- **Dropped targets, with reasons**: **Legion TD** (446358 Team OZE, 31,634
  hosted/mo; 439776 v1.8 BETA) — neither archive opens under stormlib-node or
  smpq, so no script could be read; Legion TD is in any case an auto-march
  lane game whose "AI" is the wave schedule. **Castle Fight 8.3 Legendary AI**
  — already decomposed in prior art; superseded here by the live DE rewrite.
  **A pure DotA 6.83d AI build** — absent from wc3maps' ranked index; the
  IMBA `AI Plus` build is the same lineage and is unobfuscated at the `.ai`
  layer, which is where the interesting logic lives.

**Staleness**: the AMAI read is against `master` as of 2026-08-09; the two
surveys are snapshots (hosted counts move monthly, the 2002 corpus does not).
The structural claims — engine subsystem contents, the WE template shape, the
hybrid pattern, and "the live canon designs the AI problem away" — should age
well. **The one claim most worth re-testing is S9's premise**: that the
engine captain is usable on a workerless, hall-less, mine-less map. That is a
30-minute in-game experiment and nothing here substitutes for it.

---

## 12. CORRECTION (2026-08-09, playtest 7) — why nobody uses the engine AI

§1 measured that 82 of 5,350 archived maps reference any AI native and 0 of the
top 70 hosted maps drive one, and read that as evidence the subsystem is
unattractive on custom maps. **There is a simpler and much more actionable
explanation, now demonstrated on Fall of Rome:**

> `StartMeleeAI` attaches the AI VM to a **computer player**. A custom map that
> sets its slots to `MAP_CONTROL_USER` — which is what the World Editor
> produces for a non-melee map, and what Fall of Rome does for all twelve
> (`war3map.j` line 9409 onward) — has **no computer player to attach to**, so
> the `.ai` never loads and fails **silently**. The fix is one call:
> `SetPlayerController(Player(n), MAP_CONTROL_COMPUTER)` before `StartMeleeAI`.

**Measured, in game, on Fall of Rome 1.06** (S9 probe, `scripts/experimental/
rome-ai/probe.ai` + `probe.py`): with the slots left as the map sets them, the
`.ai` produced **no output at all** — not one line, before any AI call.
With `SetPlayerController(..., MAP_CONTROL_COMPUTER)` added and nothing else
changed, the same script **loaded, ran `InitAI`, returned from
`CreateCaptains`, and reached captain staging** — on a map with **no halls, no
gold mines and no workers**. Owner's words: *"Works with Computer slots."*

That answers §S9's unproven half affirmatively and narrows the mystery of the
82/5,350 figure. **Narrowed (research brief 2 / README correction 1).** The controller
*requirement* is **not** undocumented: the World Editor's own help says the
AI-start actions are for computer-controlled slots, and stock `Blizzard.j` gates
on exactly that. The defensible novel part is narrower — the **runtime
conversion of an already-configured user slot immediately before `Start*AI`**,
which is what makes the subsystem reachable on a map whose slots the author set
to user control. It is at least plausible that the reason the engine AI looks
"unusable on custom maps" is that custom maps are user-controlled by default and
the failure is silent, but the requirement itself was documented and we had not
read it.
The `"map.ai"` placeholder finding supports this reading: those 94 call sites
name a file that does not exist in any archive, i.e. nobody ever got far enough
to notice their AI was not running.

Two further runtime facts the probe established, both of the "declaration is
not availability" family:

* **`B2S` does not exist in the AI VM** — it lives in `Blizzard.j`, which the
  AI VM does not load. `pjass common.j common.ai` catches this at build time.
* **`I2S` is declared in `common.j` and accepted by pjass, but returns an
  EMPTY STRING at runtime in the AI VM.** Playtest 7 printed
  `"group size , readiness  at s"` — three blank numbers. The AI VM parses
  against `common.j` without implementing all of it. Any `.ai` needing to print
  a number must convert it itself or route it to the map script.

Also note for anyone reusing jassdoc's `common.ai`: that copy is the **2003
ROC-era file** (`$Id: common.ai,v 1.68 2003/05/12`), 123 natives, and it does
**not** contain `RemoveGuardPosition`. That native — and
`RemoveAllGuardPositions(player)`, which clears a whole faction in one call —
are in **`common.j`**, so guard positions are best cleared from the **map
script**, where they are gated against the real API.
