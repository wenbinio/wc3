# wc3-map-toolkit — agent instructions

Headless, agent-operated Warcraft III `.w3x` map toolkit (read / translate /
edit / build / validate). No game install needed; everything runs on Linux
with node. MPQ I/O: stormlib-node native module (primary) or smpq CLI
(fallback). This file is the router — hard-won rules live here, deep detail
in docs/ and .claude/skills/; follow the pointers.

## First step in any session

```bash
bash scripts/setup.sh   # idempotent: npm install + optional apt-get smpq fallback
npm test                # 193 tests; all must pass before you change anything
```

If you touch `lib/mpq.js` or anything archive-related, the suite must be
green under BOTH MPQ backends: `npm test` (stormlib-node when loadable)
AND `npm run test:smpq` (forces the smpq CLI fallback).

## Command surface

```bash
node tools/w3x-extract.js  [--dump-unknown] [--recover-names] <map.w3x> <outdir>  # header -> _header.json, extract MPQ (+ name recovery, gotcha 4)
node tools/map-to-json.js  <extracted-dir> <json-dir>  # binaries -> editable map source
node tools/json-to-map.js  <json-dir> <out-dir>        # map source -> binaries
node tools/w3x-pack.js     [--bare] <dir> <out.w3x>    # binaries -> MPQ v1 + HM3W header (--bare: no pre-header)
node tools/build-map.js    [--bare] <map-source-dir> <out.w3x>  # one-step: source -> .w3x (--bare: no HM3W pre-header, 1.31+ container)
node tools/validate-map.js <map.w3x>                   # layered pass/fail report, exit 0 = good

bash scripts/crossvalidate-war3net.sh <extracted-dir>  # optional War3Net (C#) third opinion; needs dotnet
```

