'use strict';
// Runtime fixes for wc3maptranslator@5.0.0 sharp edges that corrupt data or
// hang the process. Loaded (once) by lib/filemap.js before any translator
// runs; everything here is OUR layer — node_modules is never modified on
// disk and the upstream package stays pinned (CLAUDE.md gotcha 1).
//
// FIX A — UTF-8-safe string READS (root cause of CLAUDE.md gotcha 16 for
// binary formats): upstream writes strings correctly as UTF-8
// (HexBuffer.addString uses Buffer.from(str,'utf-8')) but READS them one
// byte at a time via String.fromCharCode(byte) — i.e. latin1. Any multi-byte
// UTF-8 sequence (em dash, curly quotes, accents...) reads back as mojibake,
// which then re-encodes to DIFFERENT bytes on the next jsonToWar: object
// data / w3i / w3s / w3c / w3r string fields silently corrupt on rebuild.
// We patch W3Buffer.prototype.readString to decode UTF-8 when the bytes are
// valid UTF-8 (verified byte-exact by re-encoding), falling back to the old
// latin1 behavior for non-UTF-8 bytes (legacy codepage files — those were
// already lossy upstream and stay readable). With this patch, read -> write
// -> read is lossless and byte-exact for all valid-UTF-8 content, so
// non-ASCII text in object data (unam, ides, ...) and info/sound/region
// names is safe. war3map.wts is handled separately by lib/wts.js (upstream's
// wts WRITE path is the byte-truncating one; its binary write path is fine).
//
// FIX B — bounded readString: upstream's `while (buf[off] !== 0x00)` never
// checks the buffer end; on a truncated/garbage file `buf[off]` becomes
// undefined (!== 0), and the loop spins forever accumulating characters —
// an unkillable hang/OOM instead of a catchable error. Protection-trap maps
// (see lib/traps.js) hit exactly this. We throw a RangeError instead, which
// the per-file try/catch in map-to-json / validate-map degrades to a
// raw-copy + manifest error / per-file FAIL.
//
// FIX C — doodad life:0 write-through: DoodadsTranslator.warToJson keeps
// `life: 0` (it only omits the key when the byte is 100), but jsonToWar
// writes `addByte(doodad.life || 100)` — 0 is falsy, so a 0% life doodad
// silently becomes 100% and the key vanishes on re-read. That both changes
// the map AND makes an intact file fail round-trip comparison (GWZ's
// war3map.doo has 184 such doodads). Upstream can't write a literal 0, but
// its addByte path is `parseInt('0x' + (256).toString(16)) -> 256` and
// `Buffer.from([256]) -> 0x00`, so substituting 256 for 0 immediately before
// jsonToWar emits EXACTLY the byte 0 — read -> write -> read yields life: 0
// again. fixDoodadsLifeZero() applies that substitution on a copy (never
// mutates the caller's JSON: validate-map compares against the input after
// translating). Source JSON keeps the honest `life: 0`.

const { W3Buffer } = require('wc3maptranslator/dist/src/W3Buffer');

let patched = false;

function applyW3BufferPatches() {
  if (patched) return;
  patched = true;

  W3Buffer.prototype.readString = function readString() {
    const buf = this._buffer;
    const start = this._offset;
    let end = start;
    while (end < buf.length && buf[end] !== 0x00) end++;
    if (end >= buf.length) {
      // upstream would spin forever here (undefined !== 0)
      throw new RangeError(
        `unterminated string at byte ${start} (truncated or wrong-format file)`);
    }
    this._offset = end + 1;
    const bytes = buf.subarray(start, end);
    const utf8 = bytes.toString('utf8');
    // Accept the UTF-8 decode only when it is byte-exact under re-encoding
    // (i.e. the bytes really were valid UTF-8) — then jsonToWar's UTF-8
    // write reproduces the original bytes losslessly.
    if (Buffer.byteLength(utf8, 'utf8') === bytes.length &&
        Buffer.from(utf8, 'utf8').equals(bytes)) {
      return utf8;
    }
    return bytes.toString('latin1'); // legacy/non-UTF-8: old behavior
  };
}

// FIX C helper — see header. Returns a life-patched copy of a doodads.json
// object (or the input untouched when no doodad has life 0).
function fixDoodadsLifeZero(json) {
  if (!json || !Array.isArray(json.regular)) return json;
  if (!json.regular.some((d) => d && d.life === 0)) return json;
  return {
    ...json,
    regular: json.regular.map((d) =>
      d && d.life === 0 ? { ...d, life: 256 } : d), // 256 & 0xFF -> byte 0
  };
}

module.exports = { applyW3BufferPatches, fixDoodadsLifeZero };
