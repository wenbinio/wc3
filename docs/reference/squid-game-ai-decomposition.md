# Squid Game — how its AI actually works

**Question answered**: the repo owner reports that a WC3 *Squid Game* map "did
pretty decent AI" and asked which one, whether the claim is real, and what an
AI that **plays a game** (single unit, rules, timing, risk) rather than
**commands an army** actually computes. Our own AI work
(`scripts/experimental/rome-ai/`) is the opposite problem shape, so this is a
deliberate look at unfamiliar territory.

**Decomposition date**: 2026-08-13.

**Primary artifact**: `Squid_Game_v1_5_4.w3x`, 87,145,830 bytes, sha1
`c46d1272754d202d43c1d00900d2407a70ca39b4`, by **konvan5 & GhostHeroine**
(w3i author field; Hive credits **konvan5, prizraknadache**), wc3maps id
**258947**, Hive resource **340853**. **Secondary artifact**:
`squidgame1.0.w3x`, 10,280,830 bytes, sha1 `c0ea44e9…`, by **Baradé**, wc3maps
id **208298**. Both extracted to a scratchpad, read, and **not committed** —
gotcha 9 and the Legal section. Nothing here is copied content; quotes are
short illustrative snippets from decompiled `war3map.j` files and from public
Hive posts.

## Evidence classes

Same ledger as `brytenwalda-ai-decomposition.md` / `ai-research-2026-08/`:

- **DOCUMENTED** — stated by the map's own resource page, changelog or author post.
- **CODE-INFERRED** — follows from the shipped `war3map.j` read here, not verified in a running match.
- **EXPERIMENTAL** — observed in play.
- **FOLKLORE** — community claim without reproducible detail.
- **UNKNOWN** — no adequate evidence located.
- **NEGATIVE SEARCH** — looked for, not found; not proof of absence.

The **EXPERIMENTAL** inputs are the repo owner's verdict ("did pretty decent
AI") and two named Hive reviewers who played it (Frotty, Baradé — quoted in §6).
Everything else is **CODE-INFERRED** unless labelled.

---

## Executive verdict

| Question | Answer | Evidence |
|---|---|---|
| Which map? | **Squid Game v1.5** by konvan5 & GhostHeroine (wc3maps 258947). Four *Squid Game* maps exist; this is the only one still hosted (last hosted 2026-06-30, 3,059 lifetime hosted games across its version group), the only one whose resource page carries the **AI** tag and the sentence "Bots have their own AI and react to some of your actions", and the only one with a per-minigame AI. | DOCUMENTED + CODE-INFERRED |
| Is the claim real? | **Yes, and it is not a slot-filler.** 274 GUI triggers, of which ~12 are AI; 200 contestants, all non-human ones driven by map-script triggers. An independent Hive reviewer (Frotty, a Wurst/Hive toolmaker) wrote "I'm quite impressed by the AI". | DOCUMENTED + EXPERIMENTAL |
| What kind of AI? | **No engine AI at all** — zero `.ai` files, zero `StartMeleeAI`/`StartCampaignAI`/`CommandAI`. Pure map-script triggers, one independent brain per minigame, no shared state, no per-unit memory beyond the unit's *current order* and its custom value. | CODE-INFERRED |
| How does it fill slots? | **It does neither of the two options our prior-art doc names.** It does not fill 20 lobby slots and it does not play one contestant per computer slot. It spawns **200 NPC contestants** and distributes them over **three** `MAP_CONTROL_COMPUTER` players (21/22/23). The map plays the absent players. | CODE-INFERRED |
| How often does it decide? | Per-minigame, 0.5 s – 5 s, plus one event-driven cascade. Never a global tick. | CODE-INFERRED |
| Does it cheat? | **No material cheat anywhere** — same abilities, same cooldowns, same kill rule, no gold/XP/stat/speed bonus. It has a formal information advantage (full-map fog modifier + direct reads of map state) but **no decision consumes it**. It carries **three handicaps in the player's favour**. | CODE-INFERRED |
| Is there a difficulty dial? | **No AI dial.** `-easy` changes what happens to *dead players*, not bot competence. Bot competence is a set of hard-coded error probabilities. | CODE-INFERRED |
| Why does it read as decent? | Five mechanisms, none of them intelligence: same buttons, staggered decisions, explicit error injection, a population controller that tapers deaths to zero, and an inertia gate that stops order spam. §5. | CODE-INFERRED |
| What transfers to army AI? | **Three things, all about tempo, none about decision quality** — the inertia gate, the load-normalised round-robin action budget, and error-rate-as-difficulty. §7. | INFERENCE |

