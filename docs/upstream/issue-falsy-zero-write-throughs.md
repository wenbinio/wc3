# DRAFT — not yet filed

**Repo**: ChiefOfGxBxL/WC3MapTranslator
**Title**: Doodads/Units jsonToWar silently replaces legitimate 0 values with defaults (`life: 0` → 100, `randomItemSetId: 0` → -1, `gold: 0` → 12500, ...)

## Summary

`DoodadsTranslator.jsonToWar` and `UnitsTranslator.jsonToWar` use
`x || default` and `x && x >= 0 ? x : -1` guards on fields whose
`warToJson` keeps an honest `0`. A falsy-but-legitimate zero therefore
cannot be written back: it silently becomes the default, which (a) changes
the map and (b) breaks warToJson→jsonToWar→warToJson stability on intact
real-world files.

Audited instances (all verified against 5.0.0 source):

**war3map.doo** (`DoodadsTranslator.jsonToWar`):

| field | code | effect |
| --- | --- | --- |
| `life` | `addByte(doodad.life \|\| 100)` | `life: 0` → 100 |
| `randomItemSetId` | `randomItemSetId && >= 0 ? id : -1` | `0` → -1 |
| `scale[i]` | `addFloat(doodad.scale[i] \|\| 1)` | scale component `0` → 1 |

**war3mapUnits.doo** (`UnitsTranslator.jsonToWar`):

| field | code | effect |
| --- | --- | --- |
| `randomItemSetId` | `randomItemSetId && >= 0 ? id : -1` | `0` → -1 |
| `hitpoints` | `addInt(unit.hitpoints \|\| -1)` | `0` → -1 |
| `mana` | `addInt(unit.mana \|\| -1)` | `0` → -1 |
| `gold` | `addInt(unit.gold \|\| 12500)` | `0` → 12500 |
| `color` | `addInt(unit.color \|\| -1)` | `0` (= player red!) → -1 |

These are not theoretical: production maps ship them. In maps we decomposed,
one carries 184 doodads with `life: 0` and another ships 73 doodads with
`randomItemSetId: 0`; a third has 2 placed units with `randomItemSetId: 0`.
(`variation/rotation || 0` are harmless no-ops; `targetAcquisition` and
`waygateRegionId` already special-case 0/undefined correctly.)

## Repro (verified on wc3maptranslator@5.0.0, Node 22)

```js
const { DoodadsTranslator } = require('wc3maptranslator');
const json = { regular: [{
  type: 'ATtr', variation: 0, position: [0, 0, 0], angle: 0,
  scale: [1, 1, 1], flags: { visible: true, solid: true, fixedZ: false },
  life: 0,                // legitimate: WE allows 0% life
  randomItemSetId: 0,     // legitimate: item set index 0
  id: 7,
}], special: [] };

const back = DoodadsTranslator.warToJson(
  DoodadsTranslator.jsonToWar(json).buffer).json.regular[0];
console.log(back.life);            // undefined (i.e. read back as the 100 default) — expected 0
console.log(back.randomItemSetId); // undefined (written as -1)               — expected 0
```

Equivalent one-liner statement of the bug:
`warToJson(jsonToWar(warToJson(file)))` ≠ `warToJson(file)` for any real
file containing one of these zeros — the first write already changed it.

## Expected

A field that warToJson reports as `0` writes back as `0`.

## Actual

The zero becomes the field's default (100 / -1 / 12500 / 1), silently.

## Suggested fix

Replace the truthiness guards with explicit undefined checks, e.g.
`doodad.life !== undefined ? doodad.life : 100` and
`randomItemSetId !== undefined && randomItemSetId >= 0 ? randomItemSetId : -1`
(or `??`). No format knowledge changes — this is purely the JS falsy-zero
trap.

## Our downstream context

wc3-map-toolkit works around it by substituting truthy stand-ins that the
encoders coerce to zero bytes (`addByte(256)` → 0x00, `addInt(2**32)` →
0x00000000, `addFloat(new Number(0))` → 0.0f) on a copy of the JSON before
calling the upstream writers (lib/translator-fixes.js, "FIX C"). It works,
but it is exactly as horrible as it sounds — we would much rather delete it.
