# Warcraft III map format notes

Knowledge collected while building/validating this toolkit. For byte-level
specs see the references at the bottom.

## The .w3x container

A `.w3x` map is a **512-byte HM3W pre-header followed by an MPQ archive**:

```
offset 0    char[4]  'HM3W'            magic
offset 4    u32      unknown (0)
offset 8    cstring  map name          null-terminated
            u32      map flags
            u32      max players
            ...      zero padding up to offset 512
offset 512  'MPQ\x1a'                  the MPQ archive starts here
```

**The pre-header flags dword mirrors the w3i map flags** — World Editor
writes the exact same value in both places (see War3Net
`MapInfoExtensions.WriteArchiveHeaderToStream`: magic, 0, name,
`(int)mapInfo.MapFlags`, player count). A .w3x with header flags 0 but a
populated w3i diverges from anything WE produces and trips up strict
pickers/parsers. tools/w3x-pack.js therefore derives the header flags from
the packed `war3map.w3i` (`readW3iFlags` in lib/header.js) whenever
`_header.json` carries flags 0.

- StormLib (stormlib-node and smpq alike) **reads** `.w3x` directly (it scans
  for the MPQ magic at 512-byte offsets). For **creation**, this toolkit's
  primary path pre-writes the 512-byte header to the output file and lets
  `SFileCreateArchive` *convert* it — StormLib appends the MPQ at the next
  512-byte boundary, i.e. exactly offset 512, no concat step. The smpq CLI
  fallback can only create bare MPQs, so there the header is prepended
  afterwards (both paths live in `lib/mpq.js createArchive`; `_header.json`
  holds the fields).
- Warcraft III expects **MPQ format version 1**: `MPQ_CREATE.ARCHIVE_V1`
  (stormlib-node) / `smpq -M 1` (smpq defaults to v4).
