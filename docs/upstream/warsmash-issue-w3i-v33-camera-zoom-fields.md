# [Warsmash] `War3MapW3i` does not read the v32/v33 camera-zoom fields — silent data loss or EOFException on any modern map

**Upstream project**: WarsmashModEngine (github.com/Retera/WarsmashModEngine)
**Observed at**: HEAD `f9e0aee` (2025-12-08)
**Severity**: any `war3map.w3i` at version ≥ 32 either throws or loads with
zero players and zero forces. The silent case is the dangerous one.

## Summary

`parsers/w3x/w3i/War3MapW3i.java` handles `version > 30` by reading
`supportedModes` and `gameDataVersion` (lines ~118–121) and then immediately
reads the player-count int. Formats **v32 and v33 append three more i32s**
after `gameDataVersion` before the player block:

- `forceDefaultCameraZoom` (added in v32)
- `forceMaxCameraZoom` (added in v32)
- `forceMinCameraZoom` (added in v33)

Because those three ints are never consumed, the cursor is 12 bytes short
when the player loop begins, so the parser reads a camera-zoom value as the
player count.

## Why this matters

w3i v33 is what the current World Editor writes. Every map saved by the
1.32+/2.0 editor hits this.

## Repro

Any map with `war3map.w3i` version 33. Measured on three:

| map | zoom field values | parser result |
| --- | --- | --- |
| A | 1600 / 3000 / 1300 | reads `playerCount = 1600` → `EOFException` |
| B | 0 / 0 / 0 | reads `playerCount = 0`, `forces = 0` → **"parses successfully"**, total data loss |
| C | 0 / 0 / 0 | zeros consumed, cursor drifts → `EOFException` |

The B case is worse than a crash: the map loads with no players and no
forces, and nothing reports a problem.

## Expected

Players and forces parse correctly for v32/v33 maps.

## Actual

`EOFException`, or a silently empty player/force table when the zoom fields
happen to be zero.

## Suggested fix

After `gameDataVersion`, before the player loop:

```java
if (this.version > 31) {
    stream.readInt();      // forceDefaultCameraZoom  (v32+)
    stream.readInt();      // forceMaxCameraZoom      (v32+)
    if (this.version > 32) {
        stream.readInt();  // forceMinCameraZoom      (v33+)
    }
}
```

(Exact v32-vs-v33 split per the field list above; if the writer emits all
three unconditionally at v32, collapse to a single `version > 31` guard.)

The matching `save()` path needs the same three writes to round-trip.

## Field reference

Our own format notes derive the v31 ↔ v33 delta from byte-level diffs of
editor-saved maps and codec round-trips: `docs/FORMATS.md` — "w3i v31 ↔ v33:
v33 appends exactly three i32s after gameDataVersion —
forceDefaultCameraZoom + forceMaxCameraZoom (v32) and forceMinCameraZoom
(v33)." Our `lib/codecs/w3i31.js` reads and writes v25/v31/v33 byte-faithfully
on that basis.

## Notes

Found while evaluating Warsmash as a headless simulation harness: the
simulation layer runs cleanly with no display (zero `Gdx.*` calls in the
1153-file simulation package), so this parser gap was the first hard blocker
rather than anything architectural.

**Status: DRAFT, not filed.**
