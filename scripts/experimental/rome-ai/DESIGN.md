# FoR-AI — a self-directed AI opponent for *The Fall of Rome 1.06*

Target build: wc3maps id **421339**, `Fall of Rome1.06.w3x`, by **ToaNoah**.
Any derivative work must credit ToaNoah.

---

## 1. What the game actually is (decomposition, with script evidence)

**Genre.** Not melee RTS. It is a **12-player, 30-minute, capture-the-territory
wargame with no workers and no base building in the normal sense.** All evidence
below is from the decompiled `war3map.j` (9821 lines, 605 functions) and the
object data.

### 1.1 Sides and topology
* `war3map.w3i` forces: **Rome** = P3 (Western Roman Empire), P9 (Eastern Roman
  Empire), P10 (Western Romans); **Barbarians** = P0 Huns, P1 Franks, P2 Saxons,
  P4 Visigoths, P5 Vandals, P6 Britons, P7 Persians, P8 Ostrogoths,
  P11 Burgundians. 3 v 9.
* 480x480 map, Mediterranean. Rome at `(-2112,-13376)` (Italy), Constantinople at
  `(16896,-8064)`. Barbarians ring the north; Vandals sit in the far south-west
  (Africa), Persians in the far east.

### 1.2 Victory — a hard deadline on two buildings
`Trig_Turn_Timer_Actions` starts `udg_Game_Timer` at **1800.00 s** (once).
`Trig_Rome_Wins` is registered on that timer expiring, and is the *only* entry
point to the endgame:

```
Rome wins  iff  owner(gg_unit_h000_0008) in {P3,P10}   -- Rome
            or  owner(gg_unit_h000_0092) in {P9,P10}   -- Constantinople
Barbarians win iff owner(Rome) != P3 and owner(Constantinople) != P9
```

Consequences that dominate every decision:
* The game **cannot end early**. Nothing before T=1800 is terminal.
* **Rome wins by default.** Barbarians must take *both* capitals and *still hold
  at least one of the two conditions broken* at the instant the timer fires.
* Therefore territory, gold and army are all purely *instrumental*. The only
  terminal quantity is capital ownership at T=1800.

### 1.3 Capture — the central verb
`Trig_All_Cities` and `Trig_CP_Attacked` register on `EVENT_PLAYER_UNIT_ATTACKED`:

```
if type in {h001 City, h009 Town, h000 Capital, h00J Shipyard,
            n00F CityPlot, n00E TownPlot, h002 BarbCamp, n008/n009 BuildPlot}
   (and separately n003 Control Point)
   and life < 500.00
then SetUnitOwner(target, owner(attacker)) ; SetUnitLifePercent(target, 100)
```

So settlements are **captured, never destroyed**: drop any of them below 500 HP
and it instantly flips to the attacker at full health. A Control Point has
1000 HP, so **500 damage flips a CP**. Capture is a *burst-damage race, not a
siege*, and a flipped point can be flipped straight back. This single fact
shapes the whole AI.

### 1.4 Economy
`Trig_CP_Gold` fires on `udg_Turn_Timer`, a **repeating 120 s** timer:

| source | per 120 s turn |
|---|---|
| each Control Point `n003` owned | +10 gold, +10 lumber |
| each Capital `h000` owned | +50 gold, +50 lumber |
| Player 7 (Persia) flat bonus | +50 gold, +50 lumber |

Start: **300 gold / 300 lumber** for everyone
(`Trig_Melee_Initialization_Func003A`), which also sets
`PLAYER_STATE_FOOD_CAP_CEILING = 100` and turns **bounty on**
(`SetPlayerFlagBJ(PLAYER_STATE_GIVES_BOUNTY, true)`), so kills are income.

There are **110 Control Points**. At start P9 holds 35, P3 27, P10 26 — the three
Romans hold 88 of 110. A barbarian holds **1–3**, i.e. 10–30 gold per turn against
Rome's 320–400. Extra secondary income: razing a captured city refunds
**250 g/250 l** (`Trig_Cities_Destroyed`, city `h001`) or **100 g/100 l** (town
`h009`) and leaves a rebuildable plot; `R008` ("Raze City", cost 0) is the
self-destruct research, and `Trig_Limit_Units` disables it for Romans.

### 1.5 Production — no workers, squads of 12, construction by upgrade
* **Nothing has a `ubui` build list.** Construction is entirely via the
  **`uupt` upgrade path**: `n00E TownPlot -> h009 Town (150/150)`,
  `n00F CityPlot -> h001 City (300/300)`, `n008/n009 BuildPlot -> Tower`.
  You select a plot you own and upgrade it. There are no peasants at all.
* **Every train order yields a squad of 12.** 40 triggers of the shape
  `Trig_Barb_Warrior_frank` fire on the trained unit type and
  `CreateNUnitsAtLoc(1, <same type>, ...)` inside a loop with
  `bj_forLoopAIndexEnd = 11`, then move all of them to the building rally point.
  War Elephant `n002` is the sole exception at 6.
* Trainers: Capital `h000` (37 types), City `h001` (38, incl. Elephant), Town
  `h009` (32), Barbarian Camp `h002` (32), Barracks `h01Z` (4), Shipyard `h00J`.
