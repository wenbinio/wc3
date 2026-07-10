---
name: wc3-build-map
description: Edit a Warcraft 3 map source folder (JSON + war3map.lua) and compile it to a playable .w3x, then validate it. Use when asked to modify, rebuild or compile a map.
---

# Edit and build a map

Prereq (once per session): `bash scripts/setup.sh`

A map source is a folder of JSON + script + assets (layout: README.md;
working example: `maps/demo/`). Edit it, then:

```bash
node tools/build-map.js <map-source-dir> _build/out.w3x
node tools/validate-map.js _build/out.w3x        # must exit 0
```

Common edits:

- Map name: `_header.json` (lobby) AND `info.json` `map.name` (+ `SetMapName` in war3map.lua)
- Players/start locations: keep `info.json players[].startingPos`,
  `units.json` `sloc` entries, and `DefineStartLocation()` calls in
  war3map.lua consistent with each other
- Gameplay logic: `war3map.lua` — game calls `config()` then `main()`;
  `scriptLanguage` in info.json must be 1 for Lua (0 for JASS + war3map.j)
- Units: append to `units.json` (copy an existing entry; `type` is the
  4-char rawcode, e.g. hfoo/hpea/ogru; player 0-23, neutral passive ~24+)
- Custom assets: drop under `imports/war3mapImported/...` — war3map.imp is
  auto-generated on build
- Object data tweaks: `objects-units.json` etc. — shape is
  `{original: {"hfoo": [{id:"umvs", type:"int", value:350, level:0, column:0}]}, custom: {"x000:hfoo": [...]}}`

To modify an EXISTING .w3x, first use the wc3-read-map skill to get a map
source, edit it, then build as above (the extracted `_header.json` preserves
the original HM3W header).

Gotchas: rebuilt JSON is round-trip stable but not byte-identical (float
rotations); if you resize terrain, regenerate files/war3map.wpm and .shd
(docs/PIPELINE.md §3). Full gotcha list: CLAUDE.md.
