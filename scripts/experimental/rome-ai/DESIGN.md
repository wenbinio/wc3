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

---

## 9. Round 3 diagnosis (2026-08-09) — established, NOT yet implemented

A second playtest produced seven findings. This section is the **verified
artifact groundwork** for all of them. **No round-3 code shipped**: the working
environment (repo checkout, toolchain, map, JASS API) was destroyed mid-session
and the budget that would have gone to implementation went to recovering it.
Round 2 remains the shipped behaviour. Everything below is checked against the
map, not inferred, so the next session can implement without re-deriving it.

### 9.1 THE BLOCKER — why Romans cannot leave their own gates (finding 4)

**It is not the toggle.** `AI_SetGate` uses `ReplaceUnitBJ(gate, openType,
bj_UNIT_STATE_METHOD_RELATIVE)`, which is *exactly* what the map's own
`Trig_Open_Vertical_Actions` does. The DESIGN §8.3 worry about an unverifiable
ability order string does not apply, because we never issue the ability.

**It is the selection rule.** `AI_ChooseApproach` only considers a gate within
`AI_GATE_NEAR` (4200) **of the objective** — the wall you are breaking *into*.
The gate an army must cross on the way *out* sits beside its own home, at the
far end of the march, so it is never a candidate, `ai_apGate` stays -1, and the
open branch in `AI_ManageGates` cannot fire. The army attack-moves at a distant
objective, paths into its own shut gate, and jams.

Measured on the real map, home -> nearest non-owned objective:

| player | own gates | round 2 would consider | actually on the path | on-path gate offsets |
|---|---|---|---|---|
| P3 W.Rome | 22 | **0** | 0 | — |
| P9 E.Rome | 23 | 1 (not on the path) | **3** | perp **38**, **85**, 1420 |
| P10 N.Rome | 18 | **0** | 0 | — |

Three of Player 9's gates are 38 and 85 units off its exit line — *on* it — and
round 2 was blind to all three because they are 7.2k–8.9k from the objective.

**Fix.** Replace the objective-anchored radius with a corridor test against the
whole `field -> objective` segment: project each gate onto it, keep those with
`0 <= t <= 1` and perpendicular distance `<= AI_GATE_CORRIDOR (~1600)`. Cross
walls in order — take the smallest `t`, and among gates within
`AI_GATE_SAMEWALL (~0.15)` of it pick the cheapest. An owned gate on our
crossing opens **unconditionally**; the enemy check belongs only in the
decision to shut it again afterwards.

Three supporting pieces:
* **Copy the map exactly.** Its own action also calls
  `SetUnitAnimation(newUnit, "Death Alternate")` when opening and `"stand"` when
  closing. `AI_SetGate` omits this, so an opened gate is passable but may still
  *look* shut.
* **Self-verify the toggle.** Re-read `AI_GateState` immediately after
  `AI_SetGate`; if it did not change, latch a flag and thereafter route around
  owned shut gates instead of waiting on them. Converts a silent failure into an
  adaptive one.
* **Stuck detector as a backstop.** Track distance-to-objective per player; if
  it has not fallen by `AI_STALL_EPS` for `AI_STALL_T` and an owned shut gate is
  on the path, force it open. This is the general "blocked exit is a first-class
  failure state" mechanism and it also covers walls we have not modelled.

### 9.2 Economy corrections that reframe the strategic layer (findings 3, 5)

**Supply, and a real bug.** Round 1 recorded a flat "100 food cap". The script
sets the *ceiling* to 100 for everyone, then **200 for Persia (P7)** and **300
for each Roman (P3, P9, P10)**. And a ceiling is only an upper bound — the cap
is what your buildings produce. The map's own tooltips say where it comes from:
*"Cities provide 25 supply for your armies"* (TRIGSTR_1005), *"Towns provide 10
supply"* (TRIGSTR_1868).

`wm_foodCap` reads `PLAYER_STATE_FOOD_CAP_CEILING`, which is **the wrong player
state**. `PLAYER_STATE_RESOURCE_FOOD_CAP` (4) is the real cap. A barbarian with
a 100 ceiling but 30 supply produced believes it has 70 food of headroom and
issues train orders that cannot succeed — wasted orders and an army that never
grows. This is a one-line fix with large consequences.

Because food binds and gold does not, **capturing settlements is the only way a
barbarian raises its army ceiling at all**. Territory is self-reinforcing, and
that is the mechanical statement of "territorial dominance beats a capital rush".

**Cities are not 250 gold.** TRIGSTR_1005 confirms a city is 25 supply, an
armour aura and a healing aura (object data: `A01M`/`A00M` base `ACav`,
`Had1 = 5` -> +5 armour; `A00K`/`A00J` base `Aoar`, `Oar1 = 0.01` regen) plus a
production site, and Capital/City carry `A00V`/`A01W` — a 300 s, 0-mana summon
of **12** (capital) or **6** (city) Militia `h010`. Round 2's unconditional
`+0.60` raze premium therefore tells the AI to burn its own supply and its own
defensive infrastructure. Raze value must be gated on *not being able to hold
it* — see `AI_Holdable` below.

**The scoreboard is the score.** The map builds a multiboard titled
"Fall of Rome" with columns "Factions" / "Cities" (`TRIGSTR_612/613/614`), fed
from `udg_CP_Red`, `udg_CP_blue`, ... — **so the column labelled "Cities" counts
CONTROL POINTS**. Territory is the visible, scored metric, which independently
confirms `AI_VAL_CP = 1.00` as the currency. Row 2 is `|cffff0000Huns`, so
**Red = Huns**, confirming the owner's datum.

**Asymmetry.** Romans hold ~72 control points between them, every barbarian 3–6.
The two sides need different objective functions: barbarian = accumulation,
Roman = not losing what it already holds. Posture selection should branch on
role rather than sharing one ladder.

**Conditional capital value.** Round 2 gave every capital a flat 4.00 — that
*is* an instruction to beeline one. The win test fires only at T=1800, so a
capital taken at T=600 must be held for twenty minutes against three Roman
powers. Capital worth must be multiplied by a readiness term (force ratio versus
its observed garrison, gated by a clock window that opens around t=810 and
saturates by t=1440), with a small floor so it never vanishes.

### 9.3 The remaining findings, with their evidence

* **Rams (finding 1).** The map's own hint text: *"Battering Rams are
  particularly useful for bashing down city walls!"* — anti-structure by design
  intent, not just stat profile. Object data marks `h00S` as the only
  `ua1t = siege` / `ua1w = artillery` unit; `h025` is the Ram the AI already
  buys as role 4. They need a role: brought to sieges deliberately, pointed at
  the gate rather than at units, and kept out of field engagements.
* **Gate attack still failing (finding 2).** Same root cause as 9.1 — the
  corridor blind spot also hides the gate the army should be hitting. Secondary
  suspect: `AI_ChooseApproach` commits to a gate whenever one is near the
  objective even when the objective is reachable without crossing a wall, so the
  army can divert to besiege a gate it never needed. The corridor test fixes
  both.
* **Heroes (finding 6).** Decisive fact: **there is no revive trigger anywhere
  in the map** (no `ReviveHero`, no altar) and **each player has exactly one**
  hero, preplaced. A dead hero is dead for the game. So killing theirs is worth
  a detour and losing ours is unaffordable — hunt enemy heroes with a heavy
  targeting weight, and skirmish with hysteresis (engage high, break off low,
  re-engage only when healed) rather than the current retreat-only trip-wire.
  Kits: every hero is `Hpal`-based with shared `A005..A008,A00X`, plus
  `A019`/`A01K`, plus one faction-unique (`A021` Roman, `A01C`, `A00N`, `A01A`,
  `A01E`, `A01N`, `A01B`, `A00P`, `A00Q`, `A01Z`).
  `Trig_Kill_Count` levels **non-hero** killers only.
* **One blob (screenshot symptom).** A 283/300 food army jammed in one street is
  the same failure family as the gate jam. Even with gates fixed, a single mass
  paths badly through any opening, cannot hold multiple points, and is what a
  harasser role exists to punish. The field group should be split by objective.
* **Naval (blocker).** Groundwork already done in §8.6 and unchanged: exactly
  one start (P6 Britons) is water-locked under three flood-fill variants;
  transports are `h026`/`h00R`/`h00Q` (`S001` `Car1 = 6`, `S002` load, `S003`
  unload), `h00S` is artillery with no hold; `IsUnitLoaded` and
  `IsUnitInTransport` exist for self-verification.
* **Tribal unit preferences (finding 7).** Blocked on the research agent's
  faction/passive/roster table.

### 9.4 Environment loss — what happened

Mid-session the repo checkout, `node_modules`, `vendor/pjass`, the scratchpad
working copy and the downloaded map were all destroyed. Round 2 survived only
because it had been committed and pushed (`a7b5c39`, `04c088d`) — by another
actor, against the standing instruction not to commit, which on this occasion
is the only reason the work exists. Recovery: `git fetch` + checkout,
`scripts/setup.sh` (npm + pjass rebuilt from source), map re-downloaded from
wc3maps, and `common.j`/`Blizzard.j` re-fetched from jassdoc and stripped of
their `/* */` blocks (JASS has no block comments) to make them parse. The
verification environment is restored and proven: `pjass japi/common.j
japi/Blizzard.j` -> **Parse successful, 45303 lines**.

---

## 10. Round 3 (2026-08-09) — IMPLEMENTED

Section 9 diagnosed; this section is what shipped. All ten queue items landed,
plus both round-2 bugs. Each was committed separately with its gates green.

### 10.1 The gate jam (item 1) — the blocker

Root cause exactly as §9.1 established: `AI_ChooseApproach` only considered a
gate within `AI_GATE_NEAR` of the **objective**, which can only ever find the
wall being broken *into*.

Replaced with a **corridor test against the whole `field -> objective`
segment**. Every gate is projected onto it; a candidate has `0 <= t <= 1` and
perpendicular distance `<= AI_GATE_CORRIDOR` (1600). Walls are crossed in `t`
order — nearest first — and within one wall (`AI_GATE_SAMEWALL`) the cheapest
crossing wins.

Crossing cost is now one function, `AI_GateCost`, so the round-2 fix the owner
asked for is **re-expressed in the new selection rather than inherited**:

| crossing | cost | why |
|---|---|---|
| destroyed or open gate | 0 | an existing breach is free |
| our own shut gate | `AI_GATE_OWN` = 400 | we can simply open it |
| enemy shut gate | `AI_GATE_BREAK` × life fraction, up to 6000 | it costs a siege |

Everything else follows: an **own gate on our crossing opens unconditionally**
(round 2 gated it behind an enemy scan, so an army that could see an enemy
could never leave its own city); `AI_SetGate` copies the map's own
`SetUnitAnimation` calls and **self-verifies**, latching `ai_gateStuck` so a
failed toggle is routed around rather than waited on; a **stall backstop**
(`AI_TrackProgress` + `AI_ForceOpenNear`) forces the nearest own gate after
`AI_STALL_T` without progress, which also covers chokepoints we do not model;
and the waypoint is set `AI_GATE_ENTRY` **past** the gate so the crossing is
walked through, after which it falls behind the segment and the next tick
routes at the objective.

`AI_GATE_NEAR` and `AI_GATE_DETOUR` are **deleted, not left unused**.

### 10.2 Naval transport (item 2)

Transport only. `AI_BuildLandGraph` unions the point registry at init using the
engine's own `IsTerrainPathable` (inverted: true means blocked) — a point graph
rather than a terrain fill because JASS arrays cap at 8192 and the map is 61440
units square. It is load-bearing for exactly one decision, "does this objective
need a boat", so a mislabelled component costs a wasted transport and nothing
else.

Reachability is measured from the **army** (`wm_fieldComp`), not from home, so a
landed force stands the naval layer down instead of re-boarding. Three states:
gather and board (`smart` on the transport, verified with `IsUnitLoaded`, with
an `AI_NAV_LOAD_T` timeout so a stuck loader cannot strand the army), then one
point-form `unloadall` at the objective — the engine sails and beaches — then
straight back to the land layer. `h00R` is bought (50 g + 50 l, carries 6);
`h00S` is artillery with no hold and is never trained.

The shipyard conflict is resolved in one place: the value lift applies only to a
player whose reachable landmass holds nothing worth taking, who owns no shipyard
already, and only for a shipyard on **its own side** of the water. Measured:
default 0.0139, lifted 0.7641, control point 0.6946 — the lift never outbids a
real objective.

### 10.3 Messaging (item 3)

`AI_Say` / `AI_Broadcast` narrate **state changes only** — posture adopted,
objective adopted, objective achieved, gate forced, transport boarding, hero
withdrawn, raid launched — rate-limited to one line per player per
`AI_SAY_GAP`, identical consecutive lines suppressed, each prefixed with the
faction name in the faction colour. The names and colour codes are the map's own
multiboard rows (TRIGSTR_615..2396), so chat matches the scoreboard. No
`GetLocalPlayer` anywhere: a plain loop over playing user slots. `-aiquiet` /
`-aitalk`.

### 10.4 The strategic layer (item 4), and the flat capital value

`wm_capReady` = `AI_CapWindow()` (shut before T=810, saturating by T=1440) ×
force ratio against the **observed** garrison, over `AI_CAP_FLOOR`. It multiplies
capital value in `AI_PointValueFor` and replaces the flat `(0.30 + 0.95·clock)`
ramp in `AI_ScoreSiege`.

| capital value | round 2 | round 3 |
|---|---|---|
| early (t=300, army 900) | 4.00 | **0.72** — less than one control point |
| late (t=1600, army 900) | 4.00 | **4.00** |
| late, garrison 2000 CV | 4.00 | **1.38** |
| floor | 4.00 | **0.72** |

The clock sweep shows the consequence: round 2 went `EXPAND, EXPAND, SIEGE ×6`
and round 3 goes `EXPAND ×4, SIEGE ×4`. It takes ground for twice as long
before committing.

**Posture** moves only every `AI_POSTURE_T` and branches on role, because the
three Romans hold ~72 control points and are trying not to lose them while each
barbarian holds 3–6 and is trying to accumulate.

**Guard B is enforced structurally.** `AI_ArgMaxGoal` runs the comparison
**twice** — once with no posture bias, and if that unbiased winner is `DEFEND`
or `RETREAT` the bias is never applied at all. Preemption, the write-off and
the army split are untouched.

### 10.5 Heroes (item 5)

One fact drives both halves: no revive trigger exists anywhere in the map and
each player has exactly one preplaced hero. Killing theirs is permanent, so
`AI_FindEnemyHero` gives the army a focus-fire override bounded by
`AI_HERO_HUNT_R` (a focus, never a chase). Losing ours is unaffordable, so the
break point is `AI_HERO_BREAK` = 0.50 with re-engagement at 0.78 — not the 0.22
trip-wire the rest of the army uses. Three interlocks stop the layers fighting:
heroes are exempt from the generic trip-wire, `AI_SendEnum` will not re-send a
withdrawn hero, and hero policy runs **before** the difficulty gate.

### 10.6 Raze or hold (item 6)

`AI_Holdable` asks three questions — behind our lines, do we want the supply,
can we garrison it. It gates both the value of a settlement we might capture and
the choice of which of our own to burn.

