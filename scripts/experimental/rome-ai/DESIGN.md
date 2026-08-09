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
* **Gates** on the Roman walls can be opened/closed (`A00Z/A01O..A01U`).

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

Stated up front so §7 of the report is not a surprise.
* No pathing awareness — it issues attack-move and trusts the engine. The map
  has mountain passes, gates and sea lanes; the AI does not reason about them.
* **No naval play.** Shipyards, transports and the amphibious flank (63
  shipyards on the map) are ignored entirely. For Vandals (an island/Africa
  start) this is close to disqualifying.
* No gate control, no tower garrisoning with Skirmishers, no alliance
  diplomacy, no razing-for-gold, no Elephant/Catapult tech choices.
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
it *wins*. The AI has never run in Warcraft III.
