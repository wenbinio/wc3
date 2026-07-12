# Economy-survival comparison — Coinstead vs. the field

An honest capability matrix of Coinstead (`maps/coinstead/`, phase 3,
2026-07) against the economy-defense maps it studied. Style and doctrine:
docs/reference/roguelike-comparison.md — **bold** marks the dimension
winner, and where a competitor wins we say so plainly. (Phase 3 note:
the two Economy TD wins this document originally conceded — logistics
physicality and the live price multiboard — have since been adopted and
adapted, with credit; the rows below say exactly what still differs.)

**Evidence classes differ by column and we do not blur them**: Economy TD
0.29 and Gold TD (both EpicWar) were **decomposed** — the actual artifacts
extracted and read with this toolkit (phase-1 study, 2026-07-12; the
dead-boss finding and the price-grief finding below came from the scripts
themselves). Legion TD and Line Tower Wars were **surveyed only**
(published material, not artifact decomposition) — their rows are
correspondingly hedged and they get no "loses" verdicts from us.
Coinstead itself is **sim-proven only**: 71 headless logic tests at 100%
script line coverage, never yet loaded in the real game client — the same
honesty rule its README leads with.

## The contenders

- **Economy TD 0.29** (anonymous, EpicWar) — *decomposed.* The genre
  namer: income comes from PRODUCTION, not kills. Physical logistics
  chains (item stacks actually hauled between production buildings), a
  live price multiboard, price movement with RNG. Its wave-10 boss is
  dead code — the trigger exists, the spawn never fires.
- **Gold TD** (EpicWar) — *decomposed.* The commitment designer: income
  stakes live in standing structures and die with them; idle cash earns
  nothing. Otherwise a conventional TD chassis.
- **Legion TD** (AutoAttackGames) — *surveyed.* The polish benchmark:
  legible authored wave tables, worker/income allocation as the economy
  decision, value-based balance, a king as the shared loss condition.
- **Line Tower Wars** (Hive Workshop) — *surveyed.* The pressure
  benchmark: leak economy where your leaks become your opponents'
  problem, income-per-send, near-zero dead time.

## The matrix