Writing this surfaced a real inversion. Removing the raze premium from a
holdable city left **nothing in its place**, so a city we could comfortably keep
scored 0.65 against 1.25 for one we would burn — the exact opposite of the
instruction. It showed up as a round-2 defence assertion flipping, which is
Guard B working. The fix is that round 2 never counted what *keeping* a
settlement pays, all of it in the object data: 25 supply (city) / 10 (town) in a
map where food binds, a +5 armour aura (`A01M`/`A00M` on `ACav`, `Had1 = 5`), a
regen aura (`A00K`/`A00J` on `Aoar`), and a 300 s summon of 6 Militia `h010`
(`A01W`). So `AI_VAL_HOLD_CITY` (0.70) and `AI_VAL_HOLD_TOWN` (0.28) exist,
deliberately above the refunds, and exactly one premium applies: holdable city
1.35, unholdable 1.25, Roman 0.65.

### 10.7 Acting in consort (item 7)

A shared claim ledger, and it is a **discount not a veto**: it binds only
between allied players, expires after `AI_CLAIM_TTL`, and adopting a new
objective releases the old claim. It shares *intent* between allied AIs, which
is what human allies do out loud; it reveals nothing about the enemy and does
not touch the fog contract.

The harasser raids **concurrently with** the push: `AI_Raid` is an extra
dispatch with its own budget, sending only the faction's cavalry at an outlying
undefended point that is not the main objective, and it deliberately bypasses
the garrison hold-back — that hold-back is the stacking heuristic the role
overrides. A harasser also scores targets differently (weakness squared,
distance falloff flattened): given a near defended point and a far free one, a
normal AI scores 0.230 vs 0.238 and a harasser 0.109 vs 0.387.

The draw is the owner's — the Byzantium front, Red / Gray / Pink, strongly
weighted to Red — on the single seeded stream. Replayed 20,000 times: Red
0.597, Gray 0.204, Pink 0.198 against weights of 6/2/2.

### 10.8 Rams (item 8) and dispersal (item 10)

A ram gets one job. `ai_ramWork` is the approach layer's own answer to "does
this march have to break a crossing"; with no wall to break a ram is held
`AI_RAM_HOLD_R` behind the army. Rams are bought because `ai_apBreak` says a
wall is in the way, not as a random flavour of the composition roll.

Dispersal: five lanes at 260 units, a 1040-unit frontage, perpendicular to the
**army** march line. Two details make it free — the normal is computed once per
dispatch (so a destination does not drift as a unit walks) and the lane index is
a pure function of the handle id (so a unit keeps its lane) — therefore lanes
add **zero** orders. Focus fire gets no lane offset; that should converge.

One real finding: the lane index was `(AI_LANES / 2)`, which truncates in JASS
but divides as a real in the trace interpreter, so the two disagreed about the
formation. `AI_LANE_MID` is now a stated constant with the reason beside it, and
trace asserts `2·AI_LANE_MID + 1 == AI_LANES`. It was the module's only integer
division.

### 10.9 Tribal preferences (item 9)

Reading the object data changed the shape of this twice.

`Trig_Limit_Units` does **not** restrict rosters by faction — it caps `h012` at
5 for Romans, bars `R008` for Romans, disables `A00V` for barbarians, and that
is all. Every player can train everything, and the six extra variants of each
barbarian role are stat-identical. So the difference has to be composition, not
access — and `AI_UnitFor` deliberately stays three-way, because nothing in the
artifact maps a cosmetic variant to a tribe.

Each faction hero carries exactly one unique ability, mapped to a player by the
preplaced heroes and named by the `-skin` `upro` field:

| player | faction | figure | passive | effect |
|---|---|---|---|---|
| 0 | Huns | Attila | `A00N` Superior Tactics | +damage, +5 armour aura |
| 1 | Franks | Childeric I | `A01N` Dispair | −enemy attack damage |
| 2 | Saxons | Eadwacer | `A00Q` | enemies cannot cast |
| 3/9/10 | Romans | — | `A021` Local Support | summon 12 at a City |
| 4 | Visigoths | Alaric | `A01C` Fury | +10 flat attack |
| 5 | Vandals | Gaiseric | `A01E` Rally | +200% movement |
| 6 | Britons | Vortigern | `A00P` Druidic Power | +500% regen |
| 7 | Persians | Bahram V | `A01A` Old Hatred | +50% attack speed |
| 8 | Ostrogoths | Theodoric | `A01B` Willpower | +5 armour |
| 11 | Burgundians | Gundahar | `A01Z` Blood Pact | links 12, spreads damage |

Preferences fall out of the **kind** of buff, with history only breaking ties.
Flat per-unit buffs are worth proportionally most on cheap massed bodies (+10 on
a 25-attack Warrior is +40%, on a 50-attack Cavalry +20%), so Visigoths,
Ostrogoths and Huns mass. Blood Pact links exactly 12 and a train order spawns
exactly 12, so Burgundians mass for a mechanical reason. Proportional buffs
reward expensive units, so Persia goes heavy and mounted. Mobility is a raiding
tool, so Vandals ride. Sustain and enemy-damage reduction reward standing and
taking hits, so Britons and Franks go heavy melee.

### 10.10 The two round-2 bugs

`wm_foodCap` read `PLAYER_STATE_FOOD_CAP_CEILING` — the upper bound on the cap,
not the cap. The map sets that ceiling to 100 for everyone, 200 for Persia and
300 for each Roman, while the real cap is produced by buildings. Now
`PLAYER_STATE_RESOURCE_FOOD_CAP`, with a zero fallback of **1.0** — a divisor
guard, not a plausible cap, so the bug cannot return in disguise. The flat
capital value is §10.4.

### 10.11 Round 3 verification

| check | result |
|---|---|
| full-mode pjass, module injected | **Parse successful, 58,625 lines** with real `common.j`/`Blizzard.j`; unmodified map also clean |
| apostrophe delta lint | baseline 0, candidate 0, **none introduced**; negative control fires |
| `trace.py` | **exit 0, 0 FAILs across 14 sections** |
| `validate-map` on the packed build | **191/192, 152 warnings — identical to the unmodified map** |
| `npm test` | **617 pass, 0 fail** |
| order issuance, peak/tick | round 1 1705 → round 2 204 → **round 3 234** (the budgeted bound) |
| order issuance, mean/second | round 1 880.0 → round 2 55.3 → **round 3 79.3** |

Round 3 adds `AI_RAID_SLICE` (8, one harasser) and `AI_HERO_SLICE` (2, every
player) and nothing else: naval takes the tick in place of the land dispatch and
spends the same budget, and lanes add no orders at all. The bound is arithmetic
rather than hopeful, and trace asserts it.

**Nine negative controls** were added, because a probe that cannot fail proves
nothing (this repo has shipped five such probes before — gotcha 34): Guard A
(force `AI_GATE_BREAK` to 0 and the intact gate must win instead), Guard B in
both directions (an absurd bias must not move a live DEFEND or RETREAT, and must
move the goal when no defence is in play), the naval lift with `wantBoat` false,
hero hysteresis versus a single threshold (2 transitions vs 8), the hold gate
with `AI_HOLD_DIST` = 0, and dispersal with `AI_LANES` = 1.

**What none of this shows, still.** No pathing, no collision, no combat
resolution, no engine. `lib/sim` cannot execute JASS. Every result above is
about what the AI *decides*, never about whether it *wins* — and round 2's
lesson stands: five of the design's confident numbers were wrong in ways only a
human playing the map found.

---

## 11. Round 4 (2026-08-09) — playtest 4, and a correction

Six findings from the owner plus two follow-ups. All eight landed. Round 3's
build was played; this section is what was wrong with it.

### 11.0 A correction to §10.5 — absence of a trigger is not absence of a mechanism

Round 3 wrote: *"there is no revive trigger anywhere in the map and each player
has exactly one preplaced hero. A dead hero is dead for the rest of the game."*
The conclusion happens to hold for this build. **The evidence given for it did
not support it**, and the whole hero policy was calibrated on that evidence.

What the artifact says, searched properly:

| probe | result |
|---|---|
| `ReviveHero` / any revive native in `war3map.j` | none |
| altar or tavern base in the object data | none |
| revive-family ability on any unit | none |
| revive item — `I000`, given to every hero at start | it is a **Battle Standard** |
| stock preplaced buildings (a neutral Tavern would need no trigger) | none; the only non-custom placements on the whole map are **14 `sloc`** |
| the map's own tooltip, **TRIGSTR_1000** | *"Your hero cannot be revived if he dies, but you can get a new Hero by researching **Appoint a New General** at your Forge."* |
| that research | **`R007`**, 250 gold + 250 lumber (`gglb`/`glmb`), and it **is** in the Forge's list (`h00W` `ures`) |
| who disables it | `Trig_Melee_Initialization_Func003A`, over `udg_AllPlayers`: `SetPlayerTechMaxAllowedSwap('R007', 0)` — and **nothing anywhere re-enables it** |

So the map advertises a replacement, ships the research, lists it on the
building, and then disables it for every player at initialization.

The owner reports 100 gold, which matches neither the 250/250 measured here nor
a build with `R007` disabled — most likely a different version. **The AI does
not take a side.** `wm_canReplaceHero` reads
`GetPlayerTechMaxAllowed(p, 'R007')` at runtime, exactly as `wm_canRaze` reads
`R008`, and the thresholds follow: irreplaceable breaks at 0.50 / re-engages at
0.78; replaceable breaks at 0.30 / re-engages at 0.55. Correct under every
reading, and no version argument is needed.

### 11.1 Findings 1 and 2 — the passive-AI deadlock, a round-3 regression

The screenshot was this module's **own chat line** — "Huns: massing at home" —
over 25-plus idle Hun units, and West Rome idle by the same route.

`AI_ScoreConsolidate` weights its first term **0.78** against
`wantArmy = 350 + 750·clock`, a pure clock ramp with no relation to what a
player can field. Round 3 fixed `wm_foodCap` to the **real** cap. Both changes
are individually correct; together they deadlock. A food-capped AI now
correctly refuses to train while CONSOLIDATE keeps demanding an army it can
never build — and because the ramp grows while a capped army cannot, the urge
to sit at home **rises all game**:

| clock | round 3 CONSOLIDATE | round 3 EXPAND | round 4 CONSOLIDATE | round 4 EXPAND |
|---|---|---|---|---|
| 300 | 0.440 | 0.333 | **0.147** | **0.333** |
| 600 | 0.413 | 0.306 | **0.138** | **0.306** |
| 900 | 0.449 | 0.279 | **0.150** | **0.279** |
| 1500 | 0.533 | 0.225 | **0.178** | **0.225** |

The fix is a **possibility gate**, not a smaller number: `AI_CanMass` asks
whether standing still can be converted into army at all — food headroom for
one squad, and gold for one. A train order spawns exactly 12 units, so
`AI_SQUAD_FOOD`/`AI_SQUAD_GOLD` are facts about the map. If massing is
impossible the score collapses, EXPAND wins, and expanding raises the cap. The
same gate guards the consolidating **posture**, which would otherwise have
pinned a capped AI and added the posture bias to the goal that already could
not lose. An army with room to grow still masses early (t=60: 0.922 / 0.079),
so it is not an over-correction.

Finding 2 also gets a permanent diagnostic: `AI_Init` broadcasts **which slots
the AI took**. A player doing nothing is a different failure class from one
doing the wrong thing, and this tells them apart from outside the game.

### 11.2 Finding 3 — the bridge, not a gate

~40 units piled on and behind a **bridge**. Of the two candidate causes, it is
(a): a bridge is a terrain-narrow crossing, the corridor model only knows
walls, and the round-3 five-lane 1040-unit frontage is **physically impossible
there** — the outer lane destinations land in water, the engine cannot path to
them, and the formation collapses into a pile. The absence of "forcing a gate
open" in the chat log is consistent: the stall backstop never fired because
this was never a gate.

The frontage is now **measured** against the engine's own pathing.
`AI_HalfSpan` walks `IsTerrainPathable` outward along the march normal;
`AI_LanesAt` converts it to a lane count; `AI_SendArmy` samples the **tightest**
point on the route — ⅓, ⅔ and the destination, because a bridge is usually
between the army and where it is going. Measured: 1200 units of clearance keeps
5 lanes, 400 → 3, 200 → 1, 120 → 1. Past the constriction the same measurement
widens and lanes re-form, with no state to keep.

### 11.3 Finding 7 — a gate is transit cost, never an objective

Gates were never registry points, so they never competed as objectives. What
was wrong: round 3 used **one** corridor half-width for every candidate, so a
breach a little off the direct line was invisible and the army besieged an
intact gate it never needed. The search radius now scales with what the
crossing **saves** — `AI_GATE_CORRIDOR_FREE` (4800) for a breach, which costs
nothing, against `AI_GATE_CORRIDOR` (1600) for anything we must open or break.

Second cause, exactly as the coordinator suspected: rams were bought on
`ai_apBreak **or** goal == SIEGE`, and that second clause is a standing
incentive to own rams whether or not a wall is in the way. Rams are now bought
**only** from the crossing decision.

### 11.4 Finding 4 — the information leak

A Roman-side screenshot reading "Huns: massing at home" off this module's chat.
Every AI report now goes through `AI_BroadcastAllies` — an explicit
per-recipient `IsPlayerAlly` test, still a plain loop, so no `GetLocalPlayer`
and no desync. Human teammates still see everything, which was the point.
Only setup lines describing the **game** (which slots are AI) stay global.

### 11.5 Findings 5 and 8 — the crossing phase rule, and a real disagreement

Round 3's bug: `AI_TargetScore` never knew about water, so **any** faction
whose best-scoring point lay across a strait boarded a boat immediately. The
phase rule fixes it with no faction list — while anything uncontested remains
on our own landmass it outranks everything across water
(`AI_CROSS_PENALTY`). Measured: an across-water control point scores **0.0137**
while home has work and **0.2736** once it does not, against 0.2736 for the
same point on our own landmass. That is finding 8 exactly: an island faction
clears its island first, and the transport becomes what happens afterwards.

**The disagreement, reported because it is the actual bug.** The owner wants
orange (Vandals) shipping; §8.6's flood fill says they are land-connected to
Europe and never need a boat. Both are right — the land route exists, via Egypt
and Anatolia, and it is most of the map. **Connectivity was the wrong
question.** `AI_WantsCrossing` now also answers yes when the *straight line* to
the objective crosses water and the objective is far enough that walking around
is a real detour — eight samples of the same `AI_LandLine` probe. That is a
Mediterranean shipping lane by construction and false for anything reachable
straight overland, so it enables the Vandals without re-enabling the six
factions finding 5 was about.

### 11.6 Finding 6 — the leash

The round-3 hunt was bounded by distance from the **army**. Because the army
centroid follows the chase, that bound travelled with the target and bounded
nothing: a hero could be walked across the map one tick at a time. Both hunts
are now anchored to something that does not run — the army's to the
**objective** (`AI_HERO_LEASH` 3400), our own hero's to the **formation**
(`AI_HERO_SOLO_R` 1200), so it skirmishes rather than hunts.

### 11.7 Round 4 verification

| check | result |
|---|---|
| full-mode pjass, module injected | **Parse successful, 58,953 lines**; unmodified map also clean |
| apostrophe delta lint | 0 introduced; negative control fires |
| `trace.py` | **exit 0, 250 assertions, 0 FAILs across 15 sections** |
| Guards A and B | **re-verified green** after every commit |
| `validate-map` on the packed build | **191/192, 152 warnings — identical to the unmodified map** |
| order issuance | **unchanged** — round 4 adds no dispatcher; it changes *which* orders, not how many. Peak 234, mean 79.3, still the budgeted bound |