* Research: **Forge `h00W`** (`ures = R007,Rhan,Rhde,Rolf,Robf,Reib,Rhme,Rhar,
  Rhla,Rhra,Rhac`) — the real weapon/armour tech. **Alliance Center `h00N`**
  holds `R000..R006,R009`, the Rome-alliance techs.

### 1.6 The unit table that matters

| role | gold | food | HP | squad | notes |
|---|---|---|---|---|---|
| Warrior / Mercenary / Persian Sword | 50 | 1 | 600–800 | 12 | cheapest HP-per-gold; the CP flipper |
| Spearman | 75 | 1 | 700 | 12 | anti-cavalry |
| Berserker / Legionaire / Immortal | 100 | 1 | 800 | 12 | line infantry |
| Cavalry / Equite | 150 | 2 | 1000 | 12 | speed, raids; 24 food a squad |
| Skirmisher (ranged) | 50 | 1 | 300 | 12 | also the only way to arm a Tower |
| Hun Horsearcher | 100 | 0 | 500 | 12 | |
| Battering Ram | 50 g +100 l | 0 | 1000 | 12 | |
| Catapult | 200 g +100 l | 0 | — | 12 | |
| War Elephant | 200 | — | — | 6 | City-only |

With a **100 food cap** and 12-unit squads, a full army is ~8 infantry squads
(96 units) for about **415 gold**. Gold is therefore *not* the long-run
constraint once you hold points — **food is** — and the real question is always
*where the capped army goes*, not how big it gets.

Towers `o001/o005` (50 g + 100 l, 1500 HP) have **no attack of their own**; they
must be garrisoned with Skirmishers (`A003` cargo hold) to shoot.

### 1.7 Other levers
* **Veterancy.** `Trig_Kill_Count` fires on any unit death and raises the
  *killer's* level and its `A01L` "Combat Experience" rank. Preserved armies
  compound; trading evenly is a real loss.
* **Local Support `A021`** (Roman General only, 300 s cooldown, started at
  T=0): target an own City/Town/Capital, spawn **12 Local Militia**. An
  emergency defensive burst.
* **Heroes.** Every player starts with exactly one preplaced General (300 g,
  `Hpal` base) with a faction-unique signature ability; all carry `A01K`
  damage reduction and an item `I000`.
* **Alliances.** A barbarian may temporarily ally with a Roman power
  (`gg_trg_Start_Alliances` / `End_Alliance_*`), gaining Alliance-Center techs
  for the duration. Permanent barbarian alliance otherwise.
* **Gates** on the Roman walls can be opened/closed. Established from the
  artifact in round 2 (see §8.3): they are **units**, not destructables, in four
  orientations x three states, and the closed variant is the only one carrying a
  pathing texture — so an open or destroyed gate is literally a hole in the wall.

### 1.8 Existing AI — there is none
* No `.ai` files in the archive (366 members, all named).
* No `StartMeleeAI`, `StartCampaignAI`, `CommandAI`, or any AI native anywhere in
  `war3map.j`.
* `InitCustomPlayerSlots` sets **`MAP_CONTROL_USER` for all 12 slots**.

**An empty slot is an inert player** whose ~100 structures, CPs and capital are
free loot for whoever walks over. That is the baseline this AI has to beat, and
it is a low bar — but it also means there is no reference behaviour to imitate,
so everything below is derived from the mechanics.

---

## 2. Design goals and non-goals

**Goal.** A per-player module that assesses its own situation and *chooses*
among competing objectives, changing its mind when the world changes.

**Explicit non-goal.** A build order. There is no fixed opening in this design;
the first goal selected at T=0 is whatever the scoring functions return for the
start state, and a barbarian in trouble at T=200 will select the same goal a
barbarian in trouble at T=1400 would.

**Honesty constraints.**
* No omniscience. Enemy strength is counted only from units for which
  `IsUnitVisible(u, aiPlayer)` is true.
* No resource cheating by default.
* Deterministic: one seeded Park-Miller stream.

---

## 3. World model

### 3.1 What is tracked, and how often

Three clocks, deliberately different because the game has three:

| tier | period | contents |
|---|---|---|
| `AI_ScanWorld` | 4.0 s (difficulty-scaled) | own army CV, gold/lumber/food, own CP count, home threat, field army centroid and CV, visible enemy CV near the field army |
| `AI_Think` | same tick, after scan | goal scoring, goal selection, order dispatch, spending |
| `AI_Micro` | 1.0 s | capture focus-fire, retreat trip-wire, rally maintenance |

The 120 s turn is *not* a tick — the AI reads its own gold continuously and does
not need to know when the turn lands. (It can infer it; it does not need to.)

### 3.2 Static vs dynamic knowledge — the fog contract

**Static geography is known** (declared, not hidden): the positions of all 110
Control Points, both capitals, and every settlement, are enumerated once at init
by `GroupEnumUnitsInRect` over the playable map. This is the equivalent of a
human having played the map once and/or reading the minimap pings the map itself
provides; it is map layout, not live state.

**Dynamic state is fogged.** For every registered point `i` the AI keeps

```
cpKnownOwner[i]   last owner observed
cpLastSeen[i]     game time of that observation
cpKnownDef[i]     visible defender CV at that observation
```

refreshed **only** when `IsUnitVisible(cp[i], aiPlayer)`. Target scoring applies a
staleness discount (§4.3) so the AI prefers acting on fresh information and
treats old information as less reliable — which is what a player does.

Own units, own resources and own structures are read directly; that is not a
cheat, a player sees their own things.

