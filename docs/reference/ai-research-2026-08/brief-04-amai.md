# Brief 4 — AMAI and the actual state of the art in Warcraft III AI

**Research snapshot:** 2026-08-10  
**Source snapshot:** AMAI `master` at [`2ab10eea16beb06d80278593c16016167e5bb7e0`](https://github.com/SMUnlimited/AMAI/commit/2ab10eea16beb06d80278593c16016167e5bb7e0), dated 2026-02-22; two commits after the 3.6.0 tag (`432dfff`, 2026-02-08).  
**Purpose:** an implementation-oriented account, with claims bounded by what the source actually establishes.

## Evidence classes

- **DOCUMENTED** — stated by a repository artifact, release/changelog, original author post, project page, competition rule, or paper.
- **CODE-INFERRED** — follows from inspected source at the pinned revision but was not verified in a running match.
- **EXPERIMENTAL** — based on a reported test or map behavior without a complete independent benchmark.
- **FOLKLORE** — community/author practice without enough implementation or test detail to reproduce.
- **UNKNOWN** — no adequate evidence located.

“Apparent defect” below means a source-level inconsistency, not a claimed runtime reproduction.

## Executive conclusions

| Question/hypothesis | Verdict | Evidence |
|---|---|---|
| AMAI is a monolithic periodic “AI tick.” | False. It is a table-generated, multi-threaded JASS AI layered over Blizzard's hardcoded melee primitives, with a timed-job queue plus separate build, attack, worker, Commander, and pathing threads. | DOCUMENTED + CODE-INFERRED |
| It chooses builds dynamically. | Yes, but from authored strategy tables and unit metadata. It scores strategies, preserves the incumbent, probabilistically chooses among top candidates, and separately chooses counter-strength categories/units. It does not learn policies online. | CODE-INFERRED |
| It clusters all players' units at radius 1500. | Substantially true with exclusions: alive standard nonstructure, non-peon units, not already assigned, not buying or harvesting; singleton/zero-strength clusters are discarded. | CODE-INFERRED |
| It stores centroid, velocity, and strength. | Centroid and strength: yes. “Velocity”: too strong; it stores only the new-centroid minus old-centroid displacement between samples, with no time normalization or history. | CODE-INFERRED |
| It projects several ticks ahead. | False. It has no time-normalized horizon or history. More importantly, the helper normalizes the absolute `C + 3D` vector, not the displacement `D`: current code projects 1000–2000 WC3 units in a direction biased by map-origin coordinates. This appears to be a point/vector mix-up. | CODE-INFERRED apparent defect |
| It scores towns by summed strength/distance with a heading override. | This describes **defensive threat**, not offensive target selection. Formula and angle override are real, plus tower and ally terms. Offensive targets are chosen separately from expansion/base natives or AMAI enemy/town-hall selection. | CODE-INFERRED |
| The current army-threat implementation is clean enough to copy verbatim. | No. Three source-level problems stand out: the future projection mixes a point with a vector, `town_owner[i]` is used inside an army loop, and an unconditional assignment makes the last AI-owned town overwrite the computed maximum. | CODE-INFERRED apparent defects |
| AMAI handles arbitrary custom maps and tech trees. | False. It is melee-schema driven. Latest-patch melee data is the normal requirement; 3.6.0 has a deliberately “quick fix and not optimal” custom-dataset option. Custom units require editing multiple tables/code and rebuilding. | DOCUMENTED |
| AMAI strategically respects fog. | No. Current army and strength routines enumerate enemy units globally; lower difficulties fuzz some aggregate strength, while hard/Insane uses exact global strength. | CODE-INFERRED |
| There is essentially no WC3 AI for a geographic custom map. | The absolute existence claim is refuted: Brytenwalda advertises full AI across a large Britain strategy map, and TrueWargame has AI over a territory layer. But no public source, benchmark, or reproducible evidence found demonstrates a reusable WC3 AI that reasons competently about arbitrary chokepoints, sieges, and territorial campaigns. | Existence DOCUMENTED; competence UNKNOWN |

## 1. Codebase and execution architecture

AMAI is source-generated rather than authored as four final `.ai` files. The core is preprocessor input (`common.eai`, `races.eai`, and `Jobs/*.eai`), native declarations (`Natives.j`), and version/race tables under `REFORGED/`, `TFT/`, and `ROC/`. Builds emit race scripts; the repository also carries the stock Blizzard race scripts under each `VanillaAI/` directory for comparison. **DOCUMENTED from repository topology.**

The supported/optimal matrix in the README is:

| Script data set | Optimal Warcraft III version | Declared support |
|---|---:|---:|
| REFORGED | 2.0.4 | 1.33+ |
| TFT | 1.24–1.28 | 1.24+ |
| ROC | 1.24–1.28 | 1.24–1.31 |

The README warns that moving away from the optimal tech data can produce poor build order or complete build failure ([README, version matrix and installation notes](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/README.md#warcraft-iii-requirements-and-versions)). **DOCUMENTED.**

### Boot path

Race-specific `main` performs version/cache/player setup, loads race units/settings/traits/strategies/heroes/buildings, initializes AMAI/profile state, chooses a weighted initial strategy and counter category, picks heroes, and finally enters `AMAI(...)` and `PlayGameAM()` ([`races.eai`, lines 894–963](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/races.eai#L894-L963)). `InitAMAI` initializes tables, strength caches, pathing, neutral data, build/upkeep state, and starts a pathing thread. `AMAI` then calls `SetMeleeAI`, applies version settings, creates captains, initializes harvest fixes, and launches the timed-job queue plus worker, attack, and Commander threads ([`common.eai`, lines 9125–9233](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/common.eai#L9125-L9233)). **CODE-INFERRED.**

This makes AMAI a **hybrid**:

- Blizzard hardcoded/native melee services still provide captains, build primitives, base/expansion target routines, and some micro.
- AMAI supplies higher-level strategy selection, custom build arrays, strength/counter models, target arbitration, army/town tracking, retreat logic, team coordination, and many corrective micro jobs.
- Data tables instantiate race/version-specific rawcodes, requirements, strategies, profiles, strengths, aggression, heroes, skills, and upgrades.

That is not marketing inference: the native surface, initialization path, generated tables, and stock-AI interop are all in the repository. **DOCUMENTED/CODE-INFERRED.**

### There is no single tick

The timed-job queue (`TQLoop`) executes due jobs and sleeps according to the next due time, usually with a jitter floor/range of roughly 0.05–0.3 seconds times `sleep_multiplier` ([`common.eai`, lines 8022–8067](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/common.eai#L8022-L8067)). Separate long-lived threads contain their own sleeps. **CODE-INFERRED.**

At the Reforged settings snapshot, `sleep_multiplier` is linearly interpolated from 1 at six or fewer AI players to 2.9 at 18, then jittered by ±0.2 in `GetSleepMultipler` ([function](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/common.eai#L7929-L7931), [settings](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/REFORGED/GlobalSettings.txt#L1-L6)). Table initialization overrides some declaration defaults. **CODE-INFERRED.**

Representative cadences, not a universal tick:

| System | Visible scheduling |
|---|---|
| Build/strategy loop | Rebuild/worker logic, then `Sleep(3 * sleep_multiplier)` ([`races.eai`, lines 782–887](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/races.eai#L782-L887)). |
| Attack loop | Blocks until hero/strength conditions; after one attack sequence, sleeps `sleep_multiplier` to `sleep_multiplier + 2` ([`races.eai`, lines 596–654](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/races.eai#L596-L654)). |
| Retreat control | Requeues at `2 * sleep_multiplier` while active ([`RETREAT_CONTROL.eai`, lines 177–282](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/Jobs/RETREAT_CONTROL.eai#L177-L282)). |
| Army/town tracking | In the no-batching case, army phases schedule town tracking after `4 + sleep_multiplier`; town tracking schedules army tracking after one more second. Nominally about six seconds at multiplier 1, plus queue jitter. Batching adds one-second continuations. ([`ARMY_TRACK.eai`, lines 389–407](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/Jobs/ARMY_TRACK.eai#L389-L407), [`TOWN_TRACK.eai`, lines 193–205](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/Jobs/TOWN_TRACK.eai#L193-L205)). |

These are scheduled delays, not guaranteed wall-clock service levels: jobs can yield, batch, compete, and be delayed by the game/AI VM. **CODE-INFERRED.**

## 2. How AMAI decides what to build

AMAI does not search an unconstrained tech tree. It selects among authored strategies and converts table goals into build dependencies.

Each race's `Strategy.txt` gives, per strategy, base priority, team/1v1/FFA and enemy-race bonuses, key buildings/upgrades/units, starting eligibility, minimum duration, main tier/type, strength-category weights, expansion times, hero bonuses, and per-race aggression adjustments. The Human table header and strategies show the schema directly ([`REFORGED/Human/Strategy.txt`](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/REFORGED/Human/Strategy.txt)). The corresponding `BuildSequence.ai` contains explicit goal calls. **DOCUMENTED.**

On a strategy reevaluation, `finish_strategy_change` adds key-building/upgrade/unit and tier terms, adds incumbent persistence proportional to food, filters weak candidates, multiplies the incumbent score by `enemy_count^0.75`, sorts candidates, then performs a weighted random draw over the configured number of relevant top strategies ([`common.eai`, lines 9526–9561](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/common.eai#L9526-L9561)). **CODE-INFERRED.** This is deliberately stochastic and persistent, not a deterministic maximum.

`StrategyChanger` declines to reconsider under several conditions, including disabled strategy changing, race/profile/debug constraints, high food use, or insufficient computed maximum enemy strength ([`races.eai`, lines 275–302](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/races.eai#L275-L302)). The Reforged threshold for the latter is 25 strength ([Global settings, line 75](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/REFORGED/GlobalSettings.txt#L73-L77)). **CODE-INFERRED.**

Countering is a separate weighted choice. For each strength category in `Strengths.txt`, `DetermineCounterForce` computes:

\[
w_c = 10\max\left(E_c - \frac{A_{c,2}}{20} - \frac{A_{c,3}}{20},\ 0\right)
\]

where the generated `enemy_*` and two configured allied counter-category totals supply the terms. It adds a small persistence bonus to the current category, zeroes categories below 3, and randomly selects proportional to the remaining weights; if total weight is zero it chooses a random category ([`common.eai`, lines 10327–10408](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/common.eai#L10327-L10408)). Later anti-category tables choose actual counter units. **CODE-INFERRED.**

The build loop continually reinitializes a priority build array when strategy, tier, or counter state changes, then invokes the selected strategy's build sequence. AMAI's advertised “auto building” means it uses authored unit prerequisite metadata to request buildings/workers/farms/upgrades needed by a goal, not that it discovers arbitrary dependencies from live object data ([README features](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/README.md#features), [manual custom-unit schema](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/Manual/Pages/Campaign.htm#L25-L45)). **DOCUMENTED + CODE-INFERRED.**

## 3. How it decides when, where, and whether to attack

### Force and timing

The race attack thread waits for a hero where enabled, heals, assigns special worker-ghoul roles, then blocks until `GetOwnStrength() >= minimum_attack_strength` (unless in desperation mode). It constructs the assault-type list and calls the universal attack sequence ([`attack_sequence_all`](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/races.eai#L596-L654)). `setup_force` includes up to three heroes, standard race units whose table attack flag is true, then neutral and unknown combat types ([`races.eai`, lines 458–480](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/races.eai#L458-L480)). `FormGroupAM` translates those types into `InitAssault`/`AddAssault` requests. **CODE-INFERRED.**

### Target hierarchy

`SingleMeleeAttackAM` is a priority dispatcher, not one scoring function. It handles, approximately in order: desperation/alliance attacks, defence of threatened towns, disabled attacks, Commander queue point/unit targets, forced player/point/unit targets, militia expansion, tower rush, ancient expansion, expansion creeps, alliance/mega targets, player targets under strength/food conditions, and ordinary creeping ([`common.eai`, lines 13792 onward](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/common.eai#L13792-L13950)). **CODE-INFERRED.**

For ordinary enemy targets, AMAI mixes Blizzard hardcoded selectors with its own selection:

- `ChooseAttackTarget` attempts a hardcoded enemy expansion then base when `random(0,1) > comp_chosen_target_rate`. Thus the attempt probability is `1 - rate`, despite the variable name; failure falls through to AMAI selection ([`common.eai`, lines 13586–13602](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/common.eai#L13586-L13602)). **CODE-INFERRED.**
- AMAI selects the weakest, strongest, FFA, or weak-and-near enemy according to `attacking_strategy`, seeks a living, non-hidden town hall near that player's start, then falls back to another building ([`ChooseAnEnemyTarget`, lines 13529–13565](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/common.eai#L13529-L13565)). `SelectByHidden(..., false)` is not a fog-visibility check. **CODE-INFERRED.**
- `IsTargetGood` accepts when

\[
\operatorname{TargetStrength}(t)+\operatorname{TowerFactor}(t)
\leq \operatorname{OwnStrength}+\operatorname{AttackAggression}+\operatorname{AddedAggression}+\operatorname{RaceAggression}+\operatorname{TargetBonus}.
\]

([`common.eai`, lines 13485–13493](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/common.eai#L13485-L13493)). **CODE-INFERRED.**

The attack wrapper repeatedly reforms/reissues, monitors combat and defence interrupts, and cleans up. A non-combat progress watchdog considers the force stuck when target distance improves by at most 300 over more than ten checks; it aborts or blacklists the expansion ([`CommonSleepUntilTargetDeadAM`, lines 12656–12731](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/common.eai#L12656-L12731)). Because sleeps are randomized and multiplied, “ten checks” must not be restated as one exact time. **CODE-INFERRED.**

### Retreat

The retreat job anchors a local scan on the tracked main army centroid or major hero, with Reforged battle radius 1500 (750 for creeps). It sums allied and non-invisible enemy unit strength, compares the result through profile/difficulty flee modifiers, calls `CaptainGoHome` when decisively outmatched, and otherwise enables native group fleeing at a lower threshold ([`RETREAT_CONTROL.eai`, lines 182–282](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/Jobs/RETREAT_CONTROL.eai#L182-L282), [radius settings](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/REFORGED/GlobalSettings.txt#L65-L67)). During an explicit retreat it enumerates the AI player's standard combat units, removes guard positions, and queues each for send-home behavior ([`RETREAT_CONTROL.eai`, lines 115–180](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/Jobs/RETREAT_CONTROL.eai#L115-L180)). **CODE-INFERRED.**

## 4. Army tracking: exact current model

This section verifies the supplied description directly against [`Jobs/ARMY_TRACK.eai`](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/Jobs/ARMY_TRACK.eai).

### 4.1 Cluster construction

Globals are `army_radius = 1500`, `army_future_mult = 3`, arrays for owner/location/direction/future/strength/group/count, and `main_army = -1` ([lines 1–21](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/Jobs/ARMY_TRACK.eai#L1-L21)). **CODE-INFERRED.**

For an existing cluster, `TrackArmy` enumerates within 1500 of the cluster's **first current unit**; if empty, it uses the old centroid. It clears and rebuilds membership, accepting units that are:

- alive and owned by the cluster owner;
- not structures or peons;
- not already assigned to another cluster during this pass;
- `IsStandardUnit`;
- not buying; and
- not currently ordered to harvest or resume harvesting.

It sums coordinates and strength. A true-invisible enemy unit may remain a group member/count but contributes zero strength. Clusters with at most one member or zero total strength are deleted ([`TrackArmy`, lines 62–135](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/Jobs/ARMY_TRACK.eai#L62-L135)). **CODE-INFERRED.**

After refreshing existing clusters, it enumerates every playing player's unassigned combat units and seeds new 1500-radius clusters. Existing armies are processed in batches of 30 and player seeding in batches of 10 to reduce long uninterrupted loops. The AI's `main_army` is the strongest own cluster, with a cluster containing the major hero as fallback ([lines 137–234](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/Jobs/ARMY_TRACK.eai#L137-L234)). **CODE-INFERRED.**

This is a greedy radius partition, not a global clustering optimum: seed/order and the first-unit anchor can influence partitions, and membership is not recursively expanded to a full transitive connected component. There is no merge/split objective function in the file. **CODE-INFERRED.**

### 4.2 Centroid, displacement, and “future” point

For `n` accepted members with positions `p_j`, current location is the arithmetic centroid:

\[
C_t=\frac{1}{n}\sum_{j=1}^{n}p_j.
\]

The stored direction is simply:

\[
D_t=C_t-C_{t-1}.
\]

It then makes an intermediate location `L = C_t + 3D_t` and calls `GetProjectedLoc(C_t, L, random(full_threat_distance, no_threat_distance))` ([`TrackArmy`, lines 116–127](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/Jobs/ARMY_TRACK.eai#L116-L127)). Crucially, `GetProjectedLoc` does **not** interpret its second argument as a target point. It normalizes that argument directly and adds the scaled vector to its first argument ([`common.eai`, lines 2921–2942](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/common.eai#L2921-L2942)). The exact current calculation is therefore:

\[
F_t=C_t+r\frac{C_t+3D_t}{\max(\lVert C_t+3D_t\rVert,1)},
\qquad r\sim U(1000,2000).
\]

Those distances come from the current Reforged settings ([lines 40–43](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/REFORGED/GlobalSettings.txt#L40-L43)). Thus the absolute map-origin coordinate `C_t` contaminates the direction. The nearby comment says the intermediate value represents the desired direction, suggesting the likely intent was to normalize `D_t` (or subtract `C_t` before projection), but current code does not do that. **CODE-INFERRED apparent point/vector defect; not runtime-tested here.**

Calling `D_t` velocity is inaccurate because it is not divided by elapsed time; there is no multi-sample fit, smoothing, acceleration, or “several ticks ahead” horizon. Nor is the current future point even a clean one-sample heading projection because of the point/vector mix-up above. **CODE-INFERRED.**

### 4.3 Town representation

Town tracking is separate, with `town_radius = 2500`. It first seeds at each living town hall or mine, then at otherwise-unassigned structures; each cluster absorbs same-owner structures within 2500. Location is a found hall/mine, otherwise structure centroid. Value is +5 per hall, +1 per ordinary structure, plus +5 when a nearby mine exists ([`TOWN_TRACK.eai`, lines 50–126](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/Jobs/TOWN_TRACK.eai#L50-L126), [seeding, lines 151–191](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/Jobs/TOWN_TRACK.eai#L151-L191)). **CODE-INFERRED.**

That `town_value` supports home/town classification. It is **not** the offensive-target score and does not appear in the distance-threat formula below. **CODE-INFERRED.**

### 4.4 Defensive threat equation

For town `k`, the routine starts with twice the tower strength within `ver_tower_check_radius` (2000 in the Reforged settings). For army `i` it computes a candidate distance:

1. `d_future = max(distance(F_i, T_k), 1000)`.
2. Let `V = T_k - C_i`.
3. If `distance(C_i,T_k) < length(D_i)` **and** `abs(angle(D_i,V)) <= 0.4` radians, force `d_i = 1000`.
4. Otherwise `d_i = min(d_future, distance(C_i,T_k))`.

If `d_i <= 2000`, raw army threat is:

\[
q_{ik}=\frac{540\,S_i}{d_i^{0.8}}.
\]

An allied non-self army subtracts `0.3 q`; a non-self non-ally army adds `q`. The largest individual enemy term records which army threatens the town ([`UpdateSpecificTownThreat`, lines 236–297](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/Jobs/ARMY_TRACK.eai#L236-L297), [settings](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/REFORGED/GlobalSettings.txt#L40-L51)). **CODE-INFERRED.**

The heading override is thus narrower and stranger than “moving toward town”: the current distance must be less than the entire last-sample displacement length, i.e. the centroid's last step would overshoot the town, and heading error must be at most 0.4 radians (about 22.9°). **CODE-INFERRED.**

Accepted threat is time- and enemy-count-scaled:

\[
A=\operatorname{lerp}(300,900,10,20,t)\times
  \operatorname{lerp}(1,4,1,1.5,N_{enemy}),
\]

using AMAI's interpolation helper/clamping behavior. The AI converts its main army to comparable threat at full distance, applies flee modifiers, uses a 1.05 multiplier before defending an allied rather than own town, and persists a threat state for three further tracker cycles before standing down ([`UpdateTownThreat`, lines 299–387](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/Jobs/ARMY_TRACK.eai#L299-L387)). When an enemy army is identified, engine captain home is set toward that army; a separate `captain_home` variable retains the town location for the custom retreat layer. **CODE-INFERRED.**

### 4.5 Three apparent source defects

These must be resolved before transplanting the algorithm:

1. `TrackArmy` forms an absolute point `C + 3D`, but `GetProjectedLoc` normalizes its second argument as a vector. The prediction direction consequently depends on coordinates relative to `(0,0)`, not only army movement. **CODE-INFERRED apparent point/vector defect.** The older implementation directly used `C + 3D`; [commit `ddce396a` (2024-12-21), “Stablise future army locations #482”](https://github.com/SMUnlimited/AMAI/commit/ddce396a269de2dd0ab131a89abc7e21fa592881), introduced the mismatched helper call. The function comments and prior code make the intended heading especially clear; runtime impact was not measured.
2. The army loop tests `army_owner[i] != town_owner[i]` ([line 250](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/Jobs/ARMY_TRACK.eai#L247-L253)). Every surrounding town access uses `town_owner[num]`, while `i` indexes armies. This is an **apparent wrong-index defect, CODE-INFERRED**, not runtime-confirmed here. `git blame` traces the condition to [commit `fe2408a` (2024-10-30)](https://github.com/SMUnlimited/AMAI/commit/fe2408a993aa9f64c9822b295ab51129abb0a7d7).
3. After conditionally selecting the maximum-threat AI-owned town, the code unconditionally executes `set most_threatened_player_town = num` ([lines 279–284](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/Jobs/ARMY_TRACK.eai#L279-L284)). This appears to make the last processed own town win. **CODE-INFERRED apparent control-flow defect.** The duplicate assignment was introduced in [commit `4f538c8` (2024-05-20)](https://github.com/SMUnlimited/AMAI/commit/4f538c81bd5a7e1622177ac3f99c4ffebca0dcd4), titled “Retreat Control fixes and improvements #305.”

No match replay or instrumented map was run, so this report does not label any of the three as EXPERIMENTAL/runtime-confirmed.

### 4.6 Fog implication

`SeedNewArmiesForPlayer` calls `GroupEnumUnitsOfPlayer` for every playing player. `IsUnitInvisibleAM` excludes true invisibility but deliberately not fogged/masked status; the global player-strength routine likewise enumerates all units. On hard/Insane, `GetUnexactPlayerStrength` returns exact global strength; on lower difficulties it applies profile-dependent multiplicative/additive noise and caches the result ([`common.eai`, lines 5483–5524](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/common.eai#L5483-L5524)). **CODE-INFERRED.** AMAI is not fog-honest at the strategic model level. “Uncertainty” reduces precision, not information reach; the legacy tutorial itself describes it as reducing cheating ([`Tutorial.htm`, lines 49–58](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/Manual/Pages/Tutorial.htm#L49-L58)). **DOCUMENTED intent + CODE-INFERRED mechanics.**

## 5. Custom maps and non-standard technology

The README is unambiguous: AMAI is designed for melee maps. A custom melee map should use the Latest Patch data set and melee AI; otherwise AMAI can become stuck upgrading through Tier 2. Scripted maps may need the Commander disabled because it can conflict. Custom units require custom AMAI edits following the manual ([README custom-map section](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/README.md#custom-maps)). **DOCUMENTED.**

Version 3.6.0 added a `custom_data_set` setting for the custom 1.0.1 data set, explicitly described as “just a quick fix and not optimal” that at least permits the next tier ([3.6.0 changelog, lines 16–23](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/CHANGELOG.md#L16-L23); [setting](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/REFORGED/GlobalSettings.txt#L94-L99)). **DOCUMENTED.** It is not a generic compatibility layer.

For a custom race/tree, the manual tells authors to populate `StandardUnits.txt`—the master set of known units, buildings, abilities, upgrades, and items—and, as applicable, transformations/upgrades, `NeededExtra`, `UnitConversions`, `UnitEquivalence`, strengths, heroes/skills, racial settings, strategies/build sequences, items, healers, mercenaries, and other special tables, then compile ([`Campaign.htm`, lines 25–45](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/Manual/Pages/Campaign.htm#L25-L45) and [lines 161–192](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/Manual/Pages/Campaign.htm#L161-L192)). **DOCUMENTED.** There is no runtime schema discovery or learning in the inspected source. **CODE-INFERRED.**

Expected breakage includes:

- unknown rawcodes not included in standard/attack/strength tables;
- wrong or missing prerequisite chains, morphs, equivalents, upgrades, hero skills, or strength categories;
- tier logic tied to expected hall IDs/data set;
- melee assumptions about start locations, halls, mines, workers, food, expansion sites, and neutral buildings;
- special subsystems with hardcoded/non-modifiable types. Legacy known issues name wards and zeppelins as examples ([`KnownIssues.htm`, lines 42–77](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/Manual/Pages/KnownIssues.htm#L42-L77)).

These are **DOCUMENTED project constraints plus CODE-INFERRED consequences**. A custom-map author can reuse AMAI as a framework, but only by adapting the model; dropping default AMAI into a territory-control scenario is not supported.

## 6. What the authors found hard

AMAI's legacy manual and changelog are unusually candid design records. They identify recurring hard boundaries:

- **Hardcoded Blizzard control:** item/spell use, base placement, guard/captain target behavior, and focus-fire conflicts. The legacy known-issues page explicitly says target changes arise from AMAI focus fire fighting Blizzard's built-in targeting ([`KnownIssues.htm`, lines 64–77](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/Manual/Pages/KnownIssues.htm#L64-L77)). **DOCUMENTED author diagnosis.**
- **Retreat/home/teleport state:** the 3.6.0 changelog alone fixes forced flee, captain locations at `(0,0)`, stale last-known captain location, and bad retreat destinations; older entries repeat never-retreating, immediate re-engagement, and Town Portal problems. **DOCUMENTED project history.**
- **Target persistence and coordination:** changelog entries cover failing to select another target after a kill, attacks ending with structures alive, ally target mismatch, team-game infinite attacks, and AMAI allies wandering away from one another. **DOCUMENTED project history.**
- **Ghouls and multi-role units:** repeated fixes prevent harvesting ghouls from becoming the main army or being pulled to refill dead attackers. **DOCUMENTED project history.**
- **Pathing, mines, and transport:** mine passability, invalid expansion placement, zeppelin counts/movement, water expansion, and stuck attacks recur across releases. **DOCUMENTED project history.**
- **CPU, VM limits, and scheduler discipline:** README warns about lag/crashes with many AIs; legacy documentation says waits inside timed jobs can disrupt the entire job system; changelog records infinite loops, leaks, and army-track lag ([README notes](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/README.md#notes), [`KnownIssues.htm`, lines 16–46](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/Manual/Pages/KnownIssues.htm#L16-L46)). **DOCUMENTED.**
- **Partial observability versus difficulty:** a legacy design item says Normal should rely more on visible evidence and Insane should “map hack everything”; modern code implements exact versus noisy global strength, not a fully vision-bounded normal model. **DOCUMENTED historical intent + CODE-INFERRED present divergence.**
- **Mod support:** the authors wanted custom strength overrides and noted non-modifiable sections; current tables improve extensibility but still require manual schema work. **DOCUMENTED.**

The repository's Git history begins with a 2020 import, so it is not a complete commit-by-commit history of the 2004–2019 project. `CHANGELOG.md` preserves dated legacy notes back into the 2000s. The README credits AIAndy, Zalamander, and Strategy Master; AIAndy's [AMAI 2.4 release post (2004)](https://www.hiveworkshop.com/threads/amai-2-4-release.12733/) already describes army, militia, neutral-building, expansion, attack, and performance work. The continuing [official Hive AMAI thread](https://www.hiveworkshop.com/threads/advanced-melee-ai.62879/) and [GitHub releases](https://github.com/SMUnlimited/AMAI/releases) document later maintenance. **DOCUMENTED.**

The original wc3campaigns/wc3c forum index is preserved at [Wayback](https://web.archive.org/web/20160627095243mp_/http%3A//www.wc3c.net/forumdisplay.php?f=601), but safe retrieval of individual archived discussions failed during this pass. No claims were invented from snippets. **Negative search.**

## 7. Comparable Warcraft III projects

The public field is thin and poorly benchmarked compared with Brood War.

| Project | What the located source establishes | Limits/evidence |
|---|---|---|
| [HonestAI](https://www.hiveworkshop.com/threads/honestai-is-an-alternative-to-amai.269263/) | A 2015 alternative whose author emphasized fog-of-war honesty, fewer features, and equal resource footing. | DOCUMENTED author claim; development stopped and no durable source repository or comparative benchmark was located. Quality UNKNOWN. |
| Enhanced stock race scripts associated with Ujimasa Hojo/kizonrus | Community posts refer to repaired/improved melee `.ai` scripts, e.g. this [Orc melee-AI discussion](https://www.hiveworkshop.com/threads/orc-melee-ai-doesnt-train-3rd-hero.341872/). | FOLKLORE/fragmentary; no canonical maintained source and evaluation suite located. |
| [JASS Campaign AI 2.0](https://www.hiveworkshop.com/threads/jass-campaign-ai-2-0.334624/) | A reusable JASS campaign-AI framework/reimplementation for authored scenarios. | DOCUMENTED project existence; not a general tournament bot API or demonstrated arbitrary-map strategic learner. |
| [Jonas Isberg's 2004 Lund University thesis](https://fileadmin.cs.lth.se/ai/xj/JonasIsberg/thesis.pdf) | Uses Warcraft III as an interactive AI research testbed for a Wumpus-world agent. The map sends percepts with `CommandAI`; the AI writes its chosen action to unit user data for the map to poll. | DOCUMENTED academic implementation. It studies inter-program communication and agent-environment integration, not competitive melee, territorial strategy, or a reusable bot league/API. |
| Blizzard stock `.ai` scripts | AMAI preserves per-version `VanillaAI/*.ai`; these are the baseline build-and-assault scripts. | DOCUMENTED source; no standard cross-project benchmark located. |

Searches across GitHub, Hive, wc3c archives, and the general web found no active WC3 equivalent of BWAPI plus AIIDE/CIG infrastructure: no standardized external bot API, annual source-submission league, map suite, replay corpus, deterministic harness, and common metrics. **Negative search, not proof of impossibility.** Academic searches found Warcraft III used in scattered game-AI work, but no durable WC3 bot ecosystem or source framework with evidence strong enough to recommend over the projects above. **UNKNOWN/negative search.**

## 8. What transfers from the Brood War ecosystem

Brood War's advantage is infrastructure as much as algorithm choice.

- [BWAPI](https://github.com/bwapi/bwapi) exposes unit-level state/control, replay access, and an open C++ bot interface; its [documentation](https://bwapi.github.io/) is public. **DOCUMENTED.**
- The [AIIDE StarCraft AI Competition](https://davechurchill.ca/starcraft/aiide/) standardizes maps, fog/no-cheat rules, source submissions, execution/time limits, and persistent data. The [2025 call](https://sites.google.com/ualberta.ca/aiide2025/calls/call-for-starcraft-ai-competition) describes the long-running competition and research problems including planning, spatial reasoning, optimization, and opponent modeling. **DOCUMENTED.**
- [BWEM](https://github.com/pimmen/BWEM) constructs areas, chokepoints, bases, and paths and updates them after destructible terrain changes; its [FAQ](https://bwem.sourceforge.net/faq.html) explains the representation. **DOCUMENTED.** Perkins's [terrain-analysis paper](https://ojs.aaai.org/index.php/AIIDE/article/view/12405) similarly derives polygonal regions and chokepoints. **DOCUMENTED research.**
- Build-order search is treated as an explicit planning/optimization problem rather than only a static script: see [Churchill and Buro, “Build Order Optimization in StarCraft”](https://ojs.aaai.org/index.php/AIIDE/article/view/12435) and [robust continuous build-order optimization](https://davechurchill.ca/publications/pdf/cog19_buildorder.pdf). **DOCUMENTED research.**
- Combat abstraction and fast rollout/action portfolios are represented by SparCraft/Portfolio Greedy Search ([Churchill et al., 2013](https://ieeexplore.ieee.org/document/6633643)). Influence-map based kiting is evaluated in [Hagelbäck and Johansson](https://ojs.aaai.org/index.php/AIIDE/article/view/12544). **DOCUMENTED research.**
- Hidden-state estimation can be explicit: [particle-model state estimation](https://cdn.aaai.org/ojs/12424/12424-52-15952-1-2-20201228.pdf) reports an EISBot improvement over its baseline. **DOCUMENTED paper result; transfer performance to WC3 UNKNOWN.**
- The field is surveyed in [Ontañón et al., “A Survey of Real-Time Strategy Game AI Research and Competition in StarCraft”](https://hal.science/hal-00871001). **DOCUMENTED.**

For a WC3 territory game, the highest-value transfers are architectural:

1. a versioned, explicit world model whose enemy component distinguishes visible, last-seen, inferred, and unknown state;
2. an authored area/chokepoint/crossing/base graph, updated when gates or bridges change;
3. squad/mission ownership with one order authority per unit;
4. influence/threat maps derived from observed state and uncertainty, not omniscient enumeration;
5. explicit build/economy simulation and prerequisite constraints;
6. fast local combat estimates or small action portfolios to decide commit/retreat;
7. opponent-model and replay-driven offline regression; and
8. a deterministic scenario suite, telemetry schema, replay corpus, time budget, and ablation metrics.

These are **architecture recommendations grounded in the cited systems**, not claims that a BW algorithm can be copied unchanged. Stock `common.ai` does not provide BWAPI-equivalent per-frame external control or terrain regions. A custom WC3 map would need to expose the geography and implement the planner in JASS/Lua/map triggers (or another authorized interface) rather than expecting captains to infer it. **CODE-INFERRED platform constraint.**

## 9. Custom maps with real geography

The hypothesis “essentially none exists” is too absolute.

### Counterexample 1: Brytenwalda

[Brytenwalda](https://www.hiveworkshop.com/threads/brytenwalda.287147/) is a large Britain strategy map with settlements/regions, taxation/control, diplomacy/vassals/tributaries, many factions, strategic geography, and advertised full AI support. Its update history includes AI-specific campaign behavior such as Irish factions failing to invade the mainland, which is at least evidence of geography-aware authoring rather than a pure melee drop-in. **DOCUMENTED map/author claims and update history.**

What is not established: source architecture, a controlled human-equivalent benchmark, chokepoint utilization metrics, siege competence, or reproducibility across arbitrary maps. Calling the AI “competent” in the research sense is **UNKNOWN** without replay evaluation.

### Counterexample 2: TrueWargame: Territories Conquest

[TrueWargame: Territories Conquest](https://www.hiveworkshop.com/threads/truewargame-territories-conquest-1-06-c.317103/) advertises 30 territories, multiple factions with AI, a turn-based strategic territory map, and separate RTS battle maps. **DOCUMENTED project existence.** It demonstrates AI participation in territorial geography, but abstracts strategic movement into a board layer; it is not evidence that a real-time WC3 army reasons over chokepoints and siege routes. The author also discusses economy/difficulty limitations. **DOCUMENTED caveat; competence UNKNOWN.**

Other search hits, including Total War-style WC3 maps, frequently state that AI is absent or poor. They are negative examples, not proof no strong private or unindexed system exists. No public reusable implementation or benchmarked map was located that demonstrates all of: dynamic territorial objectives, chokepoint/crossing planning, wall/gate siege decisions, naval transport, partial observability, and multi-faction coordination. **Negative search.**

The defensible conclusion is therefore:

> WC3 maps with authored territorial AI exist, so “none anywhere” is false. No located evidence establishes a general, reusable, benchmarked WC3 AI that handles real geography competently at the level implied by the brief.

## 10. Architecture impact for a real-geography project

AMAI is valuable as a **reference implementation and subsystem donor**, not as the strategic core to transplant unchanged.

Reusable ideas/code patterns include table-generated unit metadata, profile/strategy persistence, explicit strength categories, job staggering for the AI VM, captain/guard arbitration, local retreat estimation, and extensive telemetry/changelog-driven hardening. **CODE-INFERRED recommendation.** The second-hand army tracker is useful as a cheap defensive signal, after fixing the apparent indices and replacing omniscient enumeration.

Do not reuse its abstractions as the top-level world model for a territory campaign:

- A 1500-radius centroid cluster has no notion of an army's mission, side of a wall, available crossing, required siege, transport capacity, supply line, or objective commitment.
- The randomized 1000–2000 look-ahead is not a motion model, and current code appears to project from an absolute-coordinate vector rather than the displacement heading.
- Town threat is defensive and local; offensive target selection is enemy/building oriented, not route-cost/objective-utility planning.
- Global enumeration violates fog-honest design.
- Type/count captains cannot provide clean handle-level task ownership.

The project should instead maintain an explicit geography graph (regions, gates/crossings, sea embarkation edges, costs and dynamic open/destroyed state), mission-owned squads, a partial-observability belief state, and a planner that separates **choose objective → choose feasible route/mode → acquire prerequisites → commit with progress/abort conditions → execute locally**. Captains may be used at the final execution layer behind an ownership lease. **Architecture recommendation.**

The most important research engineering transfer from Brood War is to build the test harness early: fixed seeds/scenarios for breach present/absent, friendly gate/enemy gate, no siege/siege available, transport missing/available, two near-equal objectives, ally claim conflicts, and stale enemy information; record objective dwell time, progress, order churn, route completion, casualties, and frame/operation cost. This is how “competently” becomes measurable rather than anecdotal. **Architecture recommendation.**

## Negative searches and unresolved questions

- Individual discussions in AMAI's original wc3campaigns/wc3c forum could not be reliably recovered from the Wayback index; no claims were inferred from inaccessible pages.
- No public engine implementation for Blizzard's hardcoded AI/captain target routines was found, so AMAI comments about their side effects remain project evidence, not a complete native specification.
- No independent benchmark comparing AMAI, stock AI, HonestAI, and custom replacements across a fixed map/replay suite was located.
- No maintained WC3 equivalent of BWAPI plus an annual open-source bot competition was located.
- No source or benchmark was found for Brytenwalda/TrueWargame proving the quality of their territorial AI; their existence and advertised features are documented, competence remains unknown.
- No academic WC3 bot framework with durable source, maps, and evaluation evidence strong enough to recommend was located in this pass.

## Primary source index

- [AMAI repository](https://github.com/SMUnlimited/AMAI), [pinned revision](https://github.com/SMUnlimited/AMAI/commit/2ab10eea16beb06d80278593c16016167e5bb7e0), [releases](https://github.com/SMUnlimited/AMAI/releases)
- [AMAI README](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/README.md)
- [AMAI changelog](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/CHANGELOG.md)
- [`Jobs/ARMY_TRACK.eai`](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/Jobs/ARMY_TRACK.eai), [`Jobs/TOWN_TRACK.eai`](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/Jobs/TOWN_TRACK.eai), [`Jobs/RETREAT_CONTROL.eai`](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/Jobs/RETREAT_CONTROL.eai)
- [`common.eai`](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/common.eai), [`races.eai`](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/races.eai), [Reforged settings](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/REFORGED/GlobalSettings.txt)
- [Custom-unit/campaign manual](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/Manual/Pages/Campaign.htm), [legacy known issues/design list](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/Manual/Pages/KnownIssues.htm), [profiles tutorial](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/Manual/Pages/Tutorial.htm)
- [Original AMAI 2.4 release thread](https://www.hiveworkshop.com/threads/amai-2-4-release.12733/), [current AMAI Hive thread](https://www.hiveworkshop.com/threads/advanced-melee-ai.62879/)
- [BWAPI](https://github.com/bwapi/bwapi), [AIIDE competition](https://davechurchill.ca/starcraft/aiide/), [BWEM](https://github.com/pimmen/BWEM)
