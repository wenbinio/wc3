# Zombie-survival comparison — Last Train from Yio Chu Kang vs. the field

An honest capability matrix of Last Train from Yio Chu Kang
(`maps/last-train/`, phase 1, 2026-08) against the zombie-survival maps
it studied. Style and doctrine: docs/reference/roguelike-comparison.md
and economy-survival-comparison.md — **bold** marks the dimension winner,
and where a competitor wins we say so plainly.

**Provenance of this dossier**: written from the session research reports
dated 2026-08-07 (two decomposition agents + one genre-survey agent) that
designed Last Train, committed here before context compaction could lose
them. All decomposed sources remain re-downloadable: EpicWar **246910**
(Zombie-Simulator 7), **257009** (Zombination v11), **148016**
(NotD: Special Ops v1.12k), **2253** (Dawn of the Dead 5.2).

**Evidence classes differ by row and column and we do not blur them**:

- **Decomposed** — actual artifacts extracted and read with this toolkit:
  Zombie-Simulator 7, Zombination v11 (the two primaries), NotD: Special
  Ops v1.12k (protected; probed + script-read) and Dawn of the Dead 5.2
  (open source, 390 triggers). Numbers in their rows are measured facts.
- **Surveyed only** — published material, not artifact decomposition:
  SWAT: Aftermath (redscull.com readme + itch.io systems breakdown),
  Undead Assault 2/3, Eras Zombie Invasion, Parasite 2/3. Their rows are
  hedged accordingly and **they get no loss-verdicts from us**.
- Last Train itself is **sim-proven only**: 64 headless logic tests at
  98.2% script line coverage, never yet loaded in the real game client —
  the same honesty rule its README leads with. Every competitor beats it
  on that row today.

## The genre map: five archetypes

- **A. Squad-shooter co-op ops** — marine squads, scarce ammo, darkness,
  objective chains. NOTD lineage (NotD: Special Ops), Undead Assault 2/3,
  SWAT: Aftermath.
- **B. Compound holdout** — fortify, scavenge, survive authored waves.
  Dawn of the Dead, Zombie Island, Zombie Defense (Eejin & Frotty —
  still updated Dec 2024). Last Train's nearest chassis.
- **C. RTS infection assault** — armies vs a spreading plague. Eras
  Zombie Invasion (92 published versions; plague markers erupt 5 minutes
  after placement; 5–6 hour games). Modern face: Great War Zombies —
  see modern-maps-analysis.md §1c.
- **D. Hidden-infection social deduction** — Parasite 2/3 (DarkShoGun):
  spaceship crew, one hidden infested, a station-AI player. NotD:SO also
  ships a Versus mode.
- **E. Horror adventure / objective runs** — Resident Evil maps, Zombie
  Hunter 3 (masteries/souls/bosses).

Last Train is a B-chassis (holdout estate, scavenge, barricades) that
imports A's ammo/darkness economics, ZS7/Zombination's defection twist,
and SWAT-style anti-camping objectives.

## The decomposed primaries (real numbers)

### Zombie-Simulator 7 (SpirulinaN, EpicWar 246910, v7 final 2014)

Asymmetric city-infestation in the two-district city "Vincio". Forces:
Government = red President + blue computer civilian pool; Civilians = 8
survivor slots; Biomind = brown zombie-overlord player + dark-green
ambient Infected.

- **Infection on-kill**: undead kills organic non-mech → +1 Evolution
  Point (lumber) to the Biomind + 1 Infected (h00H, 80 hp / 22 dmg /
  170 ms) at the corpse; special corpses spawn variants (deer → Infected
  Zombie; chicken/frog → Parasite).
- **Death = defection** (the genre's boldest idea, adopted by Last
  Train): a dead survivor's player is converted in place — color set
  brown, units donated to the civilian pool, unallied from humans,
  allied-vision with the Biomind, granted 5000 gold + 3 Parasites at the
  zombie spawn; Biomind +100 EP per hero killed.