### 3.3 Combat value (CV)

The single scalar the AI compares armies with:

```
CV(u) = goldCost(typeOf(u)) * (currentHP/maxHP) * (1 + 0.12*(level(u)-1))
```

Gold cost is a lookup over the ~40 combat types (§1.6); anything unrecognised
scores 50. HP fraction makes a half-dead army correctly worth less; the level
term prices in the veterancy mechanic of §1.7. Buildings are excluded.

---

## 4. Goals and scoring functions

Six candidate goals, scored every tick from the state vector, highest wins.
All helper terms are clamped to [0,1] by `AI_C01`.

Notation: `A` own army CV, `T` visible threat CV inside `AI_HOME_R` (2500) of any
owned structure, `G` gold, `L` lumber, `F` food used, `Fc` food cap,
`clock = min(1, elapsed/1800)`, `role in {ROLE_BARB, ROLE_ROME}`.

### 4.1 `GOAL_CONSOLIDATE` — stay home, buy army, do not commit
```
wantArmy    = 350 + 750*clock                 -- the bar rises through the game
sConsolidate = 0.78 * C01((wantArmy - A) / wantArmy)
             + 0.22 * C01(G / 900)
             + 0.15 * C01((Fc - F) / Fc) * C01(G / 400)
```
High when the army is below the bar for the current phase, or when gold is
piling up unspent. Falls away naturally as the army fills. Because `wantArmy`
grows with the clock, an army that was adequate at T=300 is inadequate at
T=1200 — the AI re-arms without being told to.

### 4.2 `GOAL_DEFEND` — protect owned territory
```
outmatched   = C01(T / (0.60*A + 150))
sDefend      = 0.92*outmatched + 0.35*C01(T/500) + 0.85*capitalThreatened
if writeOff: sDefend = sDefend * 0.18          -- multiplicative collapse
```
* `capitalThreatened` is 1 when a capital the AI owns has an enemy inside
  `AI_HOME_R`. For a Roman that is close to an absolute priority, correctly:
  losing it is the loss condition.
* `writeOff` is the **"do not defend a lost position"** term:
  ```
  writeOff = 1 when  T > 2.2*(A + garrisonCV)  and  not capitalThreatened
  ```
  i.e. when the incoming force is more than twice everything the AI has and the
  asset is not a capital, defence *collapses* and the army is kept. A CP is
  worth 10 gold a turn; an army is worth the rest of the game. The collapse is
  multiplicative because an additive penalty demonstrably was not enough — with
  `-0.55` the score was still 0.72 and DEFEND still won, which is exactly the
  case the term exists to prevent (§7).

### 4.3 `GOAL_EXPAND` — take the best reachable point
```
sExpand = 0.86 * bestTarget * C01(A / (260 + 240*clock)) * (1 - 0.45*clock)
```
Target score for each registered point `i` not owned by the AI or its allies:
```
value(i) = 1.00  Control Point        (+10/turn)
           1.65  Town                 (+10 food, trains, 100 g if razed)
           2.30  City                 (+25 food, trains, 250 g if razed)
           3.60  Capital
prox(i)  = 1 / (1 + dist(i, fieldCentroid)/4200)
weak(i)  = C01(1 - cpKnownDef[i] / (A + 60))
stale(i) = 1 - 0.35*C01((now - cpLastSeen[i]) / 240)
switch(i)= 1.0 if i is the current target else 0.86     -- anti-thrash, not a lock
target(i)= value*prox*weak*stale*switch * (1 + noise)
bestTarget = C01( max_i target(i) / 1.20 )
```
The normaliser is **1.20, not the capital value 3.60**. Dividing by the maximum
possible target value capped a plain Control Point at 0.28 and made EXPAND lose
to every other goal in every state — caught by the trace harness (§7), not by
inspection. 1.20 makes a nearby undefended point score near 1.0 and a town or
city saturate, which is the intent.
The `(1 - 0.45*clock)` factor is deliberate: grabbing a fifth Control Point at
T=1500 is nearly worthless because there are only two turns of income left.

### 4.4 `GOAL_SIEGE` — commit to a capital
Role-dependent, and this is where the deadline enters.

**Barbarian:**
```
sSiege = C01(A / 900) * (0.30 + 0.95*clock) * (1 - 0.40*C01(capDef/(A+100)))
       * capitalsStillRoman
```
The `(0.30 + 0.95*clock)` term is the whole point. Early, siege is dominated by
expansion and consolidation; as the clock runs out it grows without bound
relative to everything else, so a barbarian AI that has been farming points
**will abandon farming and march on a capital**, and the switch happens at a
time that depends on how strong it is — a weak AI commits later because the
`C01(A/900)` factor holds it back, and may never commit, which is correct.

**Roman:**
```
sSiege = 1.45 * ownCapitalLost        -- retake, near-absolute
```
Because losing both capitals is the loss condition and a capital is recapturable
by the same attack-below-500 rule, retaking is nearly always right for Rome.

### 4.5 `GOAL_TECH` — bank surplus into the Forge
```
sTech = 0.58 * C01(G/700) * C01(L/700) * (1 - 0.5*clock) * hasForge * techLeft
```
Requires *both* currencies (units cost gold, upgrades cost 250 g + 250 l), so
tech only competes at genuine surplus and never starves army production. Decays
with the clock: an armour upgrade finishing at T=1750 buys nothing.