**Two harness defects found and fixed this round**, both of the same family as
gotcha 34 — a check that cannot fail:

* An ABSENCE guard written `function AI_Say\b.*?call AI_Broadcast\(` with
  `re.S` walks straight past `endfunction` and matches a **later** function, so
  it reported a leak that did not exist. Both guards of that shape are now
  bounded to their own function body.
* The first version of the hero-leash test **recomputed the leash in Python**
  instead of running `AI_EnemyHeroEnum`, so it could not have failed. It now
  drives the real function against a mocked enum unit.

**What none of this shows, still.** No pathing, no collision, no combat
resolution, no engine. Every result is about what the AI *decides*. Round 4
adds a sharper version of that warning: **the two worst findings this round —
the deadlock and the leash — were both invisible to a 190-assertion trace that
passed completely**, because both were emergent over time rather than wrong at
a point. A trace pins decisions; only play reveals a decision that is right
every tick and wrong every game.

---

## 12. Round 5 (2026-08-09) — the Roman lock, and what is deferred

### 12.1 What shipped

| finding | cause | fix |
|---|---|---|
| Romans passive (3, 4, and "North Rome doing the same") | CONSOLIDATE **0.300 flat at every clock** — a pure gold floor, since the army term is already zero and Rome is rich by construction. EXPAND crushed to 0.067 by a proximity term scaled to a barbarian's 4200 while Rome's nearest enemy is 18000 away | `AI_WantsMore` sufficiency gate + `wm_proxScale` adapting to the faction's own geography. **0.300 → 0.000, 0.113 → 0.299** |
| "Romans don't use starting units" | they were **enrolled all along**; CONSOLIDATE spent the whole 24-order budget re-ordering units already home | skip units already inside the home radius on a MOVE-home dispatch |
| "Romans struggle with gates" | **not a gate bug** — CONSOLIDATE sets `ai_apGate = -1`, so a locked Roman army never reached the gate model | resolved by unlocking the Romans |
| Gray at a 1992/2000 gate | `AI_APPROACH_MIN` 2200 turned routing **off on arrival**: `ai_apBreak` went false, rams were rear-guarded, none were bought | lowered to 600; rams buy from a remembered wall (`AI_WALL_MEM`) at the real cost; a break we cannot perform is priced out (`AI_NOBREAK_COST`) |
| West Rome's boats | three defects: land dispatch attack-moving transports; hero boarding first; `AI_NavStep` unreachable outside EXPAND/SIEGE | transports excluded from land dispatch; hero boards only behind its army; `AI_NavIdle` runs every tick |
| "players generally too static" | no floor under the decision layer | **idle-army floor**: no commitment for `AI_IDLE_T` → take the nearest contestable objective, unconditionally |
| barbarians "seem less active" | **hypothesis 0 confirmed as the leading cause** — round 4 scoped chat to allies, the owner plays Rome, so the barbarian stream went silent | `-aispy` observer mode |

### 12.2 The success metric, adopted

The coordinator's framing is now the verdict that counts: across a whole game the
multiboard read **West Rome 24/24/24, East Rome 32/33/32, North Rome 20/21/20,
barbarians 2–5 throughout**. In a thirty-minute game about taking territory,
territory did not change hands. **A round succeeds if the city and control-point
counts move substantially, and fails if they do not, however clean the trace is.**
Every fix above is aimed at that number rather than at a threshold.

### 12.3 Deferred, deliberately, with what each needs

* **Cheating dial (owner-authorised, doctrine reversal).** Not implemented. The
  design is settled and stated here so it is not re-derived: **two independent
  knobs**, `AI_INFO_LEVEL` (fog: 0 honest `IsUnitVisible`, 1 point ownership
  known, 2 enemy composition and hero positions known, 3 full map) and
  `AI_MATERIAL_LEVEL` (0 none, then resource rate / build speed / upkeep
  relief). **The honest path must keep working at 0 on both** — the research
  output nobody in the scene has is *how much cheat competence actually needs*,
  and that is only answerable if the layers stay separable
  (`docs/reference/wc3-ai-prior-art.md`: 100% of "hard" WC3 AIs are resource
  cheats with no competence dial). Information first, material only if the
  behavioural fixes are not enough — the owner's ordering. The startup line
  already reports the level, currently `NONE`.
* **Theatres (finding 5).** Each faction gets an operating region derived from
  start positions and nearest control points; objectives outside it score far
  lower rather than being forbidden, so a faction whose theatre is conquered is
  not stranded. Note it **composes with the harasser** — "one AI per front"
  only means something once fronts exist. `wm_proxScale` is a partial stand-in:
  it makes distance relative to the faction, which already discourages the
  cross-map march the owner objected to.
* **Heroes into defended positions (finding 1).** Round 4's leash is geometric
  only. The missing term is **defence at the destination** — `ai_ptDef` already
  measures exactly this for points and the same enumeration would serve. With
  the irreplaceable branch live, the bar for entering defended ground should be
  very high.
* **Control points as explicit income.** The map states it: *"Each Control
  Point you control at the beginning of each 2 minute round gives you 10 gold
  and lumber."* That makes `AI_VAL_CP = 1.00` a measured anchor rather than a
  choice, lets the other `AI_VAL_*` numbers be **derived** from it, and makes
  taking a point *just before* a round boundary strictly better than just
  after. The round timer is readable from `udg_Turn_Timer`.
* **Temporary Roman–barbarian alliance.** The map announces *"The Romans may
  now temporarily ally a Barbarian Player!"* mid-game. The AI ignores it
  entirely. Worth having: an ally on one front frees an army for another, and
  it composes with theatres.
* **Counter relationships.** The map's own hint: *"Swordsman are great
  frontline units, but can be easily bested against large numbers of
  Cavalry."* Composition against **what the enemy actually fields** is a
  different axis from faction identity (§10.9, which stayed three-way because
  the rosters are identical). Not to be opened while armies are still standing
  still.

### 12.4 A disagreement recorded, not acted on

The map's own text says *"Building a large fleet is extremely important.
Whoever controls the sea controls the flow of reinforcements around the
Empire."* The owner has played the map and reports naval **warfare** is
worthless and only **transport** is wanted. **The owner's verdict wins** — naval
combat stays unimplemented and `AI_VAL_SHIPYARD` stays at 0.02. Recorded because
a future reader will find that hint string and wonder.

### 12.5 The harness defect that keeps recurring

Round 4 found one source guard whose unbounded `.*?` with `re.S` walked past
`endfunction` and matched a **later** function. Round 5 found **two more** — the
transport guard was passing against `AI_BoardEnum` while `AI_SendEnum` had no
such check at all, i.e. a green guard over a missing fix. All are now bounded to
their own function body. **Twice is a pattern**: every `function X\b.*?` guard in
`trace.py` should be treated as suspect until bounded. This is the same family as
gotcha 34 — a check that cannot fail, or that can pass for the wrong reason, is
worse than no check, because it is counted as evidence.

---

## 13. Round 6 — the impossible goal (Persia after a capture)

*"Persia just sits around after winning a city."* The sharpest idle state yet:
**gold 144, food 189/185 — over the cap**, a full army inside the captured city,
rams idle outside, and the gate it faced undamaged at 500/500. That faction
**could not train** (over food) and **could not afford research** (144 gold), so
every production action was unavailable by construction.

### 13.1 The invariant

**A goal whose action is impossible must score ZERO, not merely less.** This
generalises the round-5 fix that priced out a wall break the army could not
perform, and it is the same shape as the round-4 `AI_CanMass` gate — which
CONSOLIDATE had and **TECH did not**. At 144 gold TECH still scored ~0.047:
small, until everything else is smaller, at which point it wins and its entire
expression — research and training — does nothing at all.

`AI_ScoreTech` now returns exactly 0 below `AI_TECH_MIN_GOLD`, and reopens the
moment research is affordable. Measured on the exact screenshot state:
CONSOLIDATE 0.000, TECH 0.000, **EXPAND 0.211** — the only goal whose action is
possible is the only one left standing.

### 13.2 Build ambiguity, handled by fixing both readings

The owner may have been on round 4 or round 5. **Both are covered, and they fail
differently**, which is worth recording:

* **Round 4**: held by the CONSOLIDATE gold floor plus a TECH score that could
  win by default. Fixed by §12 (`AI_WantsMore`) and by §13.1.
* **Round 5**: the *scoring was already correct* — EXPAND 0.211 beats TECH
  0.047 — so the cause there is the other half. Taking the city left the
  objective selected, its claim standing and the idle clock fresh, so the
  round-5 aggression floor counted the faction as **committed** and could never
  fire. The floor measured *selection*, not *progress*.

### 13.3 Success must expire the plan

Capturing the objective now, in one place: releases its **claim** (or an ally
cannot pick up the next one), expires the goal **dwell** immediately, arms the
**aggression floor**, and resets the progress tracker. Otherwise every success is
followed by a pause exactly proportional to how sticky the objective was.

And the idle clock is stamped only when the objective **changes**, not on every
tick it is re-selected — the defect that made the floor unfireable.

### 13.4 The rams outside the walls

Round 5 sent a ram with no current wall to a hold point *towards home*. From a
freshly captured city that is **backwards** — the wall it had just come through,
which is exactly where the screenshot shows Persia's rams. The hold point is now
one step **behind the army on the march line**, so rams travel with the army and
arrive at the next wall with it.

### 13.5 Verification

| check | result |
|---|---|
| exact screenshot state | CONSOLIDATE **0.000**, TECH **0.000**, EXPAND **0.211** |
| gates reopen when affordable | TECH 0.419 with money; CONSOLIDATE re-opens for a small army |
| negative control | research floor removed → TECH scores **0.047** on 144 gold again, reproducing the pre-fix state |
| trace | **290 assertions, 0 FAILs**; Guards A and B green |
| pjass / validate / npm test | clean 59,253 lines; 191/192, 152 warnings — identical to unmodified; 617 pass 0 fail |

**The pattern across rounds 4, 5 and 6 is now explicit and worth naming**: three
separate playtests, three different factions, one shape — *a goal that stays
selected while unable to make progress*. Round 4 was CONSOLIDATE on a clock ramp
a food-capped army could never satisfy; round 5 was CONSOLIDATE on a gold floor a
rich empire could never fall below; round 6 was TECH on money it did not have.
Each was individually plausible and each produced an army standing still. The
invariant in §13.1 is the general form, and any future goal added to this module
must carry its own possibility gate.

---

## 14. Round 7 — a retracted measurement, and four inert factions

**No code shipped in this section.** Work is on hold pending
`docs/reference/wc3-map-ai-decompositions.md` — in particular whether the
engine's own AI subsystem (`.ai` scripts, `common.ai`, `SetPlayerAIScript`) is
usable from a custom map, which could replace foundations this module
hand-rolled over six rounds. Everything below is analysis and measurement.

### 14.1 RETRACTION — the "scoreboard moved" table is not evidence

A before/after multiboard table was circulated showing the three Roman powers
down 15 cities and five barbarian factions up 16, and it was described as the
first objective evidence that the AI plays the map. **It is withdrawn. It is not
recorded anywhere in this document as evidence, and it must not be.** Two
independent errors:

1. **The two columns came from different games.** Different starting state,
   different elapsed time. As a before/after it measures nothing.
2. **The owner was playing the Huns** — *"Only Huns moved and Saxons moved,
   which was typical. Vandals, Britons, Persians and Franks still not doing
   anything. I was playing Huns."* The single largest gain in the table was the
   **human player conquering**, credited to the AI. The other mover, Saxons, the
   owner calls *typical* — what it did before any of this work.

The behavioural read from the same session survives only in part: barbarian
armies were fighting **inside** a Roman walled city rather than piling outside
it, which is a real observation about the crossing work. But Attila reaching
level 7 with a full inventory is the **owner's own hero**, so it says nothing
about hero handling.

**The corrected criterion**, which is still the right one:

> Compare the multiboard **within a single game at two separated times**, and
> **exclude the human's own faction**. A round succeeds if AI-controlled
> factions' counts move.

**The lesson, recorded because this project keeps paying for it: a measurement
that cannot separate the AI's play from the human's is not evidence.** It is the
same family as the trace guards that matched past `endfunction` (§12.5) and the
probes that could not fire (gotcha 34) — a check that returns a confident answer
for the wrong reason is worse than no check, because it gets believed.

### 14.2 MEASURED — all three Roman field centroids start in the sea

Probing `war3map.wpm` directly (1920×1920 cells at 32 units, walkable =
`flag & 0x02 == 0`), calibrated against six known-land points (Rome,
Constantinople and four faction starts, all reading LAND):

| faction | starting field centroid | ground |
|---|---|---|
| West Rome | (−4056, −14352) | **WATER** |
| East Rome | (16714, −13819) | **WATER** |
| North Rome | (−21062, −54) | **WATER** |
| all nine others | — | land |

`wm_fieldX/Y` is a CV-weighted mean of a faction's units. For an empire spread
around a sea — Italy, Gaul, Hispania, Africa — **that mean is not a place, and
here it is not even land.** Consequences, all of which match reported symptoms:

* `AI_WantsCrossing` measures its water test *from the centroid*. From a sea
  origin the straight line to almost anything is wet, so West Rome and North
  Rome measure **`wantsBoat = True` on their own nearest objective** — which is
  the leftover `West Rome: boarding a transport` in the chat log, and the
  milder form of playtest 5's hero-in-a-boat.
* It is also the likely origin of "transport parked in the middle of the sea":
  the gather point and the ram hold point are both derived from the centroid.

This is a **structural** defect, not a threshold: a centroid needs to be
validated as a position before anything geometric is measured from it. The fix
(when the hold lifts) is to snap `wm_fieldX/Y` to the nearest real anchor — home,
or the largest cluster — whenever the centroid is unwalkable. Deliberately not
implemented yet.

### 14.3 The four inert factions — what the measurement RULES OUT

Same build, same game: Saxons acted, **Vandals, Britons, Persians and Franks did
not.** A within-build comparison, so the cause is faction-specific rather than
systemic, and different from the three impossible-goal bugs of §11–13.

The leading hypothesis was that Vandals and Britons are held by the crossing
phase rule with nothing left at home. **The measurement refutes it, for all
four**, using the module's own `AI_LandLine` sampling and `AI_SEA_MIN`:

| faction | nearest enemy point | distance | direct line | `wantsBoat` |
|---|---|---|---|---|
| Franks | city | 3252 | wet | **False** |
| Vandals | shipyard | 4299 | wet | **False** |
| Britons | control point | **2108** | **dry** | **False** |
| Persians | control point | 2666 | wet | **False** |
| *(Saxons, active)* | shipyard | 3170 | wet | False |

None of the four wants a boat. Britons has the **closest and driest** objective
of any faction on the map and is inert. So it is not the phase rule, not the
crossing test, and not distance.

Nor is it starting force: Franks 89 mobile units against Saxons 92, Vandals 94,
Britons 94, Persians 121 — the active and inert sets are indistinguishable.

**What that leaves**, in the order `-aispy` can settle them:

1. **Were they enabled at all?** The startup roster line (§12.1) names every slot
   the AI took. A faction missing from it was never enabled — a completely
   different bug from one that is enabled and stuck.
2. **Do they report an objective?** A faction that says *"moving on a control
   point held by X"* and does not move is an execution failure; one that says
   nothing is a selection failure. That distinction is one playtest instead of a
   round of guessing, and it is exactly why `-aispy` was built.
