'use strict';
// Object-data format v1/v2 codec (read + write) — war3map.w3u/w3t/w3b/w3d/
// w3a/w3h/w3q (and their war3mapSkin.* twins) at the pre-1.33 binary format.
//
// Why this exists: wc3maptranslator@5 hardcodes object-data format v3
// (Reforged 1.33+), but v2 is NOT just legacy — the current Wurst toolchain
// emits v2 today (Island Troll Tribes v3.9c ships all seven object files as
// v2), DracoL1ch DotA ships v2 w3a/w3b/w3d, and classic WE-saved maps
// (X Hero Siege 2024) ship v2 as well. This codec makes v1/v2 read/write
// first-class citizens of the pipeline; lib/filemap.js routes object files
// by the leading version dword (1/2 -> here, 3 -> upstream
// ObjectsTranslator).
//
// v2 <-> v3 DELTA (verified against mdx-m3-viewer-th's w3u parser, War3Net's
// SimpleObjectModification/LevelObjectModification serializers, and the real
// v2 samples above):
//   v3 wraps each object's modification list in "sets": after
//   oldId/newId, v3 reads a u32 sets count, then per set a u32 set flag
//   before the u32 modification count (upstream/WE always write one set,
//   flag 0 — 8 extra bytes per object). v1/v2 read the modification count
//   directly after the ids. That is the ONLY difference:
//   the modification record itself is IDENTICAL across v1/v2/v3 —
//   id (4cc), value type (i32), the two extra i32s (level/variation +
//   data column) for the LEVELED types (doodads/abilities/upgrades — a
//   per-TYPE property, not a per-version one), the typed value, and a
//   trailing u32 sanity check.
//   The war3mapSkin.* split is a Reforged-container convention (1.32+),
//   orthogonal to the binary format; v1/v2-era maps have no skin twins.
// v1 <-> v2 DELTA: none. All three reference implementations read v1 and v2
// identically (War3Net marks v1 non-browsable, viewer branches on >= 3
// only); v1 is preserved as a marker value and costs nothing to support.
//
// JSON DIALECT: exactly upstream ObjectsTranslator's v3 dialect — the same
// { original: { "baseId": [mods] }, custom: { "customId:baseId": [mods] } }
// tables and the same per-modification { id, type, level, column, value }
// shape — plus a top-level `"version": 1|2` marker, so map sources are
// explicit about the format they build to. Switching a source between
// v2/v3 is just editing/deleting the marker.
//
// FIDELITY EXTENSION (optional, emitted only when needed): the upstream
// dialect discards each modification's trailing u32 "sanity check" and
// re-synthesizes it on write (original table -> the object's base id bytes,
// custom table -> 0). Real v2 files disagree with that convention in every
// direction (Wurst writes the CUSTOM id there for every modification,
// DracoL1ch DotA mixes zeros and ids within one file, WE-saved XHS carries
// stray values), so when a file's trailer differs from what the
// conventional writer would emit, the modification gets a raw
// `sanityCheck` (u32) passthrough that the write path uses verbatim.
// Hand-written modifications without the key get the upstream convention.
// Strings are UTF-8 both ways (byte-exact for valid-UTF-8 files, latin1
// read fallback otherwise — same policy as lib/translator-fixes.js FIX A);
// floats are read exactly (no 3-decimal rounding) so the values written
// back are bit-identical. Read -> write is byte-faithful for every real
// v2 sample we have (test/objects2.test.js).

const SUPPORTED_VERSIONS = [1, 2];

// Object types whose modifications carry the two extra i32s
// (level/variation + data column) — same set at every format version.
const LEVELED_TYPES = new Set(['doodads', 'abilities', 'upgrades']);
const OBJECT_TYPES = new Set([
  'units', 'items', 'destructables', 'doodads', 'abilities', 'buffs', 'upgrades',
]);

const TYPE_NAMES = ['int', 'real', 'unreal', 'string'];
const TYPE_IDS = { int: 0, real: 1, unreal: 2, string: 3 };

function checkObjectType(type) {
  if (!OBJECT_TYPES.has(type)) {
    throw new Error(`objects2: unknown object type "${type}" (expected one of ${[...OBJECT_TYPES].join('/')})`);
  }
}

// ---------------------------------------------------------------- reading