### 4.6 `GOAL_RETREAT` — disengage a losing fight
```
losing   = C01((fieldEnemyCV - 1.15*fieldCV) / max(200, fieldCV))
bleeding = C01(1 - 1.6*fieldHPfrac)
sRetreat = (0.95*losing + 0.50*bleeding) * committed
```
`committed` is 1 only when the field army is away from home, so retreat cannot
be selected by an idle army.

### 4.7 Selection, hysteresis, preemption
```
score(current) += 0.12                       -- incumbency
if now - goalSince < AI_DWELL (9 s)          -- minimum dwell
     and goal not in {DEFEND, RETREAT}: keep current
select argmax
```
`GOAL_DEFEND` and `GOAL_RETREAT` are **preemptive**: they bypass dwell. Everything
else is sticky. This is what stops a 4-second tick from producing an AI that
vibrates between two nearly-equal goals, while still letting it react to an
attack within one tick.

### 4.8 The hard case: attacked while committed elsewhere
Not solved by a reflex recall. The army is split:

```
garrisonWant = C01(T / 400) * 0.55 * A        -- how much to keep home
```
The field army only *recalls* when
`T > 1.30 * garrisonCV` **and** `assetValueAtRisk > currentObjectiveValue`.
Otherwise it presses on and the garrison fights alone. That is a real decision
with a real trade-off, and it is why `GOAL_DEFEND` scoring includes the
`writeOff` term — sometimes the right answer is to let the CP go and keep
hitting the capital.

---

## 5. Execution layer

| goal | what it issues |
|---|---|
| CONSOLIDATE | rally at home; spend on army mix (§5.1); upgrade owned plots to Town/City if affordable |
| EXPAND | field army attack-move to `bestTarget`; on arrival, micro focus (§5.2) |
| DEFEND | field army (if recalled) + garrison attack-move to the threat centroid; Roman General casts `A021` Local Support if a City/Town/Capital is inside the threat radius and the ability is ready |
| SIEGE | field army attack-move to the target capital; buy 1–2 Ram squads if `L >= 200` |
| TECH | issue the next unresearched Forge upgrade at an owned Forge |
| RETREAT | field army move (not attack) to home; hold until CONSOLIDATE re-selects |

### 5.1 Composition policy
Spending is a policy of the active goal, not a separate goal. Target mix by CV:

```
cheap melee 45%   (Warrior 50 g — the CP flipper, best HP/gold)
heavy melee 20%   (Berserker/Legionaire 100 g)
ranged      15%   (Skirmisher 50 g — also arms Towers)
cavalry     12%   (150 g, 2 food — raids and reinforcement speed)
siege        8%   (Ram; only while SIEGE or when target is a walled city)
```
The AI buys whichever role is furthest below its share, subject to gold and to
`food + 12 <= foodCap`. Faction unit IDs are resolved per player from a table
(§1.6); an order for a type the player cannot train fails harmlessly.

### 5.2 Micro (1 s)
* **Capture focus.** When a field unit is within 900 of the current target
  settlement, issue `attack` **on the settlement itself**. Since the flip
  happens at `<500 HP` and instantly restores to full, overkill is wasted:
  once the target has flipped (owner == me) the micro immediately retargets the
  next point. This is worth more than any other micro in this game.
* **Retreat trip-wire.** Independent of the goal tick, any field unit below 22%
  HP is issued a move order home. Cheap, and preserves veterancy.

### 5.3 Difficulty — honest knobs only
| knob | Easy | Normal | Hard |
|---|---|---|---|
| think period | 8.0 s | 4.0 s | 2.0 s |
| score noise (± ) | 0.25 | 0.10 | 0.03 |
| capture focus micro | off | on | on |
| retreat trip-wire | off | on | on |

All three are *reaction latency and decision quality*. No resource handicap is
applied by default. A multiplier hook `AI_HANDICAP[p]` exists and is documented
as **a cheat**, default 1.0 (off) — it is honest in the sense that it scales
income visibly rather than granting free vision or free units.

### 5.4 Determinism
One global Park-Miller stream, `AI_Rand()`, implemented with **Schrage's
algorithm** so every intermediate stays below 2^31 and the sequence is identical
on 32-bit and 64-bit integer widths (gotcha 29):

```
seed = 16807*(seed mod 127773) - 2836*(seed / 127773)
if seed < 0 then seed = seed + 2147483647
```
Seeded from `AI_SEED` (default 20260809). Randomness is spent **only** on
* score noise (`AI_NOISE`), and
* tie-breaking between near-equal expansion targets and composition rolls.

It is deliberately **not** used in the retreat, write-off or capital-threat
thresholds: those must be crisp and reproducible. Unpredictability is spent
where an opponent could otherwise learn a fixed target order and pre-position
against it; it is withheld where randomness would only make the AI erratic.

---

## 6. What this design does not do

Stated up front so §7 of the report is not a surprise. **Round 2 struck four
items off this list; the strikethroughs are kept deliberately so the record
shows what changed and why.**

* ~~No pathing awareness — it issues attack-move and trusts the engine.~~
  Round 2 added approach routing over the gate registry (§8.3). Passes and
  open terrain are still unmodelled; only wall crossings are.
