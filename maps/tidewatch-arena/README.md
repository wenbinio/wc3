# Tidewatch Arena

A small 2-player "arena skirmish" test map, built entirely headlessly with
wc3-map-toolkit. It deliberately sits between the two other bundled sources:
bigger than `maps/demo` (minimal melee), leaner than `maps/crossroads-siege`
(no sounds, no custom imports) — its job is to exercise **cliff/ramp/water
emission at small scale** plus the custom-unit and CreateAllUnits paths.

## Layout

- **48x48 Northrend terrain** (`tileset: "N"`, tiles Ndrt/Ndrd/Ngrs/Nice/Nsnw,
  cliffs CNc1/CNc2): a snowfield with a **raised circular ice arena**
  (cliff layer 3) at the center, ringed by a **water moat**, crossed by
  **four dirt ramp causeways** (N/E/S/W, ramp-flagged tilepoints).
- **2 players** on opposite corners (SW human red, NE orc blue), each with a
  town hall, three peasants and a nearby kobold-guarded gold mine.
- **Arena Champion** (`H000`, custom hero based on `Hpal` with boosted
  stats — see `objects-units.json`) waits at the arena center as a neutral
  hostile boss, level 10, with a kobold court.
- **Regions**: `ArenaCenter` plus both spawn corners; **one camera**
  (`ArenaOverlook`); TRIGSTR strings for name/description/unit names.
- **No custom imports** — that pipeline is covered by `crossroads-siege`.

## Script (`war3map.lua`)

`config()` defines the 2-player lobby in the exact shape World Editor
generates for a "Use Custom Forces" + "Fixed Player Settings" map
(`InitCustomPlayerSlots()` + `InitCustomTeams()`). info.json declares TWO
one-player forces, and every team index passed to `SetPlayerTeam` is a force
index — keep them in sync: a `SetPlayerTeam` team with no matching w3i force
leaves the locked lobby with no valid arrangement and the multiplayer
"Create" button greyed out (that was this map's original hosting bug).
`main()` calls the generated
`CreateAllUnits()` (units.json is the single source of truth — see CLAUDE.md
gotcha 10) before enumerating the arena, then wires up:

- an intro message,
- a `TriggerRegisterEnterRegion` trigger on the arena that queues hero
  entries, drained/announced by a repeating timer,
- a repeating champion taunt timer,
- **victory** for the player whose forces land the killing blow on the
  Arena Champion (defeat for the rival).

## Build

```bash
node tools/build-map.js maps/tidewatch-arena maps/builds/tidewatch-arena.w3x
node tools/validate-map.js maps/builds/tidewatch-arena.w3x
```

The committed JSON is a translator fixed point (CLAUDE.md gotcha 6):
rotations carry float32-stabilized values (e.g. `269.977...` for 270°) and
`_header.json` carries the flags dword derived from the w3i. Keep it that
way — if you edit values, build once, re-extract with
`w3x-extract.js` + `map-to-json.js`, and commit the stabilized JSON.
Keep `strings.json` ASCII-only: non-ASCII characters (e.g. an em dash) do
not survive the wts round-trip.

Tested end-to-end by `test/tidewatch.test.js`.
