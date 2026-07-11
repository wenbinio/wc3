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
// FIX C — falsy-zero write-throughs in the doo/unitsdoo writers: upstream's
// jsonToWar uses `x || default` / `x && x >= 0 ? x : -1` patterns on fields
// whose warToJson KEEPS an honest 0, so a legitimate zero silently becomes
// the default on rebuild — both changing the map and breaking round-trip
// comparison on intact files. Audited instances (DoodadsTranslator.jsonToWar
// + UnitsTranslator.jsonToWar, the two W3do writers):
//   war3map.doo (doodads):
//     - `addByte(doodad.life || 100)`            life: 0   -> 100
//       (the original GWZ false-FAIL: 184 such doodads)
//     - `randomItemSetId && >= 0 ? id : -1`      randomItemSetId: 0 -> -1
//       (Sunken City ships 73 such doodads — first diff at entry B004)
//     - `addFloat(doodad.scale[i] || 1)`         scale component 0 -> 1
//   war3mapUnits.doo (units):
//     - `randomItemSetId && >= 0 ? id : -1`      randomItemSetId: 0 -> -1
//       (Island Troll Tribes ships 2 such units)
//     - `addInt(unit.hitpoints || -1)`           hitpoints: 0 -> -1
//     - `addInt(unit.mana || -1)`                mana: 0      -> -1
//     - `addInt(unit.gold || 12500)`             gold: 0      -> 12500 (ngol)
//     - `addInt(unit.color || -1)`               color: 0 (red!) -> -1
//   (variation/rotation/angle `|| 0` are no-ops for 0; targetAcquisition
//   and waygateRegionId already special-case 0/undefined correctly.)
// Upstream can't write a literal 0 through those guards, but its encoders
// happily coerce equivalent TRUTHY stand-ins to zero bytes:
//   - addByte:  `Buffer.from([256]) -> 0x00`                    (BYTE_ZERO)
//   - addInt:   intn(32).fromInt(2**32).bytes -> [0,0,0,0]      (INT_ZERO)
//   - addFloat: ieee754.write coerces `new Number(0)` -> 0 bits (FLOAT_ZERO)
// fixDoodadFalsyZeroes()/fixUnitFalsyZeroes() substitute those stand-ins on
// a COPY (never mutating the caller's JSON: validate-map compares against
// the input after translating), and applyW3BufferPatches() wraps BOTH
// upstream writers so every jsonToWar caller gets the fix. Source JSON keeps
// the honest zeros. The pre-wrap originals are kept in UPSTREAM_ORIGINALS so
// tests can pin the upstream bugs (canaries that must FAIL once upstream
// fixes them and the workaround can go).
//
// Related non-fix (documented, deliberate): a protector-TRUNCATED
// war3map.doo (e.g. DracoL1ch DotA's, cut 4 bytes short) still throws a
// catchable RangeError out of the upstream reader (FIX B guarantees
// catchable). map-to-json degrades it to a raw copy + read-only _viewer/
// parse (the viewer's doo reader copes with the missing tail); there is no
// write-capable tolerant path for doo at our layer — the file is upstream's,
// not a lib/codecs/ codec (contrast: war3map.w3i truncation, which
// lib/codecs/w3i31.js now reads AND writes byte-faithfully).

const { W3Buffer } = require('wc3maptranslator/dist/src/W3Buffer');

// Truthy stand-ins that upstream's encoders emit as zero bytes (see FIX C).
const BYTE_ZERO = 256;
const INT_ZERO = 2 ** 32;
const FLOAT_ZERO = new Number(0); // eslint-disable-line no-new-wrappers

// Pre-patch upstream writers, for canary tests that pin the upstream bugs.
const UPSTREAM_ORIGINALS = {};

let patched = false;

function applyW3BufferPatches() {
  if (patched) return;
  patched = true;

  // FIX C wiring: wrap the two W3do writers so falsy-zero substitution is
  // applied for EVERY caller (lib/filemap.js can't be the only application
  // point — validate-map, tests and future tools all call the translators).
  const Translators = require('wc3maptranslator');
  UPSTREAM_ORIGINALS.doodadsJsonToWar =
    Translators.DoodadsTranslator.jsonToWar.bind(Translators.DoodadsTranslator);
  UPSTREAM_ORIGINALS.unitsJsonToWar =
    Translators.UnitsTranslator.jsonToWar.bind(Translators.UnitsTranslator);
  Translators.DoodadsTranslator.jsonToWar = (json) =>
    UPSTREAM_ORIGINALS.doodadsJsonToWar(fixDoodadFalsyZeroes(json));
  Translators.UnitsTranslator.jsonToWar = (json) =>
    UPSTREAM_ORIGINALS.unitsJsonToWar(fixUnitFalsyZeroes(json));

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

// FIX C helpers — see header. Each returns a stand-in-patched COPY of the
// JSON (or the input untouched when no entry carries a falsy zero).

function fixDoodadFalsyZeroes(json) {
  if (!json || !Array.isArray(json.regular)) return json;
  const needsFix = (d) => d && (d.life === 0 || d.randomItemSetId === 0
    || (Array.isArray(d.scale) && d.scale.some((s) => s === 0)));
  if (!json.regular.some(needsFix)) return json;
  return {
    ...json,
    regular: json.regular.map((d) => {
      if (!needsFix(d)) return d;
      const out = { ...d };
      if (out.life === 0) out.life = BYTE_ZERO;
      if (out.randomItemSetId === 0) out.randomItemSetId = INT_ZERO;
      if (Array.isArray(out.scale) && out.scale.some((s) => s === 0)) {
        out.scale = out.scale.map((s) => (s === 0 ? FLOAT_ZERO : s));
      }
      return out;
    }),
  };
}

const UNIT_INT_ZERO_KEYS = ['randomItemSetId', 'hitpoints', 'mana', 'gold', 'color'];

function fixUnitFalsyZeroes(json) {
  if (!Array.isArray(json)) return json;
  const needsFix = (u) => u && UNIT_INT_ZERO_KEYS.some((k) => u[k] === 0);
  if (!json.some(needsFix)) return json;
  return json.map((u) => {
    if (!needsFix(u)) return u;
    const out = { ...u };
    for (const k of UNIT_INT_ZERO_KEYS) if (out[k] === 0) out[k] = INT_ZERO;
    return out;
  });
}

// Legacy narrow form (life:0 only), kept because lib/filemap.js calls it
// before the (now-wrapped) translator; double application is a no-op — the
// wrapper sees life 256, not 0.
function fixDoodadsLifeZero(json) {
  if (!json || !Array.isArray(json.regular)) return json;
  if (!json.regular.some((d) => d && d.life === 0)) return json;
  return {
    ...json,
    regular: json.regular.map((d) =>
      d && d.life === 0 ? { ...d, life: BYTE_ZERO } : d), // 256 & 0xFF -> byte 0
  };
}

module.exports = {
  applyW3BufferPatches, fixDoodadsLifeZero,
  fixDoodadFalsyZeroes, fixUnitFalsyZeroes, UPSTREAM_ORIGINALS,
};