npm scripts: `npm test`, `npm run test:smpq`, `npm run setup`. Env vars:
`WC3_MPQ_BACKEND=smpq|stormlib` (force a backend; stormlib errors if the
native module won't load), `WC3_EXTRACT_UNKNOWN=1` (= `--dump-unknown`).

## Map source anatomy

```
maps/mymap/
├── info.json          map settings/players/forces (w3i); terrain.json (w3e)
├── units.json         preplaced units + slocs -> generated CreateAllUnits()
├── doodads.json       + regions/cameras/sounds/strings.json
├── objects-*.json     object data: units/items/destructables/doodads/
│                      abilities/buffs/upgrades (+ -skin) — see lib/filemap.js
├── war3map.lua        map script: config() + main()   (JASS: war3map.j)
├── files/             opaque binaries copied verbatim (wpm/shd/mmp/tga...);
│                      minimap tga+mmp auto-generated unless provided here
├── imports/           custom assets; path under imports/ IS the archive path;
│                      war3map.imp auto-generated (unless imports.json exists)
├── assets/            committed generator scripts (*.mjs) that reproduce all
│                      generated imports/terrain data — regen, don't hand-edit
└── _header.json       HM3W pre-header {name, flags, maxPlayers}
```

Reference sources (each README documents its own invariants):
- `maps/demo/` — minimal 2-player template; copy it to start a new map.
- `maps/crossroads-siege/` — every subsystem: terrain/cliffs/water, regions,
  cameras, sounds, custom object data, generated MDX import, full Lua mode.
- `maps/tidewatch-arena/` — lobby-config reference: the WE-exact
  "Use Custom Forces + Fixed Player Settings" `config()` pattern (gotcha 18).
- `maps/northreach/` — economy/systems map: 3 generated custom models
  (assets/mdl-lib.mjs), chat-command `-test` debug mode, FoTN-derived design.

Scratch builds go to `_build/` (gitignored). Exception: `maps/builds/` holds
the committed compiled `.w3x` of each bundled source — regenerate via
build-map whenever a source changes. Never commit any other `.w3x` (and
never third-party maps, gotcha 9).

## Workflows (one line each — follow the pointer)

- **Read/decompose any map** (incl. classic + protected: `_viewer/`,
  `_unknown/`, classicw3i) — PIPELINE §1, skill wc3-read-map.
- **Edit + rebuild**: source → build-map → validate-map; stabilization cycle
  after value edits (gotcha 6) — PIPELINE §2, skill wc3-build-map.
- **New map**: `cp -r maps/demo maps/<name>`, keep terrain/wpm/shd/slocs
  consistent — PIPELINE §3, skill wc3-new-map.
- **Asset generation/import**: MDL → war3-model → MDX chain, PNG → BLP1 via
  Pillow, sanityTest bar (gotchas 14, 19) — PIPELINE §4, docs/ASSETS.md,
  skill wc3-import-asset.
- **Validate**: validate-map layers + War3Net third opinion — PIPELINE §5–6.
- **In-game A/B diagnostics**: variants need distinct INTERNAL names
  (gotcha 17) — PIPELINE §7.
- **Decomposition-driven design**: before cloning/adapting a real map,
  decompose the actual artifact — forum lore got nearly every FoTN mechanic
  wrong; worked examples: docs/reference/fotn-analysis.md (protected
  classic), docs/reference/modern-maps-analysis.md (4 modern production
  maps), docs/reference/ambitious-maps-analysis.md (persistence/competitive/
  campaign ecosystems + 4 flagship decompositions: Gaias, Sunken City,
  DracoL1ch DotA, Island Troll Tribes).

## Capability matrix (what we can do per map class, as of 2026-07)

- **Modern Reforged formats (w3e v12, w3i v33, objects v3)** — full:
  read, edit, rebuild, author from scratch (all bundled maps are this).
- **Modern production maps (w3e v11, w3i v31 — what real 2023–2026 maps
  incl. 1.36/2.0-editor-saved ones actually ship)** — full: read + edit +
  byte-faithful rebuild via lib/codecs/ (gotcha 2); bare-MPQ container via
  `--bare`.
- **Classic TFT (w3i v25, w3e v11, object data v1/v2)** — info.json +
  terrain.json fully read+write via codecs; object data **v1/v2 now fully
  read+write** too (lib/codecs/objects2.js, all seven types + skin twins;
  byte-faithful — and v2 is NOT just legacy: current Wurst toolchain output
  (Island Troll Tribes v3.9c), DracoL1ch DotA and classic WE 2024 saves
  (X Hero Siege) all ship v2; v1 = same layout, marker preserved). Only
  **classic .doo remains read-only** (`_viewer/` diagnostics);
  scripts/assets always editable + repackable.
- **Protected maps** — extract via listfile∪KNOWN_FILES probing, content
  dump (`--dump-unknown`), name recovery (`--recover-names`, gotcha 4);
  trap stubs degrade to WARN (gotcha 26). wtg/wct stay opaque (usually
  deleted by protectors anyway; the game only needs the compiled script).
- **Authoring from scratch** — current formats only (demo template);
  codecs can WRITE w3e v11 / w3i v25/v31 / object data v1/v2 for
  compatibility targets, set the `"version"` marker deliberately.

## Gotchas (each cost real debugging time; numbers are stable — docs/READMEs cite them)

1. **Pin `wc3maptranslator@5.0.0`.** Unpinned resolves to 4.0.4 which has a
   different, broken API. v5 API is static methods:
   `InfoTranslator.warToJson(buffer)` → `{json}`,
   `InfoTranslator.jsonToWar(json)` → `{buffer}`.
2. **Reforged formats only** in wc3maptranslator (w3i v33, w3e v12, objects
   v3): other versions throw — sometimes a version message, often a bare
   `RangeError: offset out of range`. BUT real published maps (2023–2026,
   incl. 1.36/2.0-editor-saved) ship **w3e v11** terrain, **w3i v25/v31**
   info and **object data v1/v2** (current Wurst emits v2 today) — those now
   have first-class read+WRITE codecs (`lib/codecs/`,
   routed by lib/filemap.js off the binary version dword / the JSON
   `"version"` marker) and land in normal editable
   terrain.json/info.json/objects-*.json
   with byte-faithful write-back (exact v11↔v12 / v25↔v31↔v33 / objects
   v1/v2↔v3 deltas: docs/FORMATS.md). **Keep the `"version"` marker in
   source JSON** —
   deleting it makes json-to-map write the NEWEST format (v12/v33/objects
   v3), silently
   changing the on-disk version. Only versions no codec covers (w3i v18,
   classic doo, ...) still take the old path: map-to-json catches ANY
   translator throw — file copied raw (manifest.json → `errors`) plus a
   READ-ONLY mdx-m3-viewer-th parse under `_viewer/` (viewer schema, never
   repacked — not build-source); viewer failures land in
   `viewerFallbackErrors`. Protector-TRUNCATED w3i files stay editable: a
   v25/v31 cut off inside the tail sections (players onward — real case:
   DracoL1ch DotA, cut at byte 640) lands in normal info.json with
   `_truncated: true` + `_truncatedAt` markers and writes back
   byte-faithfully (keep the markers); only truncation inside the settings
   block falls back to a tolerant READ-ONLY lib/classicw3i.js parse. Don't
   "fix" the upstream throw — add/route a codec in filemap.js instead.
3. **512-byte HM3W pre-header**: StormLib reads `.w3x` directly but creates
   bare MPQs. w3x-pack builds the header from `_header.json` (or synthesizes
   one); stormlib-node pre-writes it and `SFileCreateArchive` converts it
   (MPQ lands at offset 512), smpq gets it prepended afterwards. MPQ must be
   **v1** (`MPQ_CREATE.ARCHIVE_V1` / `smpq -M 1`) for the game.
4. **Protected maps strip or FAKE the `(listfile)`** — extraction therefore
   ALWAYS probes the listfile ∪ KNOWN_FILES union (`lib/mpq.js`; a fake
   2-entry listfile on a real map hid 27 standard files). KNOWN_FILES
   includes the 56-entry engine **SLK-optimization name set**
   (`Units\*.slk`, per-race/common `*Func.txt`/`*Strings.txt`,
   `Doodads\Doodads.slk`): slk-optimizers move object data OUT of
   war3map.w3u/w3t/... INTO those archive members, and protectors hide them
   — without the probe set the map's object data silently vanishes (real
   case: DracoL1ch DotA). Unresolved members
   enumerate as `FileNNNNNNNN` pseudo-names on BOTH backends. `extractAll`
   returns `{ extracted, total, unresolved, unknown }` — always report the
   counts so anonymous imports aren't silently dropped (w3x-extract prints
   them). CONTENT is recoverable via `--dump-unknown` /
   `WC3_EXTRACT_UNKNOWN=1` (dumps under `_unknown/FileNNNNNNNN.<ext>`,
   content-sniffed extension), and most NAMES are recoverable too:
   `--recover-names` harvests candidate paths from the extracted content
   itself (scripts, object data, .toc lines, MDX TEXS chunks, derived
   BTN/DISBTN + .mdl/.mdx variants) and hash-probes them against the
   archive to a fixpoint (`lib/recover.js`; 448 and 401 imports renamed on
   two real protected maps). `_unknown/` is diagnostics only — map-to-json
   skips underscore paths, nothing repacks them. Always verify extraction
   ON DISK: smpq exits 0 even when a name misses.
