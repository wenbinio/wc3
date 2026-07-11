# Ambitious-class maps — consolidated research & decomposition dossier

> **What this is**: the consolidated factual reference from a discovery cycle
> (2026-07-11) on "ambitious" WC3 games — five research streams (persistence
> tech, competitive ecosystems, engine extensions, open-source pipeline
> peers, plus a hands-on stream) and a profiling run over four flagship
> artifacts (Gaias Retaliation, Sunken City, DracoL1ch DotA, Island Troll
> Tribes) with this toolkit. The implementation wave that absorbed the
> hands-on findings is commit `f4a9a40` (object-data v1/v2 codecs, truncated
> w3i tolerance, two-tier model sanity, SLK probe set, wts dialect fidelity,
> container forensics). Numbers below were re-verified against the current
> tree (193-test suite, both MPQ backends) before writing. Working artifacts
> (maps, extractions, logs, peer-repo checkouts) lived in the session
> scratchpad only — nothing third-party was committed (CLAUDE.md gotcha 9).
> Companion dossiers: docs/reference/modern-maps-analysis.md (four modern
> production maps), docs/reference/fotn-analysis.md (protected 2011 classic).

## 1. Persistence tech (how ORPGs save characters)

WC3 has no file-write API. The entire persistence ecosystem is built on one
exploit: **Preload injection**. `PreloadGenStart()` + repeated
`Preload("...")` + `PreloadGenEnd("file.txt")` writes a file under
`Documents\Warcraft III\CustomMapData\` — and that file is itself a **JASS
script** (`function PreloadFiles ... call Preload("...")`). Reading it back
means executing it (`Preloader(path)`), so writers break out of the
`Preload("...")` string literal to inject arbitrary calls, and the injected
code smuggles data into game state — `BlzSetAbilityTooltip` (read back via
`BlzGetAbilityTooltip`) or, since 1.31, `BlzSendSyncData` directly.

- **Save files ARE code.** Loading a save file executes whatever it
  contains; JASS Preload scripts run in a limited environment (some natives
  disabled), Lua Preload scripts are effectively unsandboxed. Any service
  that inspects or migrates player save files is doing code analysis, not
  data parsing.
- **Hard limits shape every design**: ≤255 chars per `Preload` string
  (null-terminated; `%` and NUL unsafe), minus breakout overhead; JASS caps
  concat ~4k chars. Hence chunking, Base64, and per-chunk headers in every
  serious library.
- **Multiplayer requires explicit sync**: each player's disk differs, so
  loads must rebroadcast via the 1.31 sync natives (`BlzSendSyncData` +
  `BlzTriggerRegisterPlayerSyncEvent`/`BlzGetTriggerSyncData`) or the game
  desyncs.
- **Patch history is the ecosystem's timeline**: 1.30 made reading
  CustomMapData work without "Allow Local Files"; 1.31 added the sync
  natives; Reforged removed Lua's `io`/`debug` libraries, so Preload
  injection remains the only file I/O even in Lua maps.
- **Library lineage** (each credits the previous): Pipedream's save-system
  optimum → **TriggerHappy's "Codeless Save and Load"** (2016; v3.0.1 2019;
  the seminal system: saves hero/items/XP to disk, syncs on load, no typed
  code) → **TriggerHappy's FileIO** vJASS library (2018, v1.1.0 2019:
  10-ability tooltip transport, 2,000-char files post-1.31) → Luashine's Lua
  port → **ScrewTheTrees's SaveLoadBigData** (Lua/TS, Base64 + 180-char
  `BlzSendSyncData` chunks; demonstrated 55,308 chars saved+loaded+synced in
  ~3 s) → **Trokkin/Antares "Stable Lua FileIO"** (2025; `[[ ]]` long-string
  transport plus a set of escaping crash-fixes).
- **The alive ORPG flagships** (the market for persistence): Gaias
  Retaliation **v1.3A(11)** (updated Jul 7, 2026), TKoK Eastern Kingdom
  **3.5.15** (English Version 8d, Nov 2024), The Black Road **v1.39f**
  (updated Feb 2026, codeless load-by-filename), Curse of Time RPG:
  Nevermore v1.35c (**480x480** — the practical dimension ceiling), Guilds
  of Hyppos (autosaves), Daemonic Sword. Sunken City is the deliberate
  counterexample: no save system at all.
- **Save-format migration is a first-class release artifact.** Gaias ships
  `-comp` (import old codes) and `-fixsave` commands, supports exactly two
  prior code generations ("only codes of v1.3A(4) and v1.2E(5) are currently
  supported"), and documents wipes in changelogs (alchemy saves wiped for
  corruption; gold/crystals capped on compatibility load after exploits).
  The Black Road keeps a dedicated converter build (v1.39a2) alive purely so
  legacy codes can be upgraded. A toolkit that ever touches ORPG saves must
  treat "which code generations load" as part of the map's public API.
- Toolkit consequence: persistence lives entirely in the map script, so our
  script-level read/edit/rebuild already reaches all of it; decoding a
  specific map's save format is per-map analysis (of code, see above), not
  a missing format feature.

## 2. Competitive ecosystems (where the players are)

- **Two format eras run in parallel.** Classic clients (1.26–1.28) still
  carry DotA and its descendants on community platforms (RGC lineage,
  ENT-style hostbots); the Reforged side is organized around
  **W3Champions** and its curated custom-game pools — Legion TD (OZE/Mega
  lines), Castle Fight (DE line), Footmen Frenzy and peers. A map that
  wants both audiences ships two builds against two native sets.
- **DracoL1ch's DotA is a platform, not a map** — confirmed hands-on: the
  archive embeds three Windows executables (859 KB / 512 KB / 4.6 MB,
  referencing `Game.dll`/`Storm.dll`/`WarCraftHelper.dll`, one
  self-identifying as "DotA2HPBars") plus 47 anonymous `.bin` blobs. Part of
  the game's semantics (UI overlays, engine patches) lives **outside**
  anything a map parser can see. Structural validation of such maps is
  honest only with that caveat attached.
- **flo** (W3Champions' Rust hosting stack) contains an independent map
  parser used to admit maps for hosting — a candidate **third**
  cross-validation backend alongside mdx-m3-viewer-th and War3Net (deferred,
  §6).
- **Everything competitive ships protected** (stripped/fake listfiles,
  optimizer passes) — this is where the forensic half of the toolkit
  (probe-union extraction, `--recover-names`, trap detection, container
  forensics) earns its keep.
- Realistic services for this scene given our capabilities: **balance
  diffing** between released versions (object-data JSON diff, now including
  v1/v2 and SLK-carried data), **rehost authenticity checks** (byte-level
  compare of a suspect upload vs the canonical release), and
  **multi-variant builds** (per-ladder tweaks from one source; needs §6
  matrix builds).

## 3. Engine extensions & scale

- **UjAPI** is the actively developed, MIT-licensed extended-natives
  platform for classic clients (1.26+): hundreds of new natives injected by
  a loader. Toolkit gap: a script referencing UjAPI natives is a *valid*
  map for its audience, but any future "unknown native" lint would
  false-positive on it — extended-native awareness (an allowlist) is a
  deferred capability (§6).
- The **memory-hack lineage** (1.26 memhack era → typecast exploits →
  today's DLL platforms like DracoL1ch's, and UjAPI) is the classic scene's
  answer to a frozen engine; Reforged's answer is official natives
  (`Blz*`). Both coexist in 2026.
- **.w3n campaigns are a real format family we don't handle**: a campaign
  is a **recursive MPQ** (member maps are whole `.w3x` archives) plus
  `war3campaign.w3f` (campaign info) plus a campaign-level object-data
  layer that overlays every member map. Custom campaigns were **restored in
  patch 1.35** after being absent from early Reforged. Flagships: Chronicles
  of the Second War, Warcraft: Re-Reforged, the Arkain series — the biggest
  ones ship **out-of-archive asset installers** (assets copied into the
  game folder / local files, sidestepping archive-size limits entirely). A
  fifth research sample turned out to be one of these: Turnro's
  *Resurrection of the Scourge* v2.3 (`.w3n`, 14 maps, updated Mar 2025).
- **Scale**: the 4/8 MB caps of the classic B.net era are gone — current
  clients accept maps in the 256–512 MB range, and the flagships use it
  (our samples: 88.6 MB Gaias, 170.5 MB DotA). "Whole-map-in-memory" tool
  designs (ours included) still work here but are near their comfort limit.
- **The "Allow Local Files" ecosystem** (registry-switched loading of loose
  files over archive members) is both a dev-iteration convenience and the
  mechanism behind campaign asset installers; since 1.30 the read side of
  CustomMapData no longer needs it (that's what made codeless saves
  mainstream, §1).

## 4. Open-source pipelines — peer study

Four peers were read as source (scratchpad checkouts; nothing vendored).

- **WarcraftLegacies** (C#, War3Net-based, the most industrialized):
  **typed object data** (`War3Api.Object` — units/abilities as C# objects,
  compile-time-checked field access), **generated constants**
  (`ConstantsGenerator.cs` emits a named constant per object id),
  **migrations-as-code** (`IMapMigration` implementations like
  `HeroPriorityMigration`, `UnitTooltipExtendedMigration` transform mapdata
  as versioned, reviewable commits), a dedicated **Warcraft.Integrity**
  project (unreachable-object detection as a build gate), and **xUnit tests
  that run against the BUILT map artifact** (`WarcraftLegacies.Map.Tests`:
  object-data accessibility, imported-model validity, rules tests).
- **Island Troll Tribes** (Wurst; the same artifact we profiled as a binary
  in §5 — the crossover sample): **628 `@compiletime` object definitions**
  in-language; a central **ID allocator + registry**
  (`compiletime(ABIL_ID_GEN.next())..registerObjectID("ABIL_...")` in
  `assets/LocalObjectIDs.wurst` — no hand-picked rawcodes, no collisions);
  **tooltips derived from mechanics constants**
  (`TOOLTIP_EXTENDED.format(DURATION.toToolTipLightBlue())` — balance
  change and tooltip cannot drift apart); **`grill test` in CI** (CircleCI
  runs Wurst unit tests headlessly on every push); **changelog-from-PR
  automation** (`[$changelog: ]` tags in PR descriptions are harvested by
  `scripts/release.py`, which also automates the release itself).
- **TypeScript ecosystem** (TriggerHappy's wc3-ts-template and kin):
  **w3ts** (typed API wrapper) + **typescript-to-lua** + **war3-transformer**
  compile TS to the map script; object data via `war3-objectdata-th`; the
  toolchain's second-opinion parser is `mdx-m3-viewer-th` — the same
  library we use. Risk (Reforged strategy staple) runs a **matrix release
  CI**: one source, several build flavors per release, with a version
  scheme crafted so variants sort together in the game's lobby list.
- **What we do that no peer does**: protected-map forensics (probe-union
  extraction, name recovery, trap stubs, container forensics),
  multi-version **byte-faithful** codecs (peers target exactly one format
  generation), dual-backend MPQ validation, and WE-free terrain authoring
  (every peer requires the World Editor for terrain).
- **What every serious peer has that we lack** (feeds §6): a generated
  named-constants layer over object data, headless runtime testing (grill
  test / xUnit-vs-artifact — we validate structure, never behavior), and
  release automation.

## 5. Hands-on profiles (four flagships, profiled with this toolkit)

### 5a. Gaias Retaliation ORPG v1.3A(11) (88,640,032 bytes)

- **Container**: bare MPQ; protector-mangled MPQ header-size field
  (`0x200102` where `0x20` belongs — StormLib ignores it; now surfaced by
  w3x-extract container forensics).
- **Protection**: stripped listfile. 2,423 entries → 31 named by probing;
  `--recover-names` recovers **1,793** more (1,824 named total, ~600 stay
  anonymous).
- **Formats**: the surprise of the sample — **w3i v33 + w3e v12 + objects
  v3** (full Reforged formats with the complete `war3mapSkin.w3*` twin
  set), from a classic-graphics ORPG. 1,047 MDX (all v800), 1,160 BLP.
- **Script**: 7.82 MB JASS, 333,219 lines, 5,515 functions, average
  function-name length **3.0** (obfuscated). API profile: hashtable-heavy
  state (40 `InitHashtable`, 18,279 `SaveInteger`, 8,404 `LoadInteger`),
  real frame UI (78 `BlzCreateFrame` + 989 `BlzFrame*`), 464
  `GetLocalPlayer`, and the codeless-save signature: `PreloadGenStart`/
  `PreloadGenEnd` + `SyncStored*` + 2 `InitGameCache` (§1 in the wild).
- **Validation (current tree)**: original archive **42/42 PASS, exit 0**
  (WARNs only); repack of the recovered extraction **556/556 PASS, exit 0,
  440 WARNs** — **402 of the 915 models** the repack carries under
  recovered names (1,047 MDX total) fail the strict sanity bar yet the map
  demonstrably runs: the datum that forced the two-tier model policy.

### 5b. Sunken City v2.5.1c (40,829,342 bytes)

- **Container**: bare MPQ; header-size field overwritten with ASCII garbage
  (`0x504F7856`) — forensics WARN, harmless to StormLib.
- **Protection**: stripped listfile (2,905 entries → 32 probed, **+2,518
  recovered**, ~330 anonymous); an **8-byte `war3map.w3r` protection-trap
  stub** (same pattern as Europe at War, gotcha 26) and a mangled 111-byte
  `war3mapUnits.doo` (editor-only, harmless).
- **Formats**: w3i **v31**, w3e **v11**, objects v3 + skin set — exactly the
  modern-production profile of docs/reference/modern-maps-analysis.md.
- **Script**: vJass at `scripts\war3map.j`, 4.74 MB, 12,166 functions with
  average name length **36.7** (unobfuscated vJass name-mangling); frame UI
  (53 `BlzCreateFrame` + 488 `BlzFrame*`); **zero Preload persistence** —
  matching the research finding that Sunken City deliberately has no save
  system.
- **The wts datum**: its 1.33 MB `war3map.wts` ships **UTF-8 BOM + CRLF +
  no blank separator line** — rebuilding used to rewrite every byte of an
  unmodified string table; now preserved via lib/wts.js's `_dialect`
  sidecar.
- **Validation (current tree)**: 42/44 — only the protector-mangled
  editor-only `war3mapUnits.doo` fails (same class as Europe at War in the
  modern-maps dossier).

### 5c. DotA v7.04c5 Allstars, DracoL1ch line (170,484,124 bytes)

- **Container**: classic **HM3W + MPQ at 512** (only one of the four);
  header name `DotA v7.04c5 Allstars`, flags 130168.
- **Protection**: stripped listfile, 4,598 entries. Probing names 66 —
  including 8 `Units\*.slk`, which only resolve because extraction now
  probes the **SLK-optimization name set**; `--recover-names` adds
  **3,730** (3,794 named, ~800 anonymous).
- **SLK-ified object data**: w3u/w3t/w3h/w3q don't exist — an optimizer
  moved unit/item/buff/upgrade data into `Units\*.slk` + per-race
  `*Func.txt`/`*Strings.txt` overrides that the engine loads from the map
  archive. Only w3a/w3b/w3d remain, in format **v2**.
- **Two protector truncations** (the tolerance test cases): `war3map.w3i`
  (v25) cut at byte 640 after the forces block + 1 stray byte — now lands
  in editable info.json with `_truncated: true, _truncatedAt: "upgrades"`
  and writes back byte-faithfully; `war3map.doo` truncated by 4 bytes —
  kept as **catch-and-record** (raw copy + manifest error + read-only
  `_viewer/` parse; deliberate, see gap 6 below).
- **Script**: 4.16 MB JASS, 10,639 functions, avg name length **3.6**
  (obfuscated). Classic-era persistence/sync idiom: 58 `SyncStored*` + 6
  `InitGameCache` (gamecache sync, no `Blz*` at all), 546 `ExecuteFunc`.
- **Embedded executables**: 3 anonymous `.exe` + 47 `.bin` — the DLL
  platform inside the archive (§2).
- 1,525 MDX (1,524 v800 + **1 v1300**), 2,897 BLP; w3e v11.
- **Validation (current tree)**: 21/23 — the two residual FAILs are both
  the protector's damage itself (the 4-byte-truncated doo; the viewer's
  second opinion still rejecting the truncated w3i our codec reads).

### 5d. Island Troll Tribes v3.9c (17,629,008 bytes)

- **Container**: bare MPQ with **8,814,760 bytes of trailing filler** after
  the archive (file is 2x the archive's size; the container-forensics
  poster child — the game never reads those bytes).
- **Unprotected**: full 372-entry listfile, 0 anonymous — and open source
  (github.com/island-troll-tribes; §4's crossover sample).
- **Formats**: w3i **v31**, w3e **v11**, and **object data v2 across all
  seven files** — the datum that proved v2 is current Wurst toolchain
  output, not legacy (the objects2 codec's headline case). 301/306-byte
  wtg/wct stubs.
- **Script**: Wurst-compiled JASS, 6.33 MB, 118,564 lines, 8,653 functions,
  avg name length **32.7** (Wurst mangling). Persistence is the minimal
  modern pair: 2 `Preload` writes + 3 `BlzSendSyncData` + 2
  `BlzTriggerRegisterPlayerSyncEvent` (§1's state of the art, ~5 calls
  total).
- **Validation (current tree)**: 127/128 — the one FAIL is the viewer
  choking on the 306-byte Wurst wct stub (disagreement on a file the game
  tolerates).

### 5e. Cross-map findings

- **Every ambition tier still ships v800 MDX** (2,703 of 2,704 sampled
  models); BLP1 everywhere. The single MDX v1300 (DotA) echoes the v1000
  stragglers in the modern-maps sample.
- **Obfuscation is bimodal**: avg function-name length ~3 (Gaias, DotA:
  obfuscated) vs ~33–37 (ITT, Sunken: toolchain-generated long names) —
  a cheap, reliable protection fingerprint.
- **Format version does NOT track ambition or age**: the same 2026-alive
  cohort spans w3i v25/v31/v33, w3e v11/v12, objects v2/v3, and SLK-ified.
  Multi-version codecs are the only way to cover the actual ecosystem.
- **Persistence tech tracks the map's era, not its size**: gamecache sync
  (DotA) → tooltip/Preload + hashtables (Gaias) → sync-native FileIO (ITT).

### 5f. The hands-on gap list (status after commit `f4a9a40`)

| # | Gap (what blocked the profiling) | Status |
| --- | --- | --- |
| 1 | Object data v1/v2 read-only (ITT: all seven files; DotA: w3a/w3b/w3d; XHS from the modern-maps cycle) | **FIXED** — lib/codecs/objects2.js read+write, all seven types + skin twins; 15 real files round-trip byte-identical |
| 2 | Protector-truncated w3i demoted the whole file to read-only fallback (DotA v25 cut at byte 640) | **FIXED** — w3i31 codec tolerates tail truncation: `_truncated`/`_truncatedAt`/`_truncatedTail` markers, byte-faithful write-back |
| 3 | SLK-optimized object data invisible on protected maps (DotA hides `Units\*.slk` from its listfile) | **FIXED** — extraction probe set now includes the 56-entry engine SLK-optimization name set (lib/mpq.js; the commit message's "49" undercounts it) |
| 4 | Model-sanity FAILs made validate-map useless on repacked third-party maps (Gaias: 402 of 915 checked models fail the bar yet run in game) | **FIXED** — two-tier policy (gotcha 14): build-time FAIL for map-source `imports/`, WARN in validate-map |
| 5 | Repack byte-fidelity losses: wts dialect rewritten (Sunken's BOM/no-separator), upstream falsy-zero write-throughs (`randomItemSetId`, scale, hitpoints, mana, color, gold) | **FIXED** — `_dialect` sidecar in lib/wts.js + extended FIX C in lib/translator-fixes.js |
| 6 | DotA's `war3map.doo` protector-truncated by 4 bytes, unparseable | **Kept as catch-and-record** (deliberate): raw copy + manifest error + `_viewer/` diagnostics; no tolerance codec — the raw passthrough is already byte-faithful for repack, and a doodad codec for one mangled file isn't worth the surface |
| 7 | Anonymous members are NOT carried through a repack — a rebuilt protected map contains only named members (repacked Gaias: 1,824 of 2,423 entries) | **OPEN** — needs pseudo-name carry-through at pack time (§6) |

Container forensics (ITT's 8.8 MB filler, the mangled header-size fields)
also landed in `f4a9a40` as informational `container note:` lines in
w3x-extract — surfacing, not behavior change.

## 6. Ranked open capabilities (deliberately deferred)

Ranked by expected value; each was consciously deferred, not forgotten.

| # | Capability | Why it matters / why deferred |
| --- | --- | --- |
| 1 | Generated named-constants module from object JSON | Every peer has it (WarcraftLegacies ConstantsGenerator, ITT LocalObjectIDs, w3ts codegen); ours would emit a Lua/JSON constants table from objects-*.json. Deferred: pure authoring ergonomics, no correctness win yet |
| 2 | Mocked-natives headless Lua test harness | The biggest gap vs peers: grill test / xUnit-vs-artifact test *behavior*; we only test structure. Needs a `common.j`-shaped native mock layer under our luaparse gate |
| 3 | .w3n campaign support | Recursive MPQ + w3f + campaign object layer (§3); a real format family with active flagships. Deferred: no campaign artifact in scope yet |
| 4 | Object-data invariants / migrations-as-code | Beyond lint WARNs: versioned transforms over objects-*.json à la WarcraftLegacies IMapMigration. Deferred until a map here needs a breaking data change |
| 5 | Multi-variant matrix builds + release automation | One source → several .w3x flavors with lobby-sortable internal names (gotcha 17 already covers naming); ITT/Risk show the CI shape. Deferred: single-variant builds suffice for the bundled maps |
| 6 | Script optimization/minification pass | Peers ship optimizer passes (and protected maps arrive pre-optimized); we pack scripts verbatim. Deferred: correctness first, size second |
| 7 | Extended-natives (UjAPI) lint allowlist | Prereq for any future unknown-native lint (§3); harmless until such a lint exists |
| 8 | Anonymous-member carry-through on repack | Gap 7 of §5f: pack `FileNNNNNNNN` members back under their original hashes so a forensic rebuild is complete. Open engineering question: smpq backend cannot address nameless slots |
| 9 | flo (Rust) as third validation backend | A hosting-grade independent parser (§2) would upgrade the second opinion to a jury of three. Deferred: War3Net already tie-breaks, dotnet-optional |

## 7. Reproduction

```bash
node tools/w3x-extract.js --recover-names <map.w3x> /tmp/work/x  # counts as in §5 (incl. container notes)
node tools/map-to-json.js /tmp/work/x /tmp/work/src              # v2 objects + truncated w3i land editable
node tools/validate-map.js <map.w3x>                             # Gaias 42/42; DotA 21/23, Sunken 42/44,
                                                                 # ITT 127/128 (residual FAILs = protector
                                                                 # damage / viewer disagreement, see §5)
node tools/w3x-pack.js --bare /tmp/work/x /tmp/out.w3x           # named members only (gap 7)
```

The per-map numbers in §5 (entry/recovery counts, format versions, script
and API statistics, MDX version histograms) were re-derived from the
archives with the current tree on 2026-07-11; §1–§4 facts come from the
research-stream page captures and peer-repo checkouts in the session
scratchpad, cross-checked against the hands-on artifacts where they overlap
(e.g. Gaias's codeless-save API signature, ITT's Wurst output).
