# Brief 2 — Driving Warcraft III's engine AI from a custom, non-melee map

**Research date:** 2026-08-10  
**Scope:** `.ai` programs started through `StartMeleeAI`/`StartCampaignAI` on custom maps, with emphasis on separating VM launch conditions from the later assumptions of build, captain, and assault routines.  
**Short answer:** the computer-controller requirement is documented in World Editor help and repeated in shipped melee bootstrap code. A custom/non-melee map is supported: the editor itself tells authors to import the `.ai` and start it from map triggers. There is no `SetPlayerAIScript`, no `.w3i` AI-filename field, and no magic filename; `"map.ai"` is only the GUI action's placeholder default.

## Evidence labels

- **DOCUMENTED** — explicit in a Blizzard-shipped script or World Editor UI/help artifact, or a named technical document. Community documentation is identified as such.
- **CODE-INFERRED** — direct source/archive inspection, including parsed real map metadata.
- **EXPERIMENTAL** — a named runtime test or demonstrably working published map/script.
- **FOLKLORE** — an assertion without a reproducible artifact or specific test.
- **UNKNOWN** — no source/test adequate to decide.

## Executive findings

1. **[DOCUMENTED]** World Editor's own help for both “Start Melee AI Script” and “Start Campaign AI Script” says the action should only be used for computer-controlled player slots and advises Fixed Player Settings. This is the clearest published statement of `MAP_CONTROL_COMPUTER` as a precondition.
2. **[EXPERIMENTAL]** The Fall of Rome S9 probe adds the missing dynamic result: changing an already configured user controller to `MAP_CONTROL_COMPUTER` immediately before `Start*AI` is sufficient on 1.36/2.0. No earlier write-up of that exact workaround was found.
3. **[DOCUMENTED + CODE-INFERRED]** Non-melee status is not a blocker. World Editor explicitly instructs authors of custom maps to import the AI and use Test Map; WoWR is a real `isMeleeMap=false` open-world RPG/strategy map with 39 custom `.ai` files and runtime `StartCampaignAI` calls.
4. **[CODE-INFERRED]** Assignment is explicit and path-based: `StartMeleeAI(player, scriptPath)` or `StartCampaignAI(player, scriptPath)`. `CommandAI` sends integer data to an already running AI; it does not assign a script. The `.w3i` stores controller/race/start-position metadata but no AI filename.
5. **[DOCUMENTED + EXPERIMENTAL]** Map→AI has an official integer-pair stack (`CommandAI` → `CommandsWaiting`/`GetLastCommand`/`GetLastData`/`PopLastCommand`). There is no symmetric AI→map command queue. Demonstrated reverse channels encode state on shared game objects, most conservatively `SetUnitUserData`/`GetUnitUserData`.
6. **[DOCUMENTED + CODE-INFERRED]** Hybrid trigger/engine AI is viable, but ownership must be explicit. World Editor provides `RemoveGuardPosition` to exclude a preplaced non-hero/non-worker unit from AI use/replacement; `PauseCompAI` can stop the player's engine AI for a scripted phase. Concurrent trigger and captain orders to the same unit are an order race, not a co-ownership protocol.

## 1. Is the `MAP_CONTROL_COMPUTER` requirement documented?

### 1.1 Shipped documentation

**[DOCUMENTED — Blizzard-shipped World Editor help]** The localized TriggerStrings artifact contains the same hint for both actions:

> This should only only be used for computer-controlled player slots. When using this action, it is advised that you enable the 'Fixed Player Settings' force property.

