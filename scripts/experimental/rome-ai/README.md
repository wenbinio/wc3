# rome-ai (experimental)

A **self-directed AI computer player** for *Fall of Rome 1.06* by
**ToaNoah** (wc3maps id 421339). Source only — the map and any build of
it are third-party and are NOT committed (gotcha 9 / Legal). Any
derivative you produce must credit ToaNoah.

Written 2026-08-09; **rounds 2, 3 and 4 the same day, all driven by real
playtests.** Read §"Honest gap" before trusting any number in here.

## The map, in one paragraph

Not a melee RTS. 12 players — 3 Romans vs 9 barbarians — on a hard
30-minute clock with no workers. Cities are **captured, not destroyed**:
attack a settlement below 500 HP and it flips to you instantly at full
health, and can flip straight back. Rome wins by default if it still
holds Rome or Constantinople when the timer expires, so every barbarian
action is instrumental against a deadline. There is no `ubui` anywhere —
construction is an upgrade path — and every train order spawns a squad
of 12, so with a 100 food cap **food binds, not gold**: the question is
always where the capped army goes.

## What this is

`for-ai.j` — ~2,600 lines of JASS: PRNG, combat valuation, a structure
value table, point/gate registries and a land-connectivity graph, sliced
world scan, six goal scorers under a persistent posture layer, selection,
corridor-based approach routing, naval transport, hero policy, a shared
claim ledger, execution, micro, messaging, and slot takeover. Six goals are scored every tick from observable state and the
highest wins: CONSOLIDATE, DEFEND, EXPAND, SIEGE, TECH, RETREAT.
Selection carries a +0.12 incumbency bonus and a 9-second dwell so
near-equal goals cannot vibrate, with DEFEND and RETREAT preemptive so
an attack lands within one tick.

The hard cases are handled explicitly rather than reflexively:
- **Attacked while committed** — the army *splits*; only a capped slice
  responds, and the field force is recalled only when the garrison is
  genuinely outmatched AND the asset at risk outvalues the objective.
- **Not defending a lost position** — a write-off term collapses DEFEND
  when the threat exceeds 1.60× the whole army and no capital is involved.
- **Deadline pressure** — capital appetite is gated on *readiness*: a
  clock window that opens at t=810 and saturates by t=1440, times the
  force ratio against the garrison it can actually see. Early a capital
  is worth less than one control point; late with a real army it is
  decisive. A weak AI correctly never commits.
- **Walls** — it picks a crossing before it marches, by projecting every
  gate onto the whole `field → objective` segment and crossing walls
  nearest-first. An existing hole is free, our own gate is nearly free
  (we just open it), an enemy gate costs a siege priced by how much of it
  is left — and when a siege is genuinely required it attacks *that
  gate*, not the objective behind it. A blocked exit is a first-class
  failure state with a stall backstop behind it.
- **Water** — if the objective is on another landmass it boards a
  transport, crosses and unloads. Transport only; there is no naval
  combat model and there will not be one.

