# Warhammer: Tides of Chaos v1.89K — decomposition + AI specification (2026-08-09)

Question answered: **what would an AI have to do to play this map, and can
we iterate on it?** Map by **Krazlo** (`Krazlo#2845`,
discord.gg/4mhE6fmKzQ) — any derivative must credit them; per gotcha 9 /
Legal the artifact and its 1,575 imports are NOT committed here.
Companion: wc3-ai-prior-art.md. All facts [M] measured from the artifact.

## The earlier "zero micro" claim is REFUTED

That description was a paraphrase of the map's own lobby blurb. Every
clause is literally true and it describes the **metronome, not the game**.
The artifact shows the opposite:

- **No builder, no worker, no construction** — zero unit types carry a
  build list. Removing base-building removes the thing that would
  *compete with fighting* for your attention.
- **Spawns are food-gated**: a base spawns only if `food_used < 80` and
  `< cap`. **If you don't spend your army, your next spawn is skipped
  entirely.** The economy forces continuous commitment.
- **The one-button army order deliberately excludes heroes** —
  `IssuePointOrder` is applied to every non-hero unit, leaving the four
  heroes for you to drive by hand.
- **The map ships a unit-selection-priority tuner** (NumPad ± sets
  `UNIT_RF_PRIORITY` per unit, with an on-screen hint). Nobody builds
  that for a game you watch.
- 1,932 custom abilities, **359 spell IDs with bespoke JASS handlers**,
  152 preplaced heroes, 65 scripted event-hero arrivals.

It is a **7v7 territorial army-war: an RTS with base-building and worker
economy amputated so that all attention goes into positioning, hero micro
and spend-timing.**

## The loop