* ~~**No naval play.** ... For Vandals (an island/Africa start) this is close
  to disqualifying.~~ **This was wrong, and it was wrong in the expensive
  direction.** It was a headless inference from "Mediterranean map, 63
  shipyards" and nobody checked it. Round 2 flood-filled the actual pathing
  map: the Vandals reach both capitals **on foot**. See §8.6 for the numbers
  and for what is really true about naval.
* ~~No gate control~~ (round 2, §8.3); no tower garrisoning with Skirmishers,
  no alliance diplomacy, ~~no razing-for-gold~~ (round 2, §8.5), no
  Elephant/Catapult tech choices.
* No opponent modelling: it scores targets, not enemies-as-agents.
* No coordination between two AI players on the same team.

---

## 7. Verification record

The map is **JASS**, so `lib/sim` cannot execute it — the sim is a Lua harness
and there is no JASS interpreter in this toolkit. Nothing here claims to have
run the AI. What was actually done:

| check | tool | result |
|---|---|---|
| full-mode JASS type/signature check, module injected | `pjass` + real `common.j`/`Blizzard.j` | **Parse successful, 11145 lines** (baseline map also clean, so any introduced error is visible — the noisy case gotcha 34 warns about does not apply) |
| gotcha-34 apostrophe lint, JASS-aware tokenizer | `lint_apostrophe.py` | baseline 0, candidate 0, **no literal introduced** |
| the same lint, **negative control** | `lint_apostrophe.py --selftest` | **probe fires** on a planted `don't` — the detector is live, not vacuous |
| structural validation of the packed map | `tools/validate-map.js` | **191/192, 152 warnings — byte-for-byte the same as the unmodified map** (the single FAIL is a pre-existing mdx-m3-viewer parse of `war3map.wct`, a member we pass through unchanged) |
| goal selection over 10 hand-built world states | `trace.py` | **10/10** |
| behaviour change under a pure clock sweep | `trace.py` | **EXPAND -> SIEGE crossover between t=300 and t=600** |
| PRNG width-portability | `trace.py` | 200000 states identical to a 64-bit modmul; largest intermediate 2147464004 < 2^31 |

`trace.py` interprets a restricted JASS subset **read from the shipped
`ai/for-ai.j`**, not from a transcription, so the trace cannot drift from the
code. It found two real design errors that inspection had missed — the EXPAND
normaliser and the additive `writeOff` — both documented inline above.

**What none of this shows.** No pathing, no collision, no combat resolution, no
engine. Every result above is about what the AI *decides*, never about whether
it *wins*.

### 7.1 Round 2 verification (2026-08-09)

Same tools, re-run against the changed module; the new rows are the ones that
did not exist in round 1.

| check | tool | result |
|---|---|---|
| full-mode JASS type/signature check, module injected | `pjass` + real `common.j`/`Blizzard.j` | **Parse successful, 11803 lines**; the unmodified map is also clean (9822 lines), so nothing hides in existing noise |
| gotcha-34 apostrophe delta lint | `lint_apostrophe.py` | baseline 0, candidate 0, **none introduced** |
| the same lint, negative control | `--selftest` | **probe fires** on a planted `don't` |
| structural validation of the packed map | `tools/validate-map.js` | **191/192, 152 warnings — byte-identical output to the unmodified map** |
| goal selection over hand-built world states | `trace.py` | **13/13** (10 round-1 scenarios unchanged + 3 new defence cases) |
| behaviour change under a pure clock sweep | `trace.py` | EXPAND -> SIEGE crossover still between t=300 and t=600 |
| **order economy: source guards** | `trace.py` | **11/11** — every movement order provably routed through `AI_TryOrder` in the shipped source |
| **order economy: issuance model** | `trace.py` | peak/tick **1705 -> 204** (8.4x), mean/s **880 -> 55** (15.9x) |
| **structure value ordering** | `trace.py` | **8/8** — shipyard loses to a control point at 4x the range; raze premium role-gated |
| **approach routing / gate choice** | `trace.py` | **8/8** — holes beat intact gates, damaged beats intact, silly detours rejected |
| **defence damping** | `trace.py` | **7/7** — recall predicate and response-budget cap |
| **land connectivity (naval question)** | `war3map.wpm` flood fill, 3 variants | only **P6 Britons** is cut off; the round-1 Vandals claim is **refuted** |
| PRNG width-portability | `trace.py` | 200000 states identical to 64-bit modmul; max intermediate 2147464004 < 2^31 |

**Still not shown, and it matters:** none of the above runs the decision loop in
the engine. Round 2 fixed what a playtest reported; only a playtest can say
whether it fixed it.

---

## 8. Round 2 — the first real playtest (2026-08-09)

The round-1 module had never been run. It was then run, and the owner reported
five things. Every one of them is a fact about the game that the headless
program could not have produced on its own, so this section is written as
*finding -> what the artifact says -> what changed*, and it is the honest
record of which round-1 claims were wrong.

Verbatim findings:

1. "The Roman players stutter from unit lag and trying to move everything at once"
2. "Barbarians center on where they're being attacked"
3. "serious pathing issues (if you open one door they just get routed around to
   the worse route or if there's a pre-existing hole in the gate, instead of
   sieging that gate, allowing you to choke them easily)"
4. "AI doesn't know how to use gates overall"
5. "shipyards are worth nearly nothing because naval warfare is worthless in
   this specific map, but they go for shipyards instead of control points and
   razing and burning buildings"

