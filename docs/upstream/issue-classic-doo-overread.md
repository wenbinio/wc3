# DRAFT — not yet filed

**Repo**: ChiefOfGxBxL/WC3MapTranslator
**Title**: DoodadsTranslator.warToJson misparses pre-1.32 war3map.doo (version 8) and reads past the buffer end — skinId is read unconditionally

## Summary

`DoodadsTranslator.warToJson` unconditionally reads a 4-byte `skinId` per
doodad. That field only exists in files written by patch **1.32+** editors.
Classic-era files (TFT through 1.31) that carry the **same version dwords —
format 8, subformat 11** — do not have it, so `expectVersion(8, ...)` /
`expectVersion(11, ...)` accepts the file and the read cursor then drifts
**+4 bytes per doodad**. Every field after the first doodad's scale is
misparsed (flags/life/item-set fields read from wrong offsets — the item-set
count in particular can be garbage), and the parse finally throws a
`RangeError` when a trailing read lands past the buffer end.

This is worth distinguishing from a plain "unsupported version" case: the
version check *cannot* catch it, because Blizzard reused version 8/11 for
both layouts (the 1.32 change added skinId without bumping the format
version). We hit this decomposing a real 2011-era classic map, where the
final read landed 8 bytes past the end of the buffer; the minimal synthetic
repro below lands 4 past.

## Repro (verified on wc3maptranslator@5.0.0, Node 22)

```js
const { DoodadsTranslator } = require('wc3maptranslator');

// Minimal classic-layout war3map.doo: format 8, subformat 11, ONE doodad,
// NO skinId field (what TFT-era and 1.31 editors write), empty special-
// doodads trailer.
const b4 = (s) => Buffer.from(s, 'latin1');
const i32 = (n) => { const b = Buffer.alloc(4); b.writeInt32LE(n); return b; };
const f32 = (n) => { const b = Buffer.alloc(4); b.writeFloatLE(n); return b; };
const classicDoo = Buffer.concat([
  b4('W3do'), i32(8), i32(11), i32(1),          // header, 1 doodad
  b4('ATtr'), i32(0),                           // type, variation
  f32(0), f32(0), f32(0),                       // position
  f32(0),                                       // angle
  f32(1), f32(1), f32(1),                       // scale
  // >>> no skinId here — pre-1.32 layout <<<
  Buffer.from([2]), Buffer.from([100]),         // flags, life
  i32(-1), i32(0),                              // randomItemSetPtr, numItemSets
  i32(0),                                       // editor id
  i32(0), i32(0),                               // special doodads: format, count
]);

DoodadsTranslator.warToJson(classicDoo);
// RangeError: The value of "offset" is out of range.
//             It must be >= 0 and <= 70. Received 74
```

The same failure reproduces from a real editor artifact: take any Reforged
`war3map.doo`, strip the per-doodad skinId dword (or save one from a classic
World Editor), and `warToJson` throws mid-file after silently misreading
every doodad past the first.

## Expected

Either of:

- parse the pre-1.32 layout (see fix sketch below), or
- reject it with a clear error ("pre-1.32 war3map.doo layout (no skinId) is
  not supported") instead of a misparse that ends in a low-level
  `RangeError` — and, for larger files, garbage doodad data *before* the
  throw if an item-set count happens to line up.

## Actual

Misparsed fields after the first doodad, then
`RangeError: The value of "offset" is out of range. It must be >= 0 and <= 70. Received 74`
(offsets vary with content; on a real classic map we decomposed the final
read landed 8 bytes past the buffer end).

## Suggested fix

The two layouts are distinguishable without new API: entry size is fixed
per file (no skinId ⇒ each regular doodad is exactly 4 bytes shorter).
Options, in increasing effort:

1. Detect once up front: try the 1.32+ layout; if the first doodad's skinId
   dword is not a plausible FourCC **and** the classic layout parses the
   whole buffer exactly, use classic. (Heuristics on one entry are fragile —
   checking total-length consistency for both layouts is exact when the
   doodad count is known, which it is.)
2. Add an options parameter (`{ skinId: false }`) so callers that know the
   file's era can opt out.
3. At minimum: wrap the drift-induced `RangeError` in a message that names
   the actual problem (pre-1.32 layout), so users don't debug it as a
   corrupt file.

## Our downstream context

wc3-map-toolkit routes any translator throw on war3map.doo to a raw copy +
read-only diagnostic parse (mdx-m3-viewer-th's doo reader handles both
layouts via an explicit game-version argument — that is also a working
reference implementation of option 2). We have no write-capable workaround;
classic .doo is read-only for us until this is fixed upstream.