**Fog is respected** — enemy strength counts only units passing
`IsUnitVisible`. Static point geography is treated as known and declared
as such (map layout, not live state); dynamic ownership and defence are
remembered per player with a staleness discount. **No resource
cheating**: the `AI_HANDICAP` hook exists, defaults to 1.0, and is
labelled a cheat. Difficulty is latency + score noise + micro on/off.
One Park-Miller stream via Schrage (gotcha 29); randomness is spent on
target tie-breaks and composition and deliberately **withheld** from
retreat, write-off and capital thresholds. One further labelled
equivalence: the AI toggles gates it **owns** by direct unit replacement
(what the map's own trigger does) under the map's own 20 s cooldown,
because the custom ability's order string cannot be verified headlessly —
DESIGN.md §8.3.

The map declares all 12 slots `MAP_CONTROL_USER`, so the AI self-enables
on any slot that is empty or computer-controlled — the valuable case,
since an empty slot otherwise leaves ~100 structures and a capital inert.

## Files

- `for-ai.j` — the AI module.
- `DESIGN.md` — full design with every scoring formula; §8 is the
  round-2 playtest record, §9 the round-3 diagnosis, §10 what round 3
  shipped, and §11 round 4 (including §11.0, a correction to §10.5).
- `inject.py` — splits the module at injection (JASS allows one
  `globals` block and is single-pass, so globals go into the map's block
  and functions before `InitCustomTriggers`). Idempotent. Point it at a
  working copy with `FORAI_WORK=<dir>` (that dir needs `extract/`).
- `trace.py` — interprets the scoring subset **read from the shipped
  `.j`**, so it cannot drift from the code, plus source assertions and an
  issuance model for things an interpreter cannot reach. Earned its keep
  four times now: EXPAND normalised by capital value; an additive
  write-off that still left DEFEND winning; and in round 2 the shipyard
  ordering and the recall predicate.
- `describe.js` — the player-facing text overlay: gives the build a
  distinct internal name containing "AI" (gotcha 17), appends the
  all-empty-slots-are-AI notice to the picker description, credits
  ToaNoah, and echoes both on the loading screen. Appends, never
  replaces; goes through `lib/wts.js` so the file's byte dialect
  survives (gotcha 35); idempotent. DESIGN.md §8.7.
- `lint_apostrophe.py` — the gotcha-34 delta lint (negative-controlled).

## Verification (all that was possible headlessly)

Full-mode pjass with real `common.j`/`Blizzard.j`: **Parse successful,
58,625 lines**, and the unmodified map is also clean, so nothing hides in
existing noise. `validate-map` on the packed result: **191/192, 152
warnings — identical to the unmodified map**. `trace.py`: **exit 0, 0
FAILs across 14 sections** — 13/13 goal scenarios, order-economy and
round-3 source guards, value ordering, routing, gates, the strategic
layer, tribes, formation, consort, raze-or-hold, heroes, naval, defence,
and PRNG bit-exact over 200,000 states. `npm test` 617/0; `npm run
preflight` 0 FAILs.

**Thirteen negative controls**, because a probe that cannot fail proves
nothing — this repo has shipped five such probes before (gotcha 34).
Guard A (force `AI_GATE_BREAK` to 0 and the intact gate must win
instead), Guard B in both directions, the naval lift with `wantBoat`
false, hero hysteresis versus a single threshold (2 transitions vs 8),
the hold gate with `AI_HOLD_DIST` = 0, dispersal with `AI_LANES` = 1, and
from round 4: the deadlock gate neutralised (which reproduces the round-3
numbers *exactly*, 0.533/0.225), the free-crossing corridor shrunk back to
round 3 (the breach vanishes and the army besieges), unrestricted terrain
restoring the full frontage, and the leash rather than the army radius
doing the rejecting.

**Round 4 also found two defects in the harness itself**, both the same
family as the thing they are meant to catch: an ABSENCE guard whose lazy
`.*?` walked past `endfunction` and matched a *later* function, reporting a
leak that did not exist; and a hero-leash test that recomputed the leash in
Python instead of running the shipped function, so it could not have
failed. Both are fixed; the lesson is that a guard which can match outside
what it claims to check is as worthless as a probe that cannot fire.

**lib/sim cannot execute this map** — it is JASS, and the sim is
Lua-only. None of the above is a claim that the AI was *run*; the one
time it ran, it ran in the game, and that produced the round-2 list.

## Honest gap — read this before iterating

1. **We can tell it is coherent, not that it is correct.** Every
   threshold — 1.60× write-off, 1.15× retreat, the t=810/1440 capital
   window, the hold-versus-raze premiums, the tribal role weights, and
   every number in the `AI_VAL_*` table — is a plausible number someone
   chose. **Round 4 sharpened this from a caveat into a measured fact:
   the two worst findings of that playtest — the CONSOLIDATE deadlock and
   the unbounded hero chase — were both invisible to a 190-assertion trace
   that passed completely.** Neither was wrong at any single tick; both
   were wrong over time. A trace pins decisions, and a decision can be
   right every second and wrong every game. The trace proves the AI does what the design says;
   nothing proves the design is right. **This is still the biggest gap
   and it needs an eval environment before any number here is
   trustworthy.** Round 2 is evidence for the claim: five of the design's
   confident numbers were wrong in ways only a human playing the map
   found.
2. ~~**No naval logic**, and that is near-disqualifying for some slots —
   63 shipyards, transports, a Mediterranean map, and the Vandals start
   in Africa and essentially cannot reach Rome without ships.~~
   **Retired — this was a headless inference and the playtest plus a
   pathing-map flood fill overturned it.** Naval *warfare* is worthless
   in this map (the owner played it), so shipyards are near-zero-value
   targets, not a gap. Naval *transport* is a real but much smaller
   thing: flood-filling `war3map.wpm` three ways shows **exactly one of
   twelve slots is water-locked** — P6 Britons — and the Vandals walk to
   both capitals. The Britons also have eleven enemy holdings on their
   own island to fight over, so they are not inert. Transport is now
   **built** (round 3, DESIGN.md §10.2): a land-connectivity graph, a
   three-state board/cross/unload machine, and a conditional shipyard
   value lift narrow enough that it cannot outbid a real objective.
3. ~~**Attack-move is not maneuver.**~~ **Mostly closed.** Round 3
   replaced round 2's objective-anchored gate search with a corridor test
   against the whole march segment, crossing walls nearest-first, and
   added a stall backstop that force-opens a gate when the army stops
   making ground — which covers chokepoints the gate model knows nothing
   about. What is still missing is a *real* connectivity graph for
   land: mountain passes, bridges and open chokepoints are still
   unmodelled, and the land graph that does exist is coarse (a point
   graph, used only to decide whether an objective needs a boat).
4. **No opponent modelling.** It scores *points*, never *players* — it
   cannot recognise which barbarian is doing the work, bait, anticipate a
   counter-attack, or use the alliance system.
5. ~~**Squad economics are under-used.**~~ **Partly closed.** Round 3
   added the harasser role (one AI per front raids outlying undefended
   points with cavalry, concurrently with the push) and lane-based
   dispersal, so the army is no longer a single point-destination blob.
   Still missing: a general multi-group army manager. Every AI that is
   not the harasser still runs one field force.
6. **The order-economy numbers are a model, not a measurement.** The
   7.3×/11.1× reduction counts order *calls* under the shipped policy,
   joined to the code by source assertions. Nobody has measured the
   game's frame time. If the next playtest still stutters, the cause is
   somewhere this model does not look — most likely the group
   enumerations in `AI_ScanWorld` and `AI_RefreshPointMemory`, which are
   per-player per-think and were only sliced, not eliminated.

**Round 3 (2026-08-09) is IMPLEMENTED** — DESIGN.md §9 diagnosed it, §10
is what shipped: all ten queue items plus both round-2 bugs (the gate jam,
naval transport, messaging, readiness-gated capital value, heroes, raze-or-
hold, the claim ledger and harassers, rams, tribal preferences, dispersal).

**Round 4 (2026-08-09) is IMPLEMENTED** — DESIGN.md §11. Playtest 4 played
the round-3 build and produced six findings plus two follow-ups. All eight
landed, and one of them was a correction to this project's own diagnosis:

- **The passive-AI deadlock (findings 1, 2)** — *"Red also got stuck at the
  first city"*, with a screenshot of **this module's own chat line**,
  "Huns: massing at home", over 25-plus idle units. **A regression round 3
  introduced.** CONSOLIDATE weighted a pure clock ramp at 0.78 while round
  3 made the food cap real; together, a food-capped AI wanted an army it
  could never build, and the urge to sit at home *rose* all game
  (0.440 → 0.533 while EXPAND fell 0.333 → 0.225). Fixed with a
  **possibility gate** — massing only scores if massing can happen.
- **The bridge (finding 3)** — ~40 units piled on a bridge. Not a gate
  problem: the five-lane 1040-unit frontage is *physically impossible* on a
  bridge, so the lanes collapsed into a pile. The frontage is now
  **measured** against the engine's own pathing at the tightest point of
  the route, and collapses to single file where it must.
- **Gates as transit, not objectives (finding 7)** — a breach slightly off
  the direct line was invisible, so the army besieged a gate it never
  needed. The search radius now scales with what a crossing *saves*, and
  rams are bought only from the crossing decision.
- **The information leak (finding 4)** — Romans were reading barbarian
  plans off the AI's chat. Reports are now ally-scoped, per recipient, with
  no `GetLocalPlayer` anywhere.
- **The crossing phase rule (findings 5, 8)** — home landmass first;
  across-water objectives are suppressed until it is consolidated. Plus a
  genuine disagreement resolved: the owner wants the Vandals shipping, the
  flood fill says they can walk — both true, because the walk is via Egypt
  and Anatolia. **Connectivity was the wrong question**; a wet straight
  line over distance is much closer to the right one.
- **The hero leash (finding 6)** — the round-3 hunt was bounded by distance
  from the *army*, a moving reference, so it bounded nothing. Now anchored
  to the objective and to the formation.
- **The revive correction** — round 3 said "no revive trigger anywhere, so
  a dead hero is gone". The conclusion holds for this build; **the evidence
  did not support it**. The map advertises "Appoint a New General" (`R007`,
  250g+250l, in the Forge's list) and then disables it for every player at
  init. The AI now *asks the game* at runtime instead of assuming.

Order issuance is unchanged by round 4 — it changes *which* orders are
issued, not how many: peak/tick 1705 → 204 → **234**, mean/second
880.0 → 55.3 → **79.3**.

Iteration order from here: **(1)** an eval harness so thresholds stop being
guesses — round 4 sharpened why, see the honest gap below; (2) a land
*route-length* model, since round 4 established that connectivity is not
usefulness; (3) opponent modelling. Difficulty tuning is meaningless until
(1) exists.

Related: `docs/reference/wc3-ai-prior-art.md` (why no good custom-map AI
exists), `docs/reference/wtoc-ai-spec.md` (the same analysis for a
harder target).
