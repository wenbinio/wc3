# Last Train from Yio Chu Kang — phase 2B design walkthrough (the fun gate)

Written per docs/PIPELINE.md §10: the implementation must match this
document, not the other way round. **Phase 2B's gate is the TOWER LOOP** —
playtest 2's verdict, verbatim: *"Take heavier inspiration from Zombie
Custom Defence. There's a very rich wealth of triggers and custom effects
out there. Things are placed kind of nonsensically. Think waygates, first
you have to survive & fight your way out of a HDB, on the sixth floor,
all lifts are down. Intense survival horror vibe. You put too much work
into the text."* — plus the mid-phase directives: *"There's not enough to
do at all. Maybe let players build & survive"* and *"We'll focus entirely
on the HDB interior for now and making that loop fun."* An activity-audit
pass then located the "not enough to do" failures precisely (inert
watchfire, invisible/saturating noise, single-exit floors) and its
mandatory fixes (A1–A5 + the noise repair) are IN this walkthrough.

Doctrine unchanged (CLAUDE.md gotcha 33): **chat is meta only.** Every
combat-tempo verb is a click, an ability, an item, or proximity.

**The playable slice this phase is Block 6A's interior.** Six pockets:
6F corridor → 5F flat warren → 4F dark corridor → 3F blocked landing →
2F nest floor → 1F void deck → the rain. The estate loop (surges, noise,
substations, train, defection) stays compiled and live BEYOND the exit —
anchored to the exit (EstateClock) — but got no new design work; it is
"after the slice" content this phase.

## 1. The tower loop, minute by minute (competent 2-player descent)

### 6F — wake, choose, arm (T+0 → ~T+50)

- **T+0.** You wake in a sixth-floor corridor. The lift doors at the west
  end SPARK every few seconds (they will spark all night; the lifts are
  dead). The countdown window already reads *"Last train: 12:00"* — the
  clock started without you. One intro line; then the world talks.
