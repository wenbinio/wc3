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

module.exports = { HEADER_SIZE, MAGIC, hasHM3W, parseHeader, buildHeader };