The exact entries are `StartMeleeAIHint` at line 367 and `StartCampaignAIHint` at line 371 of the [mirrored `War3xLocal/UI/TriggerStrings.txt`](https://github.com/tdauth/wowr/blob/1ad4c97648eaef97cd3a01bb784633f4de562834/wc3/War3xLocal/UI/TriggerStrings.txt#L365-L371). The duplicated “only” is in the shipped string.

**[CODE-INFERRED from Blizzard-shipped script]** Stock [`Blizzard.j::MeleeStartingAI`](https://github.com/tdauth/wowr/blob/1ad4c97648eaef97cd3a01bb784633f4de562834/wc3/reforged/Scripts/Blizzard.j#L9055-L9085) checks `PLAYER_SLOT_STATE_PLAYING`, then `GetPlayerController(indexPlayer) == MAP_CONTROL_COMPUTER`, before selecting `human.ai`, `orc.ai`, `undead.ai`, or `elf.ai` and calling `StartMeleeAI`. This proves the generated melee bootstrap gate. It does not expose the native's internal code, but it agrees with the help text and runtime behavior.

### 1.2 Community and project tests

**[EXPERIMENTAL]** In a 2018 thread, starting `"map.ai"` for an empty/non-computer slot produced no behavior. Dr Super Good states that only computer-controlled slots can run an AI script. See [Giving empty slots Computer AI](https://www.hiveworkshop.com/threads/giving-empty-slots-computer-ai.306426/), especially posts #4 and #8–#10. The thread did not test dynamically changing the controller and also used a placeholder/missing script path, so it is corroboration, not a clean single-variable experiment.

**[EXPERIMENTAL — Fall of Rome S9, 1.36/2.0]** The supplied project probe is the cleanest evidence for the *dynamic workaround*: the same custom non-melee map and `.ai` stay silent with a `MAP_CONTROL_USER` controller, then run after `SetPlayerController(player, MAP_CONTROL_COMPUTER)` immediately before `Start*AI`. This is consistent with the shipped hint and extends it beyond lobby configuration.

**[UNKNOWN / negative search]** No older official document or community post was found that explicitly writes up the exact sequence “change a user-configured slot at runtime with `SetPlayerController`, then call `StartMeleeAI`/`StartCampaignAI`.” The broad computer-slot rule was documented; the dynamic conversion appears under-documented and may be a novel project finding.

## 2. What other preconditions exist?

The key distinction is between (A) launching a valid AI program, and (B) giving a particular stock subsystem enough state to do useful work.

### 2.1 Launch and subsystem matrix

| Candidate precondition | Needed to launch the AI VM? | Needed by later AI behavior? | Evidence and conclusion |
|---|---:|---:|---|
| Player controller is `MAP_CONTROL_COMPUTER` | **Yes, strongly supported** | Yes | **DOCUMENTED + EXPERIMENTAL.** World Editor hint, stock bootstrap gate, 2018 observation, and Fall of Rome S9 agree. |
| Slot is in `PLAYER_SLOT_STATE_PLAYING` | **UNKNOWN for a direct `Start*AI` call** | Usually | **CODE-INFERRED.** `MeleeStartingAI` filters for `PLAYING`, but this is its wrapper logic. No isolated direct-native test on an otherwise valid non-playing computer slot was found. |
| Script exists at exact archive/game path | **Yes** | Yes | **DOCUMENTED + EXPERIMENTAL.** World Editor has `Unable to open AI script '%s'` in its AI-test UI; published workflows import `.ai` and pass `war3mapImported\...` or a root/custom path. The in-game direct native generally fails silently instead of returning an error. |
| Syntactically valid `.ai` with `main` | **Yes** | Yes | **DOCUMENTED + EXPERIMENTAL.** The AI program needs an entry function; invalid/crashed programs are reported to go silent. Keep `main` alive if it must continue servicing commands. |
| Map is marked `isMeleeMap` | **No** | No | **DOCUMENTED + EXPERIMENTAL.** World Editor says custom maps should import the AI and use Test Map. The parsed current WoWR `.w3i` has `isMeleeMap=false` while its source starts 39 race AIs. |
| Town hall/main building | **No for VM launch** | **Sometimes for build/captain routines** | **EXPERIMENTAL.** Fall of Rome S9 starts with no town hall. However, JASS Campaign AI 2.0 reports freezes when captain attack commands run with no structures and v2.2 guards captain calls until a building exists. Treat a building anchor as a captain-safety precondition until each routine is probed, not as a VM-launch gate. [Known issue](https://www.hiveworkshop.com/threads/jass-campaign-ai-2-0.334624/). |
| Gold mine | **No** | Stock melee economy normally expects one | **EXPERIMENTAL.** S9 launches without one. Build/economy routines may wait forever or fail to expand if their expected mine/town topology is absent. |
| Worker/peon | **No** | Required for stock construction/harvesting | **EXPERIMENTAL + CODE-INFERRED.** S9 launches without workers. Stock `StandardAI` starts a peon thread and build logic whose useful progress naturally needs eligible workers. |
| Hero | **No** | Only hero-specific routines need one | **CODE-INFERRED + EXPERIMENTAL map source.** WoWR calls `StartCampaignAI` after creating the hall/workers and creates configured heroes later in `EnumStartLobbySettings`: [`WoWReforgedComputer.j` lines 305–321](https://github.com/tdauth/wowr/blob/1ad4c97648eaef97cd3a01bb784633f4de562834/src/wowr/WoWReforgedComputer.j#L305-L321) and [lines 672–752](https://github.com/tdauth/wowr/blob/1ad4c97648eaef97cd3a01bb784633f4de562834/src/wowr/WoWReforgedComputer.j#L672-L752). |
| `DefineStartLocation` / `SetPlayerStartLocation` | **UNKNOWN as a raw launch gate** | Often used by melee build/defense logic | No isolated test without any start location was found. Neither stock `StandardAI` nor `CampaignAI` has an explicit script-level guard, but engine natives may consult start-location state. Do not infer “required” or “irrelevant” without a controlled probe. |
| Player race | **No evidence of a raw VM gate** | Essential when auto-selecting stock race scripts and for correct tech/object IDs | **CODE-INFERRED.** `MeleeStartingAI` uses race to choose a stock filename. A custom script passed explicitly can initialize independently, but its object IDs/build plan must match the actual faction. No isolated race-null launch test was found. |
| Player team/enemy relation | **No evidence of a launch gate** | Required for target selection and alliance logic | **CODE-INFERRED.** The VM can initialize without a useful enemy, but attack selection may have no target. No controlled no-team test was found. |
| Food-cap structure/minimum supply | **No** | Production needs enough player food cap or custom rules | **EXPERIMENTAL.** S9 has no supply structure yet starts. That does not mean `SetProduce` can train a food-using unit while capped. |
| Call `CreateCaptains` | No; it is AI behavior setup, not the loader | Required before captain operations | **DOCUMENTED from shipped code.** Stock [`StandardAI`](https://github.com/tdauth/wowr/blob/1ad4c97648eaef97cd3a01bb784633f4de562834/wc3/reforged/Scripts/common.ai#L783-L810) and [`CampaignAI`](https://github.com/tdauth/wowr/blob/1ad4c97648eaef97cd3a01bb784633f4de562834/wc3/reforged/Scripts/common.ai#L2402-L2443) call it as part of their own initialization. |

### 2.2 What stock code actually initializes

**[DOCUMENTED from shipped source]** `StandardAI` calls `InitAI`, `SetMeleeAI`, behavior flags, `CreateCaptains`, hero-level setup, then starts peon and attack threads. `CampaignAI` sets difficulty flags, calls `InitAI`, `InitBuildArray`, `InitAssaultGroup`, `CreateCaptains`, campaign flags, then starts `CampaignBasics` and the build loop. Neither function takes a town hall, hero, start location, team, or map flag as a parameter. That is evidence against a *script-level* gate, but internal natives can still consult game state.

**[EXPERIMENTAL warning]** JASS Campaign AI 2.0's maintainer reports that captain attack calls can freeze when the AI owns no structures and labels a building necessary for those captain routines. The project's S9 result proves that initialization/output can happen without a structure. Architecture should therefore use a two-stage readiness test: `VM_READY` first, `CAPTAIN_READY` only after an anchor building or an explicit no-building captain probe succeeds.

**[EXPERIMENTAL, version-specific incompatibility]** A 2025 Reforged bug report provides test maps where `SuicideOnPlayer()` crashes on maps with a dimension of at least 256, works after reducing 256×192 to 224×192, works on patch 1.31, and can be avoided with `SuicideOnPoint()`. See [AI scripts on maps larger than 224 crash the game](https://us.forums.blizzard.com/en/warcraft3/t/ai-scripts-on-maps-larger-than-224-crash-the-game/35118). This is not a launch precondition, but it is a material custom-map compatibility constraint.

## 3. Demonstrable custom/non-melee maps with working `.ai`

### 3.1 Strong examples

| Map/project | Why it qualifies | Exact implementation evidence | Evidence class |
|---|---|---|---|
| **World of Warcraft Reforged (WoWR)** | Public open-world RPG/strategy custom map; parsed `war3map.w3i` has `isMeleeMap=false`. | Repository [README Computer AI section](https://github.com/tdauth/wowr/tree/1ad4c97648eaef97cd3a01bb784633f4de562834#computer-ai) says it uses Warcraft's AI. The map folder has 39 `wowr/*.ai` scripts plus a custom `Scripts/common.ai`. `StartingUnitsAndPickAIStandard` calls `StartCampaignAI(whichPlayer, GetRaceAIScript(whichRace))` at [`WoWReforgedComputer.j` lines 305–321](https://github.com/tdauth/wowr/blob/1ad4c97648eaef97cd3a01bb784633f4de562834/src/wowr/WoWReforgedComputer.j#L305-L321); race setup binds paths such as `wowr\Freelancer.ai`, `wowr\Human.ai`, and 37 more in [`WoWReforgedRaces.j`](https://github.com/tdauth/wowr/blob/1ad4c97648eaef97cd3a01bb784633f4de562834/src/wowr/WoWReforgedRaces.j#L990-L1080). It later sends `CommandAI` behavior/difficulty commands at [`WoWReforgedComputer.j` lines 779–799](https://github.com/tdauth/wowr/blob/1ad4c97648eaef97cd3a01bb784633f4de562834/src/wowr/WoWReforgedComputer.j#L779-L799). | **CODE-INFERRED + published working project** |
| **Warcraft 3 Re-Reforged: Exodus of the Horde** | Approved, released custom single-player campaign, not a melee map. | The [project release](https://www.hiveworkshop.com/threads/warcraft-3-re-reforged-exodus-of-the-horde.323114/) advertises new AI scripts. More importantly, the author's [JASS Campaign AI 2.0](https://www.hiveworkshop.com/threads/jass-campaign-ai-2-0.334624/) publishes working source examples from chapter 3's **Kul Tiras Human AI** and chapter 5's **Underworld Minions AI**, including build orders, attack coordinates, and `CommandAI`-driven target switches. | **EXPERIMENTAL + source-published** |

### 3.2 Additional proof artifact and known map

**[EXPERIMENTAL, custom altered-melee rather than a non-melee campaign]** MyScorpion42's 2026 [heroes.w3x](https://www.hiveworkshop.com/attachments/heroes-w3x.575596/) is a compact reproducible map. Direct MPQ inspection found:

- `war3map.j` line 101: `StartMeleeAI(Player(1), "war3mapImported\\heroes.ai")`;
- `war3map.j` line 140: Player 1 is `MAP_CONTROL_COMPUTER`;
- imported `war3mapImported\heroes.ai`, 102,371 bytes, `main` at line 2438;
- AI-side `CreateUnit` and `SetUnitUserData` calls.

The thread states patch 1.30b and supplies screenshots/tests. It proves substantial `common.j` use in a custom AI artifact, but its author labels it **Altered Melee**, so it should not be counted as the strongest answer to “non-melee map.” Archive SHA-256: `6c3155957ee77aed6a924e4f497664b63fe2f6541d3a8c0ef4da096fe70404c6`.

**[DOCUMENTED listing; internal mechanism UNKNOWN in this research run]** [Footmen Frenzy 9.0 AI](https://wc3maps.com/map/4058) has a public map listing and is a known custom-map example supplied by the brief. The attempted archive URL returned a 404 HTML response, and an EpicWar listing is unavailable, so its internal `.ai` path/call setup was **not** independently verified here. It is not used as proof for any engine rule.

## 4. How is an AI assigned, and when should it start?

### 4.1 Actual assignment API

**[DOCUMENTED from shipped declarations]** The relevant map-side natives are adjacent in `common.j`:

```jass
native StartMeleeAI    takes player num, string script returns nothing
native StartCampaignAI takes player num, string script returns nothing
native CommandAI       takes player num, integer command, integer data returns nothing
native PauseCompAI     takes player p, boolean pause returns nothing
```

See [Reforged `common.j` lines 3867–3875](https://github.com/tdauth/wowr/blob/1ad4c97648eaef97cd3a01bb784633f4de562834/wc3/reforged/Scripts/common.j#L3867-L3875).

**[UNKNOWN / negative code search]** There is no `SetPlayerAIScript` declaration in the acquired classic/Reforged `common.j`, `common.ai`, jassdoc, AMAI, WoWR, or WC3MapTranslator sources. Project functions with names such as `SetRaceAiScript` merely store a path string in a map variable; WoWR's implementation at [`WoWReforgedRaces.j` lines 517–560](https://github.com/tdauth/wowr/blob/1ad4c97648eaef97cd3a01bb784633f4de562834/src/wowr/WoWReforgedRaces.j#L517-L560) is a good example of this distinction.

**[CODE-INFERRED]** `war3map.w3i` has no AI-filename field. WC3MapTranslator's current map-info schema defines the `isMeleeMap` flag at [`InfoTranslator.ts` lines 28–52](https://github.com/ChiefOfGxBxL/WC3MapTranslator/blob/7d477ebb5cea445bee7915fe72cd93ee399252b7/src/translators/InfoTranslator.ts#L28-L52) and player fields (`playerNum`, type, race, name, starting position, priority flags) at [lines 110–128](https://github.com/ChiefOfGxBxL/WC3MapTranslator/blob/7d477ebb5cea445bee7915fe72cd93ee399252b7/src/translators/InfoTranslator.ts#L110-L128). The serializer writes those fields at [lines 364–380](https://github.com/ChiefOfGxBxL/WC3MapTranslator/blob/7d477ebb5cea445bee7915fe72cd93ee399252b7/src/translators/InfoTranslator.ts#L364-L380). It does not write an AI script path.

**[DOCUMENTED]** World Editor's AI Editor has a **test configuration** field “AI Script (for Custom only)” and a separate “Map File (Melee only).” That is editor test configuration, not the map's `.w3i` assignment. The editor warning says its Test AI feature only works with melee maps and explicitly recommends that custom-map authors import the AI with Import Manager and use Test Map. See the mirrored [`worldeditstrings.txt` lines 3190–3205 and 3897–3900](https://github.com/tdauth/wowr/blob/1ad4c97648eaef97cd3a01bb784633f4de562834/wc3/reforged/war3.w3mod/_locales/dede.w3mod/ui/worldeditstrings.txt#L3190-L3205).

### 4.2 The `"map.ai"` trap and path rules

**[DOCUMENTED from shipped TriggerData]** World Editor defines the GUI actions' defaults as:

- `_StartMeleeAI_Defaults=Player00,"map.ai"`
- `_StartCampaignAI_Defaults=Player00,"map.ai"`

See [`TriggerData.txt` lines 2558–2569](https://github.com/tdauth/wowr/blob/1ad4c97648eaef97cd3a01bb784633f4de562834/wc3/War3Patch%20German%201.26/UI/TriggerData.txt#L2558-L2569). Therefore `map.ai` is a **placeholder default**, not a filename convention and not automatic discovery.

**[DOCUMENTED + EXPERIMENTAL workflow]** The runtime argument is an archive/game-relative path. Published examples include stock root paths (`human.ai`), Import Manager paths (`war3mapImported\Gold Digger.ai` in [Creating AI workflow](https://www.hiveworkshop.com/threads/creating-ai-workflow.290101/)), and project folders (`wowr\Human.ai`). The `.ai` must exist at exactly the supplied path or as an intended game-script override. A `.wai` is the AI Editor project; `.ai` is the exported runtime JASS script, as described in the 2005 [Warcraft 3 AI Files](https://gamedev.net/forums/topic/331900-warcraft-3-ai-files/) discussion.

### 4.3 Recommended call order, with certainty boundaries

| Phase | Recommended action | Evidence status |
|---|---|---|
| `config()` / lobby configuration | Define players/teams/start locations as the map needs; set a bot slot's controller to `MAP_CONTROL_COMPUTER`. | **CODE-INFERRED.** Generated maps configure controllers here. Dynamic S9 proves it may also be changed later before start. |
| `main()` before AI start | Let generated map initialization create regions/units and call `InitBlizzard`; initialize globals/triggers that will receive AI signals. | **CODE-INFERRED best practice.** Published/generated examples start from Map Initialization after `InitBlizzard`. Calling `Start*AI` in `config()` was not found in a working artifact and is **UNKNOWN**. |
| Before `Start*AI` | Ensure controller is computer and the exact `.ai` path exists. Create the initial units/buildings that this particular AI's `main` assumes. | Controller/path are strong requirements. Units are behavior-specific, not VM-launch requirements. |
| Start | Call exactly one of `StartMeleeAI(p, path)` or `StartCampaignAI(p, path)`. | **DOCUMENTED.** The call returns `nothing`, so it is not an acknowledgement. Behavior of repeated starts for one player is **UNKNOWN**. |
| Readiness | Wait for an explicit AI heartbeat/ready indication before sending configuration commands. | **Architecture recommendation.** Stock `common.ai::WaitForSignal` polls command state, but a custom protocol is safer than a fixed delay. |
| Configure/run | Send `CommandAI` pairs; the AI drains the stack with `PopLastCommand`. Create late hero/cosmetic units whenever the specific AI supports it. | **DOCUMENTED + CODE-INFERRED.** WoWR starts AI before heroes and sends commands later. |

**[UNKNOWN]** There is no authoritative result for starting in `config()`, exact behavior before `InitBlizzard`, or calling `Start*AI` multiple times for one player. Avoid all three in production until isolated.

## 5. What can map and AI exchange?

### 5.1 Map → AI: official integer-pair stack

**[DOCUMENTED — contemporaneous JASS Manual plus shipped declarations]** The map calls `CommandAI(player, command, data)`. The target player's AI reads `CommandsWaiting()`, `GetLastCommand()`, and `GetLastData()`, then removes the top entry with `PopLastCommand()`. Globals are not shared between the map and AI programs. See [JASS Manual, Inter-Script Communication](https://jass.sourceforge.net/doc/library.shtml), lines 49–65, and [`common.ai` lines 135–138](https://github.com/tdauth/wowr/blob/1ad4c97648eaef97cd3a01bb784633f4de562834/wc3/reforged/Scripts/common.ai#L131-L140).

**[DOCUMENTED from shipped code]** Stock [`WaitForSignal`](https://github.com/tdauth/wowr/blob/1ad4c97648eaef97cd3a01bb784633f4de562834/wc3/reforged/Scripts/common.ai#L852-L883) sleeps while no command is waiting, reads the top command, pops it, and returns it.

**[EXPERIMENTAL community limit]** The 2017 [Intermediate AI concepts](https://www.hiveworkshop.com/threads/intermidiate-ai-concepts-boring-no-longer.294890/) tutorial reports a maximum of 12 queued commands and emphasizes LIFO behavior and mandatory popping. The LIFO semantics are documented by the old manual; the exact 12-entry limit was not found in a shipped comment or decompilation, so retain it as an experimental/community limit and design well below it.

### 5.2 AI → map: no symmetric queue; use shared observable state

**[UNKNOWN / negative API search]** No `CommandMap`, reverse command stack, or equivalent AI→map native exists in the acquired `common.j`/`common.ai` surfaces.

**[DOCUMENTED academic implementation]** Jonas Isberg's June 2004 Lund University master's thesis, [*Using Interactive Computer Games for AI Research — Case Study on WarCraft III*](https://fileadmin.cs.lth.se/ai/xj/JonasIsberg/thesis.pdf), describes this exact asymmetry on thesis page 17 (§3.3.2, Figure 3.2). Its Wumpus-world AI receives percepts through `CommandAI(command, data)` and writes its chosen action into the agent unit with `SetUnitUserData`; the map polls it with `GetUnitUserData`.

**[EXPERIMENTAL]** MyScorpion42 independently implemented a richer unit-proxy interface in 2026: the AI creates a unit, the map catches its enter-map event, and both sides encode data in the unit's observable properties. See [the experiment thread](https://www.hiveworkshop.com/threads/map-script-independent-jass-driven-ai-experiment.370776/), post #1. The inspected `heroes.ai` uses `SetUnitUserData`, corroborating the shared-object premise.

**[EXPERIMENTAL, not portable]** On patch 1.30b, the same author demonstrated AI-side `ExecuteFunc` invoking a map-script function. That contradicts the 2003 manual and is version-specific. It is useful research evidence, but a poor production bridge for 1.26–2.0 compatibility.

Recommended channel design:

- map→AI: small versioned `CommandAI` opcodes, sequence numbers in `data`, pop immediately;
- AI→map: one dedicated, map-known mailbox unit per AI, with `SetUnitUserData` for a compact status/sequence and map polling or a map-side unit event;
- bulk data: map-owned shared state encoded in known unit/player properties only after isolated cross-version tests;
- health: `READY`, heartbeat counter, last-command sequence, and fatal/stalled state should be observable without string conversion.

## 6. Trigger-heavy maps, conflicting orders, and co-ownership

### 6.1 Known interaction points

**[DOCUMENTED]** World Editor's `RemoveGuardPosition` help says: “This action tells the AI to neither use nor replace a given preplaced unit. This has no effect on Heroes and peon-type units.” See [`TriggerStrings.txt` lines 375–379](https://github.com/tdauth/wowr/blob/1ad4c97648eaef97cd3a01bb784633f4de562834/wc3/War3xLocal/UI/TriggerStrings.txt#L375-L379). The sibling `RemoveAllGuardPositions` and `RecycleGuardPosition` declarations are in [`common.j`](https://github.com/tdauth/wowr/blob/1ad4c97648eaef97cd3a01bb784633f4de562834/wc3/reforged/Scripts/common.j#L3870-L3875).

**[EXPERIMENTAL]** A 2019 author reports that “Ignore guard position” changed hard-coded focus/call-for-help behavior in a direct test. See [Attempting to make functioning AI](https://www.hiveworkshop.com/threads/attempting-to-make-functioning-ai.314372/), posts #17–#20. This confirms that guard state is behaviorally significant, but does not fully define captain assignment.

**[CODE-INFERRED]** AMAI contains 61 textual `RemoveGuardPosition(` occurrences across `.eai` files at the pinned revision; five are commented, leaving 56 executable call lines. That is strong evidence that mature AI integration manages guard ownership explicitly, not a dynamic invocation count or proof that every call has the same reason.

**[CODE-INFERRED]** If a trigger and a captain/AI loop both issue orders to one unit, the unit can execute only the currently active/queued engine orders; later reissued AI orders can overwrite trigger intent and vice versa. No official arbitration or lock primitive was found.

### 6.2 Accepted engineering pattern

1. **Exclusive unit responsibility.** Assign units to either engine AI or trigger micro for a phase. Avoid continuous dual control.
2. **Explicit handoff.** For eligible preplaced combat units, call `RemoveGuardPosition` before trigger ownership. Remember the shipped exception: it does nothing for heroes and peon-type units, which therefore need role/player partitioning or AI pause.
3. **Pause for scripted sequences.** Use the map-side `PauseCompAI(player, true)` during cutscenes or deterministic maneuvers, then resume. This is a declared interface; exact queue state across pause/resume should be tested for the target patch.
4. **Use commands for policy, not counter-orders.** Ask the AI to change attack target/mode through `CommandAI` rather than having triggers fight a captain every tick. WoWR is a working hybrid example: it uses engine build/attack AI, heavy map systems, and later `CommandAI` configuration.
5. **Partition by function.** A 2024 Footman Frenzy AI discussion recommends engine AI for basic build/attack and triggers for tavern selection, hero revival, upgrades, and bespoke behavior. See [Footman Frenzy AI](https://www.hiveworkshop.com/threads/footman-frenzy-ai.355289/), especially post #4. This is community practice, not an engine guarantee, but it matches the source-level constraints.
6. **Test geography-specific natives.** On very large Reforged maps, prefer coordinate/point attack primitives after reproducing the `SuicideOnPlayer` map-size crash; never assume a routine that works on 1.31 works on current Reforged.

**[UNKNOWN]** No canonical Blizzard co-ownership protocol was found. `RemoveGuardPosition`, `PauseCompAI`, command messaging, and exclusive subsets are the available mechanisms; a general simultaneous controller does not appear to exist.

## Architecture impact

1. **Make controller conversion an explicit bootstrap state.** `BOT_DISABLED → CONTROLLER_COMPUTER → AI_START_REQUESTED → VM_READY → CAPTAIN_READY`. Do not combine these into one boolean; the evidence shows that the VM can be alive while captain/build logic lacks prerequisites.
2. **Treat the `.ai` path as a packaged dependency.** Generate a manifest at build time, verify every `Start*AI` literal against the MPQ contents, and reject `"map.ai"` unless that file is intentionally present. This directly addresses the observed archive failure mode.
3. **Separate player metadata from AI assignment.** `.w3i` owns slot/controller/race/start metadata; the map script owns the runtime `Start*AI` call and path. Keep those two configuration layers auditable.
4. **Use a versioned, bounded command protocol.** Define opcodes, sequence/ack semantics, and overflow behavior. Keep the queue far below the reported 12-entry ceiling and coalesce state changes.
5. **Build a reverse mailbox on a unit, not on shared globals.** The 2004 thesis and 2026 map converge on the same portable pattern. Reserve one hidden/invulnerable mailbox unit, encode only integers initially, and have the map own timeout/recovery.
6. **Model exclusive responsibility, with enforcement limits.** Store `owner = ENGINE_AI | TRIGGER | CINEMATIC` in map-side state so trigger code has one authority. This is not a literal engine-enforced handle lease: captains select eligible units by type/count, and `RemoveGuardPosition` covers only eligible preplaced non-Hero/non-peon units. Handoff can use guard removal for those units; trained units require type/player partitioning or whole-AI `PauseCompAI` during the phase. Release performs the inverse where supported. This makes the order race explicit without promising an unavailable per-handle lock.
7. **Version-gate captain/geography routines.** A map-size-specific Reforged crash and no-building captain freezes justify per-patch probes and fallbacks (`SuicideOnPoint`, trigger-issued movement, or a dummy/anchor building where design allows).

## Explicit negative searches and remaining unknowns

- **[UNKNOWN]** No earlier source was found for the exact dynamic sequence `SetPlayerController(..., MAP_CONTROL_COMPUTER)` immediately followed by `Start*AI`. The general computer-slot requirement is documented; the runtime conversion result comes from Fall of Rome S9.
- **[UNKNOWN]** Direct `Start*AI` behavior for a non-`PLAYING` but computer-controlled slot was not isolated. The stock `MeleeStartingAI` wrapper filters such slots.
- **[UNKNOWN]** No `SetPlayerAIScript` native or function was found in shipped APIs; no `.w3i` AI-filename field was found in the current parser/schema.
- **[UNKNOWN]** No filename auto-discovery convention was found. `map.ai` is demonstrably a GUI default placeholder.
- **[UNKNOWN]** Starting from `config()`, starting before `InitBlizzard`, and repeated `Start*AI` calls on one player were not established by an authoritative source or working artifact.
- **[UNKNOWN]** A controlled “no `DefineStartLocation` anywhere” launch test was not found. Do not turn absence of a script parameter into a native-runtime claim.
- **[UNKNOWN]** No evidence was found that town hall, hero, mine, worker, team, race, or food structure is a *VM launch* gate; the strongest negative tests cover town hall/mine/worker and hero timing. Several remain essential to specific stock behaviors.
- **[UNKNOWN]** No official/symmetric AI→map queue was found. `ExecuteFunc` is contradictory/version-specific; the unit mailbox is the demonstrated portable design.
- **[UNKNOWN]** No official general co-ownership/arbitration protocol was found.
- **Negative artifact result:** the Footmen Frenzy 9.0 AI listing was verified, but its archive could not be downloaded from the attempted endpoint, so its internal use of engine `.ai` rather than trigger AI remains unverified in this run.
- **Negative search scope:** searches covered Blizzard-mirrored `common.j`, `common.ai`, `Blizzard.j`, TriggerData/TriggerStrings/WorldEditStrings, AMAI, WoWR, jassdoc, WC3MapTranslator, Hive AI/JASS forums, the Wc3C archive, TheHelper, public campaign-AI resources, and map listings. No stronger primary artifacts resolved the unknown cells above.

## Reproducible artifact register

- WoWR inspected at commit `1ad4c97648eaef97cd3a01bb784633f4de562834`: [repository](https://github.com/tdauth/wowr/tree/1ad4c97648eaef97cd3a01bb784633f4de562834). Its `wowr.w3x/war3map.w3i` blob is Git object `38296c642cedb8d5d61529d38992ffb568471fc7`, local SHA-256 `13d2317cf18cc6e7d4dcab6be6008a2e2d0a0e56612cbb3413bc27694def6795`. Parsing with WC3MapTranslator 5.0.0 produced `isMeleeMap=false`, `fixedPlayerSetting=true`, and a configured computer player.
- WC3MapTranslator source inspected at commit `7d477ebb5cea445bee7915fe72cd93ee399252b7`: [repository](https://github.com/ChiefOfGxBxL/WC3MapTranslator/tree/7d477ebb5cea445bee7915fe72cd93ee399252b7).
- `heroes.w3x` direct download and MPQ inspection: SHA-256 `6c3155957ee77aed6a924e4f497664b63fe2f6541d3a8c0ef4da096fe70404c6`.
- Lund thesis downloaded from the university host: 51-page PDF, title *Using Interactive Computer Games for AI Research — Case Study on WarCraft III*, Jonas Isberg, June 2004; relevant design diagram is printed thesis page 17.

## Bottom line for implementation

The reliable custom-map bootstrap is: configure or dynamically switch the slot to `MAP_CONTROL_COMPUTER`; initialize the map; start one exact, packaged `.ai` path from `main()`/Map Initialization; wait for a ready signal; then use bounded `CommandAI` messages. Add buildings/workers/heroes only when the chosen behavior routines need them. For AI→map and liveness, use a dedicated shared unit mailbox. Keep trigger and engine AI ownership of combat units mutually exclusive by phase.
