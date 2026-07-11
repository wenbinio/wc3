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
node tools/test-map-logic.js <map-source-dir>    # headless logic tests (if tests/ exists)
```

validate-map may also print `WARN lint ...` lines (object-data semantic
heuristics — CLAUDE.md gotchas 22/23/25). They don't fail the map, but each
one is a playtest bug class actually hit in-game — fix them unless you can
say why the warning doesn't apply.

Common edits:

- Map name: `_header.json` (lobby) AND `info.json` `map.name` (+ `SetMapName` in war3map.lua)
- Players/start locations: keep `info.json players[].startingPos`,
  `units.json` `sloc` entries, and `DefineStartLocation()` calls in
  war3map.lua consistent with each other
- Lobby/forces: with "Use Custom Forces" + "Fixed Player Settings", every
  `SetPlayerTeam` team index in `config()` must equal the index of a w3i
  force containing that player, or the multiplayer Create button greys out
  (CLAUDE.md gotcha 18; WE-exact pattern: maps/tidewatch-arena)
- Gameplay logic: `war3map.lua` — game calls `config()` then `main()`;
  `scriptLanguage` in info.json must be 1 for Lua (0 for JASS + war3map.j).
  STANDARD PRACTICE when you add or change a scripted mechanic: write/update
  a headless logic test in `maps/<name>/tests/*.test.js` that executes the
  packed script in the sim (lib/sim) and asserts on real state — alliances,
  gold, spawned units, victory/defeat, announcements. `npm test` discovers
  the suite automatically; docs/PIPELINE.md §8 has the harness API, and
  maps/northreach/tests/founders.test.js is the worked example. Validation
  is structural only — the sim is what catches a mechanic that parses fine
  but plays wrong (it caught a 5-bosses-on-wave-10 bug validate-map passed).
  Reference object types via the GENERATED named constants, not hand-typed
  `FourCC("xxxx")` literals: build-map prepends a constants block to the
  packed script (UNIT_/ITEM_/DEST_/DOOD_/ABIL_/BUFF_/UPGR_ FourCC globals
  from objects-*.json names + placed types; REGION_/SOUND_ data tables from
  regions/sounds.json) and rewrites the `constants.json` index in the map
  source — grep it for the right name. Renaming an object (or adding a
  name collision) RENAMES its constant; stale references are runtime nil,
  so grep constants.json after object-data renames (CLAUDE.md gotcha 27)
- Units: append to `units.json` (copy an existing entry; `type` is the
  4-char rawcode, e.g. hfoo/hpea/ogru; player 0-23, 24 = neutral hostile,
  27 = neutral passive). units.json is the single source of truth for
  placements: war3mapUnits.doo is EDITOR-ONLY, so build-map compiles
  units.json into a generated `CreateAllUnits()` block appended to the
  packed war3map.lua. The map's `main()` should call `CreateAllUnits()`
  (before any code that enumerates preplaced units); if the script never
  mentions it, build-map wraps main() to call it after main() returns.
- Custom assets: drop under `imports/war3mapImported/...` — war3map.imp is
  auto-generated on build. Custom MDX must pass mdx-m3-viewer's sanityTest
  with 0 errors/severes (CLAUDE.md gotcha 14) or the game crashes on load;
  build-map enforces this and FAILS the build on any model under imports/
  that misses the bar (validate-map only WARNs — its passthrough tier is
  for third-party models).
  Object-data model FIELDS referencing the import use the `.mdl` extension
  (`war3mapImported\X.mdl` even for an `.mdx` file — CLAUDE.md gotcha 22).
- Strings (`strings.json` / TRIGSTR values): non-ASCII now round-trips
  losslessly through OUR wts/translator layer (CLAUDE.md gotcha 16), but
  committed map sources stay ASCII (`--`, straight quotes, `...`) for
  maximum compat with tools built on unpatched wc3maptranslator —
  test/northreach.test.js enforces this on the bundled maps.
- Object data tweaks: `objects-units.json` etc. — shape is
  `{original: {"hfoo": [{id:"umvs", type:"int", value:350, level:0, column:0}]}, custom: {"x000:hfoo": [...]}}`.
  When cloning, override the full visible-identity set (items:
  unam+ifil+iico+utip/utub; units: unam+umdl+uico+utip/utub) or the base's
  art/tooltips leak through in-game (CLAUDE.md gotcha 23)
- Minimap preview: auto-generated (`war3mapMap.tga` from terrain.json +
  `war3map.mmp` start-location icons); override via `files/war3mapMap.tga|blp`
  / `files/war3map.mmp`

To modify an EXISTING .w3x, first use the wc3-read-map skill to get a map
source, edit it, then build as above (the extracted `_header.json` preserves
the original HM3W header).

Gotchas: build-map syntax-checks the packed war3map.lua (luaparse, Lua 5.3)
and fails with the parse error + line — the line number refers to the packed
script (source + generated blocks). Rebuilt JSON is round-trip stable but
not byte-identical (float rotations); when committing a stabilized source,
copy `*.json` only — never the extracted war3map.lua (CLAUDE.md gotcha 6).
If you resize terrain, regenerate files/war3map.wpm and .shd
(docs/PIPELINE.md §3). Full gotcha list: CLAUDE.md.