5. **stormlib-node sharp edges** (primary MPQ backend — lib/mpq.js
   encapsulates all of this; never call it directly elsewhere):
   `SFileReadFile` wants an **ArrayBuffer** — a Node Buffer SIGABRTs the
   process; `SFileGetFileSize` returns **BigInt** (wrap in `Number()`);
   **NEVER pass `MPQ_FILE.REPLACEEXISTING`** to `SFileAddFileEx` — a
   signed-int coercion bug silently disables compression; `SFileRemoveFile`
   on `(listfile)`/`(attributes)` fails ERR:10003 — don't try. war3-model
   also wants ArrayBuffer:
   `buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)`.
6. **JSON round-trips are stable, not byte-identical**: rotations go through
   float32 radians (270° → 269.977…°), null FourCCs read as `'0000'`.
   Compare warToJson(jsonToWar(x)) against x, not bytes. Committed map-source
   JSON is a translator fixed point — keep it that way: after editing values,
   build once, re-extract, commit the stabilized JSON. **Trap**: copy the
   `*.json` files ONLY — never the extracted `war3map.lua`, which contains
   the generated CreateAllUnits block (gotcha 10).
7. **Lua maps**: set `info.json` `scriptLanguage: 1` AND ship `war3map.lua`
   defining `config()` and `main()`. JASS = 0 + `war3map.j`. build-map and
   validate-map syntax-check the packed war3map.lua with luaparse (Lua 5.3
   grammar) — a script that doesn't parse fails the build with error+line
   (line numbers refer to the PACKED script, source + generated blocks).
