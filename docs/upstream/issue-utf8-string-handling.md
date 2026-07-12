# DRAFT — not yet filed

**Repo**: ChiefOfGxBxL/WC3MapTranslator
**Title**: Non-ASCII text corrupts: W3Buffer.readString decodes latin1 (binary formats) and HexBuffer.addChars truncates char codes to one byte (wts writes)

## Summary

Two independent encoding bugs make any non-ASCII text (accents, em dashes,
curly quotes, CJK) corrupt on read or write. They are worth fixing together
because they are two halves of the same asymmetry:

1. **READ side (all binary formats)**: `HexBuffer.addString` correctly
   writes strings as UTF-8 (`Buffer.from(str, 'utf-8')`), but
   `W3Buffer.readString` reads one byte at a time via
   `String.fromCharCode(byte)` — i.e. latin1. Any multi-byte UTF-8 sequence
   reads back as mojibake, which then re-encodes to *different* bytes on the
   next `jsonToWar`: object data / w3i / w3s / w3c / w3r string fields
   silently corrupt on every read→write cycle even when the user changes
   nothing.

2. **WRITE side (war3map.wts)**: `StringsTranslator.jsonToWar` writes string
   values via `HexBuffer.addChars`, and `addChars` → `addChar` →
   `charToHex` pushes `character.charCodeAt(0)` as a single byte. Code
   points above 0xFF are truncated (`'—'` U+2014 → byte `0x14`, a control
   character) and 0x80–0xFF come out as bare latin1 bytes (invalid UTF-8).

## Repro (verified on wc3maptranslator@5.0.0, Node 22)

READ side — round-trip of bytes the library itself wrote:

```js
const { W3Buffer } = require('wc3maptranslator/dist/src/W3Buffer');
const bytes = Buffer.concat([Buffer.from('Café — test', 'utf8'), Buffer.from([0])]);
const read = new W3Buffer(bytes).readString();
console.log(read); // 'CafÃ© â\x80\x94 test'  (expected: 'Café — test')
```

Consequence at the format level: write a w3i/w3u/w3s with a non-ASCII name
via `jsonToWar` (bytes on disk are correct UTF-8), read it back with
`warToJson` — the JSON contains mojibake, and translating that JSON again
produces different bytes than the original file.

WRITE side — wts value truncation:

```js
const { StringsTranslator } = require('wc3maptranslator');
const out = StringsTranslator.jsonToWar({ 1: { value: 'Café — test' } }).buffer;
console.log(JSON.stringify(out.toString('utf8')));
// "STRING 1\r\n{\r\nCaf�  test\r\n}\r\n\r\n"
//   'é' -> lone 0xE9 byte (invalid UTF-8), '—' -> 0x14 (DC4 control char)
const back = StringsTranslator.warToJson(out).json;
console.log(back[1].value); // corrupt — round-trip loses the original text
```

## Expected

`'Café — test'` survives read→write→read byte-exact in both binary string
fields and wts entries. (WE writes UTF-8 in both places; TRIGSTR content in
real maps is routinely non-ASCII.)

## Actual

Mojibake on binary reads; truncated/invalid bytes on wts writes; round-trips
are not stable for any non-ASCII content.

## Suggested fix

- `W3Buffer.readString`: collect the bytes up to the NUL terminator and
  decode with `buf.toString('utf8')` (optionally falling back to latin1 when
  the bytes are not valid UTF-8, for legacy-codepage files — validity is
  cheap to check by re-encoding and comparing).
- `HexBuffer.addChars`: encode via `Buffer.from(chars, 'utf-8')` exactly
  like `addString` does (minus the NUL terminator). Callers that rely on
  addChars for FourCC IDs are unaffected — those are ASCII by definition.

## Our downstream context

wc3-map-toolkit patches `W3Buffer.prototype.readString` at runtime with the
UTF-8-decode-with-latin1-fallback described above (lib/translator-fixes.js,
"FIX A") and bypasses the wts translator entirely with a linear UTF-8
parser/serializer (lib/wts.js — which also avoids the regex reader's
catastrophic performance on production-scale ~10k-string files, a separate
issue we can file if useful). With those two changes, read→write→read is
byte-exact for all valid-UTF-8 content across every format we round-trip.
