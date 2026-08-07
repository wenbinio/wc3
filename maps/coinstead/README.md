# Coinstead

**A map by Serendipity.** A **1-4 player co-op economy-defense map** (~35 minutes). The Stead
Company holds a lone trade Depot at the crossing of four toll roads:
every founder's Steward raises production chains, trades one SHARED
deterministic market, and keeps the towers fed — every tower shot burns
commodities, and an empty rack is an inert tower. Twenty raider waves
press the Depot; leaks cost shared company lives. Phase 1 shipped the
complete core game; phase 2 added the four generated identity
models, the generated field (roads/plaza/berm/decor), the Toolwright
upgrade ladder, the seeded contract board, the Tollman Skimmer and boss
affixes, and the pinned golden run; **phase 3 (final)** adopts the two
Economy TD wins the comparison doc conceded — goods become PHYSICAL
(item-charge stacks in building inventories, moved by transfer links,
spilled by raids) and the market gets a LIVE PRICE MULTIBOARD — and
re-pins the golden run at 159 beats. Competitor matrix:
`docs/reference/economy-survival-comparison.md`.

In-game name: **"Coinstead"** (distinct internal name per CLAUDE.md
gotcha 17). Built and validated headlessly with wc3-map-toolkit;
compiled artifact: `maps/builds/coinstead.w3x`.

## The loop

- **Goods are PHYSICAL** (phase 3; Economy TD's logistics idea, adapted
  with credit): every building stores its goods as **item charges** in
  its own 6-slot inventory — one commodity stack per slot, **200 charges
  per stack** (Economy TD ran 1000-charge stacks; our 6x200 buildings are
  deliberately tighter so slot pressure is a design constraint). The
  shared Depot and Market Stall hold stock too, their stacks **tagged
  per founder**. Overflow rule: a building whose output cannot fit
  **HALTS whole batches** (no partials, no silent waste) until a route
  frees space — the transition is announced.
- **Transfer links, not walking haulers** (Economy TD pumped item stacks
  between buildings with a Transfer ability; ours is a chat-commanded
  route, no unit ever walks): `-link <from> <to> [good]` opens a
  directed route pumping up to **5 charges/second**; buildings are
  addressed by stable names (`woodcamp1`, `sawmill2`, `depot`, `stall`
  — see `-eco`). Rules: **2 outgoing routes per building** per founder,
  **1200 range** (positions matter; pathing never does), optional
  per-route commodity filter, refiners never export their own inputs,
  towers never ship. **Links from one building are served in creation
  order** — a hungry first route starves the second; steer with filters
  and `-unlink`. Routes die with either endpoint.
- **Production** (ticked every 5s): harvesters store raw goods in their
  OWN slots — Woodcamp +4 wood, Quarry +3 stone, Grainfield +5 grain,
  Orepit +2 ore. Refiners eat inputs FROM their own slots and store
  their output — Sawmill 3 wood -> 1 plank, Bakery 4 grain -> 2 bread,
  Smelter 3 ore -> 1 ingot, Toolworks 2 stone + 1 plank -> 1 tool. A
  short refiner converts NOTHING (inputs untouched, no partials); an
  unsupplied refiner is just a warehouse.
- **Raid stakes** (phase 3): a razed building **SPILLS half its stored
  charges** (per commodity, floored) as ground item stacks; the rest
  burns. A **Steward that picks a spill up couriers it to the Depot**
  (credited to the recovering founder; surplus beyond the vault's free
  space is lost). Sappers that target production now threaten inventory
  too — defense and logistics are coupled.