and a follow-up question: "can we figure out naval logic so the island-people
can fight / figure shit out?"

### 8.1 Finding 1 — the order storm (the top priority, and a real bug)

**Diagnosis, from the round-1 code rather than from the symptom.** Three
independent multipliers, all of which had to be fixed:

* **No dedup.** `AI_SendArmy` enumerated *every* unit of the player and called
  `IssuePointOrder` on each one, unconditionally, on every think tick — whether
  or not that unit already carried exactly that order. `AI_MicroEnum` did the
  same every **1.0 s** for every unit within `AI_TOUCH_R` of the objective and
  for every unit below 22% HP. Re-issuing an order a unit already has is not
  free: it restarts the unit's pathing and its attack, which is precisely the
  "stutter" that was reported.
* **No slice.** Nothing bounded the number of orders one player could issue in
  one tick. At the 100 food cap with 1-food squad units that is ~100 orders per
  player per think and ~55 per player per second from micro.
* **Everyone in lockstep.** `AI_EnablePlayer` set `ai_nextThink[pid] = 0.0` for
  every player, and the period is the same for all of them, so all eleven AI
  slots scanned, scored and issued on the *same* 1 s tick, forever.

**Fix.** A single choke point, `AI_TryOrder`, is now the only place in the
module that issues a movement order (`trace.py` asserts this against the source:
"every movement order goes through AI_TryOrder"). It keeps a per-unit record in
a hashtable — order kind, destination, target handle, issue time — and refuses
to re-issue when the unit already has that order and is not idle, with a
20 s safety refresh. Every dispatch arms a budget first (`AI_ORDER_SLICE` = 24
per player per think, `AI_MICRO_SLICE` = 12 per player per micro tick), and
`ai_nextThink` is seeded with `ModuloInteger(pid, period)` so the players spread
across the sub-ticks. `AI_SCAN_SLICE` also drops 40 -> 12, because each visible
point in a slice costs a `GroupEnumUnitsInRange`.

**Measured** (`trace.py --> ORDER ECONOMY`; 11 AI players x 100 units, 600 s,
objective changing every 60 s, 55% of the army in contact):

| policy | peak orders in one tick | mean orders/second |
|---|---|---|
| round 1 (no dedup, in lockstep) | **1705** | **880.0** |
| round 2 (dedup + slice + phase) | **204** | **55.3** |
| reduction | 8.4x | 15.9x |

That table is a **model of the issuance policy**, not an execution of the map:
it replays the dispatch rules one entry per unit and counts calls, with the
tuning constants read out of the shipped `for-ai.j`. It is joined to reality by
eleven source assertions that fail if the module stops containing the guards
being modelled. Nobody has measured the game's frame time; this measures order
count, which is the thing the code controls.

Two more changes cut real work rather than just orders: `AI_BestTarget` is
computed once per think and cached in `ai_bestT` (round 1 ran the whole
registry scan twice, once in `AI_ScoreExpand` and again in `AI_Execute`), and
`AI_SendArmy` now holds a garrison back instead of ordering literally every unit
at the objective — the `garrisonWant` formula §4.8 always described and the code
never implemented.

### 8.2 Finding 2 — defence tunnel vision

Two round-1 terms *claimed* to prevent this and neither worked:

* **The write-off compared the threat against `A + garrisonCV`.** The garrison
  is a **subset** of the army, so the bar was inflated by roughly the garrison
  again — with a typical half-at-home army the effective threshold was ~3.3x the
  army rather than the intended 2.2x, and the AI defended positions it could not
  hold. It now reads `T > AI_WRITEOFF * A` with `AI_WRITEOFF = 1.60` against the
  whole army, which is a ratio that means what it says.
* **The recall test could essentially never fire.** `vAsset` was hard-coded to
  1.0 unless a capital was involved and `vObjective` defaulted to 1.0, so
  `vAsset > vObjective` was false for every barbarian case. The AI therefore
  selected DEFEND and then issued *no orders at all*, and the army sat.

`wm_asset` now carries the value of the best **owned** point within
`AI_HOME_R` of the threat centroid, computed in the scan. DEFEND is multiplied
by `assetF = 0.35 + 0.65 * C01(asset / AI_VAL_CP)`, so an enemy army merely
walking past nothing of ours cannot read as an emergency. `AI_ShouldRecall` and
`AI_RespondBudget` are separate functions so `trace.py` can assert them
directly; the budget caps the response at `AI_DEF_MAX_FRAC` = 0.60 of the army
and at `1.35 x threat - garrison`, so a raid can never swallow the whole force.

### 8.3 Findings 3 and 4 — gates, established from the artifact

**Gates are units, not destructables.** Four orientations, three unit types
each, and the map toggles between them by `ReplaceUnit`:

| orientation | closed | open | destroyed | open ability | close ability |
|---|---|---|---|---|---|
| horizontal | `h01N` | `h01P` | `h01O` | `A01O` | `A00Z` |
| diagonal 1 | `h01Q` | `h01S` | `h01R` | `A01Q` | `A01P` |
| diagonal 2 | `h01T` | `h01V` | `h01U` | `A01R` | `A01S` |
| vertical   | `h01W` | `h01X` | `h01Y` | `A01T` | `A01U` |

