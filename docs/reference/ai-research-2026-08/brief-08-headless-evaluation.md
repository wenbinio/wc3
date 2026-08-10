# Brief 8 — Headless evaluation, replay telemetry, and an RL-style harness

Research date: 2026-08-10  
Target: *The Fall of Rome* 1.06 and the Warcraft III native `.ai` / `common.ai` stack

## Bottom line

There is no ready, faithful, headless Warcraft III harness for this project.

The most important blocker is more specific than “Warsmash is incomplete”: at the audited upstream commit, Warsmash contains a tickable game simulation and a JASS runtime, but it does **not** contain Warcraft III's native AI subsystem. A source-wide search found none of the loader, queue, captain, or order entry points the proposed AI uses—`StartMeleeAI`, `StartCampaignAI`, `CommandAI`, `CommandsWaiting`, `CreateCaptains`, `CaptainAttack`, or `AttackMoveXY`. It also lacks the `common.ai` wrapper `SuicideOnPoint` and the runtime beneath it. Its simulation `ai` package contains only `AIDifficulty.java`. Therefore a small “headless wrapper” around Warsmash would not run or test the AI being developed; the native AI VM and `common.ai` semantics would first have to be implemented or ported.

The shortest credible evaluation path is instead:

1. run the real Warcraft III client on Windows with a self-starting test build of the map;
2. make the map emit sparse, explicit outcome events into the replay or a controlled local log;
3. automate launch, timeout, result collection, replay archival, and crash recovery;
4. parse the emitted events into match records and scorecards.

That path is not headless and is unlikely to deliver large parallel throughput, but it preserves the engine behavior this AI depends on. Ordinary `.w3g` parsing alone is insufficient: replay files primarily record player input, not computer-AI orders or authoritative world-state outcomes. A replay can therefore exist while omitting exactly the evidence needed to judge whether an AI army left a city, crossed a gate, captured territory, or made progress.

## Evidence labels

- **P — primary artifact:** repository source, specification, issue, official/community project documentation, or observed command syntax.
- **D — developer/community report:** a public statement or bug report not reproduced here.
- **I — inference:** an engineering conclusion derived from artifacts; not a demonstrated production result.
- **N — negative source audit:** no implementation or documentation found in the named, pinned source tree or documented searches. This is narrower than proof that no private fork exists.

## Decision table

| Candidate | Runs this `.ai` stack today? | Headless today? | Retail fidelity | Main use | Decision |
|---|---:|---:|---:|---|---|
| Retail Warcraft III client + instrumented map | Yes | No | Highest | Near-term regression and match evaluation | **Build first** |
| Upstream Warsmash | No native AI VM found | No supported runner found | Uncertain for Reforged 2.x | Long-term research platform | **Do not treat as a wrapper task** |
| War3Net | Runtime/API packages are roadmap items | No usable simulator | Not established | Libraries and future watchlist | **Not usable now** |
| Open Realm | No evidence of full map/JASS/native-AI support | No demonstrated harness | Early implementation | Engine research | **Not usable now** |
| WC3 Community Edition | Uses a legacy retail client | No | Legacy-client fidelity | Mod/platform tooling | **Not a simulator** |
| SharpCraft / MemHackAPI | Hooks or escapes into legacy retail | No | Patch-specific | Instrumentation experiments | **Unsafe/fragile foundation** |
| Replay parser only | Does not execute a match | N/A | Reads recorded inputs | Metadata extraction | **Useful only with map telemetry** |
| Purpose-built abstract simulator | Only if AI is reimplemented | Yes | Deliberately approximate | Fast policy search | **Useful for heuristics, not conformance** |

## 1. What upstream Warsmash actually provides

### A programmatically tickable core exists

`CSimulation` accepts a `SimulationRenderController`, owns units, projectiles, players, pathfinding processors, timers and trigger threads, and exposes a public `update()` method. That method advances unit logic, removals, projectiles, player pathfinding, the game tick, timers, on-tick triggers, and queued JASS threads. This is a meaningful starting point for a simulator. **P**

