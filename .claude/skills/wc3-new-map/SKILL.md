---
name: wc3-new-map
description: Scaffold a brand-new Warcraft 3 map source from the demo template and build it to a .w3x. Use when asked to create a new map from scratch.
---

# Create a new map

Prereq (once per session): `bash scripts/setup.sh`

```bash
cp -r maps/demo maps/<name>
```

Then customize `maps/<name>/` (the template is a working 2-player 32x32
melee-ish Lua map — it builds as-is):

1. `_header.json` + `info.json` `map.name/author/description` — identity
2. `info.json` `players[]` — one entry per player (type 1 = user;
   race 1 human, 2 orc, 3 undead, 4 night elf)
3. `units.json` — one `sloc` (start location) per player at
   `players[].startingPos`, plus starting units (rawcodes: htow/hfoo/hpea...,
   gold mine `ngol`)
4. `war3map.lua` — update `SetPlayers/SetTeams/DefineStartLocation/
   SetPlayerStartLocation` to match; put gameplay logic in `main()`.
   For a "Use Custom Forces" lobby copy the maps/tidewatch-arena `config()`
   pattern and keep team indexes == force indexes (CLAUDE.md gotcha 18).
   In map code, reference the GENERATED named constants (`UNIT_hfoo`,
   `ITEM_...`, `REGION_...` — see the demo's `main()`), never hand-typed
   `FourCC("xxxx")` literals: build-map derives them from the source JSON,
   prepends them to the packed script, and indexes them in
   `maps/<name>/constants.json` (CLAUDE.md gotcha 27; docs/PIPELINE.md §3).
   Run build-map once after editing JSON to refresh the index.
5. Optional: `doodads.json` (trees `LTlt`), `strings.json`,
   `objects-*.json` (custom units), `imports/` (custom MDX/BLP assets)
6. `tests/` — STANDARD PRACTICE for every scripted mechanic: add a headless
   logic test `maps/<name>/tests/<name>.test.js` that loads the map in the
   sim and asserts the mechanic actually behaves (docs/PIPELINE.md §8;
   worked example: maps/northreach/tests/founders.test.js):

   ```js
   const { loadMap } = require('../../../lib/sim');
   const sim = loadMap(path.join(__dirname, '..'));
   sim.advance(60); sim.chat(0, '-mycmd');
   assert.strictEqual(sim.player(0).gold, 500);
   ```

   `npm test` discovers the suite automatically; run it alone with
   `node tools/test-map-logic.js maps/<name>`.

Terrain: the template is 32x32 tiles of flat grass. To resize, change
`terrain.json` `map.width/height` and make ALL per-vertex arrays
`(w+1)*(h+1)` long (groundHeight 8192 = flat ground), update `map.offset`
to `-(w*128)/2`, fix `info.json` camera bounds, and DELETE
`files/war3map.wpm` + `files/war3map.shd` — build-map auto-generates
correctly sized all-passable/no-shadow defaults from terrain.json (and
warns if a kept copy mismatches the new dims) — see docs/PIPELINE.md §3.

- Orientation: terrain.json per-vertex arrays are row-major with
  **row 0 = map NORTH (top)**, col 0 = west (index = `row*(w+1)+col`) —
  what you write is what the minimap/World Editor shows top-down.
- Tiles/tileset: take `tilePalette`/`cliffTilePalette` FourCCs from the
  per-tileset tables in docs/FORMATS.md ("Terrain: tileset & tile
  FourCCs") — never invent ids (unknown tiles render wrong or not at
  all), and keep `terrain.json` `tileset` set to the matching letter.

Build and check:

```bash
node tools/build-map.js maps/<name> _build/<name>.w3x
node tools/validate-map.js _build/<name>.w3x   # must exit 0
node tools/test-map-logic.js maps/<name>       # logic tests (step 6) must pass
node tools/preflight.js maps/<name>            # standing rule: 0 FAILs on every change set (CLAUDE.md "First step")
```

Keep the map source committed. Scratch builds (`_build/`) stay gitignored;
the bundled maps' compiled artifacts are the exception and live tracked in
`maps/builds/*.w3x` — regenerate with build-map when their source changes.