The decisive fact is in the object data, not the script: **only the closed
variant has a `upat` pathing texture** (`PathTextures\Gate1Path.tga`,
`Gate2Path.tga`, `Pathing Diagonal Wall 2.1.tga`, `Pathing _2x16.tga`). The
open and destroyed variants have `upat` = empty. So an open gate and a
destroyed gate are the *same thing to pathing*: a hole. All gates carry 2000 HP
and are **not** in the capture list — a gate is destroyed, never captured. The
eight toggle abilities are all built on the same summon base with a 20 s
cooldown (`acdn`), and the map applies the cooldown to the sibling ability after
each toggle.

66 gates are placed, all **closed** at map start: P3 22, P9 23, P10 18, P7 2,
P5 1. Barbarians own essentially none, which is the whole point — they are
Roman walls.

**Use (a): route through an opening.** `AI_ChooseApproach` scores every gate
within `AI_GATE_NEAR` (4200) of the objective by
`dist(field,gate) + dist(gate,objective)`, plus a break penalty of
`AI_GATE_BREAK (6000) x remaining life fraction` for an intact enemy gate and a
token `AI_GATE_OWN` (400) for one of ours. An open or destroyed gate carries no
penalty at all, so a hole beats an intact gate up to 6000 map units further
away, and a gate already beaten down to 20% beats an intact one 4800 further
away. A crossing whose detour exceeds `AI_GATE_DETOUR` (1.60x) of the direct
distance is rejected, which also handles the case where the army is already
inside the wall.

**Use (b): siege the right gate, explicitly.** When the chosen crossing is a
shut enemy gate, the army is no longer given an attack-move at the distant
objective (which is what let the engine reroute it onto a worse approach). It is
given the gate: units within `AI_SIEGE_R` attack the gate *unit*, the rest
attack-move to the gate's position.

**Use (c): our own gates.** `AI_ManageGates` opens an owned gate that is the
chosen crossing when the crossing is clear or when our own combat value there
exceeds the visible enemy's, and shuts an owned open gate that has visible
enemies and none of our field units in it. One toggle per player per tick, with
the map's own 20 s cooldown imposed on ourselves.

**Honest note on the mechanism.** `AI_SetGate` performs the state change with
`ReplaceUnitBJ`, exactly as the map's own `Trig_Open_*` / `Trig_Close_*`
actions do, rather than by ordering the ability. The abilities are custom and
their order string cannot be verified headlessly, and guessing wrong would
silently do nothing. This is a deliberate, labelled equivalence, restricted to
gates the AI **owns** and rate-limited to the map's own cooldown; it is not a
capability a human player lacks. It is recorded here next to `AI_HANDICAP`
because that is the standard this module holds itself to.

### 8.4 Finding 5 — the structure value model

The round-1 module had no value model beyond four numbers buried in
`AI_PointValue`, and it did not register shipyards at all — so it never
*selected* one. The behaviour the owner saw is best explained by what it did
instead: one long attack-move at a distant objective drags an army along the
coast, where it auto-acquires 1000-HP shipyards, and attacking a shipyard below
500 HP **captures** it (`h00J` is in `Trig_All_Cities`). The army looks like it
went for the shipyard because, functionally, it did.

There is now a single named table at the top of the module, `AI_VAL_*`, with
the map evidence for each number written beside it, and both EXPAND and SIEGE
route through `AI_PointValueFor`. The registry was widened to include shipyards
and plots precisely so they can be scored at ~0 rather than being invisible.

| kind | value | why, from the artifact |
|---|---|---|
| Capital `h000` | 4.00 | the victory test at T=1800; +50 g/+50 l per turn |
| Control Point `n003` | 1.00 | +10 g/+10 l per turn, 110 of them: the currency |
| City `h001` | 0.65 (+0.60 raze) | no income; trains 38 types; +250 g/+250 l razed |
| Barb Camp `h002` | 0.75 | no income; trains 32 types; 5000 HP |
| Town `h009` | 0.45 (+0.25 raze) | no income; trains 32 types; +100 g/+100 l razed |
| Plot `n00E/n00F/n008/n009` | 0.25 | capturable, upgradeable, pays nothing yet |
| **Shipyard `h00J`** | **0.02** | naval does not decide this map (playtest) |

`trace.py` now asserts the ordering behaviourally rather than by inspection: a
shipyard 500 away loses to a control point 8000 away (0.015 vs 0.296), a
shipyard at 2000 loses to a razeable city at 4000 (0.012 vs 0.551), a plot loses
to a further control point, and the raze premium is role-gated (barbarian city
1.25, Roman city 0.65).

### 8.5 Razing, also finding 5

`R008` "Raze City" costs 0 and sits in the `ures` list of **City `h001` and
Town `h009` only**. `Trig_Raze_City_tech` kills the researching building;
`Trig_Cities_Destroyed` then pays the owner **250 g + 250 l** for a city or
**100 g + 100 l** for a town and leaves a rebuildable plot. `Trig_Limit_Units`
bars it for P3, P9 and P7, which `wm_canRaze` reads off
`GetPlayerTechMaxAllowed` rather than assuming.

Since captured cities and towns produce **no income at all** in this map — only
control points and capitals do — a settlement the AI cannot hold is worth more
burnt than kept, and 250 gold is five squads of twelve warriors. `AI_TryRaze`
therefore burns the owned settlement furthest from home beyond `AI_RAZE_DIST`
(4200), never dropping below `AI_RAZE_KEEP` (3) production sites, one per think.