**One-line architecture verdict**: Squid Game's AI is a set of ~12 independent
per-minigame *pacing controllers* with hard-coded error rates; it computes
almost nothing, and it convinces because every one of its outputs is an action
a human could have taken at a moment a human might have taken it.

---

## 1. Finding the map, and why this one

`wc3maps.com/api/search?query=Squid` (the parameter really is `query=`) returns
six rows; four are *Squid Game* maps.

| id | name | author | group hosted (total / month) | verdict |
|---|---|---|---:|---|
| **258947** | Squid Game v1.5 | konvan5 & GhostHeroine | **3,059 / 5** | **the map** — 12 AI triggers |
| 209649 | Squid Game v2.0 | Naxefir | 199 / 0 | optimiser-obfuscated; **zero** order-issuing natives → no AI |
| 208298 | Squid Game 1.0 | Baradé | 32 / 0 | a real, minimal **slot-playing** AI (3 triggers) — §6 |
| 409701 | Squid Games | STJ Studios | 1 / 0 | `StartMeleeAI(Player(1),"map.ai")` — and **`map.ai` is not in the archive** |

Selection reasoning: 258947 is the only build still being hosted in 2026, is
~15× the next map's lifetime hosting, is the only one Hive tags **AI**, and is
the only one whose description advertises bot behaviour. Its map-list name is
the pink-coloured `Squid Game v1.5`, which is what a player would remember.

**Korean check — NEGATIVE SEARCH.** Korean is 58.3% of the live canon, so
Korean titles were checked: `오징어` (squid) and `오징어게임` both return **0
rows**. The endpoint's non-ASCII handling was negative-controlled first —
`원피스` returns 24 rows including the canon's #1 map — so this is a real
absence in the index, not an encoding artifact. `무궁화` (the red-light chant),
`달고나` (dalgona), `Calamar` and `Кальмар` likewise yield nothing relevant. The
*Squid Game* maps that exist are Russian- and German-authored.

**Sourcing correction (durable).** `CLAUDE.md` records downloads at
`storagebox.wc3maps.com/maps/<id>/<path>`. That path 404s. The working route is
`https://wc3maps.com/api/download/<id>` with a browser User-Agent, which
redirects to `storagebox.wc3maps.com/<id>/<path>` — **no `/maps/` segment**.

**Version caveat.** wc3maps hosts `Squid_Game_v1_5_4.w3x`; Hive's current
attachment is `Squid_Game_v1_5_4_FIX.w3x`. The read below is of the hosted
build, i.e. the one people actually play. DOCUMENTED changelog for v1.5 lists
only bug fixes and UX; no AI changes.

---

## 2. The architecture

`war3map.j`: 35,567 lines, 1,676,439 bytes, 2,501 functions, **274 GUI
triggers** (decompiled World Editor output; the map is tagged Open Source and
is unprotected — 1,157 archive members extracted, 0 unresolved). Roughly twelve
of the 274 triggers are AI:

`Game1PlayersAI`, `Game1RandomAI`, `Game1FinishUseSkillAI`, `Game2AIPlay`,
`Game3UseAbility` (bot half), `Game4AIPlay`, `Game5AI`, `Game5AIGetItemsAfterGame`,
`Game6AI`, `OrgAI`, `PlayerAttackBot`, `BotAttackBot`.

### 2.1 The population: 200 contestants across 3 computer slots

At lobby end (`Trig_ChooseEnd_Actions`) the map loops `1 … udg_MaxUnitCount`
where `MaxUnitCount = 200`. Each index is either a human's chosen number or, if
unclaimed, becomes an NPC:

```jass
call CreateNUnitsAtLoc( 1, udg_PlayerUnitTypes[GetRandomInt(1, udg_PlayerUnitTypesCount)],
        ConvertedPlayer(( 21 + ModuloInteger(GetForLoopIndexA(), 3) )),
        GetRandomLocInRect(gg_rct_ChosenPLayers), bj_UNIT_FACING )
call SetUnitUserData( GetLastCreatedUnit(), GetForLoopIndexA() )
...
call SetUnitPositionLocFacingLocBJ( GetLastCreatedUnit(),
        OffsetLocation(PolarProjectionBJ(OffsetLocation(Location(-3520.,5184.),
          I2R(ModuloInteger(GetForLoopIndexA()-1,14)) * 78.77,
          I2R((GetForLoopIndexA()-1)/14) * -78.77),
        GetRandomReal(0,25.00), GetRandomReal(0,360.00)), 0, 0), Location(-3008.,5760.) )
```

Three things are worth naming:

1. **Every AI test in the map is `GetConvertedPlayerId(owner) > 20`.** There is
   no per-bot flag, no bot list, no handle table. Bot-ness is ownership.
