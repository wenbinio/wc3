# DRAFT — not yet filed

**Repo**: ChiefOfGxBxL/WC3MapTranslator
**Title**: W3Buffer.readString loops forever on truncated/garbage input — no buffer-end check

## Summary

`W3Buffer.readString` scans for the NUL terminator with
`while (this._buffer[this._offset] !== 0x00)`. Past the end of a Buffer,
indexing returns `undefined`, and `undefined !== 0x00` is `true` — so on a
truncated file, or any file whose last string field is unterminated, the
loop never exits and keeps accumulating characters: an unkillable hang/OOM
instead of an error the caller could catch.

This is the failure mode for a whole class of real inputs: protected maps
deliberately ship truncated/garbage `war3map.*` members as parser traps (we
have several in hand where exactly this member kills the process), and
honest corruption produces the same shape. Every translator whose format
contains strings is affected (w3i, w3u-family, w3s, w3c, w3r, doo, ...).

## Repro (verified on wc3maptranslator@5.0.0, Node 22)

```js
const { W3Buffer } = require('wc3maptranslator/dist/src/W3Buffer');
const buf = Buffer.from('no terminator here'); // 18 bytes, no 0x00
new W3Buffer(buf).readString(); // never returns; CPU pegged, memory grows
```

Or at the API surface: truncate any valid `war3map.w3i` inside its name
field and call `InfoTranslator.warToJson` — same infinite loop.

(Verified by running the snippet under `timeout 3`; the process is killed by
the timeout, having never returned.)

## Expected

A catchable error (`RangeError` seems natural: "unterminated string at byte
N") so callers can degrade gracefully — every other malformed-input path in
the library already throws.

## Actual

Infinite loop; the process must be killed from outside.

## Suggested fix

```js
readString() {
  const start = this._offset;
  let end = start;
  while (end < this._buffer.length && this._buffer[end] !== 0x00) end++;
  if (end >= this._buffer.length) {
    throw new RangeError(`unterminated string at byte ${start} (truncated or wrong-format file)`);
  }
  this._offset = end + 1;
  return this._buffer.subarray(start, end).toString('utf8'); // see the UTF-8 issue
}
```

(The `toString('utf8')` in the sketch also fixes the separate latin1-decode
bug reported in the UTF-8 issue; the bounds check is independent and worth
taking even without that.)

## Our downstream context

wc3-map-toolkit patches `W3Buffer.prototype.readString` at runtime with
exactly the bounded version above (lib/translator-fixes.js, "FIX B"), plus a
pre-parse heuristic for the protector-trap files that would otherwise reach
it. With the patch, a truncated file surfaces as a catchable RangeError that
our per-file error handling degrades to a raw copy; without it, one bad
archive member hangs the whole pipeline.
