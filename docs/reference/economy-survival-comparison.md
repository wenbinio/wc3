# Economy-survival comparison — Coinstead vs. the field

An honest capability matrix of Coinstead (`maps/coinstead/`, phase 2,
2026-07) against the economy-defense maps it studied. Style and doctrine:
docs/reference/roguelike-comparison.md — **bold** marks the dimension
winner, and where a competitor wins we say so plainly.

**Evidence classes differ by column and we do not blur them**: Economy TD
0.29 and Gold TD (both EpicWar) were **decomposed** — the actual artifacts
extracted and read with this toolkit (phase-1 study, 2026-07-12; the
dead-boss finding and the price-grief finding below came from the scripts
themselves). Legion TD and Line Tower Wars were **surveyed only**
(published material, not artifact decomposition) — their rows are
correspondingly hedged and they get no "loses" verdicts from us.
Coinstead itself is **sim-proven only**: 56 headless logic tests at 100%
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
| Economy loop | **physical logistics chains — item stacks hauled unit-by-unit between buildings; the map's whole identity and still the genre's best tactile idea** | build → income tick | worker allocation (one clean decision) | send-to-earn | production chains as Lua state (harvest → refine ratios, 5s ticks) + a commodity SINK on every tower shot + goods-priced upgrade tiers — deeper flow graph, but the hauling physicality is conceded: nothing moves on the map |
| Market design | shared prices, live **price multiboard** (best-in-field price visibility), RNG price moves a group can grief | none | none | none | **one shared deterministic market: integer-cents prices, 10% spread, net-flow elasticity hard-capped ±5%/commodity/cycle (the anti-grief fix), zero randomness** — but read through chat commands (`-price`), a legibility loss vs the multiboard, conceded |
| Income design | production value → income (RNG-shaded) | **stake dies with the building; no idle interest** (its lesson, credited) | per-worker income curves | send income compounding | **Gold TD's rule adopted and extended: dividends = 25% of produced value +1%/200g standing stake +bread bonus, all bounded; stake AND income die with the building; provably zero idle interest (tested); plus contracts and a goods-paid forge ladder as commitment sinks** |
| Dead time | long build phases between waves; hauling fills some of it | grace + gaps, idle | **near-none: simultaneous build/fight cadence is the genre's tightest** | **near-none: constant send pressure** | 75s grace with a scout raid inside it, 45s gaps that production/market/contract decisions are designed to fill; honest concession: a pure spectator founder still waits |
| Wave texture | authored waves; **boss wave is dead code — it never spawns** | linear scaling | **legible authored tables, value-tuned per wave (the field's best)** | player-driven (sends ARE the texture) | 20 authored waves from 6 archetypes (swarm/armored/fast/siege/purse-skimming/boss) + seeded boss affixes (ironclad/swift/greedy) + contract-owed squads; the boss ACTUALLY spawns (waves 10/20) — fixed with credit |
| Endgame / score | survive the list | survive | king alive after wave list; ranked metas exist | last line standing | victory at wave 20 → **full score decomposition (coin + goods + stakes + lives + market + forge + pacts) printed on every verdict**, then `-endless` with +15%/wave growth |
| Determinism / testability | none (RNG prices, no seeds) | none | none visible (surveyed) | none visible (surveyed) | **full: one Park-Miller PRNG, `-seed N` replays any run; 56 headless tests execute the packed script at 100% line coverage; a 144-beat golden-run transcript is pinned byte-exact** |
| Co-op model | solo-ish shared field | solo lanes | 2v2/4v4 team | free-for-all pressure | 1-4 co-op: ONE shared market every trade moves, shared lives, shared contract board, per-founder ledgers |
| Proven in game | **yes — years of hosted play** | **yes** | **yes — the genre's most played** | **yes** | no. Sim-proven only; never loaded in the real client. The four columns to the left all beat us here today |

## Verdicts

**vs Economy TD 0.29** — Its two real wins stand: the logistics-chain
physicality (watching stacks move IS the game, and our Lua-state chains
do not replicate that feel) and the live price multiboard (a chat
`-price` readout is strictly less legible). We say both plainly. What
Coinstead takes, it fixes with credit: income-from-production kept but
made bounded and auditable; the shared market kept but de-griefed (RNG
price moves → net-flow elasticity with a hard per-cycle cap, so no
founder can dump a price through the floor in one sitting); and the boss
that its own triggers never spawned actually rides on waves 10 and 20 —
with a seeded affix. Its blacksmith-style spend-goods-to-improve idea
returns here as the three-tier Toolwright ladder, priced in tools,
planks and ingots so late-game goods stay in motion.

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
  Toolwright ladder; fixed here: the dead boss spawns, the market can't
  be griefed.
- **Gold TD** (EpicWar) — standing-stake income that dies with the
  building; no idle interest.
- **Legion TD** (AutoAttackGames) — legible authored wave composition
  tables.
- **Line Tower Wars** (Hive Workshop) — leak-pressure pacing.

No assets, code or text from any of these maps are used or
redistributed; the inspiration is mechanical, from decomposition-driven
study (CLAUDE.md "Decomposition-driven design").