class Cursor {
  constructor(buf) { this.buf = buf; this.off = 0; }
  need(n, what) {
    if (this.off + n > this.buf.length) {
      throw new RangeError(`objects2: truncated file (reading ${what} at byte ${this.off})`);
    }
  }
  i32(what) { this.need(4, what || 'int'); const v = this.buf.readInt32LE(this.off); this.off += 4; return v; }
  u32(what) { this.need(4, what || 'uint'); const v = this.buf.readUInt32LE(this.off); this.off += 4; return v; }
  f32(what) { this.need(4, what || 'float'); const v = this.buf.readFloatLE(this.off); this.off += 4; return v; }
  // 4 raw chars, latin1 (byte-exact; 0x00 bytes stay NUL — the upstream
  // readFourCC(allowNull) dialect, NOT the '0'-for-null readChars one)
  fourCC(what) {
    this.need(4, what || 'fourCC');
    const s = this.buf.toString('latin1', this.off, this.off + 4);
    this.off += 4;
    return s;
  }
  // null-terminated string: UTF-8 when byte-exact under re-encode, else
  // latin1 (identical policy to the patched W3Buffer.readString, FIX A)
  str(what) {
    const start = this.off;
    let end = start;
    while (end < this.buf.length && this.buf[end] !== 0x00) end++;
    if (end >= this.buf.length) {
      throw new RangeError(`objects2: unterminated string (${what || 'string'}) at byte ${start}`);
    }
    this.off = end + 1;
    const bytes = this.buf.subarray(start, end);
    const utf8 = bytes.toString('utf8');
    if (Buffer.byteLength(utf8, 'utf8') === bytes.length && Buffer.from(utf8, 'utf8').equals(bytes)) {
      return utf8;
    }
    return bytes.toString('latin1');
  }
}

const NULL_ID = '\0\0\0\0';

// One buffer (main or skin) merged into `result`. Handles v1/v2 natively and
// tolerates a v3 sets wrapper so a hypothetical mixed main/skin pair still
// reads; ROUTING never sends a pure-v3 main file here (lib/filemap.js).
function readBuffer(type, buffer, result) {
  const leveled = LEVELED_TYPES.has(type);
  const c = new Cursor(buffer);
  const version = c.i32('version');
  if (version !== 1 && version !== 2 && version !== 3) {
    throw new Error(`objects2: unsupported object-data version ${version} (this codec reads v1/v2; v3 belongs to the upstream translator)`);
  }

  const readModification = (oldId, isOriginal) => {
    const id = c.fourCC('modification id');
    const typeId = c.i32('modification value type');
    const typeName = TYPE_NAMES[typeId];
    if (typeName === undefined) {
      throw new Error(`objects2: unknown modification value type ${typeId} at byte ${c.off - 4}`);
    }
    let level = 0;
    let column = 0;
    if (leveled) {
      level = c.i32('modification level');
      column = c.i32('modification column');
    }
    let value;
    if (typeId === TYPE_IDS.int) value = c.i32('int value');
    else if (typeId === TYPE_IDS.string) value = c.str('string value');
    else value = c.f32('float value'); // real/unreal, read exactly (no rounding)
    // trailing u32 sanity check: keep it raw only when it deviates from the
    // convention the write path re-synthesizes (original -> base id bytes,
    // custom -> 0 — matching upstream's v3 writer)
    const trailer = c.fourCC('modification sanity check');
    const convention = isOriginal ? oldId : NULL_ID;
    const mod = { id, type: typeName, level, column, value };
    if (trailer !== convention) {
      mod.sanityCheck = Buffer.from(trailer, 'latin1').readUInt32LE(0);
    }
    return mod;
  };

  const readTable = (tableType) => {
    const count = c.u32(`${tableType} table object count`);
    const table = result[tableType];
    for (let i = 0; i < count; i++) {
      const oldId = c.fourCC('object base id');
      const newId = c.fourCC('object custom id');
      const key = tableType === 'original' ? oldId : `${newId}:${oldId}`;
      if (!(key in table)) table[key] = [];
      const sets = version >= 3 ? c.u32('modification set count') : 1;
      for (let s = 0; s < sets; s++) {
        if (version >= 3) c.u32('modification set flag'); // always 0 in the wild
        const modCount = c.u32('modification count');
        for (let j = 0; j < modCount; j++) {
          table[key].push(readModification(oldId, tableType === 'original'));
        }
      }
    }
  };

  readTable('original');
  readTable('custom');
  if (c.off !== buffer.length) {
    throw new Error(`objects2: ${buffer.length - c.off} unexpected trailing byte(s) after the custom table`);
  }
  return version;
}