- **Market** (every 30s cycle, ZERO randomness): one shared price per
  commodity (base: wood 2g / stone 3g / grain 1g / ore 5g / planks 8g /
  bread 4g / tools 15g / ingots 18g), 10% spread (buy 110% / sell 90%,
  integer cents, rounding against the trader). Elasticity: prices move
  1% per (8 x players) NET units traded in the cycle — buying pushes up,
  selling down — **hard-capped at 5% per commodity per cycle** (the
  anti-grief fix: no player can dump a price through the floor in one
  sitting), clamped to 25%..400% of base. **Trading is physical**
  (phase 3): `-sell` draws your goods AT the stall, `-buy` lands goods
  AT the stall (refused when they cannot fit); if the stall is razed
  the market is CLOSED.
- **The live price board** (phase 3; Economy TD's multiboard, adopted
  with credit): ONE shared multiboard — commodity, price, trend vs base
  (+n%/-n%/--), stall stock — refreshed on every trade, every market
  cycle, and (once a second at most) on stall arrivals. No
  GetLocalPlayer anywhere: the same board for every founder,
  desync-safe. `-price` keeps the chat readout (now with the stall
  column) as the sim/test surface.
- **Income by commitment** (Gold TD's lesson, credited): at each cycle
  end every founder is paid a dividend of **25% of the market value of
  what they PRODUCED that cycle, UNDERWRITTEN by their Depot reserve**
  (phase 3): the base is min(produced value, value of your goods banked
  at the Depot) — production pays only insofar as the vault backs it,
  so routing to the Depot is a real decision, yet **parked goods alone
  earn nothing** (the reserve is a cap, never a source — the no-idle-
  income doctrine survives physicality). Plus +1% per 200g invested in
  *standing* buildings (max +25%), +8% per bread auto-eaten **from the
  Depot** (max 3/cycle). **A building's stake dies with it** — kill the
  quarry and both its output and its commitment bonus are gone. **Idle
  cash earns NOTHING**: there is no interest in Coinstead.
- **Ammo-hungry defense**: Watchtower shots burn 1 plank, Cannon Tower
  shots burn 1 ingot, drawn from the TOWER'S OWN rack (its inventory —
  phase 3) on the DAMAGING event (real engine attacks in the game;
  `sim.damage` in the harness). Dry rack: the shot is zeroed and the
  tower goes **INERT** (paused) until charges land in its rack (a route
  pump or a debug `-stock` rearms it).
- **Toolwright ladder** (phase 2; Economy TD's blacksmith idea, bounded
  and credited): three per-founder tiers paid in COMMODITIES, never gold
  (`-forge buy`; phase 3: paid **from your Depot reserve** — pool the
  goods at the vault first) — **Bench** (4 tools + 6 planks: harvesters
  +1/tick), **Works** (8 tools + 4 ingots: refiners +1/batch),
  **Charter** (12 tools + 8 ingots: towers burn ammo only every SECOND
  shot). Spend-goods-to-improve keeps the late-game economy circulating.
  No PRNG; each tier is worth 100 score.
- **Contracts** (phase 2): after every 4th wave (4/8/12/16) the board
  posts a SEEDED choice of two from four templates (`-contract a|b`, one
  active max, board lapses at the next launch; phase 3: `-deliver` ships
  from your DEPOT stock — consignments are physical): **Plank Consignment**
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
  skims, tower inert/rearm, forge tiers, every contract state, link
  create/cut, spills and recoveries (phase 3), building/
  steward losses, verdicts + score. Links, pumps and storage draw NO
  PRNG — every transfer runs on the virtual clock in creation/slot
  order. **The full default-seed playthrough is pinned** (gotcha 30):
  tests/golden-run.test.js drives a complete 20-wave solo victory and
  `deepStrictEqual`s all **159 beats** byte-exact — any drift names the
  beat. (Phase 3 re-pinned it from 144 beats per PIPELINE §8's re-pin
  doctrine: the diff was reviewed beat-by-beat — the PRNG-derived beats
  are byte-identical, the new beats are the link/route classes, and the
  dividend values shifted exactly as the underwriting rule predicts.)

## Command table