### 8.6 Naval — what is actually true

The round-1 honest-gap list called the absence of naval logic "near
disqualifying" and named the Vandals. **That was a headless inference and it is
false.** The check that should have been run in round 1 was run now: parse
`war3map.wpm` (1920x1920 cells, 32 units each), take walkable as
`(flag & 0x02) == 0`, and flood-fill.

| fill | components | mainland cells | factions cut off from both capitals |
|---|---|---|---|
| 4-connected | 216 | 1,514,116 | **P6 Britons only** |
| 8-connected | 99 | 1,516,836 | **P6 Britons only** |
| 8-connected, 2x2 block (unit collision) | 216 | 1,451,108 | **P6 Britons only** |

Under all three, **the Vandals walk to Rome and to Constantinople**, as do
Persia and every other barbarian. Exactly one of twelve slots is water-locked.

What is on that island: P6 Britons hold 1 Barbarian Camp and 1 Control Point;
P10 Western Romans hold 2 Cities, 4 Towns, 5 Control Points and 5 Shipyards
there. 6 of the map's 110 control points are in Britain, 94 on the mainland.

So the Britons are not inert without ships — they have **eleven enemy holdings
on their own island**, which is a richer local game than any other barbarian
starts with (the rest hold 1-3 control points each), and the existing EXPAND
scorer already goes after all of it.

Transport exists and is cheap. Shipyard `h00J` trains `h026`, `h00R`, `h00Q`,
`h00S`, all on the `hdes` base. `h00R` (50 g + 50 l, 4 food) carries **6**
(`S001`, field `Car1` = 6); `h026` (25 g) and `h00Q` (100 g) carry the base
default; all three have `S002` load and `S003` unload; `h00S` is artillery with
no cargo hold. No scripted transport triggers exist, so the standard
load/unload order semantics apply. The map's own loading screen says "Load units
in ships to attack by the sea", so the author intended it.

**Decision: staged, not built.** The five playtest findings are the round, and
order spam was the priority; naval transport would serve **one slot in twelve**
and touches the one area — issuing orders to move units around — that this
round exists to make quieter. Shipping it half-tested would put the five at
risk for a marginal gain.

The clean starting point for the next round, in the order it should be built:

1. **Do not build naval combat.** No warships, no sea control. Shipyards stay
   at `AI_VAL_SHIPYARD` as *targets*.
2. **The prerequisite is a conflict, and it is deliberate.** A Britons AI
   needs a shipyard to build a transport, and the value model correctly rates a
   shipyard at 0.02. Raising it globally would recreate exactly the bug finding
   5 reports. The fix belongs in one place: a *conditional* term that lifts
   shipyard value only for a player whose reachable component holds no further
   worthwhile objective. P6 is the only such player and the flood fill above is
   the proof, so it can be a named constant with the evidence beside it rather
   than a runtime connectivity graph.
3. **Then a five-state machine, not a subsystem**: acquire transport -> gather
   at an embark point -> load -> cross -> unload at a landing point near the
   objective -> hand straight back to `AI_MoveOnTarget`. The crossing is
   *uncontested* (nobody fights at sea in this map), so there is no escort, no
   interception and no naval engagement model — it is pure logistics.
4. **Order economy applies**: `load` and `unload` must go through
   `AI_TryOrder` like everything else, or this round is undone.

### 8.7 Player-facing text (gotcha 17)

The owner now holds both ToaNoah's original and this build, so they must be
distinguishable in the map list, and a player loading it must be told the AI
exists. Every player-facing string in this map is a TRIGSTR reference into
`war3map.wts`, so all of it lives in one file and `describe.js` applies the
overlay:

| TRIGSTR | field | value in the AI build |
|---|---|---|
| 001 | w3i map name | `The Fall of Rome 1.06 + AI` |
| 003 | w3i description | original text, then the AI notice + credit |
| 004 | w3i author | `ToaNoah`, unchanged |
| 736 | loading title | `Fall of Rome 1.06 + AI` |
| 737 | loading subtitle | `By ToaNoah - AI computer players added` |
| 738 | loading body | original hints, plus one AI hint line |

The appended description line is:

> AI BUILD - all empty slots, and any slot set to Computer, are played by an
> AI. Type -aieasy, -ainormal or -aihard to set the level. Original map by
> ToaNoah.

**The archive is a bare MPQ with no HM3W pre-header** (it starts `MPQ\x1a`,
like ToaNoah's original), so the w3i name is the only name and the picker
renders it; there is no second copy to keep in sync. If a pre-header is ever
added, `_header.json` must carry the same string.

Three constraints the overlay respects, each of which is a gotcha:

* **Nothing is replaced.** The author's own description, his Discord link and
  all his loading-screen hints are kept; the AI text is appended. `describe.js`
  refuses to run if the strings it is about to overlay are not the ones it
  expects, so it cannot quietly mangle a different build of the map.
* **The wts byte dialect survives** (gotcha 35). The edit goes through
  `lib/wts.js`, and the script prints the dialect before and after: BOM true,
  CRLF, blank separator, 0 bare LF, 1257 entries in and 1257 out, exactly 5
  changed. That check is the one that catches the class of silent load-time
  breakage a naive text patch causes.
* **The authored English is ASCII and apostrophe-free** (gotcha 34 as a
  cost-free precaution); the script refuses to write if either slips in.