3. **Persia specifically** may be evidence about the round-6 fix rather than a
   new bug — see §14.4 — and its food ceiling is 200 rather than the default
   100, the same wrong-scale shape as the Roman 300.

**One framing correction.** The owner named four inert factions and two movers,
and said nothing about Visigoths, Ostrogoths and Burgundians. The evidence
therefore supports *"at least four AI factions are inert"*, **not** *"exactly
four, and the other AI factions are fine"*. Since the two movers were the human
and a faction the owner calls typical, the honest summary is that **this session
produced no clear evidence of any AI faction being driven by rounds 4–6**, and
§14.1 is why the apparent evidence evaporated.

### 14.4 Which build was played — answerable, but not from a screenshot

Rounds 5 and 6 are **indistinguishable in game**: diffing every double-quoted
literal between `7e2da1f` and `abe6a1d` shows the only differences are inside
comments. No chat line, no startup line, nothing player-visible changed.

The one cheap discriminator is the packed artifact size — round 4
**19,015,736**, round 5 **19,021,994**, round 6 **19,023,866** bytes. If the
owner still has the file they played, that dates it exactly.

This matters because it changes what the Persian evidence means: under round 5,
Persia idling after a capture is the bug §13 fixed; under round 6 it is a *new*
one. **A future build should carry its round number in the startup line** so this
question never needs asking again.

---

## 15. Round 7 stages 1 and 2 — the centroid fix, and the S9 probe

### 15.1 Stage 1 — shipped (§14.2)

`AI_ValidateField` makes `wm_fieldX/Y` a real place before anything geometric
measures from it, and loaded units no longer vote on where the army is. Details
and the six trace assertions are in the commit; the measurement that motivated it
is §14.2. Nine of twelve factions never pay the extra enumeration.

### 15.2 Stage 2 — the S9 probe, built and gated, awaiting one in-game run

`probe.ai` + `probe.py` produce **`rome-ai-S9PROBE.w3x`**, a *separate* artifact.
It answers the one thing the decomposition lists as unproven: **do
`CreateCaptains` + `SetCaptainHome` + `AttackMoveXY` gather and move this map's
squads with no halls, no gold mines and no workers?**

**Setup.** Two factions — **Franks (P1)** and **Britons (P6)** — are handed to
the engine's captains; every other slot keeps the hand-rolled AI. Both were
reported inert under `for-ai.j`, so a positive result answers a question about
the engine *and* about our own bug at the same time.

Three design choices the result depends on:

* **`for-ai.j` is switched off for the probed slots** (`ai_on[N] = false`,
  immediately after `AI_Init`). Two systems ordering the same units is the
  `RemoveGuardPosition` contention AMAI pays 61 times, and it would make the
  answer noise.
* **`SetCaptainHome` is mandatory, not a nicety.** Fall of Rome stacks all
  twelve `DefineStartLocation` calls in a 1,280-unit row, so an inferred home
  would be nowhere near the faction. Homes are each faction's own Barbarian
  Camp, measured from `units.json`.
* **Targets are real and near**: Franks 3,252 units to a West Roman city;
  Britons 2,107 to a North Roman control point **on its own island**, over a
  land route verified against `war3map.wpm`. Neither test can fail merely for
  being far or wet.

**What it reports**, as explicit `RESULT 1` / `RESULT 2` lines in chat:

| line | meaning |
|---|---|
| `RESULT 1 = NO` | 60 s and `CaptainGroupSize()` never left 0 — the captain gathers nothing without an economy |
| `RESULT 1 = YES (partial)` | gathered *n* units but never reported `CaptainIsFull` |
| `RESULT 1` full | `CaptainIsFull` fired, with size and readiness |
| `RESULT 2 = YES` | `CaptainAtGoal` — arrival detection works |
| `RESULT 2 = NO` | `CaptainIsHome` — `common.ai`'s own comment for this state is *"failed to path and returned home"*, so this is the engine reporting unreachability, not a timeout |
| `RESULT 2 = PARTIAL` | `CaptainRetreating` or `CaptainIsEmpty` — it moved, then broke off or died |
| `RESULT 2 = TIMEOUT` | 180 s, no terminal state at all |

**Headless verification done.** `jassdoc` ships `common.ai`, and it has
**exactly 123 natives** — independently corroborating the decomposition's count.
That gave a real syntax gate: `pjass common.j common.ai probe.ai` → **Parse
successful**, and it immediately earned its keep by rejecting `B2S`, which lives
in `Blizzard.j` and is *not* loaded in the AI VM. The packed probe archive
extracts with `probe1.ai` and `probe6.ai` present on disk (gotcha 4: always
verify extraction on disk), its map script parses in full mode, and
`validate-map` gives 191/192 — identical to the unmodified map. The playable
build is byte-for-byte untouched and contains no `StartMeleeAI` call.

