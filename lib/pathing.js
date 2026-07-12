'use strict';
// Path map (war3map.wpm) + shadow map (war3map.shd) generation. Both are
// terrain-dimension-derived binaries every real map ships; their sizes MUST
// match terrain.json's map.width/height (gotcha 8) or the game misreads
// them. build-map generates all-passable / no-shadow defaults from
// terrain.json when the source doesn't provide its own under files/ (drop in
// files/war3map.wpm / files/war3map.shd to override — user pathing data is
// never clobbered), and warns when a provided copy doesn't match the terrain
// dimensions (the classic resize foot-gun).
//
// Byte layouts (docs/FORMATS.md; cross-checked against mdx-m3-viewer-th's
// wpm/shd parsers, which validate-map runs over every packed map):
//   war3map.wpm: 'MP3W' magic + i32 version(0) + i32 width + i32 height +
//                width*height flag bytes, where width/height = tiles*4
//                (4x4 pathing cells per terrain tile). Flag byte 0 = fully
//                passable (walkable/flyable/buildable, no blight).
//   war3map.shd: raw (tiles*4)*(tiles*4) bytes, no header; byte 0 = no
//                shadow, 0xFF = shadow.

const WPM_MAGIC = 'MP3W';
const WPM_HEADER_SIZE = 16;
const CELLS_PER_TILE = 4;

// Pathing/shadow grid dimensions for a terrain.json (cells, not tiles).
function pathingDims(terrain) {
  return {
    width: terrain.map.width * CELLS_PER_TILE,
    height: terrain.map.height * CELLS_PER_TILE,
  };
}

// terrain.json -> all-passable war3map.wpm buffer.
function generateWpm(terrain) {
  const { width, height } = pathingDims(terrain);
  const buf = Buffer.alloc(WPM_HEADER_SIZE + width * height); // body all 0 = passable
  buf.write(WPM_MAGIC, 0, 'latin1');
  buf.writeInt32LE(0, 4); // version
  buf.writeInt32LE(width, 8);
  buf.writeInt32LE(height, 12);
  return buf;
}

// terrain.json -> no-shadow war3map.shd buffer.
function generateShd(terrain) {
  const { width, height } = pathingDims(terrain);
  return Buffer.alloc(width * height); // all 0 = no shadow
}

// Check a user-provided wpm/shd buffer against terrain.json dimensions.
// Returns a human-readable warning string on mismatch, null when consistent.
// `name` is 'war3map.wpm' or 'war3map.shd'.
function checkPathingFile(name, buf, terrain) {
  const { width, height } = pathingDims(terrain);
  if (name === 'war3map.wpm') {
    if (buf.length < WPM_HEADER_SIZE || buf.toString('latin1', 0, 4) !== WPM_MAGIC) {
      return `files/${name}: no '${WPM_MAGIC}' header — not a path map (expected 16-byte header + ${width}x${height} cells)`;
    }
    const w = buf.readInt32LE(8);
    const h = buf.readInt32LE(12);
    if (w !== width || h !== height) {
      return `files/${name}: path map is ${w}x${h} cells but terrain.json (${terrain.map.width}x${terrain.map.height} tiles) `
        + `implies ${width}x${height} — regenerate after a terrain resize (delete the file to auto-generate; gotcha 8)`;
    }
    if (buf.length !== WPM_HEADER_SIZE + width * height) {
      return `files/${name}: ${buf.length} bytes but header dimensions imply ${WPM_HEADER_SIZE + width * height}`;
    }
    return null;
  }
  if (name === 'war3map.shd') {
    if (buf.length !== width * height) {
      return `files/${name}: shadow map is ${buf.length} bytes but terrain.json (${terrain.map.width}x${terrain.map.height} tiles) `
        + `implies ${width * height} — regenerate after a terrain resize (delete the file to auto-generate; gotcha 8)`;
    }
    return null;
  }
  return null;
}

module.exports = { generateWpm, generateShd, checkPathingFile, pathingDims };
