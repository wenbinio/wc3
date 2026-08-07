# Last Train from Yio Chu Kang

**A map by Serendipity.** A **1–4 player co-op zombie survival map** set in
a rain-soaked Singapore HDB estate on the island's last night — phase 1.
Scavenge the void decks, craft what the island left you, restore three
substations, and board the **last North-South line train** when it calls
at Yio Chu Kang at T+12:00 — or take the long walk into the kampong
remnant off Lorong Buangkok and kill the **Broodmother** instead. Death
is not elimination: the fallen **defect to the horde** and play against
the living.

In-game name: **"Last Train from Yio Chu Kang"** (distinct internal name,
CLAUDE.md gotcha 17). Built and validated headlessly with wc3-map-toolkit;
compiled artifact: `maps/builds/last-train.w3x`. **Never loaded in the
real game — sim-proven only** (64 logic tests, 98.2% script line
coverage; the in-game protocol is the standing next step).

## The two ways out (and the one way down)

- **The train**: arrives at **T+720s**, departs **180s later** (the
  evacuation-window ending — credit *Zombination v11* by Trinin). The
  doors only open if **all three substations** spread across the estate
  are live (`-fix`, a 10s vulnerable channel — anti-camping by
  construction, credit *SWAT: Aftermath*): no power, no doors, no ride.
  Boarding = standing on the platform while the train waits (or `-board`).
  Departure with anyone aboard ends the run: boarders **win**, stragglers
  lose, the horde loses.
- **The Broodmother**: 3500 HP in the kampong lair on the far corner of
  the map. Kill it any time — before the train, after missing the train —
  and every surviving player wins; defected players lose with the horde.
- **The wipe**: when the last living survivor falls (and nobody made the
  train), players who defected **earlier** win as the horde; the last to
  fall is the horde's meal, not its member.

## Mechanics (adopted with credit, flaws fixed)

- **Death = defection** (credit *Zombie-Simulator 7* by SpirulinaN, and
  *Zombination*): a dead survivor converts **in place** — their Revenant
  rises where they fell with a pack of three shamblers, all
  player-controlled; the alliance flips **both directions** (gotcha 24)
  and the horde shares its vision with its new mind. No elimination, no
  spectating.
- **Curable slow-burn infection** (credit *Zombination*; their
  dummy-caster churn replaced with per-unit STATE on the virtual clock):
  zombie damage infects; the DoT runs **1.5 dps** (3 damage every 2s)
  until cured — **Wet Bandage** above 40% health (the Paramedic cures at
  ANY health), or **5 seconds inside the polyclinic grounds**. Untreated,
  it kills you into defection.
- **Corpse-rise** (credit *Zombination*): anything the horde kills stands
  back up as a shambler after a **visible 3.5s window** at the death spot
  — unless a **Molotov** burns the corpse first (fire also scorches
  zombies for 60; scripted damage never draws your ammo).
- **Gold-as-bullets, lumber-as-clips** (credit *Dawn of the Dead* by
  PreViO): every shot costs **1 round** (gold), drawn on the DAMAGING
  event; a dry clip zeroes the shot (a carried **Parang** keeps you at
  half damage); `-reload` burns **1 clip** (lumber), locks you **4s**
  (the panic window), then seats a full clip. Clips come from scavenging
  — and every **5th** zombie you kill drops one.
- **The anti-snowball pair** (credit *Zombination*, adopted verbatim):
  kill-XP shared with a **0.75^(n−1) falloff** per extra zombie within
  600 of the kill (integer math, crowd capped at 8) **plus** a passive
  drip every 20s so a quiet horde still scales. Escalation is keyed to
  **STATE** — the drip grows with the dead-resident ratio and the
  defection count, never wall-clock alone (fixing *Zombie-Simulator*'s
  fire-into-the-void timers). Horde levels (+10% zombie hp each) gate
  patrol size and composition.
- **Furniture scavenging + crafting** (credit *Zombination*; their
  discoverability flaw fixed): every bench, dumpster, locker, desk,
  hawker table, car, van, payphone and bus stop is one **seeded**
  `-search`; ten two-material combine recipes, ALL listed by `-recipes`,
  hinted in every material tooltip, and repeated in the quest log:
  | recipe | makes | | recipe | makes |
  | --- | --- | --- | --- | --- |
  | Cloth + Water | **Wet Bandage** | | Cloth + Kerosene | **Flare** |
  | Plank + Pipe | **Parang** | | Pipe + Battery | **Sentry Kit** (40-round belt) |
  | Pipe + Wire | **Mobile Phone** (30s horde vision) | | Rations + Water | **Kopi Set** (+200 HP) |
  | Cloth + Plank | **Barricade Kit** (800 HP wall) | | Wire + Battery | **Generator Part** (instant fix) |
  | Bottle + Kerosene | **Molotov** | | Pipe + Kerosene | **Blowtorch** (+300 weld) |
