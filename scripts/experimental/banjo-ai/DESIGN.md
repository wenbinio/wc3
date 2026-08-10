# Banjo-AI — a computer player for *Banjoball v1.22C1*

Every claim below is followed by the evidence for it in the map's own script.
The map is protected (`_PROT`); it was extracted with the toolkit's name
recovery and the compiled `war3map.j` was reformatted for reading. Nothing in
the map is committed.

---

## 1. What the game actually is (decomposition, with script evidence)

### 1.1 Not obfuscated, which changes everything

The archive is protected — a stripped listfile (286 members, 21 named; name
recovery resolved most of the rest), a protection-trap `war3map.w3r` (an
8-byte file declaring 1.26 billion regions, caught by `lib/traps.js`), and a
`war3mapUnits.doo` that no parser reads. But the **script is only
whitespace-minified**: 961 KB on 5,076 lines, with every identifier intact
(`BALL_CATCH_RANGE`, `s__Ball_castUtil`, `Players___playerUnit`). It is
vJass/JassHelper output, so struct members survive as global arrays
(`s__Ball_owner[b]`) and are readable *and callable* from injected code.

This is the fact the whole design rests on: the AI does not need a shadow world
model, because the map's world model is already global.

A `constant boolean PROTECTION_ENABLED=true` exists but is referenced nowhere
else in the script — a compile-time flag whose branch the optimiser resolved.
No runtime anti-tamper check was found; that is an absence of evidence, not
proof, and it is listed as a risk in §7.

### 1.2 The pitch

| thing | value | source |
|---|---|---|
| play area | `Rect(-4064, 10208, -32, 12832)` — 4032 × 2624 | `gg_rct_Field` |
| Goal 1 (left) | `Rect(-4672, 11200, -4288, 11840)` | `gg_rct_Goal_1` |
| Goal 2 (right) | `Rect(192, 11200, 576, 11840)` | `gg_rct_Goal_2` |
| keeper boxes | `Goal_1_Area`, `Goal_2_Area`, 512 × 448 | rects |
| starts | `Start_1` x≈−3300, `Start_2` x≈−770 | rects |
| goal mouth | 640 wide, scoring below **height 300** | `GOAL_HEIGHT` |

**The rects are moved at runtime.** `MoveRectTo` is called on `gg_rct_Goal_1`,
`Goal_2`, both `_Front` rects and both starts when a field is chosen, and the
fields differ in size — `s__Field_create("Sunny Hills … Normal size,
recommended for 4v4")` versus `"Waterfall … Large size, recommended for 5v5"`.
Any AI that bakes in the coordinates above is wrong on four of the fields.
`BAI_RefreshGeometry` therefore reads the rect centres at runtime.

### 1.3 Scoring

```
Game__goal:  ball enters team1Goal or team2Goal
             and not s__Ball_hold[ball]
             and GetUnitFlyHeight(ball) < GOAL_HEIGHT   -> score()
score():     goal == team2Goal -> team1Points+1   (and gold  += 1 per player)
             goal == team1Goal -> team2Points+1   (and lumber+= 1 per player)
             autogoal if the last owner was on the conceding team
```

So **team 0 ("Team 1") attacks Goal 2**, and a ball above 300 units is not a
goal. Team scores are mirrored into gold and lumber, which makes them readable
from anywhere.

### 1.4 The ball is a physics object, stepped by the map itself

`s__Ball_movement`, on a `TimerStart(..., 0.03125, true, ...)` — **32 ticks a
second**:

```
if GetUnitFlyHeight(ball) < 1.00:              # rolling
    if |v| > BALL_FRICTION_GROUND: setLength(v, |v| - BALL_FRICTION_GROUND)
    else:                          stop, pause the timer
else:                                          # airborne
    v.z -= GRAVITY_ACCELERATION
    if |v| > BALL_FRICTION_AIR:    setLength(v, |v| - BALL_FRICTION_AIR)
x += v.x ; y += v.y
if z + v.z < terrain and v.z < 0:              # landing
    flyHeight = 0 ; v.z = -v.z - BALL_BUMP_SPEED_LOSS - GRAVITY/2  (clamped ≥ 0)
```

with `|v|` the **3-D** length (`s__Vector_getLength` includes z) and
`setLength` scaling all three components — so friction bleeds the vertical
component too. Constants: gravity 1.50, ground friction 0.45, air friction
0.07, bump loss 4.00.

**The three friction globals are mutable**, not constants, and the ice fields
lower them (`BALL_FRICTION_ICE = 0.30`, and `set BALL_FRICTION_AIR=` appears in
the field code). Reading them live is not a nicety; a copied constant is simply
wrong on ice.

### 1.5 The verbs

| verb | mechanism | evidence |
|---|---|---|
| **catch** | proximity filter: any `UNIT_TYPE_PLAYER` within `BALL_CATCH_RANGE` (90) and inside a per-class height window takes ownership | `s__Ball_catch` |
| **carry** | ball parked 100 units in front of the carrier, carrier gets a **slow debuff** | `s__Ball_takeOwnership`, `BALL_SLOW_RAWCODE` |
| **kick** | `s__Ball_kick(b, x, y, KICK_SPEED=30, KICK_Z=7)`; sets a 5-tick `intercept` lock so the kicker cannot instantly re-catch | `s__Ball_castUtil` |
| **abilities** | Powershot, Curveshot L/R, Slam, Jump (F key), Sprint ×4, Possess, Metamorph, Trickster … | per-class `uabi` |

Carrying being *slow* is the central tension of the game: the ball moves at 30
units/tick, an athlete at 300 speed moves 9.375 — **a pass is 3.2× faster than
a dribble**, and the carrier is slower still.

### 1.6 The roster

