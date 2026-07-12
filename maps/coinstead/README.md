# Coinstead

A **1-4 player co-op economy-defense map** (~35 minutes). The Stead
Company holds a lone trade Depot at the crossing of four toll roads:
every founder's Steward raises production chains, trades one SHARED
deterministic market, and keeps the towers fed — every tower shot burns
commodities, and an empty rack is an inert tower. Twenty raider waves
press the Depot; leaks cost shared company lives. Phase 1 shipped the
complete core game; **phase 2 (final)** adds the four generated identity
models, the generated field (roads/plaza/berm/decor), the Toolwright
upgrade ladder, the seeded contract board, the Tollman Skimmer and boss
affixes, and pins the whole default-seed playthrough as a 144-beat
golden run. Competitor matrix:
`docs/reference/economy-survival-comparison.md`.

In-game name: **"Coinstead"** (distinct internal name per CLAUDE.md
gotcha 17). Built and validated headlessly with wc3-map-toolkit;
compiled artifact: `maps/builds/coinstead.w3x`.

## The loop

- **Production** (Lua state, ticked every 5s): harvesters add raw goods
  to their owner's stock — Woodcamp +4 wood, Quarry +3 stone, Grainfield
  +5 grain, Orepit +2 ore. Refiners convert on fixed ratios — Sawmill
  3 wood -> 1 plank, Bakery 4 grain -> 2 bread, Smelter 3 ore -> 1 ingot,
  Toolworks 2 stone + 1 plank -> 1 tool. A short refiner converts
  NOTHING (inputs untouched, no partials).
- **Market** (every 30s cycle, ZERO randomness): one shared price per
  commodity (base: wood 2g / stone 3g / grain 1g / ore 5g / planks 8g /
  bread 4g / tools 15g / ingots 18g), 10% spread (buy 110% / sell 90%,
  integer cents, rounding against the trader). Elasticity: prices move
  1% per (8 x players) NET units traded in the cycle — buying pushes up,
  selling down — **hard-capped at 5% per commodity per cycle** (the
  anti-grief fix: no player can dump a price through the floor in one
  sitting), clamped to 25%..400% of base.