8. If you resize terrain, regenerate `files/war3map.wpm` and `war3map.shd`
   (sizes depend on terrain dimensions — see docs/PIPELINE.md §3).
9. **Copyright**: never commit Blizzard-authored or downloaded third-party
   maps. Fixtures here are MIT (see fixtures/ATTRIBUTION.md).
10. **war3mapUnits.doo is EDITOR-ONLY** — the game never reads it; WE compiles
    placements into `CreateAllUnits()` in the map script. build-map generates
    a marker-delimited `CreateAllUnits()` block from units.json and appends
    it to the packed war3map.lua (`lib/unitscript.js`). Call it from `main()`
    (before code that enumerates preplaced units); if the script never
    mentions it, main() is auto-wrapped to call it last. units.json stays
    the single source of truth.
11. **The `'0000'` FourCC dialect must NOT reach the binary**: jsonToWar
    writes `globalWeather: '0000'` as literal ASCII `30303030`, which the
    map picker rejects (WE writes four ZERO bytes). `lib/source.js`
    normalizes `'0000'`/null → `''` before translating. Keep `'0000'` in
    source JSON (gotcha 6); never bypass sourceToExtracted for info.json.
12. **Maps need a minimap preview or the picker shows nothing** (and older
    clients can crash): every real map ships `war3mapMap.blp/.tga` + a
    populated `war3map.mmp`. build-map auto-generates both from terrain.json
    and units.json (`lib/minimap.js`; byte layout in docs/FORMATS.md); drop
    your own files under `files/` to override.
13. **HM3W header flags mirror the w3i flags dword** (WE writes the same
    value in both places). w3x-pack derives flags from the packed
    war3map.w3i when `_header.json` has flags 0 (`readW3iFlags` in
    lib/header.js). Flags 0 is a pick-time divergence every tool notices.
14. **Model sanity is a TWO-TIER bar.** Custom MDX must pass mdx-m3-viewer's
    sanityTest (0 errors/severes) or the game hard-crashes at load — classic
    traps: an unspecified Bone GeosetAnimId defaults to 0 — invalid with no
    GeosetAnim chunk (write `GeosetAnimId None` or add a GeosetAnim);
    missing "Death" sequence; missing "Origin Ref" attachment. Enforcement:
    **build-map FAILS the build** when any model under the map source's
    `imports/` misses the bar (our own artifacts, strict);
    **validate-map only WARNs** on sanity findings for packed models —
    repacked third-party maps ship hundreds of models that fail the bar yet
    demonstrably run in game (a repacked Gaias: 402 of 915 checked), so a
    FAIL there would make validate useless on exactly the maps worth
    studying.