Sources:

- [pinned `CSimulation` constructor](https://github.com/Retera/WarsmashModEngine/blob/f9e0aeed4be372d6016519d0e97b384aa873f374/core/src/com/etheller/warsmash/viewer5/handlers/w3x/simulation/CSimulation.java#L139)
- [pinned `CSimulation.update()`](https://github.com/Retera/WarsmashModEngine/blob/f9e0aeed4be372d6016519d0e97b384aa873f374/core/src/com/etheller/warsmash/viewer5/handlers/w3x/simulation/CSimulation.java#L510)

But the render abstraction is not an optional no-op parameter. `SimulationRenderController` is used to create units, items, destructables, corpses and projectiles, and to answer terrain/building-pathing queries. A local audit found 61 direct calls from `CSimulation`. A headless implementation would need to preserve gameplay-relevant responsibilities, not merely suppress drawing. **P + I**

Source: [pinned `SimulationRenderController`](https://github.com/Retera/WarsmashModEngine/blob/f9e0aeed4be372d6016519d0e97b384aa873f374/core/src/com/etheller/warsmash/viewer5/handlers/w3x/simulation/util/SimulationRenderController.java)

### The required native AI VM is absent

At commit `f9e0aeed4be372d6016519d0e97b384aa873f374` (2025-12-08), a source-wide exact-symbol audit found no implementation or registration of:

- `StartMeleeAI` or `StartCampaignAI`;
- `CommandAI` or `CommandsWaiting`;
- `CreateCaptains` or `CaptainAttack`;
- `AttackMoveXY`.

The tree also contains no `SuicideOnPoint`, but that retail symbol is a `common.ai` script wrapper around lower-level assault/attack functions, not a native registration. Its absence is additional evidence that the `common.ai` runtime layer is missing, not another missing native. **P + N**

The upstream simulation AI directory contains only an AI difficulty enum. **P + N**

Sources:

- [pinned Warsmash AI directory](https://github.com/Retera/WarsmashModEngine/tree/f9e0aeed4be372d6016519d0e97b384aa873f374/core/src/com/etheller/warsmash/viewer5/handlers/w3x/simulation/ai)
- [pinned JASS native registration source](https://github.com/Retera/WarsmashModEngine/blob/f9e0aeed4be372d6016519d0e97b384aa873f374/core/src/com/etheller/warsmash/parsers/jass/Jass2.java)

This is a hard scope boundary. The project can either implement the missing native AI layer with retail-compatible scheduling, command queues, captain ownership and order semantics, or port the decision policy into Warsmash's ordinary map/JASS/order layer. The second route may enable experiments, but it no longer tests the same engine subsystem. **I**

### General runtime gaps remain

The pinned JASS runtime throws “not yet implemented” for game-state events, `GetWinningPlayer`, trackables and tournament natives. `CSimulation.registerGameEvent` logs that game events are not yet implemented, and marketplace slot behavior is explicitly ignored. These specific gaps may or may not be touched by *Fall of Rome*, but they make compatibility a test obligation rather than an assumption. **P**

The README documents a rendered, windowed map launcher—`runGame -Pargs="-loadfile WorldEditTestMap.w3x -window"`—not a headless mode. It says assets were tested for patches 1.22–1.32 and explicitly excludes 1.33 and beyond because the model format changed. *Fall of Rome* 1.06 recommends Reforged 2.00, so map loading and visual changes are not the only risk; object data, pathing, script/native behavior and balance must be checked against retail. **P + I**

Source: [Warsmash README at the audited commit](https://github.com/Retera/WarsmashModEngine/blob/f9e0aeed4be372d6016519d0e97b384aa873f374/README.md)

No published quantitative conformance study was found comparing Warsmash with retail Warcraft III for pathing, combat, ability resolution, or order execution across a controlled scenario suite. Fidelity for those systems is therefore unquantified here; isolated successful play and source implementation are not substitutes for differential traces. **N**

### Public headless experiments do not change the decision

A 2022 Hive request proposed using Warsmash headlessly for machine learning. A project contributor replied that Warsmash was probably unsuitable and nowhere near complete at the time. **D**

Source: [Hive “Warsmash Modding Engine” tool discussion](https://www.hiveworkshop.com/threads/tool-idea-warsmash-modding-engine.329299/)

In April 2026, a public issue described a private/local Warsmash fork used for a Dota-style last-hit RL environment. The author reported reset timeouts and an update-order bug that produced zero last hits until a local semantic change; the change then produced 25 last hits over five episodes and higher XP. No reproducible branch, pull request, environment code, or retail differential test was published. The author's public `AlphaDota` repository contains no implementation beyond repository scaffolding. **D**

Sources:

- [Warsmash issue #99](https://github.com/Retera/WarsmashModEngine/issues/99)
- [public AlphaDota repository](https://github.com/Diabolically-Handsome/AlphaDota)

This is evidence that determined researchers can drive a private fork without graphics. It is not evidence of an off-the-shelf harness, native-AI support, or retail-correct behavior. The reported “hero-first” update change itself demonstrates why differential fidelity tests are essential. **I**

## 2. Why the other open projects do not close the gap

### War3Net

War3Net is useful for Warcraft III file formats and libraries, but its roadmap marks the native JASS VM, C# natives, headless rendering, automated map testing and full emulation as future work. Its `Replay`, `Runtime`, and Runtime API packages are listed as “Coming soon.” It is not a runnable match simulator today. **P**

Source: [War3Net repository and roadmap](https://github.com/Drake53/War3Net)

### Open Realm

Open Realm describes a functional game implementation with basic Warcraft III features and ongoing support work for 1.29b assets. Its public status does not establish full `.w3x`, JASS, pathing, native-AI, replay, or headless compatibility for a Reforged 2.00 map. **P + N**

Source: [Open Realm repository](https://github.com/corepunch/open-realm)

### WC3CE, SharpCraft, and memory hooks

Warcraft III Community Edition is a launcher/platform around legacy Warcraft III 1.29.2, not an independent simulator. SharpCraft injects managed code into an older Windows Warcraft III client through EasyHook. MemHackAPI deliberately exposes process memory through the JASS VM and is inherently patch-specific. These may inspire instrumentation, but none gives a safe, portable, headless game core. **P + I**

Sources:

- [Warcraft III Community Edition](https://www.hiveworkshop.com/threads/warcraft-iii-community-edition.346600/)
- [SharpCraft repository](https://github.com/ChiefOfGxBxL/SharpCraft)
- [SharpCraft project thread](https://www.hiveworkshop.com/threads/sharpcraft-a-managed-replacement-for-reinventing-the-craft.244317/)
- [MemHackAPI repository](https://github.com/UnryzeC/MemHackAPI)

Old ReplaySeeker accelerated playback of an already-recorded replay; it did not generate a new match outcome from an AI policy. **P**

Source: [ReplaySeeker project page](https://www.hiveworkshop.com/threads/replay-seeker.294044/)

### Transferable research projects

Deep Line Wars built a separate simulator inspired by a Warcraft III line-wars map. It is valuable evidence for reinforcement-learning environment structure, but it does not execute Warcraft III maps or natives. PySC2 and BWAPI likewise illustrate successful observation/action APIs, repeatable stepping and evaluation protocols in other engines; they do not supply Warcraft III compatibility. **P**

Sources:

- [Deep Line Wars paper](https://arxiv.org/abs/1712.06180)
- [Deep Line Wars code](https://github.com/cair/deep-line-wars)
- [PySC2](https://github.com/google-deepmind/pysc2)
- [BWAPI](https://bwapi.github.io/)

There is no single documented historical reason why Warcraft III never acquired a BWAPI equivalent. The likely combination—map-side JASS/AI APIs reducing early demand, patch and asset fragmentation, client-hook fragility, and the absence of an official stable external interface—is an inference from the project record, not a sourced causal history. **I**

## 3. What retail automation can and cannot do

The retail client can be launched directly into a map with `-launch -loadfile`, and replay files can be opened with `-loadfile`. These are client launches, not a dedicated/headless simulation mode. Public current crash reports still show the replay command line in use. **P**

Sources:

- [map launch command discussion](https://www.hiveworkshop.com/threads/how-to-launch-map-test-with-command-line.326160/)
- [Blizzard forum replay launch instructions](https://us.forums.blizzard.com/en/warcraft3/t/how-to-watch-replays-in-reforged/10698)
- [current replay crash report showing the command](https://us.forums.blizzard.com/en/warcraft3/t/watching-a-replay-causes-a-total-crash/36778)
- [offline map testing still launching the client](https://us.forums.blizzard.com/en/warcraft3/t/offline-map-testing/25362)

No supported dedicated simulation or official headless mode was found. This means no documented supported mode was located; it does not prove that no private or undocumented flag exists. Treat windowed/minimized execution, a virtual desktop, or a Windows VM as operational isolation only. Do not assume that minimizing changes timing, frame pacing or input delivery harmlessly until measured. **N + I**

No current, publicly documented Reforged map-testing or tournament-automation stack was found that launches unattended AI-only matches, fast-forwards them, exports authoritative custom-map outcomes, and is reproducible from published code. The public material found documents direct client launches and replay opening, not that complete pipeline. **N**

A credible runner should:

1. copy a versioned test map into a deterministic location;
2. launch the real client with a run ID and seed encoded in map-visible configuration;
3. let the map self-start, assign every faction as intended, and emit a `run_started` event;
4. enforce wall-clock and in-game timeouts;
5. wait for an explicit `run_finished` event, not screen pixels;
6. close the client cleanly when possible and kill only the exact validated process on timeout;
7. archive the replay, telemetry, client/map build hashes, seed, timestamps, exit status, and crash logs;
8. retry infrastructure failures separately from gameplay losses.

The design should initially assume one active match per Windows client/VM. Higher concurrency is a later empirical optimization because client focus, GPU, audio, patcher/login state, file collisions and replay naming can all couple supposedly independent runs. **I**

## 4. Why raw `.w3g` is not an outcome log

The reverse-engineered replay-format description states that a Warcraft III replay records user input and explicitly does not contain computer actions, training completion, fight results, or unit deaths. Order actions may contain target coordinates and object identifiers, but an order can be replaced before execution; the recorded request is not authoritative world state. **P**

Source: [Warcraft III replay format description](https://gist.github.com/ForNeVeR/48dfcf05626abb70b35b8646dd0d6e92)

That creates two failures for this project:

- in an all-computer match, the interesting AI orders may not be represented at all;
- even for a human order, the replay does not directly reveal whether a unit arrived, a gate opened, a city changed hands, a transport unloaded, or a hero died.

A community replay-analysis answer describes the same boundary: a replay is an action schedule, while gold and other outcome state must be reproduced by simulating the map; even “winner” can be map-specific. **D**

Source: [Hive replay-state extraction discussion](https://www.hiveworkshop.com/threads/extracting-game-state-information-from-replays.252191/)

Therefore “parse the replay after every AI-only match” is not an evaluation system unless the map records its own authoritative events or a faithful engine re-simulates the game. The latter is exactly what is unavailable. **I**

## 5. Recommended telemetry layer

### Use event telemetry, not video or dense snapshots

W3MMD is an established convention for a map to place structured player variables, events and winner/loser metadata into the replay through synchronized game-cache messages. Current Warcraft III statistics tooling still documents W3MMD support. **P**

Sources:

- [W3MMD specification](https://github.com/PBug90/w3gPlus/blob/master/W3MMD.spec)
- [wc3stats W3MMD overview](https://wc3stats.com/docs/about)
- [wc3stats integration guide](https://wc3stats.com/docs/w3mmd)

However, the reference `MapMetaDataLibrary.vjass` elects an emitter only from playing slots whose controller is `MAP_CONTROL_USER`, and its standard player flags likewise require user-controlled players. The proposed map sets every AI slot to `MAP_CONTROL_COMPUTER`. A stock W3MMD integration may therefore emit nothing in an all-computer local match. This must be smoke-tested before W3MMD is selected as the sole channel. **P + I**

Source: [reference W3MMD emitter implementation](https://github.com/PBug90/w3gPlus/blob/master/vjass/MapMetaDataLibrary.vjass)

Two controlled designs are plausible:

- keep a dedicated local observer slot as a user and extend the old 12-slot library where necessary; or
- fork the emitter locally so the executing client is elected even when the relevant faction slots are computer-controlled, then use custom events rather than user-only player flags.

Neither workaround is treated as proven here. The gate is a five-minute all-computer smoke match whose parsed replay contains a known start event, counter value and end event. If synchronized cache messages are absent, use a local file/log channel available to the test environment, while keeping the same event schema. **I**

### Minimum event schema

| Event | Required fields | What it answers |
|---|---|---|
| `run_started` | run ID, map hash, AI hash, engine build, seed/config | Reproducibility |
| `objective_chosen` | time, faction, army/captain ID, objective ID, score components | Decision quality |
| `army_exit` | time, army ID, origin city/region, unit/value counts | “Did it leave the city?” |
| `region_entered` | time, army ID, region/crossing ID, surviving value | Route progress |
| `objective_progress` | time, objective ID, distance band, defenders, gate state/damage | Stall detection |
| `control_changed` | time, point/city, old owner, new owner, income/supply effect | Territory score |
| `gate_changed` | time, gate ID, owner/state/health, breaching army | Gate semantics |
| `embark` / `disembark` | time, army, ports/regions, cargo value, losses | Naval utility |
| `alliance_changed` | time, parties, state/expiry | Temporary diplomacy |
| `hero_died` | time, faction, hero, region, cause if known | Permanent-loss penalty |
| `run_finished` | reason, winner/loser flags, capitals, territory, army values | Authoritative result |

Emit on meaningful state transitions rather than every game tick. Add a monotonically increasing sequence number and a compact checksum so truncation or duplicate extraction is detectable. Keep decision inputs or score components when possible; a final win/loss alone cannot diagnose a broken target selector. **I**

### Parser choice

`w3gjs` is a current TypeScript replay parser with a high-level melee parser and a low-level `ReplayParser` that emits game-data blocks. It is a reasonable extraction base, but custom metadata support must be verified against the chosen W3MMD/event encoding rather than assumed. LadyRisa's replay tool explicitly exposes custom `0x6B` game-cache data in its debug action output, which is useful as an independent validation oracle. **P + I**

Sources:

- [`w3gjs`](https://github.com/PBug90/w3gjs)
- [LadyRisa replay-tool changelog](https://replaytool.warcraft3.org/en%3Achangelog)

## 6. An RL/Gym-style API: feasible shape, wrong first milestone

If a faithful simulator eventually exists, expose a conventional boundary:

```text
reset(seed, scenario, ai_build) -> observation
step(action_or_ticks) -> observation, reward, terminated, truncated, info
```

For autonomous `.ai` evaluation, `action_or_ticks` is usually “advance N ticks”; the policy is inside the Warcraft AI VM. `observation` should contain only test-authorized state, while `info` may contain privileged diagnostics. Rewards should be derived from sparse game events and kept separate from the terminal win metric to avoid training on instrumentation artifacts. **I**

Required engineering layers would be:

1. deterministic asset and map loader for the target Reforged build;
2. gameplay-correct headless terrain/pathing/render-controller substitute;
3. missing native AI script loader, scheduler, queues, captains and order natives;
4. deterministic reset and seed control;
5. observations, action/tick boundary and terminal conditions;
6. differential tests against retail for pathing, combat, gates, transport, triggers and AI-native timing;
7. process isolation for leaks, hangs and non-determinism.

The native-AI layer is the critical path. A Gym facade before that layer would create a clean API around the wrong program. **I**

## 7. Staged implementation and acceptance gates

### Stage A — retail-faithful regression runner

**Deliverable:** 20 unattended sequential matches that produce complete, parseable event logs and correctly distinguish a game result from a runner failure.

Acceptance gates:

- all-computer telemetry smoke test passes;
- two identical seeds/builds either reproduce or quantify irreducible divergence;
- timeout, crash, no-start, no-finish and truncated-replay cases are classified separately;
- a human spot-check of five replays agrees with parsed city, gate, hero and winner events;
- map and AI hashes are attached to every record.

### Stage B — policy tournament and regression suite

**Deliverable:** a matrix of baseline/candidate AI builds across factions, seeds and scenarios with confidence intervals, not just aggregate win rate.

Track objective completion time, control-point time integral, capital/gate progress, field-army survival, hero deaths, transport success, stalls, runtime failure rate and terminal outcome. Pair candidates on the same seeds and sides. Preserve every raw artifact behind a summary row. **I**

### Stage C — only if throughput is the bottleneck

Run a Warsmash feasibility spike with one narrow criterion: load the target map, execute one representative AI script through the required native-AI calls, and match a small retail trace within specified tolerances. Stop if the native semantics or Reforged data cannot be calibrated without effectively rebuilding the game. **I**

## 8. Planning estimates

These are engineering estimates, not sourced project commitments. They assume access to a stable map build, a Windows Warcraft III installation and someone able to edit/test the map. **I**

| Work item | Estimate | Main uncertainty |
|---|---:|---|
| Define telemetry, integrate it, and build a first parser | 3–7 engineer-days | W3MMD behavior in all-computer local matches |
| Smoke-test event transport and replay lifecycle | 1–3 days | Replay flush/closure and emitter selection |
| Build sequential Windows launch/timeout/archive runner | 3–10 days | Login/patcher/client state and robust shutdown |
| Harden runner across crashes and client updates | 1–3 weeks | Environmental flakiness |
| Warsmash proof of concept for map load plus one outcome trace | 2–6 weeks | Reforged compatibility and map-native gaps |
| Faithful Warsmash native-AI subsystem and production runner | Multi-month / indeterminate | Undocumented retail semantics and differential calibration |

Do not approve the multi-month branch from estimates alone. Approve only a bounded spike with explicit conformance tests and a stop rule.

## Final recommendation

- **Now:** build the retail-client, self-running-map, event-telemetry pipeline.
- **Do not rely on:** raw AI-only `.w3g` files as authoritative outcome records.
- **Do not describe Warsmash as nearly ready:** the required native AI VM and `common.ai` layer are absent in the audited upstream tree.
- **Keep Warsmash on the research path:** it has a tickable core and offers the clearest open starting point if retail throughput becomes unacceptable.
- **Treat every non-retail simulator as a different engine until calibrated:** compare event traces for pathing, gates, transport, combat and native-AI timing before trusting its scores.
- **Prefer sparse semantic events over pixels:** they make failures auditable, keep replay artifacts compact, and support both regression testing and later learning experiments.

## Audit scope and limitations

The Warsmash conclusions are tied to upstream commit `f9e0aeed4be372d6016519d0e97b384aa873f374`, inspected on 2026-08-10. Exact-symbol searches covered the full checked-out source tree. Public searches covered the named engines, headless/AI/ML issues, retail launch modes, replay formats and metadata parsers. Private forks, Discord discussions and unpublished engine code may exist. No claim here treats a private experiment as reproducible without public code and a retail comparison.
