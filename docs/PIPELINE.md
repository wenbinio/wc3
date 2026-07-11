# End-to-end workflows

All commands run from the repo root. Run `bash scripts/setup.sh` once first.
Everything is headless — no Warcraft III installation needed.

## 1. Read an existing map

```bash
node tools/w3x-extract.js path/to/somemap.w3x /tmp/work/extracted
node tools/map-to-json.js /tmp/work/extracted /tmp/work/src
```

- `extracted/` holds the raw archive members (`war3map.w3e`, `war3map.w3i`, ...)
  plus `_header.json` (the parsed 512-byte HM3W pre-header).
- `src/` is the editable map source: JSON for every translatable file,
  scripts (`war3map.lua`/`war3map.j`) at top level, everything else copied
  verbatim under `files/`, and a `manifest.json` describing what happened.

Inspect quickly:

```bash
node -e "const i=require('/tmp/work/src/info.json'); console.log(i.map.name, i.players.length + ' players')"
```

Gotchas:

- **Classic (pre-Reforged) maps**: `war3map.w3i`/`w3e`/object files fail in
  wc3maptranslator@5 — sometimes with its version message, but often with a
  plain `RangeError: offset out of range` (e.g. classic `war3map.doo` v8).
  `map-to-json.js` handles ANY such throw: the file is copied through raw
  under `files/` and the error is recorded in `manifest.json` → `errors`. You
  can still edit scripts/assets and repack. Additionally, on any translator
  failure a fallback parse via mdx-m3-viewer-th is attempted for every file
  the viewer has a parser for, written to `_viewer/<name>.json` (listed in
  `manifest.json` → `viewerFallback`). **`_viewer/` is read-only diagnostics**
  in the viewer's own object schema — it is *not* the build-source dialect:
  json-to-map/build-map ignore it entirely (underscore paths never enter an
  archive), so use it to inspect classic maps, never to edit them.
  - When even the viewer's own parser throws (common with protector-truncated
    files), the failure is recorded in `manifest.json` →
    `viewerFallbackErrors` and warned about on stderr — never swallowed. A
    truncated **classic** `war3map.w3i` additionally gets a tolerant
    second-tier read via `lib/classicw3i.js` (header through forces, tolerant
    of a chopped tail; output tagged `_schema: wc3-map-toolkit-classic-w3i`
    with `_truncated`/`_truncatedAt`).
- **Protected maps**: the MPQ `(listfile)` is stripped, so member names are
  unrecoverable and every entry enumerates as a `FileNNNNNNNN` pseudo-name
  (both backends). `w3x-extract.js` falls back to probing a built-in list of
  known `war3map.*` names — you still get the standard files. It **always
  prints entry counts** (`archive entries: N — named extracted: X,
  unresolved (anonymous): Y`) so you can see how many custom imports remain
  hidden. To recover those anonymous members, rerun with `--dump-unknown`
  (or `WC3_EXTRACT_UNKNOWN=1`): each unresolved member is written under
  `_unknown/FileNNNNNNNN.<ext>` with a content-sniffed extension (`MDLX`→
  `.mdx`, `BLP1`/`BLP2`→`.blp`, text→`.txt`, else `.bin`; duplicates of
  named extractions are skipped). **`_unknown/` is diagnostics only** —
  map-to-json skips it (recorded in `manifest.json` → `skipped`) and it never
  re-enters a rebuilt archive; the original archive path is genuinely lost, so
  a repacked map won't reference these files.
- **MPQ backends**: archive I/O uses the stormlib-node native module when
  loadable and the smpq CLI otherwise. Force the fallback with
  `WC3_MPQ_BACKEND=smpq` (e.g. `npm run test:smpq` runs the whole test suite
  that way — do that whenever you touch lib/mpq.js).

## 2. Modify a map and rebuild it

```bash
# ... edit /tmp/work/src/info.json, units.json, war3map.lua, etc ...
node tools/json-to-map.js /tmp/work/src /tmp/work/rebuilt
node tools/w3x-pack.js /tmp/work/rebuilt /tmp/work/modified.w3x
node tools/validate-map.js /tmp/work/modified.w3x
```

`_header.json` is carried through automatically so the original HM3W
pre-header (map name/flags/maxPlayers) is preserved. Edit it to change the
lobby-visible map name.

Shortcut: `node tools/build-map.js /tmp/work/src /tmp/work/modified.w3x`
does json-to-map + pack in one step.

## 3. Build a new map from scratch

Start from the demo template:

```bash
cp -r maps/demo maps/mymap
# edit maps/mymap/{info,terrain,units,doodads,strings}.json and war3map.lua
node tools/build-map.js maps/mymap _build/mymap.w3x
node tools/validate-map.js _build/mymap.w3x
```

