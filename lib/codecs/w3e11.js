'use strict';
// war3map.w3e format v11 codec (read + write).
//
// Why this exists: wc3maptranslator@5 hardcodes w3e v12 (expectVersion
// throws on anything else), but every real published map we've decomposed —
// including maps saved by the current 1.36/2.0 editors — ships v11 terrain.
// This codec makes v11 read/write a first-class citizen of the pipeline;
// lib/filemap.js routes war3map.w3e by version dword (11 -> here,
// 12 -> upstream TerrainTranslator).
//
// v11 <-> v12 DELTA (verified against mdx-m3-viewer-th's w3e parser,
// War3Net's TerrainTile.cs, and four real v11 maps incl. WC3 2.0-saved):
//   The ONLY difference is per-corner field 3 ("texture and flags"):
//     v11: u8   — groundTexture in bits 0-3 (max 16 palette tiles),
//                 flags ramp/blight/water/boundary in bits 4-7
//                 (0x10/0x20/0x40/0x80)
//     v12: u16LE — groundTexture in bits 0-5 (max 64 palette tiles),
//                 the same four flags shifted up to bits 6-9
//                 (0x40/0x80/0x100/0x200)
//   A corner is therefore 7 bytes in v11 vs 8 bytes in v12. Header
//   (magic/version/tileset/customTileset/palettes/dims/offset) and the
//   other corner fields are identical.
//
// JSON DIALECT: exactly upstream TerrainTranslator's v12 dialect (same keys,
// same row-reversal — file rows are bottom-up, JSON rows top-down — and the
// same unshifted variation/cliff masks) plus a `"version": 11` top-level
// marker, so map sources are explicit about the format they build to.
// `flags` values are normalized to the v12 bit positions (ramp 0x40,
// blight 0x80, water 0x100, boundary 0x200): terrain.json means the same
// thing at either version, and switching a source between v11/v12 is just
// editing the marker (as long as palette <= 16 tiles).
//
// FIDELITY: read -> write is byte-faithful for every real v11 sample we
// have (see test/codecs.test.js). The one theoretical loss shared with the
// upstream v12 dialect: bit 15 of the water/boundary u16 is not
// representable in JSON (upstream masks `& 32767` too); no real map has it
// set. Corner floats don't exist in w3e; the two header offset floats are
// read exactly (no 3-decimal rounding), which still round-trips through
// upstream's addFloat float32 write.

// v12-positioned flag bits representable in v11 (ramp|blight|water|boundary)
const V11_FLAGS_MASK = 0x3c0;

function warToJson(buffer) {
  if (buffer.length < 8 || buffer.toString('latin1', 0, 4) !== 'W3E!') {
    throw new Error('w3e11: not a w3e file (missing W3E! magic)');
  }
  const version = buffer.readInt32LE(4);
  if (version !== 11) {
    throw new Error(`w3e11: unsupported version ${version} (this codec reads v11 only)`);
  }
  let o = 8;
  const need = (n, what) => {
    if (o + n > buffer.length) throw new RangeError(`w3e11: truncated file (reading ${what} at byte ${o})`);
  };
  need(1, 'tileset');
  const tileset = buffer.toString('latin1', o, o + 1); o += 1;
  need(4, 'customTileset');
  const customTileset = buffer.readInt32LE(o) === 1; o += 4;

  // NB: palette sizes are NOT capped at 16 on read — v11's 4-bit indices can
  // only address the first 16 tiles, but out-of-spec files with padded
  // palettes exist (and lose nothing by being read); only negative counts
  // are rejected. The per-entry bounds check keeps trap files cheap to fail.
  need(4, 'tile palette count');
  const numTiles = buffer.readInt32LE(o); o += 4;
  if (numTiles < 0) throw new Error(`w3e11: negative ground tile palette size ${numTiles}`);
  const tilePalette = [];
  for (let i = 0; i < numTiles; i++) {
    need(4, 'tile palette entry');
    tilePalette.push(buffer.toString('latin1', o, o + 4)); o += 4;
  }

  need(4, 'cliff palette count');
  const numCliff = buffer.readInt32LE(o); o += 4;
  if (numCliff < 0) throw new Error(`w3e11: negative cliff tile palette size ${numCliff}`);
  const cliffTilePalette = [];
  for (let i = 0; i < numCliff; i++) {
    need(4, 'cliff palette entry');
    cliffTilePalette.push(buffer.toString('latin1', o, o + 4)); o += 4;
  }

  need(16, 'map dimensions');
  const storedWidth = buffer.readInt32LE(o); o += 4;
  const storedHeight = buffer.readInt32LE(o); o += 4;
  const offsetX = buffer.readFloatLE(o); o += 4;
  const offsetY = buffer.readFloatLE(o); o += 4;

  const corners = storedWidth * storedHeight;
  if (storedWidth <= 0 || storedHeight <= 0 || buffer.length - o !== corners * 7) {
    throw new Error(
      `w3e11: corner data size mismatch: ${buffer.length - o} bytes for ` +
      `${storedWidth}x${storedHeight} corners (expected ${corners * 7} at 7 bytes/corner)`);
  }

  // Flat arrays in FILE order first (bottom row first)...
  const groundHeight = new Array(corners);
  const waterHeight = new Array(corners);
  const boundaryFlag = new Array(corners);
  const flags = new Array(corners);
  const groundTexture = new Array(corners);
  const groundVariation = new Array(corners);
  const cliffVariation = new Array(corners);
  const cliffTexture = new Array(corners);
  const layerHeight = new Array(corners);
  for (let i = 0; i < corners; i++) {
    groundHeight[i] = buffer.readInt16LE(o); o += 2;
    const waterAndBoundary = buffer.readInt16LE(o); o += 2;
    // upstream dialect: waterHeight keeps bits 0-14 (incl. the boundary bit)
    waterHeight[i] = waterAndBoundary & 32767;
    boundaryFlag[i] = (waterAndBoundary & 0x4000) === 0x4000;
    const tf = buffer[o]; o += 1;
    groundTexture[i] = tf & 0x0f;
    flags[i] = (tf & 0xf0) << 2; // normalize to the v12 bit positions
    const variation = buffer[o]; o += 1;
    groundVariation[i] = variation & 0b11111000; // upstream's unshifted masks
    cliffVariation[i] = variation & 0b00000111;
    const cliff = buffer[o]; o += 1;
    cliffTexture[i] = cliff & 0xf0;
    layerHeight[i] = cliff & 0x0f;
  }

  // ...then reverse row order like upstream (file bottom-up -> JSON top-down).
  const rev = (arr) => {
    const out = new Array(corners);
    for (let row = 0; row < storedHeight; row++) {
      const src = (storedHeight - 1 - row) * storedWidth;
      for (let col = 0; col < storedWidth; col++) out[row * storedWidth + col] = arr[src + col];
    }
    return out;
  };

  return {
    json: {
      version: 11,
      tileset,
      customTileset,
      tilePalette,
      cliffTilePalette,
      map: { width: storedWidth - 1, height: storedHeight - 1, offset: { x: offsetX, y: offsetY } },
      groundHeight: rev(groundHeight),
      waterHeight: rev(waterHeight),
      boundaryFlag: rev(boundaryFlag),
      flags: rev(flags),
      groundTexture: rev(groundTexture),
      groundVariation: rev(groundVariation),
      cliffVariation: rev(cliffVariation),
      cliffTexture: rev(cliffTexture),
      layerHeight: rev(layerHeight),
    },
  };
}