- **Wandering patrols** (anti-camping): from T+90s, every 45s, a seeded
  patrol walks a seeded district-to-district route (Teck Ghee, Kebun
  Baru, Yio Chu Kang Gardens, Seletar Hills, Cheng San, the park
  connector), sized by horde level.
- **Classes** (genre furniture, Singapore-flavored; pick in the first
  40s): **Heartlander** (clip 12, 550 HP, rations), **Auxiliary Police
  Officer** (clip 24, hardest hits, 3 clips), **Paramedic** (clip 8,
  cures at any HP, 2 bandages), **Town Council Technician** (half-time
  fixes, starts with a Generator Part + Barricade Kit).

## Ambience (a first-class deliverable)

One **permanent night** (clock stopped at 22.00), monsoon rain across the
whole map (script-side `AddWeatherEffect` with the game-verified `RLlr`
code — the picky w3i weather field stays `'0000'`, gotcha 11), low blue
fog, and **lamplight pockets**: generated street lamps pool light at the
void decks and along the roads, so flares and the Mobile Phone's 30
seconds of "estate cameras" are worth carrying. The estate's dressing got
a second pass with the **Sol ambience batch** (2026-08-07, commissioned —
see Art): 27-storey point towers over the districts, a purpose-built
hawker centre, canopies on the platform ends, kerbside bus shelters, a
monsoon drain running the park-connector flank, two pedestrian overhead
bridges (non-solid — decor never blocks a road), and kopitiam seating in
the void decks. **Seeded dread beats** in
the NotD: Special Ops tradition land every 35s from a data-driven table
(dying car alarms, laundry still turning on the poles, the 265 timetable
glass smeared from the inside), and the MRT announcements ride the train
timeline — "Last train leaving. Please mind the platform gap."

## Determinism (gotchas 28–30)

Script state lives in Lua globals (47 chunk locals, headroom 153); EVERY
random draw — loot, patrol routes, dread beats — flows through **one
Park-Miller/Schrage stream** (`SeedRNG`/`NextRand`, bit-identical under
32-bit fengari and the game's 64-bit Lua; ParseNumArg keeps `-seed` to 9
digits so both widths accept the same strings). The seed **locks at the
first commitment point** — your first `-search`, or the first patrol at
T+90 — and `RUNLOG` accumulates machine-readable beats (`seed`, `class`,
`search`, `craft`, `infect`, `cure`, `rise`, `defect`, `patrol`, `esc`,
`gen`, `power`, `train|arrive/board/depart/empty`, `brood`, `nest`,
`verdict`). **The golden-run pin is deferred to phase 2** — deliberately:
phase 1 pins per-mechanic beats and byte-identical replay of full 200s
prefixes (`escalation.test.js`, `scavenge-craft.test.js`); the full
scripted-playthrough transcript lands with phase 2 so it only ever needs
pinning once against the phase-2 balance pass.

## Art (all four tiers of the doctrine) and credits

**Community models** (Hive Workshop, fetched 2026-08-07 with the user's
authorization; per-file provenance in `imports-credits.json`, per-author
credit here, in `-credits`, and in the quest log — author terms honored,
nothing re-hosted):

- **HerrDave** — *T-Virus Zombies* (Shambling Resident, Withered Uncle,
  Riot Walker + the shared `Zombies_Male.blp` at archive root), *Police
  Officer* (the APO class), *Urban Prop Pack* (bench, dumpster, locker,
  desk, table, payphone — Death-fixed, see below).
- **Ilya Alaric**, after Ujimasa Hojo's Villager — *Citizen Pack* (all
  four survivor-class civvies and the three residents; zero-import stock
  textures).
- **bakr** — *Assorted City Buildings* (the polyclinic).
- **Wayshan** (readme byline: purparisien) — *Modern Cars Pack* (the
  abandoned Compact and Van).

**Commissioned ambience models — the Sol batch** (AI fleet "Sol", GPT 5.6
Codex; user-commissioned delivery 2026-08-07; all eight accepted through
the full sanity gate at 0 errors / 0 severes / 0 warnings,
negative-controlled; per-file provenance in `imports-credits.json`,
credited in `-credits` after the human community authors). Shipped as
`Sol*.mdx` with per-model wiring decisions:

- **SolHDBBlock** (27 storey bands) — *supplements* the two generated
  blocks as the third tower variant, `HDB Block (Tower)`, one per
  district (gotcha-31 visual variety; the generated slab/point blocks
  keep their roles).
- **SolHawkerCentre** — *replaces* bakr's generic City Building as the
  Mayflower Hawker Centre's model (purpose-built beats generic; the
  now-unused CityBuilding.mdx was removed with its ledger entry — bakr
  still ships the polyclinic).
- **SolLampPost** (additive lamp glow) — *replaces* the generated
  Lamppost as the Street Lamp model; the generator entry was removed
  with the file (assets doctrine: the script regenerates exactly what
  ships).
- **SolBusStop** — *supplements*: the generated BusStop keeps the
  searchable Bus Stop role; Sol's smaller shelter is pure kerbside decor
  at road mouths the searchable stops don't cover.
