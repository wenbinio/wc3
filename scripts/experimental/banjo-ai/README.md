# banjo-ai (experimental)

A **computer player for Banjoball v1.22C1**. Source only — the map is
third-party and is NOT committed (gotcha 9 / Legal). Credit for the map
belongs to its authors; this module is an add-on, not a fork.

Written 2026-08-10. **Never run in the game.** Read §"Honest gap" before
trusting anything in here.

## The game, in one paragraph

Banjoball is not an RTS. It is a **physics football game**: two teams of up to
six, one ball, `Team 1` defending the left goal and `Team 2` the right. The
ball is a unit with a velocity vector stepped every **1/32 s** by the map's own
`s__Ball_movement` — friction 0.45/tick on the ground, 0.07/tick in the air,
gravity 1.5/tick, bouncing with a 4.0 speed loss. Any athlete within
`BALL_CATCH_RANGE` (90) and inside a per-class height window **catches it
automatically**; carrying it parks the ball 100 units in front of you and
applies a slow debuff. `Kick` sends it at speed 30 with z 7 toward a target
point. A **goal** is the ball entering a goal rect below height 300 while not
held. Athletes are heroes bought from a tavern; every one of the 19 classes
gets `Kick` plus its own kit (Powershot, Curveshot, Slam, Jump, Sprint,
Possess, ...). Fields are chosen per match and **differ in size**, so the goal
rects are moved at runtime.

Every number above was read out of the map's own script, not from a forum.

## What this is

`for-banjo.j` — ~780 lines of plain JASS injected into the map's compiled
`war3map.j`. It reads the map's **live** state rather than keeping a shadow
copy: `s__Ball_ball/owner/hold/vel`, `s__Vector_x/y/z`, `Players___playerUnit`,
and the goal rects. Because the friction globals are mutable and the ice fields
lower them, reading them live means the predictor is correct on every field
with no constants of its own to drift.

The core is a **ball predictor**: a tick-for-tick replay of the map's own
movement function, including the 3-D length semantics (friction bleeds the
vertical component too, because `setLength` scales all three) and the bounce.
From it comes an **interception solver** — the earliest tick at which a given
athlete can be where the ball will be, at its own move speed — which is what
the AI chases instead of chasing where the ball is now.

On top of that sit four cases, in priority order:

- **I carry it** — shoot if inside `BAI_SHOOT_RANGE` with a clear lane, else
  pass to a team-mate who is meaningfully closer to goal with a clear lane,
  else drive at the goal. Aim is deliberately offset from the goal centre.
- **A team-mate carries it** — take a support position ahead of the carrier,
  spread off his line; the keeper stays home.
- **An opponent carries it** — `Slam` him if in range, otherwise close him
  down; the keeper holds a line between the ball and the middle of his goal.
- **The ball is loose** — the man who can reach it first goes for the
  intercept point; defenders shape up between ball and goal instead of joining
  a chase they cannot win; the keeper leaves his line only for a ball inside
  his own area.

Roles (keeper / defender / attacker) are recomputed every think from live
distances, so there is no role memory to go stale.

**Order economy is built in from the first line**, because the Fall of Rome AI
paid for that lesson in its first playtest: every order goes through one choke
point that drops re-orders inside 96 units (re-issuing a move restarts pathing
— that IS the stutter), and the twelve slots' think ticks are staggered so they
never decide in the same frame.

**A bot exists only where the host made a Computer slot.** Empty slots are
left empty -- nobody asked for them to be filled. The map's own `config()`
declares all twelve slots `MAP_CONTROL_USER`, which left it open whether the
lobby would offer a Computer option at all; **game-verified 2026-08-10: it
does.** `-aifill` remains as an opt-in way to put bots on empty slots, and is
now a convenience rather than a fallback.

**`-aidebug`** cycles a per-bot readout: role, mark, intercept ticks, mana,
sprint request / order accepted / buff this act / buff next act, move speed
versus *observed* displacement, and the current order against the last order
the AI itself issued. That last pair is the point — a current order the AI
never issued is the direct signature of something else driving the unit, which
is the one failure mode a Computer slot introduces and an empty slot does not.

**No cheating.** The AI reads only what the map itself makes global, gets no
gold, speed or vision, and the harness asserts the absence of every cheat
surface. Difficulty (`-aieasy` / `-ainormal` / `-aihard`) is aim noise,
reaction latency and whether it uses its abilities; `-aioff` stops them.

## Files

- `for-banjo.j` — the module.
- `inject.py` — splices it in. JASS is single-pass with one globals block, so
  globals go into the map's block, functions before `InitCustomTriggers`, and
  one `BAI_Init()` call into `main`. It **verifies all 27 map internals the AI
  reads are present and refuses to run otherwise**, and it verifies each of its
  three splice anchors occurs exactly once. Idempotent (byte-identical on a
  re-run). `BANJO_WORK=<dir> python3 inject.py`.
- `trace.py` — the verification harness (below).
- `DESIGN.md` — the decomposition, with the script evidence for every claim.

## Verification (all that was possible headlessly)