function warToJson(type, buffer, skinBuffer) {
  checkObjectType(type);
  const result = { original: {}, custom: {} };
  const version = readBuffer(type, buffer, result);
  if (version === 3) {
    throw new Error('objects2: main file is v3 — it belongs to the upstream translator');
  }
  if (skinBuffer) readBuffer(type, skinBuffer, result); // merge, like upstream
  return { json: { version, original: result.original, custom: result.custom } };
}

// ---------------------------------------------------------------- writing

class Writer {
  constructor() { this.chunks = []; }
  i32(v) { const b = Buffer.alloc(4); b.writeInt32LE(v | 0); this.chunks.push(b); }
  u32(v) { const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0); this.chunks.push(b); }
  f32(v) { const b = Buffer.alloc(4); b.writeFloatLE(v); this.chunks.push(b); }
  str(s) { this.chunks.push(Buffer.from(String(s ?? ''), 'utf8'), Buffer.from([0])); }
  fourCC(s, what) {
    const b = Buffer.from(String(s), 'latin1');
    if (b.length !== 4) {
      throw new Error(`objects2: ${what || 'fourCC'} "${s}" must be exactly 4 bytes`);
    }
    this.chunks.push(b);
  }
  buffer() { return Buffer.concat(this.chunks); }
}

// NB: no skin split at v1/v2 — upstream's destructable "skin" field ids
// (bnam/bfil/...) are ordinary MAIN-file fields in the classic format
// (DracoL1ch DotA's v2 w3b overrides bnam in war3map.w3b itself); splitting
// them out would corrupt the file. bufferSkin is therefore always undefined.
function jsonToWar(type, json) {
  checkObjectType(type);
  const version = json && json.version;
  if (!SUPPORTED_VERSIONS.includes(version)) {
    throw new Error('objects2: jsonToWar expects object-data JSON with "version": 1 or 2 (v3 belongs to the upstream translator)');
  }
  const leveled = LEVELED_TYPES.has(type);
  const w = new Writer();
  w.i32(version);

  const writeModification = (mod, originalId, isCustom) => {
    w.fourCC(mod.id, 'modification id');
    let typeId;
    if (mod.type !== undefined && mod.type !== null) {
      typeId = TYPE_IDS[mod.type];
      if (typeId === undefined) {
        throw new Error(`objects2: modification ${mod.id} has unknown type "${mod.type}" (expected int/real/unreal/string)`);
      }
    } else if (typeof mod.value === 'number') {
      typeId = TYPE_IDS.int; // upstream's untyped-value inference
    } else if (typeof mod.value === 'string') {
      typeId = TYPE_IDS.string;
    } else {
      throw new Error(`objects2: modification ${mod.id} has no type and a value that is neither number nor string`);
    }
    w.i32(typeId);
    if (leveled) {
      w.i32(mod.level || mod.variation || 0); // upstream's doodad alias
      w.i32(mod.column || 0);
    }
    if (typeId === TYPE_IDS.int) w.i32(mod.value);
    else if (typeId === TYPE_IDS.string) w.str(mod.value);
    else w.f32(mod.value);
    if (mod.sanityCheck !== undefined) w.u32(mod.sanityCheck); // raw passthrough
    else if (isCustom) w.u32(0); // upstream convention
    else w.fourCC(originalId, 'modification sanity check');
  };

  const writeTable = (tableData) => {
    const keys = Object.keys(tableData);
    w.u32(keys.length);
    for (const key of keys) {
      let originalId = key;
      let customId = '';
      if (key.indexOf(':') !== -1) [customId, originalId] = key.split(':');
      w.fourCC(originalId, 'object base id');
      if (customId) w.fourCC(customId, 'object custom id');
      else w.u32(0);
      // v1/v2: modification count directly after the ids (no v3 sets wrapper)
      const mods = tableData[key];
      w.u32(mods.length);
      for (const mod of mods) {
        // upstream keys the trailer convention off customId presence,
        // not off which table the object sits in — mirror that
        writeModification(mod, originalId, !!customId);
      }
    }
  };

  writeTable(json.original || {});
  writeTable(json.custom || {});
  return { buffer: w.buffer(), bufferSkin: undefined };
}

// Cheap format sniff used by lib/filemap.js routing.
function isSupported(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length >= 4 &&
    SUPPORTED_VERSIONS.includes(buffer.readInt32LE(0));
}

module.exports = { warToJson, jsonToWar, isSupported, SUPPORTED_VERSIONS };