| Command | Gate | Effect |
| --- | --- | --- |
| `-help` | always | loop summary + physicality rules + seed rule + credits |
| `-price` | always | every commodity: price, buy/sell, net flow, stall stock (the multiboard shows it live) |
| `-eco` | always | your buildings BY NAME with their stores, depot reserve, stall stock, routes, stake, last dividend, halted/inert flags |
| `-lives` | always | shared lives + wave phase |
| `-buy <good> <qty>` / `-sell <good> <qty>` | always | trade the shared market — goods land at / draw from THE STALL (locks the seed) |
| `-link <from> <to> [good]` | always | open a transfer route (5/s, 2 out per building, range 1200; names from -eco plus depot/stall) |
| `-unlink <from> <to>` / `-links` | always | cut a route / list your routes |
| `-forge` / `-forge buy` | always | show the Toolwright ladder / pay the next tier in goods from your Depot reserve |
| `-contract` / `-contract a\|b` | always | read the board / sign a posted contract (one active max) |
| `-deliver <qty>` | delivery contract open | ship goods from your Depot stock |
| `-seed N` | before any trade/wave | reseed + reset the run log (1-9 digits) |
| `-endless` | after the wave-20 victory | keep playing against growing raids |
| `-test` | always | toggle debug mode (gates everything below) |
| `-gold N` / `-stock [bldg] <good> N` | -test | set gold / set a commodity stack (default building: depot) |
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
    library) author the **four generated identity models** under
    `imports/war3mapImported/` — `CoinsteadDepot`, `MarketStall`,
    `CoinWatchtower`, `Orepit` (2026-08 art fix: dark pit
    ring + team-color crane) — all sanityTest-clean (gotcha 14),
    team-color textured (ReplaceableId 1, nothing Blizzard-authored).
    Object-data `umdl` FIELDS use `.mdl`, archive members stay `.mdx`
    (gotcha 22). The fifth identity model, the Cannon Tower's
    `SolCannonKeep.mdx`, is a **commissioned Sol round-2 model**
    (AI fleet Sol, GPT 5.6 Codex, 2026-08-07; provenance in
    `imports-credits.json`): it replaced the generated `CannonKeep.mdx`
    (the render-read's weakest silhouette) **after the 2026-08-07
    playtest**, same footprint/height, cosmetic-only (the 159-beat golden
    run is byte-identical). The generator entry was removed with the file
    (the SolLampPost precedent). **Next playtest should eyeball it** —
    the map's art was game-verified with the OLD model, so the
    Cannon Tower's look is the one un-verified piece.
  - `generate-icons.mjs` (2026-08 art fix) authors `BTNOrepit` +
    auto-derived `DISBTNOrepit` with `lib/icon.js` (BLP1 via Pillow, TGA
    fallback) under `imports/ReplaceableTextures/CommandButtons[Disabled]/`.
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
  archetypes. Phase 3: every storage building (all ten structures, the
  Depot AND the Stall) carries `uabi: "AInv"` — the engine inventory the
  physical stacks live in. **2026-08 art fix (gotcha 31)**: the 2026-08
  playtest found five visually identical farms (the hhou clone crowd), so
  every structure now carries a distinct visible identity — generated
  `umdl` models for the five signature pieces (Depot, Stall, both towers,
  Orepit), stock models BY PATH for the rest (Woodcamp -> Barn, Quarry ->
  GoldMine, Bakery -> WindMill; all paths listfile-verified in
  `lib/data/stock-art.json`), and explicit `uico` icons on every
  buildable/selectable structure (BTNBundleOfLumber/BTNGoldmine/BTNFarm/
  BTNCheese/generated BTNOrepit/BTNGuardTower/BTNCannonTower/
  BTNArcaneVault/BTNMarketPlace). Caveats accepted for the next playtest:
  the doodad-based models (Barn, WindMill) ship **no Birth animation**, so
  those buildings appear full-grown during construction (cosmetic only —
  accept or swap after seeing it in-game); the Market Stall keeps its
  goblin-merchant voice set (`usnd` override skipped — untested field, not
  worth the risk for a cosmetic). Building costs
  (`ugol`, `ulum` 0) mirror the script's `BUILD_DEFS`.
- `objects-items.json` (phase 3): the 8 commodity ITEM types
  (`I000`-`I007`, base `ches`, full identity sets per gotcha 23 —
  name/description/icon/model, `.mdl` field values per gotcha 22),
  `ipaw 0` so the market stays the only gold outlet. The generated
  `ITEM_*` constants wire them into `COMMODITIES`; charges are driven
  entirely by the script (`SetItemCharges`). In-game the stacks are
  REAL items — visible in every building's inventory, droppable,
  courier-able.
- **Data-driven Lua tables**: `COMMODITIES` (8, now with `item` ids),
  `BUILD_DEFS`/`BUILD_ORDER`
  (10), `ARCHETYPES` (6), `BOSS_AFFIXES` (3), `WAVES` (20),
  `FORGE_TIERS` (3), `CONTRACTS`/`CONTRACT_ORDER` (4), `EDGE_POS`;
  phase-3 state: per-building `store` slot tables, `LinkList` (routes in
  creation order), `BuildSeq` (name ordinals).
  Script-level state is GLOBAL (gotcha 28): the packed main chunk
  declares 43 locals (preflight's chunk-locals measure; headroom 157 to
  the 200-local engine cap). All market arithmetic is integer cents; every scripted
  iteration that feeds the log runs over arrays or explicit 1..6 slot
  loops, never `pairs`, so run logs replay byte-identically.

## Test coverage (tests/)

`node tools/test-map-logic.js maps/coinstead` — **71 tests**, all
executing the packed script in lib/sim (docs/PIPELINE.md §8), at **100%
script line coverage**:

- **economy.test.js** — shell (alliances/depot+stall recs/stewards/
  ledgers), PHYSICAL production (own-slot storage, linked refiner
  ratios, the starved-refiner no-partials rule, the full-building HALT
  + resume overflow rule), dividend math (the depot-reserve
  underwriting: no reserve = no dividend, the reserve as a CAP, exact
  golds; commitment bonus; bread eaten from the depot), stake loss on
  building death, no idle income from cash OR parked goods, stall-gated
  spread + elasticity + the 5% move cap + the price floor clamp +
  net-flow reset, trade guards (incl. the no-stall-space buy refusal),
  market determinism, ammo drawn from the tower's OWN rack (draw/inert/
  rearm by -stock AND by route delivery, both towers), non-tower damage
  neutrality, the engine construct-finish path (named stores).
