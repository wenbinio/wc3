# Brief 3 — `common.ai` captain semantics and unit co-ownership

**Research snapshot:** 2026-08-10  
**Primary source snapshot:** AMAI `master` at [`2ab10eea16beb06d80278593c16016167e5bb7e0`](https://github.com/SMUnlimited/AMAI/commit/2ab10eea16beb06d80278593c16016167e5bb7e0); Blizzard `common.ai` mirror exposed by JASS API Browser; Reforged `common.j` as vendored by AMAI.  
**Scope warning:** the captain operations are engine natives. Their JASS declarations and Blizzard's wrapper logic are public; their C/C++ implementation is not. This report therefore does not pretend that wrapper observations reveal every allocation, pathing, or state-transition rule inside the engine.

## Evidence classes

- **DOCUMENTED** — stated by a primary artifact: Blizzard script/comment or World Editor help text; or directly declared by the native API.
- **CODE-INFERRED** — behavior follows from visible script control flow, but the native implementation is absent or the conclusion has not been measured in-game.
- **EXPERIMENTAL** — a named community member reports an in-game test. Useful, but not a substitute for a reproducible test map and version matrix.
- **FOLKLORE** — author/community advice without a traceable test or implementation.
- **UNKNOWN** — the searched sources do not resolve it.

Community annotations in `lep/jassdoc` are explicitly not promoted to Blizzard documentation. They are identified as third-party annotations below.

## Executive verdicts

| Supplied proposition or question | Verdict | Evidence |
|---|---|---|
| Preplaced infantry did not join because preplaced units hold guard positions. | **Plausible but not uniquely established.** World Editor help says a preplaced non-Hero, non-peon unit can have a guard position which makes the AI use/replace it. That can reserve infantry from an assault, but it applies to preplaced siege too; the observation needs the actual placement, types, orders, and `AddAssault` counts to identify the cause. | DOCUMENTED + UNKNOWN |
| `RemoveGuardPosition` makes the engine AI stop using and replacing that preplaced unit. | The World Editor action hint says exactly that, excluding Heroes and peon-type units. Map/manual control remains possible; `RemoveAllGuardPositions` applies the engine-AI exclusion to all of a player's eligible preplaced units. | DOCUMENTED |
| The captain silently recreates a removed guard position. | No source found. `RecycleGuardPosition` explicitly returns a slot to AI use, and stock campaign logic periodically fills and returns extant posts, but neither proves that an explicitly removed post is recreated. | UNKNOWN; contrary mechanism DOCUMENTED |
| Attack and defence captains have precisely documented unit-allocation rules. | False. The API distinguishes them and exposes assault/defender formation, but selection, priority, reassignment, and conflicts are hardcoded and undocumented. | DOCUMENTED + UNKNOWN |
| `CaptainIsHome` means “failed to path and returned home.” | Blizzard's `SleepUntilAtGoal` comment uses that interpretation for an attack movement. It is not evidence that this is the native flag's only possible cause; AMAI also treats it as a generic returned/retreated-home state. | DOCUMENTED wrapper interpretation; exclusive meaning UNKNOWN |
| `AttackMoveXY`, `CaptainAttack`, and `SuicideOnPoint` are three equivalent attack commands. | False. `AttackMoveXY` and `CaptainAttack` are distinct natives; `SuicideOnPoint` is a Blizzard wrapper which forms an assault, calls `AttackMoveXY`, then runs waiting/termination logic. | DOCUMENTED + CODE-INFERRED |
| The captain is a clean handle-level ownership API. | False. Stock formation is type/count based (`InitAssault`/`AddAssault`), not a public “add this unit handle” interface. | DOCUMENTED |
| AMAI calls `RemoveGuardPosition` in 61 places. | **Textually true only at the researched revision:** 61 occurrences across `.eai` files, five in comments, hence 56 executable call lines. AMAI also has 47 `RecycleGuardPosition` occurrences, one commented, hence 46 executable call lines. Counts are search results, not dynamic invocation counts. | CODE-INFERRED, reproducible source count |
| Engine AI respects fog by default. | Not established for the hidden stock native target selectors. AMAI's strategic strength/army tracker demonstrably enumerates enemy units globally and excludes true invisibility, not fogged/masked units, so AMAI is strategically omniscient even at lower difficulties; lower levels add noisy estimates. | Stock: UNKNOWN; AMAI: CODE-INFERRED |
| Insane AI gets double resources and otherwise difficulty is just a handicap. | Community testing strongly reports 2× gold/lumber per return for Insane, but no primary engine formula was located. Stock scripts also change behavior at lower difficulty, so “resources only” is false. `SetPlayerHandicap` is a different unit-health setting. | Resource factor EXPERIMENTAL; behavioral differences DOCUMENTED |

## 1. What the public captain API actually exposes

AMAI's copy of the native declaration surface lists `InitAssault`, `AddAssault`, `AddDefenders`, `AttackMoveKill`, `AttackMoveXY`, `SuicidePlayer`, `SuicidePlayerUnits`, `CaptainInCombat`, guard-post operations, `CreateCaptains`, home/reset/shift/teleport/target operations, `CaptainAttack`, and the state queries in one block ([`Natives.j`, lines 65–125](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/Natives.j#L65-L125)). **DOCUMENTED.** The body of none of these natives is present. **UNKNOWN** therefore covers exact membership priority, internal order IDs, path-failure thresholds, formation geometry, target-acquisition radius, and transition timing.

AMAI defines the public selector constants as `ATTACK_CAPTAIN = 1`, `DEFENSE_CAPTAIN = 2`, and `BOTH_CAPTAINS = 3` in its common layer. The native `CaptainInCombat` instead accepts a Boolean whose parameter name is `attack_captain`; Blizzard/AMAI call sites use true for attack and false for defence. **DOCUMENTED at the API/call-site level.**

Blizzard's stock `FormGroup` wrapper repeatedly does the following: sleeps, calls `InitAssault`, adds the requested assault unit types/counts, and exits when the attack captain is in combat, the force is sufficiently ready/full, or a timeout is reached ([Blizzard-compatible wrapper, `common_original.eai`, lines 679–741](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/common_original.eai#L679-L741)). The authoritative old `common.ai` text can also be inspected in the [JASS API Browser source mirror](https://jass.sourceforge.net/doc/api/common_ai-source.shtml). AMAI labels `common_original.eai` “Implementation by Strategy Master,” so it is a useful readable reimplementation, not proof that Blizzard shipped that exact `.eai` file. **DOCUMENTED wrapper sequence; exact native implementation UNKNOWN.**

### Which units join, and when?

What can be said safely:

1. `AddAssault(qty, unitid)` specifies desired **count and type**, not unit handles. `AddDefenders(qty, unitid)` has the same argument shape. **DOCUMENTED API.**
2. Stock `FormGroup` refreshes the desired assault composition on each pass. It does not expose which individual handles the native selected. **DOCUMENTED / UNKNOWN.**
3. A third-party annotated copy says `AddAssault` chooses already existing units and describes `AddDefenders` as grouping units around an important town building ([jassdoc annotation, pinned revision, lines 452–474](https://github.com/lep/jassdoc/blob/deddec452ec16ea355ca0aa47046b88d416dbc65/common.ai#L452-L474)). This is useful but **EXPERIMENTAL/third-party documentation**, not a Blizzard implementation contract.
4. No source found establishes whether `InitAssault` empties current membership, merely resets requested counts, preserves in-combat members, or triggers immediate reassignment. **UNKNOWN.**

The strongest diagnosis of “siege moved, infantry stood still” is therefore conditional: if the infantry were preplaced non-Hero/non-peon units with active guard positions while the siege units were trained later or had their posts removed, guard reservation fits. If both classes were equally preplaced, guard status alone does not explain the difference. Missing `AddAssault` entries/counts, unit categorisation, an already occupied captain, and formation readiness are live alternatives. **CODE-INFERRED; requires a probe to decide.**

## 2. Guard positions: reservation slots, not ordinary unit orders

Reforged's `common.j` declares `RemoveGuardPosition(unit)`, `RecycleGuardPosition(unit)`, and `RemoveAllGuardPositions(player)` ([vendored Reforged `common.j`, lines 3864–3875](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/REFORGED/common.j#L3864-L3875)). The most specific semantics found are the World Editor action hints preserved in a localisation dump:

- Remove: tells the AI “to neither use nor replace a given preplaced unit”; it has no effect on Heroes and peon-type units.
- Remove all: the same for all the player's preplaced units.
- Recycle: asks the AI to recycle the guard position that belonged to the unit.

The [localisation mirror containing those World Editor hints](https://f.gvn.co/threads/jass-ngon-ngu-co-ban-cua-war-3-cac-ban-vao-tham-khao.216534/page-5) is not an official live Blizzard page, but the quoted strings are editor resource text and align with the native names. **DOCUMENTED editor semantics, with archival-source caveat.**

Stock campaign setup calls `CreateCaptains`; its background basics loop calls `FillGuardPosts` and `ReturnGuardPosts` every five seconds ([`common_original.eai`, campaign initialization and basics loop, lines 1430–1500](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/common_original.eai#L1430-L1500)). The API also exposes `AddGuardPost`, `FillGuardPosts`, and `ReturnGuardPosts`. Together these support a model of guard posts as AI-managed reservations of a type at a location, which can be vacant, filled, or returned. **DOCUMENTED API + CODE-INFERRED representation.** The exact stored fields and allocation algorithm remain **UNKNOWN**.

Third-party jassdoc annotations add a return tolerance of about 82 units and describe the fill/return lifecycle ([pinned annotations, lines 645–678](https://github.com/lep/jassdoc/blob/deddec452ec16ea355ca0aa47046b88d416dbc65/common.ai#L645-L678)). A 2024 Hive test reports that removing a post releases manual control, recycling it returns control, and newly trained units can fill the original post ([“What does Recycle Unit Guard Position do?”](https://www.hiveworkshop.com/threads/what-does-the-action-recycle-unit-guard-position-do.357143/)). These are **EXPERIMENTAL**, not engine-source proof.

### Does the AI put the post back underneath the script?

No primary or tested source found says an explicit `RemoveGuardPosition` is spontaneously undone. Periodic `FillGuardPosts`/`ReturnGuardPosts` manages posts that still exist; `RecycleGuardPosition` is the explicit operation for returning a removed post to the pool. The editor hint's “neither use nor replace” wording also points toward removal being durable for the supported unit classes. **Best answer: no evidence of automatic recreation; exact engine edge cases UNKNOWN.** Heroes and peons are expressly exempt, so the action cannot be used to isolate those types.

`LockGuardPosition` is a separate Blizzard.j wrapper around `SetUnitCreepGuard(targ, true)` ([vendored Reforged `blizzard.j`, lines 9087–9089](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/REFORGED/blizzard.j#L9087-L9089)); it should not be conflated with the melee/campaign captain reservation pool. **DOCUMENTED API distinction.**

## 3. Attack captain versus defence captain

The visible division is simple:

- The **attack captain** is populated through assault requests and driven toward player, unit, or coordinate targets through attack/suicide natives. Stock formation readiness and `CaptainInCombat(true)` refer to this force. **DOCUMENTED.**
- The **defence captain** is populated through `AddDefenders`; its home can be placed at a threatened town. `CaptainInCombat(false)` refers to this force. **DOCUMENTED.**

AMAI makes the division operational: `FormGroupAM` calls `InitAssault` and, for each prepared attack type, requests the lesser of the owned count and its desired maximum (normally 60 for `SetMeleeGroupAM`) ([group setup, lines 12343–12356](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/common.eai#L12343-L12356), [`FormGroupAM`, lines 12404–12473](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/common.eai#L12404-L12473)); its threat tracker sets captain home to an approaching enemy army while retaining the threatened town separately ([`Jobs/ARMY_TRACK.eai`, lines 299–387](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/Jobs/ARMY_TRACK.eai#L299-L387)). **CODE-INFERRED.**

The source does **not** answer how the engine breaks ties when a unit is eligible for both captains, whether an in-combat unit can migrate, which eligible handle is chosen first, or how guards and current orders rank. Those details are **UNKNOWN**. Any precise priority list circulating without a game binary analysis or controlled probe is **FOLKLORE**.

## 4. State-query semantics

The best primary description is Blizzard's stock wait wrapper:

```jass
// CaptainAtGoal: reached goal
// CaptainIsHome: failed to path and returned home
// CaptainIsEmpty: all units died
// CaptainRetreating: retreating
```

It loops until one of these states occurs ([`SleepUntilAtGoal`, lines 801–809](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/common_original.eai#L801-L809)). This supports the following bounded meanings:

- `CaptainAtGoal`: the captain reports completion of its current movement goal. Exact radius/formation requirement is **UNKNOWN**.
- `CaptainIsHome`: in this attack-movement wrapper, it is interpreted as path failure followed by a return home. Because AMAI also uses home/retreat transitions, treating “path failure” as the flag's exclusive cause would overread one comment. **DOCUMENTED interpretation; full native semantics UNKNOWN.**
- `CaptainIsEmpty`: stock comment says all units died. Whether units removed/reassigned also make it true is **UNKNOWN**.
- `CaptainRetreating`: a retreat state, with transition thresholds hidden. **DOCUMENTED name/comment; thresholds UNKNOWN.**
- `CaptainInCombat(attack_captain)`: tests the selected captain's combat state. Exact combat acquisition/loss radius and grace period are **UNKNOWN**.

No primary source was found for a full state machine or numeric thresholds. In particular, a captain breaking off after proximity clears could be a native combat-state transition, a wrapper termination condition, target death, readiness decline, or competing orders. The observation alone does not select among them. **UNKNOWN pending an instrumented probe.**

## 5. `AttackMoveXY`, `CaptainAttack`, and `SuicideOnPoint`

### `AttackMoveXY`

`AttackMoveXY(x, y)` is a native high-level attack move for the already prepared attack captain. Blizzard's `AttackMoveXYA` calls it, waits for goal/home/empty/retreat, then sleeps while the captain is in combat ([`common_original.eai`, lines 801–842](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/common_original.eai#L801-L842)). **DOCUMENTED wrapper behavior.** Its internal order and exact termination are **UNKNOWN**.

### `CaptainAttack`

`CaptainAttack(x, y)` is a distinct native, not an alias exposed in source. AMAI comments around its targeting layer say it is “not an attack move operation” and use it to try to redirect the captain around the stock system's hardcoded/alliance target behavior. In current source, multiple proposed `CaptainAttack` branches are bypassed by unconditional `if true or ...` conditions ([`common.eai`, lines 12759–12785](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/common.eai#L12759-L12785)), so comments describe intent more reliably than the dead branch describes current behavior. **CODE-INFERRED, not a complete native contract.** There is no source-backed basis to promise a particular issued order ID, engagement rule, or endpoint.

### `SuicideOnPoint`

`SuicideOnPoint(seconds, player, x, y)` is a stock script function, not a native mode. It calls `CommonSuicide(false, false, seconds, p, x, y)` ([`common_original.eai`, lines 899–959](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/common_original.eai#L899-L959)). On the point branch, the player parameter is not used for target selection; the wrapper forms the group, invokes the attack-move path, then waits through combat/empty/readiness/timeout logic. **DOCUMENTED/CODE-INFERRED.** Thus its effective termination is the combined wrapper's exits, not merely arrival at `(x,y)`.

`SuicidePlayer` and `SuicidePlayerUnits` are native alternatives, but their target hierarchy is not defined in the public source. A tutorial author explicitly marked parts untested; one user test says the “Units” variant prioritises combatants/workers/structures and can chase away from the base, while the player variant attacks the base area ([Hive captain tutorial](https://www.hiveworkshop.com/threads/intermidiate-ai-concepts-boring-no-longer.294890/)). Treat this as **EXPERIMENTAL**, not documented engine behavior.

## 6. Known failure modes and quality ceiling

The visible design imposes hard ceilings even before bugs:

- **Type/count ownership, not handle-level tasking.** The public assault API cannot express “captain owns these exact 17 units.” **DOCUMENTED.**
- **Opaque target and combat state.** Pathing failure, combat acquisition, target refresh, and internal reassignment live behind natives. **DOCUMENTED absence / UNKNOWN semantics.**
- **Competing order authorities.** Guards, captain orders, worker/hero/shop micro, and map-trigger orders can overwrite one another. AMAI repeatedly removes and recycles guard positions precisely around such micro. **CODE-INFERRED.**
- **Wrapper-driven early exits.** Stock/AMAI waits terminate on home, retreat, empty, readiness loss, invisibility/target death, or timeouts. Winning locally does not imply the wrapper remains committed to the broader objective. **DOCUMENTED/CODE-INFERRED.**
- **Stale target or position.** AMAI's changelog repeatedly records attacks ending after one target, surviving buildings left behind, the captain remaining at an old location after Town Portal, and focus-fire target switches conflicting with Blizzard's system ([AMAI `CHANGELOG.md`](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/CHANGELOG.md)). **DOCUMENTED project history.**
- **Stuck/pathing behavior.** Modern AMAI overlays a watchdog: if distance to a target changes by at most 300 for more than ten non-combat checks, it aborts or blacklists an expansion target ([`CommonSleepUntilTargetDeadAM`, lines 12656–12731](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/common.eai#L12656-L12731)). Sleeps are jittered, so this is not an exact wall-clock threshold. **CODE-INFERRED.**
- **Chasing strays.** Located support is a community `SuicidePlayerUnits` test, not native source. **EXPERIMENTAL.**
- **Transports and unusual geography.** AMAI's changelog contains repeated transport/pathing fixes. The captain surface accepts points/units/players, not routes, crossings, chokepoints, siege prerequisites, or transport plans. **DOCUMENTED API limitation + project history.**
- **Large-map Reforged crash.** A 2025 report with test maps says `SuicideOnPlayer` crashes current Reforged when a map dimension is at least 256; reducing a 256×192 map to 224×192 or using `SuicideOnPoint` avoids the crash, and the same test works on patch 1.31. *Fall of Rome* is 480×480, so reproduce this before any player-target suicide routine is admitted. [Blizzard forum report and test maps](https://us.forums.blizzard.com/en/warcraft3/t/ai-scripts-on-maps-larger-than-224-crash-the-game/35118). **EXPERIMENTAL, version-specific.**
- **Performance/op-limit pressure.** AMAI's README calls it more resource intensive; its legacy known-issues notes CPU trouble with many AIs, and its changelog records many lag fixes. **DOCUMENTED project experience.**

The old wc3c captain thread at `http://www.wc3c.net/showthread.php?t=37835` could not be retrieved (timeout/dead origin), so claims attributed only to that URL were not used.

## 7. Co-ownership: the least-bad working pattern

There is no public per-unit captain-lease primitive. The practical pattern, visible throughout AMAI, is explicit arbitration:

1. Keep a script-owned group/flag for units under bespoke control.
2. Before manual micro, call `RemoveGuardPosition` on supported units and remove/avoid their types in the next assault request where possible.
3. Issue manual orders from only one control loop while the lease is active.
4. When returning the unit to the engine pool, clear bespoke state and call `RecycleGuardPosition` if restoring its post is intended.
5. Do not run broad periodic “order everyone” loops on both sides; use ownership states and time-bounded handoffs.

This is **CODE-INFERRED author practice**, not an official atomic protocol. It has races: `AddAssault` is type/count based, so avoiding a particular handle is not guaranteed merely by requesting fewer of its type.

At the pinned revision, a recursive source count over `.eai` files finds 61 textual `RemoveGuardPosition(` occurrences, five commented (56 executable call lines), and 47 `RecycleGuardPosition(` occurrences, one commented (46 executable call lines). AMAI uses the pair around shopping, healing, hero/focus-fire micro, tower rushes, expansion logic, retreat, and send-home behavior. Its retreat controller removes combat units' posts before explicit flee/home orders ([`Jobs/RETREAT_CONTROL.eai`, lines 115–180](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/Jobs/RETREAT_CONTROL.eai#L115-L180)); a send-home comment says removal prevents `TownThreatened` from taking control. **CODE-INFERRED.**

Broader alternatives have larger side effects:

- `RemoveAllGuardPositions` relinquishes all preplaced non-Hero/non-peon posts, not a curated combat subset. **DOCUMENTED.**
- `PauseCompAI` suspends the computer AI rather than leasing a subset. **DOCUMENTED API.**
- `AddGuardPost` can explicitly create an AI post, but that returns control toward the AI rather than guaranteeing bespoke ownership. **DOCUMENTED.**
- A fully trigger/JASS-controlled squad avoids captain contention but forfeits the captain's formation/target behaviors and must implement its own lifecycle. **CODE-INFERRED architecture trade-off.**

## 8. Fog, resources, and difficulty

### Fog of war

No engine implementation or controlled version matrix was located for the stock targeting natives (`GetEnemyBase`, `GetExpansionFoe`, `SuicidePlayer`, and related functions). Whether each honors current vision, remembers last-seen state, or reads global simulation state is therefore **UNKNOWN**.

AMAI itself is clearer. `GetPlayerStrength` enumerates all units owned by a player globally; `GetUnexactPlayerStrength` returns exact global strength on hard/Insane and a cached noisy value on Normal/Easy ([`common.eai`, lines 5483–5524](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/common.eai#L5483-L5524)). Its invisibility helper deliberately distinguishes true invisibility from fog/mask, and its army tracker enumerates each player's units globally while zeroing only truly invisible enemy strength. Thus all current AMAI difficulties use hidden enemy existence/positions in strategic tracking; lower levels obscure some aggregate strength with profile-dependent noise. **CODE-INFERRED.**

The project tutorial explicitly says the personality `Uncertainty` parameter adds ± noise to actual enemy strength “to decrease amount of cheating” ([`Manual/Pages/Tutorial.htm`, lines 49–58](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/Manual/Pages/Tutorial.htm#L49-L58)). A legacy known-issues plan contrasts Normal using visible evidence with Insane “map hacks everything,” but current code should control claims about the current version. The changelog statement that Insane determines enemy strength precisely while lower levels do so roughly is consistent with the implementation. **DOCUMENTED intent + CODE-INFERRED current behavior.**

### Resource cheats and settings

Stock script behavior is not identical across difficulty. `StandardAI` reads `MeleeDifficulty`; on the newbie level it disables fleeing, smart artillery, hero targeting, and item buying, and other stock build/expansion quantities vary by difficulty in `common.ai` ([SourceForge Blizzard `common.ai` mirror](https://jass.sourceforge.net/doc/api/common_ai-source.shtml)). **DOCUMENTED.** Difficulty is therefore more than a resource switch.

AMAI reads the same difficulty and internally estimates `income_per_mine` as 10 per second, then multiplies it by `max(difficulty - 1, 1)`; hard/Insane therefore uses 20 per mine per second in AMAI's budgeting estimate ([initial value](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/common.eai#L490-L500), [difficulty adjustment](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/common.eai#L9150-L9157)). That arithmetic does not itself award resources or state the amount per worker trip; the actual gather bonus is engine-side. **CODE-INFERRED.** Current community tests and long-running reports consistently state that Insane returns 20 instead of 10 gold/lumber per trip: [Hive test/discussion](https://www.hiveworkshop.com/threads/how-to-double-resources-workers-harvest.263876/), [AI Editor data discussion](https://www.hiveworkshop.com/threads/where-is-computer-insane-s-ai-editor-data.320121/), and [Blizzard forum report](https://us.forums.blizzard.com/en/warcraft3/t/insane-difficuly-is-against-the-game-rules-and-is-not-fair/3789/). Without a Blizzard implementation, official formula, or included reproducible test map, label the exact 2× factor **EXPERIMENTAL (strongly corroborated)** rather than DOCUMENTED.

`SetSlowChopping` is not the melee Insane mechanism: stock campaign AI enables it and AMAI's Reforged standard settings disable it. `SetPlayerHandicap` is the normal player unit-health handicap; it is not shown as the source of AI gather multiplication. **DOCUMENTED/CODE-INFERRED.** Exact engine interaction among lobby difficulty, `GetAIDifficulty`, resource return, and patch version remains **UNKNOWN** without a versioned runtime probe.

## 9. Architecture impact for a custom-map AI

The captain system is best treated as a **coarse execution service**, not the strategic owner of a real-geography army. Let a custom planner own objectives, routes, crossings, siege prerequisites, and commitment. Use a captain only for a carefully delimited squad/movement phase, with an explicit lease state around guard removal/recycling. This conclusion follows from the public type/count formation API, hidden native state, and AMAI's extensive arbitration code. **CODE-INFERRED.**

A robust design should instrument, per squad: current authority (`CAPTAIN` vs `CUSTOM`), lease start/expiry, requested unit types/counts, current captain state flags, target, distance progress, last order source, and every guard remove/recycle. That turns silent contention into traceable state. It should also implement its own progress watchdog and commitment logic rather than equating `CaptainAtGoal` or `CaptainIsHome` with strategic success/failure. **Architecture recommendation, not a claim about engine semantics.**

Before relying on a captain in production, run a small versioned probe matrix: preplaced versus trained units; infantry versus siege; guard removed/recycled; identical `AddAssault` requests; attack/defence contention; manual order injection; pathable/unpathable goals; fogged/revealed enemies; and each lobby difficulty. Log unit handle/type/order plus all five captain queries at a fixed cadence. That experiment is the shortest route to the still-UNKNOWN native details.

## Negative searches and unresolved evidence

- No public decompilation or implementation of the captain natives was located in the AMAI repository, jassdoc, SourceForge JASS mirrors, Hive threads, GitHub searches, or retrievable wc3c pages.
- No authoritative numeric definitions were found for captain goal radius, combat radius/grace time, path-failure timer, formation geometry, or exact handle-allocation priority.
- No primary source was found proving how stock captain target natives treat fog of war.
- No primary Blizzard source was found for the exact Insane harvest multiplier; 2× is strongly corroborated player testing.
- The archived wc3c forum index was visible at [this Wayback URL](https://web.archive.org/web/20160627095243mp_/http%3A//www.wc3c.net/forumdisplay.php?f=601), but individual captain discussions could not be recovered reliably in this research pass.

## Source index

- [Blizzard `common.ai` source mirror, JASS API Browser](https://jass.sourceforge.net/doc/api/common_ai-source.shtml)
- [AMAI repository](https://github.com/SMUnlimited/AMAI), [pinned researched revision](https://github.com/SMUnlimited/AMAI/commit/2ab10eea16beb06d80278593c16016167e5bb7e0)
- [AMAI native declarations](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/Natives.j#L65-L125)
- [AMAI changelog](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/CHANGELOG.md)
- [Third-party annotated `common.ai`, pinned jassdoc revision](https://github.com/lep/jassdoc/blob/deddec452ec16ea355ca0aa47046b88d416dbc65/common.ai)
- [Hive captain tutorial](https://www.hiveworkshop.com/threads/intermidiate-ai-concepts-boring-no-longer.294890/)
- [Hive “Special AI Curiosities”](https://www.hiveworkshop.com/threads/special-ai-curiosities.42944/)
- [Hive guard-position experiment/discussion](https://www.hiveworkshop.com/threads/what-does-the-action-recycle-unit-guard-position-do.357143/)
- [Hive guard-position discussion](https://www.hiveworkshop.com/threads/unit-guard-position.267649/)
- [Hive JASS guard-post problem](https://www.hiveworkshop.com/threads/jass-ai-problem-guardsecondary.299672/)
