# Last Train from Yio Chu Kang

**A map by Serendipity.** A **1–4 player co-op zombie survival map** set in
a rain-soaked Singapore HDB estate on the island's last night — **phase
2B, THE TOWER**. You wake on the **sixth floor of Block 6A with every
lift dead**, and the playable slice this phase is fighting, sneaking,
building and bleeding your way DOWN the stairwell — six interior floors
of survival horror — until the void deck lets you out into the rain.
Beyond that door the whole phase-2A estate loop still runs (surges,
Noise, substations, the last train at T+12:00, the Broodmother, death =
defection), anchored to the moment you step outside — but it received no
new design work this phase.

**Phase 2B exists because of playtest 2** (verbatim): *"Take heavier
inspiration from Zombie Custom Defence. There's a very rich wealth of
triggers and custom effects out there. Things are placed kind of
nonsensically. Think waygates, first you have to survive & fight your way
out of a HDB, on the sixth floor, all lifts are down. Intense survival
horror vibe. You put too much work into the text."* — plus the mid-phase
directives *"There's not enough to do at all. Maybe let players build &
survive"* and *"We'll focus entirely on the HDB interior for now."* An
activity audit then located the "not enough to do" failures and its
mandatory fixes shipped (darkness with teeth, brace, chute, gas, decoy,
the graded loudness repair). **`DESIGN-WALKTHROUGH.md` is the fun gate
the implementation matches** (PIPELINE §10; gotcha 33: chat is meta only).

In-game name: **"Last Train from Yio Chu Kang"** (distinct internal name,
CLAUDE.md gotcha 17). Built and validated headlessly with wc3-map-toolkit;
compiled artifact: `maps/builds/last-train.w3x`. **The 2B build has never
been loaded in the real game — sim-proven only** (145 logic tests, 99%
script line coverage; playtesting the tower slice against the walkthrough
is the standing next step).

## The tower (phase 2B — the playable slice)

Block 6A's interior is six walled pockets on the map's south margin,
linked by **trigger-teleport stairwell doors** (region enter →
`SetUnitPosition` + camera pan — the robust, sim-testable form of the
"waygate" pitch; walls are solid rock ranks until the commissioned Sol
round-4 interior set lands):

- **6F corridor** — spawn, the four **class circles** (pick your
  neighbour identity as you flee), the sparking dead lift, the dead
  neighbour's guaranteed **Parang** (the descent never NEEDS a bullet).
- **5F flat warren** — rummage-rich; **Uncle Heng** is trapped in a flat
  (2s presence frees him; +25 XP, +25 more if he reaches the rain; he
  follows through doors but NOT down the chute).
- **4F dark corridor** — **darkness with teeth**: unlit floors rummage in
  5s not 3 and add a body to every spawn event. Remedies: flip the
  floor's **DB box** (5s presence; lights it for good, but the breaker
  hums +1 loudness/min) or drop a **Watchfire** (silent, lasts while it
  burns, costs the Kerosene that was half a Molotov).
- **3F blocked landing** — furniture squats on the stair door, and the
  floor **leaks gas**: chop the blockers with a Parang on an EMPTY clip
  (silent, each blocker pays out a Plank, exempt from loudness) or let
  one live round / a Molotov **detonate the landing** (blockers blown,
  walkers cooked, all un-drawn prop loot destroyed, +4 loudness, you get
  singed). Any live round fired indoors on that floor is the spark.
- **2F nest floor** — a rat-king nest breeds in the dark (burning it
  slows the whole estate night after); the **rubbish-chute bin alcove**
  is here too: chute mouths on 6F–3F drop you straight down for 60
  damage and a +2 THUMP, skipping every floor between.
- **1F void deck** — the densest fight, then the exit door IS the slice's
  victory beat: the rain, one kept relief line, and the estate heartbeat
  starts counting from YOUR exit (wanderers +90s, first siren +100s —
  the 2A schedule, exit-anchored). The train clock never waited.

**Pressure works both directions**: cleared floors raise **risers**
behind you on every door transit (capped per floor; a barricade braced
at the door absorbs the event — the door takes the thuds), and
**climbers** come up every 30s at the deepest occupied floor — 1 base,
+1 per 3 points of **stairwell loudness** (smashes +2, every 8th round
+1, chute thumps +2, gas +4, decoy deaths +2; decays 1/20s; DISPLAYED on
the multiboard), +1 on dark floors, +1 with 3+ players. One free
**peek** per floor: a beat at the stair door reads the next floor's
walkers and lights as floating text.