| Dimension | Economy TD 0.29 | Gold TD | Legion TD (surveyed) | Line Tower Wars (surveyed) | Coinstead |
| --- | --- | --- | --- | --- | --- |
| Economy loop | **physical logistics chains — item stacks hauled unit-by-unit between buildings; the map's whole identity and the genre's best tactile idea — and the original of the mechanic Coinstead adopted** | build → income tick | worker allocation (one clean decision) | send-to-earn | physical since phase 3, adopted-and-adapted with credit: goods are item-charge stacks in each building's own 6-slot x 200 inventory (theirs: 1000-charge stacks), moved by chat-commanded `-link` routes at 5/s with range gates, filters, a 2-out cap and creation-order contention (theirs: a Transfer ability; ours never depends on pathing), spilled half-and-recoverable when a building falls; refiners eat from their own slots, towers fire from their own racks, a full building HALTS; deeper flow graph than the original PLUS the physicality — what still differs is theirs is battle-tested in real hosted games |
| Market design | shared prices, live **price multiboard** (the idea Coinstead adopted), RNG price moves a group can grief | none | none | none | **one shared deterministic market: integer-cents prices, 10% spread, net-flow elasticity hard-capped ±5%/commodity/cycle (the anti-grief fix), zero randomness — and, since phase 3, its own live multiboard (price, trend vs base, stall stock; one shared board, desync-safe, refreshed on every trade/cycle/arrival), with `-price` kept as the scriptable chat surface; trading is stall-gated and physical** |
| Income design | production value → income (RNG-shaded) | **stake dies with the building; no idle interest** (its lesson, credited) | per-worker income curves | send income compounding | **Gold TD's rule adopted and extended: dividends = 25% of produced value — since phase 3 UNDERWRITTEN by goods physically banked at the Depot (min(produced, reserve): routing matters, yet parked goods alone still earn zero) — +1%/200g standing stake +bread bonus, all bounded; stake AND income die with the building; provably zero idle interest (tested); plus contracts and a goods-paid forge ladder as commitment sinks** |
| Dead time | long build phases between waves; hauling fills some of it | grace + gaps, idle | **near-none: simultaneous build/fight cadence is the genre's tightest** | **near-none: constant send pressure** | 75s grace with a scout raid inside it, 45s gaps that production/market/contract/route-steering decisions are designed to fill; honest concession: a pure spectator founder still waits |
| Wave texture | authored waves; **boss wave is dead code — it never spawns** | linear scaling | **legible authored tables, value-tuned per wave (the field's best)** | player-driven (sends ARE the texture) | 20 authored waves from 6 archetypes (swarm/armored/fast/siege/purse-skimming/boss) + seeded boss affixes (ironclad/swift/greedy) + contract-owed squads; the boss ACTUALLY spawns (waves 10/20) — fixed with credit |
| Endgame / score | survive the list | survive | king alive after wave list; ranked metas exist | last line standing | victory at wave 20 → **full score decomposition (coin + goods + stakes + lives + market + forge + pacts) printed on every verdict**, then `-endless` with +15%/wave growth |
| Determinism / testability | none (RNG prices, no seeds) | none | none visible (surveyed) | none visible (surveyed) | **full: one Park-Miller PRNG, `-seed N` replays any run; links/pumps/storage draw nothing; 71 headless tests execute the packed script at 100% line coverage; a 159-beat golden-run transcript is pinned byte-exact** |
| Co-op model | solo-ish shared field | solo lanes | 2v2/4v4 team | free-for-all pressure | 1-4 co-op: ONE shared market every trade moves, shared lives, shared contract board, per-founder ledgers |
| Proven in game | **yes — years of hosted play** | **yes** | **yes — the genre's most played** | **yes** | no. Sim-proven only; never loaded in the real client. The four columns to the left all beat us here today |

## Verdicts

**vs Economy TD 0.29** — Phase 3 closed the two rows we had conceded,
by adoption with credit rather than by argument. Its logistics
physicality is now ours too: goods live as item-charge stacks in
building inventories and MOVE — but adapted, not copied (its 1000-charge
stacks and Transfer ability became 6-slot x 200 buildings and
chat-commanded `-link` routes with range gates, filters, a 2-out cap
and deterministic creation-order contention; nothing depends on unit
pathing, so the whole layer is headlessly testable). Its live price
multiboard is now ours as well (price, trend, stall stock; one shared
desync-safe board). What still differs, plainly: its stacks-on-the-move
spectacle is coarser-grained here (charges teleport per second along a
route; no carts roll), our dividend physically routes through the Depot
(its income never asked where goods sat), and — the row it keeps
winning — **its logistics have survived years of real hosted games;
ours have survived a simulator**. The earlier fixes stand: income kept
but bounded and auditable, the market de-griefed (net-flow elasticity,
hard per-cycle cap), the dead boss actually rides on waves 10 and 20
with a seeded affix, and its blacksmith idea lives on as the
goods-priced Toolwright ladder.

**vs Gold TD** — The smaller, sharper influence: one rule — commitment.
Coinstead adopts its stake-dies-with-the-building income and no-idle-
interest doctrine wholesale (and credits it in-game), then extends the
commitment surface: contracts you sign and can fail, upgrade tiers you
pay for in goods, ammo racks that starve. On every other row Gold TD is
a conventional TD; but note the row it still wins with Economy TD,
Legion TD and LTW alike: real players have finished real games of it.

**vs Legion TD** — Surveyed only, so no loss verdicts from us; its
authored-wave legibility is the standard our WAVES table imitates, and
its cadence (meaningful decisions between every wave) is what the
contract board and market cycles are reaching for. Where we clearly
differ rather than win: Legion TD's economy is one clean decision
(workers vs army) tuned to esports depth; Coinstead's is many small
ledger decisions tuned for co-op conversation.

**vs Line Tower Wars** — Surveyed only. Its leak economy — your leak is
someone else's problem — is a competitive design Coinstead deliberately
does not want (we are co-op; every leak is everyone's problem, and a
Skimmer leak taxes every founder's purse to make that shared). What we
took is pacing: leaks that cost something immediately, pressure that
never fully stops, and the scout raid that teaches the leak rule before
wave 1.

## Credits

Design inspirations, adapted with credit (mirrored in the map README and
in-game in the credits quest and `-help`):

- **Economy TD** (anonymous, EpicWar) — economy-first TD frame; income
  from production → bounded dividends; blacksmith upgrades → the
  Toolwright ladder; physical item-stack logistics → the phase-3
  6x200-slot stores and `-link` transfer routes; the live price
  multiboard → the phase-3 market board; fixed here: the dead boss
  spawns, the market can't be griefed.
- **Gold TD** (EpicWar) — standing-stake income that dies with the
  building; no idle interest.
- **Legion TD** (AutoAttackGames) — legible authored wave composition
  tables.
- **Line Tower Wars** (Hive Workshop) — leak-pressure pacing.

No assets, code or text from any of these maps are used or
redistributed; the inspiration is mechanical, from decomposition-driven
study (CLAUDE.md "Decomposition-driven design").