15. **mdx-m3-viewer-th must be fed `new Uint8Array(fs.readFileSync(p))`,
    NEVER a Node Buffer** — its MPQ code mutates the input in place and
    misparses. NEVER use its MPQ save/write path (locale/platform field
    swap → broken archives): open readonly, output is diagnostics only
    (`lib/viewer.js` enforces both). Its w3c parser disagrees with the
    other stacks on the 1.32 camera layout — w3c is excluded from the
    second opinion (docs/FORMATS.md).
16. **Non-ASCII text now round-trips losslessly — at OUR layer only.**
    Upstream wc3maptranslator mangles it in both directions (wts write:
    chars truncated to one byte; binary-format read: latin1 decode of UTF-8
    bytes), but wts goes through `lib/wts.js` (UTF-8 both ways) and every
    binary translator gets the UTF-8-safe `readString` patch from
    `lib/translator-fixes.js` (FIX A) — em dashes, accents, CJK in
    strings.json and object-data/info/sound name fields survive
    read→write→read byte-exact. Spelling text in ASCII (`--`, straight
    quotes, `...`) is no longer required; it remains good advice only for
    maximum-compat authoring (content that must survive OTHER tools built
    on unpatched wc3maptranslator). lib/wts.js also preserves third-party
    wts FILE dialects byte-identically (UTF-8 BOM / LF vs CRLF / no blank
    separator line — real maps ship all of these): warToJson records any
    non-WE-default dialect under a `_dialect` sidecar key in strings.json
    and jsonToWar consumes+strips it — keep the sidecar, it is not a
    string entry.
17. **The in-game map list shows the INTERNAL map name** (HM3W header + w3i
    name), never the filename — A-B variants look identical unless each gets
    a distinct name in strings/info (TRIGSTR name) AND `_header.json`
    (docs/PIPELINE.md §7).
18. **Lobby "Create" button greyed out** = broken force layout. With
    "Use Custom Forces" + "Fixed Player Settings", every `SetPlayerTeam`
    team index in `config()` must equal the index of a w3i force containing
    that player — a team with no matching force leaves the locked lobby with
    no valid arrangement. `forces: []` is also a pick-time divergence.
    WE-exact pattern: maps/tidewatch-arena (its original hosting bug).
19. **war3-model MDL dialect quirks** (authoring models as MDL text):
    `static Color { R, G, B }` takes plain RGB — generateMDX reverses the
    floats into the B,G,R order the game expects, so do NOT pre-swap; and
    parseMDL REJECTS a comma after the `Triangles { ... }` closing brace
    (WE/Magos-style MDL writes one — strip it). Start new generators from
    maps/northreach/assets/mdl-lib.mjs (known-good, sanity-self-checking).
