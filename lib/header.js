'use strict';
// The .w3x HM3W pre-header: 512 bytes that precede the MPQ archive.
//
// Layout (little-endian):
//   char[4]  magic       'HM3W'
//   u32      unknown     (always 0)
//   cstring  name        null-terminated map name
//   u32      flags       map flags (same bit meanings as w3i flags subset)
//   u32      maxPlayers
//   ...zero padding to 512 bytes. The MPQ archive starts at offset 512.
//
// smpq/StormLib can READ a .w3x directly (they scan for the MPQ magic), but
// they CREATE bare MPQs — the pre-header must be prepended manually.

const HEADER_SIZE = 512;
const MAGIC = 'HM3W';

function hasHM3W(buffer) {
  return buffer.length >= 4 && buffer.toString('latin1', 0, 4) === MAGIC;
}

// Parse the 512-byte pre-header into { name, flags, maxPlayers, unknown }.
function parseHeader(buffer) {
  if (!hasHM3W(buffer)) throw new Error('not a HM3W header (bad magic)');
  const unknown = buffer.readUInt32LE(4);
  let end = 8;
  while (end < HEADER_SIZE && buffer[end] !== 0) end++;
  const name = buffer.toString('utf8', 8, end);
  const flags = buffer.readUInt32LE(end + 1);
  const maxPlayers = buffer.readUInt32LE(end + 5);
  return { name, flags, maxPlayers, unknown };
}

// Serialize { name, flags, maxPlayers, unknown } to a 512-byte buffer.
function buildHeader(fields) {
  const name = Buffer.from(String(fields.name ?? 'Untitled Map'), 'utf8').subarray(0, 495);
  const buf = Buffer.alloc(HEADER_SIZE);
  buf.write(MAGIC, 0, 'latin1');
  buf.writeUInt32LE(fields.unknown >>> 0 || 0, 4);
  name.copy(buf, 8);
  // name is followed by its null terminator (already 0 from alloc)
  buf.writeUInt32LE((fields.flags ?? 0) >>> 0, 8 + name.length + 1);
  buf.writeUInt32LE((fields.maxPlayers ?? 4) >>> 0, 8 + name.length + 5);
  return buf;
}

// Read the map-flags dword out of a raw war3map.w3i buffer. World Editor
// mirrors the full w3i flags value into the HM3W pre-header flags field —
// a pre-header with flags=0 diverges from what WE writes for the same map.
// Layout (see War3Net MapInfo): i32 version, i32 saves, i32 editorVersion,
// [v27+: 4 x i32 gameVersion], 4 cstrings (name/author/description/
// recommended players), 8 floats camera bounds, 4 x i32 complements,
// i32 playable width, i32 playable height, i32 flags.
// Returns null when the buffer can't be a supported w3i (v15+). Classic
// (pre-Reforged) versions are fine: v18/v25 lack the game-version block
// (v27+ only), everything up to the flags dword is otherwise laid out the
// same — verified against a real classic v25 map whose HM3W header flags
// match this reader bit-for-bit. All offsets are bounds-checked: `buf[o]`
// past the end reads as undefined (never 0), so an unguarded string scan
// on a truncated/garbage buffer would loop forever.
function readW3iFlags(buf) {
  try {
    const version = buf.readUInt32LE(0);
    if (version < 15 || version > 100) return null;
    let o = 12; // version, saves, editorVersion
    if (version >= 27) o += 16; // game version major/minor/patch/build
    for (let i = 0; i < 4; i++) { // 4 null-terminated strings
      while (o < buf.length && buf[o] !== 0) o++;
      if (o >= buf.length) return null; // unterminated: not a w3i
      o++;
    }
    o += 32; // camera bounds: 8 floats
    o += 16; // camera bounds complements: 4 ints
    o += 8; // playable width/height
    if (o + 4 > buf.length) return null;
    return buf.readUInt32LE(o);
  } catch {
    return null;
  }
}

module.exports = { HEADER_SIZE, MAGIC, hasHM3W, parseHeader, buildHeader, readW3iFlags };
