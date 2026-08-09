# rome-ai (experimental)

A **self-directed AI computer player** for *Fall of Rome 1.06* by
**ToaNoah** (wc3maps id 421339). Source only — the map and any build of
it are third-party and are NOT committed (gotcha 9 / Legal). Any
derivative you produce must credit ToaNoah.

Written 2026-08-09. **Never run in the real game.** Read §"Honest gap"
before trusting any number in here.

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

`for-ai.j` — 1,326 lines of JASS: PRNG, combat valuation, point
registry, sliced world scan, six goal scorers, selection, execution,
micro, and slot takeover. Six goals are scored every tick from
observable state and the highest wins: CONSOLIDATE, DEFEND, EXPAND,
SIEGE, TECH, RETREAT. Selection carries a +0.12 incumbency bonus and a
9-second dwell so near-equal goals cannot vibrate, with DEFEND and
RETREAT preemptive so an attack lands within one tick.

The hard cases are handled explicitly rather than reflexively:
- **Attacked while committed** — the army *splits*; the field force
  recalls only when the threat exceeds 1.30× the garrison AND the asset
  at risk outvalues the current objective.
- **Not defending a lost position** — a write-off term collapses DEFEND
  when the threat exceeds 2.2× (army + garrison) and no capital is
  involved.
- **Deadline pressure** — siege appetite carries `(0.30 + 0.95 × clock)`,
  so posture shifts with time *and* strength; a weak AI correctly never
  commits.

**Fog is respected** — enemy strength counts only units passing
`IsUnitVisible`. Static point geography is treated as known and declared
as such (map layout, not live state); dynamic ownership and defence are
remembered per player with a staleness discount. **No resource
cheating**: the `AI_HANDICAP` hook exists, defaults to 1.0, and is
labelled a cheat. Difficulty is latency + score noise + micro on/off.
One Park-Miller stream via Schrage (gotcha 29); randomness is spent on
target tie-breaks and composition and deliberately **withheld** from
retreat, write-off and capital thresholds.

The map declares all 12 slots `MAP_CONTROL_USER`, so the AI self-enables
on any slot that is empty or computer-controlled — the valuable case,
since an empty slot otherwise leaves ~100 structures and a capital inert.

## Files

- `for-ai.j` — the AI module.
- `DESIGN.md` — full design with every scoring formula.
- `inject.py` — splits the module at injection (JASS allows one
  `globals` block and is single-pass, so globals go into the map's block
  and functions before `InitCustomTriggers`). Idempotent.
- `trace.py` — interprets the scoring subset **read from the shipped
  `.j`**, so it cannot drift from the code. Earned its keep: it caught
  two real design bugs — EXPAND normalised by capital value (capping an
  ordinary control point at 0.28, so expansion lost to everything), and
  an additive write-off that still left DEFEND winning at 0.72, i.e.
  failing exactly where the term existed.
- `lint_apostrophe.py` — the gotcha-34 delta lint (negative-controlled).

## Verification (all that was possible headlessly)

Full-mode pjass with real `common.j`/`Blizzard.j`: **Parse successful**,
and the unmodified map is also clean, so nothing hides in existing
noise. `validate-map` on the packed result: **191/192, 152 warnings —
identical to the unmodified map**. Decision trace over 10 world states:
10/10. Clock sweep with the world held fixed: EXPAND→SIEGE crossover
between t=300 and t=600. PRNG: 200,000 states identical to 64-bit
modmul, max intermediate < 2³¹.

**lib/sim cannot execute this map** — it is JASS, and the sim is
Lua-only. None of the above is a claim that the AI was *run*.

## Honest gap — read this before iterating

1. **We can tell it is coherent, not that it is correct.** Every
   threshold — 2.2× write-off, 1.15× retreat, `0.30 + 0.95·clock` — is a
   plausible number someone chose. The trace proves the AI does what the
   design says; nothing proves the design is right. **This is the
   biggest gap and it needs an eval environment before any number here
   is trustworthy.**
2. **No naval logic**, and that is near-disqualifying for some slots —
   63 shipyards, transports, a Mediterranean map, and the Vandals start
   in Africa and essentially cannot reach Rome without ships.
3. **Attack-move is not maneuver.** Mountain passes, closable gates and
   chokepoints are the map's real structure; this issues attack-move and
   trusts the engine, so it will walk armies into walls.
4. **No opponent modelling.** It scores *points*, never *players* — it
   cannot recognise which barbarian is doing the work, bait, anticipate a
   counter-attack, or use the alliance system.
5. **Squad economics are under-used.** 12 units for ~50 gold against a
   food cap means many cheap simultaneous raids on undefended points
   often beat one doomstack. This runs one field army.

Iteration order: **(1)** an eval harness so thresholds stop being
guesses; (2) multi-group army management; (3) naval; (4) opponent
modelling. Difficulty tuning is meaningless until (1) exists.

Related: `docs/reference/wc3-ai-prior-art.md` (why no good custom-map AI
exists), `docs/reference/wtoc-ai-spec.md` (the same analysis for a
harder target).
