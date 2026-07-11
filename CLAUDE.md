# wc3-map-toolkit — agent instructions

Headless, agent-operated Warcraft III `.w3x` map toolkit (read / translate /
edit / build / validate). No game install needed; everything runs on Linux
with node. MPQ I/O: stormlib-node native module (primary) or smpq CLI
(fallback). This file is the router — hard-won rules live here, deep detail
in docs/ and .claude/skills/; follow the pointers.

## First step in any session

```bash
bash scripts/setup.sh   # idempotent: npm install + optional apt-get smpq fallback
npm test                # 124 tests; all must pass before you change anything
```

If you touch `lib/mpq.js` or anything archive-related, the suite must be
green under BOTH MPQ backends: `npm test` (stormlib-node when loadable)
AND `npm run test:smpq` (forces the smpq CLI fallback).

## Command surface

```bash
node tools/w3x-extract.js  [--dump-unknown] <map.w3x> <outdir>  # header -> _header.json, extract MPQ
node tools/map-to-json.js  <extracted-dir> <json-dir>  # binaries -> editable map source
node tools/json-to-map.js  <json-dir> <out-dir>        # map source -> binaries
node tools/w3x-pack.js     <dir> <out.w3x>             # binaries -> MPQ v1 + HM3W header
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
  wrong; worked example: docs/reference/fotn-analysis.md.

## Gotchas (each cost real debugging time; numbers are stable — docs/READMEs cite them)

1. **Pin `wc3maptranslator@5.0.0`.** Unpinned resolves to 4.0.4 which has a
   different, broken API. v5 API is static methods:
   `InfoTranslator.warToJson(buffer)` → `{json}`,
   `InfoTranslator.jsonToWar(json)` → `{buffer}`.
2. **Reforged formats only** in wc3maptranslator (w3i v33, w3e v12, objects
   v3): other versions throw — sometimes a version message, often a bare
   `RangeError: offset out of range`. BUT real published maps (2023–2026,
   incl. 1.36/2.0-editor-saved) ship **w3e v11** terrain and **w3i v25/v31**
   info — those now have first-class read+WRITE codecs (`lib/codecs/`,
   routed by lib/filemap.js off the binary version dword / the JSON
   `"version"` marker) and land in normal editable terrain.json/info.json
   with byte-faithful write-back (exact v11↔v12 / v25↔v31↔v33 deltas:
   docs/FORMATS.md). Only versions no codec covers (w3i v18, objects v1/v2,
   classic doo, ...) still take the old path: map-to-json catches ANY
   translator throw — file copied raw (manifest.json → `errors`) plus a
   READ-ONLY mdx-m3-viewer-th parse under `_viewer/` (viewer schema, never
   repacked — not build-source); viewer failures land in
   `viewerFallbackErrors`; a truncated classic w3i gets a tolerant read via
   lib/classicw3i.js. Don't "fix" the upstream throw — add/route a codec in
   filemap.js instead.
3. **512-byte HM3W pre-header**: StormLib reads `.w3x` directly but creates
   bare MPQs. w3x-pack builds the header from `_header.json` (or synthesizes
   one); stormlib-node pre-writes it and `SFileCreateArchive` converts it
   (MPQ lands at offset 512), smpq gets it prepended afterwards. MPQ must be
   **v1** (`MPQ_CREATE.ARCHIVE_V1` / `smpq -M 1`) for the game.
4. **Protected maps have no `(listfile)`** — named extraction falls back to
   probing known names (`lib/mpq.js` KNOWN_FILES); unresolved members
   enumerate as `FileNNNNNNNN` pseudo-names on BOTH backends. `extractAll`
   returns `{ extracted, total, unresolved, unknown }` — always report the
   counts so anonymous imports aren't silently dropped (w3x-extract prints
   them). Names are genuinely lost, but CONTENT is recoverable:
   `--dump-unknown` / `WC3_EXTRACT_UNKNOWN=1` writes them under
   `_unknown/FileNNNNNNNN.<ext>` with a content-sniffed extension.
   `_unknown/` is diagnostics only — map-to-json skips underscore paths,
   nothing repacks them. Always verify extraction ON DISK: smpq exits 0
   even when a name misses.
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
14. **Custom MDX must pass mdx-m3-viewer's sanityTest (0 errors/severes)** or
    the game hard-crashes at load. Classic traps: an unspecified Bone
    GeosetAnimId defaults to 0 — invalid with no GeosetAnim chunk (write
    `GeosetAnimId None` or add a GeosetAnim); missing "Death" sequence;
    missing "Origin Ref" attachment. validate-map enforces this bar on
    every packed .mdx/.mdl.
15. **mdx-m3-viewer-th must be fed `new Uint8Array(fs.readFileSync(p))`,
    NEVER a Node Buffer** — its MPQ code mutates the input in place and
    misparses. NEVER use its MPQ save/write path (locale/platform field
    swap → broken archives): open readonly, output is diagnostics only
    (`lib/viewer.js` enforces both). Its w3c parser disagrees with the
    other stacks on the 1.32 camera layout — w3c is excluded from the
    second opinion (docs/FORMATS.md).
16. **wts strings (strings.json values) must stay ASCII-only**:
    wc3maptranslator truncates every char to one byte on write but decodes
    UTF-8 on read — any non-ASCII char is mangled (em dash → control byte).
    Spell it in ASCII: `--`, straight quotes, `...`.
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

## Testing & validation doctrine

- `npm test` = 124 tests, 16 files: source⇄binary fixed points for all four
  bundled maps, build+validate end-to-end, MPQ backends, version codecs
  (synthetic v11/v25/v31 fixtures cross-checked against mdx-m3-viewer-th +
  guarded real-sample fixpoints), classic/protected fallbacks (`_viewer/`,
  `_unknown/`, classicw3i), luacheck, gotcha regressions. Both backends when
  touching archive code (`npm run test:smpq`).
- `validate-map` layers: HM3W header + MPQ magic at 512 → extraction →
  required files (w3i/w3e) + script presence → luaparse gate → per-file
  translator parse PLUS JSON→binary→JSON stability → object-data semantic
  lint (lib/objectlint.js — WARN lines for gotchas 22/23/25, never failures;
  exit stays 0) → mdx-m3-viewer-th second opinion (independent MPQ open;
  parses wpm/shd/mmp/wct which the translator can't; MDX sanityTest
  0 errors/0 severes on every packed model).
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
  (terrain v11 read+write), w3i31.js (info v25/v31 read+write); same JSON
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
- `docs/PIPELINE.md` — workflows §1–7 (read/edit/new/import/validate/War3Net/
  A-B naming); `docs/FORMATS.md` — format knowledge, tileset FourCC tables,
  references; `docs/ASSETS.md` — asset sourcing/conversion + legal;
  `docs/reference/fotn-analysis.md` — worked decomposition example
- `.claude/skills/` — wc3-read-map, wc3-build-map, wc3-new-map,
  wc3-import-asset (operational recipes)
