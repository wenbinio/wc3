# WarsmashModEngine as a headless outcome harness — feasibility probe

**Date**: 2026-08-10 · **Engine commit**: `f9e0aee` (2025-12-08) ·
**Target map**: Fall of Rome 1.06 (ToaNoah, wc3maps 421339) and the
`scripts/experimental/rome-ai/` injected build
**Reproduction kit**: `scripts/experimental/warsmash-eval/`

## The question

`lib/sim` executes a Lua map's script against mocked natives: it records the
orders an AI issues but never executes them — no movement, no pathing, no
combat, no outcome. For a **JASS** map like Fall of Rome it does not run at
all. **Decisions are barely testable; outcomes are not.** Every real bug in
eight rounds of the rome-ai programme was found by a human playing the map and
none by a checker that passed. The wanted deliverable is one number a machine
can produce: **territory over time** — control-point ownership per faction,
sampled per simulated minute.

## Reconciliation with brief 8 (added 2026-08-10, after external research)

`docs/reference/ai-research-2026-08/brief-08-headless-evaluation.md` audited
the same engine at the same commit and reported that Warsmash contains **no
native AI subsystem**: no `StartMeleeAI`, `StartCampaignAI`, `CommandAI`,
`CommandsWaiting`, `CreateCaptains`, `CaptainAttack` or `AttackMoveXY`, and a
simulation `ai` package holding only a difficulty enum.

That does not contradict this document; the two measure different layers, and
the distinction decides what the harness could ever be used for:

- **Map-script JASS runs.** This probe executed `war3map.j` and the rome-ai
  build through Warsmash's own front end. `for-ai.j` lives in the map script,
  so the module we actually develop is inside what Warsmash can host.
- **The engine AI VM does not exist there.** The `.ai` side — the S9 captain
  path — has no implementation to run against. A Warsmash harness could
  therefore never evaluate the engine-captain architecture, only our
  hand-rolled one.

Two further constraints from that brief apply to any work here: Warsmash's
README supports assets through 1.32 and excludes 1.33+, while this map targets
Reforged 2.0; and `SimulationRenderController` is not an optional no-op — it
answers terrain and building-pathing queries, so a headless implementation has
to preserve gameplay responsibilities rather than merely suppress drawing.

## Verdict

**Not blocked by code. Blocked by data, and by an unpaid fidelity bill.**

Warsmash's simulation and JASS layers really are headless-clean, and its JASS
front end really does swallow this map whole — better than the prior
evaluation claimed, because it was *tested* here rather than inferred.

