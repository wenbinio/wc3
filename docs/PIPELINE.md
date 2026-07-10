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

- **Classic (pre-Reforged) maps**: `war3map.w3i`/`w3e`/object files throw a
  version error in wc3maptranslator@5. `map-to-json.js` handles this: the file
  is copied through raw under `files/` and the error is recorded in
  `manifest.json` → `errors`. You can still edit scripts/assets and repack.
- **Protected maps**: the MPQ `(listfile)` is stripped. `w3x-extract.js`
  falls back to probing a built-in list of known `war3map.*` names, so you
  still get the standard files, but custom imports with unknown names cannot
  be recovered.

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

### Minimap preview (generated)

Every real map ships a minimap image + icons file; the map picker renders
them. When the source provides neither, build-map generates:

- `war3mapMap.tga` — a 256×256 preview rendered from terrain.json (tile
  colors, water/blight tint, cliff/height shading);
- `war3map.mmp` — one player-colored icon per `sloc`, plus gold-mine and
  neutral-building icons (see lib/minimap.js; format in docs/FORMATS.md).

Override by shipping your own `files/war3mapMap.blp` (or `.tga`) and/or
`files/war3map.mmp`.

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
custom unit's model field (`umdl`) to `war3mapImported\MyModel.mdx`.

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
`war3map.w3i`/`w3e` and a map script, and for every translatable file a
parse **plus** a JSON→binary→JSON stability cycle. Exit code 0 = all pass.