**Spawn clock**: `SpawnTime` starts at 120s. A counter runs 6→0; at 0 the
global army level +1 (cap 6) **and** `SpawnTime += 10` ("War
Exhaustion"). Army level 1 at 12 min, 6 at **87 min**, cycles stretching
forever after — an anti-stalemate brake that makes each late spawn more
precious.

**Composition** is per-base and hand-authored: **127 `S_<City>`
functions**, each emitting a fixed core, a half-cycle extra (every 3rd
spawn), then one block per purchased research. Spawned units
**attack-move** to that base's rally.

**Income**: per cycle, `+100 + 15×ArmyLevel` gold AND lumber if you hold
a base; `+50 + 10×ArmyLevel` if landless.

**Upgrades are CHOSEN**: 395 custom upgrades, 357 priced 100–750g (median
300), **5-second research**, bought at an individual base, permanently
widening that base's spawn block. Bases carry 0–8 researches each.
**Salvage tier**: a destroyed base refunds **50%** of its research gold
if maxHP ≤5000, **25%** if ≤7500, **0%** at 10000/12500 — so investment
in your capital is unrecoverable while a border town is half-recoverable.
Lumber is near-pure mercenary currency (5 upgrades + the merc roster +
7 "hire a company" contracts, max 3 concurrent).

**Topology**: 352×416, **no lanes** — a continuous Old World map, 124
player bases + 20 neutral capturable + 3 hostile. Neighbouring enemy
bases sit **1–3 screens apart** at the locked 1250 zoom, so counter-attack
loops are tens of seconds. Fog applies (all bases revealed once, for 2.5s,
at t=5s — an opening briefing).

**Win conditions**: team elimination (polled 15s, counts only
human-played slots), `-ff` forfeit, and **two ritual instant-wins** —
Archaon at hero **level 12** channels **300 seconds** at Middenheim;
Teclis at level 12 with The Inevitable City destroyed channels 300s
inside it. Both ping the minimap for everyone and are cancelled by any
interrupt. The map's designed climax and its sharpest strategic fork.

## Heroes

Four preplaced per player (Chaos instead *picks* from 13 by god), 4–5
abilities each on authored Q/W/E/R/T/D hotkeys, inventories, level cap 15.

**They do not revive — verified** (`ReviveHero` count = 0; no altar, no
timer). Death is permanent and *narratively cascading*: 65 event heroes
arrive on conditions like "Karl Franz dies → Valten", seeded at
`0.35 × (player average XP + own XP)` — **compensation, not
resurrection**. A few narrow scripted exceptions exist and should be
modelled individually.

**Why preservation is genuinely hard**: hero XP's dominant source is
**destroying enemy bases** — granted only to heroes within **1200 range
as the base dies**, and split if more than four heroes are present
(the author's comment: "to dissuade both powerleveling and
deathballing"). **The only way to level is to stand in the most dangerous
place on the map** — and level 12 on one specific hero gates both instant
wins. Heroes also eat 3 food each and are excluded from the army macro,
so a panic macro order leaves them standing in the fire.

**Real skillshots exist**: Doomrocket = 2.5s channel + 1.9s delayed
550-damage blast, i.e. **~4.4s of lead — and it plants a visible marker
for the defender**. Warpbomb attaches to a unit and detonates after 5s in
three rings, so the victim must physically run out of their own allies.
Rebounding Hammer is a true projectile stepping 33 units/tick. 60
scripted ground-targeted spells; 55 projectile-motion sites.

**Compounding target selection**: Headtaker executes an enemy hero at
≤25% HP and **permanently raises its own execute threshold by 3%**,
rewriting its tooltip. Correct low-HP targeting pays for the rest of the
match.

**Base Repair** (on every base): instant **40% of max HP**, 120s
cooldown, wasted if fired above ~60%. Timing it against a siege's damage
curve is the sharpest tens-of-seconds decision on defence.

## Decision table (tempo × difficulty)

| Decision | Tempo | Difficulty |
|---|---|---|
| Keep food under the spawn gate | 120–170s | cheap heuristic |
| **Which research, at which base** | ~2–3 ticks | **hard** — 357 options, ~1 buy per 2 spawns, value depends on enemy composition AND on whether that base survives (salvage 50/25/0%) |
| Rally placement (per base + global) | minutes | medium — staging vs feeding; units attack-move and will suicide alone into a fort |
| **Push vs defend vs ignore your own base** | minutes | **hard** — base loss is permanent, cuts food cap and income tier, and feeds enemy hero XP; but Repair + towers can hold long enough to race |
| **Base Repair timing** | tens of s | **hard** — needs incoming-DPS prediction |
| **Counter-attack into a vacated flank** | tens of s | **hard** — needs enemy-commitment inference from partial vision, against a shared spawn clock |
| **Counter-defend an ally's collapsing front** | tens of s | **hard** — cross-team modelling, `-sc` shared control |
| **Hero preservation** | seconds | **hard** — permanent loss vs an XP rule that pulls heroes into danger |
| **Hero aim** | sub-second | **hard** — up to 4.4s lead, telegraphed; plus the defensive side, dodging a marked nuke |
| Focus fire | sub-second | hard — ordinary micro plus compounding cases |
| Ritual commit / denial | once, 5 min | **hard, decisive** — binary game outcome |
| Event-hero + neutral-base routing | minutes | medium-hard — 65 bespoke conditions |

## Sim-testability — the hard blocker

**`lib/sim` cannot run this map at all.** `scriptLanguage: 0` (JASS); the
sim hard-errors on non-Lua maps. Nothing is headlessly assertable without
first porting the layer of interest to Lua. Even then, the spawn system
dispatches through `ExecuteFunc(LoadStr(...))` across 127 functions, and
`TimerDialog*`, `CreateUnitPool`, `BlzCreateFrame` and 2,576
`BlzCreateUnitWithSkin` calls need real semantics or careful stubs.

**Assertable after a Lua port of the loop layer**: spawn cadence and the
6-cycle boundary; army-level progression; war-exhaustion drift; income
arithmetic; **food gating** (that a full player's spawn is skipped);
research→composition mapping; base-death consequences (elimination
counters, salvage tiers, the 1200-range XP grant and its >4-hero split);
hero XP and the level-12 ritual gates; the 300s ritual timers and their
ENDCAST aversion.

**Not assertable, ever, in the current sim**: whether a push wins;
everything sub-second (aim, dodging, focus fire, retreat thresholds);
whether a Repair saved a base; anything involving fog, collision or
travel time. **Of the six decisions the map's player named as hard, the
sim can partially reach exactly one (research buying).**

## Buildability — excellent

**Unprotected**: real listfile, 1,609/1,609 members named, 0 anonymous,
wtg (70KB) + wct (2.4MB) intact. Bare MPQ, w3i v33 / w3e v12 / objects
v3, gameVersion 2.0.4, 14,028 editor saves. JASS `war3map.j` is 2.98MB /
65,871 lines / 3,069 functions (vJASS+JassHelper).
**Zero runtime extensions** — no `Dz*`, no `JN*`; pure vanilla Reforged
natives. Fully inside our toolchain.

**Round-trip**: `map-to-json` → 22 files, **0 errors, no viewer
fallbacks**; `json-to-map` → **1,591 of 1,609 members byte-identical**
(the 18 differing are documented translator normalisations), and a second
pass is a clean fixed point (gotcha 6). Repack + `validate-map` → **exit
0, 0 FAILs**; pjass passes on the full 2.98MB script.

**A ready-made in-game harness**: debug mode is free in single player (or
by unanimous `-test` vote) — `-force` (force a spawn cycle), `-upg N`
(set army level), `-lvl`, `-g`, `-own`, `-spawns`, `-dmg`, `-exp`. That
is a real experiment driver for headful runs.

## Existing AI: none, and computer slots are switched OFF

No `.ai` files, zero `StartMeleeAI`/`CommandAI`/`SetPlayerController`.
`Trig_Spawns_Init` only builds a spawn table for slots that are PLAYING
and **not** `MAP_CONTROL_COMPUTER` — such a faction never spawns, is
excluded from the team base counter, and scores nothing.

Leaver handling is rich and directly reusable by a bot:
`ShareEverythingWithTeam`, an **observer can claim the slot via
`-join x`**, allies can seize a leaver's gold with `-tg`, and `-sc <n>`
grants full control of a living ally's units. **A bot filling an empty
slot is genuinely unserved, and the plumbing it would ride already
exists.**
