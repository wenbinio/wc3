# rome-ai (experimental)

A **self-directed AI computer player** for *Fall of Rome 1.06* by
**ToaNoah** (wc3maps id 421339). Source only — the map and any build of
it are third-party and are NOT committed (gotcha 9 / Legal). Any
derivative you produce must credit ToaNoah.

Written 2026-08-09; **round 2 the same day, driven by the first real
playtest.** Read §"Honest gap" before trusting any number in here.

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

`for-ai.j` — ~1,970 lines of JASS: PRNG, combat valuation, a structure
value table, point and gate registries, sliced world scan, six goal
scorers, selection, approach routing, execution, micro, and slot
takeover. Six goals are scored every tick from observable state and the
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
- **Deadline pressure** — siege appetite carries `(0.30 + 0.95 × clock)`,
  so posture shifts with time *and* strength; a weak AI correctly never
  commits.
- **Walls** — it picks a crossing before it marches: an existing hole
  (open or destroyed gate) is free, a half-broken gate is cheaper than an
  intact one, and when a siege is genuinely required it attacks *that
  gate*, not the objective behind it.

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
  playtest-driven round-2 record.
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
- `lint_apostrophe.py` — the gotcha-34 delta lint (negative-controlled).

## Verification (all that was possible headlessly)

Full-mode pjass with real `common.j`/`Blizzard.j`: **Parse successful**,
and the unmodified map is also clean, so nothing hides in existing
noise. `validate-map` on the packed result: **191/192, 152 warnings —
identical to the unmodified map**. `trace.py`: 13/13 goal scenarios,
11/11 order-economy source guards, 8/8 value-ordering, 8/8 routing, 7/7
defence, PRNG bit-exact over 200,000 states. Order issuance model:
peak per tick 1705 → 204, mean per second 880 → 55.

**lib/sim cannot execute this map** — it is JASS, and the sim is
Lua-only. None of the above is a claim that the AI was *run*; the one
time it ran, it ran in the game, and that produced the round-2 list.

## Honest gap — read this before iterating

1. **We can tell it is coherent, not that it is correct.** Every
   threshold — 1.60× write-off, 1.15× retreat, `0.30 + 0.95·clock`, and
   now every number in the `AI_VAL_*` table — is a plausible number
   someone chose. The trace proves the AI does what the design says;
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
   own island to fight over, so they are not inert. Transport is
   **staged, not built**; the scoped plan and all the measurements are in
   DESIGN.md §8.6.
3. ~~**Attack-move is not maneuver.**~~ **Partly closed.** Round 2 added
   approach routing over a gate registry (DESIGN.md §8.3): the AI now
   chooses a wall crossing before it marches and sieges the gate itself
   when it has to. What is still missing is everything that is *not* a
   gate — mountain passes, bridges and open chokepoints are unmodelled,
   and there is still no connectivity graph, only a corridor test around
   the objective.
4. **No opponent modelling.** It scores *points*, never *players* — it
   cannot recognise which barbarian is doing the work, bait, anticipate a
   counter-attack, or use the alliance system.
5. **Squad economics are under-used.** 12 units for ~50 gold against a
   food cap means many cheap simultaneous raids on undefended points
   often beat one doomstack. This runs one field army.
6. **The order-economy numbers are a model, not a measurement.** The
   8.4×/15.9× reduction counts order *calls* under the shipped policy,
   joined to the code by source assertions. Nobody has measured the
   game's frame time. If the next playtest still stutters, the cause is
   somewhere this model does not look — most likely the group
   enumerations in `AI_ScanWorld` and `AI_RefreshPointMemory`, which are
   per-player per-think and were only sliced, not eliminated.

Iteration order: **(1)** an eval harness so thresholds stop being
guesses; (2) multi-group army management; (3) naval transport for P6
(DESIGN.md §8.6); (4) opponent modelling. Difficulty tuning is
meaningless until (1) exists.

Related: `docs/reference/wc3-ai-prior-art.md` (why no good custom-map AI
exists), `docs/reference/wtoc-ai-spec.md` (the same analysis for a
harder target).
