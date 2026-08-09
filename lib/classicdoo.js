'use strict';
// classicdoo.js — identify the CLASSIC (pre-1.32) war3map.doo /
// war3mapUnits.doo layout behind an upstream past-end overread.
//
// Root cause (docs/upstream/ draft (a)): wc3maptranslator's Doodads/Units
// translators unconditionally read a 4-byte `skinId` field per entry. That
// field only exists in files written by 1.32+ editors; classic files don't
// have it, so the cursor drifts +4 bytes per entry and the parse eventually
// reads past the end of the buffer. The version dwords are IDENTICAL in both
// layouts (`W3do` / version 8 / subversion 11), so expectVersion cannot tell
// them apart and neither can we by inspecting the header — the only reliable
// discriminator is whether the file parses EXACTLY under the classic layout.
//
// This module is a DETECTOR, not a codec: it walks the classic layout with a
// bounds-checked cursor and reports success only when the walk consumes the
// buffer to the last byte. Callers use it to distinguish "we can't read this
// classic file (upstream bug, the map is fine — the game reads it, and for
// war3mapUnits.doo the game never reads it at all, gotcha 10)" from a genuine
// corrupt/unknown file. Nothing here writes or repacks: classic .doo stays
// read-only (capability matrix in CLAUDE.md).
//
// isClassicDooOverread(member, buf, err) -> null | { kind, entries, bytes }
//   member: archive-relative name (case/slash insensitive)
//   buf:    the file bytes
//   err:    the error the upstream translator threw
// All three must hold for a non-null result:
//   1. the member is war3map.doo or war3mapUnits.doo,
//   2. the thrown error is a SMALL past-end overread (a range error; when the
//      offsets are recoverable from the message, at most OVERREAD_SLACK bytes
//      past the end) — not a version error, not a semantic failure,
//   3. the classic layout parses the whole buffer exactly.

const MAGIC = 'W3do';
const OVERREAD_SLACK = 64; // bytes past the end still counted as "cursor drift"

class Trunc extends Error {}

// Minimal bounds-checked little-endian cursor. Every read that would leave
// the buffer throws Trunc, which the walkers turn into "not classic".
class Cur {
  constructor(buf) { this.buf = buf; this.off = 0; }
  need(n) { if (this.off + n > this.buf.length) throw new Trunc('past end'); }
  skip(n) { this.need(n); this.off += n; }
  int() { this.need(4); const v = this.buf.readInt32LE(this.off); this.off += 4; return v; }
  float() { this.need(4); const v = this.buf.readFloatLE(this.off); this.off += 4; return v; }
  byte() { this.need(1); return this.buf[this.off++]; }
  chars(n) { this.need(n); const v = this.buf.toString('latin1', this.off, this.off + n); this.off += n; return v; }
  get rest() { return this.buf.length - this.off; }
}

// Guard against absurd counts before looping (same spirit as lib/traps.js):
// a count that cannot possibly fit in the remaining bytes is garbage.
function boundedCount(c, minEntryBytes) {
  const n = c.int();
  if (n < 0 || n > Math.floor(c.rest / minEntryBytes)) throw new Trunc('count cannot fit');
  return n;
}

function readHeader(c) {
  if (c.chars(4) !== MAGIC) throw new Trunc('not W3do');
  const version = c.int();
  const sub = c.int();
  if (version !== 8 || sub !== 11) throw new Trunc(`unexpected version ${version}/${sub}`);
}

// Item drop tables, identical in both files and both layouts. Upstream reads
// the set count unconditionally and the sets themselves only when the random
// pointer is negative — mirrored exactly so the byte walk matches.
function readItemTables(c) {
  const randomItemSetPtr = c.int();
  const numberOfItemSets = boundedCount(c, 4);
  if (randomItemSetPtr < 0 && numberOfItemSets) {
    for (let j = 0; j < numberOfItemSets; j++) {
      const numItems = boundedCount(c, 8);
      c.skip(numItems * 8); // 4-char id + int chance
    }
  }
}