**Tower death is a setback, not the traitor system** (and not spectator
purgatory): your corpse rises where you fell (standard burnable window),
and ~18s later you stagger back in at your floor's landing, one clip
poorer, gun half-seated. If the LAST living survivor drops indoors the
night ends (solo death = a plain defeat). **Death = defection remains
the ESTATE's rule** beyond the door, fully functional and tested — it
just got no new design work this phase, per directive.

## Build & survive (phase 2B)

The ZCD lesson applied fully — their barricade costs one kill's bounty,
so building is CONSTANT, not a savings goal. Every survivor carries five
point-cast verbs (ANcl, data-driven via `uabi`):

| verb | key | cost | what stands |
| --- | --- | --- | --- |
| Build Barricade | Z | 1 Plank | 800 HP wall; braces stair doors |
| Lay Spike Wire | X | 1 Pipe | 250 HP; claws attackers back 15 |
| Light Watchfire | V | 1 Kerosene | light pool + 900 night vision; lights dark pockets |
| Set Field Sentry | B | 1 Sentry Kit | the 40-round gun; a 2nd kit REARMS a dry one |
| Place Noisemaker | N | 1 Battery | 15s radio blare: pulls every walker within 900, dies at +2 loudness |

**Raw halves build the fort; pairs auto-combine into tools** — the same
material pool feeds both mouths, so every pickup is a decision
(Plank: barricade or half a Parang; Kerosene: light or fire; Battery:
decoy now or Sentry Kit later). **Repair is presence**: stand beside any
damaged work and it heals 20/s (Technician 40/s). The fort persists all
night, shows on the board (**Fort row**), feeds the horde a little XP
when it falls, and every work standing at the verdict scores 25.

**Trade quirk (documented, accepted)**: crafting runs on PICKUP — hand a
teammate a raw half and it auto-combines the moment they hold the
partner half. Handing someone a Plank can cost them their build fuel.

## The two ways out (and the one way down)

- **The train**: arrives at **T+720s**, departs **180s later** (the
  evacuation-window ending — credit *Zombination v11* by Trinin), under a
  **persistent countdown window running from frame one** (credit *Zombie
  Defense Custom* — the clock is a metronome, not just a deadline). The
  doors only open if **all three substations** spread across the estate
  are live (STAND in the yard: progress accrues each un-hit second,
  PERSISTS per substation, a hit knocks 3s off — anti-camping by
  construction, credit *SWAT: Aftermath*): no power, no doors, no ride.
  Boarding = walking onto the platform while the train waits. The whole
  boarding window is a **platform siege**: everything walking converges
  on the fare-gate forecourt, and the night's banked barricades and
  sentries are the chokepoint. Departure with anyone aboard ends the
  run: boarders **win**, stragglers lose, the horde loses.
- **The Broodmother**: 3500 HP in the kampong lair on the far corner of
  the map. Kill it any time — before the train, after missing the train —
  and every surviving player wins; defected players lose with the horde.
- **The wipe**: when the last living survivor falls (and nobody made the
  train), players who defected **earlier** win as the horde; the last to
  fall is the horde's meal, not its member.

## Mechanics (adopted with credit, flaws fixed)

- **Death = defection, and the defector CONDUCTS** (credit
  *Zombie-Simulator 7* by SpirulinaN, and *Zombination*; the buildup is
  canon I6 — side-switch is the canon's rarest, most prized answer to
  death): a dead survivor converts **in place** — their Revenant rises
  where they fell (claws scaled by the horde level) with a pack of three
  shamblers, all player-controlled; the alliance flips **both
  directions** (gotcha 24). The Revenant's kit: **Feast (F)** — target
  an un-burnt corpse and it rises IMMEDIATELY into your pack, making
  Molotov corpse-burning direct PvP denial — and **Shriek (C, 60s)** —
  the next surge (and the Last Mile trickle for 90s) converges on your
  target point: the traitor plays the survivors' vulnerability windows.
  Their multiboard row flips to `HUNT: no one boards`. No elimination,
  no spectating; solo death stays a plain defeat — **best with 2+**.