- **Live options in the first 30 seconds** (≥2 at all times — the density
  rule): step onto a **class circle** (four, south wall — pick your
  neighbour identity as you flee your flat); grab the dead neighbour's
  **Parang** (guaranteed floor item — the escape never needs a bullet);
  **rummage** the locker (3s, quiet) or the corridor bench; **smash**
  either (instant, +2 stairwell loudness — and the stairwell is COUNTING
  now: its state is on the board, it decays 1/20s, and every 3 points is
  an extra climber per wave); put one beat at the **stair door** to
  **peek** the 5F (one free floating-text read: walkers + lights); or
  skip everything and take the **rubbish chute** (instant drop to the 2F
  bin alcove — 60 damage, +2 loudness, every floor's loot skipped, and
  anyone you rescue won't follow).
- **~T+30.** One shambler that used to be your neighbour stands mid-
  corridor. Parang it (silent), shoot it (a round + creeping loudness),
  or walk around it. From T+40 the stairwell breathes: **climbers** every
  30s at the deepest occupied floor — 1 base, +1 per 3 loudness (capped),
  +1 if that floor is dark, +1 with 3+ players alive.
- **The door.** Walking onto the stair door rect takes you down (door
  slam, camera pan, floating floor-name). Behind you the floor does NOT
  stay clear: a **riser** stands up on the floor you left and follows
  through the door — unless you spent a Plank to **brace** (a barricade
  built at the door absorbs the whole event; the door takes the thuds).

### 5F — the flat warren (~T+50 → T+150)

- Five props (bench/locker/desk/table/dumpster) and two walkers. The
  rummage-vs-smash tempo choice runs every prop, with the loudness ledger
  now visible on the board. Two zombies patrol between you and the loot.
- **Uncle Heng is trapped in the far flat.** Stand with him ~2s and he
  joins whoever freed him (+25 XP; another +25 if he steps into the rain
  alive). He follows through stair doors — but NOT down the chute: the
  shortcut costs the escort.
- **Auto-combine is running the whole time** — Cloth+Water snapped into a
  Wet Bandage the moment you carried both (chime + floating name, zero
  text). But raw halves are also **build fuel** now: the Plank you're
  holding is a barricade or half a Parang, the Pipe is spike wire, the
  Kerosene is a Watchfire or half a Molotov, the Battery is a Sentry Kit
  half or a **noisemaker radio**. One economy, two mouths — every pickup
  is a fort-vs-pack decision.
- The 5F chute mouth is the second bail-out point.

### 4F — the dark corridor (~T+150 → T+240)

- **The lights are OUT (A1 — darkness with teeth).** Unlit: rummage takes
  5s instead of 3, and every climber/riser event on this floor brings one
  extra body. The floor flickers (spark effects); two walkers you can
  barely afford to shoot (loudness) stand between you and a locker + desk.
- **Three remedies, all real trades:** flip the **DB box** (5s of
  presence at the breaker cabinet — the substation pattern — lights the
  floor for good, but a running breaker HUMS: +1 loudness/minute); drop a
  **Watchfire** (1 Kerosene — silent, floor counts as lit while it burns,
  but that Kerosene was half a Molotov and the nest floor is next); or
  work blind and pay in seconds and bodies.
- The authored **Molotov** lies here in the dark — the nest floor's
  counterplay, if you didn't burn its half on light.

### 3F — the blocked landing (~T+240 → T+320)

- The stair door is barricaded with furniture — and the floor **smells of
  gas (A4)**. The blockers must go, and there are three honest ways:
  - **Chop them with the Parang on an empty clip** — slow, silent, and
    the mandatory beat PAYS: each blocker drops a **Plank** (brace fuel),
    and blocker smashes are **exempt** from loudness (the forced beat is
    never punished).
  - **Fire one live round in the pocket** — the landing goes up in a
    sheet of flame: blockers blown, every walker cooked, every un-drawn
    prop draw destroyed, +4 loudness, and you're singed for 60. Fast,
    total, scorched-earth. (Any live shot indoors is a spark — empty your
    gun before the landing, or use it as a weapon.)
  - **Toss the Molotov from the arrival edge** — same blast, saves your
    skin, spends the nest counterplay.
- A withered uncle guards the barricade either way. The 3F DB box sits on
  the south wall for those who want to see what they're chopping.

### 2F — the nest floor (~T+320 → T+420)

- A **rat-king nest** breeds in the dark (this floor is dark too), with a
  sprinter napping by the chute-fed bin alcove and two search pulls
  (dumpster, bench) competing with it for your attention. Burn the nest
  (Molotov: it dies AND the estate's whole night gets slower — NestsDown
  carries out of the tower) or sneak the south edge past it.
- The bin alcove is where every chute lands: chuters arrive HERE, bruised
  and loud, next to the nest. The stairs and the chute converge — the
  floor is the funnel.
- **If someone goes down** (anywhere in the tower): no spectating, no
  traitor. Their corpse gets the standard 3.5s rise-marker (burnable) and
  rises where they fell; ~18s later they stagger back in at their floor's
  landing, one clip poorer, gun half-seated. If the LAST living survivor
  drops, the night ends there (solo death = a plain defeat). Death =
  defection remains the ESTATE's rule, beyond the door.

### 1F — the void deck, and the rain (~T+420 → T+500)

- The densest fight: five walkers between you and the exit, pillars and a
  mailbox wall to fight around, a bench and the storeroom locker for the
  greedy. This is where the night's banked builds spend: wire the
  chokepoint, brace the door behind, watchfire the corner, radio-decoy
  the pack into a corner and WALK.
- **Walking onto the exit door IS the victory beat**: teleport into the
  void deck, the QuestCompleted sting, a small shake, the ONE relief
  line — *"OUT. The rain hits you like applause."* — and the estate
  opens: wanderers from EstateClock+90, first siren at +100, the whole
  phase-2A loop with its own schedule intact, relative to YOUR exit.
  The train clock, of course, never waited.

## 2. Interaction ledger (verb × input × uses/min × pressure)

Zero chat rows at combat tempo. Per the activity audit, pure-feedback
rows (auto-combine firing, floating text) are NOT counted as verbs.

| Verb | Input | Uses/min (peak) | Under pressure? |
| --- | --- | --- | --- |
| Move / flee | right-click | 10–30 | yes |
| Attack (gun/Parang) | right-click / A-click | 10–20 | yes |
| Reload | ability R | 1–2 | yes — and indoors it counts loudness |
| Sprint | ability E | 1–3 | yes |
| Rummage (which prop) | proximity ~3s (5s dark) | 2–6 | the quiet verb |
| Smash a prop | attack it | 2–6 | the loud verb (ledger visible) |
| Take the stair door | walk onto rect | ~1/floor | yes (risers answer) |
| Take the chute | walk onto mouth | 0–1 | yes — the bail-out |
| Peek the next floor | 1s at the door edge | ~1/floor | no |
| Flip a DB box | 5s presence | 0–1/floor | yes (dark around you) |
| Build Barricade / brace | ability Z (1 Plank) | 1–2 | yes |
| Lay Spike Wire | ability X (1 Pipe) | 0–2 | yes |
| Light Watchfire | ability V (1 Kerosene) | 0–1 | yes |
| Set Field Sentry | ability B (Sentry Kit) | 0–1 | yes |
| Place Noisemaker | ability N (1 Battery) | 0–1 | yes — the panic button |
| Repair a work | proximity | continuous | yes |
| Rescue the neighbour | 2s presence | once | yes |
| Burn nest / corpses | Molotov item | 0–2 | yes |
| Pick up loot | click item | 2–8 | yes |
| Class pick | walk onto circle | once | no (first 40s) |
| — meta only — | | | |
| `-help` `-status` `-recipes` `-credits` `-seed` | chat | rare | no |
| `-test` debug family (incl. `-deck`) | chat | dev only | no |

## 3. Decision density (target: ≥2 live options per 20–30s beat)

- **6F (0–50s)**: class choice ×4; Parang-vs-locker order; rummage-vs-
  smash ×2; peek-or-push; chute-or-stairs; brace-or-save the first Plank
  → **~8 decisions/50s.**
- **5F (per 30s)**: which prop next; loud or quiet on each; fight or
  walk the two zombies; detour for Uncle Heng now or on the way back;
  spend the Plank on brace vs carry for Parang; chute bail-out
  → **3–5 per 30s.**
- **4F (per 30s)**: breaker vs watchfire vs blind; who stands the 5s
  flip while walkers close; shoot (loud spark budget) vs Parang; take
  the Molotov or leave the Kerosene fuel question open
  → **3–4 per 30s.**
- **3F**: THE set-piece choice (chop / shoot / Molotov) + empty-the-gun
  timing + where to stand for the blast + a withered on you meanwhile
  → **the whole floor is one layered decision under pressure.**
- **2F**: nest burn-vs-sneak; dark remedies again; two loot pulls vs the
  sprinter's patrol; hold the alcove for chuting teammates or push
  → **3–5 per 30s.**
- **1F**: spend-the-bank placement (wire/brace/fire/radio), fight-vs-
  decoy-vs-run, greed pulls (locker) vs the exit
  → **4–6 per 30s, then the beat of release.**
- The climber cadence (30s) + riser events keep a THREAT decision inside
  every window; no beat over ~30s is single-option.

## 4. The player-owned growing numbers (canon I2)

1. **Hero level + XP** — kills, rescue (+25/+50), escape (+40), nests,
   objectives; signature at level 3.
2. **The pack→tool pipeline AND the fort** — the same materials, two
   mouths: crafted tools carried out vs works standing (Fort row on the
   board, 25 score each at the verdict).
3. **The clip bank** (lumber) — and the respawn penalty spends it.
4. **Floors lit** — each DB box flipped is territory that STAYS won
   (at a hum cost).
5. **Nests burned** — 2F's nest trims the whole estate night after.
6. **Uncle Heng** — a live, walking bonus you can lose to one chute.
7. (Threat mirror, visible: stairwell loudness, the train clock.)

## 5. The threat schedule (no safe gap > 30s indoors)

```
T+0     lift sparks running; intro line; countdown window live
T+0-40  seeded floor zombies (1 on 6F) + the loudness ledger arms
T+40    first CLIMBER wave (then every 30s at the deepest floor;
        1 + noise//3 (cap +2) + dark +1 + headcount +1)
each door transit   RISER event behind you (cap 2/floor; brace absorbs)
each chute use      +2 loudness THUMP (echoes into bigger waves)
3F      the gas set-piece + the withered guard
2F      the nest drip (it is a live nest: the estate pays later if spared)
1F      the five-walker finale
exit    the estate heartbeat starts at EstateClock 0: wanderers +90,
        siren +100, surge +120 ... (the 2A schedule, exit-anchored)
```

The longest quiet stretch indoors is the climber period itself (30s),
and only if you are silent, lit, and not descending. The train clock
runs through everything — 12:00 of it, spent or wasted.

## 6. What was cut, added, or ruled (the debit side)

- **The defection dependence is CUT from the slice** (directive): tower
  death = setback respawn (18s, −1 clip, half gun; corpse rises,
  burnable; last-one-down = wipe; solo = plain defeat). Estate death =
  defection, unchanged and still fully tested — but it received no new
  design work this phase.
- **Text diet (playtest 2)**: all per-prop/per-craft/per-buy/per-level/
  per-rise chat lines DELETED (~70% volume cut; the effects-text suite
  pins both directions). Kept: siren/PA/train spine, verdicts, defection
  announces, one-time teaches, meta responses.
- **Hold-to-craft / inventory management rows** are delisted from the
  density accounting (advisor ruling: feedback and friction, not
  choices).
- **Flare / Mobile Phone** are estate tools; they are not part of the
  indoor accounting (usable, just not load-bearing there).
- **Trade quirk (documented, accepted)**: a raw half handed to a teammate
  auto-combines on THEIR pickup if they hold the partner half — handing
  someone a Plank can cost them their build fuel. README notes it.
- **Advisor items deferred** (capacity, honest list): A6 locked
  doors+keys, A7 the crying child, A9 joss sticks, A10 balcony shimmy,
  A11 mahjong tiles, A12 electrified puddle. The TOWER table is
  field-per-feature so each lands as one field + one handler; A7/A9 are
  the first candidates for the next pass.
- **Estate-wide layout coherence and estate juice beyond the spine are
  PARKED** (directive): done only where cheap (hawker stall rows, the
  furniture-anchor assert in the generator, the coherence keep-outs).

## 7. Sim-testability note (gotcha 33's sim clause)

Every verb lands on a sim surface: doors/chutes/circles/exit =
region-enter events (`sim.moveUnit`); rummage/breakers/repair/rescue/
peek = presence scans on the virtual clock; builds/decoy = `sim.cast`
point casts; gas = the DAMAGING round-draw path or `sim.useItem`;
climbers/risers/loudness = deterministic counters asserted via RUNLOG;
the whole slice is pinned by `tests/tower-escape.test.js` (14 tests),
`tests/tower-activity.test.js` (15), `tests/build.test.js` (11) and
`tests/effects-text.test.js` (11). Sim honesty: zombie AGGRO/pathing
(walkers actually pressing the chokepoints, the decoy's in-game pull
feel, wall-blocking) is game-only — the orders and spawns are what the
sim pins; the in-game feel is what the next playtest is for.