- **Zombie economy**: Parasites (5 hp) build Hives (600 hp) driving EP
  income; EP buys an evolution tree — Dashers 270 hp/500 ms, Spitters
  400 hp/60 dmg, Leapers, Boomers (5s fuse), invisible Stalkers
  450 hp/48 dmg, Gigantus 3700 hp/160 dmg, Masser 1000 hp herder,
  anti-mech Dematerialisers 5 hp/55 dmg; **30+ scripted zombie types
  with lore cards** — overlord-side content no other decomposed map
  matches.
- **Human economy**: +1 lumber/5s salary to every human; loot crates →
  sell to shops; killing civilians/cars pays but flags a 30s war with
  the city; the President taxes shop sales (pistol 50g, radio 100g,
  battery 200g, body armor 250g cuts) + income from two 900 hp Radar
  Stations until they're destroyed.
- **Cadence**: ambient packs on staggered periodic loops
  (300/310/340/380/400/410/425/450/480/525/900/930/1350/1500s cycles);
  ~20 one-shot events 250s → 4000s drop military reinforcements
  (Marines 200–300 hp, tanks, a 470-dmg "Armageddon") + item caches.
  Time set 21:00 with dawn/dusk enabled — flavor only.
- **Win/lose**: Biomind hero dies → all zombies wiped, everyone else
  wins. F9 claims "city population < 300 = zombie win" and a multiboard
  tracks Current Population — but **no script enforcement exists**
  (honor system).
- **Toys**: drivable Police Car 800 hp/400 ms, Car 600 hp/460 ms, tank,
  helicopter, a `-bus` item-courier with shared vision, barricades
  450 hp, Sentry Guns 110 hp/20 dmg by the Engineer, `-cam`
  2000/2500/3000, free radio ping.
- **Scars**: hidden author gold-grant cheat commands (one with a slur).

### Zombination v11 (Trinin, EpicWar 257009, v11 final 2015)

1 Zombie Lord (red hero, 600 hp/10 dmg/175 ms) vs up to 10 villagers +
a computer civilian pool; a town with enterable buildings + sewers;
96×64. Loading screen: "Zombies: Exterminate all! / Villagers: Run away
for 12 mins."

- **The evacuation window** (Last Train's train timeline is this,
  credited): a helicopter arrives at 720s and leaves after a 180s
  boarding window; humans win by escaping OR killing the Lord; zombies
  win by killing everyone first.
- **Infection on-hit, curable**: any zombie damage > 0.1 applies an
  infection buff (B00E dummy-cast Curse) + slow; 0.5 dmg per 0.33s
  (~1.5 dps); cures: Wet Bandage (Cloth + Water, only above ~75%
  health) or the hospital lab region (`-lab` pings). Last Train keeps
  the exact 1.5 dps and the two-cure shape.
