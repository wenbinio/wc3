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
   SetPlayerStartLocation` to match; put gameplay logic in `main()`
5. Optional: `doodads.json` (trees `LTlt`), `strings.json`,
   `objects-*.json` (custom units), `imports/` (custom MDX/BLP assets)

Terrain: the template is 32x32 tiles of flat grass. To resize, change
`terrain.json` `map.width/height` and make ALL per-vertex arrays
`(w+1)*(h+1)` long (groundHeight 8192 = flat ground), update `map.offset`
to `-(w*128)/2`, fix `info.json` camera bounds, and regenerate
`files/war3map.wpm` (16-byte header + w*4*h*4 zero bytes) and
`files/war3map.shd` (w*4*h*4 zero bytes) — see docs/PIPELINE.md §3.

Build and check:

```bash
node tools/build-map.js maps/<name> _build/<name>.w3x
node tools/validate-map.js _build/<name>.w3x   # must exit 0
```

Keep the map source committed; never commit the built .w3x (gitignored).