`trace.py`: **30 checks, 0 failed**, in three tiers.

1. **Contract** — the module is type-checked by pjass against a written-out
   stub of the 30 natives it calls *and* every map internal it reads. This is
   the check that makes a rename in either direction a hard failure instead of
   an AI that loads and does nothing. (The stub is authored here; no Blizzard
   file is redistributed.)
2. **Physics** — the ball model is replayed in Python with the constants
   **parsed from the shipped `.j`**, so it cannot drift from the map. It pins
   the ground roll against the closed form `v²/2a` (985 vs 1000), the bounce
   count and apex, and that a full kick carries **1353 units** and comes to
   rest in 2.5 s.
3. **Source guards** — properties an interpreter cannot reach: the order choke
   point is the only `IssuePointOrder` site, the physics constants are read
   live rather than copied, the PRNG is Park-Miller in Schrage form (gotcha
   29), the goal geometry comes from the rects, and none of seven cheat natives
   is called.

**All four probe classes were negative-controlled** — a copied constant, an
added cheat call, an out-of-range shoot threshold and an order issued outside
the choke point each make the harness fail. Two of them were caught
independently by the type checker as well.

**Differential pjass on the built script**: the injected `war3map.j` introduces
**exactly one** new error class versus the unmodified one — `Undeclared
function GetUnitMoveSpeed`, a native the original map simply never calls. There
is no `common.j` in this repo (it must never be committed), so pjass runs in
grammar-only mode where every native reads as undeclared; the *differential* is
the check, and it shows the injection adds no structural error. With a
user-supplied game API in `WC3_JASS_API_DIR` this becomes a full check.

The harness earned its keep immediately: it caught that `BAI_SHOOT_RANGE` was
**1500 when a kick only carries 1353**, i.e. the AI as first written would have
shot from where the ball stops short of the goal.

## Honest gap — read this before iterating

1. **It has never been run.** Not in the game, and not in a simulator — the
   toolkit's `lib/sim` is Lua-only and this map is JASS. Everything above says
   the AI does what it says with the map's own numbers; **nothing says it plays
   well, or that it plays at all.** The first playtest will produce the real
   list, exactly as it did for the Fall of Rome AI.
2. **The decision layer is a model, not an execution.** The physics tier is
   genuinely joined to the map (constants parsed from the `.j`); the tactical
   layer is joined only by source guards. No test plays a possession.
3. **Two runtime inferences are load-bearing and unverified.**
   (a) `Sprint`'s order string is inferred from its base ability, so the module
   **self-verifies at runtime**: if the buff does not appear it stops trying.
   (b) `Slam` and `Powershot` use order strings that ARE declared in the object
   data (`sacrifice`, `parasite`) — those are facts. `Kick` is called through
   the map's own `s__Ball_castUtil`, a labelled equivalence rather than an
   order-string guess (DESIGN.md §5).
4. **Slot takeover creates an athlete directly.** A slot that never picked gets
   one `CreateUnit` + the map's own `Pick___addAbilities`, bypassing the tavern
   purchase and therefore the hat, skin and stats bookkeeping the map does
   around `Pick___pick`. It is the least-verified part of the module and the
   most likely thing to look wrong in game.
5. **One athlete class is hard-coded** (`h00P`, kick + sprint + slam). There is
   no class-selection logic and no per-class play at all: Curveshot, Jump,
   Possess, Metamorph and the rest are unused, so the AI plays every hero as if
   it were the same hero.
6. **No team play beyond geometry.** Passing looks only at who is closer to
   goal with a clear corridor — no give-and-go, no off-ball runs into space, no
   marking assignments, no set-piece behaviour after a goal.
7. **The lane test is a corridor, not a trace.** It does not know the ball
   bounces over a defender, so it will refuse some shots that would work and
   take some that a defender blocks at ankle height.
8. **The keeper cannot use height.** `Jump` exists and goals are height-gated
   (below 300), which is the single most obvious keeper mechanic in the map, and
   it is unimplemented.

Iteration order: **(1)** play it once and collect the real list; (2) per-class
ability play, starting with the keeper's `Jump`; (3) off-ball movement worth the
name; (4) a proper shot model that respects bounce height.

## Prior art — the broad claim was wrong

An earlier version of this README leaned on "no good custom-map AI exists".
That is too strong and should not be repeated: WC3 custom-map bots issuing
combat-tempo unit orders long predate this. A 2011 Hero AI framework for arena
maps issues `move`/`attack`/target orders from its own action loop; DotA AI
maps are documented from 2006 onward; there is published AI research on a
Tower Line Wars variant.

The defensible claim is much narrower: **no published prior art was found for a
Warcraft III custom-map bot playing continuous 5v5 ball-sport through in-engine
orders, with predictive interception, reach-time pass evaluation and dynamic
marking.** No counterexample has turned up, but proving that negative would
need a far wider trawl of old maps whose source was never published.

Related: `docs/reference/wc3-ai-prior-art.md` (read it with the correction
above in mind), `scripts/experimental/rome-ai/` (the same exercise on a
strategy map, and the source of the order-economy lesson applied here from day
one).