Things that must stay consistent with each other:

- `terrain.json` `map.width/height` (tiles) ⇒ all per-vertex arrays have
  `(width+1)*(height+1)` entries; world coords span `width*128` centered on
  `map.offset`.
- `files/war3map.wpm` and `files/war3map.shd` sizes derive from terrain size
  (`width*4 × height*4` cells). If you resize terrain, regenerate them
  (see maps/demo — they are all-zero buffers plus a 16-byte wpm header).
- `info.json` `players[].startingPos` ⇔ `units.json` `sloc` entries ⇔
  `DefineStartLocation`/`SetPlayerStartLocation` calls in `war3map.lua`.
- `info.json` `scriptLanguage`: **1 for Lua, 0 for JASS.** Ship `war3map.lua`
  defining `config()` and `main()` (see `maps/demo/war3map.lua`); for JASS
  ship `war3map.j` instead.
- `info.json` `camera.bounds` should sit inside the terrain extent.
- `info.json` `forces` must contain at least one force covering the players
  (every WE map has ≥1) — `[]` is another pick-time divergence.

### Preplaced units actually spawn via CreateAllUnits() (generated)

`war3mapUnits.doo` is **editor-only**: the game spawns only script-created
units (WE compiles placements into `CreateAllUnits()`; map protectors delete
Units.doo freely). On every build, build-map appends a marker-delimited block
to the **packed** `war3map.lua` (the source file is never modified):

- `function CreateAllUnits()` — one `CreateUnit` per non-`sloc` entry of
  `units.json` (position/facing/player), plus `SetResourceAmount` for gold
  mines, `SetHeroLevel/Str/Agi/Int` where relevant, and
  `SetUnitAcquireRange(u, 200)` for camp-acquisition creeps
  (`targetAcquisition: -2`). `sloc` entries are skipped — start locations
  belong in `config()`'s `DefineStartLocation` calls.
- Your `main()` should call `CreateAllUnits()` (before any code that
  enumerates preplaced units — see maps/crossroads-siege/war3map.lua). If the
  script never mentions `CreateAllUnits`, the block additionally wraps
  `main()` so the units are created right after your `main()` returns.
- The block is stripped and regenerated each build, so extracted sources
  repack cleanly. Edit units.json, not the generated Lua — units.json stays
  the single source of truth. JASS sources (`war3map.j`) are copied
  untouched; write your own `CreateAllUnits` there.
- **Stabilization-cycle trap**: after a build → extract → map-to-json cycle
  (run to stabilize float rotations, CLAUDE.md gotcha 6), commit the `*.json`
  files ONLY. Never copy the extracted `war3map.lua` back into the source —
  it contains this generated block.

### Minimap preview (generated)

Every real map ships a minimap image + icons file; the map picker renders
them. When the source provides neither, build-map generates:

- `war3mapMap.tga` — a 256×256 preview rendered from terrain.json (tile
  colors, water/blight tint, cliff/height shading);
- `war3map.mmp` — one player-colored icon per `sloc`, plus gold-mine and
  neutral-building icons (see lib/minimap.js; format in docs/FORMATS.md).

Override by shipping your own `files/war3mapMap.blp` (or `.tga`) and/or
`files/war3map.mmp`.

Script syntax gate: build-map parses the **packed** `war3map.lua` (source
script + generated blocks) with luaparse in Lua 5.3 mode and fails the build
on a syntax error, reporting the line in the packed script. validate-map
runs the same check on any packed map (`lua syntax war3map.lua` line).

