# Brief 1 — What actually works inside the Warcraft III AI VM

**Research date:** 2026-08-10  
**Scope:** classic Warcraft III 1.26–1.31 and Reforged/current-era builds, with exact runtime behavior reported only for the versions actually tested by a source.  
**Short answer:** an AI script is compiled from `common.j`, `common.ai`, and the user `.ai`, but the declarations are not a runtime compatibility guarantee. No complete, credible `common.j`-inside-AI-VM native table or AI-native registration decompilation was found. The safe engineering model is a small, version-tested allowlist.

## Evidence labels

- **DOCUMENTED** — stated explicitly in a shipped Blizzard script/UI-help artifact or in a named technical manual. Jeff Pang's 2003 JASS Manual is contemporaneous community documentation, not official Blizzard documentation; this is stated whenever it matters.
- **CODE-INFERRED** — inferred from direct source or archive inspection. Long-lived use by AMAI is strong field evidence, but not the same as an isolated runtime test.
- **EXPERIMENTAL** — a named author provides a runtime test, test map, or reproducible observation. The exact patch is retained.
- **FOLKLORE** — community assertion without a reproducible artifact or sufficiently specific test.
- **UNKNOWN** — the searches did not find evidence adequate to decide the claim.

These labels describe the *kind* of evidence, not an automatic confidence ranking. A shipped declaration proves that a symbol is declared; it does not prove that the AI VM implements the symbol correctly.

## Executive findings

