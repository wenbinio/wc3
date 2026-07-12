# Pre-playtest preflight — 2026-07-12

The final gate before the two pending in-game playtests (vaults-of-ash:
never loaded in the real game; northreach: re-verification after its
post-playtest fixes). Two audits fed this program — a failure-class /
differential audit (checklists derived from our own crash postmortems,
diffed against the game-verified bundled maps) and a 64-bit Lua
cross-execution check (native lua5.3 vs the 32-bit fengari sim) — plus
the fix-and-cover pass documented here. Everything condensed; the audits
were run against HEAD `e980feb`.

## What was checked

### Failure-class checklist (both maps): ALL PASS, one WARN

`validate-map`: **zero FAIL / zero WARN** on all five bundled maps
(vaults 38/38, northreach 35/35). Every checklist row from the
pick-time / load-time / runtime failure classes (CLAUDE.md "Testing &
validation doctrine") passes for both maps, with ONE warning:

- **vaults main-chunk locals: 169 declared / 141 peak-active** — 85% of
  Lua's 200-locals-per-function cap (gotcha 28); the other verified maps
  top out at 94. The chunk **loads fine today** (proven under native
  luac5.3 and fengari); the risk is to FUTURE edits. Caution recorded in
  maps/vaults-of-ash/README.md and CLAUDE.md.

### Differential findings (vaults vs the game-verified maps), with risk reads

1. **169/141 main-chunk locals** — the WARN above; loads today, future
   headroom risk only.
2. **Empty war3map.doo** (decor done with neutral units) — very low;
   the game reads placements from the compiled script (gotcha 10).
3. **Object-data names as literal strings, not TRIGSTR** — very low;
   the game-verified demo ships the same.
4. **Tileset D (Dungeon)** — low; stock tileset, every FourCC in the
   FORMATS.md tables.
5. **128x128 — largest bundled map** — perf-class only.
6. **All combat runtime-spawned** (no preplaced hostiles) — sim-invisible
   pathing dependence; see residual risk 2.
7. **mmp holds start locations only** — benign; picker renders fine.

northreach: nothing structurally unique; all four past playtest bugs
(gotchas 22-25) re-verified fixed and pinned by tests.

Incidental docs gap (now fixed): tidewatch-arena's game-verified cliff
FourCCs `CNc1`/`CNc2` were absent from FORMATS.md's tables.

### Cross-execution check (64-bit lua5.3 vs 32-bit fengari)

All five packed scripts **compile under native lua5.3** (64-bit).
Chunk-load + locals headroom:

| map | main-chunk locals (declared) | peak-active | headroom to 200 |
| --- | --- | --- | --- |
| demo | 0 | — | 200 |
| tidewatch-arena | 19 | — | 181 |
| crossroads-siege | 60 | — | 140 |
| northreach | 94 | — | 106 |
| vaults-of-ash | **169** | 141 | **31 (59 by peak)** |

**PRNG bit-exactness (gotcha 29, now MEASURED)**: the Park-Miller/Schrage
block is byte-identical between 32-bit fengari and 64-bit lua5.3 over
6 seeds x 100k draws, plus the RandInt mappings and ShuffledIndices
dumps — **720k+ states, zero divergence**; NextRand doubles bit-identical.
No bitwise ops anywhere in any script; floor divisions all on small game
quantities; no `math.random`/`os.time`/`GetLocalPlayer` in vaults.

**The ONE divergence found**: `-seed` acceptance for N >= 2^31 — the
game (64-bit) accepted `math.tointeger(tonumber(seedArg))` and modded it
into range, while the sim (32-bit) failed `math.tointeger` and silently
fell back to DEFAULT_SEED. A real-game run started with e.g.
`-seed 5000000000` could NOT be replayed headlessly. The same
`math.tointeger(tonumber(...))` pattern sat in the debug commands
(`-floor`/`-room` danger/`-embers`/`-wrath`/`-insight`).

## What was fixed (this pass)

1. **The `-seed` width divergence — fixed by construction**
   (maps/vaults-of-ash/war3map.lua): a global `ParseNumArg(s)` rejects
   any digit string longer than **9 digits** BEFORE `tonumber` runs, so
   both integer widths accept exactly the same strings (max 999999999
   < 2^31). Over-wide seeds are now REJECTED with feedback ("Seeds run
   1 to 9 digits...", the existing gray-Tell refusal style) instead of
   silently defaulting; all five debug numeric args share the guard
   (over-wide values fall to each command's documented default,
   identically in both widths). `-help` documents the limit; README
   updated. **Golden run: unshifted** — the default-seed path is
   untouched (verified: the 61-beat golden-run test passes bit-exact;
   no re-pin needed under PIPELINE §8).

2. **Consequential coverage gaps closed** (line coverage via
   `test-map-logic.js --coverage`):

   - **vaults-of-ash: 93.9% (1592/1696) -> 96.1% (1637/1703)**, 70 -> 81
     logic tests. New `tests/edges.test.js` (11 tests) walks: the -seed
     guard (rejection + 9-digit max + debug-arg defaults); every
     formerly-untested **HandleDeath** arm — Lightwarden's Oath rally on
     a partial wipe, Revenant felled by a NON-hero (bounty falls back to
     a living torchbearer), bounty-pool refill when no rare+ boon
     remains, Bloodtithe Pact on the Guardian kill, the Vampiric 8%
     drink (pinned seed 18); **SpawnBossAdds**' ring pattern (Shard Ring
     phase 3, seed 7: 4 shards on an exact 384 ring); and the
     **ClearRoom** edges — relic-reward door (seed 12), Blood 3pc
     clear-heal, Stormheart Core stacking, mid/slow wrath tiers and the
     Stillness slow-clear Insight. Remaining misses are chat/debug arms,
     cosmetic branches and defensive guards — deliberately unchased.
   - **northreach: 87.2% (496/569) -> 89.5% (509/569)**, 10 -> 13 logic
     tests. New `tests/nightday.test.js` advances the virtual clock
     across the full cycle: nightfall during grace (docile), the
     grace-end surge, **DayBreaks** (dawn announcement + wolf-phase
     reset: acquire range and speed back to defaults), the second-night
     **NightBegins -> WolfSurge** path with its surge-level-2 dire
     wolves, wolf pelt drop + phase-honoring respawn, and
     **DeclareEndgame**'s already-declared refusal.

3. **Docs**: `CNc1`/`CNc2` added to FORMATS.md's cliff tables
   (game-verified, indexed cliff-id dialect).

4. **Artifacts**: maps/builds/vaults-of-ash.w3x regenerated (script-only
   edit; no --stabilize needed — the freshness guard confirmed only
   war3map.lua diverged). validate-map 38/38 on the rebuilt artifact.

Suite: 373 -> **387 tests, green on both MPQ backends** (`npm test` and
`npm run test:smpq`).

## Honest residual risks (only the game can test these)

1. **Ability data-field interpretation** — 8 custom abilities on
   ACtc/ACev/ACct/ACbh/AEbl bases; the sim has no ability engine.
   Partially mitigated: the game-verified crossroads-siege shipped an
   ACtc-based custom ability.
2. **Pathing / spatial reachability — vaults' single biggest untested
   surface**: the run's flow is region-enter triggers fired by units
   WALKING corridors; the sim teleports. A blocking doodad, unwalkable
   tile or misplaced door soft-locks the run invisibly.
3. **Stock-asset path typos** — 40+ icon/model paths referenced by
   in-game path; unverifiable without game data (a typo = invisible
   unit/green icon, no error).
4. **Critter-based door/brazier units** — engine edge behaviors (wander,
   targeting) of the critter base class are not simulated.
5. **Multiplayer latency interleavings** of chat commitments — classic
   desync hazards are absent (no GetLocalPlayer, integer-portable PRNG),
   but interleaved commitment ordering is untested.
6. **Perf** of the 4 generated MDX under real rendering.
7. **The 169-locals margin** — safe today, tight for future edits
   (globals-only rule in the vaults README).

## Recommended in-game protocol

- **vaults-of-ash (first real-game load)**: one solo run on the DEFAULT
  seed, compared beat-for-beat against the 61-beat golden run
  (`-runlog` in `-test` mode prints the live log; the pinned sequence is
  tests/golden-run.test.js). Any drift names the exact beat. Then walk
  every corridor/door on foot (residual risk 2) before trusting a co-op
  session. Variants for bisection need distinct internal names
  (gotcha 17, `--variant-name`).
- **northreach (re-verification)**: watch the two arms the sim can't
  fully vouch for in-game — the **dawn transition** (wolves must visibly
  slow/return at 6:00) and the **endgame declaration + purge**.