// war3map.doo, classic layout: no skinId between scale and the flag byte.
function walkDoodads(buf) {
  const c = new Cur(buf);
  readHeader(c);
  const n = boundedCount(c, 38); // smallest possible classic doodad entry
  for (let i = 0; i < n; i++) {
    c.skip(4);      // type
    c.int();        // variation
    c.skip(12);     // position
    c.float();      // angle
    c.skip(12);     // scale
    /* 1.32+ would read a 4-byte skinId HERE — the classic file has none */
    c.byte();       // flags
    c.byte();       // life
    readItemTables(c);
    c.int();        // editor id
  }
  c.int();                       // special-doodad format version
  const special = boundedCount(c, 16);
  c.skip(special * 16);          // type + z + x + y
  if (c.rest !== 0) throw new Trunc(`${c.rest} trailing byte(s)`);
  return { kind: 'doodads', entries: n };
}

// war3mapUnits.doo, classic layout: same missing skinId, richer entry body.
function walkUnits(buf) {
  const c = new Cur(buf);
  readHeader(c);
  const n = boundedCount(c, 80); // smallest possible classic unit entry
  for (let i = 0; i < n; i++) {
    c.skip(4);      // type
    c.int();        // variation
    c.skip(12);     // position
    c.float();      // rotation
    c.skip(12);     // scale
    /* 1.32+ would read a 4-byte skinId HERE — the classic file has none */
    c.byte();       // flags
    c.int();        // owning player
    c.byte();       // unknown
    c.byte();       // unknown
    c.int();        // hitpoints
    c.int();        // mana
    readItemTables(c);
    c.int();        // gold
    c.float();      // target acquisition
    c.skip(16);     // hero level/str/agi/int
    const inv = boundedCount(c, 8);
    c.skip(inv * 8);            // slot + item id
    const abil = boundedCount(c, 12);
    c.skip(abil * 12);          // ability id + active + level
    const randFlag = c.int();
    if (randFlag === 0) c.skip(4);        // int24 level + item class byte
    else if (randFlag === 1) c.skip(8);   // group + position
    else if (randFlag === 2) {
      const kinds = boundedCount(c, 8);
      c.skip(kinds * 8);                  // id + chance
    } else throw new Trunc(`unknown random flag ${randFlag}`);
    c.int();        // custom color
    c.int();        // waygate region id
    c.int();        // editor id
  }
  if (c.rest !== 0) throw new Trunc(`${c.rest} trailing byte(s)`);
  return { kind: 'units', entries: n };
}

const WALKERS = new Map([
  ['war3map.doo', walkDoodads],
  ['war3mapunits.doo', walkUnits],
]);

// Node's Buffer range error carries the numbers we need:
//   'The value of "offset" is out of range. It must be >= 0 and <= 3342. Received 3347'
const RANGE_NUMBERS = /<=\s*(\d+)\.\s*Received\s+(\d+)/;

function isSmallPastEndOverread(err) {
  const msg = String((err && err.message) || err || '');
  if (!/out of range|past end|beyond|exceeds/i.test(msg)) return false;
  const m = RANGE_NUMBERS.exec(msg);
  if (!m) return true; // range-shaped but unnumbered: rely on the exact walk
  const max = Number(m[1]);
  const got = Number(m[2]);
  return got > max && got - max <= OVERREAD_SLACK;
}

function isClassicDooOverread(member, buf, err) {
  const base = String(member).replace(/\\/g, '/').split('/').pop().toLowerCase();
  const walk = WALKERS.get(base);
  if (!walk) return null;
  if (!isSmallPastEndOverread(err)) return null;
  if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf);
  let r;
  try {
    r = walk(buf);
  } catch {
    return null; // not the classic layout either — a real, unexplained failure
  }
  return { ...r, bytes: buf.length };
}

// One-line explanation for WARN lines / manifest notes.
function explain(hit) {
  return `classic pre-1.32 .doo layout (${hit.entries} ${hit.kind === 'units' ? 'unit' : 'doodad'} entr${hit.entries === 1 ? 'y' : 'ies'}, no per-entry skinId field): `
    + 'upstream wc3maptranslator reads the 1.32+ skinId unconditionally and overreads by 4 bytes/entry '
    + '(docs/upstream/ draft (a); the version dwords are identical in both layouts). '
    + 'Parsing skipped, file passed through unvalidated — the map itself is fine.';
}

module.exports = { isClassicDooOverread, explain, OVERREAD_SLACK };
