# The Vaults of Ash

A **seeded one-session co-op roguelike** for 1-3 players (~30 minutes,
permadeath). The last torchbearers of a burned monastic order descend the
vault the order died sealing. One seed = one exact dungeon: every random
draw flows through the map's own PRNG, so a run can be replayed
move-for-move — in the game and in the headless sim alike.

In-game name: **"The Vaults of Ash"** (distinct internal name per
CLAUDE.md gotcha 17). Built and validated headlessly with wc3-map-toolkit;
compiled artifact: `maps/builds/vaults-of-ash.w3x`.

## Run structure

```
HUB  ->  floor 1 (pick 1 of 3 doors)  ->  floor 2  ->  floor 3  ->  VAULT GATE -> boss
          each door: seeded room deal        every 3rd cleared room lights the campfire
```

- **The world**: a 128x128 Dungeon-tileset map of 14 cliff-walled islands
  (hub + 12 rooms + boss summit) hanging in dark void. There is no path
  between islands — travel is trigger teleport on door-plate enter, with a
  per-room camera beat. The only ramps on the map sit inside rooms (each
  room's raised reliquary dais).
- **Doors and omens**: each of floors 1-3 has a deck of 4 rooms; a seeded
  deal (without replacement) puts 3 behind the doors. The Omen Obelisk at
  each door shows floating text: danger (`!` to `!!!`) and reward type
  (Embers / Boon draft / Relic). At least one boon door per floor is
  guaranteed (deterministically promoted if the rolls miss).
- **Rooms** run a LOCKED -> ACTIVE -> CLEARED state machine with three
  objectives: **kill-all**, **survive 60s** (with trickling
  reinforcements), **guarded reliquary** (kill the guards, the relic drops).
  Clearing pays **40/60/80 Embers by danger** into one shared party pool
  (mirrored into every player's gold), then the door's reward triggers.
- **Boons** (3-take-1 draft): after a boon-reward room the party returns to
  the hub and three boon items materialize on the pedestals. Step a hero
  onto a pedestal plate to claim THAT boon — the other two crumble. The
  `BOON_TABLE` in war3map.lua is data-driven; this phase ships 8 boons
  (stat mods via SetHeroStr/Agi/Int / max-life, plus object-data ability
  grants: Cinderguard Evasion, Emberedge Strike, Ashbreaker Bash). Phase 2
  extends the table to 24+ without touching the draft machinery.
- **Campfire (Ashen Shrine)**: lights after every 3rd cleared room. Rune
  plates: heal 50% (60), boon reroll (40, only with a draft pending),
  +100 max life (75). One use per plate per lighting.
  *Mechanism note*: purchases are **trigger-owned** — a region-plate enter
  deducts embers via `SetPlayerState` and applies effects with plain
  natives — rather than an engine shop (`usei`/pawn). Chosen deliberately:
  the engine shop's internal gold handling is invisible to lib/sim, while
  region enters + SetPlayerState run the *exact same code path* in the
  game and the sim (and regions/teleports are the most battle-tested
  trigger primitives in WC3). The northreach market pawn pattern was the
  alternative; it fits selling TO a shop, not buying services.
- **Vault's Breath**: every 90s all uncleared content gains +2% damage
  (stacking, announced with sound; applied via BlzSetUnitBaseDamage to
  live hostiles and baked into new spawns).
- **Boss — the Vault Heart**: 3 phases. At 80%: sheds Heart Sparks. At
  40%: sheds Molten Shards and swaps **Vault Slam -> Heartshatter Slam**
  (custom `ACtc` clones, the crossroads-siege pattern). Boss dead =
  victory; all torchbearers dead = defeat (permadeath, no revives). Either
  way: run summary (floor / rooms / embers / boons / seed) via message +
  quest log.
- **Seed**: `-seed N` before the first door (refused after — the run locks
  in). Default `20260711`, printed in the lobby-visible map description
  and in the intro. PRNG: Park-Miller LCG via Schrage's algorithm —
  chosen over xorshift because every intermediate stays below 2^31, so the
  sequence is bit-identical under the game's 64-bit Lua integers AND
  fengari's 32-bit integers (`math.maxinteger` is 2^31-1 in the sim).
  `math.random`/`GetRandomInt` are never used.
- **Co-op**: 1-3 players, one allied force (WE-exact custom-forces
  config, gotcha 18) plus runtime alliances (gotcha 24). Spawn counts
  scale **x1.6 per extra player** (geometric, rounded up):
  solo 5 -> duo 8 -> trio 13 for the same room.

## Command table

| Command | Gate | Effect |
| --- | --- | --- |
| `-help` | always | command list |
| `-seed N` | before first door | reseed + re-deal the dungeon (refused after) |
| `-test` | always | toggle debug mode (gates everything below) |
| `-floor N` | -test | jump the run to floor N (re-deals its doors) |
| `-room <killall\|survive\|reliquary> [danger]` | -test | force-activate a room of that objective |
| `-embers N` | -test | set the party ember pool |
| `-boon` | -test | force a boon draft at the hub |
| `-clear` | -test | force-clear the active room |
| `-boss` | -test | jump to the Vault Heart |
| `-god` | -test | make torchbearers invulnerable |
| `-ff` | -test | 4x the breath/survive clock |
| `-runlog` | -test | print the deterministic run log |

## Layout / data flow

- `assets/generate-terrain.mjs` — committed generator for terrain.json,
  regions.json, units.json, doodads.json and the terrain-sized
  files/war3map.wpm+shd (128x128 => 512x512 cells, gotcha 8). Regenerate,
  never hand-edit; after edits repeat the gotcha-6 stabilization cycle
  (copy `*.json` only).
- `assets/generate-{obelisk,brazier,vaultheart,sealstone}.mjs` — the four
  custom models (Omen Obelisk, Ember Brazier, Vault Heart, Sealstone
  Door), built on maps/northreach/assets/mdl-lib.mjs; all sanity-clean
  (0 errors / 0 severes / 0 warnings, gotchas 14/19).
- **regions.json is the single source of truth for geometry**: doors,
  pedestal/rune plates, all 12 room rects, the boss arena and the hub
  return point are regions, and war3map.lua reads them through the
  generated `REGION_*` constants — no coordinate is duplicated by hand
  (gotcha 27). All object types likewise go through `UNIT_*`/`ITEM_*`/
  `ABIL_*` constants; grep `constants.json` for the index.
- Creep clones keep their base art deliberately (only units whose models
  we ship get `umdl` overrides — a mistyped Blizzard path renders an
  invisible unit, gotcha 22); identity is carried by name/tooltips, and
  items override the full identity set (gotcha 23).

## Test coverage (tests/)

`node tools/test-map-logic.js maps/vaults-of-ash` — 20 tests, all
executing the packed script in lib/sim (docs/PIPELINE.md §8):

- **golden-run.test.js** — the flagship: a full scripted solo playthrough
  on the default seed (doors A/B/A, kill-all + guarded reliquary +
  survive, two pinned boon drafts, campfire heal + fortify, three boss
  phases, victory) asserting the byte-exact 30-beat run-log sequence and
  every payout along the way.
- **vaults.test.js** — seed determinism (same seed => identical run log
  incl. spawn coordinates; different seeds differ), late `-seed` refusal,
  door enter => teleport + ACTIVE + camera beat, exact ember payouts
  (only on the last kill), survive-room clock + trickle, reliquary
  guards => relic, boon draft 3-take-1 (stat applied, others consumed),
  ability boons via UnitAddAbility, campfire purchases (deduct exact
  costs, refuse when broke, single-use plates), reroll re-deals a pending
  draft, Vault's Breath stacks at exactly 90s (+`-ff` scaling + live
  rescale), boss phases fire exactly once each + slam swap, permadeath
  defeat + summary, boss-dead victory + summary, co-op x1.6 spawn
  scaling, debug gating, co-op alliance state.

Sim honesty notes: combat/abilities are not simulated — kills are driven
with `sim.kill`, boss phase thresholds with `SetWidgetLife`; ability
grants and camera/text-tag/sound calls are asserted as recorded native
calls (`--coverage` lists the stub tier).

## Phase 2 pending

Content scale-up from competitor analysis: extend `BOON_TABLE` to 24+
boons, grow the roster to ~75 object-data entries (more creeps per tier,
more elites, alternate bosses), more room templates per floor deck, and
additional reward/shrine options. The deal/draft/state machine, scaling,
breath and summary systems are already data-driven for it.