2. The formation is a **14-wide grid with a polar jitter of 0–25 units at a
   random angle** — the crowd stands in loose ranks, not a lattice. This is the
   first of many places where the map spends effort on *looking* right.
3. **Slot economics.** 200 contestants on 3 computer slots means the map never
   depends on a host bot seating 19 `!comp` players, and never pays 20 slots'
   worth of unit-ownership overhead. `MAP_CONTROL_COMPUTER` is referenced only
   4 times in the whole script.

**This is a direct correction to `wc3-ai-prior-art.md` §4 point 3** ("slot
FILLING is free and universal; slot PLAYING is the unmet need"). Squid Game
does neither: it treats the absent players as **content**, spawns them as NPCs,
and drives them from the map script. The dichotomy was too narrow — there is a
third option, and it is the one that shipped and is still being hosted.

### 2.2 Traits, rolled once, biased against the bots

Every contestant runs `AddCharacteristic` once with a seed integer. Humans get
`GetRandomInt(1, 7)`; **bots get `GetRandomInt(-4, 4)`**. The trigger is an
if-chain on 1…7, so a bot:

- gets **no trait at all** 5 times in 9 (values −4…0 fall through),
- can only ever roll traits **1–4** (ability + attack-speed / move-speed /
  bulk-and-HP modifiers),
- can **never** roll traits 5–7, which are the item-granting and
  double-ability ones.

That is a deliberate, quantified handicap in the player's favour, applied
before the first minigame starts.

### 2.3 Decision rates

| Subsystem | Cadence | Trigger |
|---|---|---|
| Red light / green light | **event cascade**, 7 stages over 6.75 s, once per doll cycle | `Game1PlayersAI` |
| Shoving + corpse trips | 1.00 s periodic | `Game1RandomAI` |
| Dalgona resolution | `120 / (alive − humans)` s ± jitter | `Game2AIPlay` |
| Tug of war | event-driven, two waves at +0.50 s and +0.75 s | `Game3UseAbility` |
| Marbles (bot pairs) | 5.00 s periodic | `Game4AIPlay` |
| Glass bridge | `2.0 / (bots on bridge)` s, **one bot per tick** | `Game5AI` |
| Final arena | 0.50 s periodic | `Game6AI` |
| Guard patrol | 20.00 s periodic | `OrgAI` |
| Retaliation | event + **0.50 s reaction delay** | `PlayerAttackBot`, `BotAttackBot` |

No shared scheduler, no priority, no budget across subsystems — only one
minigame is ever active.

---

## 3. How it plays each minigame

### 3.1 Red light / green light — the centrepiece

**The clock.** `Game1DollBehavior` fires on `udg_DollTimer` expiring:

```jass
call ConditionalTriggerExecute( gg_trg_Game1PlayersAI )   // t = 0.00, async
call SetUnitAnimation( gg_unit_h006_0031, "attack" )      // doll begins turning
call TriggerSleepAction( 1.00 )
set udg_DollSeeYouNow = true
call EnableTrigger( gg_trg_Game1DollSeeYou )              // t = 1.00  WATCH OPENS
call TriggerSleepAction( 5.00 )
call DisableTrigger( gg_trg_Game1DollSeeYou )             // t = 6.00  WATCH CLOSES
...
set udg_DollSoundPitch = ( udg_DollSoundPitch + 0.05 )    // chant speeds up 5%/round
set udg_DollTime = ( GetSoundDurationBJ(gg_snd_SquidGame_DollCount) / udg_DollSoundPitch )
```

The chant's pitch rises 0.05 per round and the next cycle's length is
`duration / pitch` — **the warning window shortens every round**. That is the
whole difficulty curve of game 1, and it is a property of the *map*, not of the AI.

**The kill rule is identical for bots and humans.** `Game1DollSeeYou` polls at
0.10 s and marks for death every unit in `InGameUnits` whose current order is
not `"starfall"` — the order string of ability `A005`, the Stop button players
press. The bot literally presses the same button.

**The bot cascade.** `Game1PlayersAI` is one async thread of seven `ForGroup`
sweeps separated by sleeps, and it is a *stopping* schedule followed by a
*starting* schedule:

| t (s) | applies to | condition | action |
|---:|---|---|---|
| 0.00 | still moving | `R1 < 25` | **stop** |
| 0.50 | still moving | `R1 < 60` **or** `R2 < 100` | **stop** |
| 0.75 | still moving | `R1 < 80` **or** `R2 < 60` | **stop** |
| 4.75 | already stopped | `R1 > 95` **and** `alive > 90` | **move forward 1000** (= death) |
| 5.25 | already stopped | `R1 > 90` **and** `alive > 50` | **move forward 1000** (= death) |
| 6.25 | already stopped | `R1 < 51` | move forward 1000 |
| 6.75 | already stopped | — | move forward 1000 |

with `R1 = GetRandomInt(1,100)` and `R2 = GetRandomInt(50, CountUnitsInGroup(udg_AliveUnits))`.

Four observations, and each one is a design decision:

1. **Three chances to stop, all before the 1.00 s deadline.** A bot that fails
   all three is still walking when the doll opens its eyes and dies. With 200
   alive this is ≈4% of the moving field per cycle; with the field under 100,
   `R2 < 100` is satisfied unconditionally and the stop becomes **certain**.
   The crowd-size term `R2` is a population controller wearing a probability's
   clothes.
2. **The twitch rows (4.75 s, 5.25 s) are deliberate error injection**, and
   they are the dominant death source — a stopped bot is ordered to walk
   *during the watch window* and is killed within 0.10 s. Both are gated on
   crowd size (`alive > 90`, `alive > 50`), so the error rate falls as the
   field thins and reaches **exactly zero below 50 alive**. The map guarantees
   survivors by construction.
3. **The restart is staggered**: the watch closes at 6.00 s, ~51% of the field
   starts at 6.25 s and the rest at 6.75 s. Bots never move as one body. This
   costs two extra sweeps and buys the single most visible "these are people"
   cue in the map.
4. **Nothing here perceives anything.** No bot reads the doll, the timer, its
   distance to the finish, or another contestant. It reads its own order state
   and one global integer.

**`Game1RandomAI` (1.0 s)** adds two flavours of incident:

```jass
// Действия ИИ  ("AI actions")
set udg_Unit = GroupPickRandomUnit(udg_InGameUnits)
... if RandomInt1 > 70 → IssueTargetOrder(unit,"thunderbolt", random unit within 300)
                  else → IssueTargetOrder(unit,"magicleash",  random unit within 300)
// Случайно споткнулся об труп   ("randomly tripped over a corpse")
loop 5 times:
   RandomInt1 = GetRandomInt(CountUnitsInGroup(udg_AliveUnits), udg_MaxUnitCount)
   if RandomInt1 > 150 and picked unit is moving and a DEAD unit lies within 60 units:
       create 'h008' (organiser-owned), add 'A003', cast it on the picked unit
```

The trip requires **an actual corpse within 60 units** and fires more often the
larger the crowd (the roll's lower bound is the live count). It is a physical
plausibility rule, not a random punishment — and when the victim is a human the
map tells them why. `Game1FinishUseSkillAI` then re-issues the forward move
when the stun ends, so a tripped bot gets up and keeps going.

*(Two decompile-visible defects here: `Game1RandomAI`'s third guard and
`Game1FinishUseSkillAI`'s location argument both call `GetEnumUnit()` outside
any enumeration — GUI "Picked unit" used where "Unit" was meant. Harmless in
practice, but it means one of the three guards is reading a stale handle.)*

### 3.2 Dalgona — a pacing controller with no play in it

`Game2AIPlay` is not a model of carving a shape. It is a resolver:

```jass
set udg_AITime = ( 120.00 / ( CountUnitsInGroup(udg_AliveUnits) - CountPlayersInForceBJ(udg_Players) ) )
call StartTimerBJ( udg_AITimer, false, 30 )     // 30 s grace, then one bot resolves per AITime
```

Each firing picks one random bot: **24% it fails** (dies; and of those, 33%
first swing at a random unit within 300 — a panic lash-out), 76% it succeeds and
walks out. Then it re-arms:

```jass
if (any human still playing) → StartTimerBJ(udg_AITimer, false, udg_AITime + GetRandomReal(-0.20, 0.15))
else                         → StartTimerBJ(udg_AITimer, false, 0.25)
```

Two rules worth stealing outright: the interval is derived so that **the whole
bot field finishes in the round's 120 seconds regardless of how many bots there
are**, and once no human is left playing the AI **fast-forwards at 0.25 s** so
nobody watches an empty room. The ±jitter exists purely so the exits are not
metronomic.

### 3.3 Tug of war — the clearest error model in the map

Each round announces one of three pull moves; a team's strength is
`PowerValue × (members who pressed the correct one)` (plus buff bonuses), ties
broken by a press-order queue. A bot team responds in **two waves**: after
0.50 s, `count/2` randomly chosen members cast; after a further 0.25 s the
remainder cast. Each casting bot uses the **announced** ability unless it
"fumbles", in which case it uses `GetRandomInt(1,3)`. Fumble probability:

| condition | extra fumble chance |
|---|---|
| always | **20%** |
| the opposing team contains a human (`Game3Team2IsBot == false`) | **+20%** |
| both teams are bots **and** the rope has drifted past its start point | **+25%** |

So a bot fumbles ~20% of the time in general, **~36% when a human is on the
other end of the rope**, and up to ~40% in a bot-vs-bot match that has started
to run away. That is a difficulty knob (competence, not resources) *and* a
rubber band, both implemented as one extra clause. It is the only
opponent-aware behaviour in the entire map.

### 3.4 Marbles — gambler's ruin, with humans exempted

`Game4AIPlay` (5.0 s) walks the pair array and, for each pair whose **odd**
member is a bot, stakes `GetRandomInt(1,5)` marbles on a 50/50 coin; whoever
hits zero dies (`Destroyers[pair]` is ordered to attack them) and the survivor
is moved back to the staging area. A secondary clause forces the odd side to
lose when the even side is already ahead — a closer, so pairs cannot grind.

The careful part is in `Game4Start`: when a pair slot already holds a bot and
the incoming contestant is a human, **the map swaps them** so the human sits at
the odd index:

```jass
// Func007Func001Func004C: pair index even, slot holder is a bot (>20), incoming is human (<21)
set udg_GameUnitMas[n] = udg_GameUnitMas[n-1]
set udg_GameUnitMas[n-1] = GetEnumUnit()
```

Because the auto-resolver only runs on pairs whose odd member is a bot, this
**exempts every human-containing pair from being auto-resolved** — the human
always plays their own marbles. Against a human the bot has no hand and no
bluff: the odd/even outcome is `Game4EvenOddBallsCount == GetRandomInt(0,1)`, a
fair coin rolled at guess time, **plus** three ways for the human to be right
anyway (a flat 25% grace roll, a buff `B003` that guarantees a correct guess,
and a forced-win clause when both sides are down to one marble). The bot does
not play marbles; it is the coin.

### 3.5 Glass bridge — the best thing in the map

`Game5AI` maintains a queue along the bridge: `Game5OnPlatformUnits[n]` and
`Game5OnPlatformSecondUnits[n]` (a second body crowding the same pane),
`Game5ProrgessNumber` (the furthest pane anyone has jumped to),
`Game5StrainedGlassNumbers[n]` (1 = the left pane of step *n* is tempered,
2 = the right), and `Game5AINumber`, a cursor.

**The scheduler.** Each tick the cursor walks **front-to-back** until it finds
one pane occupied by a bot, acts on **exactly that one bot**, and continues
decrementing next tick; at zero it wraps to the far end and handles the unit
still standing on the start platform. The tick is
`AITime = 2.0 / Game5BotOnPlatformCount` — so **every bot gets one decision
every ~2 seconds no matter how many are on the bridge**, and the visible effect
is a wave of movement travelling down the queue rather than a simultaneous hop.
The jump abilities carry a **2.10 s cooldown for everyone**, bots included, so
the AI cannot out-click a human either.

**The decision**, for the bot at pane *n*:

- **If `n == ProrgessNumber` (it is at the frontier)**: `GetRandomInt(1,100)`,
  `≤50` → jump left, else → jump right. **A blind coin flip, exactly like a
  human's.** No memory, no pattern, no peek.
- **Else (someone has already crossed the pane ahead)**:
  - if the unit on pane *n+1* is **dead** → `innerfireon` (squeeze past the corpse);
  - else with probability **30%**, if pane *n+2* is empty and *n+1* is occupied
    → `innerfireon` (**overtake** the person in front);
  - else if pane *n+1* is **empty** → read `Game5StrainedGlassNumbers[n+1]` and
    jump to the correct side;
  - else → **do nothing** (queue).

**This is not an information cheat.** `ProrgessNumber` advances the moment
someone *jumps* to a pane, and a jump reveals that pane either way — the jumper
lands or falls in full view. The bot consults the answer only for panes whose
answer is already public. The one thing it never does is *hesitate*: at the
frontier it always jumps immediately, which is exactly what a named playtester
complained about (§6).

### 3.6 The final arena — inertia, and a win condition

`Game6AI` (0.5 s) does two things:

```jass
if ( CountUnitsInGroup(udg_InGameUnits) == 1 ) then
    call ForGroupBJ( udg_InGameUnits, ... "move", GetRectCenter(gg_rct_Game6SquidCircle) )
```

A last surviving bot **goes and completes the objective**. Without this the map
would hang whenever bots outlive the humans — and a Hive reviewer confirms it
fires ("In the end some bot just ran into the squid circle and won").

Otherwise, per bot:

- **if it is not already attacking or walking**: 25% → use an item (targeted
  `I00P` on a random live unit, else self-use `I00M`); otherwise 75% → attack a
  random live unit in the arena, 25% → wander to a random spawn point.
- **if it is already attacking or walking**: 25% chance to re-decide at all,
  and even then the same 75/25 split. **75% of the time it is left alone.**

That last line is the entire order-spam solution: *only re-decide when idle,
and re-decide reluctantly when busy*. Target selection is
`GroupPickRandomUnit` over the whole arena — no distance, no HP, no threat, no
overkill avoidance. Combat competence is nil; in a 200-body brawl, randomness
reads as panic.

### 3.7 Ambient behaviour

- **`OrgAI` (20 s)**: two named guards ping-pong between two rects, using
  `SetUnitUserData` as a one-bit state flag and skipping the order while
  attacking. Patrol, not AI.
- **`PlayerAttackBot` / `BotAttackBot`**: a bot that is attacked waits
  **0.50 s**, then retaliates — `"attackonce"` if above 50% HP (a scuffle),
  full `"attack"` if below (a fight to the death). `BotAttackBot` additionally
  plays a 10% scream, picked from male or female sound sets chosen by the
  unit's model. The reaction delay is the map's only explicit human-latency
  model, and it is the behaviour the resource page is advertising when it says
  bots "react to some of your actions".

---

## 4. Does it cheat?

**Material advantage: none found.** NEGATIVE SEARCH across the whole script for
resource, XP, stat, speed or cooldown grants to players 21–23 — there are none.
Bots and humans use the same abilities (`A005` stop, `A01U`/`A01V` jump,
`A01Q`/`A01R`/`A01S` pull), are killed by the same triggers, and share the same
2.10 s jump cooldown. `PLAYER_STATE_RESOURCE_*` is touched only to set food
counters for the UI.

**Information advantage: formal, unused.** Initialization grants full-map
vision to players 20–23:

```jass
call CreateFogModifierRectBJ( true, Player(21), FOG_OF_WAR_VISIBLE, GetPlayableMapRect() )
```

and every AI trigger reads global arrays directly rather than perceiving
anything. But **no bot decision consumes visibility**: the only decision made
over an unrestricted scope is `Game6AI`'s target pick, and it is uniformly
random, so omniscience confers nothing. The glass-bridge lookup is bounded to
publicly revealed panes (§3.5). By `brief-06-difficulty.md`'s taxonomy this map
sits in an unusual place: it has no perception layer at all, so the
information-cheat axis barely applies.

**Advantages granted to the player** (the interesting column):

| Handicap | Magnitude |
|---|---|
| Bot trait roll `GetRandomInt(-4,4)` vs human `GetRandomInt(1,7)` | no trait 5/9 of the time; items and the double-ability trait unreachable |
| Tug-of-war fumble rate rises when the opponent is human | +20 percentage points |
| Human-containing marble pairs exempted from auto-resolution | structural |
| Game-1 twitch deaths gated on crowd size | bot error rate → 0 below 50 alive |
| Marbles guess grace (flat 25% + a guaranteeing buff + a 1-vs-1-marble forced win) | player-side only |

**No difficulty ladder.** `-easy` / `-изи` sets `udg_NoobMode`, which is read in
exactly three places, all about what happens to *players* who die. Bot skill is
not adjustable at runtime.

**This corrects `wc3-ai-prior-art.md` §4 point 2** ("100% of measured 'hard' AIs
achieve difficulty by CHEATING… nobody has a competence dial; everybody has a
resource dial"). Squid Game has a competence dial and no resource dial. It is a
crude dial — hard-coded percentages, opponent-aware in exactly one minigame —
but it is the thing the prior-art doc said did not exist in this ecosystem, and
it shipped in 2022.

---

## 5. Why it reads as "decent" to a strong player

This is the question worth the most to us, because our own AI keeps passing
technical gates and failing the eye. Five mechanisms, in descending order of
how much I think they matter:

1. **It presses the same buttons.** Every bot action is an order or ability a
   human has on their command card, resolved by the same trigger that resolves
   the human's. There is no privileged path. A player watching a bot stop, jump
   or pull is watching an action they know the cost of — so it is legible, and
   legibility is most of what "competent" means to a spectator.

2. **Nothing is synchronous.** The game-1 cascade spreads stops over 0.75 s and
   restarts over 0.50 s; tug-of-war answers in two waves 0.25 s apart;
   dalgona jitters ±0.2 s; the glass bridge acts on **one** bot per tick,
   front to back. The map spends real complexity — seven `ForGroup` sweeps
   where one would do — buying only the appearance of independent minds. A
   single synchronised sweep would have been correct and would have looked
   like machinery.

3. **Error is a first-class output.** Bots do not fail because the model is
   weak; they fail on explicit rolls at explicit moments — the twitch during
   red light, the wrong tug key, the 24% dalgona break. Mistakes therefore
   arrive at plausible moments and in plausible sizes, which is the thing
   random flailing never achieves.

4. **A population controller keeps the drama on a curve.** Game-1 error rates
   are gated on the live count (`alive > 90`, `alive > 50`, `R2 < 100`), so the
   field is culled hard while it is a crowd and stops being culled once it is a
   cast. Dalgona resolves the whole field inside its 120-second budget whatever
   the field size. The player reads "the games get survivable as the numbers
   drop" as intelligence about risk; it is arithmetic about pacing.

5. **The inertia gate stops the tell.** `Game6AI` re-decides only for idle
   bots, and only 25% of the time for busy ones. Order spam — the visible
   stutter that instantly marks a unit as script-driven, and the top finding
   of our own rome-ai playtest — cannot happen here.

**The honest failure**, and it is precise. Baradé (author of the other Squid
Game map) played this one and wrote:

> "The glass bridge game was much easier with AI. **Nobody stopped at the
> front.** Maybe add some random flags or even messages that they do not want to
> go." — EXPERIMENTAL

That is exactly the gap the code predicts (§3.5): the frontier bot always flips
and always jumps, immediately. There is no hesitation model, no reluctance, no
"you go first" — the one place in the map where the show's whole tension lives.
The lesson generalises: **the AI is convincing everywhere it has been given a
reason to be slow, and unconvincing in the one place it should have been
slowest.** Frotty's verdict pairs with it —

> "I'm quite impressed by the AI, but there isn't much gameplay here… 6
> uther-party like mini-games with a bit weird AI" — EXPERIMENTAL

— *impressed* and *a bit weird* at once, which is about right for a system whose
strength is tempo and whose weakness is that it never models a decision anyone
would agonise over.

---

## 6. The other three artifacts

**Baradé, `Squid Game 1.0` (208298)** — a genuine, minimal **slot-playing** AI,
and the direct counterexample the prior-art doc wanted: it reads
`GetPlayerController(p) == MAP_CONTROL_COMPUTER` and drives one contestant per
computer slot, i.e. the GHost++ `!comp` path actually being *used*. Three
triggers:

- red light: green → all AI `move` 2000 units forward; red → **each AI waits
  `GetRandomReal(0, 2.50)` seconds, then stops.** One line, same idea as
  konvan5's seven-stage cascade — a reaction-time distribution wide enough that
  some bots are caught.
- glass bridge: carries the author's own comment, which is the most valuable
  DOCUMENTED sentence found in this pass —

  > `// AI knows what the players can see. They will never jump on a broken
  > glass and always jump on the side where other players are standing if
  > possible.`
  > `// TODO wait does not work?!`

  and it means it: the implementation reads `GetElevatorHeight()` of the panes
  ahead — the *visible physical state* of the bridge, a broken pane having
  dropped — rather than the hidden truth table, and flips `GetRandomInt(0,1)`
  when the state is ambiguous. That is an honest perception model, stated as an
  intent and implemented as one. Where konvan5's map bounds the cheat by
  bookkeeping (only read panes behind the frontier), Baradé's bounds it by
  reading the world.
- tug of war: bots auto-move toward whichever side the balance is on.

It is also the craft counterexample: both AI triggers call `PolledWait` **inside**
a `ForForce` enumeration, so `GetEnumPlayer()` is re-evaluated after the wait —
the author's own `TODO wait does not work?!` is that bug. konvan5's cascade
sleeps *between* `ForGroup` sweeps, never inside one, and is correct.

**Naxefir, `Squid Game v2.0` (209649)** — optimiser-obfuscated (`…OPT.w3m`,
single-letter globals). **Zero** `IssuePointOrder` / `IssueTargetOrder` /
`IssueImmediateOrder` / `MAP_CONTROL_COMPUTER` occurrences: no AI. NEGATIVE.

**STJ Studios, `Squid Games` (409701)** — has an `AI` trigger, executed once at
init:

```jass
call StartMeleeAI( Player(1), "map.ai" )
call StartCampaignAI( Player(3), "map.ai" )
```

**`map.ai` is not in the archive.** An attempted engine-AI map pointing at a
file it does not ship, on a non-melee map, for two of fourteen slots. 1 hosted
game, ever.

---

## 7. What transfers to army-level RTS AI

Honestly: **little, and none of it is about deciding well.** The minigames are
one- and two-bit decision problems with a publicly known answer schedule; there
is no space, no economy, no opponent model, and nothing that resembles
`rome-ai`'s six-goal scoring under a posture layer. Do not go looking here for
target selection, routing or planning — there is none.

Three things do transfer, and all three are about **tempo**:

1. **The inertia gate** (`Game6AI`). *Only re-decide for an idle unit; when it
   is busy, re-decide with probability p.* Two lines. rome-ai's first-playtest
   headline finding was order spam producing unit-lag stutter; this is the
   cheapest known fix and it is already validated by a map people call
   impressive. It is strictly weaker than per-unit last-order memory, and
   strictly cheaper.

2. **The load-normalised round-robin action budget** (`Game5AI`:
   `AITime = 2.0 / N`, one unit per tick, cursor persists across ticks). This
   is `brief-06-difficulty.md`'s *attention* axis implemented in one division:
   the AI's total actions per second is constant, so crowding does not increase
   its apparent reflexes and does not increase its order volume. It also
   produces the wave-down-the-queue look for free. rome-ai currently acts on
   everything it decides about, every tick.

3. **Error rate as the difficulty parameter, scaled by who is watching**
   (`Game3UseAbility`: 20% base, +20% when a human is on the other end). A
   competence dial that costs nothing and grants nothing — the thing our
   prior-art doc said nobody in this scene had.

And one idea that is not a technique but is, I think, the actual lesson:

> **The map spends its complexity budget on pacing, not on decisions.** Seven
> sweeps instead of one, a 120-second resolution budget, a `2.0/N` tick, ±0.2 s
> jitter, a fast-forward when no human is watching, error rates gated on
> population so the drama tapers. None of it makes a bot play better; all of it
> makes the bots *arrive at plausible moments*. Our AI has no pacing layer at
> all — it decides as fast as the tick allows and acts on everything at once —
> and "passes the technical gate, fails the eye" is exactly the symptom that
> predicts.

**What does not transfer** (stated so nobody mines this file for more than it
holds): no spatial reasoning, no route or chokepoint model, no threat
assessment, no target scoring, no resource management, no multi-step plan, no
memory across minigames, no opponent modelling beyond one boolean. Any of those
in an army AI must still come from elsewhere.

---

## 8. Corrections to existing docs

- **`wc3-ai-prior-art.md` §4 point 2** — "100% of measured 'hard' AIs achieve
  difficulty by CHEATING… nobody has a competence dial". **Falsified by
  counterexample**: Squid Game v1.5 has no material cheat, and its difficulty is
  a set of error probabilities, one of which is explicitly larger against a
  human opponent.
- **`wc3-ai-prior-art.md` §4 point 3** — "slot FILLING is free and universal;
  slot PLAYING is the unmet need". **Too narrow**: the shipped, still-hosted
  solution is neither — it spawns 200 NPC contestants over 3 computer slots and
  plays the absent players as content. (Baradé's map is the pure slot-playing
  case, and it is the *less* played of the two.)
- **`wc3-ai-prior-art.md` §3** — the custom-map AI survey should carry Squid
  Game as its best per-unit, per-rule case; every entry there is army- or
  purchase-oriented.
- **`CLAUDE.md` sourcing note** — `storagebox.wc3maps.com/maps/<id>/<path>` is
  wrong. Use `https://wc3maps.com/api/download/<id>` (browser UA), which
  redirects to `storagebox.wc3maps.com/<id>/<path>`.

---

## 9. Reproduction

```bash
curl -L -A "<browser UA>" -o squid.w3x https://wc3maps.com/api/download/258947   # 87 MB
node tools/w3x-extract.js --recover-names squid.w3x /tmp/squid                   # 1157 members, 0 unresolved
grep -n "Trigger: Game1PlayersAI\|Trigger: Game5AI\|Trigger: Game6AI" /tmp/squid/war3map.j
```

Line references above are to that extraction's `war3map.j` (35,567 lines).
Hive resource page: `hiveworkshop.com/threads/squid-game-v1-5.340853/` (fetch
with a browser User-Agent; the plain fetcher gets a 403). Baradé's map:
`wc3maps.com/api/download/208298`.

**Staleness**: the structural findings and the transfer list should age well.
Every probability and interval quoted is a balance value read from the hosted
`Squid_Game_v1_5_4` build — re-read `Trig_Game1PlayersAI_Actions`,
`Trig_Game5AI_Actions` and `Trig_Game3UseAbility_Actions` before citing numbers,
and note that Hive's current attachment is the later `…_FIX` build, which was
not read here.