19 playable classes (plus 3 skin twins), all 300 move speed except `Master Awe
Qi` at 400, all 100 HP. Every athlete gets `Kick` and `PassMe` added on pick
(`Pick___addAbilities`); everything else is the class's own `uabi`.

### 1.7 There is no AI

Zero `AI_*` functions. One reference to `MAP_CONTROL_COMPUTER` in the entire
961 KB script. An empty slot is simply a missing player — which in a 6v6 ball
game is worse than in an RTS, because the ball goes to whoever is nearest and a
missing man is a permanent overload for the other side.

---

## 2. Design goals and non-goals

**Goal.** A slot that would otherwise be empty plays a competent, honest game
of football: chase what it can reach, shoot what it can score, pass what it
cannot, and keep goal when it is the last man.

**Non-goals.** No build order (there is nothing to build). No resource cheat.
No per-class mastery in round 1 — one class is used and its kit is played
generically (§7.5). No opponent modelling.

---

## 3. World model

Nothing is cached. Every think reads the live globals — ball position,
velocity, owner, hold flag, every athlete's position, and the goal rect
centres. There is no staleness to manage and no desync to debug, and it costs
nothing: the state is already in memory.

The fog contract is trivial compared to the Rome AI's: **this map has no fog of
war worth speaking of** — it is a stadium, and the ball is the only thing that
matters. The AI is therefore not given anything a player looking at the pitch
does not have.

---

## 4. The predictor and the intercept — the core

`BAI_PredictBall(n)` replays §1.4 exactly, n ticks forward.

`BAI_Intercept(u)` walks that flight and returns the **first tick i** where

```
dist(unit, ball_at(i)) ≤ (moveSpeed / 32) · i + BALL_CATCH_RANGE
```

i.e. the earliest point the runner can be there, crediting the catch radius
because the catch is a proximity filter, not a contact. If nothing inside the
horizon (128 ticks = 4 s) is reachable, it returns the resting place — which is
the right answer anyway, since the loop keeps stepping a stopped ball and the
resting point stays in range.

This is what makes the AI chase *where the ball will be*. Measured with the
map's own constants: a full kick carries **1353 units** over 80 ticks (2.5 s)
with two bounces and a 19.4-unit apex; a pure ground roll from speed 30 covers
985, against the closed form `v²/2a = 1000`.

**That measurement immediately falsified a design number**: the first draft
shot from up to 1500 units, further than a kick can travel. Shoot range is now
1150 and pass range 1250, both asserted by `trace.py` to stay inside the
measured carry.

---

## 5. Execution — and one labelled equivalence

Orders go through `BAI_TryOrder` and nowhere else (`trace.py` asserts a single
`IssuePointOrder` site). It drops any order whose target is within 96 units of
the one the unit is already following, because re-issuing a move order restarts
pathing — the exact mechanism behind the Rome AI's first-playtest stutter.
Think ticks are staggered across 8 sub-ticks by slot id, so the twelve slots
never decide in one frame.

**Kicking is a labelled equivalence, not an order.** `Kick` is a Channel
ability (`ANcl`) whose base-order field `Ncl6` is **absent**, so its order
string would be an inference from the base ability's default. Instead the AI
calls `s__Ball_castUtil(u, x, y)` — the map's own Kick handler, which checks
ownership and hold exactly as a human kick does and then calls `s__Ball_kick`
at the same speed and height. Kick has no cooldown, so nothing is bypassed.
This is recorded here beside the no-cheating claim because it *is* the AI doing
something through a different door than the player.

Abilities whose order strings are declared in the object data are ordered
normally and their cooldowns are enforced by the engine: **Slam `sacrifice`**,
**Powershot `parasite`**, Curveshot `carrionscarabs`. **Sprint** is the one
inference left in the runtime path, and it is self-verifying: after issuing it
the module checks for `SPRINT_BUFF_RAWCODE` and, if the buff never appears,
stops trying for that slot.

---

## 6. Verification record

| tier | what it proves | result |
|---|---|---|
| contract (pjass + authored stub) | the module type-checks against the natives it calls and every map internal it reads | **Parse successful**, 932 lines |
| physics (Python, constants parsed from the `.j`) | the ball model matches the map's own; roll vs `v²/2a`; bounce; ranges inside carry | 9/9 |
| source guards | one order site, live constants, Schrage PRNG, rect geometry, no cheat natives | 21/21 |
| negative controls | copied constant / cheat call / bad range / stray order each fail the harness | 4/4 fire |
| differential pjass on the built script | injection adds no structural error vs the unmodified map | 1 new class, a native the map never calls |
| injector | 27 internals verified present; 3 anchors verified unique; re-run byte-identical | pass |

---

## 7. What this design does not do

1. **It has never been run** — not in the game, and `lib/sim` cannot execute
   JASS. The tactical layer is a model joined to the code by source guards.
2. **Slot takeover creates the athlete directly** (`CreateUnit` +
   `Pick___addAbilities`) instead of buying at the tavern, so the hat, skin and
   stat bookkeeping around `Pick___pick` is skipped.
3. **The lane test is a corridor**, not a physics trace — it cannot know the
   ball bounces over a defender's head.
4. **The keeper cannot jump**, in a game where goals are height-gated at 300
   and every class has `Jump` on F. This is the most obvious missing mechanic.
5. **One class, played generically.** `h00P` is hard-coded and Curveshot,
   Possess, Metamorph, Trickster and the rest are unused.
6. **No off-ball play**: support positions are a fixed offset, not runs into
   space, and there are no marking assignments or set pieces.
7. **Protection is assumed inert.** `PROTECTION_ENABLED` is referenced nowhere
   at runtime and no tamper check was found, but the search was not exhaustive.

The clean starting point for round 2, in order: play it once and take the real
list; then the keeper's `Jump`; then per-class kits; then off-ball movement.
