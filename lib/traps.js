'use strict';
// Protection-trap heuristic. Map protectors replace files the game tolerates
// being broken with tiny booby-trapped stubs whose count field is garbage —
// e.g. an 8-byte war3map.w3r that is `05 00 00 00` (version 5) followed by
// four ASCII letters where the region count belongs (~1.2 billion). A naive
// parser then loops/allocates on the absurd count: editors crash, and so did
// unbounded readers here (see lib/translator-fixes.js FIX B). Detecting the
// trap BEFORE parsing lets tools skip translation (and the mdx-m3-viewer
// fallback, which would try to allocate the billion-entry array) and report
// a precise per-file note instead of dying.
//
// Heuristic (deliberately conservative — no false positives on legitimately
// small files): the file is under 64 bytes for a format that is normally
// KB+ sized, AND its declared entry count exceeds the number of entries
// that could possibly fit in the remaining bytes (using a per-format
// minimum entry size), or is negative. Legit empty files (count 0) and
// tiny-but-honest files (1 short entry) never trigger.

const TINY_FILE_LIMIT = 64;

// countOffset: byte offset of the first entry-count int32 in the file.
// minEntrySize: smallest possible serialized entry (conservative lower
// bound: fixed fields + 1-byte strings), so maxFit is never underestimated.
const COUNT_FIELDS = {
  'war3map.w3r': { countOffset: 8, minEntrySize: 30 },  // ver, count; region >= 4 floats + name + idx + weather + snd + color
  'war3map.w3c': { countOffset: 8, minEntrySize: 40 },  // ver, count; camera >= 10 floats + name
  'war3map.w3s': { countOffset: 8, minEntrySize: 30 },  // ver, count; sound >= 3 strings + ~8 ints
  'war3map.doo': { countOffset: 16, minEntrySize: 42 }, // 'W3do', ver, subver, count; doodad = 42+ bytes
  'war3mapUnits.doo': { countOffset: 16, minEntrySize: 76 },
  'war3map.imp': { countOffset: 8, minEntrySize: 2 },   // ver, count; import = flag byte + path
};
// Object data (v3): int version, then the original-table entry count.
for (const w of ['w3u', 'w3t', 'w3b', 'w3d', 'w3a', 'w3h', 'w3q']) {
  COUNT_FIELDS[`war3map.${w}`] = { countOffset: 8, minEntrySize: 12 }; // ids + counts of an empty object
  COUNT_FIELDS[`war3mapSkin.${w}`] = { countOffset: 8, minEntrySize: 12 };
}

// Returns a human-readable note when `buffer` looks like a protection trap
// for archive member `baseName`, else null.
function checkSuspectedTrap(baseName, buffer) {
  const spec = COUNT_FIELDS[baseName];
  if (!spec) return null;
  if (buffer.length >= TINY_FILE_LIMIT) return null;
  if (buffer.length < spec.countOffset) return null;
  const count = buffer.readInt32LE(spec.countOffset - 4);
  const remaining = buffer.length - spec.countOffset;
  const maxFit = Math.floor(remaining / spec.minEntrySize);
  if (count >= 0 && count <= maxFit) return null;
  return `possible protection trap (tiny ${buffer.length}-byte file declares ` +
    `${count} entr${count === 1 ? 'y' : 'ies'}, but at most ${maxFit} could fit)`;
}

module.exports = { checkSuspectedTrap, TINY_FILE_LIMIT };