- **logistics.test.js** (phase 3) — transfer links end to end: the 5/s
  pump rate + partial last transfers, creation-order service (the
  starvation rule) + steering by -unlink, per-route commodity filters,
  the refiner-input export ban, every creation guard (names, self,
  tower source, bad good, duplicate, the 2-out cap, the 1200 range),
  links dying with their endpoints, per-founder stack tagging at shared
  buildings, 6x200 capacity arithmetic, spill-on-death (half, floored,
  sub-1 stacks burn) + Steward recovery to the Depot (incl. the
  vault-full loss), the stall-razed market closure, and the live
  multiboard (single shared board, no GetLocalPlayer, refreshes on
  trade/cycle/stall arrival, price + trend + stall-stock cells asserted
  through the recorded native calls).
- **waves.test.js** — grace + scout raid timing, leak lives (scout, boss
  -5), exact composition per wave index at 1 and 4 players, seeded jitter
  bounds + stability, **the boss really spawning**, wave-hp bookkeeping,
  clear bounties, victory + score arithmetic + the -endless window and
  growth, depot-razed defeat, lives-zero defeat, steward respawn, sapper
  targeting, seed determinism (byte-identical run logs) + the 9-digit
  guard + the post-lock refusal.
- **commands.test.js** — the -test debug gate, every info command, debug
  command edges (incl. the 3-arg `-stock` building form), silent
  unknown-command handling.