- **SolMRTCanopy / SolStormDrain / SolPedBridge / SolKopitiam** — net-new
  decor: platform-end canopies, the monsoon drain run, two road-spanning
  overhead bridges, void-deck/hawker seating clusters.

The five decor classes are custom DOODADS (`objects-doodads.json`,
D000–D004), which the sim classifies as decorative and never
instantiates — the Sol pass provably shifts no logic test. All decor is
`solid:false` and placed clear of roads, pads and the boarding platform
(pathing-safety keep-out).

Local modifications are recorded per-file: the Citizen Pack rigs death on
the Villager's "Death Alternate" tag and the Urban props are Stand-only —
`assets/community-death-fix.mjs` (committed) renames the alternate
death/decay tags to plain names / appends a still-frame NonLooping Death,
so every import passes the strict sanity bar (gotcha 14; the overlap trick
the sanity tester rejects is documented in the script).

**Stock by path** (gotcha 31: every path verified in
`lib/data/stock-art.json`, 8 new icons promoted listfile-verified):
Ghoul (Sprinter), Zombie (Revenant), Abomination (Broodmother), infected
granary (kampong nests), villager/potion/crate/cheese/flare icon set.

**Generated models** (`assets/generate-models.mjs`, mdl-lib, all
sanity-clean): the **MRT train** (three cars, red cab bands, additive
headlights — the map's signature), station platform, viaduct track
segments, two HDB block variants (slab + point, team-color roof tanks),
substation, bus stop, barricade (the street lamp moved to the Sol batch
above). **Generated icons**
(`assets/generate-icons.mjs`, lib/icon.js): 21 BTN + auto-derived DISBTN
twins for everything no stock button depicts (kopi set, blowtorch, the
HDB silhouette, the train...).

Design inspirations (mechanics only, nothing copied): **Zombination v11**
(Trinin), **Zombie-Simulator 7** (SpirulinaN), **Dawn of the Dead**
(PreViO), **NotD: Special Ops**, **SWAT: Aftermath**.

## Chat commands

`-help` `-status` `-recipes` `-credits` `-class <c>` `-search`
`-craft <r>` `-reload` `-sprint` `-fix` `-board` `-seed N`; `-test`
toggles debug (northreach convention): `-gold N` `-clips N` `-give <r>`
`-zspawn <kind> [n]` `-esc N` `-clock N` `-power` `-infectme`
`-clearhorde` `-ff` `-runlog`.

## Layout

96×96 Lordaeron Summer heightfield, **no cliffs** (zombie pathing is
never in doubt): the elevated line is a raised berm on the east edge with
generated viaduct spans; the platform rect gates boarding. One E-W main
road to the station, one N-S estate road, and the tree-lined **park
connector** corridor the patrols favor. Five HDB districts (searchable
void decks), the Mayflower Hawker Centre (loot-dense), the Teck Ghee
Polyclinic (the cure region), three substations spread to force
traversal, and the kampong lair in the far SW. All of it — terrain,
doodads, preplaced units, regions — comes from ONE committed generator
(`assets/generate-layout.mjs`), so every coordinate agrees.

## Tests (maps/last-train/tests/, 64 tests, 98.2% line coverage)

`ammo` (draw/dry/Parang/reload/clip-drop/sentry belt), `infection`
(state, DoT math, both cures, death-into-defection), `corpse-rise`
(window, Molotov counterplay, esc scaling), `defection` (both-direction
alliance flips, the pack, wipe verdicts, solo defeat), `escalation`
(falloff math, state-keyed drip, patrol cadence + seeded replay),
`scavenge-craft` (seeded loot, all ten recipes, crafted-gear effects),
`objectives-train` (fix channel/interrupt, tech halving, part instant,
power gate, timeline, boarding, all three endings), `classes` (picker,
window, kits, sprint), `commands` (debug gate, credits, seed guard),
`ambience` (night/rain/fog, dread cadence + seeded replay, multiboard,
no GetLocalPlayer).

## Honesty notes (sim vs game)

- The sim has no pathing/combat AI: patrol walking, zombie aggro and real
  boarding runs are game-only. Region boarding, ammo draws, infection and
  verdicts are exercised for real.
- Usable crafted items sit on the `pman` (mana potion) base so they are
  activatable in-game with a harmless engine effect (our units have no
  mana); effects are scripted on the USE event and the script removes the
  item itself (`iper` overridden to 0). In-game usability is untested
  until the first playtest.
- Zombie hp scaling applies via `BlzSetUnitMaxHP` — a recorded stub in
  the sim (asserted via `EscHpOf` + the recorded call, coinstead's
  pattern).
- `Zombies_Male.blp` and `Citizen_Police.blp` must stay at the **archive
  root** — the models' TEXS chunks name them bare.

## Phase roadmap

Phase 1 (this): the full core loop, sim-proven. Phase 2: the golden-run
pin (gotcha 30) after a balance pass, in-game playtest + stock-art
promotions to game-verified, horde-side play depth for defected players
(active abilities), and endless/score-attack conventions.