- **The surge heartbeat** (credit *Zombie Defense Custom* by Lions_Blood
  — wave clock + warning discipline, adapted): a **siren** (plus one
  dread line and a minimap ping) warns **20s** ahead of every surge, on
  a ~120s cycle at T+120/240/360/480/600, then the **Last Mile** — a
  20s trickle drifting station-ward — and one final oversized surge at
  T+700 on the forecourt. Surges are sized by **horde level × living
  survivors × district Noise − nests down**, and target the survivors'
  district or an ACTIVE repair yard. 1–2-zombie ambient wanderers stay
  as texture (every 45s from T+90).
- **District Noise**: smash +10, Molotov +15, every live gunshot and
  sentry round +1; heat cools ~1 per 6s. The next surge in a district is
  sized ×(1 + heat/100). Loud is fast, quiet is slow, the siren is
  always counting. The multiboard shows the hottest district
  (quiet / uneasy / ROUSED).
- **Rat-king nests** (credit *ZCD*'s radiation fragments, adapted):
  8–12 seeded nests dealt across the districts at the seed-lock
  commitment (plus the 3 lair nests). Burn one (Molotov does 200 to
  nests) or smash it (150 HP): **the escalation drip AND every future
  surge shrink one step**, and the burner earns 30 XP. Downtime is
  spendable; camping has counterplay.
- **Survivor XP + levels** (canon I2): kills pay by kind (shambler 6 …
  riot 14, revenant 25), objectives pay more (substation 40, nest 30,
  cure 10); 80 XP a level, each level +30 max HP / +2 damage; **level 3
  unlocks the class signature** — Heartlander *Steady Hands* (3s
  reloads, +2 clip per level), APO *Riot Discipline* (10s half damage),
  Paramedic *Field Triage* (AoE cure+heal 100), Technician *Overclock*
  (next substation instant).
- **The estate relights**: every fixed substation flares 4 street lamps
  on along its district roads — the map is the progress bar.
- **The Provision Shop** (void deck): tools priced in CLIPS (lumber),
  engine-charged — Barricade Kit 2, Mobile Phone 3, Wet Bandage 2,
  Flare 1. Ammo-vs-tools is the trade. (The reconciled spec's "extra
  Clips" ware was circular — clips are the currency — so the Wet
  Bandage is the fourth ware; deviation recorded in
  DESIGN-WALKTHROUGH.md §6.)
- **Ground spills** (credit *ZCD*'s bundle economy, adapted): a
  survivor-credited zombie kill has a 20% seeded chance to spill a
  visible ground drop — half clip packs (+1 clip on pickup), half
  materials. Roaming and fighting both pay.
- **Curable slow-burn infection** (credit *Zombination*; their
  dummy-caster churn replaced with per-unit STATE on the virtual clock):
  zombie damage infects; the DoT runs **1.5 dps** (3 damage every 2s)
  until cured — **Wet Bandage** above 40% health (the Paramedic cures at
  ANY health), or **5 seconds inside the polyclinic grounds**. Untreated,
  it kills you into defection. A cure pays +10 XP.
- **Corpse-rise** (credit *Zombination*): anything the horde kills stands
  back up as a shambler after a **visible 3.5s window** at the death spot
  — unless a **Molotov** burns the corpse first (fire also scorches
  zombies for 60; scripted damage never draws your ammo).
- **Gold-as-bullets, lumber-as-clips** (credit *Dawn of the Dead* by
  PreViO): every shot costs **1 round** (gold), drawn on the DAMAGING
  event, and makes **1 Noise**; a dry clip zeroes the shot (a carried
  **Parang** keeps you at half damage); **Reload is ability R** — burns
  1 clip, **4 seconds with the gun down** (outgoing shots zeroed) but
  your **legs still work** (phase 1's PauseUnit is gone:
  reload-while-fleeing is the genre's tension moment), then seats a
  full clip. Clips come from scavenging, spills and the shop. **Sprint
  is ability E** (+120 speed, 4s, 20s cooldown).
- **The anti-snowball pair** (credit *Zombination*, adopted verbatim):
  kill-XP shared with a **0.75^(n−1) falloff** per extra zombie within
  600 of the kill (integer math, crowd capped at 8) **plus** a passive
  drip every 20s so a quiet horde still scales. Escalation is keyed to
  **STATE** — the drip grows with the dead-resident ratio and the
  defection count, never wall-clock alone (fixing *Zombie-Simulator*'s
  fire-into-the-void timers). Horde levels (+10% zombie hp each) feed
  surge size and composition.
- **Rummage or SMASH** (credit *Zombination*'s furniture scavenging,
  de-chatted): every bench, dumpster, locker, desk, hawker table, car,
  van, payphone and bus stop is one **seeded** draw — **stand within
  ~250 for ~3s** and your survivor quietly turns it out (loot pops on
  the ground), or **smash it open** (props are ~30 HP units; shooting
  one costs rounds) for instant loot at **+10 Noise**. Same seeded
  table either way.
- **Auto-combine crafting** (the phase-2A cut: 4 recipes, each material
  in EXACTLY one — that is what makes crafting safe to run automatically
  on pickup, chime + floating text, no typing):
  | recipe | makes |
  | --- | --- |
  | Cloth + Bottled Water | **Wet Bandage** |
  | Plank + Pipe | **Parang** |
  | Bottle + Kerosene | **Molotov** |
  | Wire + Battery | **Sentry Kit** (40-round belt) |
  Cut: Kopi Set, Generator Part (the instant-fix item deleted the best
  tension beat) and Blowtorch are GONE; Barricade Kit / Mobile Phone /
  Flare moved to the shop (+ rare desk/locker loot); Rations are simply
  eaten (+100).
- **Classes** (genre furniture, Singapore-flavored; walk onto a class
  circle in the first 40s — the window closes silently, no policing):
  **Heartlander** (clip 12, 550 HP, rations), **Auxiliary Police
  Officer** (clip 24, hardest hits, 3 clips), **Paramedic** (clip 8,
  cures at any HP, 2 bandages), **Town Council Technician** (2× repair
  rate, starts with a Barricade Kit).

## The juice and the text diet (phase 2B, ZCD-mined)

Playtest 2: *"a very rich wealth of triggers and custom effects out
there ... you put too much work into the text."* The Zombie Defense
Custom scripts were decomposed for their effect vocabulary (AnimateDead
raise flashes on every spawn, item-acquire loot pops, revive flashes,
camera-shake ladders, minimap pings, fire-and-forget `DestroyEffect`
hygiene) and the map now TALKS through the world instead of the chat:

- **every scripted zombie spawn** wears the AnimateDead raise flash (one
  grammar for surges, risers, climbers, corpse-rise, Feast);
- **kills bleed** (HumanBloodLarge0); **level-ups** are a burst + sting;
  **loot pops** at the prop (AIemTarget) with a floating "rummaging..."
  channel; **crafting** is chime + floating name; **infection** drips
  green every DoT tick; **cures** flash dispel; **corpse windows** are a
  VISIBLE ground marker destroyed at rise/burn/Feast (the one persistent
  handle family — nothing leaks, pinned by test);
- **builds** land with dust + the placement sound; **substation yards
  spark** while worked and flash on completion; the **dead lift sparks**;
  unlit floors flicker;
- **screen shake, sparingly**: train arrival (with a breath of
  CinematicFade black), the platform siege, the Broodmother, the gas
  blast, a shiver on Shriek;
- sounds (all listfile-verified into `lib/data/stock-art.json`, kinds
  `effect`/`sound` — the table grew script-side kinds this phase): the
  siren, the combine chime, Levelupcaster, BuildingPlacement,
  QuestCompleted, DoorSlam, the Elevator drone, the Warning sting.

**The text diet**: every per-action chat line is DELETED — rummage
start/finish, craft, clip-bank, level-up, corpse-rise, smash, molotov
report, shop receipt, sprint, reload flow (now floating text at the
unit), sentry-dry, triage/riot self-reports (~21 recurring callsites).
KEPT: the siren warning + dread line, PA/train beats, verdicts,
defection announces, one-time teaches, and meta commands. The
`effects-text` suite pins BOTH directions (deleted lines stay deleted;
the spine still speaks; a scripted 200s estate run emits ≤10 lines).

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
the void decks. **Dread beats** in
the NotD: Special Ops tradition draw from a data-driven table (dying car
alarms, laundry still turning on the poles, the 265 timetable glass
smeared from the inside) — but phase 2A CUT the 35s metronome: dread now
speaks only inside surge warnings (seeded) and at scripted timeline
beats (a fixed line at T+45), so it always means something. The MRT
announcements ride the train timeline — "Last train leaving. Please
mind the platform gap."

## Determinism (gotchas 28–30)

Script state lives in Lua globals (gotcha 28 — the chunk stays far under
the 200-local cap); EVERY random draw — loot, spills, surges, wanderers,
nest deals, siren dread — flows through **one Park-Miller/Schrage
stream** (`SeedRNG`/`NextRand`, bit-identical under 32-bit fengari and
the game's 64-bit Lua; ParseNumArg keeps `-seed` to 9 digits so both
widths accept the same strings). The seed **locks at the first
commitment point** — the first loot draw (rummage/smash), the first
spill roll, the first siren, or the first wanderer at T+90 — and the
lock also DEALS the seeded rat-king nests, so `-seed N` before
commitment re-deals the night. `RUNLOG` accumulates machine-readable
beats (`seed`, `class`, `rummage`, `smash`, `craft`, `clip`, `spill`,
`buy`, `nests`, `nest|down`, `wander`, `siren`, `surge`, `lastmile`,
`trickle`, `siege`, `lvl`, `sig`, `relight`, `riot`, `triage`,
`overclock`, `feast`, `shriek`, `infect`, `cure`, `rise`, `defect`,
`esc`, `gen`, `power`, `train|arrive/board/depart/empty`, `brood`,
`verdict`). **Phase 2A deliberately re-pinned the seeded-replay
prefixes** (the loop changed; the beat-diff rationale is in
`tests/escalation.test.js`'s header, per PIPELINE §8's re-pin doctrine).
**The golden-run pin stays deferred** until after the 2A in-game balance
pass, so the full-playthrough transcript is pinned once, not re-pinned
after tuning.

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

**Sol round 2** (2026-08-07, same commission and gate; ten of the twelve
delivered models are texture-fix resubmissions — custom BLPs swapped for
stock `Textures\*.blp` references, gate re-run 0/0/0 — noted per-file in
the ledger's `modified`):

- **SolBroodmother** (300×300, the big one) — **replaces the stock
  Abomination as the boss unit's model** (`u005` umdl; the one round-2
  piece that is a UNIT, not decor): full identity set kept, `usca`
  dropped 1.6 → 1.0 since the model is authored at boss size, icon stays
  the game-verified `BTNAbomination` (still reads as the flesh-mass it
  is). Cosmetic-only: umdl/usca are outside the sim's seeded stat set, so
  all 64 logic tests and the seeded-replay pins are untouched.
- **SolFleshPods / SolBoneMound / SolKampongShell** — the kampong lair
  set: 5 pods hugging the nests, 4 bone mounds in the muck, 4 ruined
  house shells on the NE/N approach fringe.
- **SolFareGates / SolPlatformDoor** — the station set: a two-segment
  fare line flanking the MRT entrance portal on the forecourt; three
  platform screen-door segments tiling the platform's track-side gap
  line (the one documented keep-out exception — dressing the platform is
  the point, the D000 canopy precedent; top exactly 100, camera-safe).
- **SolVoidDeckPillars / SolMailboxWall / SolBikeRack** — the void-deck
  set at the spawn deck and the two district decks the round-1 kopitiam
  clusters didn't fill (Gardens, Cheng San); Seletar and the station
  mouth each get a lone bike rack.
- **SolTaxi / SolFoodCart** — street pieces: three shoulder-parked taxis
  among the round-1 abandoned cars (varied angles), food carts at the
  hawker forecourt and the main/N-S junction corner.

**Sol round 3 — the Singapore identity set** (2026-08-07, same commission
and gate, 13/13 accepted 0/0/0, negative-controlled): the in-house
visual-identity placeholder models are RETIRED, replaced one-for-one by
Sol's versions under the same slots and doodad classes —
`SolSkyTowerSlab/Step/Crown/Twin/Spire`, `SolMRTEntrance`, `SolMRTSign`,
`SolLaundryRack`, `SolLinkwayCanopy` (D005–D00D re-pointed; every
placement position unchanged), and **SolMRTTrain** replaces the generated
train as h01A's unit model (X-authored, so under the existing spawn
facing 270 the train finally berths NORTH-SOUTH along the platform).
Net-new: **SolSkyTowerArc** (D018) — the skyline row's sixth DISTINCT
silhouette, replacing the scaled duplicate slab —, **SolViaductBent**
(D019) — between-span pier rhythm along the berm centerline (the gate's
86-total-crosshead reading verified too narrow for the TrackSegment's
160-wide deck, so the in-house spans keep their integrated piers) — and
**SolStationClock** (D01A) — two lit clock totems at the platform ends
(the D000/D012 platform-dressing precedent). Wiring notes live in
`assets/generate-layout.mjs`; the laundry racks turned to angle 0 for
Sol's wall-flush −y frame, and the linkway tile stretches ×2.11 to the
old 270 slot so the runs stay flush without churning a single id.

The Sol decor classes are custom DOODADS (`objects-doodads.json`,
D000–D004 round 1, D00E–D017 round 2, D018–D01A round 3, D005–D00D
re-pointed to round-3 models), which the sim classifies as decorative and
never instantiates — all three Sol passes provably shift no logic test. All decor is `solid:false` and placed clear of roads, pads
and the boarding platform (pathing-safety keep-out, asserted in
`generate-layout.mjs`; the platform screen doors are the documented
exception above).

Local modifications are recorded per-file: the Citizen Pack rigs death on
the Villager's "Death Alternate" tag and the Urban props are Stand-only —
`assets/community-death-fix.mjs` (committed) renames the alternate
death/decay tags to plain names / appends a still-frame NonLooping Death,
so every import passes the strict sanity bar (gotcha 14; the overlap trick
the sanity tester rejects is documented in the script).

**Stock by path** (gotcha 31: every path verified in
`lib/data/stock-art.json`, 8 new icons promoted listfile-verified):
Ghoul (Sprinter), Zombie (Revenant), infected granary (kampong nests),
villager/potion/crate/cheese/flare icon set (the Broodmother wore the
stock Abomination until Sol round 2; its `BTNAbomination` icon stays).

**Generated models** (`assets/generate-models.mjs`, mdl-lib, all
sanity-clean): station platform, viaduct track segments (T-crosshead
piers), two HDB block variants (slab + point, team-color roof tanks,
pastel accent schemes), substation, bus stop, barricade. The street lamp
moved to Sol round 1; the MRT train and the whole visual-identity pass
set (skyline towers, MRT entrance/sign, laundry rack, linkway canopy)
moved to Sol round 3 — their generator entries were removed with the
files (the SolLampPost precedent; the script regenerates exactly what
ships). **Generated icons**
(`assets/generate-icons.mjs`, lib/icon.js): 21 BTN + auto-derived DISBTN
twins for everything no stock button depicts (kopi set, blowtorch, the
HDB silhouette, the train...).

Design inspirations (mechanics only, nothing copied): **Zombination v11**
(Trinin), **Zombie-Simulator 7** (SpirulinaN), **Dawn of the Dead**
(PreViO), **NotD: Special Ops**, **SWAT: Aftermath**.

## Visual identity & the camera-safety doctrine (2026-08-07 pass)

The estate now reads explicitly Singaporean without costing gameplay
view. The identity pieces shipped 2026-08-07 as in-house generated
placeholders and were **retired for Sol's round-3 commissioned set**
(same slots, same doodad classes D005–D00D re-pointed, plus D018–D01A;
gate-clean 0/0/0 with render-rig reads per model — see Art above).
Everything is placed by `assets/generate-layout.mjs` as **non-solid
decor doodad classes** (sim-invisible like the earlier Sol batches, so
the logic tests and all seeded-replay pins are untouched):

- **CBD skyline backdrop**: six towers, now six DISTINCT silhouettes —
  slab (fin pair), stepped (lit setbacks), twin-with-skybridge,
  wedding-cake spire with red aircraft beacon, a generic
  three-column-with-rooftop-deck crown (suggestive of a bayfront hotel
  but no real building's trade dress), and round 3's bowed-front **Arc**
  in the slot the duplicate scaled slab used to fill — along the NORTH
  map edge, heights 560–790, per-floor window banding + dim additive
  window glints for the permanent night.
- **MRT identity**: the train (now `SolMRTTrain.mdx`) carries a proper
  white-body/dark-window/red-accent livery with south-face door rhythm
  (SMRT-esque, no logos); a see-through glass-vault **station entrance
  pavilion** on the forecourt; abstract **line-sign totems** (faceted
  red disc + white cross-band, no text) at the station and two road
  corners; the elevated line reads via the in-house spans' T-crosshead
  piers PLUS round 3's **viaduct bents** marching the inter-span gaps;
  two lit **platform clocks** at the canopy ends.
- **Estate character**: pastel accent schemes on the HDB blocks — slab
  blocks get the classic painted-coral gable ends with a white stripe,
  point blocks mint corner columns; the five Sol towers each get a
  district pastel wash (mint/peach/sky/lavender + one unwashed) via
  **unit-tint clone classes** (`h01D–h01G`: `uclr`/`uclg`/`uclb` over
  the same `SolHDBBlock.mdx` — Sol's file is never edited); **laundry
  racks** (staggered poles + three-pastel hanging cloth) flush on tower
  south faces; **linkway canopies** (< 100 tall) in three covered-walkway
  runs (spawn void deck, hawker approach, station approach).

**The camera-safety doctrine** (binding for all future dressing): WC3's
camera looks from the SOUTH, tilted down, so tall models placed south of
walkable space occlude the units behind them. Therefore skyline-height
pieces (> 400 units tall) may only stand along the NORTH map edge and
the far NE/NW corners — background silhouette with nothing walkable
behind — and `generate-layout.mjs` **asserts** this (plus road-core and
platform keep-outs) at generation time. Mid-rise (~200–400) may line
east/west margins if set back from roads; nothing over ~180 tall may
stand south of any walkable row except the existing viaduct pylons
(thin). One documented exception: the ~230-tall laundry racks mount
flush against each tower's own south face — the solid tower is directly
behind them, so they occlude nothing a unit can stand on. All identity
pieces are `solid:false` decor: zero pathing, zero logic shift.

## Chat commands (META ONLY — gotcha 33)

`-help` `-status` `-recipes` `-credits` `-seed N`; `-test` toggles debug
(northreach convention): `-gold N` `-clips N` `-give <r>`
`-zspawn <kind> [n]` `-esc N` `-clock N` `-power` `-infectme`
`-clearhorde` `-ff` `-runlog` `-surge` `-xp N` `-noise N`.

The seven phase-1 gameplay verbs (`-class` `-search` `-craft` `-reload`
`-sprint` `-fix` `-board`) are DELETED and do not respond — the silence
is pinned by `tests/commands.test.js`. (`-cam N` was considered and
declined: the map keeps its zero-GetLocalPlayer doctrine.)

## Layout

96×96 Lordaeron Summer heightfield, **no cliffs** (zombie pathing is
never in doubt): the elevated line is a raised berm on the east edge with
generated viaduct spans; the platform rect gates boarding. One E-W main
road to the station, one N-S estate road, and the tree-lined **park
connector** corridor the wanderers favor. Five HDB districts (searchable
void decks), the Mayflower Hawker Centre (loot-dense), the Teck Ghee
Polyclinic (the cure region), three substations spread to force
traversal, and the kampong lair in the far SW. Phase 2A adds the four **class
circles** (statue-marked rects at the spawn deck's south edge) and the
**Provision Shop** at the void deck. All of it — terrain, doodads,
preplaced units, regions — comes from ONE committed generator
(`assets/generate-layout.mjs`), so every coordinate agrees.

## Tests (maps/last-train/tests/, 145 tests, 99% line coverage)

Phase 2B adds four suites and re-targets the rest: **`tower-escape`**
(pockets, door teleports, risers/climbers, blocked landing, nest floor,
rescue, exit-starts-the-estate, tower death/respawn, `-deck`),
**`tower-activity`** (A1 darkness/breakers/watchfire-light, A2 brace,
A3 chute, A4 gas — all three routes, A5 decoy, A8 peek, loudness
display/decay/exemption), **`build`** (all five verbs, costs, clamp,
spike retaliation, rearm, presence repair, fort persistence/board/score)
and **`effects-text`** (effect presence + destroy hygiene, deleted-line
pins, kept-spine pins, the ≤10-lines/200s volume pin). The estate suites
below were **deliberately re-targeted** (PIPELINE §8 notes in each
header): the estate heartbeat is now EstateClock-anchored, so they open
the estate with the `-deck` debug door at t=0 — every 2A schedule pin
then holds unchanged; message asserts moved to floating-text/effect
records where the text diet deleted lines.

Every verb is exercised on its REAL input (gotcha 33's sim clause):
`ammo` (draw/dry/Parang/reload-as-ability-R with gun-down and no
PauseUnit/sentry belt), `infection` (state, DoT math, both cures + XP,
death-into-defection), `corpse-rise` (window, Molotov counterplay +
noise, esc scaling), `defection` (alliance flips, the pack, Feast incl.
burn-denial, Shriek retargeting, the HUNT board row, wipe verdicts, solo
defeat), `escalation` (falloff math, state-keyed drip + nest trim,
wanderer cadence, the deliberately RE-PINNED seeded-replay prefix — see
its header), `scavenge-craft` (rummage-by-proximity, smash + noise +
ammo cost, auto-combine ×4, clip packs, the cut list stays cut, seeded
replay), `objectives-train` (stand-to-repair persistence/knockback/2×/
Overclock, relighting, power gate, countdown window, timeline, region
boarding, all three endings, outcomes-only score), `classes` (circles,
silent window close, kits, sprint-as-E, invulnerable statues),
`commands` (deleted-verb SILENCE, debug gate, ZCD-credited rolls, seed
guard), `ambience` (night/rain/fog, the dead metronome, reworked
multiboard, no GetLocalPlayer), plus NEW `surges` (siren lead, schedule,
noise/player/nest sizing, repair-yard pull, Last Mile trickle, platform
siege, spills, seeded replay) and `power-curve` (kill/objective XP,
level-ups, all four signatures, the shop's SELL flow + clip prices).

## Honesty notes (sim vs game)

- The sim has no pathing/combat AI: surge/wanderer walking, zombie
  aggro and real boarding runs are game-only. Region boarding (and the
  class circles), ammo draws, infection, noise, XP and verdicts are
  exercised for real.
- **Tower additions (2B)**: the pocket WALLS block by doodad pathing —
  game-only (the sim teleports; preflight's honest-limit list covers
  pathing); the noisemaker's pull and the climbers'/risers' pressure are
  exercised as real orders + spawns, but the in-game AGGRO FEEL (walkers
  actually pressing a braced door, the decoy's crowd turn) is game-only;
  the gas blast, chute damage, breaker lighting and dark-rummage timing
  are fully sim-exercised; the DB box's visual (a scaled substation
  cabinet) and the radio's barrel stand-in await the Sol round-4
  interior art pass.
- Abilities are DATA + trigger dispatch: the sim fires the spell events
  (`sim.cast`) and the script does the work; the ANcl-based buttons'
  in-game cast feel (hotkeys R/E/F/C, cooldown display) is game-only
  (preflight's honest-limit list: ability data-field interpretation).
- The Provision Shop charges its clip prices via item lumber cost
  (`ilum`) — the ENGINE does the charging in-game; the sim exercises the
  SELL event flow and pins the prices as object data.
- The siren/chime `CreateSound` paths are stock and cosmetic — a wrong
  path is silent, never a crash; unverifiable headlessly.
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

## Parked this phase (deliberate, per directive)

- **Estate-wide layout coherence**: only the cheap pass shipped — hawker
  tables pulled into stall rows under the pavilion, a generator-time
  **furniture-anchor assert** (every searchable prop must sit in a tower
  pocket or within reach of a building anchor — it caught the exact
  "tables on lawns" the playtest screenshot showed), and the tower's own
  keep-outs. A full estate dressing pass waits.
- **Estate-wide juice** beyond the spine beats (surge/train/brood/
  substation effects shipped; per-district flavor waits).
- **Traitor/defection design work** (system intact + tested, no new
  design; the tower slice does not depend on it).
- **Advisor items A6/A7/A9–A12** (locked doors+keys, the crying child,
  joss sticks, balcony shimmy, mahjong tiles, electrified puddle) — the
  TOWER table is field-per-feature so each lands as one field + one
  handler; A7/A9 first next pass.
- **Golden-run pin** — still deferred until after the first tower
  playtest + balance pass (pin once, not re-pin after tuning).

## Phase roadmap

Phase 1: the full core loop, sim-proven — playtested 2026-08-07, verdict
"constant typing is bad, core loop is unfun". Phase 2A: the fun
transplant — de-chatted verbs, the surge heartbeat, Noise, the power
curve, nests, spills, the conductor defection kit. **Phase 2B (this):
THE TOWER** — playtest-2-driven: the Block 6A interior slice (six-floor
survival-horror descent) as the whole playable focus, build & survive
indoors, the activity pass (darkness/brace/chute/gas/decoy/loudness),
ZCD-grade juice, the ~70% text diet, tower-respawn death rule; gated by
DESIGN-WALKTHROUGH.md (PIPELINE §10). Next: playtest the tower slice
against the walkthrough, balance, THEN the golden-run pin (gotcha 30),
stock-art promotions, and the estate's own 2C pass.