- MPQ member paths use `\` separators, but StormLib's name hashing treats
  `/` and `\` identically, so adding/extracting with `/` works fine.
- Both backends automatically maintain a `(listfile)`. **Protected maps**
  strip it; files can then only be extracted by exact name (hash lookup still
  works) — `lib/mpq.js` probes a built-in KNOWN_FILES list as a fallback.
  Enumeration without a listfile yields `FileNNNNNNNN` pseudo-names on BOTH
  backends (smpq is StormLib-based too), never the real paths; extraction
  success is always verified on disk because smpq exits 0 even on a miss.
  `extractAll` returns `{ extracted, total, unresolved, unknown }` so callers
  can report how many anonymous members exist rather than silently dropping
  them (`w3x-extract.js` prints the counts). Pass `{ dumpUnknown: true }` (or
  set `WC3_EXTRACT_UNKNOWN=1`, or `w3x-extract --dump-unknown`) to also dump
  the unresolved members under `_unknown/FileNNNNNNNN.<ext>` with a
  content-sniffed extension (`MDLX`→`.mdx`, `BLP1`/`BLP2`→`.blp`, printable
  text→`.txt`, else `.bin`); StormLib opens pseudo-names by their encoded
  block index, and dumps that duplicate a name-probed extraction are skipped.
  The `_unknown/` dump is diagnostics only (map-to-json skips underscore
  paths). The true archive path is not stored anywhere in the MPQ, but the
  map must reference its own files to work, so most names can be harvested
  back out of the content and verified by hash probe —
  `w3x-extract --recover-names` / `lib/recover.js` (see docs/PIPELINE.md §1);
  only members the map never references by path stay anonymous.
- **Protection traps**: beyond stripping the listfile, protectors replace
  files the game tolerates being broken with tiny stubs whose entry-count
  field is garbage (observed in the wild: an 8-byte `war3map.w3r` declaring
  ~1.26 billion regions) so that naive parsers loop or allocate GBs.
  `lib/traps.js` detects the pattern before any parser runs (tiny file +
  count that cannot fit); tools degrade to WARN + raw pass-through.
- Reforged also reads loose directories named `*.w3x/` (an "extracted map
  folder", e.g. wc3-ts-template's `maps/map.w3x/`) — handy for reference.

## war3map.* file inventory

Translatable via wc3maptranslator@5 (JSON name used by this toolkit):

| Archive file | Content | Format version | JSON |
| --- | --- | --- | --- |
| war3map.w3i | map info, players, forces | **v33** (upstream translator) + **v25/v31** via lib/codecs/w3i31.js (JSON gains `"version": 25\|31`) | info.json |
| war3map.w3e | terrain heightmap/tiles | **v12** (upstream translator) + **v11** via lib/codecs/w3e11.js (JSON gains `"version": 11`) | terrain.json |
| war3map.doo | doodads/destructables | v8 | doodads.json |
| war3mapUnits.doo | preplaced units/items, start locations | v8 subver 11 | units.json |
| war3map.w3r | regions | v5 | regions.json |
| war3map.w3c | cameras | v0 | cameras.json |
| war3map.w3s | sounds | v3 | sounds.json |
| war3map.wts | trigger strings (TRIGSTR_n) | text | strings.json |
| war3map.imp | imported-file manifest | v1 | imports.json |
| war3map.w3u/w3t/w3b/w3d/w3a/w3h/w3q | object data: units/items/destructables/doodads/abilities/buffs/upgrades | **v3** (upstream translator) + **v1/v2** via lib/codecs/objects2.js (JSON gains `"version": 1\|2`) | objects-*.json |
| war3mapSkin.w3u/w3t/w3d/w3a/w3h/w3q | Reforged skin-mode object overrides (same v3 format) | v3 (+ v1/v2 routed identically) | objects-*-skin.json |

**war3mapSkin.w3b split**: Reforged splits destructable data across
`war3map.w3b` + `war3mapSkin.w3b` (visual "skin" fields like `bnam`, `bfil`,
`bmmr`... live in the skin file). wc3maptranslator@5's ObjectsTranslator
merges both into one JSON on read and re-splits on write
(`jsonToWar('destructables', ...)` returns `{buffer, bufferSkin}`).
This toolkit maps the pair to a single `objects-destructables.json`.

Opaque (copied verbatim, under `files/` in a map source):

| File | Content | Notes |
| --- | --- | --- |
| war3map.lua / war3map.j | map script | kept at map-source top level (it IS the editable form); sometimes at `scripts\war3map.j` |
| war3map.shd | shadow map | raw `width*4 × height*4` bytes (terrain tiles ×4; byte 0 = no shadow). build-map auto-generates a no-shadow default from terrain.json when the source ships no `files/` copy, and WARNs when a provided copy's size mismatches the terrain dims (lib/pathing.js, gotcha 8) |
| war3map.wpm | path map | `'MP3W'` + i32 version(0) + i32 w + i32 h + w×h flag bytes (w/h = tiles ×4; flag byte 0 = fully passable). Auto-generated / dimension-checked like war3map.shd (lib/pathing.js) |
| war3map.mmp | minimap icons | i32 format(0) + i32 count + 16-byte entries: i32 iconType (0 gold mine, 1 neutral building, 2 start location), i32 x, i32 y (0–255 minimap coords, y flipped), u8[4] color BGRA (start locations = player color). Generated by lib/minimap.js; algorithm mirrors War3Net `MapFactory.PreviewIcons` |
| war3mapMap.blp / .tga | minimap image | 256×256; the game accepts TGA in this slot (standard member name in War3Net's/mdx-m3-viewer's listfiles); BLP decodable with war3-model's `decodeBLP`. **Every real map ships one** — build-map auto-generates a TGA from terrain.json when the source has none |
| war3mapPreview.tga | custom preview | |
| war3map.wtg / war3map.wct | GUI triggers + custom text triggers | no translator in wc3maptranslator@5; mdx-m3-viewer has parsers |
| war3map.w3f | campaign info | campaigns only |
| war3mapMisc.txt / war3mapSkin.txt / war3mapExtra.txt | ini-style gameplay constants/skins | plain text |
| *.mdx *.blp *.wav ... | imported assets | parse models with war3-model |

## Classic vs Reforged — THE gotcha

`wc3maptranslator@5.0.0` supports **only current Reforged-era formats**
(w3i v33, w3e v12, object data v3, doo v8). Files from classic-era maps
(w3i v18/v25, w3e v11, object data v1/v2) throw:

```
Error: WC3MapTranslator cannot currently parse this version of a war3map file
```

**Version codecs (lib/codecs/)** close the worst of this gap: real published
maps — including ones saved by the current 1.36/2.0 editors — ship **w3e v11**
terrain and (strategy maps) **w3i v31**, which lib/filemap.js now routes to
first-class read+write codecs BEFORE any fallback. Their JSON is the exact
upstream dialect plus a top-level `"version"` marker, lands in the normal
terrain.json/info.json, and compiles back byte-faithfully (verified as
read→write byte fixpoints on four real 2023–2026 maps). The exact deltas,
established against mdx-m3-viewer-th, War3Net and the real samples:

- **w3e v11 ↔ v12**: only per-corner field 3 differs — u8 in v11
  (groundTexture bits 0–3, ramp/blight/water/boundary flags bits 4–7) vs
  u16 LE in v12 (groundTexture bits 0–5, same flags at bits 6–9); corners
  are 7 vs 8 bytes. The codec normalizes JSON `flags` to the v12 bit
  positions, so switching a source between versions is just the marker
  (palette ≤ 16 tiles and flags ≤ 0x3C0 required for v11).
- **w3i v31 ↔ v33**: v33 appends exactly three i32s after gameDataVersion —
  forceDefaultCameraZoom + forceMaxCameraZoom (v32) and forceMinCameraZoom
  (v33). Everything else (gameVersion, scriptLanguage, supportedModes,
  gameDataVersion, per-player enemy priority masks) already exists in v31.
- **w3i v25 ↔ v31** (classic TFT, also codec-supported): v25 lacks
  gameVersion + scriptLanguage (v28+) and supportedModes + gameDataVersion +
  per-player enemyLow/HighPriority masks (v31+).
- The w3i codec adds optional fidelity fields the upstream dialect can't
  express: `map.flagsUnknown` (unnamed flag bits — real maps carry 0x8 and
  WE's always-set 0x400/0x4000) and raw `playersMask` /
  `*PriorityFlagsMask` passthroughs (bits 24–31 are common in real files).
- **object data v2 ↔ v3** (w3u/w3t/w3b/w3d/w3a/w3h/w3q, via
  lib/codecs/objects2.js): v3 wraps each object's modification list in
  "sets" — after oldId/newId, v3 reads a u32 sets count, then a u32 set
  flag per set before the u32 modification count (WE/upstream always write
  one set, flag 0 — 8 extra bytes per object). That is the ONLY delta: the
  modification record itself is identical across v1/v2/v3, including the two
  extra i32s (level/variation + data column) that the LEVELED types
  (w3d/w3a/w3q) carry at every version — a per-type property, not a v3
  addition. **v1 ↔ v2: no layout difference at all** (confirmed against
  mdx-m3-viewer-th, War3Net and WC3MapSpecification; v1 is just an older
  marker value, read+written identically). v2 is NOT merely legacy: the
  current Wurst toolchain emits it (Island Troll Tribes v3.9c, all seven
  object files), DracoL1ch DotA ships v2 w3a/w3b/w3d, and classic WE saves
  (X Hero Siege 2024) are v2 — all verified read→write byte fixpoints
  (test/objects2.test.js). Fidelity extension: each modification's trailing
  u32 "sanity check" is re-synthesized by convention on write (original
  table → base-id bytes, custom table → 0, matching upstream's v3 writer);
  when a real file deviates (Wurst writes the custom id there, DotA/WE mix
  zeros and ids), the modification gets a raw `sanityCheck` (u32)
  passthrough. Note the war3mapSkin.* split is a Reforged container
  convention, not part of the binary format — at v1/v2 the codec never
  splits destructable "skin" fields out (`bnam` etc. are ordinary main-file
  fields in the classic format).

Remaining consequences for everything OLDER than those versions:

- Classic maps (most Hive Workshop archives, all original Blizzard maps) can
  be **extracted and repacked** but not fully JSON-translated. map-to-json
  copies untranslatable files raw and records errors in `manifest.json` —
  and for version rejections it additionally writes a **read-only
  mdx-m3-viewer-th parse under `_viewer/<name>.json`** (viewer object schema,
  `manifest.json` → `viewerFallback`). That output is diagnostics only:
  json-to-map/build-map ignore `_viewer/` and cannot compile it back.
  With the codecs in place this now applies to w3i v18, classic `.doo`
  etc. — not to w3e v11 / w3i v25/v31 / object data v1/v2.
- The wc3-ts-template repo's `maps/map.w3x/` folder is classic-format:
  its `.doo`, `w3r`, `w3c`, `wts`, `Units.doo` parse fine, but `w3i`/`w3e`
  do not. This repo's `maps/demo/` was therefore built in current formats
  from scratch (derived from WC3MapTranslator's MIT test fixtures).
- For deeper classic parsing, use War3Net (C#) — see scripts/crossvalidate-war3net.sh.

Also note: **do not use unpinned `wc3maptranslator`** — npm resolves it to
4.0.4, which has a different (instance-method) API and broken behavior.
5.0.0 exposes static `warToJson(buffer)` / `jsonToWar(json)` per translator.

## Terrain: tileset & tile FourCCs (w3e `tilePalette` / `cliffTilePalette`)

Ground-tile ids are `<tileset letter><3-char type>` (e.g. `Ldrt`); cliff-tile
ids are `C<tileset letter><2-char type>` (e.g. `CLdi`). The tileset letter is
the w3e `tileset` field. **Do not invent FourCCs** — a tile id that isn't in
the game's `TerrainArt\Terrain.slk` / `CliffTypes.slk` renders wrong or not
at all. Values below were read from World-Editor-generated default `.w3e`
files (War3Net test data) and cross-checked against War3Net's
`TerrainType` enum; they match this repo's committed maps.

Lordaeron Summer (`L`) ground tiles and cliffs:

| FourCC | Tile |
| --- | --- |
| `Ldrt` | Dirt |
| `Ldro` | Rough Dirt |
| `Ldrg` | Grassy Dirt |
| `Lrok` | Rock |
| `Lgrs` | Grass |
| `Lgrd` | Dark Grass |
| `CLdi` / `CLgr` | Dirt Cliff / Grass Cliff |

Northrend (`N`) ground tiles and cliffs:

| FourCC | Tile |
| --- | --- |
| `Ndrt` | Dirt |
| `Ndrd` | Dark Dirt |
| `Nrck` | Rock |
| `Ngrs` | Grass |
| `Nice` | Ice |
| `Nsnw` | Snow |
| `Nsnr` | Rocky Snow |
| `CNdi` / `CNsn` | Dirt Cliff / Snow Cliff |
| `CNc1` / `CNc2` | Cliff type 1 / 2 (indexed cliff-id dialect) |

`CNc1`/`CNc2` are the indexed `C<tileset letter>c<N>` cliff-id dialect seen
in real `.w3e` files (cliff TYPE by palette index rather than by material
name). They are **game-verified**: maps/tidewatch-arena ships exactly
`["CNc1", "CNc2"]` as its `cliffTilePalette` and rendered its raised ice
arena correctly in the in-game playtest.

WE default palettes for all tilesets (ground tiles | cliff tiles):

| Letter | Tileset | Default tilePalette | Default cliffTilePalette |
| --- | --- | --- | --- |
| `A` | Ashenvale | Adrt Adrd Agrs Arck Agrd Avin Adrg Alvd | CAgr CAdi |
| `B` | Barrens | Bdrt Bdrh Bdrr Bdrg Bdsr Bdsd Bflr Bgrr | CBde CBgr |
| `C` | Felwood | Cdrt Cdrd Cpos Crck Cvin Cgrs Clvg | CCgr CCdi |
| `D` | Dungeon | Ddrt Dbrk Drds Dlvc Dlav Ddkr Dgrs Dsqd | CDdi CDsq |
| `F` | Lordaeron Fall | Fdrt Fdro Fdrg Frok Fgrs Fgrd | CFdi CFgr |
| `G` | Underground | Gdrt Gbrk Grds Glvc Glav Gdkr Ggrs Gsqd | CGdi CGsq |
| `I` | Icecrown Glacier | Idrt Idtr Idki Ibkb Irbk Itbk Iice Ibsq Isnw | CIsn CIrb |
| `J` | Dalaran Ruins | Jdrt Jdtr Jblm Jbtl Jsqd Jrtl Jgsb Jhdg Jwmb | CJdi CJsq |
| `K` | Black Citadel | Kdrt Kfsl Kdtr Kfst Ksmb Klgb Ksqt Kdkt | CKdi CKdt |
| `L` | Lordaeron Summer | Ldrt Ldro Ldrg Lrok Lgrs Lgrd | CLdi CLgr |
| `N` | Northrend | Ndrt Ndrd Nrck Ngrs Nice Nsnw Nsnr | CNdi CNsn |
| `O` | Outland | Odrt Odtr Osmb Ofst Olgb Orok Ofsl Oaby | COdi COrd |
| `Q` | Village Fall | Qdrt Qdrr Qcrp Qcbp Qstp Qgrs Qrck Qgrt | CQdi CQgr |
| `V` | Village | Vdrt Vdrr Vcrp Vcbp Vstp Vgrs Vrck Vgrt | CVdi CVgr |
| `W` | Lordaeron Winter | Wdrt Wdro Wsng Wrok Wgrs Wsnw | CWgr CWsn |
| `X` | Dalaran | Xdrt Xdtr Xblm Xbtl Xsqd Xrtl Xgsb Xhdg Xwmb | CXdi CXsq |
| `Y` | Cityscape | Ydrt Ydtr Yblm Ybtl Ysqd Yrtl Ygsb Yhdg Ywmb | CYdi CYsq |
| `Z` | Sunken Ruins | Zdrt Zdtr Zdrg Zbks Zsan Zbkl Ztil Zgrs Zvin | CZdi CZlb |

Where to find more (per-tile display names, non-default combinations):
wc3maptranslator's `TerrainTranslator` source has the tileset-letter enum
(`node_modules/wc3maptranslator/dist/src/translators/TerrainTranslator.js`);
War3Net's `War3Net.Build.Core/Environment/TerrainType.cs` names every ground
and cliff tile; the authoritative in-game lists are the
`TerrainArt\Terrain.slk` and `TerrainArt\CliffTypes.slk` game data files
(see the WC3MapSpecification Terrain docs for the w3e layout itself).

**Terrain JSON orientation**: terrain.json's per-vertex arrays are row-major
`(width+1)×(height+1)` with **row 0 = map NORTH (top)**; index =
`row*(width+1)+col`, col 0 = map west. The w3e file itself stores rows
bottom-up (south first) — wc3maptranslator reverses row order on read/write,
so JSON row 0 is the top row you'd see in the World Editor and on the
generated minimap (lib/minimap.js relies on this). World y DEcreases as the
row index grows; world x increases with col.

## Misc format facts learned the hard way

- w3e ground height `8192` = ground level zero; `layerHeight` 2 = default
  layer; a `width×height`-tile map has `(width+1)×(height+1)` vertices;
  one tile = 128 world units.
- **war3mapUnits.doo is editor-only data.** The game creates only
  script-created units: WE compiles unit placements into a
  `CreateAllUnits()` function in the map script (map protectors delete
  Units.doo with no in-game effect). A map whose script never creates the
  units simply starts empty. build-map generates `CreateAllUnits()` from
  units.json into the packed war3map.lua (lib/unitscript.js); `sloc` start
  locations are excluded — they belong in `config()`'s
  `DefineStartLocation` calls.
- Rotations in `units.json`/`doodads.json` are degrees in JSON but stored as
  float32 radians — they do NOT round-trip exactly (270° → 269.977°...).
  JSON stabilizes after one write/read cycle; the committed demo source is
  such a fixed point.
- Null FourCC values (e.g. "no weather") read back as the ASCII string
  `'0000'`, not `'\0\0\0\0'` — keep the `'0000'` form in JSON. **But never
  write that dialect back verbatim**: wc3maptranslator's jsonToWar emits the
  literal ASCII bytes `"0000"` (0x30303030) for it, which parsers reject as
  an invalid enum (War3Net: "808464432 not defined for WeatherType") and
  which diverges from WE's four zero bytes. lib/source.js normalizes
  `globalWeather` `'0000'`/null → `''` before translating so the emitted w3i
  carries `00 00 00 00`.
- **Custom MDX models must be sanity-clean or the game hard-crashes on map
  load.** Verify with mdx-m3-viewer's sanityTest (0 errors AND 0 severes).
  Requirements hit in practice: every Bone's `geosetAnimId` must reference a
  real GeosetAnim or be `None`/-1 (war3-model's parseMDL defaults an
  unspecified GeosetAnimId to 0 — invalid when the model has no GEOA chunk);
  a "Death" sequence must exist; an "Origin Ref" attachment should exist.
  sanityTest gotcha: load models with `new Uint8Array(fs.readFileSync(p))`,
  never a Node Buffer.
- Gold mines (`ngol`) gain a `gold` field on read (default 12500).
- `info.json` `scriptLanguage`: 0 = JASS, 1 = Lua. The game then expects
  `war3map.j` or `war3map.lua` respectively.
- HM3W name is null-terminated; keep it under ~495 bytes so flags/maxPlayers
  fit in the 512-byte block.

## MPQ practical notes

- WC3 reads **MPQ format v1 only** (this toolkit's `MPQ_CREATE.ARCHIVE_V1` /
  `smpq -M 1`; v2–v4 are later Blizzard games).
- Compression: **zlib/DEFLATE is the safe choice** for every file; avoid
  bzip2 for classic-compatible maps (later Storm feature, patchy support).
- `(listfile)` is optional for the *game* (files are found by name hash) but
  required by editors/tools to enumerate contents — protected maps delete it
  on purpose. smpq maintains one automatically.
- Storm requires the MPQ header to sit at a **512-byte-aligned offset** in
  the file — the 512-byte HM3W pre-header satisfies this exactly; never pad
  it to any other size.

## Map scripting notes

- **Lua** is supported since patch 1.31; select it with `info.json`
  `scriptLanguage: 1` + `war3map.lua` (0 = JASS + `war3map.j`).
- **JASS** tooling: syntax-check with pjass (https://github.com/lep/pjass);
  https://github.com/lep/jassdoc is a machine-readable reference for the
  native API (also useful for Lua, since natives are exposed 1:1).
- **WurstScript** is the maintained compiler-toolchain option (`grill` build
  tool; official Docker image `frotty/wurstscript`) if a higher-level
  language than Lua/JASS is wanted.
- Reforged also supports **folder-mode maps** (a loose `*.w3x/` directory
  instead of an archive). Beware: World Editor **clobbers the whole folder on
  save** — keep sources elsewhere (this toolkit's map-source layout already
  does).

## stormlib-node (the primary MPQ backend)

`lib/mpq.js` uses stormlib-node whenever the native module is loadable and
falls back to the smpq CLI otherwise (`WC3_MPQ_BACKEND=smpq` forces the
fallback; `WC3_MPQ_BACKEND=stormlib` requires the native module). Sharp edges
— all encapsulated in lib/mpq.js, never call the bindings elsewhere:

- `SFileGetFileSize` returns a **BigInt** — `Number(size)` before use.
- `SFileReadFile` requires an **ArrayBuffer**; passing a Node Buffer causes a
  **native SIGABRT** (process death, not an exception).
- **NEVER pass `MPQ_FILE.REPLACEEXISTING` to `SFileAddFileEx`** — a
  signed-int coercion bug (the flag is 0x80000000) silently disables
  compression and files get stored raw. Create archives fresh instead.
- `SFileRemoveFile` on `(listfile)`/`(attributes)` fails with ERR:10003 —
  they cannot be stripped this way; don't try.
- `SFileCreateArchive` on an existing non-MPQ file **converts** it: the MPQ
  is appended at the next 512-byte boundary. Pre-writing the HM3W header
  therefore yields a finished `.w3x` in one pass.
- Members with no listfile entry enumerate as `File%08u.xxx` pseudo-names;
  exact-name lookups (`SFileHasFile`/`SFileOpenFileEx`) still work, AND
  `SFileOpenFileEx` opens the pseudo-name itself (it encodes the block
  index) — which is how `extractAll`'s `_unknown/` dump recovers content
  from members whose real path is lost. `SFileHasFile` on a pseudo-name
  returns false (it hashes the name), so open it directly.
- Same ArrayBuffer rule applies to war3-model's `parseMDX`:
  `buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)`.

## mdx-m3-viewer-th (second-opinion parser stack)

Used read-only by validate-map (cross-validation incl. wpm/shd/mmp and MDX
sanity) and map-to-json (classic-format fallback reader). Rules
(`lib/viewer.js` enforces them):

- **Feed it `new Uint8Array(fs.readFileSync(p))`, never a Node Buffer** —
  its MPQ code decrypts/mutates the input in place; a Buffer (a view over
  Node's shared allocation pool) gets corrupted and misparses. The MDX
  parser slices `.buffer`, with the same failure mode.
- **Never use its MPQ save/write path** (`War3Map.save`, `archive.set`):
  a known locale/platform field swap emits broken archives. Always load with
  `readonly = true`.
- Its **w3c parser disagrees** with wc3maptranslator *and* War3Net on the
  1.32+ camera layout (it reads the camera name *before*
  localPitch/localYaw/localRoll; the others write it *after*), so
  war3map.w3c is excluded from the second opinion.
- `war3map.wtg` parsing needs the game's TriggerData.txt (not shipped) —
  also excluded. (READ-level wtg visibility exists elsewhere: the War3Net
  cross-validator's `--dump-triggers` mode, docs/PIPELINE.md §6.)
- **w3i v33 verdict (2026-07 audit item)**: the pinned fork (5.13.4) DOES
  parse w3i v33 — verified empirically against a bundled 2.0-editor map:
  full-file consumption (`getByteLength()` == file size), fields agree with
  wc3maptranslator (name/players/forces), and the v33-only fields
  (scriptMode, graphicsMode, default/max/min camera zoom) are read. No bump
  needed; test/build.test.js's `PASS viewer parse war3map.w3i` assertion on
  the built demo (v33) is the standing regression gate.
- **MDX v1000 verdict (2026-07 audit item)**: `sanityCheckModel` handles
  Reforged-version models — a synthetic v1000 model (war3-model
  version-aware writer, v900+ material shader/layer layout) parses with
  content intact, passes 0-errors/0-severes when clean AND still yields
  error-tier findings when broken (invalid Bone GeosetAnimId), so the
  strict build-map gate (gotcha 14) can be trusted at v1000. Pinned by
  test/mdx-v1000.test.js, which generates the fixture at test time from a
  committed v800 model. Honest scope: the fixture is SD content tagged
  v1000 — HD features (skin weights, tangents, HD shaders) are not
  exercised.

## References

- WC3 map file spec: https://github.com/ChiefOfGxBxL/WC3MapSpecification
- wc3maptranslator (JSON translators): https://github.com/ChiefOfGxBxL/WC3MapTranslator
- HiveWE (C++ world editor, format docs in wiki): https://github.com/stijnherfst/HiveWE
- War3Net (C# full map/campaign lib, classic+reforged): https://github.com/Drake53/War3Net
- mdx-m3-viewer (JS parsers incl. wtg/wct/mdx/blp — good fallback): https://github.com/flowtsohg/mdx-m3-viewer
- pjass (JASS syntax checker): https://github.com/lep/pjass
- jassdoc (JASS native documentation): https://github.com/lep/jassdoc
- Lua map scripting: the game calls `config()` (lobby) and `main()` (start);
  common.j natives are exposed to Lua 1:1 (`FourCC('hfoo')` for rawcodes).
