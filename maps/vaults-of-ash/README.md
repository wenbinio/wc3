# The Vaults of Ash

A **seeded one-session co-op roguelike** for 1-3 players (~30 minutes).
The last torchbearers of a burned monastic order descend the vault the
order died sealing. One seed = one exact dungeon: every random draw flows
through the map's own PRNG, so a run can be replayed move-for-move — in
the game and in the headless sim alike.

In-game name: **"The Vaults of Ash"** (distinct internal name per
CLAUDE.md gotcha 17). Built and validated headlessly with wc3-map-toolkit;
compiled artifact: `maps/builds/vaults-of-ash.w3x`.

Phase 2 scaled the content (30 boons, 20 creep types + 6 affixed elites,
20 room templates, 6 relics, 5 consumables) and adapts the best mechanic
of each of the three strongest WC3 roguelikes — **with the fairness flaw
each shipped with fixed**. Phase 3 flips the three conceded comparison
rows: **3 playable heroes** (x4 covenants x5 sigil paths = 60 run
identities), **6 rotating Floor Guardians** (Ulfsire's Guardian promotion
+ exit-from-corpse, credited) and **3 seeded interior variants per room
template** (60 authored interiors). Honest capability matrix + verdicts:
`docs/reference/roguelike-comparison.md`.

## Run structure

```
HUB: pick a hero at the pedestals + swear a covenant (both optional, before the first door)
  -> floor 1 (3 omen-read doors, sometimes a TRIAL door; the room is warded by a FLOOR GUARDIAN
     whose corpse becomes the descent door) -> floor 2 -> floor 3
  -> VAULT GATE -> the Vault Heart (3 phases, 2 seeded aspects)
     every 3rd cleared room lights the campfire; fast clears build WRATH
```

- **Heroes** (phase 3): three torchbearer kits picked at the hub HERO
  PEDESTALS before the first door (default: Torchbearer). *Torchbearer* —
  balanced, 650 life. *Ashblade* — glass cannon: 350 ms, 520 life, innate
  **Cinder Step** (600-range blink, 9s cd, object-data `AEbl` variant
  granted by trigger). *Chorister* — support: 780 life, weak arms, innate
  **Kindled Chorus** (trigger timer: mends every torchbearer within 700
  range for 20 life every 10s, announced each tick — real heal math the
  sim asserts in co-op). Run identity = hero x covenant x sigil path
  (`IdentityCount` = 60, computed live from the data tables).
- **Floor Guardians** (phase 3, adapted from Ulfsire's Guardian promotion
  + exit-from-corpse, credited): every room entered through a real door
  is warded by a Guardian from a seeded 6-pool (Bone Warden / Gale
  Matriarch / Blood Provost / Void Curator / Pyre Sentinel / Hollow
  King), drawn without replacement across the run's floors, always
  carrying a seeded affix, stats scaled by floor and party size, each
  with ONE scripted signature behavior (summon at 50% / 15s AoE shriek /
  20s life tithe / 20s ember siphon / enrage below 25% / wrathfire mantle
  at 50%). The room cannot clear while the Guardian stands (survive rooms
  end in an announced standoff), and **the descent door spawns at the
  Guardian's corpse**, announced and logged with its coordinates. Debug
  `-room` chambers stay bare test rooms.
- **Interior variants** (phase 3): each of the 20 templates carries 3
  authored variants drawn from a 6-key arrangement library (colonnade /
  cairns / braziers / rubble / walls / ossuary — inert neutral props with
  seeded jitter, swept on clear). One is drawn per real-door room;
  `variant|<TMPL>|vN|<key>` is logged, so two seeds provably differ
  (tested). Index: the `VariantIndex` global.

- **The world**: a 128x128 Dungeon-tileset map of 14 cliff-walled islands
  (hub + 12 rooms + boss summit) hanging in dark void; travel is trigger
  teleport on door-plate enter, with a per-room camera beat.