- **forge-contracts.test.js** (phase 2) — the Toolwright ladder (goods
  paid from the Depot, never gold; all three tier effects incl. the
  Charter's shot parity meeting the dry-rack rule; the bounded top), the Skimmer's
  purse-skim on leak (clamped at 0), all three boss affixes on pinned
  seeds, and every contract state: seeded distinct offers every 4th
  wave, lapse at launch, delivery progress/clamps/fulfillment lump,
  deadline failure, tariff sell-boost + owed squad (both spawn-edge
  branches) + resolution, toll buy-discount + halved bounties +
  resolution, one-active-max, and the offers-always-draw PRNG rule.
- **golden-run.test.js** (gotcha 30; re-pinned for phase 3 per PIPELINE
  §8) — the pinned default-seed playthrough: a scripted full 20-wave
  solo victory (economy founding WITH routes, a scout leak, seedlock by
  a stall-routed sale, the never-routed watchtower born dry and rearmed
  by steering the routes, all three forge tiers paid from the vault,
  tariff resolved + provisions fulfilled out of physical depot bread +
  a lapsed board + toll ridden through its halved bounties, two
  greedy-affixed boss waves, retirement at score 22636) with all **159
  RUNLOG beats** `deepStrictEqual`-pinned byte-exact. The re-pin diff
  vs phase 2's 144 beats was reviewed class by class: all PRNG-derived
  beats (wave compositions/edges, affixes, offers) byte-identical; new
  beats are link|create/link|cut; build/tower beats carry names;
  dividend beats shifted exactly as the underwriting rule predicts.

Sim honesty notes: tower attack rates, pathing and the raiders' walk are
engine work the sim cannot model — tests drive leaks with `sim.moveUnit`
and clears with `sim.kill`; every mechanic was designed so its STATE
TRANSITION is observable without pathing (links are chat + positions,
never orders; spill recovery is a PICKUP event). The multiboard is
presentation: the sim asserts the recorded native calls, the price
STATE is what the economy tests pin. The engine inventory on buildings
(`AInv` on structures, item stacks with script-driven charges) is a
standard modding pattern but — like everything here — unverified in the
real client. The golden run's builds go
through the engine CONSTRUCT_FINISH event, but the sim does not charge
build-order gold the way the game does. Only the game proves the map
(CLAUDE.md validation doctrine); **Coinstead has never been loaded in
the real client** — it is sim-proven only (71 tests, the pinned golden
run, `npm run preflight` clean).

## Comparison

`docs/reference/economy-survival-comparison.md` — Coinstead vs the
decomposed Economy TD 0.29 and Gold TD and the surveyed Legion TD and
Line Tower Wars, with their wins in bold. Phase 3 adopted (with credit)
the two Economy TD wins phase 2 had conceded — logistics physicality
and the live price multiboard — with documented differences: 6-slot x
200-charge buildings vs its 1000-charge stacks, chat-commanded link
pumps vs its Transfer ability, and its years of real hosted play, which
remain its win.

## Credits

Design inspirations, adapted with credit (also in-game: credits quest +
`-help`); no assets, code or text from these maps are used — the debt is
mechanical, from decomposition-driven study (scratchpad dossier,
2026-07-12):

- **Economy TD** (anonymous, EpicWar) — the economy-first tower-defense
  frame: income from production, not kills; and (phase 3) its two best
  tactile ideas, adapted rather than copied — goods as physical item
  stacks moved between buildings (its 1000-charge Transfer-ability
  pumps became our 6x200-slot buildings with chat-commanded, filtered,
  range-gated link routes) and the live price multiboard. Fixed here:
  its boss wave that never spawned actually spawns.
- **Gold TD** (EpicWar) — income committed to standing structures and
  lost with them; no interest on idle cash.
- **Legion TD** (AutoAttackGames) — legible, authored wave composition
  tables.
- **Line Tower Wars** (Hive Workshop) — leak-pressure pacing.