function jsonToWar(json) {
  if (!json || json.version !== 11) {
    throw new Error('w3e11: jsonToWar expects terrain JSON with "version": 11');
  }
  const storedWidth = json.map.width + 1;
  const storedHeight = json.map.height + 1;
  const corners = storedWidth * storedHeight;
  for (const key of ['groundHeight', 'waterHeight', 'boundaryFlag', 'flags', 'groundTexture',
    'groundVariation', 'cliffVariation', 'cliffTexture', 'layerHeight']) {
    if (!Array.isArray(json[key]) || json[key].length !== corners) {
      throw new Error(`w3e11: ${key} must be an array of ${corners} entries (${storedWidth}x${storedHeight} corners)`);
    }
  }
  // palette length is deliberately not capped (mirror of the lenient read);
  // the hard v11 constraint is the 4-bit groundTexture index, checked below

  const buf = Buffer.alloc(37 + 4 * (json.tilePalette.length + json.cliffTilePalette.length) + corners * 7);
  let o = 0;
  buf.write('W3E!', o, 'latin1'); o += 4;
  buf.writeInt32LE(11, o); o += 4;
  buf.write(String(json.tileset).slice(0, 1) || 'L', o, 'latin1'); o += 1;
  buf.writeInt32LE(json.customTileset ? 1 : 0, o); o += 4;
  buf.writeInt32LE(json.tilePalette.length, o); o += 4;
  for (const tile of json.tilePalette) { buf.write(tile, o, 'latin1'); o += 4; }
  buf.writeInt32LE(json.cliffTilePalette.length, o); o += 4;
  for (const tile of json.cliffTilePalette) { buf.write(tile, o, 'latin1'); o += 4; }
  buf.writeInt32LE(storedWidth, o); o += 4;
  buf.writeInt32LE(storedHeight, o); o += 4;
  buf.writeFloatLE(json.map.offset.x, o); o += 4;
  buf.writeFloatLE(json.map.offset.y, o); o += 4;

  // JSON rows are top-down; the file wants bottom-up (mirror of the read).
  for (let row = storedHeight - 1; row >= 0; row--) {
    for (let col = 0; col < storedWidth; col++) {
      const i = row * storedWidth + col;
      const flags = json.flags[i] | 0;
      if (flags & ~V11_FLAGS_MASK) {
        throw new Error(
          `w3e11: corner ${i} has flags 0x${flags.toString(16)} outside the v11-representable set ` +
          `0x${V11_FLAGS_MASK.toString(16)} (ramp/blight/water/boundary at v12 positions)`);
      }
      const tex = json.groundTexture[i] | 0;
      if (tex < 0 || tex > 15) {
        throw new Error(`w3e11: corner ${i} groundTexture ${tex} out of v11 range 0-15`);
      }
      buf.writeInt16LE(json.groundHeight[i] | 0, o); o += 2;
      buf.writeInt16LE((json.waterHeight[i] | (json.boundaryFlag[i] ? 0x4000 : 0)) & 0x7fff, o); o += 2;
      buf[o++] = ((flags >> 2) & 0xf0) | tex;
      buf[o++] = (json.groundVariation[i] & 0b11111000) | (json.cliffVariation[i] & 0b00000111);
      buf[o++] = (json.cliffTexture[i] & 0xf0) | (json.layerHeight[i] & 0x0f);
    }
  }
  return { buffer: buf };
}

// Cheap format sniff used by lib/filemap.js routing.
function isV11(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length >= 8 &&
    buffer.toString('latin1', 0, 4) === 'W3E!' && buffer.readInt32LE(4) === 11;
}

module.exports = { warToJson, jsonToWar, isV11 };