1. **[DOCUMENTED + EXPERIMENTAL]** The AI program consists of `common.j`, `common.ai`, and the user `.ai`; `Blizzard.j` is not part of it. `common.j` declarations therefore compile, but multiple runtime tests show that some calls return corrupt/empty data, terminate the AI thread, or crash the game. [JASS Manual, Global Declarations](https://jass.sourceforge.net/doc/globals.shtml), especially lines 8–11 in the rendered page; [2010 debugging test](https://www.hiveworkshop.com/threads/how-to-debug-ai.158210/).
2. **[UNKNOWN]** No exhaustive implementation list was found. The closest old document explicitly calls itself incomplete and gives only problem categories; the closest 2026 effort is a useful patch-1.30b experiment, not a full matrix. There is also no published `Game.dll` AI-VM native-registration table in the sources searched.
3. **[EXPERIMENTAL]** `I2S` is conclusively unsafe, but its exact failure mode is version/context dependent: empty string in 2010 and 2023 reports (and the Fall of Rome 1.36/2.0 S9 probe), AI/map crash in other reports including patch 1.30b. It must not be used as a portable AI-VM conversion.
4. **[CODE-INFERRED]** `DisplayTimedTextToPlayer`, `GetPlayerState`, `GetUnitTypeId`, `StringHash`, `StringLength`, `S2R`, and callback-free group iteration occur in the current AMAI source. This is strong real-project evidence, but isolated per-native tests were not found for every one of them.
5. **[DOCUMENTED]** The AI runtime is cooperative: one main thread and up to five `StartThread` threads per AI player, with `Sleep` yielding. The old manual says slots are not recycled. Runtime faults commonly terminate a thread without an in-game diagnostic; some bad natives crash the whole game.
6. **[CODE-INFERRED]** Stock `common.ai` is extraordinarily stable. Mirrored Blizzard artifacts for 1.27.1 and 1.29.2 are byte-identical; 1.31 is the same ignoring whitespace; the Reforged copy adds four object-ID constants and no behavior. An authenticated launch-version ROC 1.00 copy was not obtained.
7. **[DOCUMENTED]** `RemoveGuardPosition`, `RecycleGuardPosition`, and `RemoveAllGuardPositions` were never supposed to be in `common.ai`: they are map-to-AI interface natives in `common.j`, including classic copies. The apparent jassdoc omission is a file-category mistake, not evidence of a ROC/TFT difference.

## 1. Which `common.j` natives are implemented in the AI VM?

### 1.1 The defensible answer is a capability matrix, not a complete list

**[DOCUMENTED]** The 2003 JASS Manual warns that `common.j` calls returning strings, calls taking callbacks (`code`, `trigger`, `boolexpr`), and `ExecuteFunc` had been observed not to work correctly in AI scripts. The same page expressly says its coverage is incomplete. It recommends `FirstOfGroup` plus destructive removal instead of callback enumeration. See [Library Functions](https://jass.sourceforge.net/doc/library.shtml), lines 8–13 and 86–102 in the rendered page.

**[EXPERIMENTAL]** MyScorpion42's February–March 2026 test series on **patch 1.30b** refines that old warning. It reports corrupt string-returning calls and an `I2S` crash; working membership checks and pathing calls; broken trigger actions/conditions and callback enumeration; event registration detectable through trigger execution/evaluation counters; and, contrary to the old blanket warning, `ExecuteFunc` successfully invoking a **map-script** function but not an AI-script function. The thread includes small proof maps and the `heroes.w3x`/`heroes10.ai` artifact. See [Map Script-Independent JASS-driven AI Experiment](https://www.hiveworkshop.com/threads/map-script-independent-jass-driven-ai-experiment.370776/), especially posts #1 and #3, and the attached [heroes.w3x](https://www.hiveworkshop.com/attachments/heroes-w3x.575596/) and [heroes10.ai](https://www.hiveworkshop.com/attachments/heroes10-ai.575598/). These results must not be silently generalized to 1.36/2.0.

### 1.2 Requested native/capability matrix

| Native or capability | Verdict in an AI script | Evidence class | Specific evidence and safe conclusion |
|---|---|---|---|
| `I2S` | **Do not use** | **EXPERIMENTAL** | A 2010 test says it returns `""`; a 2023 test shows `"I will build " + I2S(n) + " expansions!"` losing the number; a 2019 report says it can crash; the 2026 patch-1.30b test says it crashes. The Fall of Rome S9 probe observed `""` on 1.36/2.0. Sources: [2010](https://www.hiveworkshop.com/threads/how-to-debug-ai.158210/), [2023](https://www.hiveworkshop.com/threads/i2s-does-not-work-in-ai-script.347284/), [2019](https://www.hiveworkshop.com/threads/attempting-to-make-functioning-ai.314372/), [2026](https://www.hiveworkshop.com/threads/map-script-independent-jass-driven-ai-experiment.370776/). Exact failure mode is version/context dependent. |
| `R2S`, `R2SW` | **UNKNOWN individually; avoid** | **UNKNOWN**, with category-level **DOCUMENTED/EXPERIMENTAL** warning | The 2003 manual and patch-1.30b test warn about string-returning natives as a class, but no isolated AI-VM `R2S`/`R2SW` test was found. It would be an overclaim to convert the class warning into a per-version result. |
| `S2I` | **UNKNOWN** | **UNKNOWN** | No isolated AI-VM test and no active use in the current AMAI source was found. Declaration in `common.j` is not evidence of implementation. |
| `S2R` | **Used by a mature AI; not isolated** | **CODE-INFERRED** | Current AMAI calls `S2R` in `common.eai` at lines 2426 and 2449: [AMAI `common.eai` at commit `2ab10ee`](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/common.eai#L2418-L2452). Treat it as field-proven for AMAI's supported builds, not a guarantee for every patch. |
| `SubString` | **Broken/unsafe** | **CODE-INFERRED + EXPERIMENTAL report embedded in project source** | AMAI commit `de38bb596bdf2c02f7ff4d6688e49fb75f70b293` (2024-09-29) comments out `SubString`, stating that it returns strange values in JASS AI and crashes in Lua mode. Current lines 2093–2119: [source](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/common.eai#L2093-L2119). |
| Literal strings, string variables/arrays, concatenation | **Usable within limits** | **EXPERIMENTAL + CODE-INFERRED** | The patch-1.30b experiment says directly assigned strings/arrays are uncorrupted while calls that obtain/return strings corrupt them. Custom decimal conversion works by indexing digit literals and concatenating; AMAI's `Int2Str` is at lines 1335–1392: [source](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/common.eai#L1335-L1392). |
| `StringHash` | **Strong field evidence of working** | **CODE-INFERRED** | Active throughout AMAI's translation/chat tables, e.g. lines 1475–1494 and 2156–2185: [source](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/common.eai#L1475-L1494). No isolated cross-version test was found. |
| `StringLength` | **Field evidence of working** | **CODE-INFERRED** | Active in AMAI at line 2209: [source](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/common.eai#L2203-L2220). |
| `StringCase`, `GetLocalizedString`, other string-returning calls | **UNKNOWN individually; avoid without probes** | **UNKNOWN** | No isolated AI-VM tests were found. The category-level warnings make optimistic inference unsafe. |
| `DisplayTextToPlayer` / `DisplayTimedTextToPlayer` | **Works for debugging in tested builds** | **EXPERIMENTAL + CODE-INFERRED** | The 2010 author reports timed text working on screen and in F12 Message Log. The 2019 thread recommends the underlying native. AMAI actively calls `DisplayTimedTextToPlayer`, e.g. lines 1522–1588: [source](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/common.eai#L1522-L1588). |
| `DisplayText`, `DisplayTextI`, `DisplayTextII`, `DisplayTextIII` from `common.ai` | **Declared and relied on by stock tracing; good numeric-debug option** | **DOCUMENTED + CODE-INFERRED** | The shipped declarations are lines 7–10 of [Reforged `common.ai`](https://github.com/tdauth/wowr/blob/1ad4c97648eaef97cd3a01bb784633f4de562834/wc3/reforged/Scripts/common.ai#L7-L10). The 2023 discussion identifies the integer variants. A stand-alone runtime matrix was not found, so retain a probe in production builds. |
| `GetPlayerState` | **Strong field evidence** | **CODE-INFERRED** | Current AMAI calls it in resource and food logic, including `common.eai` lines 2541/2546 and 2707/2712. [AMAI source around resource queries](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/common.eai#L2530-L2552). |
| `GetUnitTypeId` | **Strong field and test-map evidence** | **CODE-INFERRED + EXPERIMENTAL** | Used pervasively by AMAI; the callback-free example at lines 2046–2058 tests unit type during iteration: [source](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/common.eai#L2046-L2058). The 2026 `heroes.ai` also directly manipulates known unit handles/types. |
| Create/populate a group with a `null` filter | **Works in field code** | **CODE-INFERRED** | AMAI executes `GroupEnumUnitsOfPlayer(g, ai_player, null)` and consumes it with `FirstOfGroup`/`GroupRemoveUnit` at lines 2046–2058. Passing `null` avoids the broken `boolexpr` callback. |
| `FirstOfGroup`, `GroupRemoveUnit`, membership queries | **Works in field code and patch-1.30b tests** | **CODE-INFERRED + EXPERIMENTAL** | The manual's AI-safe workaround and AMAI agree. The 2026 experiment reports group/region/force membership queries working. |
| `ForGroup`, `ForForce`, filters, other callback enumeration | **Unsafe/broken in tested AI VMs** | **DOCUMENTED + EXPERIMENTAL** | The 2003 manual says callback-taking calls do not function correctly. The 2026 patch-1.30b test reports callback enumeration crashing. Do not infer that group storage itself is broken. |
| `CreateUnit` and ordinary shared-game-state mutation | **Works in tested artifacts** | **EXPERIMENTAL** | The 2019 discussion reports `CreateUnit` working. In the inspected `heroes.w3x` attachment, `war3mapImported\heroes.ai` calls `CreateUnit` at AI lines 1576, 1594, and 1730 and uses `SetUnitUserData`; the published map demonstrates the design on 1.30b. |
| Triggers in the AI VM | **Actions/conditions broken; event counters partially usable on 1.30b** | **EXPERIMENTAL** | The 2026 test found that registering events increments `GetTriggerExecCount`/`GetTriggerEvalCount`, but action/condition callbacks do not run and some callbacks crash. This is a narrow polling technique, not general trigger support. |
| `ExecuteFunc` | **Version-specific experiment only** | **EXPERIMENTAL** | Contrary to the 2003 manual, the 2026 test map invokes a **map-script** function on 1.30b; AI-script functions do not work. This is too contradictory and version-specific to use as a portable interface. |

### 1.3 What published lists and reverse engineering exist?

**[DOCUMENTED]** The best broad compatibility note remains the [2003 JASS Manual's Library Functions page](https://jass.sourceforge.net/doc/library.shtml), but the author explicitly labels the section incomplete. It is a category warning plus runtime-model description, not an implementation table.

**[DOCUMENTED, but wrong direction]** The Hive snippet titled [“Working AI Natives”](https://www.hiveworkshop.com/threads/snippet-working-ai-natives.184297/) concerns selected `common.ai` functions exposed to **map scripts** after manual declarations; it is not a table of `common.j` calls that work in AI scripts.

**[UNKNOWN because source body was inaccessible]** The 2009 TheHelper thread [“Working AI Natives”](https://www.thehelper.net/threads/working-ai-natives.127331/) is search-indexed as a test of many `common.ai` natives, mostly concerned with melee/campaign context, crashes, and null/zero results. Its body was blocked by the site's anti-bot page during this research, so it cannot support a detailed claim and, again, appears to cover `common.ai`, not the requested full `common.j` compatibility surface.

**[UNKNOWN / negative result]** Generic reversing threads such as [“Reverse Engineer Game.dll”](https://www.hiveworkshop.com/threads/reverse-engineer-game-dll.268718/) contain strings, offsets, and unrelated engine work. The 2026 test author mentions Ghidra while investigating race IDs. Neither source publishes the AI VM's native-registration table or an exhaustive compatibility matrix. No such table was found in the searched GitHub repositories, Hive/Wc3C archives, JASS documentation, AMAI, jassdoc, or public `Game.dll` discussions.

## 2. What exactly is loaded in the AI VM?

**[DOCUMENTED — contemporaneous community manual]** Jeff Pang's JASS Manual states the composition directly:

- map program: `common.j` → `Blizzard.j` → `war3map.j`;
- AI program: `common.j` → `common.ai` → the user `.ai` (`human.ai`, `elf.ai`, etc.);
- the common files are normally under `Scripts/` in the game MPQ and can be overridden by files in a map archive.

Source: [Global Declarations](https://jass.sourceforge.net/doc/globals.shtml), lines 8–11.

**[EXPERIMENTAL]** The composition explains observed behavior across independent 2010, 2019, and 2023 reports: a `common.j` call such as `DisplayTextToPlayer` compiles and can work, `common.ai` declarations are available, but a `Blizzard.j` helper such as `BJDebugMsg` or `B2S` is absent unless copied. See [2010 debugging report](https://www.hiveworkshop.com/threads/how-to-debug-ai.158210/) and [2019 AI discussion](https://www.hiveworkshop.com/threads/attempting-to-make-functioning-ai.314372/).

**[CODE-INFERRED]** Reforged still ships the three relevant source surfaces and projects override `Scripts/common.ai` inside maps. AMAI's installer copies version-specific scripts into a map's `Scripts` folder, and [JASS Campaign AI 2.0](https://www.hiveworkshop.com/threads/jass-campaign-ai-2-0.334624/) instructs authors to import its replacement as `scripts\common.ai`. This corroborates the load/override model, but does not prove that every Reforged native declaration is registered in the AI VM.

**[UNKNOWN]** No primary loader/decompilation was found that compares the exact AI compilation/load path for ROC launch 1.00, TFT, 1.26–1.31, and current Reforged. The 2003 composition is well corroborated in later practice, but patch-specific extra implicit files, if any, remain unproven. No evidence was found that `Blizzard.j` became part of the AI program in Reforged.

## 3. Is `Blizzard.j` unavailable, and what is the workaround?

**[DOCUMENTED + EXPERIMENTAL]** Yes: it is absent from the AI program under the documented composition, and multiple AI authors reproduced failures when trying to call its helpers. The 2010 report explicitly says to copy required `Blizzard.j` functionality into the `.ai`; the 2020 custom-race thread reached the same diagnosis after testing. See [How to debug AI](https://www.hiveworkshop.com/threads/how-to-debug-ai.158210/) and [AI for standard and custom races](https://www.hiveworkshop.com/threads/ai-for-standard-and-custom-races-after-creating-starting-units-plus-hero.323088/).

The accepted practical pattern is:

1. **[CODE-INFERRED]** Prefer a small pure-JASS equivalent over copying a BJ. For example, `B2S` is just a boolean branch returning the literal `"true"` or `"false"`; no native conversion is needed.
2. **[EXPERIMENTAL]** For integers, use the `common.ai` integer display variants while debugging or a custom digit-table/divide/modulo `Int2Str`. The 2019 thread includes an implementation credited to AIAndy/Tommi; AMAI carries the production version at [`common.eai` lines 1335–1392](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/common.eai#L1335-L1392).
3. **[CODE-INFERRED]** Copy only the BJ and its transitive helper/global dependencies if there is no smaller substitute. Bulk-copying `Blizzard.j` imports many assumptions and callback-based calls that may themselves be invalid in the AI VM.
4. **[DOCUMENTED + CODE-INFERRED]** If many AI files need the same vetted helpers, a map-local `Scripts/common.ai` override is a supported composition pattern. Keep per-version builds: [JASS Campaign AI 2.0](https://www.hiveworkshop.com/threads/jass-campaign-ai-2-0.334624/) reports that new replacement functions were not callable in some 1.29/1.30 configurations, requiring code to be prepended to individual scripts. This is a community project result, not a Blizzard guarantee.

## 4. Execution model, sleep/yield, and failure behavior

### 4.1 VM and global-state boundaries

**[DOCUMENTED — contemporaneous community manual]** There is one independent map program and one independent AI program for each computer player. Global variables are not shared between programs. Globals are shared among the threads belonging to one player's AI. [JASS Manual, Library Functions](https://jass.sourceforge.net/doc/library.shtml), lines 49–65 for inter-script boundaries and lines 19–31 for threads.

### 4.2 Cooperative threads

**[DOCUMENTED]** `common.ai` declares `StartThread(code)` and `Sleep(real)` at lines 126–127 of the [mirrored Reforged `common.ai`](https://github.com/tdauth/wowr/blob/1ad4c97648eaef97cd3a01bb784633f4de562834/wc3/reforged/Scripts/common.ai#L120-L139). Stock `StandardAI` and `CampaignAI` both use them: [`StandardAI`, lines 783–810](https://github.com/tdauth/wowr/blob/1ad4c97648eaef97cd3a01bb784633f4de562834/wc3/reforged/Scripts/common.ai#L783-L810); [`CampaignAI`, lines 2402–2443](https://github.com/tdauth/wowr/blob/1ad4c97648eaef97cd3a01bb784633f4de562834/wc3/reforged/Scripts/common.ai#L2402-L2443). A forum claim that `Sleep` cannot be used is therefore contradicted by shipped code and the older execution documentation.

**[DOCUMENTED — 2003 manual]** The manual reports six slots per AI player including `main`: main plus five extra threads. Extra `StartThread` calls are ignored after the slots are full; slots are not recycled. The child runs immediately until it yields, then its creator resumes. A thread yields through `Sleep(N)` or automatically for one second after an opcode limit. See [Library Functions](https://jass.sourceforge.net/doc/library.shtml), lines 19–31.

**[EXPERIMENTAL]** A patch-1.30b author observed AI memory exhaustion after repeatedly starting short-lived threads and inferred that terminated thread resources were not reclaimed. That is consistent with the old “slots are not recycled” description, but it is not a memory-layout proof. [2026 experiment, post #5](https://www.hiveworkshop.com/threads/map-script-independent-jass-driven-ai-experiment.370776/).

**[UNKNOWN]** `TriggerSleepAction` is declared in `common.j`, but no isolated AI-VM test was found. It should not be treated as interchangeable with the AI-native `Sleep`; portable AI code should use `Sleep`. Exact slot count/recycling behavior on 1.36/2.0 has not been re-measured here.

### 4.3 Runtime errors and silence

**[DOCUMENTED — 2003 manual]** The manual lists thread termination when the entry function returns, when an unset variable is read, and on divide-by-zero, and advises keeping `main` alive (for example with `SleepForever`).

**[EXPERIMENTAL]** In 2023, an AI author reported that an invalid or crashed AI produces no error message and simply stops; wrapping the map-side `StartCampaignAI` in Lua `pcall` did not catch the AI-program error. Debugging proceeded through numbered `DisplayTextToPlayer` breadcrumbs. See [How to debug and get errors thrown by JASS AI?](https://www.hiveworkshop.com/threads/ai-how-to-debug-and-get-errors-thrown-by-jass-ai.348886/), posts #1–#2.

**[EXPERIMENTAL]** “Silent” is not the only failure mode. `I2S` and callback misuse have crashed the entire game in named tests. Therefore the operational categories are: (a) current AI thread terminates silently, (b) AI stalls in an engine routine/build priority without a script exception, or (c) process/map crashes. A missing debug message cannot distinguish them.

**Engineering consequence:** add a monotonic heartbeat using literal text or a game-state proxy, number initialization stages, and put risky probes in one-per-run test maps. Do not rely on syntax compilation or the return of `Start*AI`, which returns `nothing`, as a health signal.

## 5. ROC/TFT/Reforged `common.ai` differences and `RemoveGuardPosition`

### 5.1 Direct artifact diff

The following are Blizzard-file mirrors in the WoWR repository at immutable commit [`1ad4c97648eaef97cd3a01bb784633f4de562834`](https://github.com/tdauth/wowr/tree/1ad4c97648eaef97cd3a01bb784633f4de562834/wc3). Hashes are of the checked-out artifacts in this research run.

| Artifact | SHA-256 | Direct comparison |
|---|---|---|
| [`wc3/tft/1.27.1.7085/common.ai`](https://github.com/tdauth/wowr/blob/1ad4c97648eaef97cd3a01bb784633f4de562834/wc3/tft/1.27.1.7085/common.ai) | `c2eebafea1e1f39e755e37a25cd8efe994d8ee946ee652bc5fb0b9164b573096` | Byte-identical to 1.29.2. |
| [`wc3/tft/1.29.2/common.ai`](https://github.com/tdauth/wowr/blob/1ad4c97648eaef97cd3a01bb784633f4de562834/wc3/tft/1.29.2/common.ai) | `c2eebafea1e1f39e755e37a25cd8efe994d8ee946ee652bc5fb0b9164b573096` | Byte-identical to 1.27.1. |
| [`wc3/tft/1.31.0/common.ai`](https://github.com/tdauth/wowr/blob/1ad4c97648eaef97cd3a01bb784633f4de562834/wc3/tft/1.31.0/common.ai) | `deb0cc3dcb49d8b85f829f97b14d87169ccd17df884b2dacbc116fb5fbf41ca6` | Equal to 1.29.2 under whitespace-insensitive diff. |
| [`wc3/reforged/Scripts/common.ai`](https://github.com/tdauth/wowr/blob/1ad4c97648eaef97cd3a01bb784633f4de562834/wc3/reforged/Scripts/common.ai) | `c6ad51b462d642c58acc426234ed88c588a296ec0351b2627c4c2dacdef43394` | Relative to 1.31, adds only `FOREST_TROLL='nftr'`, `DRAGON_ROOST='ndrb'`, `CORRUPT_AGES='ncta'`, `CORRUPT_ETERNITY='ncte'`; no native/function behavior changes. |

**[CODE-INFERRED]** All four retain the header `$Id: common.ai,v 1.68 2003/05/12 02:34:18 bfitch Exp $`. This establishes stability from the acquired 1.27.1 artifact forward. It does **not** authenticate the file as ROC launch version 1.00; May 2003 is late ROC-era/pre-TFT source history, not a launch-build provenance record.

**[UNKNOWN]** No authenticated ROC 1.00 or exact 1.26 `common.ai` artifact was acquired, so a claim that ROC launch, 1.26, and TFT are byte-identical would be speculation. AMAI maintains separate ROC/TFT/Reforged builds and its [README](https://github.com/SMUnlimited/AMAI) records patch compatibility, but that describes AMAI's generated scripts and known engine bugs, not a stock-file diff.

### 5.2 `RemoveGuardPosition` is in `common.j`

**[DOCUMENTED]** Current declarations are at lines 3867–3875 of the [mirrored Reforged `common.j`](https://github.com/tdauth/wowr/blob/1ad4c97648eaef97cd3a01bb784633f4de562834/wc3/reforged/Scripts/common.j#L3867-L3875). The 1.27.1 mirror also declares `RemoveGuardPosition` at line 2398, the 1.29.2 copy at line 2426, and 1.31 at line 3796. jassdoc likewise documents the declarations in [`common.j`](https://github.com/lep/jassdoc/blob/deddec452ec16ea355ca0aa47046b88d416dbc65/common.j#L24288-L24306), not `common.ai`.

The file division is intentional: `StartMeleeAI`, `StartCampaignAI`, `CommandAI`, `PauseCompAI`, and the guard-position controls are map-side Computer AI interface natives in `common.j`; captain/build/command-consumer functions are in `common.ai`. Therefore “jassdoc `common.ai` is missing `RemoveGuardPosition`” is not a version finding.

## Architecture impact

1. **Treat the AI VM as a separate, versioned ABI.** Compile visibility is only the first gate. Maintain an explicit `ai_vm_capabilities` module and prohibit direct use of unprobed `common.j` natives elsewhere.
2. **Keep the portable core primitive.** Favor integers, reals, booleans, literal strings, arrays, direct unit/player queries, AI-native `Sleep`, and callback-free group loops. Put all conversions, string-returning natives, callback APIs, and cross-VM tricks behind adapters.
3. **Use two build layers.** A small per-script compatibility prelude is safest across 1.29/1.30; a map-local `Scripts/common.ai` override is convenient on versions where it has been tested. Do not make the whole architecture depend on overriding a global game script.
4. **Make liveness observable.** The map should expect a heartbeat/ready signal, not assume that `Start*AI` succeeded. Version-tag the handshake and fail closed to a trigger-AI fallback if the AI is silent.
5. **Regression-test per engine line.** At minimum run a capability probe on 1.26/1.27, 1.31, 1.36/current Reforged, and 2.0/current branch. Record return value, thread survival, and process survival separately; `I2S` proves that one word such as “broken” is not precise enough.

## Explicit negative searches and remaining unknowns

The following are negative results, not inferred answers:

- **[UNKNOWN]** No complete `common.j`-native compatibility matrix for the AI VM was found in the JASS Manual/API browser, jassdoc, AMAI, Hive's JASS/AI sections, the Wc3C archive, TheHelper, public GitHub code search, or generic `Game.dll` reverse-engineering threads.
- **[UNKNOWN]** No public decompilation or symbol/registration table was found that maps `common.j` native names to the AI VM's implemented handlers. Generic `Game.dll` strings/offset discussions do not answer this.
- **[UNKNOWN]** No isolated AI-VM test was found for `R2S`, `R2SW`, `S2I`, `StringCase`, or `GetLocalizedString`. Category warnings exist, but individual results are not known.
- **[UNKNOWN]** No authenticated ROC 1.00 or exact 1.26 `common.ai` was acquired. The May 2003 `$Id` header is not enough to label a copy “the launch ROC file” or to bridge the missing artifact by assumption.
- **[UNKNOWN]** No current, exhaustive 1.36/2.0 compatibility suite was found. The Fall of Rome S9 result covers `I2S`; it does not validate the whole requested surface.
- **[UNKNOWN]** `TriggerSleepAction` in the AI VM was not isolated. Use the explicitly AI-native `Sleep`.
- **[UNKNOWN]** Exact thread-slot recycling and memory behavior on current Reforged were not measured. The six-slot/no-recycling result comes from the 2003 manual, with a compatible 1.30b observation.
- **[UNKNOWN]** Reforged's exact loader internals were not found. Later source/project behavior corroborates the classic three-file composition, but is not a loader decompilation.
- **Negative source-quality finding:** the two resources titled “Working AI Natives” do not supply the requested table: the Hive resource is the inverse direction (`common.ai` in map scripts), and the TheHelper body was inaccessible and search snippets indicate a partial `common.ai` test.

## Reproducible artifact register

- AMAI repository inspected at commit `2ab10eea16beb06d80278593c16016167e5bb7e0` (2026-02-22): [repository](https://github.com/SMUnlimited/AMAI/tree/2ab10eea16beb06d80278593c16016167e5bb7e0).
- WoWR/shipped-script mirror inspected at commit `1ad4c97648eaef97cd3a01bb784633f4de562834`: [repository](https://github.com/tdauth/wowr/tree/1ad4c97648eaef97cd3a01bb784633f4de562834).
- jassdoc inspected at commit `deddec452ec16ea355ca0aa47046b88d416dbc65`: [repository](https://github.com/lep/jassdoc/tree/deddec452ec16ea355ca0aa47046b88d416dbc65).
- `heroes.w3x`, downloaded from the 2026 Hive thread: SHA-256 `6c3155957ee77aed6a924e4f497664b63fe2f6541d3a8c0ef4da096fe70404c6`. Direct archive inspection found `war3map.j` line 101 calling `StartMeleeAI(Player(1), "war3mapImported\\heroes.ai")`, Player 1 configured as `MAP_CONTROL_COMPUTER` at line 140, and the 102,371-byte imported AI with `main` at line 2438.

## Bottom line for implementation

Use `common.j` inside an AI script only through a tested allowlist. Today that allowlist can reasonably include direct display, ordinary player/unit state, unit creation/mutation, and callback-free group operations, with the exact project builds tested. Exclude native string conversion, `SubString`, callback enumeration, and general AI-side triggers. Preserve every other declaration as **UNKNOWN** until a versioned probe says otherwise.