JASS note: if you write `war3map.j`, you can optionally syntax-check it with
pjass (https://github.com/lep/pjass, builds with `make`); it needs the
`common.j`/`Blizzard.j` from the game data, which are not shipped here.

## 4. Import custom assets (MDX models, BLP textures, ...)

Drop assets into the map source `imports/` tree; the path relative to
`imports/` becomes the archive path:

```
maps/mymap/imports/war3mapImported/MyModel.mdx
maps/mymap/imports/war3mapImported/MyTexture.blp
```

`build-map.js` packs them at those paths and **auto-generates `war3map.imp`**
(the import manifest) — unless you provide your own `imports.json`
(array of archive paths, backslash-separated, e.g.
`"war3mapImported\\MyModel.mdx"`).

Reference the assets from object data, e.g. in `objects-units.json` set a
custom unit's model field (`umdl`) to `war3mapImported\MyModel.mdl` — model
FIELD values always use the `.mdl` extension even for an `.mdx` archive
member (the engine swaps the extension at load; a literal `.mdx` value
renders an invisible unit — CLAUDE.md gotcha 22). Archive paths and
imports.json entries keep the real `.mdx`; only object-data model fields
(`umdl`/`dfil`/`bfil`/`ifil`) take `.mdl`.

Working with models/textures programmatically — use `war3-model`:

```js
const fs = require('fs');
const { parseMDX, generateMDX, parseMDL, generateMDL, decodeBLP } = require('war3-model');
const buf = fs.readFileSync('model.mdx');
// parseMDX wants an ArrayBuffer, NOT a Node Buffer:
const model = parseMDX(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
console.log(model.Version, model.Geosets.length);
fs.writeFileSync('model.mdl', generateMDL(model)); // MDX -> readable MDL text
```

## 5. Validate anything

```bash
node tools/validate-map.js somemap.w3x
```

Checks: HM3W pre-header, MPQ magic at offset 512, extraction, presence of
`war3map.w3i`/`w3e` and a map script, a Lua syntax check on `war3map.lua`
(luaparse, Lua 5.3 grammar — a broken script loads as a silently dead map),
and for every translatable file a parse **plus** a JSON→binary→JSON
stability cycle. Exit code 0 = all pass.

Object data additionally gets a **semantic lint** (lib/objectlint.js) whose
findings print as `WARN` lines and never fail the map (exit stays 0): model
fields ending in `.mdx` or `war3mapImported` model references with no
matching archive member after `.mdl`↔`.mdx` normalization (gotcha 22),
items overriding `unam` with neither `ifil` nor `iico` (gotcha 23), and
units with a build list whose overridden `uabi` lacks a repair ability
(Ahrp/Arep/Aetr/Awha; only the human AHbu+Ahrp pair is playtest-verified —
gotcha 25). These encode in-game playtest bugs that are structurally valid,
so they warn instead of failing.

Then a **second-opinion cross-validation** via mdx-m3-viewer-th's independent
parser stack (`viewer ...` lines in the report):

- its MPQ reader must open the archive and see the members;
- every inner file it has a parser for must parse — this covers
  `war3map.wpm`/`shd`/`mmp`/`wct`, which wc3maptranslator has no translator
  for (`war3map.w3c` and `war3map.wtg` are excluded — see docs/FORMATS.md);
- every packed `.mdx`/`.mdl` must pass its MDX sanity test with **0 errors
  and 0 severe issues** (a malformed model hard-crashes the game at map
  load — e.g. a missing Death sequence or a Bone referencing a nonexistent
  GeosetAnim).

The viewer is read-only here: its MPQ *write* path is known-broken
(locale/platform swap) and is never used, and it is always fed fresh
`Uint8Array` copies, never Node Buffers (see docs/FORMATS.md).

## 6. Optional third opinion: War3Net (.NET)

For gnarly cases (classic formats, campaign files, disputed field layouts),
[War3Net](https://github.com/Drake53/War3Net) (C#, MIT) is the most complete
independent implementation. It is **not** a dependency of this toolkit —
nothing here requires dotnet. `scripts/crossvalidate-war3net.sh` documents
the recipe: it checks for `dotnet` (`apt-get install -y dotnet-sdk-8.0`),
scaffolds a tiny console project referencing
`War3Net.Build.Core`, and runs `MapInfo.Parse`/`MapEnvironment.Parse` over an
extracted map directory, reporting per-file parse results. Use it when the
two bundled parser stacks disagree and you need a tie-breaker.

## 7. Diagnostics / A-B testing maps in-game

The game's map list shows the map NAME stored **inside** the file (HM3W
header + w3i name), never the filename — so `siege-no-sounds.w3x` and
`siege-no-import.w3x` both appear identically as "Crossroads Siege" and
cannot be told apart in-game. When building variant maps for in-game
bisection/A-B testing, give EACH variant a distinct in-game name: change
the map name in the source (the TRIGSTR entry in `strings.json` that
`info.json` `name` points to, or `name` directly) AND `_header.json`
`name`, e.g. "Siege DIAG-1 no-objabil". Renaming the `.w3x` alone is
invisible in-game.

**Known-working-reference debugging**: before (or instead of) in-game
bisection, decompose a map where the misbehaving mechanic provably works
(§1; for classic/protected maps use the `_viewer/` dumps) and copy its
exact object-data field IDs and art paths. The decomposed FoTN
(docs/reference/fotn-analysis.md) is the worked example — its live w3u/w3t
entries exposed the `.mdl` model-field rule, the item identity field set
and the AHbu+Ahrp builder pair (CLAUDE.md gotchas 22, 23, 25).