- **Turning**: every villager-type death raises a Zombie (h00U,
  45 hp/15 dmg/100 ms) at the corpse **owned by the killer's owner**,
  with a 3.5s invulnerable birth rise (Last Train's corpse-rise window
  is this number); a dead player is moved to the zombie force ("slave
  to the Zombie Lord") and keeps playing.
- **Classes**: base Villager 210 hp; Engineer/Chemist/Soldier 300 hp
  heroes + a Tradesman NPC.
- **Scavenging**: searchable furniture (Bed/Drawers/Bookcase/TV/Sink/
  Chair as 10–30 hp props) + periodic item spawns; **~37 combine
  recipes** (Meat+Match = Roasted Meat +1 Str; Plank+Pipe = Club;
  Cloth+Pipe = Metal Armour; Pipe+Wires = Mobile Phone shared vision;
  Plank+Glass = spike stun trap; Cloth+Plank = pathing-blocking
  Barricade) — **deliberately part-undocumented** (the discoverability
  flaw Last Train fixes).
- **Fortification**: wooden doors 400 hp, metal doors 150 hp, barred
  windows 300 hp, barricades 100/200 hp, clamp traps, gates with
  open/close/repair/death triggers; drivable Cars at 522 ms. Enterable
  buildings + sewers give it a fortification depth Last Train's open
  estate deliberately trades away.
- **Anti-deathball economics** (adopted verbatim by Last Train,
  credited): +1 gold per kill (+4 for player-character kills) to the
  killer's owner; every death gives +1 lumber to the Lord (biomass); a
  villager kill is worth 75 XP shared with a **0.75^(n−1) falloff**
  among zombies within 2500 range; the Lord's XP pool gains +10 per 5s
  passively (mutation); Greater Zombie mutations 70 hp/130 ms.
- **Horde ergonomics**: `-roam` on/off horde AI (1 player runs 50+
  minions), `-punish <colour>` disciplines converted griefers, 3
  scouter tiers (300/350/400 ms flying eyes).
- **Scars**: per-damage-event dummy-caster churn (a leak factory);
  protection with a fake listfile; ratings 3.13 and 2.14/5 — onboarding
  walls (F9 text dumps, secret recipes, untold `-commands`).

## The decomposed secondaries

### NotD: Special Ops v1.12k (EpicWar 148016, protected)

235 custom units / 408 abilities / 74 items. The archetype-A summit.

- **Speed inversion is the whole game**: marines 175–500 hp move
  170–195 vs a horde at 250–360 (Horror 350 hp/335 ms, Stalker
  600 hp/360 ms, Devourer 2000 hp, Slasher 3500 hp/12 armor, Hellspawn
  10000 hp/290 dmg, Arachnithid 9870 hp/250 dmg). Marine range
  1300–2250 at 0.4s cooldown (Marksman 140+10d16 per 3.5s at 2250) —
  you outgun what you cannot outrun.
- **Ammo as item charges**: AP Ammunition 100-charge, U-238E 50,
  Clip 1, Ammo Box 5, Medkit 5, Stimpack 3, Shiva nuke 1–2; the
  end-stats screen shames "Total Ammo Wasted".
- **Weapon module assembly** (the field's deepest itemization):
  "Assemble Rifle Grenades" grants +5 RMGL charges; an RMGL module
  mounted onto a GAR **inherits its charge count**; laser module +3%
  crit; armor ladder Kevlar → Composite → Reactive → EKNRS → Assault.
- **Class kit**: Sprint +55% ms for 22s; Burst Fire 500 dmg cone;
  AN-M14 incendiary 940 burn + slow; flares 120s team vision
  (**darkness as a managed resource**); napalm 50s r240.
- **Nightmare campaign objective design**: squad-rescue beacons,
  hold-until-uplink with 4 reactivatable generators + CB-1 defense,
  Shiva airdrops, an evac that **aborts if overrun**, explosive-only
  kill immunities forcing demolitions relevance; AI followers
  `-follow`/`-hold`; 16-digit `-load` rank codes; cross-map XP import
  ("-notd2 before -load transfers 10% of NotD2 experience").
- **Ambient dread as first-class content**: Dreamer/Nightmare dummy
  units (Laughter, Scary Sounds, Blood, Creepy Halls) + a burrowing
  invisible Lurker — the tradition Last Train's seeded dread beats
  cite.

### Dawn of the Dead 5.2 (PreViO, EpicWar 2253, open source)

390 triggers, 10 humans vs 2 CPU undead; 7 classes ~200 hp, ms 190–220,
range-1300 rifles at 0.1s cooldown.

- **Gold IS bullets** (the signature Last Train adopts, credited):
  every attack costs −1 gold via trigger; at 0 gold the unit is
  force-ordered to holdposition; reload = 1 lumber, a 4.0s sleep, a
  shotgun-rack sound, gold set to 50 (one clip = 50 rounds). Turrets
  use mana-as-ammo (Sentry 400 hp/800 range/0.1s, −1 mana per shot,
  stops on empty).
- **Waves**: 10 hand-authored waves from 7 fixed spawn rects ringing
  the compound; 90s warned lulls; **wandering zombies patrol the map
  between waves** (no safe scavenging). Wave 10: 5 Suicidals per rect +
  a 20000 hp/400 dmg Monstrosity + batches of 10 Infected.
- **Corpse chain**: Living Dead (140 hp/26 dmg/160 ms) dies → 25s →
  Shambler rises (90 hp, **220 ms — faster than most classes**);
  Infected (300 hp/40 dmg) dies → 25s → Living Dead.
- **Support**: attackable Barricades 430–450 hp, land mines, satchels
  1000 dmg, radar, stimulants; Medic +5 hero XP per heal cast (the
  medic-economy pattern); save/load EXP codes (80 refs to
  udg_CompletedCode).
- **Scars**: hardcoded author-name cheat triggers
  (GetPlayerName() == "PreViO").

## The surveyed maps (survey evidence only — no loss-verdicts)

### SWAT: Aftermath (redscull.com readme + itch.io systems breakdown)

The genre's objective-design ceiling, per its own documentation: 500 hp
fixed heroes; a Nanites energy-shield (damage → MP before HP); 9–12
classes × armor × traits = **25920 documented combos**; 6 difficulty
tiers that add **mechanics, not stats**, scaling with player count.
Victory requires **5 objectives** (radiation fragments to 0; cure 32+
civilians with 40–90s antidotes and escort them to 8-seat APCs; fill 6
leaking reactors; a Hazmat item hunt; a multi-phase Nemesis) — camping
cannot win **by construction**. Zombies respawn from their own corpses
with less HP; a global aggro retargets a random player ~30s; at mob cap
a Tyrant miniboss spawns instead; radiation is map-wide step-function
pressure. Last Train's `-fix` vulnerable channel and power-gated doors
credit this design.

### The rest of the survey row

- **Undead Assault 2/3** — archetype A's other lineage; surveyed for
  genre shape only.
- **Eras Zombie Invasion** — archetype C: 92 published versions; plague
  markers erupt 5 minutes after placement (the telegraphed-outbreak
  signature); 5–6 hour games.
- **Parasite 2/3** (DarkShoGun) — archetype D: spaceship crew, one
  hidden infested, a station-AI player; the hidden-infested deduction
  signature.
- **Zombie Defense** (Eejin & Frotty) — archetype B, still updated
  Dec 2024 — evidence the genre is alive.

## Cross-archetype findings (the durable genre knowledge)

Measured or documented in ≥2 independent lineages:

- **Speed inversion** — the horde outruns you; you outrange it.
- **Ammo physical + a reload window** creates panic on a timer.
- **Anti-camping is unanimous** in the mature maps — objectives, global
  aggro, wandering patrols; pure holdout is a design dead end.
- **Corpses are unsafe** — reanimation timers make every kill a
  scheduling problem.
- **Darkness as economy** — flares/vision items are spendable resources.
- **Telegraphed dread** — 90s wave warnings, 5-minute plague timers:
  the horror is scheduled, and that's what makes it playable.

**Genre furniture** (≥3 lineages; adopt freely with genre credit): wave
warnings + lulls, class pickers, attackable barricades, medic-XP,
sprint/stims, flares, save codes, finite-ammo sentries, boss finales,
chat QoL.

**Signature moves** (credit the specific map): gold-as-bullets +
lumber-clips (Dawn of the Dead / PreViO); module assembly with charge
inheritance (NotD:SO); corpse-respawn-with-decaying-HP + 30s global
aggro (SWAT: Aftermath); plague-marker outbreaks (Eras); cross-map XP
(NotD); hidden-infested deduction (Parasite); explosive-only immunities
(NotD:SO).

**Failure modes observed**: camping dominance; spectator purgatory
(mitigations seen: AI followers, revives, medic economies — or ZS7/
Zombination's defection, the strongest answer); dead lull time (fix:
wandering spawns + item hunts); hand-authored waves that don't scale
with player count (SWAT's per-count scaling is the mature answer);
rank-gated content hostile to new players; author backdoors and
protection scars.

## The matrix

Columns marked *(surveyed)* are survey-evidence; they get no
loss-verdicts.

| Dimension | Zombie-Simulator 7 | Zombination v11 | Dawn of the Dead 5.2 | NotD:SO v1.12k | SWAT: Aftermath *(surveyed)* | Last Train |
| --- | --- | --- | --- | --- | --- | --- |
| Death handling | **defection pioneered at city scale** — convert in place, 5000 gold + Parasites, keep playing | defection ("slave to the Lord") + killer-owned corpse-rises | none (spectate) | AI followers + revives mitigate | revives (surveyed) | defection adopted with credit: Revenant + 3-shambler pack rises where you fell, alliances flipped BOTH directions (gotcha 24), horde vision shared; wipe verdict rewards early defectors, sim-tested |
| Infection model | on-kill spawn (not curable state) | **on-hit curable DoT — the genre's best idea** (~1.5 dps, two cures) — but via dummy-caster churn | none (corpse chain instead) | none (damage is damage) | curable civilians as an OBJECTIVE (surveyed) | Zombination's exact shape (1.5 dps, bandage-above-threshold + region cure, kills into defection) as per-unit STATE on the virtual clock — no dummies, headlessly assertable |
| Ammo economy | none (salary + shops) | none | **gold-as-bullets invented here**: −1 gold/attack, 4.0s reload, 50-round clips | **the field's deepest**: charge-item ammo ladder, module assembly w/ charge inheritance, "Total Ammo Wasted" shaming | none (surveyed) | DotD's system adopted with credit on the DAMAGING event (no order-forcing): 1 round/shot, dry = zeroed shot with Parang fallback, `-reload` = 1 clip + 4s lockout; clip drops every 5th kill; NotD-style sentry belts |
| Corpse mechanics | corpse spawns Infected on kill | 3.5s invulnerable birth rise | **the chain**: Infected → Living Dead → faster Shambler, 25s timers | horde respawn pressure | corpse-respawn w/ decaying HP (surveyed) | 3.5s visible rise window + Molotov corpse-burn counterplay (scripted fire never draws ammo); esc-scaled |
| Anti-camping / objectives | city events + economy pull | helicopter deadline | wandering zombies between waves | **evac that ABORTS if overrun; hold-until-uplink; beacons** | **camping cannot win by construction — 5 mandatory objectives** (surveyed; the design ceiling) | 3 substations gate the train doors; `-fix` = 10s vulnerable channel (SWAT credit); seeded district patrols from T+90s; two exits (train/Broodmother) both require traversal |
| Escalation / anti-snowball | staggered wall-clock loops + ~20 one-shot events that fire regardless of game state | **0.75^(n−1) crowd falloff + passive drip — the genre's best anti-deathball math** | fixed 10-wave ramp | authored campaign ramp | difficulty adds mechanics, scales per player count (surveyed) | Zombination's falloff adopted verbatim (integer math, cap 8) + drip keyed to STATE (dead-resident ratio + defections), never wall-clock alone — fixing ZS7's fire-into-the-void timers |
| Scavenging / crafting | loot crates → shops | **~37 recipes, searchable furniture — the template** (part-secret by design) | item shops + caches | assembly modules | item hunts (surveyed) | seeded one-shot `-search` furniture + 10 recipes, ALL listed by `-recipes` + tooltips + quest log — the discoverability fix |
| Content mass | **30+ scripted zombie types w/ lore cards; drivable vehicles incl. helicopter** | fortification depth: doors/windows/gates/traps, enterable buildings, sewers | 7 classes, 10 waves | **235 units / 408 abilities / 74 items — unmatched** | 25920 documented combos (surveyed) | 4 classes, ~8 zombie kinds, 10 recipes, 20+ searchable furniture types — phase 1 is deliberately lean; raw count conceded to every decomposed column |
| Victory / endings | one enforced ending (Biomind dies); the flagship population condition is **unenforced** | escape window OR kill the Lord OR horde wipe — all enforced | survive the list | campaign objectives | 5-objective completion (surveyed) | three endings (board/Broodmother/wipe-with-defector-splits), ALL script-enforced and sim-tested |
| Determinism / testability | none | none | none | none (16-digit save codes are state, not seeds) | none visible (surveyed) | **full: one Park-Miller/Schrage stream, seed locks at first commitment, machine-readable RUNLOG, 64 headless tests at 98.2% line coverage; golden run lands with phase 2** |
| Onboarding / legibility | F9 lore + multiboard | **F9 text dumps, secret recipes, untold commands — rated 3.13 and 2.14/5 for it** | readable enough (open source) | rank-gated depth | documented externally (surveyed) | everything discoverable in-game: `-help`/`-recipes`/`-status`, recipe hints in material tooltips, quest log; the onboarding wall is the flaw Last Train most deliberately fixes |
| Clean of scars | author cheat backdoors (one with a slur) | protection + fake listfile; dummy-caster leak factory | author-name cheat triggers | protected | n/a (surveyed) | **no backdoors: debug mode is `-test`, available to all; open toolkit-built source** |
| Proven in game | **yes — 1421 downloads, real hosted history** | **yes — 378 downloads** | **yes — a genre classic** | **yes — the archetype's most respected** | **yes — actively maintained** (surveyed) | no. Sim-proven only; never loaded in the real client. Every other column beats us here today |

## Verdicts

Verdicts are issued only against the decomposed columns; the surveyed
maps (SWAT: Aftermath, UA2, Eras, Parasite) are credited where their
documented designs shaped ours, and get no loss-claims.

**vs Zombie-Simulator 7** — Its defection idea is the genre's boldest
and it remains the only map with a played-out zombie-overlord economy
(30+ scripted types, Hives, an evolution tree) — content mass and
asymmetric ambition Last Train does not attempt, and its city-toys row
(drivable vehicles, the `-bus` courier) is genuinely unmatched. What
Last Train takes is defection itself, made airtight: ZS7 converts the
player but leaves its flagship win condition (population < 300)
unenforced in script — an honor-system ending on a 40-minute map. Last
Train's three endings all fire in script and are sim-tested, its
escalation is keyed to game state instead of ZS7's wall-clock event
loops that fire into the void, and its debug surface is `-test` for
everyone rather than hidden author cheats.

**vs Zombination v11** — The closest ancestor and the biggest single
creditor: the evacuation window, the curable-infection shape, the 3.5s
corpse-rise, the 0.75^(n−1) falloff and the furniture-scavenging model
are all its ideas, adopted with credit. It still wins fortification
depth (enterable buildings, door/window/gate triggers, sewers — an
indoor claustrophobia our open estate trades away) and it carried a
live horde-management UX (`-roam`, `-punish`, scouters) that phase 1's
defected play hasn't matched yet (phase 2's horde-side depth item).
What Last Train fixes is exactly what its 3.13/5 rating paid for:
recipes are all listed, commands all surfaced, infection is per-unit
state on the virtual clock instead of a dummy-caster leak factory, and
the source is open instead of fake-listfile protected.

**vs Dawn of the Dead** — It invented the ammo economy Last Train runs
on — gold-as-bullets with a panic-window reload is the best moment-to-
moment tension device in the genre, and its corpse chain (dead things
return FASTER) is horror pacing by object data. Both are adopted with
credit; the draw moved from per-attack gold triggers to the DAMAGING
event (no force-ordered holdposition), and the corpse chain became the
rise-window + Molotov counterplay. Its 10 authored waves don't scale
with player count and its lulls got wandering zombies as a patch; Last
Train's patrols are the same answer made seeded and state-scaled. And
its author-name cheat triggers are the scar Last Train's open `-test`
convention exists to avoid.

**vs NotD: Special Ops** — The module-assembly itemization (charge
inheritance, crit modules, an armor ladder) is **the deepest ammo/gear
system in the genre and Last Train does not approach it** — 10 combine
recipes vs 74 items with assembly chains is a plain concession, as is
its 235-unit content mass and campaign-objective variety (abortable
evacs, reactivatable generators, cross-map XP). What Last Train takes
is smaller and credited: ammo as physical charges, darkness as a spent
resource (flares, the Mobile Phone's 30s), and the seeded dread-beat
tradition (its Dreamer/Nightmare ambience dummies). Where Last Train
clearly differs rather than wins: NotD's depth is rank-gated behind
16-digit codes; Last Train front-loads everything discoverable.

## Adopted-with-credit vs fixed-flaws

**Adopted, with credit** (mirrored in the map README, `-credits`, and
the quest log):

- Death = defection, both-direction alliance flip — Zombie-Simulator 7
  (SpirulinaN) + Zombination (Trinin).
- Curable ~1.5 dps infection, bandage + region cures — Zombination.
- 3.5s corpse-rise window — Zombination.
- Evacuation window (helicopter → the last train) — Zombination.
- 0.75^(n−1) kill-XP crowd falloff + passive drip — Zombination,
  verbatim.
- Furniture scavenging + two-material combine recipes — Zombination.
- Gold-as-bullets, lumber-as-clips, reload lockout — Dawn of the Dead
  (PreViO).
- Ammo-as-charges texture + darkness-as-resource + dread beats —
  NotD: Special Ops tradition.
- Vulnerable-channel objectives gating the exit (anti-camping by
  construction) — SWAT: Aftermath (surveyed; design credit).
- Wave warnings, class picker, barricades, sprint — genre furniture
  (≥3 lineages).

**Fixed while adopting** (the flaw, and what shipped instead):

- ZS7's unenforced population win condition → all three endings
  script-enforced and covered by `objectives-train`/`defection` tests.
- ZS7's wall-clock event loops firing regardless of game state →
  escalation drip keyed to dead-resident ratio + defection count.
- Zombination's per-damage dummy-caster churn (leak factory) →
  infection as per-unit state on the virtual clock.
- Zombination's secret recipes / untold commands (the 3.13-and-2.14/5
  onboarding wall) → `-recipes` lists all ten, tooltips hint, quest log
  repeats.
- DotD's force-ordered holdposition on dry → DAMAGING-event zeroing
  with the Parang melee fallback (the unit stays responsive).
- DotD/ZS7 author-name cheat backdoors → `-test` debug mode, identical
  for every player, documented in `-help`.
- Protection scars (Zombination's fake listfile, NotD's protection) →
  open source in this repo, built and validated headlessly.
- Genre-wide spectator purgatory → defection IS the mitigation, and the
  wipe verdict (early defectors win as the horde) makes defected play
  a real game rather than a consolation.

## Appendix: sim-testability of the genre's mechanics

What made this genre a good fit for the toolkit's headless doctrine —
and what stays honest about the sim's limits (README "Honesty notes"):

**Headlessly assertable today** (all covered in
`maps/last-train/tests/`, 64 tests, 98.2% line coverage): ammo draw on
the DAMAGING event (dry shots, Parang fallback, reload lockout, clip
drops, sentry belts); infection as state (DoT math on the virtual
clock, both cures, death-into-defection); corpse-rise windows + Molotov
counterplay; both-direction alliance flips and all three ending
verdicts; the 0.75^(n−1) falloff and state-keyed drip (integer math
asserts exactly); seeded scavenging/crafting (all ten recipes); the
train timeline, `-fix` channel + interrupt, and power gating; class
kits; dread-beat cadence with seeded replay.

**Game-only, by honest limit**: patrol walking and zombie aggro (no
pathing/combat AI in the sim), real boarding runs (the region event is
exercised; the sprint to the platform is not), crafted-item usability
on the `pman` base, and `BlzSetUnitMaxHP` hp scaling (a recorded stub,
asserted via `EscHpOf` + the call record).

**Deferred deliberately**: the golden-run pin (gotcha 30) lands with
phase 2's balance pass, so the full-playthrough transcript is pinned
once, not re-pinned after tuning. Phase 1 pins per-mechanic beats and
byte-identical 200s replay prefixes instead.

No assets, code or text from any of these maps are used or
redistributed; community models shipped in Last Train are separately
credited per-author in its `imports-credits.json` ledger (a different
channel — see the map README's Art section). The inspiration recorded
here is mechanical, from decomposition-driven study (CLAUDE.md
"Decomposition-driven design").