20. **Tile/cliff FourCCs only from the tables in docs/FORMATS.md** ("Terrain:
    tileset & tile FourCCs") — an invented id that isn't in the game's SLKs
    renders wrong or not at all, and `terrain.json` `tileset` letter must
    match the ids' prefix.
21. **Generated CreateAllUnits nuances** (lib/unitscript.js): emits
    `SetHeroLevel` only when `hero.level > 1`, Str/Agi/Int only when > 0
    (a level-1 hero correctly gets no call); `SetResourceAmount` for gold
    mines; `SetUnitAcquireRange(u, 200)` for camp creeps
    (`targetAcquisition: -2`); `sloc` entries skipped — start locations
    belong in `config()`'s `DefineStartLocation` calls.
22. **Object-data model FIELDS always use the `.mdl` extension** (`umdl`
    units, `dfil` doodads, `bfil` destructables, `ifil` items), even when
    the imported archive member is `.mdx` — the engine swaps the extension
    at load, and a literal `.mdx` field value renders NOTHING (invisible
    unit, no error). Only field VALUES take `.mdl`; the file under
    `imports/`, its archive path and war3map.imp keep the real `.mdx`.
    validate-map WARNs on `.mdx` field values and on `war3mapImported\`
    references with no archive member after `.mdl`↔`.mdx` normalization.
23. **Cloning a unit/item and overriding only `unam` leaks the base's
    visible identity in-game** (the "deer drops cheese" bug: a renamed
    `ches` still looked and read as Cheese). Override the full
    visible-identity set — items: `unam` (name) + `ifil` (model) + `iico`
    (icon) + `utip`/`utub` (tooltip/extended); units: `unam` + `umdl`
    (model) + `uico` (icon) + `utip`/`utub`. validate-map WARNs on items
    overriding `unam` with neither `ifil` nor `iico`.
24. **w3i forces/alliance flags configure the LOBBY only** — they set the
    starting teams, not an unbreakable in-game state. A truce/grace/peace
    phase must be enforced at runtime: `SetPlayerAlliance(a, b,
    ALLIANCE_PASSIVE, true)` on BOTH directions of every player pair, AND
    explicitly torn down (`..., false`) when it expires — announcing the
    truce doesn't enforce it. Worked pattern: `SetFounderTruce` in
    maps/northreach/war3map.lua.
25. **A custom human-style builder needs `AHbu` AND `Ahrp` together** in
    `uabi`: human construction only progresses via the Repair ability, so
    a builder with build-but-no-repair starts buildings that never finish.
    validate-map WARNs when a unit has a non-empty `ubui` but its
    overridden `uabi` contains no repair-family ability (Ahrp human /
    Arep orc / Aetr night elf / Awha undead — only the human pair is
    playtest-verified; the others are accepted as equivalents).
26. **Protection-trap stubs**: protectors replace files the game tolerates
    being broken with tiny booby-trapped stubs whose count field is garbage
    (real example: an 8-byte war3map.w3r declaring ~1.26 billion regions) —
    naive parsers loop or allocate GBs on them. `lib/traps.js` detects the
    pattern BEFORE parsing (tiny file + declared count that cannot fit;
    deliberately conservative — count 0 or 1 honest entry never triggers):
    map-to-json/validate-map then skip translation AND the viewer fallback
    (which would allocate the billion-entry array), degrade to WARN + raw
    copy, and say why. Related hardening: `lib/translator-fixes.js` FIX B
    bounds upstream's readString so a truncated/garbage file throws a
    catchable RangeError instead of spinning forever.

## Testing & validation doctrine

- `npm test` = 193 tests, 18 files: source⇄binary fixed points for all four
  bundled maps, build+validate end-to-end, MPQ backends, version codecs
  (synthetic v11/v25/v31 + object-data v1/v2 fixtures cross-checked against
  mdx-m3-viewer-th + guarded real-sample fixpoints), classic/protected
  fallbacks (`_viewer/`, `_unknown/`, classicw3i, truncated w3i), wts
  dialects, luacheck, gotcha regressions. Both backends when touching
  archive code (`npm run test:smpq`).
- `validate-map` layers: HM3W header + MPQ magic at 512 → extraction →
  required files (w3i/w3e) + script presence → luaparse gate → per-file
  translator parse PLUS JSON→binary→JSON stability → object-data semantic
  lint (lib/objectlint.js — gotchas 22/23/25) → mdx-m3-viewer-th second
  opinion (independent MPQ open; parses wpm/shd/mmp/wct which the
  translator can't; MDX sanityTest on every packed model — findings are
  WARN here, the strict 0-errors/0-severes FAIL lives in build-map for
  source `imports/`, gotcha 14).
- **WARN semantics** (WARN never fails the map; exit stays 0): things real
  production maps legitimately do or that only a protector can cause —
  bare-MPQ container (no HM3W pre-header: modern 2023+ convention, 1.31+
  clients only), suspected protection-trap files (gotcha 26: parsing
  skipped, passed through unvalidated), viewer-side MPQ open/enumeration
  failures on archives StormLib reads fine (protector-mangled
  header/listfile — disagreement, not proof of breakage), model-sanity
  findings on packed third-party models (gotcha 14's passthrough tier),
  and all object-data lint findings. FAIL is reserved for things that
  break the map for players.
- Third opinion for disputed layouts: `scripts/crossvalidate-war3net.sh`
  (War3Net handles classic AND Reforged; the tie-breaker).
- **Honest limit: structural validity ≠ game acceptance.** Only the game
  proves a map. In-game protocol: build variants with distinct internal
  names (gotcha 17) and bisect. Failure classes from our crash postmortems:
  **pick-time** (missing/crashing in the picker) → w3i/header divergence:
  weather `30303030` bytes, header flags 0, empty/mismatched forces, missing
  minimap (gotchas 11–13, 18); **load-time** (crash after start) → malformed
  MDX (gotcha 14); **runtime** (black/dead/empty map) → Lua that doesn't
  parse or `CreateAllUnits` never running (gotchas 7, 10).

## Legal (non-negotiable)

Never commit Blizzard-authored or third-party maps/assets (models, textures,
SLKs). Reference Blizzard assets by in-game path (`units\human\Footman\...`)
— nothing is redistributed. Hive Workshop: inspiration + per-author credit
only; no re-hosting, no scraping. Ship only generated (see maps/*/assets/)
or CC0-converted content. Details: docs/ASSETS.md.

## Where things live

- `lib/filemap.js` — war3-file ⇄ translator ⇄ JSON-name table (add new
  formats here; tools pick them up automatically) + version routing into
  `lib/codecs/`
- `lib/codecs/` — version-aware codecs upstream can't parse: w3e11.js
  (terrain v11 read+write), w3i31.js (info v25/v31 read+write), objects2.js
  (object data v1/v2 read+write, all seven types); same JSON
  dialect as upstream plus a `"version"` marker (gotcha 2)
- `lib/header.js` / `lib/mpq.js` — HM3W header (+ w3i flags reader); MPQ I/O,
  two backends (stormlib-node primary / smpq CLI fallback)
- `lib/source.js` — map-source ⇄ extracted-dir conversion (the core logic,
  incl. weather normalization + viewer/classic fallback wiring)
- `lib/viewer.js` — mdx-m3-viewer-th second-opinion parsers (read-only);
  `lib/classicw3i.js` — tolerant truncated-classic-w3i reader
- `lib/luacheck.js` — luaparse Lua 5.3 gate; `lib/minimap.js` — minimap
  tga/mmp generation; `lib/unitscript.js` — CreateAllUnits() generation;
  `lib/objectlint.js` — object-data semantic WARNings (gotchas 22/23/25)
- `lib/wts.js` — linear wts parser/serializer, upstream dialect + byte-exact
  file-dialect preservation via the `_dialect` sidecar (upstream's regex
  reader OOMs on production-scale ~10k-string files; gotcha 16);
  `lib/translator-fixes.js` — runtime patches for upstream sharp edges
  (UTF-8 reads, bounded readString, doodad life:0 — gotchas 16, 26);
  `lib/traps.js` — protection-trap heuristic (gotcha 26);
  `lib/recover.js` — protected-map name recovery (gotcha 4)
- `docs/PIPELINE.md` — workflows §1–7 (read/edit/new/import/validate/War3Net/
  A-B naming); `docs/FORMATS.md` — format knowledge, tileset FourCC tables,
  references; `docs/ASSETS.md` — asset sourcing/conversion + legal;
  `docs/reference/` — worked decompositions: fotn-analysis.md (protected
  2011 classic), modern-maps-analysis.md (four 2023–2026 production maps +
  the ranked toolkit-gap list with fix status), ambitious-maps-analysis.md
  (persistence/competitive/campaign/peer-pipeline research + four flagship
  profiles: Gaias, Sunken City, DracoL1ch DotA, ITT — and the ranked
  deferred-capabilities list)
- `.claude/skills/` — wc3-read-map, wc3-build-map, wc3-new-map,
  wc3-import-asset (operational recipes)