But **the simulation cannot be constructed without Warcraft III's own data
tables** — 69 SLK/TXT files plus `Scripts\common.j` and `Scripts\Blizzard.j`,
all Blizzard-authored. Warsmash ships none of them by design ("For obvious
reasons, the Warsmash project does not include Warcraft III assets"), and this
environment has no legitimate copy. **No game data was downloaded.**

The good news inside that: what a *headless* harness needs is only tables,
scripts and a handful of pathing TGAs — no models, no textures, no sounds.
That is a few megabytes extractable from a user's own install, which turns an
impossible blocker into the same "user supplies it" arrangement the pjass gate
already uses for `WC3_COMMONJ` / `WC3_BLIZZARDJ`.

**No territory-over-time data exists.** The run that would produce it cannot
be started. Everything below is what was actually measured on the way to that
wall — and §8 is a spin-off worth more than the harness was.

---

## 1. Does Warsmash build and run headlessly here? — **Yes**

| | |
|---|---|
| Toolchain present | OpenJDK 21.0.10, Gradle 8.14.3, Maven 3.9.11 |
| `./gradlew` (bundled, 7.3.3) | **FAILS** — `Unsupported class file major version 65`; Gradle 7.3.3 cannot run on JDK 17+ |
| `gradle --no-daemon -p WarsmashModEngine :core:compileJava` | **BUILD SUCCESSFUL in 29–49 s** |
| Modules needed | `:core :shared :jassparser :fdfparser`. `:desktop` (LWJGL/OpenGL) is never touched |
| Dependency fetch | Maven Central through the agent proxy, no manual intervention |

Confirmed structurally: **zero `Gdx.*` references across all 1,153 files** of
`viewer5/handlers/w3x/simulation/` — the only libGDX types it imports are pure
data (`math.Rectangle` ×40, `math.Vector2`, `utils.IntMap`), plus
`audio.Sound` in one class of the `simulation/sound/` subpackage. And
`CSimulation`'s constructor takes only data: `ObjectData` tables, a
`PathingGrid` (parsed straight from the map's `war3map.wpm`), a bounds
`Rectangle`, a `java.util.Random`, and a `SimulationRenderController`
**interface** (44 abstract methods, all stubbable to no-ops). No renderer is
required to build a simulation.

**But there is no headless entry point.** `new CSimulation(...)` is called in
exactly one place in the whole repository: line 2432 of the 3,472-line
`War3MapViewer.java`, inside a chain of `loadMapTasks` lambdas interleaved
with shader, model and terrain construction. A headless driver must be
written; it does not exist and cannot be configured into existence.

## 2. Does it load Fall of Rome 1.06? — **Everything except object data**

`MapLoadProbe` against the untouched `.w3x`, with **no game data at all**:

```
PASS  open .w3x (Warsmash's own MPQ reader, no StormLib)
PASS  readMapInformation (w3i)      w3i version=31 name='TRIGSTR_001' players=12 forces=2 flags=57336
PASS  readEnvironment (w3e)         mapSize=[481, 481]
PASS  readPathing (wpm)             size=[1920, 1920]      <- the sim's only terrain input
PASS  readUnits (war3mapUnits.doo)  preplaced units=1827
PASS  readDoodads (war3map.doo)
PASS  readRegions (w3r)
FAIL  readModifications (object data merged over the GAME's SLK tables)
        NullPointerException
        at com.etheller.warsmash.util.WorldEditStrings.<init>(WorldEditStrings.java:27)
        at com.etheller.warsmash.units.StandardObjectData.<init>(StandardObjectData.java:24)
        at ...Warcraft3MapRuntimeObjectData.load(...:142)
```

Two things follow.

**The drafted three-line w3i fix is not needed for this map.** Fall of Rome
ships **w3i v31 and w3e v11**, not v32/v33 — Warsmash parses both correctly
today. `docs/upstream/warsmash-issue-w3i-v33-camera-zoom-fields.md` remains a
real upstream bug and remains worth filing; it is simply not on this path.
That blocker, as recorded in `CLAUDE.md`, **does not apply**.

**The wall is one line of missing game data, and it is load-bearing.**
`WorldEditStrings` opens `UI\WorldEditStrings.txt`; the data source returns
null. Behind it `StandardObjectData` reads **69 tables** —
`Units\UnitData.slk`, `UnitBalance.slk`, `UnitAbilities.slk`,
`UnitWeapons.slk`, `AbilityData.slk`, `ItemData.slk`, `DestructableData.slk`,
`UpgradeData.slk`, all the per-race `*Func.txt`/`*Strings.txt`, the meta-data
SLKs — plus `UI\MiscData.txt`, `Units\MiscData.txt`, `Units\MiscGame.txt` and
`Units\UnitGlobalStrings.txt` for gameplay constants, and the
`ReplaceableTextures\PathTextures\*.tga` pathing masks for buildings and
destructables. The map's `war3map.w3u` is a *delta*: its 105 custom units are
clones of **23 stock base ids** (`hfoo hkni hmil hpea hcas ocat ohwd otrb
ncop nzep …`) whose statlines live only in those tables. Without them no unit
type exists, so `CreateUnit` has nothing to create and the simulation is
empty.

## 3. Can it execute the map's JASS? — **Yes, and this is the strong result**

This was the crux, and it is the finding most likely to be doubted, so it was
measured three ways.

**a. The script parses and fully resolves.** `JassParseProbe` on
`common.j` + `Blizzard.j` + the map's 553 KB `war3map.j`:

```
PARSED common.j    in 146 ms
PARSED Blizzard.j  in  53 ms
PARSED war3map.j   in 117 ms
initialize() (instruction build; resolves every function reference) in 98 ms
main present: true      config present: true
```

`initialize()` is where an unresolved reference throws
`Unable to find function: X` (`InstructionAppendingJassStatementVisitor:732`).
It threw nothing. **Every function this map references resolves.** The
rome-ai injected build (615 KB, +86 functions) does too, in 148 ms —
**question 5 is answered affirmatively at the front-end level**: the AI module
is ordinary JASS in the map script and the engine's front end accepts it.

**b. It executes.** Running `SmashJassRunner` over the same three files with
its ~8-native stub set ran `main()` and produced **4.4 GB / ~52 million lines
of native-call trace with zero exceptions, zero syntax errors and zero
unresolved functions** (106 distinct natives reached). (It never terminates — the runner's thread loop has no
exit — so it was killed. That is a property of that throwaway `main`, not of
the interpreter.)

**c. Missing natives fail SOFT, not hard.** `NativeJassFunction.checkNativeExists`
prints `Call to native function that was declared but had no native
implementation: X` to stderr and **returns the null value of the return type**;
`JassNativeManager.checkUnregisteredNatives()` is a `// TODO maybe do this
later` no-op. Nothing crashes. This is the single most important fidelity fact
in this document: **a Warsmash run does not tell you when it is lying to you**
except on stderr, and a nulled boolean is `false`, a nulled handle is `null`,
a nulled integer is `0`.

**Coverage.** Warsmash implements **1,092 natives** (counted from
`createNative("…")` in `Jass2.java`). The rome-ai build needs **260** — 128
called directly, the rest reached through the 124 `Blizzard.j` BJ wrappers it
touches (Warsmash interprets `Blizzard.j` as ordinary JASS, so BJs are free;
their natives are not). **189 implemented, 71 missing**, of which:

- **45 are UI/cosmetic** and irrelevant headlessly — the whole Multiboard,
  Quest, cinematic-filter, timer-dialog and sound families, plus
  `BlzSetUnitName` (87 call sites), `BlzSetUnitSkin`/`BlzGetUnitSkin` (22
  each), `BlzUnitHideAbility`. A headless harness does not care that units are
  unnamed.
- **12 are game-state/lifecycle**: `EndGame`, `PauseGame`, `ChangeLevel`, the
  game-cache family, `TriggerSyncStart/Ready`. `EndGame` matters only for
  detecting the verdict, which the harness can read from state instead.
- **14 are gameplay-relevant** — these change what the AI sees or does:

  | native | why it matters here |
  |---|---|
  | **`IssuePointOrder`** | the AI's primary movement command. **`IssuePointOrderById` and `IssuePointOrderLoc` ARE implemented** — only the `(unit, "attack", x, y)` string overload is missing. A few lines. |
  | **`IsUnitVisible`** | the AI's fog respect; returns `false` ⇒ the AI sees no enemies. Warsmash *does* simulate fog (`CPlayerFogOfWar.isVisible`), so this is wiring, not new machinery. |
  | `IsPlayerAlly` / `IsPlayerEnemy` | returns `false` ⇒ everyone reads as non-ally. `IsUnitAlly`/`IsUnitEnemy` are implemented; trivial to mirror. |
  | `GetTransportUnit`, `GetLoadedUnit` | the naval-transport subsystem the playtester explicitly wants. |
  | `GetUnitLevel`, `GetHeroLevel`, `GetHeroXP`, `GetLevelingUnit`, `UnitStripHeroLevel` | hero policy. |
  | `UnitApplyTimedLife` | summons/temporaries. |
  | `MathRound` | reached through `Blizzard.j` arithmetic; nulling it to `0` would corrupt BJ math silently. |
  | `TriggerRegisterPlayerChatEvent`, `GetEventPlayerChatString` | 65 sites — the map's `-` commands and the AI's debug door. Other `TriggerRegister*` events exist, so the plumbing does. |

  None is architectural. All 14 together are plausibly a day.

**One trap worth writing down.** The map uses `Blz*` natives, which exist only
in patch 1.31+ `common.j`. With Warsmash's best-tested data configuration
(1.29) those names are declared nowhere and instruction building throws a hard
`Unable to find function`. Either supply 1.31/1.32 `Scripts`, or — because
undeclared-but-implemented is the only hard failure — **add a shim `.j`
declaring the missing natives** and let them soft-null. The engine parses a
file list, so this costs one extra file. Note the corollary: this map forces
the 1.31/1.32 data path, which the engine's own README calls "not tested in a
year".

## 4. Can it tick deterministically and expose state? — **Untestable; the signs are good**

Not reachable without a simulation, so this is code reading, flagged as such.

- `CSimulation.update()` is a plain fixed step: iterate units, finish
  additions, update projectiles, run per-player pathfinding processors,
  `gameTurnTick++`, advance time-of-day. `WarsmashConstants.SIMULATION_STEP_TIME
  = 1/20f`. Calling it N times is exactly the intended shape.
- **No wall clock in the gameplay path** — zero
  `currentTimeMillis`/`nanoTime` across all 1,153 files. The only real-time
  reads are two `TimeUtils.millis()` sites in `simulation/sound/`
  (sound-replay throttling), which cannot touch game state.
- Randomness is a single injected `java.util.Random`, seeded `new Random(1337L)`
  in `War3MapViewer`. A harness owns the seed outright.
- **The one determinism risk to test first**: 18 simulation files use
  `HashMap`/`HashSet`. Java's iteration order is stable for identical insertion
  sequences and identical hash codes, but *identity* hash codes vary per JVM
  run. If any per-tick iteration walks a hash container keyed by object
  identity, two identical runs will diverge. That is a one-hour experiment
  (run twice, diff a state dump) and it must be run before any number produced
  by this harness is believed.

**The metric itself is the easy part.** Once a simulation exists, both wanted
outcomes are ~30 lines against the sim API: territory = sample
`CUnit.getPlayerIndex()` for the settlement unit types every 1,200 ticks;
army dispersion = mean distance of each player's mobile units from that
player's start location (`War3MapW3i` player start X/Y). Nothing about the
metric is hard. The harness is the whole cost.

## 5. Effort estimate

Assume the data question is answered (below). Then, in engineer-days:

| work | est. | basis |
|---|---|---|
| `HeadlessGame` loader — replicate the non-render subset of `War3MapViewer`'s `loadMapTasks`: data sources, `WorldEditStrings`, `StandardObjectData`, `readModifications`, w3e/wpm → `PathingGrid`, `War3MapConfig` from w3i, construct `CSimulation` | 1.5–2 | 3,472-line class, maybe a third of it is load logic; the sim's inputs are all pure data |
| Stub `SimulationRenderController` (44 no-op methods) + a headless `GameUI`/TrigStr provider + `AbilityDataUI` guards | 1 | interface already exists; UI refs are 3 cosmetic call sites |
| Decouple `Jass2` from `War3MapViewer` behind an interface | 1–1.5 | 91 `war3MapViewer.` references, but 25 are `getAbilityDataUI`, 18 `getRenderPeer`, 12 `terrain`, 7 `worldScene` — nearly all cosmetic; `terrain.getGroundHeight` needs a real (or flat) answer |
| Implement the 14 gameplay natives | 0.5–1 | each is a thin wrapper over existing sim state |
| Tick loop, state dump, territory + dispersion metrics, determinism double-run | 0.5 | trivial against the sim API |
| **to a running harness** | **4.5–6** | |
| **to a harness anyone should believe** | **unbounded — see below** | |

The prior "3–5 days" estimate was close on engineering and silent on the two
costs that dominate: the data bundle and the validation.

## 6. Fidelity — the part that would teach us wrong lessons

A harness that disagrees with the game is worse than no harness. Stated
plainly, before anyone builds on it:

1. **Warsmash is a reimplementation, not the game.** Pathing, combat
   resolution, order execution and ability handling are Retera's code written
   to match observed behaviour. There is **one unit test in the entire
   repository** (`QuadtreeTest`). The project itself does not measure its own
   divergence.
2. **Unimplemented natives are silent.** 71 of the 260 this map needs return
   nulls. Two of them (`IsUnitVisible`, `IsPlayerAlly`) would make the AI
   blind and mis-allied while every check still "passes" — precisely the class
   of instrument failure this repo has been burned by three times before.
   Any harness must **fail loudly on the first unimplemented native call**,
   not log it.
3. **Ability coverage is partial**: 226 `CAbility*` classes plus 15
   ability-behaviour JSON files. Fall of Rome ships its own custom abilities;
   which of them the engine honours is unmeasured.
4. **Model-derived geometry is absent headlessly.** Ground height would be
   stubbed flat; anything reading terrain Z (projectile arcs, fly height)
   diverges from the game harmlessly for territory, and not necessarily
   harmlessly for combat.
5. **The required data configuration is the least-tested one.** The `Blz*`
   natives force 1.31/1.32 data, which the engine's README flags as untested
   for over a year.
6. **Acceptance gate, before any AI conclusion is drawn from it**: replay one
   known human game and check that the harness reproduces its territory curve
   qualitatively — who held Rome at t=15 min, roughly how many cities flipped.
   If it cannot, the harness measures Warsmash, not Warcraft.

## 7. What it would take to unblock — and one path that must be labelled

**The legitimate path.** A user with a purchased Warcraft III install extracts
a headless data bundle from it: the 69 tables above, `UI\WorldEditStrings.txt`,
`UI\WorldEditGameStrings.txt`, `UI\MiscData.txt`, `Units\MiscData.txt`,
`Units\MiscGame.txt`, `Units\UnitGlobalStrings.txt`,
`ReplaceableTextures\PathTextures\*.tga`, and `Scripts\common.j` +
`Scripts\Blizzard.j`. **No models, no textures, no sounds** — a headless sim
never renders. Order of a few MB. For 1.28-and-earlier installs our own
`tools/w3x-extract.js` / `lib/mpq.js` reads the MPQs directly; 1.31+ is CASC
and needs the user's already-extracted `.w3mod` folders (which Warsmash's
`[DataSources]` layering is designed around). The bundle stays outside the
repo permanently, exactly like `WC3_COMMONJ` today. `MapLoadProbe` takes such
a folder as its second argument and will walk past the wall the moment one
exists.

**The path that must be labelled, not taken quietly.** The 23 base unit ids
this map clones are few enough that one could *hand-author* SLK rows and run
the sim on invented statlines. It would produce plots. **Those plots would
measure numbers we made up**, and combat-derived AI conclusions from them
would be fiction presented as measurement. If it is ever done, it must be for
one narrowly-scoped question that does not depend on combat — "did the army
leave its start area", which is pathing and orders, not damage — and every
output must carry the fabrication in its label.

## 8. The spin-off worth more than the harness: JASS execution for `lib/sim`

`lib/sim` **cannot execute JASS maps at all** — which is why rome-ai, a JASS
module, has no logic tests and is instead approximated by `trace.py` reading
its own scoring subset out of the shipped `.j`. That is the real reason every
rome-ai bug needed a human.

Warsmash's `:jassparser` is a **standalone, pure-Java, game-data-free JASS
parser and interpreter**. It parsed and *ran* Fall of Rome's 553 KB script
here, on this machine, today, with **eight** stub natives and no Warcraft III
data whatsoever. Our own `lib/sim` is nothing but a mocked-native environment
with real semantics — the same shape as `SmashJassRunner`'s native table, only
1,000× more complete for the natives we care about.

So the cheapest large win available is **not** the outcome harness: it is
pointing `lib/sim`'s existing native semantics at Warsmash's JASS interpreter
(or porting the interpreter) so that JASS maps become testable at the same
decision level Lua maps already are. That would give rome-ai its first
automated tests — order counts per unit per tick, issued destinations, goal
selection over a scripted world — without a single byte of Blizzard data
beyond the user-supplied `common.j`/`Blizzard.j` the pjass gate already
assumes. It does not give outcomes; it does give the layer that has been
missing for eight rounds.

## 9. Standing recommendation

1. **Do the JASS-execution spin-off (§8) first.** It needs no game data, it
   unblocks rome-ai testing directly, and this probe already proved the
   interpreter runs the map.
2. **Open the Warsmash outcome harness only if the user can supply a headless
   data bundle (§7).** Then budget 4.5–6 engineer-days plus a validation
   program, and treat §6 as the acceptance checklist rather than a caveat
   list. `scripts/experimental/warsmash-eval/` resumes exactly where this
   stopped: `MapLoadProbe map.w3x <dataDir>` is the first command to run.
3. **File the w3i v32/v33 upstream issue anyway** — it is real, it is drafted,
   and it will bite the first modern map anyone points at this engine. It just
   was not what stopped us here.

## Reproduction

Everything in this document was produced by
`scripts/experimental/warsmash-eval/` (see its README). Third-party artifacts
— the engine clone, the map, `common.j`/`Blizzard.j` — stayed in a scratch
directory and none were committed. The `common.j`/`Blizzard.j` used are a
**Reforged-era pair already present in this session's scratch** from the
rome-ai work, not something fetched for this probe; a different patch's pair
would shift the native counts (older pairs do not declare the `Blz*` family at
all — see the 1.31 trap in §3).

**Staleness**: engine facts are pinned to commit `f9e0aee`; the native counts
and the 71-missing list will drift as upstream develops. Re-run
`native-coverage.py` rather than citing the numbers. The data-requirement
finding and the "no headless entry point" finding are structural and will age
slowly.