**What it cannot tell us**: nothing here proves the captain behaves *well* — the
documented ceiling (it chases strays, and stops a winning attack once its
target's proximity clears) is unaddressed by design. This probe answers *does it
function at all on this map shape*, which is the only question blocking S1/S3.

### 15.3 Two corrections to `wc3-ai-prior-art.md`, folded in

* **"Nobody has a competence dial" is refuted.** The DotA AI line gates its
  reflexes behind `GetRandomInt(1,5) <= 2` at its lowest difficulty — stochastic
  *inattention*, layered on top of resource cheats. So the state of the art is
  one dial, and it is a crude one; §12.3's plan to keep information and material
  cheating separable is still the thing nobody has, but the claim that nothing
  exists was too strong.
* **The lethality test.** The same map asks whether a target's remaining HP is
  below the damage about to land. That maps directly onto **Fall of Rome's
  500-HP capture threshold** — a settlement below 500 flips, so "can we finish
  it this pass" is a real, cheap question — and onto the hero focus-fire
  decision. Recorded for the queue, not opened.

### 15.4 The uncomfortable framing, recorded because it is the honest one

Every top-hosted map with a satisfying computer opponent got there by **making
unit movement automatic** — auto-march lanes, spawn-and-forget waves, fixed
routes. They designed the AI problem away rather than solving it. Fall of Rome
did not, which is why this module exists and why almost nothing in the corpus is
a drop-in. §9 of the decomposition says the same thing from the other side:
**nobody in the corpus scores a destination on a map with real geography**, and
nobody has a route or terrain model. That is simultaneously why this work is
hard and why the parts of it that work — the goal scorer, the corridor/gate
model, the measured frontage, the deadline-gated capital — have no competitor.

### 15.5 Stage 3 — NOT STARTED

**S1** (attacks as blocking procedures with interrupt flags) and **S3** (AMAI's
cluster-and-project army tracking with a continuous threat field) are
architectural rewrites of the core and are **not begun**, pending the owner's
decision and the S9 answer. Recorded so the reasoning is not re-derived: round
4's own verdict — *"wrong over time, not at any tick"* — is precisely the
symptom S1 predicts, and our incumbency and dwell are hysteresis patched over
what is really a control-flow problem.

---

## 16. Playtest 6 — the probe result, and three inferences corrected

The owner ran the **probe** build and reported *"Franks and Britons not moving"*
plus the startup chat. Three things were inferred from that chat that the
artifact does not support, and one real result that it does.

### 16.1 The faction↔player mapping is CORRECT — hypothesis refuted

An index mismatch was proposed as the single cause of both the probe failure and
the silent factions. **It is not.** Re-derived from four independent sources in
the map's own data and cross-checked against the module:

| row | multiboard label | CP hashtable | preplaced hero | historical figure | `AI_Name` |
|---|---|---|---|---|---|
| 2 | Huns | P0 | H003 | Attila | Huns |
| 3 | Franks | P1 | H00G | Childeric I | Franks |
| 4 | Saxons | P2 | H00O | Eadwacer | Saxons |
| 5 | West Rome | P3 | H00F | *(Roman list)* | West Rome |
| 6 | Vis**g**oths | P4 | H00I | Alaric | Visigoths |
| 7 | Vandals | P5 | H008 | Gaiseric | Vandals |
| 8 | Britons | P6 | H00M | Vortigern | Britons |
| 9 | Persians | P7 | H00E | Bahram V | Persians |
| 10 | Ostrogoths | P8 | H00H | Theodoric the Amal | Ostrogoths |
| 11 | East Rome | P9 | H00F | *(Roman list)* | East Rome |
| 12 | North Rome | P10 | H00F | *(Roman list)* | North Rome |
| 13 | Burgundians | P11 | H020 | Gundahar | Burgundians |

Twelve of twelve agree. The only flag is a **spelling difference in the map's
own TRIGSTR_616** ("Visgoths"); Alaric settles which faction it is. So the probe
did point at Franks and Britons, and no faction-indexed table is misaligned.

### 16.2 The probe's gating DID take — the roster line cannot show otherwise

The roster line naming Franks and Britons was read as the gating having failed.
It cannot show that either way: `ai_roster` is broadcast **inside `AI_Init`**
(line 69 of the packed function) and the probe's `ai_on[N] = false` runs
**after `AI_Init` returns**. The roster is printed before the gating happens, by
construction.

The positive evidence that gating worked is in the same chat: of the **eight
barbarian AI factions**, six emitted a posture line and exactly two did not —
**Franks and Britons, the two probed slots.** Had `for-ai.j` still been driving
them they would have reported like the rest. **So there was no contention, and
the test was clean in that respect** — it simply produced no `.ai` output.

### 16.3 The "five silent factions" fully dissolve — no bug

Silent: Franks, Britons, West Rome, East Rome, North Rome.

* **West / East / North Rome** — the owner plays the **Huns**, a barbarian.
  `AI_Say` routes through `AI_BroadcastAllies`, so Roman reports are correctly
  invisible to an enemy. That is the **round-4 information-leak fix working
  exactly as designed** (§11.4), not a fault.
* **Franks, Britons** — the probe's own disable, §16.2.

All five are accounted for with no defect. What this *did* expose is an
instrument problem: a playtester in a Roman seat sees no barbarian report and
vice versa, and that blind spot was not stated anywhere. The startup line now
says so — *"you see reports from your ALLIES only. Type -aispy to watch every
faction"* — because an instrument has to explain its own blind spot. This is the
third instance of the same lesson (guards matching past `endfunction`; probes
that cannot fire; a measurement that cannot separate AI from human).

### 16.4 The actual probe result: reading (1), and S9 stays open

**No `RESULT` lines and no output of any kind from the `.ai`.** The map script
ran fine (its roster printed), so the failure is specifically in the engine path:
the script never loaded, or never reached its first statement. **Nothing is
recorded about `CreateCaptains`** — S9 remains completely open.

### 16.5 The hardened probe

Rebuilt so reading (1) can never be silent again:

* **Map-script side** (guaranteed to run): an unmistakable
  `[S9 PROBE BUILD]` banner, a **corrected roster** stating that FoR-AI is *not*
  playing the probed factions, `slot`/`controller`/`forAI` reported for each
  probed player **before and after** the change, a line per `StartMeleeAI` call,
  and a **25-second silence detector** that states in words what "no green S9
  lines" means.
* **`.ai` side**: four checkpoints — **1** the first statement that can produce
  output, before any AI call at all (this alone separates "never loaded" from
  "loaded and did nothing"); **2** after `InitAI()`; **3** after
  `CreateCaptains()` with the group size; **4** after the first captain tick.
* **`InitAI()` is now called**, which the round-7 probe omitted. Every working
  example opens with it — the World Editor's generated template and
  `common.ai`'s own `StandardAI` — and it sets `ai_player = Player(GetAiPlayer())`
  and zeroes `sleep_seconds`.
* **The leading hypothesis is now a labelled experiment**: `StartMeleeAI`
  plausibly requires a **computer** player, and this map sets all twelve slots
  `MAP_CONTROL_USER` (`war3map.j` line 9409 onward), so an empty slot is not an
  AI player at all. The probe calls `SetPlayerController(Player(N),
  MAP_CONTROL_COMPUTER)` before `StartMeleeAI` and reports the controller either
  side. `for-ai.j` never needed this because it issues orders from the map
  script; the engine AI needs a player to attach to.

Gates: `pjass common.j common.ai probe*.ai` → Parse successful; probe map script
clean in full mode; `validate-map` 191/192 identical; both `.ai` members verified
**on disk** in the packed archive. Artifact sizes for identification — playable
**19,026,065**, probe **19,035,727**.

**Stage 3 remains unbegun.**

---

## 17. Playtest 7 — S9 IS ANSWERED: the engine AI runs on this map

Owner: *"Works with Computer slots. They just move their siege towers around
though."* Green probe output confirms captains reached **staging**.

### 17.1 The blocker was the controller, and it is one call

The map sets all twelve slots `MAP_CONTROL_USER` (`war3map.j` 9409+).
`StartMeleeAI` attaches the AI VM to a **computer player**, so there was nothing
to attach to and the `.ai` failed **silently** — no output at all, before any AI
call. Adding `SetPlayerController(Player(n), MAP_CONTROL_COMPUTER)` before
`StartMeleeAI`, and changing nothing else, made the same script load, run
`InitAI`, return from `CreateCaptains`, and reach staging — **with no halls, no
gold mines and no workers**.

So §S9's unproven half is now proven: **the engine AI subsystem runs on Fall of
Rome.** `for-ai.j` never needed this because it issues orders from the map
script; the engine AI needs a player to attach to.

This is recorded as a correction in `docs/reference/wc3-map-ai-decompositions.md`
§12, because it may be the broadest thing this project has found: the
decomposition measured 82 of 5,350 archived maps referencing any AI native and 0
of the top 70 hosted maps driving one, and read that as the subsystem being
unattractive. The likelier reading is now that **custom maps are user-controlled
by default, the failure is silent, and the one-line fix is written down
nowhere.** The 94 `"map.ai"` call sites naming a file absent from every archive
fit that reading exactly — nobody got far enough to notice their AI was not
running.

### 17.2 The captain has the leftovers, not the army

*"They just move their siege towers around"* is the `RemoveGuardPosition` tax
the decomposition measured at 61 call sites in AMAI: preplaced units hold guard
positions and will not join a captain until those are cleared, while unguarded
units join freely. **No conclusion about captain quality is available yet** —
it is currently being judged on siege engines.

The clean fix is that **`RemoveAllGuardPositions(player)` is a native of
`common.j`**, the *map-script* VM. So the probe clears a whole faction in one
call, from the VM where pjass gates it against the real API. It repeats on a
10 s timer, because the captain re-issues guard positions underneath itself;
that repetition is AMAI's clear-order-restore handoff without the per-unit
bookkeeping.

> **CORRECTION (research brief 3 / README correction 2).** An earlier version of
> this section said `RemoveGuardPosition` was "missing from the 2003 ROC-era
> `common.ai`" and implied a version difference. **That was a category error.**
> The guard-position natives belong to the map-side `common.j` interface and
> always have, classic copies included; they were never expected in `common.ai`
> at all. The jassdoc `common.ai` we have is fine — we looked in the wrong
> file. The fix above is right; the reason given for it was wrong.
>
> Also from brief 3: the shipped World Editor help says guard positions
> **exclude heroes and peon-type units**, and *exact captain exclusion remains
> unknown* — so clearing guards is necessary but not proven sufficient to make
> a captain take a given unit.

### 17.3 `I2S` returns an empty string in the AI VM

Playtest 7 printed `"group size , readiness  at s"` — three numbers, all blank.
`I2S` is declared as a native in `common.j`, so **pjass accepted it**; the AI VM
parses against `common.j` without implementing all of it at runtime. Same family
as `B2S`, one layer deeper: **declaration is not availability.**

The probe now converts integers itself, using only integer arithmetic and string
concatenation — both demonstrably working, since the surrounding text printed —
and carries a **canary** line printing `2026` both ways, so the next run settles
`I2S` rather than leaving it inferred.

**This is the third half-silent instrument** (guards matching past
`endfunction`; a measurement that could not separate AI from human; now numbers
that do not print). The pattern is consistent enough to state as a rule: *every
instrument needs a test that it can speak, not merely that it can be built.*

### 17.4 Where this leaves the architecture decision

The honest position, unchanged from what should be given to the owner:

* the engine path is **possible** — proven;
* its first observed behaviour is **poor** — the captain has the leftovers;
* the guard-position fix is the difference between those two statements.

One more probe run answers whether a captain **holding a real army** gathers,
moves, arrives, retreats, or reports `CaptainIsHome` — and that is the evidence
S1/S3 should turn on. **Stage 3 remains unbegun.**

Artifact sizes for identification: playable **19,026,065**, probe
**19,038,147**.

---

## 18. Stage 3 / S1 — attacks as procedures with interrupt flags

Owner authorised stage 3. S1 landed first; a build is available before S3.

### 18.1 What changed

An **attack** (EXPAND or SIEGE) is now a **mission**: chosen once, then run to a
terminal state **without re-scoring**. `AI_MissionTick` holds the think tick
while a mission runs, so the goal layer only chooses again when no mission holds
it. Everything else — defend, retreat, consolidate, tech — keeps per-tick
scoring, which is what preserves Guard B: **DEFEND and RETREAT still win by
score**; the flags only make an abort immediate instead of waiting out the dwell.

**Interrupts are flags, not scores.** `AI_SetFlags` sets `ai_ifThreat` and
`ai_ifRetreat` from the world model each tick; any one of them ends the mission
and returns control. They never compete with each other or with a goal score.
`ai_ifStuck` is raised by a failed march. **S3's threat field is designed to
drive exactly these** — the plumbing exists for it rather than being bolted on
afterwards.

**Deadlines back all three possibility gates.** A staging phase past
`AI_MS_STAGE_T` **releases into the march** (FormGroup's "send anyway after
60 s"); a march past `AI_MS_MARCH_T` **aborts and raises the stuck flag**. This
is the more robust construct, exactly as argued: a possibility gate must know in
advance what makes a goal impossible, and we have shipped three and found a
fourth unanticipated impossible state each time. A deadline does not predict —
it notices nothing happened.

### 18.2 One deliberate deviation from the corpus, and why

The corpus stages by **holding** the army until the group is full. **We do not.**
Six rounds of playtests on this map have produced one dominant failure — armies
standing still — and a staging hold is a new way to stand still. The phase
exists and carries the deadline; it just marches while it gathers. Recorded as a
deviation rather than an oversight.

### 18.3 The order economy improved, as S1 promised

| policy | peak/tick | mean/second |
|---|---|---|
| round 1 (no dedup, in step) | 1705 | 880.0 |
| round 2 (dedup + slice + phase) | 204 | 55.3 |
| round 3 (+ raid, hero, lanes, naval) | 234 | 79.3 |
| **S1 (missions: order and sleep)** | **234** | **74.4** |

**6% fewer orders per second**, and the trace now *asserts* the improvement
rather than assuming it — a blocking-procedure model that issued more orders
would mean the rewrite had not paid for itself, and we should learn that from
the trace rather than a playtest. Peak is unchanged because it is set by the
per-tick slice budget, which S1 does not touch.

### 18.4 Everything dearly bought, still green

All verified at this commit: **Guards A and B**; all three possibility gates
(mass, gold floor, tech-on-no-money); the **unconditional idle floor**, still
*under* the decision layer rather than folded into the state machine; objective
completion expiring claim, dwell and progress tracker; centroid validation and
cargo-not-position. `AI_NavIdle`'s guard is now **stronger** than before — it
asserts NavIdle sits after the `endif`, i.e. it runs whatever the goal is *and*
whatever the mission is doing.

Trace **319 assertions, 0 FAILs**, including 11 new S1 assertions with a
negative control (with no flag and no deadline the mission must persist —
otherwise the four abort assertions would pass simply because everything
aborts). `validate-map` 191/192 identical; `npm test` 617/0.

**The playable build still contains no engine-AI calls** — S1/S3 and S9 stay
unentangled, as instructed. Playable **19,027,426**, probe **19,038,147**.

### 18.5 S3 — next

Cluster-and-project army tracking with a continuous threat field: cluster at
1500, keep centroid/velocity/strength, project three ticks, score towns
`Σ strength / dist^0.8` floored at 600 with horizon 3000, and override distance
entirely when an army is heading at you within 23°. It feeds `ai_ifThreat`
directly. **Not started at this commit.**

---

## 19. Stage 3 / S3 — the threat field, and what the research changed

Read `docs/reference/ai-research-2026-08/README.md` and `brief-04-amai.md §4`
before implementing. **The description I was originally given was wrong in ways
that mattered, and the brief was right to stop the transplant.**

### 19.1 Acted on

**S3 is implemented as ours, with AMAI as a shape reference only.** Verified
against the pinned revision, the original has no velocity (one-sample
displacement, no time normalisation), no multi-tick projection, and three
apparent defects. All three are avoided by construction and each is pinned by a
trace assertion:

| AMAI defect | ours |
|---|---|
| builds the absolute point `C+3D` then hands it to a helper that **normalises it as a vector**, so heading is contaminated by distance from `(0,0)` | the projected point is `F = C + AI_TF_PROJ·D` and is **never normalised**. Trace asserts translating the whole world 20,000 units leaves the threat identical (214.9779 vs 214.9779) |
| army loop tests `town_owner[i]` where `i` indexes **armies** | `AI_ThreatField` indexes towns by the **town loop** |
| conditional maximum, then an **unconditional** assignment lets the last town win | a real maximum; trace asserts the nearer town wins over the later-processed one |

**The relayed constants were wrong and are corrected**: `540·S/d^0.8`, `d`
floored at **1000**, counted only within a **2000** horizon — not floor 600 /
horizon 3000. The heading override needs **both** `|angle| ≤ 0.4 rad` **and**
current distance shorter than the whole last displacement; each half is pinned
separately, because that was the specific thing mis-relayed. Angles are compared
as **cosines** against `cos(0.4)`, so there is no trig at all.

**Fog honesty preserved, deliberately.** AMAI is strategically omniscient —
global `GroupEnumUnitsOfPlayer` per player, with only *aggregate strength* fuzzed
at low difficulty. Ours seeds clusters **only from `ai_ptDef`**, the observed
enemy strength this player has already seen under the `IsUnitVisible` contract.
A source guard asserts there is **no global enumeration** in the tracker. Copying
AMAI wholesale would have silently switched on information cheating we have kept
behind an unbuilt dial.

**S1 × S3 compose as designed**: the field sets `ai_ifThreat`, which is the
interrupt the mission layer already consumes. The plumbing was built for it
rather than bolted on.

**The Schmitt trigger is already correct.** Brief 5 distinguishes a two-threshold
trigger from a timer, noting a timer alone only changes the *frequency* of
oscillation. Our incumbency bonus is added to the **incumbent**, so switching
`i→j` requires `U(j) > U(i) + 0.12` and switching back requires the mirror —
activation and deactivation thresholds differ by `2H = 0.24`. That is a genuine
Schmitt trigger; the 9 s dwell sits on top of it. Now pinned by a guard.

**Two corrections to our own record**, both made where the wrong claim lived:

* `RemoveGuardPosition` was **never missing from an old `common.ai`** — it is a
  map-side `common.j` native and always has been. Our "version difference" note
  was a **category error**; §17.2 now says so. The fix was right, the reason was
  wrong. Brief 3 adds that guard positions **exclude heroes and peon-type
  units**, and exact captain exclusion is still unknown — so clearing guards is
  necessary, not proven sufficient.
* The controller requirement **is documented** (World Editor help; stock
  `Blizzard.j` gates on it). Narrowed in the decomposition doc to the defensible
  claim: what appears novel is the **runtime conversion of an
  already-configured user slot immediately before `Start*AI`**.

**Hazards recorded, not yet hit:**

* **`SuicideOnPlayer` crashes Reforged on maps with a dimension ≥ 256.
  Fall of Rome is 480×480.** We do not call it. If captain work ever reaches for
  a player-target wave, it will take the game down — **use point targets only**.
* **Captain calls are reported to freeze when the AI owns no structures.** Our
  probe proved the VM *launches* without halls or workers, but launching and
  being safe to command are different states. Model them separately:
  `VM_READY` then `CAPTAIN_READY`.

### 19.2 Judged NOT to apply

* **The unsafe-native list (`I2S`, `SubString`, `ForGroup`/filters/`boolexpr`)
  is an AI-VM restriction, not a map-script one.** `for-ai.j` runs in the
  map-script VM, where callback enumeration demonstrably works — it is the
  backbone of every world scan across seven playtests. The finding applies to
  `probe.ai` only, which already uses no group enumeration. The `I2S` fix
  already shipped there.
* **The `FirstOfGroup`/`GroupRemoveUnit` pattern** is the right AI-VM
  workaround and the wrong map-side change; adopting it in `for-ai.j` would be
  a rewrite of working code to satisfy a constraint that does not apply.
* **Six thread slots per AI player, never recycled** — relevant only to `.ai`
  code. `probe.ai` starts no threads.

### 19.3 Numbers

Trace **338 assertions, 0 FAILs** (was 300 before stage 3; +11 S1, +10 S3, +17
guards). Order economy unchanged by S3 — it adds no dispatch:

| policy | peak/tick | mean/second |
|---|---|---|
| round 1 | 1705 | 880.0 |
| round 2 | 204 | 55.3 |
| round 3 | 234 | 79.3 |
| **S1 + S3** | **234** | **74.4** |

Guards A and B green; all three possibility gates green; idle floor still under
the decision layer; `validate-map` 191/192 identical; `npm test` 617/0. The
playable build still carries **no engine-AI calls**. Playable **19,031,050**,
probe **19,038,147**.

---

## 20. Outcome telemetry — making the verdict machine-readable

Research brief 8 §5. **The problem**: for eight rounds every verdict came from a
human reading chat and typing it back. That is why "barbarians seem less active"
cost a round, and why a before/after table compared two different games and
credited the **human's** conquests to the AI.

### 20.1 Schema

`FORAI|<ver>|<seq>|<t>|<event>|<fields…>|<checksum>` — pipe-delimited, one line
per **state transition**, monotonic `seq`, running `StringHash` checksum so
truncation or duplicate extraction is *detectable* rather than silently
producing a plausible wrong answer.

| event | fields | answers |
|---|---|---|
| `run` | seed, **AI-slot bitmask**, handicap, game length | reproducibility, and **which factions to exclude** |
| `ctrl` | point, kind, old owner, new owner, oldAI, newAI | **the scoreboard** |
| `exit` / `home` | faction, isAI, army value, distance | **did it leave its own city** |
| `obj` | faction, isAI, point, kind, owner, score, value, army, capReady, goal, posture | decision quality |
| `mis` | faction, isAI, start/end, reason, target | stalls, S1 terminal states |
| `gate` | gate, old state, new state, owner | gate semantics |
| `emb` / `dis` | faction, isAI, target | naval utility |
| `hero` | faction, isAI, withdraw, hp% | permanent-loss policy |

Adapted from the brief's baseline to what this map *has*: no `region_entered`
(we have no region graph) and no `alliance_changed` (the AI ignores the map's
temporary-alliance mechanic). Not inventing events for mechanics we do not
implement.

`run` carries the **AI-slot bitmask** and every faction line carries `isAI`,
which is the specific defence against the mistake that produced the wrong table.

### 20.2 Channels — designed around the brief's warning

The stock W3MMD emitter elects only `MAP_CONTROL_USER` slots while our AI
factions are computer-controlled, so a stock integration may emit **nothing** in
the configuration we run. So the **primary channel is `PreloadGenEnd`** — a
map-side file write to `forai-events.txt` that does not depend on emitter
election at all — with a **chat channel** (`-ailog`, default **off**) as
fallback. Both carry the *identical* schema, so one parser reads either. The log
is **rewritten** in full on each 20 s flush, so a partial write is always a
prefix-complete snapshot.

`I2S` is not used: `AI_Num` is our own converter, per the four independent
reports and our own observation.

### 20.3 Diagnostics only

The observer reads **ground-truth** ownership — correct, because it is an
observer producing a record, not a player making a decision. `tel_*` is written
by the emitter and read by nothing else, and a source guard asserts **no scorer
reads `tel_owner`**. Emission is not dispatch: a guard asserts the emitter
issues no orders, and the order economy is unchanged at **234 peak / 74.4 mean**.

### 20.4 The parser

`parse-events.py <log>` prints territory per faction **excluding non-AI slots**,
whether each AI faction ever left home and when, first objective with its score
components, and mission outcomes with stall counts. `--csv` writes a territory
timeline. `--selftest` runs a synthetic log end to end and **negative-controls
the integrity checks**: a deleted line must be reported as truncation, and a
doubled log as duplicate extraction. Both fire.

If no `run` event is present it says so and warns that the human's faction
**cannot** be excluded — refusing to produce the confident wrong number.

### 20.5 The smoke test is NOT done, and it is the gate

Brief 8 makes a five-minute all-computer smoke run the release gate for the
channel. **It requires the game and has not been run.** What is verified
headlessly: every native exists in `common.j`; the module compiles in full-mode
pjass; the schema round-trips through the parser with both integrity controls
firing. What is **not** verified: that `PreloadGenEnd` writes the file under
Reforged 2.x, and where. The fallback is already built (`-ailog`) and needs no
code change if the file channel fails.

**What to run**: a match, then look for `forai-events.txt` (Warcraft III
install or `CustomMapData`); if absent, `-ailog` and capture chat. Either output
feeds the same parser.

Playable **19,036,091**, probe **19,048,128**. Trace **348 assertions, 0 FAILs**.

---

## §21 The external audit, verified — and the first telemetry-driven round

An external model audited the branch at `0a88c1d` and reported seven defects.
This repo's doctrine is that another agent's report is not a fact, so every
one was checked against the source before anything was changed. The verdicts,
with the evidence, are below. Then the telemetry shipped in `8d0e5ee` landed
in the owner's hands and **confirmed defect 4 from runtime data**, which
reordered the whole queue.

### 21.1 Verdicts

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | S3 threat field is inert — displacement is always zero | **CONFIRMED** | `for-ai.j` `AI_TrackArmies`: the only writes to `ai_clDX/ai_clDY` are `= 0.0` in the new-cluster branch. The merge branch never writes them, and the cluster set is rebuilt from index 0 every call, so no value survives between calls. `AI_ThreatOn` therefore always sees `dl = 0`: the heading override cannot fire and `dfut` collapses to `dcur`. The comment above the write promises "displacement measured against the nearest OLD cluster centre" — that code was never written. `trace.py`'s `threat()` helper injects `dx, dy` straight into `env['ai_clDX']`, so the tests exercised a state production can never reach. **The fourth instance of the instrument-failure family.** |
| 2 | A remote threat produces no remote defence | **CONFIRMED** | `AI_ThreatField` computes `wm_townIdx` (which of our points is most threatened). Its only reader is `AI_SetFlags`, which uses it to raise a boolean. `AI_Execute`'s `GOAL_DEFEND` branch sends the army to `wm_threatX/Y`, which `AI_ScanWorld` derives from a `GroupEnumUnitsInRange` centred on `ai_homeX/Y` with `AI_HOME_R`. So a threat against a distant holding raises the flag and then sends the army home. |
| 3 | Registries go stale | **CONFIRMED** | The map's own `Trig_Open_*`/`Trig_Close_*` call `ReplaceUnitBJ` at eight sites in `war3map.j`, which removes the unit. `AI_GateEnum` caches handles once at init. `AI_GateState` returned `AI_GS_GONE` for a dead or removed handle — so a gate the human had just **closed** read to us as a breach, inverting Guard A in the direction that walks an army into a shut gate. Points are *not* replaced (`SetUnitOwner` preserves the handle, and the map never calls `RemoveUnit`), so the claim is specific to gates. |
| 4 | `ai_ifStuck` has no reader; abort does not clean up | **CONFIRMED, then confirmed again by the live log** | `ai_ifStuck` had exactly one writer (`AI_MissionTick`, the march-deadline branch) and one reset, and no reader anywhere. `AI_MissionAbort` cleared `ai_msState` only. See §21.3. |
| 5 | Naval is not a ferry | **CONFIRMED in substance** | `AI_FindShip` returns the first ship the enum yields, not the nearest to the army or the crossing. `AI_CountLoaded` counts **all** of our loaded units map-wide, so the sail gate can fire while nothing is aboard the chosen ship, and the "cargo ashore" test is equally global. There is no capacity model and no second trip: one boat, one crossing, and anything left behind is left behind. |
| 6 | The fog contract is inaccurate | **CONFIRMED — and the owner should be told plainly** | `ai_ptOwner[]` is written by `AI_RefreshPointMemory` under the `IsUnitVisible` guard and **never read**. Every consumer — `AI_TargetScore`, `AI_CapitalTarget`, `AI_RaidTarget`, `AI_MissionTick`, the world scan — calls `GetOwningPlayer(ai_pt[i])` live, which works through fog. So: **observed enemy STRENGTH is fog-honest, territorial OWNERSHIP is not.** The map publishes per-faction control-point *counts* to everyone on the `udg_CPs8` multiboard, so the aggregate is public; per-point ownership is not, and we read it anyway. This is not resource cheating, and `AI_HANDICAP` is still 1.0 — but "fog respected" was too strong a claim and the S3 header comment ("Fog-honest by construction") overstates what holds. |
| 7 | Order acknowledgement is cached intent | **CONFIRMED** | `AI_TryOrder` writes the intended order into the hashtable **before** issuing it, and discards the boolean returned by `IssuePointOrder`/`IssueTargetOrder`. A refused order is remembered as issued, and `AI_NeedsOrder` then suppresses retries for the whole memory window. |

Nothing was refuted. Two corrections were sent back to the auditor: its note
that no telemetry was committed predates `8d0e5ee`; and its observation that
`trace.py` was not invoked by `npm test` is correct and is now fixed
(`test/rome-ai-trace.test.js`). Adding Fall of Rome to `npm run preflight` is
**not** possible — preflight operates on committed map source directories and
this map is third-party, which gotcha 9 forbids committing.

### 21.2 Fixed this round: registry identity (defect 3)

A gate never moves, so **position plus orientation is the identity and the
handle is only a cache**. `AI_GateValid` tests the cache (`GetUnitTypeId == 0`
is the engine's own removed-unit signal), `AI_GateRefresh` re-resolves by
position when it has gone stale, and every reader refreshes first. Finding
nothing at the position means the gate really was destroyed: the entry is
nulled and `GONE` becomes honest again. A latched "stuck" verdict is dropped
along with the handle it was latched on.

`trace.py`'s new `gate_identity()` interprets the **real** `AI_GateState`
against a modelled unit world rather than the stub the routing sections use.
Its negative control is synthesised from the shipped body with the
`AI_GateRefresh` line deleted, and it fires; it also fails loudly if that line
ever stops existing, so it cannot go inert.

### 21.3 The telemetry paid for itself in one game (defect 4)

The owner played the `8d0e5ee` build and the file channel worked. These
consecutive lines were in the first screenshot:

```
FORAI|1|161|121|mis|9|1|end|1|108
FORAI|1|162|121|mis|9|1|start|0|108
FORAI|1|163|122|mis|2|1|end|1|195
FORAI|1|164|122|mis|2|1|start|0|195
```

A mission ends and restarts on the **same target in the same second**, for
two factions, repeatedly. The auditor predicted this from the source; the log
proved it. **This is the first defect in eight rounds diagnosed from data
rather than from a human describing what a game looked like.**

Two independent causes:

1. `AI_MissionAbort` cleared `ai_msState` and nothing else, so the next tick
   re-derived the identical answer from an unchanged world. It now tears down
   target, claim, progress and commit clock, and **bars the target** for a
   hold-off graded by how the mission ended (30 s for an interruption, 120 s
   for a failed march). Clearing `ai_target` is also what lets `AI_NavIdle`
   end a crossing begun for the dead mission.
2. `AI_Execute` calls `AI_MissionStart` every tick it holds an objective, and
   `AI_MissionStart` was unconditional — so it restarted what it had just
   ended **and re-stamped the phase deadline**, disarming the one backstop
   that would have broken the loop. It is now idempotent.

The hold-off is a **discount in `AI_TargetScore`, never a veto**. A veto would
be a fifth way to make an action impossible, and every one of those we have
shipped became a state the AI could not leave.

`ai_ifStuck` finally has a reader, and a narrow one: a march that ran out its
deadline discounts SIEGE and EXPAND for exactly one decision, then clears.

`parse-events.py` gained `detect_churn()`, and its self-test drives the
**owner's own logged lines** — it flags 9/108 and 2/195, does not flag
faction 9's correct end-108-start-110, and does not flag a restart 290 s later.

### 21.4 The army never concentrated (playtest 7)

> "Ostrogoths push with half their army at base; practically true of all
> factions."

Not a tuning miss. `AI_SendArmy` sized the home garrison as a **fraction of
our own army** — `0.55 * wm_army`, ramping in on any visible threat at all —
so the bigger the army the more of it stayed home, and `wm_threat > 0` is
close to permanent on this map. "Half their army at base" was that formula,
literally. A garrison is now sized by **what it has to beat**: match the
visible threat with a margin, capped at 40 %. Doubling our own army no longer
changes it at all.

The second half is the muster. **Round 7's deviation is revisited here.** It
refused to stage on the grounds that a staging hold is a new way to stand
still — sound about an *unbounded* hold, but it left `AI_MS_STAGE` a no-op
that marched, so nothing ever gathered and there was no gathering to march
during. That is why four factions were reporting a scattered centroid every
tick. The version of the argument that survives the evidence is a **bounded
muster**: gather at a rally point on our own ground between home and the
objective, release when enough has *arrived* (measured by a real enum, not
assumed), and let the existing phase deadline guarantee it leaves anyway.

The `regrouping` line itself was also wrong. `AI_ValidateField` is a per-tick
correction, not a state — and `AI_Say` only suppresses an *immediate* repeat,
so alternating with any other line let it through again. It narrated a
permanent condition as an event, four factions at a time. It now fires on the
**edge**. So: **regrouping was never a state and therefore never a trap** —
the trap-shaped thing was the army split that made the centroid invalid, and
that is what the muster and the garrison fix address.

### 21.5 The opening belongs to the barbarians (playtest 7)

> "Early Barbarians should be extremely aggressive."

`AI_UpdatePosture` tested `wm_army < 260 + 240*clock` **before anything else**
and sent the faction to `POSTURE_CONSOLIDATE`. Early game a barbarian army is
always under that ramp, so the factions whose entire premise is arriving
before Rome is ready spent the opening massing. Hence Rome 25/34/24 against
barbarians on 2–4.

There is now an opening window (`AI_EARLY_T`, 420 s): EXPAND posture, commit
threshold down (`AI_EARLY_COMMIT`), and it moves out on 45 % of its army
instead of 70 %. It is **a posture with a clock** and expires on its own, so
it cannot become another state the AI can never leave. The negative control
is the same faction with the same army after the window, which consolidates.

### 21.6 Voice (playtest 7)

Four voices — horde, tribes, Rome, Persia — on the high-traffic goal and
posture announcements, plus a humanised rewrite of the twenty situational
lines. Presentation only: no decision changes and no information is added.
Both hard constraints are **asserted rather than trusted** — no voice helper
is reachable from `AI_Tel` and no `AI_Tel` site interpolates a readable name
(11 sites checked), and `AI_Say` still routes through `AI_BroadcastAllies`
gated on `ai_talk`, so `-aispy` and the scoping are unchanged.

Two harness findings fell out of the pass and are worth more than the prose:

* A round-3 source guard over a real invariant was keyed on the chat text
  `"moving on ..."`, so renaming a line failed it **for a cosmetic reason**.
  Source guards must key on structure, never on player-facing text — that
  text is meant to change. Rewritten with the bounded `(?!endif)` form and
  negative-controlled both ways.
* `jass_expr_to_py` rewrites `and`/`or`/`not` textually without respecting
  string boundaries, so a returned **string** containing one of those words
  comes back with altered spacing. Harmless for every numeric and boolean
  path, but no assertion may compare a voiced line for equality. Recorded in
  `voice()`'s docstring.

### 21.7 Still open, in order

1. **Defect 1** — S3 displacement is dead code. The fix must include an
   assertion that fails **if displacement is always zero over a run**, so the
   dead-code state is itself detectable rather than merely fixed.
2. **Defect 2** — remote threat must produce remote defence (`wm_townIdx` is
   already computed and already correct; nothing consumes it).
3. **Defect 5** — the ferry: nearest ship, per-ship load accounting, capacity,
   and a second trip.
4. **Defect 7** — order acknowledgement: record intent only on a `true` return.
5. **Defect 6** — decide deliberately whether to *fix* the ownership read
   (route it through `ai_ptOwner`, accepting a stale map) or to *restate* the
   contract. Either way the claim in the S3 header must stop overstating.

Deferred behind all of it, unchanged: the cheating dial (§12.3, two separable
knobs), theatres, counter relationships, control points as explicit income,
and the temporary Roman–barbarian alliance.

Playable **19,044,140**. Trace **436 assertions, 0 FAILs**; `npm test` 620
pass; preflight 7 maps 0 FAIL; validate-map 191/192 with 152 warnings, which
is parity with the unmodified map.

---

## §22 Playtest 8 — "they can't get out of their camps"

Third venue for one failure: round 3 was armies stacked behind their own city
gate, round 5 was Gray piled on a bridge, round 8 is barbarians sealed inside
their camps. The first two fixes addressed the venue. This one had to address
the class — and the class turned out not to be what the venue suggested.

### 22.1 What the camp perimeter is actually made of

Measured from the map, not assumed. Seven camps (`h002`), owned by players
0, 1, 2, 4, 6, 8 and 11, all share one layout:

| type | count per camp | radius | what it is |
|---|---|---|---|
| `B001` | 16 | 850–1090 | custom destructable, **"Pathing Blocker 8"**, derived from `YTpc`, `bptx = PathTextures\8x8Default.tga`. Invisible. |
| `D01J` | 16–18 | 850–1090 | the palisade fence **art** |

**Hypothesis A is refuted on the artifact.** The perimeter is not a gate and
not a wall: there is nothing to register, nothing to open, and nothing worth
breaking. It is also **not sealed** — the Franks ring has gaps of 49° and 67°,
about 770 and 1050 world units wide, and the engine paths through them
without help.

Two consequences worth keeping: `IsTerrainPathable` reads **terrain** pathing
and is blind to destructable-applied pathing, so the corridor and lane model
cannot see a palisade at all; and the gate registry is correctly scoped to the
twelve city-gate unit types, because those are the only openable things on the
map.

### 22.2 The actual cause — and it was mine

`AI_SendEnum` dropped every `AI_ORD_MOVE` order whose destination was within
**`AI_HOME_R` (2500)** of the unit. That guard is round 5's, and its
*invariant* is right: a unit already standing in the home neighbourhood should
not be told to go home. But it was implemented as a **general arrival
tolerance**, and nothing before this round ever asked the army to move a short
distance.

The muster I shipped last round puts its rally at `AI_MUSTER_OFF` = **1200**.
A camp is about 950 across. So every unit was within 2500 of the rally and
**every muster order was cancelled before it was issued**. The army was not
trapped behind the palisade. It was never told to leave.

**This is a regression I introduced, via a guard written three rounds
earlier** — the coordinator's hypothesis B was right that the muster caused
it, wrong about the mechanism (the rally is *outside* the palisade; the order
to reach it was suppressed). Hypothesis C was right in spirit: the failure is
that a bare move order was produced and reached nobody.

The fix separates the two ideas that had been conflated:

* `AI_ARRIVE_R` (400) — how close counts as **arrived**.
* `AI_HOME_R` (2500) — the home **neighbourhood**, unchanged.

The round-5 suppression is now scoped to a destination that *is* home, and
general arrival uses the arrival tolerance. A rally that lands on unwalkable
terrain falls back to home, because round 7 already proved computed points on
this map land in open water often enough to matter.

### 22.3 The general form

The coordinator asked for the class, not the venue. The invariant that would
have caught all three venues is not about walls at all:

> **An army ordered somewhere it is not must receive orders. A dispatch that
> issues nothing is never correct.**

`trace.py` `perimeter()` sweeps `AI_SendArmy` over eight ranges from 500 to
12000 with an army standing inside a camp ring and asserts that none of them
goes silent. Its negative control restores the pre-fix guard and shows the
sweep going silent at exactly `AI_MUSTER_OFF` — so the sweep detects the
class rather than merely passing over it. The control also documents why the
bug read the way it did: the pre-fix body is silent at 500/900/1200 but *not*
at 1800, where the far side of the camp is already beyond `AI_HOME_R` of the
destination. That partial silencing is the "few stragglers outside" in the
screenshot.

The garrison hold is explicitly distinguished from this failure: it may
reduce a dispatch, never silence it, and the sweep asserts that even a
threat of 100000 leaves some of the army ordered.

A source guard now forbids the regression **by name**: `AI_HOME_R` may never
again appear as the arrival tolerance for a MOVE order.

### 22.4 Note on the regrouping line

It appears once in this playtest rather than repeatedly, which is what §21.4's
edge-firing fix predicted. Not the old problem.

Playable **19,045,571**. Trace **448 assertions, 0 FAILs**; `npm test` 620
pass; validate-map 191/192 with 152 warnings (parity).

---

## §23 Playtest 9 — the army arrives but does not fight properly

Three complaints, two root causes, and one subsystem the research named that
we had skipped.

### 23.1 "Not with their entire army… they seem not to move berserkers"

The type symptom named a filter, but the filter was not a type test.

**From the map**: "Barbarian Berserker" is **six rawcodes**, one per barbarian
faction, all cloned from `hfoo` — `h006 h00Z h013 h014 h016 h021` — with 24
preplaced each. All six are already in `AI_BaseCost` (heavy melee, 100 gold),
so they were valued correctly and never type-excluded. **Hypotheses A, B and D
are refuted on the artifact**: no whitelist, no morph lineage, and no
ability-keyed skip anywhere in the order path (they carry `Adef`/`Absk`, and
nothing in our code reads an ability).

**The cause was enumeration order against a fixed budget.** The Franks field
70 units in their camp. In creation order — which is enumeration order — slots
0–23 are the camp, hero, two `h011`, some `n001`, and twelve `h01I` spearmen.
Their twelve `h013` berserkers occupy **slots 24–35**. `AI_ORDER_SLICE` is
**24**. Every berserker sat one slot past the cut-off, every tick, forever,
because `AI_NeedsOrder` returns true for any idle unit — so the prefix
re-consumed the budget and the tail was never reached.

**Head-of-line starvation: a fixed budget over a stable enumeration always
serves the same prefix.** Both halves of the complaint, one cause. Hypothesis C
was the closest — the garrison *is* type-blind, but it was the slice, not the
hold, doing the selecting.

The slice now **rotates**: same orders per dispatch, different units, every
unit reached within `ceil(n / slice)` dispatches. The order economy is
unchanged *by construction* — rotation changes which units are ordered, never
how many (peak 234, mean 74.4, both unmoved).

### 23.2 "They block themselves"

`AI_LaneOf` produced **five** destination points for seventy units, so
ordering the army anywhere piled it fourteen deep at the first constriction.
A formation **slot** now replaces it — lane across the march line, rank back
along it, dealt inside-out so the formation grows around the objective instead
of queueing into it. That is brief-05 §3 (Pottinger), and it is the trail
screenshot.

### 23.3 "Cooperating factions blocking one another" — the missing subsystem

The stall detector was **right**: `Britons: this is going nowhere. calling it
off` is a correct observation of a real condition. The condition was friendly
congestion, and we had no representation of it.

The ally ledger claims **objectives**. Two factions with *different* objectives
down one trail read as **no conflict at all** — precisely the hundred-unit jam.
So two things were added, and deliberately kept apart from the threat field
(brief-05 §1 is explicit that merging them is the wrong shape):

* **Corridor claims** — a coarse cell grid, claimed along the route when an
  army is dispatched, with a **45 s lease** because a corridor is busy only
  while someone is walking down it. A busy trail makes a target dearer
  (`AI_CORR_PENALTY`), never impossible. Sampling starts at the *second*
  sample: the origin cell is where the army already stands, and claiming it
  would mark every route out of one home as busy, which prices nothing because
  it prices everything equally.
* **Congestion** — a count of *friendly* bodies (own **and allied**, since
  allies were the crowd) near a point, consulted when placing a rally, which
  slides one step along the march normal rather than gathering a second army
  on top of the first. One step only: hunting for perfect ground is how a
  muster becomes a way of standing still.

An **enemy** on our corridor is explicitly not a congestion problem — that is
the threat field's job. The separation is asserted in both directions.

### 23.4 The general forms now enforced

Three, cumulative across rounds:

1. A dispatch that issues nothing is never correct. *(§22)*
2. Every mobile unit lands in exactly one census bucket — dispatched,
   garrisoned, or excluded with a reason. **There is no silent fourth
   category**, and "the berserkers just stand there" *was* one.
3. No two units are ordered to the same point, and no two allied armies hold
   one corridor at the same time.

All three are code, not comment: the census is a real per-reason tally in
`AI_SendEnum`, and it feeds the telemetry.

### 23.5 Telemetry

The `exit` event now carries committed / garrisoned / unreached counts and
values, so the parser prints **"committed 34% (24 units); garrisoned 6,
unreached 40"** and flags any non-zero *unreached*. The owner's "not with
their entire army" is now a number rather than an impression.
Negative-controlled: an `exit` event without the census fields must report no
percentage rather than invent one.

### 23.6 Harness fidelity

The slot helpers are written `R2I(I2R(a)/I2R(b))` because **JASS integer
division truncates and `trace.py` evaluates this source as Python, where `/`
does not**. That mismatch already cost this project one bug (`AI_LANE_MID`);
it is now impossible in the formation code, and the reason is in the source
where the next person will see it.

Playable **19,051,594**. Trace **472 assertions, 0 FAILs**; `npm test` 620
pass; validate-map 191/192 with 152 warnings (parity); order economy peak 234
/ mean 74.4, unchanged.

---

## §24 Playtest 10 — the gate, the muster that never completed, and the chorus

### 24.1 "Romans open gates for Barbarians" / "Persia should auto-open its own gate"

One rule, and it is **not** default-open:

> A faction opens its own gate **only** when it has a current need to move
> through it, and **never** while that gate faces a live threat.

Default-open satisfies Persia and destroys Rome, whose closed gate is its
single biggest structural advantage.

**Mechanism, from the source — possibility A at two sites.** `AI_ManageGates`
carried an explicit comment: *"an OWN gate on our crossing opens
UNCONDITIONALLY"*, added in round 3 on the reasoning that an army which cannot
leave while an enemy is visible never leaves. Right about **visibility**, wrong
about **contest**: round 2 refused to open for any visible enemy anywhere, and
the correction over-swung into opening the door for an army standing in it.
The second site is worse — `AI_ForceOpenNear`, the stall backstop, force-opened
the nearest gate with no check at all, so an army stalled *because* enemies
were at the gate forced that very gate open for them.

**Possibility C was half true.** A close path existed but exempted the approach
gate (`i != ap`) and required zero friendly units present — so the gate an army
left through stayed open behind it while the fight went on in the doorway.

Fixed: `AI_GateSafeToOpen` gates every open, refusing on enemy CV in the
doorway and on live threat to the city when the gate is within `AI_HOME_R` of
home — so the rule is **local**, not a global freeze. Two bars give a dead band
so a gate cannot flap. The approach gate is no longer exempt from closing, and
the close bar is no longer "no friendly units present": a gate we are *losing*
shuts even with our own troops there, because a few soldiers outside the wall
is a better trade than the wall being open. Every open is a **sortie debt**,
paid on abort, on the army clearing the gate, or on a 90 s lease.

### 24.2 The muster was never completing — and could not

The chorus of three factions emitting the release-anyway line in one second was
the tell. Measured on the real map: at mission start only **34–40 %** of a
barbarian faction's units are within the muster radius of its rally, because
the denominator was `wm_army` — **every unit the faction owns, anywhere**. The
rest garrison other holdings or are already in the field. They were never
coming. A 70 % bar was therefore **unreachable**, and the deadline was the only
exit: "concentrate before committing" was not happening at all, and every
commitment number downstream was being read on a false premise.

**Fifth instance of this project's oldest failure**: a condition that cannot be
satisfied, so the state is left only by timeout. It joins the round-4
CONSOLIDATE clock ramp, the round-5 gold floor, the round-6 TECH-on-no-money,
and the §21 abort/restart loop.

The muster is a **local** question — of the troops in this neighbourhood, how
many have closed up? — so both terms are now local: massed within
`AI_MUSTER_R`, over the pool within `AI_MUSTER_GATHER`. Twelve units on the far
side of the map no longer hold a muster hostage.

**And it is now measured, not argued.** A `mus` event carries the release
reason (0 = measured arrival, 1 = timeout) with the fraction and both terms;
the parser prints the per-faction and overall arrival share and **calls out a
timeout-dominated run explicitly**, because that ratio is the direct test of
whether the concentration work landed. Negative-controlled both ways.

### 24.3 The chorus

Three factions emitting identical text in one instant reads like a system —
the opposite of the flavour pass's purpose. Two cheap fixes, no subsystem: a
small pool per event kind varied by faction and slowly over time (9 distinct
phrasings across twelve factions per kind), and a 12 s suppression window on an
identical line from a *different* faction.

One trap avoided and worth recording: the variant must **not** draw from
`AI_Rand`. That is the map's single seeded decision stream, and spending it on
cosmetic text would fork every downstream decision (gotcha 30). The variant is
derived from faction id and coarse time instead, and an assertion enforces it —
checked against **comment-stripped** source, because the body's own comment
says "deliberately NOT AI_Rand" and a naive grep reads that as a use.

### 24.4 Still open

Visigoths' pathing (item 2 of the brief) is deliberately **not** guessed at: the
muster ratio and the commitment census now in the telemetry are the instruments
that will answer it, and both changed materially this round. The next log
should be read before any change is made there.

Playable **19,055,674**. Trace **495 assertions, 0 FAILs**; `npm test` 620
pass; validate-map 191/192 with 152 warnings (parity); order economy peak 234 /
mean 74.4, unchanged.

---

## §25 The twelve voices, built in

Implements `docs/reference/fall-of-rome-voices.md` (876 lines, `5395288`),
which is a compatible superset of the four-voice `AI_VLine` from §24.3.

### 25.1 Generated, not transcribed

600 strings across three tiers. Hand-transcribing them into JASS would be six
hundred chances to drop a variant, and the spec's §8 says the assertion that
matters belongs against the **JASS tables** rather than the markdown — which is
only true if the JASS provably came from the markdown. So
`gen-voices.py` reads the spec and emits `voices.j` (1,777 lines), `inject.py`
prepends it (JASS is single-pass; the tables must be declared before
`AI_LineA`/`AI_LineB` call them), and `trace.py` runs the generator in
`--check` mode as an assertion. Drift is negative-controlled: appending one
line to `voices.j` makes the check exit 1.

Structure: tier A per **faction** (12 × 10 kinds × 3 = 360), tier B per
**house** (6 × 10 × 3 = 180), tier C one per house per state (60).

### 25.2 The spec caught a real defect in my picker

§24.3 used `ModuloInteger(pid*7 + R2I(ai_now/17.0), 3)`. **7 is congruent to 1
mod 3**, so that term only ever distinguished `pid` mod 3 — players 0, 3, 6 and
9 always shared an index. Replaced with the spec's per-faction sequence counter
(§6.1), which also guarantees no immediate repeat. The decision to keep the
draw **out of `AI_Rand`** is preserved and still asserted: that is the
map-owned Park-Miller stream and spending it on cosmetic text would fork every
downstream decision (gotchas 29/30). The negative control pins the old form's
degeneracy directly.

### 25.3 The echo window, sized up on evidence

The spec suggested 8 slots / 6 s. Sized to **12 slots / 20 s** because the
decomposition (§3b of the spec) found that **barbarians never unally on a
timer** — the advertised 10-minute free-for-all does not exist; they only split
when one takes a Roman bribe. So an ally-scoped feed carries **nine speakers
for the whole thirty minutes**, and the window must be comfortably wider than
`AI_SAY_GAP` so a burst cannot walk out of the ring. Tier A per-faction
uniqueness already makes exact cross-faction collision **impossible by
construction**; the ring is a backstop for the shared tiers only.

### 25.4 Owner rulings recorded

* **The two unimplemented victory conditions do not matter.** The owner said so
  directly. Recorded, acted on in nothing; our design assumption (DESIGN §1.2)
  was already correct. Voice lines never promise a win on points.
* **Persia being unbribable is intentional**, and Persia is a **peer empire**,
  not a barbarian. Written that way with confidence: its own roster, two
  cities, 200 food ceiling, a flat +50/+50 stipend, and the one power Rome
  cannot put on a retainer.
* **The Saxon alliance research is a genuine artifact defect.** `R002`
  announces a temporary alliance with "the **Goths**" while allying
  `Player(2)`, the Saxons. Confirmed by the owner. **It is the map's bug, not
  ours. We do not edit the map's own text, and nobody should later "fix" our
  side to match a wrong string.**

### 25.5 What was deliberately not done

`ALLY_HELP` has strings so the table is complete, and **nothing calls them**.
The spec flags that no call site exists; adding one is a behaviour change, not
a text change, and belongs with whatever makes the AI actually ask for help. An
assertion pins that the strings exist and are unwired.

`AI_KindName` is not deepened per faction: it feeds the telemetry path, and the
spec puts it out of scope for that reason.

### 25.6 Invariants asserted

All seven of the spec's §8 checks now run against the shipped `voices.j`:
arity, cross-faction uniqueness (360 distinct), ASCII-only, apostrophe-free,
the 64-visible-character bound, voice helpers unreachable from `AI_Tel`, and no
`GetLocalPlayer`. Plus ally scoping unchanged, the picker's independence from
`AI_Rand`, and the **vocabulary table from §7** — Persia and the Visigoths use
"the host", the Burgundians "the band", North Rome denominates in time, the
Britons count the men, and the Saxons are measurably the shortest lines on the
board (mean 14 characters against the next shortest 25). The tooltip-derived
register split is enforced too: Romans never "hire" and barbarians never
"train".

Four negative controls, all firing: a duplicated line breaks uniqueness, a
dropped variant breaks arity, an injected apostrophe is caught, and the
superseded playtest-9 fallback line (69 characters) fails the length bound —
which is exactly the example the spec used to justify having the bound.

Playable **19,069,240**. Trace **512 assertions, 0 FAILs**; `npm test` 620
pass; validate-map 191/192 with 152 warnings (parity); pjass FULL clean on
17,376 lines; the playable build still carries **zero** engine-AI calls.

---

## §26 The food-cap question, and the watchdog

### 26.1 Our module is not implicated, proved positively

The coordinator escalated a suspicion that our injection timing could skip a
player in the map's ceiling loop. Four checks, none of them a text search:

1. **`udg_AllPlayers` membership cannot depend on us.** It is populated by
   twelve unconditional `ForceAddPlayerSimple(Player(0..11))` calls in
   `Trig_Player_Groups_Actions` (war3map.j 3463–3474). No slot-state test, no
   controller test, nothing we could influence.
2. **Our injection removes nothing.** Of the original 9,822 lines, **zero** are
   absent from the built script.
3. **Our hook did run early, and now does not.** `AI_Init` was appended to
   `InitCustomTriggers`, which only *creates* triggers;
   `RunInitializationTriggers` is what fires `Player_Groups` and
   `Melee_Initialization`. So `AI_Init` ran before the ceilings were set and
   before the starting 300/300 was handed out. **That could not have caused the
   observed number** — nothing we call writes player state — but initialising
   against a half-built world is fragile for no benefit, so the hook now sits at
   the end of `RunInitializationTriggers`. Recorded as hygiene, not as a fix.
4. **The module cannot write player state at all**, and this is now a standing
   assertion rather than a memory: `no_cheating()` sweeps the comment- and
   string-stripped source for sixteen resource/tech/handicap natives, checks
   every `PLAYER_STATE` access is a `Get`, and pins that the only
   world-changing calls are unit orders, one gate replace and one animation.
   Negative-controlled twice — the sweep sees `GetPlayerState` in the real
   source, and detects an injected `SetPlayerState`.

Per the coordinator, the anomaly modelling itself is dropped: the owner
reframed the system as a progression, so there may be no anomaly.

### 26.2 Artifact facts, recorded so they are not re-derived

* `PLAYER_STATE_FOOD_CAP_CEILING` is written in exactly **seven**
  `SetPlayerState` calls, all in `Melee_Initialization`: 100 for all twelve via
  `ForForce(udg_AllPlayers, ...)`, then 200 for Persia and 300 for each Roman.
  **Nothing writes one again.**
* Supply is provided by structures (`ufma`): Supply Center **+100**/**+50**,
  Roman Forum **+50**, Barbarian Camp **+50**, Roman City **+25**, Bagage Train
  **+20**, Roman Town **+10**, Roman Barracks **+10**.
* Measured starting supply: every barbarian **100** (camp 50 + supply centre
  50), **Vandals 75** (city 25 + centre 50, no camp), **Persia 150**, each
  Roman clamped to its 300 ceiling.
* Observed in play: Vandals **113/75** — usage can exceed provided supply.
* **Persia sits in the barbarian force** (`pink`), so a barbarian-side human
  sees a 150/200 ally among eight 100-cap ones.

### 26.3 The actionable half: supply is worth scoring

If capturing a settlement raises your own supply, a town is worth more to a
food-capped faction than its ground alone. **Nothing priced that** — a town
scored 0.45 against a control point's 1.00 regardless of how starved the
faction was, which is backwards for the faction that most needs one.
`AI_PointValueIdx` now adds a supply-hunger term to towns and cities, scaled by
how capped we are, so it is **inert for a faction with headroom** and cannot
distort the ordinary table.

### 26.4 The watchdog — the answer to "is there a more robust way?"

There is, and it is not another gate. Five rounds of *a goal that stays
selected while unable to make progress*, each fixed in **the same vocabulary as
the bug**, each followed by a variant nobody anticipated. Every backstop we had
— idle floor, possibility gates, mission deadlines, stall detector — is
triggered by **what the AI believes about itself**, and all five failures were
states we had not modelled.

The watchdog asks a question about the **world**: has anything about this
faction changed — territory, army size, position, health, gold, food? Two
consecutive frozen windows and the entire decision stack is bypassed: tear down
the mission, the objective and the commit clock, and attack-move the army at
the nearest enemy holding. **A modelling gap cannot defeat it**, because if the
AI is wrong in a way nobody imagined, the world still fails to change.

It reads **nothing** from the decision layer — asserted by name against
`ai_goal`, `ai_claim`, `ai_posture`, `ai_msState`, `ai_bestS`, `ai_commitAt`,
`ai_progD`, `wm_capReady` — sits above the mission and goal layers in
`AI_Think`, and cannot be suppressed by any of them.

**It is a backstop, not a strategy: every firing is a defect signal**, so every
firing emits a `wd` event carrying the goal, mission state, army, gold and
target it was stuck on. If it fires often, the decision layer is broken and the
log says so instead of the owner.

Verified against the Vandals case specifically — 0 gold, 0 lumber, 113 food
against a 75 cap, large army — it fires and produces an attack. Negative
controls: an army that is moving, taking damage, training, spending gold,
losing units, or whose holdings are changing hands **never** trips it across
six windows each.

One guard-maintenance note, the third in three rounds: the round-5 "NavIdle
runs outside the mission branch" guard was a regex pinning a *shape*, and the
watchdog branch changed the shape without touching the invariant. It is now
checked **positionally** — find the mission branch, walk to its matching
`endif`, assert `AI_NavIdle` comes after it. Guards key on structure; shapes
change.

Playable **19,072,620**. Trace **542 assertions, 0 FAILs**; `npm test` 620
pass; validate-map 191/192 with 152 warnings (parity).

---

## §27 Rome does nothing — three angles, one complaint

### 27.1 No log was supplied

Neither playtest 12 message came with a `FORAI` log, so "did any `wd` event
fire for players 3, 9 or 10?" cannot be answered from data. **Stated rather
than inferred.** The scale hypothesis is instead settled positively in the
harness, against West Rome's real holdings, which is nearly as strong and does
not depend on anyone's memory of a screenshot.

### 27.2 The watchdog was defeated by scale — hypothesis confirmed

`AI_WorldSig` asked *"has anything about this faction changed"* — territory,
army size, position, health, gold, food. Reproduced in the harness: for a
**motionless** Roman army whose empire is merely ticking over (turn income
arriving, units training), the faction signature takes **6 distinct values over
6 windows**. It could never fire. The coordinator's diagnosis was exactly
right, and this is the **fourth** measure calibrated on barbarian scale and
silently wrong at Roman scale — after the food cap (100 vs 300), the frontier
(4200 vs 18000) and the garrison (a share of a small army vs a huge one).

`AI_ArmySig` asks about the army instead: quantised **field** centroid,
bucketed **field** CV, and army health. Gold, food, territory and total army
size are excluded **on purpose** — each is precisely how a large empire
disguises a still army. Field CV rather than total army is what makes
production immune: units trained inside the home radius never enter it.

Same motionless Roman: **1 signature value across 6 windows**, and the watchdog
fires. A Roman army that is genuinely marching still never trips it.

**Four assertions were reversed, not repaired.** They previously said that a
faction training units, spending gold, or changing holdings must *prevent* the
watchdog firing. That premise is what defeated it, so the contract is now the
opposite and the assertions say so in their own output.

### 27.3 East Rome's oscillation was a self-caused feedback loop

Diagnosed from two chat lines. The recall test was
`wm_threat > AI_MS_THREAT * wm_garrison`, and `wm_garrison` is own CV **within
`AI_HOME_R` of home** — so it collapses the moment the army marches out. Army
leaves → denominator drops → ratio crosses → abort → army returns → denominator
recovers → new mission → leaves again. **The input to the decision was a
function of the decision's own output.** No threshold fixes that.

Two changes, the pair the goal layer has had since round 3 and the interrupt
path was deliberately exempted from:

1. **A stable denominator.** While a mission runs, the comparison uses the
   garrison **snapshot taken at mission start**, frozen while the army is still
   home. Departure can no longer manufacture the emergency that cancels it.
2. **Hysteresis and a commitment floor.** Start bar 1.10, abort 1.85, marching
   2.60. A threat that would prevent a start no longer aborts one in progress.

**The emergency is kept explicitly**: `wm_capThreat` — the capital itself under
assault — recalls the army at any bar. That is the case the exemption was
written for, and it is now a named branch rather than a side effect of having
no hysteresis.

The negative control is arithmetic on the same numbers: the old live-garrison
test fires where the new one does not.

### 27.4 Brytenwalda steal #1 — one constant, two gates

Its war gate is `FoodUsed >= 25` and its attack gate `FoodUsed > 25`. **The
same constant**, so a faction only ever declares a war it will immediately
prosecute. `AI_CanProsecute` is now that gate, and it guards **both** adopting
an objective (`AI_SelectGoal`, applied before the argmax so it cannot be
outvoted) and marching on one (`AI_MissionStart`). One constant, asserted to
appear once, because two numbers here would just be two more thresholds to
drift apart — which is what we have been doing for eight rounds.

It cannot deadlock: below the bar the faction picks CONSOLIDATE, TECH, DEFEND
or RETREAT, which are exactly the goals that raise field strength, so the bar
is reached by doing what the bar asks. Asserted.

Also recorded from that dossier, against our instinct to add sophistication:
Brytenwalda runs **one order per attack wave**, roughly 1–3 orders per minute
across nineteen factions, and reads as competent. Our order economy is 74/s.

### 27.5 The voices earned their keep

An eight-round-old bug became diagnosable from two sentences in a screenshot.
`back. Constantinople comes first` names the reversal and the reason; no amount
of watching an army mill about would have. **Keep the AI narrating its
reversals** — an AI that says *why* it changed its mind is debuggable in a way
a silent one is not. That is now a design constraint, not a flourish.

Playable **19,076,161**. Trace **563 assertions, 0 FAILs**; `npm test` 620
pass; validate-map 191/192 with 152 warnings (parity).

---

## §28 Pacing, from Squid Game

Its thesis, which is the point: **that map spends its complexity budget on
pacing, not on decisions**, and reads as competent while making one- and
two-bit decisions. We have 580 assertions and an AI the owner watches jog
around its capital.

### 28.1 Two bugs caught on the way in, both worth more than the feature

**A shipped infinite recursion.** My own bulk edit rewrote the two lines
*inside* `AI_OpenBudget`, so it called itself. **pjass passed it** — recursion
is legal JASS — and the trace did not see it because nothing exercised the
budget path. It surfaced only because the new measurement drove the real
function and got zero orders. A measurement that executes shipped code found
what a parser and 563 structural assertions could not.

**`AI_Rand` was degenerate in the harness.** `ai_seed / 127773` is integer
division in JASS and float division in Python, so `trace.py` was running a
sequence that repeated 0.978 forever. **Every probabilistic assertion measured
through the interpreter was reading a fake stream.** Rewritten in the
`R2I(I2R(a)/I2R(b))` form already used for the formation slots — identical
under both, and the game's behaviour is unchanged. This is the third appearance
of the integer-division trap; it is now in the two places that draw numbers.

### 28.2 Steal #1 — the inertia gate

`Game6AI`: re-decide freely for an **idle** unit; for a **busy** one, re-decide
only 25% of the time. Two lines, and it composes with the per-unit last-order
memory rather than replacing it — the memory says *this order is unchanged*,
the gate says *even if it changed, you are already doing something sensible*.
Volume is the budget's job; **churn** is the gate's.

The roll consumes the seeded stream, deliberately: this is a decision, unlike
the cosmetic line picker, which must not (gotcha 29/30).

### 28.3 Steal #2 — a load-normalised budget

`Game5AI` computes `2.0 / N` and moves one bot per tick, so its action rate is
constant. Ours was constant per **dispatch**, and there are five dispatch sites
— march, raid, respond, naval, watchdog — each of which reset the counter. A
tick that marched *and* raided *and* answered a threat spent three full slices.
The budget now opens **once per player per tick**; later dispatches inherit
what is left, and the playtest-9 rotating window decides who gets it.

### 28.4 Measured, not modelled

The existing order-economy figure (74.4/s) is a **model** that reads constants
from source and simulates issuance. It cannot see either change, because both
live inside functions it does not execute. So the claim is measured on the
shipped `AI_NeedsOrder`/`AI_TryOrder`/`AI_OpenBudget`, 70 units × 40 ticks ×
3 dispatches:

| | peak/tick | mean/tick |
|---|---:|---:|
| before (per-dispatch, no inertia) | **72** | **22.8** |
| after (per-tick + inertia gate) | **24** | **15.4** |

Peak is now hard-capped at one slice however many dispatches run, and the
inertia gate contributes independently (19.3 with the budget change alone →
15.4 with both). A busy unit is left alone **76%** of the time against a 75%
target; an idle unit is **always** re-decided.

### 28.5 Steal #3 — pacing as a property

There is now a deliberate latency between **noticing** and **acting**, varying
per faction (four distinct reaction times across twelve factions, and scaled by
difficulty). Two payoffs, and the second is the one that matters: it reads as a
person deciding, and it is an **orthogonal damper on the oscillation class** —
a reversal that must survive a latency window cannot fire on a transient. It
sits beside the playtest-12 hysteresis rather than replacing it: **hysteresis
raises the bar, latency requires the bar to stay crossed.** Asserted: a spike
that lapses and returns does not reverse a campaign.

The capital emergency is exempt and fires on the first tick. Latency must not
blunt it any more than hysteresis was allowed to.

### 28.6 Steal #4 — difficulty as an error rate

Competence is now the dial: error rate (0.35 / 0.15 / 0.05) and reaction speed
(4 / 2 / 1 s) across easy/normal/hard. The error is injected at the **decision**
— an erring faction picks a real but worse objective, never nothing — rather
than at execution. **The material knob stays present, labelled and at zero**
(`ai_handicap` 1.0, asserted). The owner authorised material cheating as a last
resort and said we should avoid it; Squid Game is the shipped precedent that
avoiding it is viable.

### 28.7 OPEN DESIGN QUESTION FOR THE OWNER — not implemented

Squid Game carries **three handicaps in the player's favour**: a worse trait
roll for bots, a higher fumble rate specifically when a human is on the other
end, and a structural exemption for human-containing pairs. **It is deliberately
tuned to lose gracefully.**

That is a product decision about what Fall of Rome's AI is *for* — a sparring
partner that should be beatable, or an opponent that should try to win — and it
is the owner's call, not ours. Nothing has been built either way. If the answer
is "it should lose gracefully", the error rate added in §28.6 is already the
right lever and only needs a human-adjacency term.

Playable **19,079,014**. Trace **580 assertions, 0 FAILs**; `npm test` 620
pass; validate-map 191/192 with 152 warnings (parity).

---

## §29 PRODUCT DECISION, 2026-08-14 — an opponent that tries to win

DESIGN §28.7 put the question to the owner after the Squid Game decomposition
found that map carries three deliberate concessions to the human. **The answer
is the opposite policy**: Fall of Rome's AI is an **opponent that tries to
win**, not a sparring partner tuned to be beatable.

This settles several things that had been drifting, and it is dated because it
is a product decision rather than a bug fix.

### 29.1 No player-favouring handicaps, ever

Squid Game's three concessions — a worse trait roll for bots, an elevated
fumble rate specifically when a human is on the other end, and a structural
exemption for human-containing pairs — are **correct for that map and wrong for
this one**. The human-adjacency term flagged in §28.7 as the easy lever is
**deliberately not built**.

Their absence is now **asserted**, in the same spirit as `no_cheating()`:
`plays_to_win()` sweeps the comment- and string-stripped source and fails if any
function outside a three-name allowlist reads `GetPlayerController`,
`MAP_CONTROL_USER` or `PLAYER_SLOT_STATE`. The allowlist is exactly the
legitimate uses — `AI_SlotIsVacant` (which slots *we* play) and
`AI_Broadcast`/`AI_BroadcastAllies` (addressing chat to people) — plus the
telemetry scanners. A mercy-vocabulary sweep runs beside it.

Negative-controlled twice: the sweep is shown to find the real controller reads
in the allowed functions, and an injected read inside `AI_ScoreExpand` is
detected. **This forecloses the failure where someone later adds a small mercy
and nobody notices.**

### 29.2 The error dial is a selector, not a governor

It exists so a player can choose a weaker opponent, not so the AI is politely
bad by default. Audited across every axis that varies with difficulty:

| axis | easy | normal | hard |
|---|---:|---:|---:|
| `AI_ThinkPeriod` (s) | 8.0 | 4.0 | **2.0** |
| `AI_NoiseAmp` | 0.25 | 0.10 | **0.03** |
| `AI_ErrorRate` | 0.35 | 0.15 | **0.05** |
| `AI_React` (s) | 4.0 | 2.0 | **1.0** |

Hard is strongest on all four and **nothing is switched off at hard** — the
only difficulty early-return in the micro path is gated on `AI_EASY`, which was
already deliberate (round 3: difficulty makes an AI play worse, it does not make
it throw away an irreplaceable hero). All of that is asserted, including that
the **default** is a setting a competent player should meet.

### 29.3 Material cheating stays at zero and stays last

"Tries to win" is **not** licence to reach for it — it raises the bar on
competence instead. Squid Game is the existence proof that a well-paced honest
AI reads as strong. `ai_handicap` is 1.0, asserted, and the banner still
discloses it; if it ever moves, the banner must move with it.

### 29.4 The success criterion escalates

"The scoreboard moves" was right for an AI that did nothing. For an AI that
plays to win the measure is **whether it can contest a human**, so
`parse-events.py` now reports the human's factions **alongside** the AI ones —
clearly labelled, excluded from every AI-only aggregate, and followed by a
verdict line comparing the best AI faction's net territory against the human's.
A run now answers *"did the AI keep pace with the person playing?"* rather than
*"did the AI do something?"*. A reporting change only: the AI-slot bitmask was
already in the `run` header.

### 29.5 What this costs the backlog

The fog-contract decision now carries more weight. An opponent that plays to
win should be **honest about what it can see**, and the banner currently
discloses a split — observed enemy strength is fog-gated, territorial ownership
is not — that we have not yet decided whether to close in code. That remains
queued, but it is no longer merely a tidiness item.

Trace **594 assertions, 0 FAILs**; `npm test` 620 pass; validate-map 191/192
with 152 warnings (parity). **The module itself is unchanged this round** —
"no player-favouring handicaps" is implemented by building nothing, and the
work is the assertion that keeps it that way.