- **Covenants** (adapted from Ulfsire's god pacts, with the terms printed):
  each player may swear ONE pact at the hub altars before the first door —
  reward AND price announced at selection. *Cinders*: fast clears pay +20
  Embers / the heal costs you double. *Stillness*: slow clears grant +1
  Insight / Wrath builds x1.5. *Sealed*: a free seeded epic boon / drafts
  offer 2 not 3. The fourth altar, the *Unbound* (+1 all stats per clear,
  no price), opens only to `-vow <phrase>` — a knowledge code whispered by
  a flawless or wrath-breaking victory (the Roguelike 2.6 tradition,
  credit DeathdruidX; unwipeable meta). The phrase is earned in-game and
  deliberately not printed here.
- **Doors and omens**: each floor deals 3 of its authored **room
  templates** (20 across the run: 7/7/6 per floor tier, each an authored
  creep composition + spawn pattern: scatter/ring/corners/line/packs) onto
  3 of its 4 islands, seeded without replacement. The Omen Obelisks show
  danger (`!` to `!!!`) and reward type; **Insight** upgrades them with
  exact creep counts (1+) and reward previews (2+) — and the counts can
  never lie, because the same function feeds the omen and the spawner. At
  least one boon door per floor is guaranteed.
- **Trial doors** (adapted from Just Another Roguelike's risk contracts,
  credit PortusM): on 1-2 seeded floors a fourth door opens with an
  announced debuff for that one room (*Cinders*: -40% max life inside;
  *Gale*: the vault breathes every 30s inside; *Legion*: x1.5 spawns) and
  a permanent party buff + 1 Insight on clear. Decline by taking any
  normal door.
- **Rooms** run LOCKED -> ACTIVE -> CLEARED with three objectives:
  **kill-all**, **survive 60s** (template-defined trickles), **guarded
  reliquary** (kill the guards, a relic drops). Clearing pays **40/60/80
  Embers by danger** into one shared party pool.
- **Wrath** (adapted from Roguelike 2.6's Sin ambush, credit DeathdruidX
  — telegraphed instead of hidden): fast clears feed the meter (announced
  at 50/75/100%). At 100% an **Ash Revenant** ambushes at the NEXT room —
  announced one room ahead, so slowing down is always an option — and
  slaying it always pays a rare boon (epic with Emberlord's Covenant).
- **Boons — 30, in 3 rarities (14 common / 10 rare / 6 build-around
  epics), each carrying one of 5 SIGILS** (Ash/Storm/Blood/Void/Light, 6
  boons each). 3-take-1 drafts on the hub pedestals. Holding 2/3 boons of
  a sigil grants an announced set bonus; **every tooltip states its
  rarity, sigil and both set thresholds**, and `-sigils` prints the
  party's counts (Ulfsire's structure synergy, with the opacity fixed).
  **Pity is structural**: drafts can never offer a boon the party holds
  (the RL 2.6 duplicate-bug class is impossible), and every deal contains
  at least one never-yet-offered boon while any remain.
- **Insight** (adapted from JAR's looting stat): grown by a boon line
  (Omen Eye, Deep Sight, Seer's Diadem), trial payouts and the Ashen
  Codex relic. 1+: omen creep counts; 2+: reward previews (exact embers /
  relic name / best draft rarity — honest, from pre-dealt offers); 3+:
  finer campfire stock (heal 75%, fortify +150).
- **Campfire (Ashen Shrine)**: lights after every 3rd cleared room. Rune
  plates: heal 50% (60), boon reroll (40; free with Seer's Diadem),
  fortify +100 max life (75), **Rekindle** the fallen at once (120). One
  use per plate per lighting. Purchases are trigger-owned
  (SetPlayerState + natives) so the game and lib/sim run the same path.
- **Death choreography** (Ulfsire's escape-revive, credited): a fallen
  torchbearer rekindles at 50% life when the party clears its next
  landing, or immediately via the Rekindle plate. Only a **full wipe**
  ends the run — and defeat is ALWAYS handled with a summary (JAR ships
  no defeat handler at all).
- **Enemies**: 20 creep types in three floor tiers (6/7/7) with distinct
  object-data kits, plus **6 elites** (2 per tier) behind three-skull
  doors. Every elite (and the Revenant) carries one of **6 seeded
  affixes** — Burning +25% dmg, Shielded +40% life, Swift +60 ms,
  Volatile (bursts into fodder on death), Vampiric (heals when other
  vault-born die), Ashveiled (evasion) — named on the unit and announced
  with its effect (Ulfsire's prime monsters, credited).
- **Vault's Breath**: every 90s all uncleared content gains +2% damage
  (stacking, announced with sound).
- **Boss — the Vault Heart**: 3 phases, waking in one of 2 seeded aspects
  (*Spark Swarm* / *Shard Ring* — different add counts and shapes,
  announced at the gate). At 80% it sheds adds; at 40% it swaps **Vault
  Slam -> Heartshatter Slam** AND **feeds on hoarded embers**: +1 damage
  per 10 unspent Embers at phase start (RL 2.6's shopkeeper-greed,
  credited — telegraphed at the gate and inscribed on the door frames, so
  spending is a pacing decision). Boss dead = victory; a 0-death or
  wrath-breaking victory whispers the vow phrase. Either way: full run
  summary (floor / rooms / embers / boons / **sigils / wrath peak /
  trials / insight / deaths / covenants** / seed).
- **Seed**: `-seed N` before any covenant or door (refused after).
  Default `20260711`, printed in the lobby description and intro. PRNG:
  Park-Miller LCG via Schrage's algorithm — every intermediate stays
  below 2^31, so the sequence is bit-identical under the game's 64-bit
  Lua integers AND fengari's 32-bit integers. `math.random` /
  `GetRandomInt` are never used.
- **Co-op**: 1-3 players, one allied force (gotcha 18) plus runtime
  alliances (gotcha 24). Spawn counts scale **x1.6 per extra player**
  (per composition pack, rounded up).

## Command table

| Command | Gate | Effect |
| --- | --- | --- |
| `-help` | always | command list + mechanics + credits |
| `-sigils` | always | party sigil counts, active set bonuses, both thresholds |
| `-vow <word>` | before first door | speak the earned vow; opens the fourth altar |
| `-seed N` | before any covenant/door | reseed + re-deal the dungeon (refused after) |
| `-test` | always | toggle debug mode (gates everything below) |
| `-floor N` | -test | jump the run to floor N (re-deals its doors) |
| `-room <killall\|survive\|reliquary> [danger]` | -test | force-activate the floor's first template of that objective |
| `-trial` | -test | force a trial offer on the current floor |
| `-embers N` | -test | set the party ember pool |
| `-boon` | -test | force a boon draft at the hub |
| `-grant <boonkey>` | -test | grant a boon by table key (e.g. `str`, `diadem`) |
| `-wrath N` / `-insight N` | -test | set the Wrath meter / raise Insight |
| `-covenant <key>` | -test | force a pact (cinders/stillness/sealed/unbound) |
| `-hero <key>` | -test | force a torchbearer kit (torch/ashblade/chorister) |
| `-clear` | -test | force-clear the active room |
| `-boss` | -test | jump to the Vault Heart |
| `-god` | -test | make torchbearers invulnerable |
| `-ff` | -test | 4x the breath/survive/room clock |
| `-runlog` | -test | print the deterministic run log |

## Layout / data flow

- `assets/generate-terrain.mjs` — committed generator for terrain.json,
  regions.json (now incl. the trial door, 4 covenant altars, the rekindle
  plate and the 3 hero pedestals), units.json, doodads.json and the
  terrain-sized files/war3map.wpm+shd (gotcha 8). Regenerate, never
  hand-edit; after edits repeat the gotcha-6 stabilization cycle (copy
  `*.json` only).
- `assets/generate-{obelisk,brazier,vaultheart,sealstone}.mjs` — the four
  custom models, built on maps/northreach/assets/mdl-lib.mjs; all
  sanity-clean (gotchas 14/19). The Covenant Altar reuses the obelisk
  model with a violet tint (gotcha 22: only shipped models get `umdl`).
- **regions.json is the single source of truth for geometry** — doors,
  altars, plates, room rects, boss arena — read through the generated
  `REGION_*` constants (gotcha 27). All object types go through
  `UNIT_*`/`ITEM_*`/`ABIL_*` constants; grep `constants.json`.
- **Data-driven tables in war3map.lua**: `BOON_TABLE` (30), `TEMPLATES`
  (20, each with `variants`), `TIER_CREEPS`/`TIER_ELITES`, `AFFIXES` (6),
  `TRIALS` (3), `COVENANTS` (4), `RELIC_TABLE` (6), `BOSS_PATTERNS` (2),
  `SIGIL_SETS`, plus phase 3: `HERO_KINDS` (3), `GUARDIANS` (6),
  `ARRANGEMENTS` (6). The sigil set text in `objects-items.json` tooltips
  must stay in sync with `SIGIL_SETS` (tests enforce the tooltip format).
- Note: the script's functions are Lua **globals**, not locals — the
  packed chunk (script + generated blocks) must stay under Lua's
  200-local limit per function (fengari enforces it; the game would too;
  CLAUDE.md gotcha 28).

## Test coverage (tests/)

`node tools/test-map-logic.js maps/vaults-of-ash` — **70 tests**, all
executing the packed script in lib/sim (docs/PIPELINE.md §8):

- **golden-run.test.js** — the flagship: a full scripted solo playthrough
  on the default seed (the Ashblade taken at the hero pedestals with its
  blink granted, Covenant of Stillness, the floor-1 Trial of the Gale
  ending in the Guardian standoff against the Vampiric Hollow King and
  its mantle signature, three affixed Floor Guardians with corpse-door
  descents, a boon draft, the Ashen Codex reliquary, Wrath to 100% with
  the Revenant ambush landing in the boss arena, the ember feast, the
  Spark Swarm aspect, the earned vow, victory) asserting the byte-exact
  61-beat run-log sequence and every payout along the way.
- **vaults.test.js** — the phase-1 core re-pinned: seed determinism
  (identical run logs incl. spawn coordinates), late `-seed` refusal,
  door/template state machine, exact ember payouts per objective, boon
  draft 3-take-1, campfire purchases + reroll, Vault's Breath + `-ff`,
  boss phase one-shots + slam swap, full-wipe defeat, co-op x1.6 scaling,
  debug gating, alliances.
- **phase2.test.js** — the phase-2 systems: boon-data legibility (30
  boons / 6 epics / 6 per sigil / tooltip thresholds), sigil 2pc+3pc
  once-each with real effects, `-sigils`, wrath thresholds + telegraphed
  ambush + rare bounty (epic with the Covenant), trial offer bounds
  (1-2 per run) + all contract debuffs/payouts + decline path, honest
  omens at every Insight tier, finer campfire stock, hard + soft pity,
  covenant terms/locks and all four pacts, rekindle-on-clear + shrine
  revive + defeat-always, the ember feast, affixed elites (volatile
  burst, shielded life), the tiered roster, the 20-template deck, boss
  aspects, `-help` completeness and the in-game credits.
- **phase3.test.js** — the phase-3 systems: both hero swaps with exact
  object-data kits (Cinder Step granted via the recorded `UnitAddAbility`
  call; the Chorister without it), Kindled Chorus heal math in 2-player
  co-op (cadence, range gate, max-life cap, announced ticks), pick
  defaults/locks and the `-hero` debug gate, the 60-identity math
  (`IdentityCount`), one affixed Guardian per real-door room + its
  announcements, pool rotation across seeds AND without replacement
  within a run, exit-from-corpse (door unit at exact corpse coordinates +
  the descend log), all six signature behaviors (summon/enrage once-only,
  pulse/drain/siphon exact math), the 20x3 `VariantIndex`, seeded variant
  divergence (same template, different seeds -> different interiors) and
  obstacle spawn/sweep.

Sim honesty notes: combat/abilities are not simulated — kills are driven
with `sim.kill`, boss phase thresholds with `SetWidgetLife`; ability
grants and camera/text-tag/sound calls are asserted as recorded native
calls (`--coverage` lists the stub tier).

## Credits

Design inspirations, adapted with credit (also in-game: credits quest +
`-help`, and in `docs/reference/roguelike-comparison.md`):

- **Roguelike** by **DeathdruidX** — the Sin ambush (→ telegraphed
  Wrath), the shopkeeper's greed (→ the Heart's ember feast), the
  knowledge-code meta (→ the vow of the fourth altar).
- **Ulfsire's Roguelike** — structure synergies (→ legible sigil sets),
  god pacts (→ covenants with printed terms), prime monsters (→ elite
  affixes), escape-revive (→ rekindling), Guardian promotion +
  exit-from-corpse (→ the Floor Guardian pool and the descent door that
  spawns at the Guardian's corpse).
- **Just Another Roguelike** by **PortusM** — risk contracts (→ trial
  doors), looting-as-a-stat (→ Insight).

No assets, code or text from those maps are used; the debt is mechanical,
from decomposition-driven study.