- **Income by commitment** (Gold TD's lesson, credited): at each cycle
  end every founder is paid a dividend of **25% of the market value of
  what they PRODUCED that cycle**, +1% per 200g invested in *standing*
  buildings (max +25%), +8% per bread auto-eaten (max 3/cycle — the
  bounded consumable). **A building's stake dies with it** — kill the
  quarry and both its output and its commitment bonus are gone. **Idle
  cash earns NOTHING**: there is no interest in Coinstead.
- **Ammo-hungry defense**: Watchtower shots burn 1 plank, Cannon Tower
  shots burn 1 ingot, drawn from the owner's stock on the DAMAGING event
  (real engine attacks in the game; `sim.damage` in the harness). Dry
  rack: the shot is zeroed and the tower goes **INERT** (paused) until
  the owner restocks (production tick or any trade rearms it).
- **Toolwright ladder** (phase 2; Economy TD's blacksmith idea, bounded
  and credited): three per-founder tiers paid in COMMODITIES, never gold
  (`-forge buy`) — **Bench** (4 tools + 6 planks: harvesters +1/tick),
  **Works** (8 tools + 4 ingots: refiners +1/batch), **Charter**
  (12 tools + 8 ingots: towers burn ammo only every SECOND shot).
  Spend-goods-to-improve keeps the late-game economy circulating. No
  PRNG; each tier is worth 100 score.
- **Contracts** (phase 2): after every 4th wave (4/8/12/16) the board
  posts a SEEDED choice of two from four templates (`-contract a|b`, one
  active max, board lapses at the next launch): **Plank Consignment**
  (deliver 30 planks in 3 waves -> 120g lump each), **Provisions Order**
  (20 bread -> 90g each), **Trade Tariff** (+20% sell prices for 2
  cycles, next wave adds a 3-marauder squad), **Toll Concession** (-15%
  buy prices for 2 cycles, bounties halved for 2 waves). Delivery misses
  FAIL (score -25); fulfilled/resolved pacts score +75. The offer draws
  ALWAYS happen, so contract choices never shift the PRNG stream. Every
  state lands in RUNLOG (offer/accept/deliver/fulfilled/failed/
  resolved/lapsed).
- **Waves**: 75s grace with a scout raid at 45s (fixed composition — no
  PRNG before the seed can lock), then 20 authored waves from 6
  archetypes — Raider Cutpurse (swarm), Ironhide Marauder (armored),
  Dust Runner (fast), Tunnel Sapper (siege: ordered onto the nearest
  production building), the **Tollman Skimmer** (phase 2: rides waves
  11/15/18; a leak also skims 25g from EVERY founder's purse), and the
  **Toll Baron** boss who **actually spawns** on waves 10 and 20 (fixing
  Economy TD's dead boss code, credited) — each boss entry drawing a
  seeded **affix** (phase 2): Ironclad (+35% hp), Swift (+70 speed) or
  Greedy (leak 7, bounty 250). Non-boss counts scale x(1 + 0.25 per
  extra player) (ceil); swarm entries jitter +-1 through the seeded
  PRNG; bosses are authored counts. Raider hp scales +6%/wave
  (`WaveHpOf`, pushed via BlzSetUnitMaxHP). Leaks cost 1 shared life
  (boss 5, affix-dependent); zero lives — or a razed Depot — is defeat,
  always with the score line.
- **Victory & score**: wave 20 cleared = victory —
  `Score = coin + goods (at sell prices) + standing stakes + 50/life +
  market profit + 100/forge tier + 75/contract done - 25/contract
  failed` — then a 60s window to type `-endless` (waves resume,
  composition growing +15% per wave past 20) before the win screen.
- **Seed** (gotchas 29/30): every draw (wave edge, swarm jitter) flows
  through ONE Park-Miller/Schrage PRNG (bit-identical under 64-bit game
  Lua and the sim's 32-bit fengari). `-seed N` (1-9 digits, the width
  guard from vaults' ParseNumArg precedent) reseeds and resets the run
  log until the seed **locks at the first commitment point: the first
  successful market trade or the first wave launch**, whichever comes
  first — refused after, with feedback. Default seed 20260712. A
  machine-readable run log (`RUNLOG`) records every beat: seed, seedlock,
  builds, trades, market moves, dividends, bread, raids, wave starts
  (with edge + exact composition + boss affixes + pact squads), leaks,
  skims, tower inert/rearm, forge tiers, every contract state, building/
  steward losses, verdicts + score. **The full default-seed playthrough
  is pinned** (phase 2, gotcha 30): tests/golden-run.test.js drives a
  complete 20-wave solo victory and `deepStrictEqual`s all **144 beats**
  byte-exact — any drift names the beat.

## Command table

| Command | Gate | Effect |
| --- | --- | --- |
| `-help` | always | loop summary + seed rule + credits |
| `-price` | always | every commodity: price, buy/sell, net flow |
| `-eco` | always | your buildings, stock, stake, last dividend, inert towers |
| `-lives` | always | shared lives + wave phase |
| `-buy <good> <qty>` / `-sell <good> <qty>` | always | trade the shared market (locks the seed) |
| `-forge` / `-forge buy` | always | show the Toolwright ladder / pay the next tier in goods |
| `-contract` / `-contract a\|b` | always | read the board / sign a posted contract (one active max) |
| `-deliver <qty>` | delivery contract open | contribute goods from your stock |
| `-seed N` | before any trade/wave | reseed + reset the run log (1-9 digits) |
| `-endless` | after the wave-20 victory | keep playing against growing raids |
| `-test` | always | toggle debug mode (gates everything below) |
| `-gold N` / `-stock <good> N` | -test | set gold / a commodity stock |
| `-build <key>` | -test | place a finished building free (same registration path as engine construction) |
| `-wave` / `-wavejump N` | -test | launch the next wave now / make wave N next |
| `-setlives N` / `-clearwave` | -test | set lives / sweep the field |
| `-ff` | -test | 4x clock |
| `-runlog` | -test | print the deterministic run log |

## Layout / data flow

- `assets/` (phase 2, regenerate — don't hand-edit; gotcha 6: after
  regenerating run `build-map --stabilize` once and commit the
  stabilized JSON):
  - `generate-models.mjs` + `mdl-lib.mjs` (the northreach known-good MDL
    library) author the **four identity models** under
    `imports/war3mapImported/` — `CoinsteadDepot`, `MarketStall`,
    `CoinWatchtower`, `CannonKeep` — all sanityTest-clean (gotcha 14),
    team-color textured (ReplaceableId 1, nothing Blizzard-authored).
    Object-data `umdl` FIELDS use `.mdl`, archive members stay `.mdx`
    (gotcha 22).
  - `generate-terrain.mjs` paints `terrain.json` (64x64 Lordaeron
    Summer: four dirt toll roads from the spawn edges, a paved plaza, a
    raised earthwork berm ring — heightfield only, deliberately NO
    cliffs so raider pathing is never in doubt) and `doodads.json` (tree
    lanes flanking the roads, corner groves, rock clusters; keep-out
    zones asserted). wpm/shd/minimap stay auto-generated (gotchas 8, 12).
- `units.json`: the four start locations + the neutral Market Stall
  (`h00C`, the market's street face at the plaza edge); the Depot and
  Stewards are script-spawned for SEATED players (1-4 co-op). One allied
  force ("The Stead Company"), the tidewatch/vaults `config()` pattern
  (gotcha 18) plus runtime alliances (gotcha 24).
- `regions.json` `DepotCore` is the leak rect, read through the generated
  `REGION_DEPOT_CORE` constant; all object types go through `UNIT_*`
  constants (gotcha 27; index: `constants.json`).
- `objects-units.json`: Steward (hpea base; `AInv,AHbu,Ahrp` — the
  build+repair pair, gotcha 25; builds all ten structures), 4 harvesters,
  4 refiners, 2 towers, the Depot, the Market Stall, 6 raider
  archetypes. The four identity buildings carry generated `umdl` models
  (gotcha 23's full visible-identity sets); the other clones keep bases
  whose stock model IS the identity, with `unam`/`utip`/`utub` + stats
  carrying the rest. Building costs (`ugol`, `ulum` 0) mirror the
  script's `BUILD_DEFS`.
- **Data-driven Lua tables**: `COMMODITIES` (8), `BUILD_DEFS`/`BUILD_ORDER`
  (10), `ARCHETYPES` (6), `BOSS_AFFIXES` (3), `WAVES` (20),
  `FORGE_TIERS` (3), `CONTRACTS`/`CONTRACT_ORDER` (4), `EDGE_POS`.
  Script-level state is GLOBAL (gotcha 28): the packed main chunk
  declares 38 locals (preflight's chunk-locals measure; headroom 162 to
  the 200-local engine cap). All market arithmetic is integer cents; every scripted
  iteration that feeds the log runs over arrays, never `pairs`, so run
  logs replay byte-identically.

## Test coverage (tests/)

`node tools/test-map-logic.js maps/coinstead` — **56 tests**, all
executing the packed script in lib/sim (docs/PIPELINE.md §8), at **100%
script line coverage**:

- **economy.test.js** — shell (alliances/depot/stewards/ledgers), every
  harvester rate and refiner ratio (incl. the starved-refiner no-partials
  rule), dividend math (25% + commitment + bread, exact golds), stake
  loss on building death, no idle interest, spread + elasticity + the 5%
  move cap + the price floor clamp + net-flow reset, trade guards,
  market determinism, ammo draw/inert/rearm (both towers), non-tower
  damage neutrality, the engine construct-finish path.
- **waves.test.js** — grace + scout raid timing, leak lives (scout, boss
  -5), exact composition per wave index at 1 and 4 players, seeded jitter
  bounds + stability, **the boss really spawning**, wave-hp bookkeeping,
  clear bounties, victory + score arithmetic + the -endless window and
  growth, depot-razed defeat, lives-zero defeat, steward respawn, sapper
  targeting, seed determinism (byte-identical run logs) + the 9-digit
  guard + the post-lock refusal.
- **commands.test.js** — the -test debug gate, every info command, debug
  command edges, silent unknown-command handling.
- **forge-contracts.test.js** (phase 2) — the Toolwright ladder (goods
  paid, never gold; all three tier effects incl. the Charter's shot
  parity meeting the dry-rack rule; the bounded top), the Skimmer's
  purse-skim on leak (clamped at 0), all three boss affixes on pinned
  seeds, and every contract state: seeded distinct offers every 4th
  wave, lapse at launch, delivery progress/clamps/fulfillment lump,
  deadline failure, tariff sell-boost + owed squad (both spawn-edge
  branches) + resolution, toll buy-discount + halved bounties +
  resolution, one-active-max, and the offers-always-draw PRNG rule.
- **golden-run.test.js** (phase 2, gotcha 30) — the pinned default-seed
  playthrough: a scripted full 20-wave solo victory (economy founding, a
  scout leak, seedlock by trade, a dry watchtower restocked, all three
  forge tiers, tariff resolved + provisions fulfilled + a lapsed board +
  toll ridden through its halved bounties, two greedy-affixed boss
  waves, retirement at score 23014) with all **144 RUNLOG beats**
  `deepStrictEqual`-pinned byte-exact.

Sim honesty notes: tower attack rates, pathing and the raiders' walk are
engine work the sim cannot model — tests drive leaks with `sim.moveUnit`
and clears with `sim.kill`; every mechanic was designed so its STATE
TRANSITION is observable without pathing. The golden run's builds go
through the engine CONSTRUCT_FINISH event, but the sim does not charge
build-order gold the way the game does. Only the game proves the map
(CLAUDE.md validation doctrine); **Coinstead has never been loaded in
the real client** — it is sim-proven only (56 tests, the pinned golden
run, `npm run preflight` clean).

## Comparison

`docs/reference/economy-survival-comparison.md` — Coinstead vs the
decomposed Economy TD 0.29 and Gold TD and the surveyed Legion TD and
Line Tower Wars, with their wins in bold (Economy TD's logistics-chain
physicality and live price multiboard are real wins; our hauling-free
chains and chat-read market are conceded simplifications).

## Credits

Design inspirations, adapted with credit (also in-game: credits quest +
`-help`); no assets, code or text from these maps are used — the debt is
mechanical, from decomposition-driven study (scratchpad dossier,
2026-07-12):

- **Economy TD** (anonymous, EpicWar) — the economy-first tower-defense
  frame: income from production, not kills. Fixed here: its boss wave
  that never spawned actually spawns.
- **Gold TD** (EpicWar) — income committed to standing structures and
  lost with them; no interest on idle cash.
- **Legion TD** (AutoAttackGames) — legible, authored wave composition
  tables.
- **Line Tower Wars** (Hive Workshop) — leak-pressure pacing.
