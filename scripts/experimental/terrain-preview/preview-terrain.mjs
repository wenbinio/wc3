#!/usr/bin/env node
// preview-terrain.mjs — headless high-res top-down terrain preview for WC3 maps.
//
//   node preview-terrain.mjs <map-source-or-extracted-dir> <out.png>
//
// Tier-1 of the terrain-preview capability (scratchpad prototype; promotion
// target: scripts/experimental/terrain-preview/). Renders, pure node, ~1600px:
//   - per-tile ground color (palette derived from lib/minimap.js TILE_COLORS,
//     which covers every WE default-palette tile suffix in docs/FORMATS.md)
//   - hillshading from the height field (directional NW light on the gradient
//     of groundHeight/4 + cliff-layer*128 — the game's elevation composition)
//   - water overlay (depth-scaled alpha), blight/boundary tints
//   - cliff edges (layer discontinuities darkened; ramp-flagged pixels less)
//   - doodad dots by class (trees / rocks / custom props / other stock)
//   - unit markers in player color (start locations = large flagged rings,
//     gold mines annotated), region rectangles + labels, legend + scale bar.
//
// Input dialect: the repo's terrain.json/doodads.json/units.json/regions.json
// (both w3e v12 and v11 land in the same JSON via lib/codecs). An EXTRACTED
// dir (war3map.w3e etc.) is translated on the fly through the repo's own
// lib/filemap.js (read-only require) — same translators the pipeline uses.
//
// HONESTY: colors are OUR palette (layout-truth, not look-truth); ground
// variation, tile blending, actual doodad art and fog are not simulated.
'use strict';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { createRequire } from 'module';

const REPO = process.env.WC3_REPO || '/home/user/wc3';
const requireRepo = createRequire(path.join(REPO, 'package.json'));
const { PLAYER_COLORS } = requireRepo('./lib/minimap.js');

// ---------------------------------------------------------------------------
// palette: tile-suffix -> [r,g,b] + display name.
// Derived 1:1 from lib/minimap.js TILE_COLORS (kept in sync by hand — that
// module does not export it); names from docs/FORMATS.md tileset tables.
const TILE_INFO = {
  dirt: [[114, 84, 55], 'Dirt'], drt: [[114, 84, 55], 'Dirt'],
  dro: [[126, 94, 60], 'Rough Dirt'],
  drd: [[88, 62, 42], 'Dark Dirt'],
  drh: [[122, 90, 58], 'Rough Dirt'],
  drr: [[125, 98, 70], 'Pebbles'],
  dtr: [[126, 94, 60], 'Rough Dirt'],
  drg: [[96, 104, 48], 'Grassy Dirt'],
  rok: [[112, 112, 112], 'Rock'],
  rck: [[112, 112, 112], 'Rock'],
  flr: [[128, 116, 100], 'Rock'],
  grs: [[52, 110, 42], 'Grass'],
  grd: [[38, 88, 34], 'Dark Grass'],
  grr: [[110, 120, 52], 'Grass'],
  grt: [[44, 96, 38], 'Thick Grass'],
  gsb: [[60, 110, 45], 'Grass'],
  hdg: [[50, 95, 40], 'Grass Trim'],
  snw: [[225, 230, 238], 'Snow'],
  snr: [[200, 205, 212], 'Rocky Snow'],
  sng: [[190, 205, 190], 'Grassy Snow'],
  ice: [[170, 205, 225], 'Ice'],
  dki: [[120, 160, 185], 'Dark Ice'],
  san: [[205, 185, 130], 'Sand'],
  dsr: [[196, 168, 116], 'Desert'],
  dsd: [[160, 130, 88], 'Dark Desert'],
  sqd: [[205, 185, 130], 'Square Tiles'],
  sqt: [[130, 125, 120], 'Square Tiles'],
  dkt: [[55, 50, 55], 'Dark Tiles'],
  lvc: [[60, 45, 45], 'Lava Cracks'],
  lav: [[180, 60, 20], 'Lava'],
  vin: [[70, 95, 45], 'Vines'],
  lea: [[70, 100, 45], 'Leaves'],
  lvd: [[70, 100, 45], 'Leaves'],
  lvg: [[70, 100, 45], 'Leaves'],
  pos: [[90, 140, 60], 'Poison'],
  crp: [[150, 120, 60], 'Crops'],
  cbp: [[130, 125, 115], 'Cobble Path'],
  stp: [[150, 145, 135], 'Stone Path'],
  brk: [[130, 105, 85], 'Brick'],
  bks: [[140, 120, 100], 'Small Bricks'],
  bkl: [[150, 130, 110], 'Large Bricks'],
  smb: [[120, 110, 100], 'Small Bricks'],
  lgb: [[125, 115, 105], 'Large Bricks'],
  fst: [[135, 125, 110], 'Flat Stones'],
  fsl: [[150, 140, 125], 'Flat Stones Lt'],
  blm: [[45, 45, 50], 'Black Marble'],
  wmb: [[200, 200, 205], 'White Marble'],
  btl: [[140, 110, 90], 'Brick Tiles'],
  rtl: [[155, 150, 140], 'Round Tiles'],
  til: [[155, 150, 140], 'Round Tiles'],
  rds: [[140, 80, 70], 'Red Stones'],
  dkr: [[70, 65, 60], 'Dark Rocks'],
  bkb: [[40, 40, 45], 'Black Bricks'],
  rbk: [[90, 80, 110], 'Rune Bricks'],
  tbk: [[120, 110, 125], 'Tiled Bricks'],
  bsq: [[50, 50, 55], 'Black Squares'],
  aby: [[25, 20, 35], 'Abyss'],
};
const FALLBACK_COLORS = [
  [110, 82, 54], [96, 104, 48], [52, 110, 42], [112, 112, 112],
  [38, 88, 34], [126, 94, 60], [140, 120, 90], [80, 80, 96],
];
const TILESET_NAMES = {
  A: 'Ashenvale', B: 'Barrens', C: 'Felwood', D: 'Dungeon',
  F: 'Lordaeron Fall', G: 'Underground', I: 'Icecrown Glacier',
  J: 'Dalaran Ruins', K: 'Black Citadel', L: 'Lordaeron Summer',
  N: 'Northrend', O: 'Outland', Q: 'Village Fall', V: 'Village',
  W: 'Lordaeron Winter', X: 'Dalaran', Y: 'Cityscape', Z: 'Sunken Ruins',
};
const WATER_COLOR = [40, 90, 165];
const BLIGHT_COLOR = [86, 62, 74];
// flags dword (v12 bit positions — codecs normalize v11 to these)
const FLAG_RAMP = 0x40, FLAG_BLIGHT = 0x80, FLAG_WATER = 0x100, FLAG_BOUNDARY = 0x200;

// doodad/unit marker classes
const CLASS_COLORS = {
  tree: [22, 72, 22],
  rock: [150, 150, 150],
  prop: [235, 140, 40],   // custom/imported decor (e.g. last-train's Sol set)
  stock: [176, 120, 200], // other stock doodads
};
const NEUTRAL_HOSTILE = [150, 30, 30];
const NEUTRAL_PASSIVE = [230, 200, 70];
const KNOWN_ROCKS = new Set(['LTrc', 'ATrc', 'BTrc', 'KTrc', 'NTrc', 'YTrc', 'ZTrc', 'LTrt', 'LTr1', 'LTr2']);

// ---------------------------------------------------------------------------
// 5x7 bitmap font (uppercase + digits + punctuation), rows top->bottom,
// bit 4 = leftmost column.
const FONT = {
  ' ': [0,0,0,0,0,0,0], '-': [0,0,0,0x0E,0,0,0], '.': [0,0,0,0,0,0x0C,0x0C],
  ':': [0,0x0C,0x0C,0,0x0C,0x0C,0], '/': [0x01,0x01,0x02,0x04,0x08,0x10,0x10],
  '(': [0x02,0x04,0x08,0x08,0x08,0x04,0x02], ')': [0x08,0x04,0x02,0x02,0x02,0x04,0x08],
  "'": [0x0C,0x0C,0x04,0,0,0,0], ',': [0,0,0,0,0,0x0C,0x04], '+': [0,0x04,0x04,0x1F,0x04,0x04,0],
  '=': [0,0,0x1F,0,0x1F,0,0], '%': [0x19,0x19,0x02,0x04,0x08,0x13,0x13],
  '0': [0x0E,0x11,0x13,0x15,0x19,0x11,0x0E], '1': [0x04,0x0C,0x04,0x04,0x04,0x04,0x0E],
  '2': [0x0E,0x11,0x01,0x02,0x04,0x08,0x1F], '3': [0x1F,0x02,0x04,0x02,0x01,0x11,0x0E],
  '4': [0x02,0x06,0x0A,0x12,0x1F,0x02,0x02], '5': [0x1F,0x10,0x1E,0x01,0x01,0x11,0x0E],
  '6': [0x06,0x08,0x10,0x1E,0x11,0x11,0x0E], '7': [0x1F,0x01,0x02,0x04,0x08,0x08,0x08],
  '8': [0x0E,0x11,0x11,0x0E,0x11,0x11,0x0E], '9': [0x0E,0x11,0x11,0x0F,0x01,0x02,0x0C],
  A: [0x0E,0x11,0x11,0x1F,0x11,0x11,0x11], B: [0x1E,0x11,0x11,0x1E,0x11,0x11,0x1E],
  C: [0x0E,0x11,0x10,0x10,0x10,0x11,0x0E], D: [0x1C,0x12,0x11,0x11,0x11,0x12,0x1C],
  E: [0x1F,0x10,0x10,0x1E,0x10,0x10,0x1F], F: [0x1F,0x10,0x10,0x1E,0x10,0x10,0x10],
  G: [0x0E,0x11,0x10,0x17,0x11,0x11,0x0F], H: [0x11,0x11,0x11,0x1F,0x11,0x11,0x11],
  I: [0x0E,0x04,0x04,0x04,0x04,0x04,0x0E], J: [0x07,0x02,0x02,0x02,0x02,0x12,0x0C],
  K: [0x11,0x12,0x14,0x18,0x14,0x12,0x11], L: [0x10,0x10,0x10,0x10,0x10,0x10,0x1F],
  M: [0x11,0x1B,0x15,0x15,0x11,0x11,0x11], N: [0x11,0x19,0x15,0x13,0x11,0x11,0x11],
  O: [0x0E,0x11,0x11,0x11,0x11,0x11,0x0E], P: [0x1E,0x11,0x11,0x1E,0x10,0x10,0x10],
  Q: [0x0E,0x11,0x11,0x11,0x15,0x12,0x0D], R: [0x1E,0x11,0x11,0x1E,0x14,0x12,0x11],
  S: [0x0F,0x10,0x10,0x0E,0x01,0x01,0x1E], T: [0x1F,0x04,0x04,0x04,0x04,0x04,0x04],
  U: [0x11,0x11,0x11,0x11,0x11,0x11,0x0E], V: [0x11,0x11,0x11,0x11,0x11,0x0A,0x04],
  W: [0x11,0x11,0x11,0x15,0x15,0x1B,0x11], X: [0x11,0x11,0x0A,0x04,0x0A,0x11,0x11],
  Y: [0x11,0x11,0x0A,0x04,0x04,0x04,0x04], Z: [0x1F,0x01,0x02,0x04,0x08,0x10,0x1F],
};

// ---------------------------------------------------------------------------
// tiny RGB canvas + PNG writer (lib/icon.js encoder pattern: zlib + filter 0)
function canvas(w, h, bg) {
  const data = Buffer.alloc(w * h * 3);
  if (bg) for (let i = 0; i < w * h; i++) { data[i*3] = bg[0]; data[i*3+1] = bg[1]; data[i*3+2] = bg[2]; }
  return { w, h, data };
}
const clamp8 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
function px(c, x, y, rgb, a = 1) {
  x |= 0; y |= 0;
  if (x < 0 || y < 0 || x >= c.w || y >= c.h) return;
  const o = (y * c.w + x) * 3;
  c.data[o] = clamp8(rgb[0] * a + c.data[o] * (1 - a));
  c.data[o+1] = clamp8(rgb[1] * a + c.data[o+1] * (1 - a));
  c.data[o+2] = clamp8(rgb[2] * a + c.data[o+2] * (1 - a));
}
function fillRect(c, x0, y0, x1, y1, rgb, a = 1) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) px(c, x, y, rgb, a);
}
function strokeRect(c, x0, y0, x1, y1, rgb, t = 1, a = 1) {
  for (let i = 0; i < t; i++) {
    for (let x = x0; x <= x1; x++) { px(c, x, y0 + i, rgb, a); px(c, x, y1 - i, rgb, a); }
    for (let y = y0; y <= y1; y++) { px(c, x0 + i, y, rgb, a); px(c, x1 - i, y, rgb, a); }
  }
}
function disc(c, cx, cy, r, rgb, a = 1) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = x - cx, dy = y - cy;
      if (dx*dx + dy*dy <= r*r) px(c, x, y, rgb, a);
    }
}
function ring(c, cx, cy, r, t, rgb, a = 1) {
  const r2o = r*r, r2i = (r - t) * (r - t);
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const d2 = (x - cx) ** 2 + (y - cy) ** 2;
      if (d2 <= r2o && d2 >= r2i) px(c, x, y, rgb, a);
    }
}
function text(c, x, y, str, rgb, scale = 1, bg = null) {
  str = String(str).toUpperCase();
  if (bg) fillRect(c, x - scale, y - scale, x + str.length * 6 * scale, y + 7 * scale, bg, 0.72);
  for (let i = 0; i < str.length; i++) {
    const glyph = FONT[str[i]] || FONT['.'];
    for (let r = 0; r < 7; r++)
      for (let b = 0; b < 5; b++)
        if (glyph[r] & (0x10 >> b))
          fillRect(c, x + (i * 6 + b) * scale, y + r * scale,
                   x + (i * 6 + b + 1) * scale - 1, y + (r + 1) * scale - 1, rgb);
  }
  return x + str.length * 6 * scale;
}
function crc32(buf) {
  let c, table = crc32.t;
  if (!table) {
    table = crc32.t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function writePNG(c, file) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(c.w, 0); ihdr.writeUInt32BE(c.h, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  const raw = Buffer.alloc((c.w * 3 + 1) * c.h);
  for (let y = 0; y < c.h; y++) {
    raw[y * (c.w * 3 + 1)] = 0;
    c.data.copy(raw, y * (c.w * 3 + 1) + 1, y * c.w * 3, (y + 1) * c.w * 3);
  }
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]));
}

// ---------------------------------------------------------------------------
// input loading: map-source dir (json) or extracted dir (war3map.* binaries)
function loadJson(dir, jsonName, warName) {
  const j = path.join(dir, jsonName);
  if (fs.existsSync(j)) return JSON.parse(fs.readFileSync(j, 'utf8'));
  const w = path.join(dir, warName);
  if (warName && fs.existsSync(w)) {
    const filemap = requireRepo('./lib/filemap.js');
    const entry = filemap.TRANSLATABLE.find((e) => e.war === warName);
    if (entry) {
      try { return filemap.warToJson(entry, fs.readFileSync(w)); }
      catch (e) { console.warn(`WARN ${warName}: ${e.message}`); }
    }
  }
  return null;
}
function resolveTrigstr(name, strings) {
  const m = /^TRIGSTR_(\d+)$/.exec(name || '');
  if (!m || !strings) return name;
  const e = strings[String(+m[1])] || strings[m[1]];
  if (!e) return name;
  return typeof e === 'string' ? e : e.value || name; // strings.json: { "1": {value} }
}

// ---------------------------------------------------------------------------
function main() {
  const [dir, out] = process.argv.slice(2);
  if (!dir || !out) {
    console.error('usage: node preview-terrain.mjs <map-source-or-extracted-dir> <out.png>');
    process.exit(2);
  }
  const terrain = loadJson(dir, 'terrain.json', 'war3map.w3e');
  if (!terrain) { console.error('no terrain.json / war3map.w3e found'); process.exit(1); }
  const doodads = loadJson(dir, 'doodads.json', 'war3map.doo') || { regular: [] };
  const units = loadJson(dir, 'units.json', 'war3mapUnits.doo') || [];
  const regions = loadJson(dir, 'regions.json', 'war3map.w3r') || [];
  const info = loadJson(dir, 'info.json', 'war3map.w3i');
  let strings = null;
  try {
    const sj = path.join(dir, 'strings.json');
    if (fs.existsSync(sj)) strings = JSON.parse(fs.readFileSync(sj, 'utf8'));
  } catch (e) {}
  // custom doodad/destructable ids -> "prop" class (names for the report)
  const customIds = new Set();
  for (const f of ['objects-doodads.json', 'objects-destructables.json']) {
    try {
      const o = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      for (const k of Object.keys(o.custom || {})) customIds.add(k.split(':')[0]);
    } catch (e) {}
  }

  const W = terrain.map.width, H = terrain.map.height;
  const cols = W + 1, rows = H + 1;
  const at = (arr, r, c) => arr[r * cols + c];
  const ppt = Math.max(4, Math.min(48, Math.floor(1600 / Math.max(W, H))));
  const mapW = W * ppt, mapH = H * ppt;

  // ---- elevation field per vertex: (groundHeight-8192)/4 + layer*128
  const elev = new Float64Array(cols * rows);
  for (let i = 0; i < cols * rows; i++)
    elev[i] = (terrain.groundHeight[i] - 8192) / 4 + (terrain.layerHeight[i] | 0) * 128;

  // margins/layout
  const M = 14, TITLE_H = 34;
  const paletteEntries = (terrain.tilePalette || []).map((id, i) => {
    const suf = String(id).slice(1).toLowerCase();
    const info2 = TILE_INFO[suf];
    return { id, rgb: info2 ? info2[0] : FALLBACK_COLORS[i % FALLBACK_COLORS.length], name: info2 ? info2[1] : suf };
  });
  const legendRows = Math.ceil((paletteEntries.length + 3) / 6) + 1;
  const LEGEND_H = 26 + legendRows * 20 + 8;
  const img = canvas(mapW + 2 * M, TITLE_H + mapH + LEGEND_H + 2 * M, [24, 26, 30]);
  const OX = M, OY = TITLE_H + M;

  // world<->pixel: row 0 = north; world topY = offset.y + H*128
  const wx0 = terrain.map.offset.x, wyTop = terrain.map.offset.y + H * 128;
  const toPx = (x, y) => [OX + ((x - wx0) / 128) * ppt, OY + ((wyTop - y) / 128) * ppt];

  // ---- terrain pass
  const light = [-1, -1, 1.6]; // from NW, image coords (x east, y south)
  const lNorm = Math.hypot(...light);
  const L = light.map((v) => v / lNorm);
  const flatDot = L[2];
  const layerOf = new Int16Array(mapW * mapH);
  const rampOf = new Uint8Array(mapW * mapH);
  for (let pyy = 0; pyy < mapH; pyy++) {
    const v = pyy / ppt; // tile-space row
    const r0 = Math.min(rows - 2, Math.floor(v)), fr = v - r0;
    for (let pxx = 0; pxx < mapW; pxx++) {
      const u = pxx / ppt;
      const c0 = Math.min(cols - 2, Math.floor(u)), fc = u - c0;
      // nearest vertex for discrete attributes
      const rn = Math.min(rows - 1, Math.round(v)), cn = Math.min(cols - 1, Math.round(u));
      const flags = at(terrain.flags, rn, cn) | 0;
      layerOf[pyy * mapW + pxx] = at(terrain.layerHeight, rn, cn) | 0;
      rampOf[pyy * mapW + pxx] = flags & FLAG_RAMP ? 1 : 0;
      let rgb;
      if (flags & FLAG_BOUNDARY) rgb = [12, 12, 14];
      else {
        const texIdx = at(terrain.groundTexture, rn, cn) | 0;
        const pe = paletteEntries[texIdx];
        rgb = pe ? pe.rgb : FALLBACK_COLORS[texIdx % FALLBACK_COLORS.length];
        if (flags & FLAG_BLIGHT) rgb = [(rgb[0] + 2 * BLIGHT_COLOR[0]) / 3, (rgb[1] + 2 * BLIGHT_COLOR[1]) / 3, (rgb[2] + 2 * BLIGHT_COLOR[2]) / 3];
      }
      // bilinear elevation + central-difference gradient for hillshade
      const e00 = elev[r0 * cols + c0], e01 = elev[r0 * cols + c0 + 1];
      const e10 = elev[(r0 + 1) * cols + c0], e11 = elev[(r0 + 1) * cols + c0 + 1];
      const gx = ((e01 - e00) * (1 - fr) + (e11 - e10) * fr) / 128; // dz per world-x, tile units
      const gy = ((e10 - e00) * (1 - fc) + (e11 - e01) * fc) / 128; // dz per image-y (south)
      const k = 1.4; // exaggeration
      const nx = -gx * k, ny = -gy * k, nz = 1;
      const nn = Math.hypot(nx, ny, nz);
      const dot = (nx * L[0] + ny * L[1] + nz * L[2]) / nn;
      let f = 1 + (dot - flatDot) * 2.0;
      f = f < 0.45 ? 0.45 : f > 1.45 ? 1.45 : f;
      let rr = rgb[0] * f, gg = rgb[1] * f, bb = rgb[2] * f;
      // water overlay (nearest-vertex flag; depth-scaled)
      if (flags & FLAG_WATER && !(flags & FLAG_BOUNDARY)) {
        // water plane z shares the vertex's cliff-layer offset (same
        // composition as the ground elevation; gives a positive depth)
        const wz = (at(terrain.waterHeight, rn, cn) - 8192) / 4 + (at(terrain.layerHeight, rn, cn) | 0) * 128;
        const gz = e00 * (1 - fr) * (1 - fc) + e01 * (1 - fr) * fc + e10 * fr * (1 - fc) + e11 * fr * fc;
        const depth = wz - gz;
        const a = Math.max(0.30, Math.min(0.78, 0.30 + depth / 320));
        rr = WATER_COLOR[0] * a + rr * (1 - a);
        gg = WATER_COLOR[1] * a + gg * (1 - a);
        bb = WATER_COLOR[2] * a + bb * (1 - a);
      }
      const o = ((OY + pyy) * img.w + OX + pxx) * 3;
      img.data[o] = clamp8(rr); img.data[o+1] = clamp8(gg); img.data[o+2] = clamp8(bb);
    }
  }
  // cliff edges: darken pixels whose east/south neighbor sits on another layer
  for (let pyy = 0; pyy < mapH; pyy++)
    for (let pxx = 0; pxx < mapW; pxx++) {
      const i = pyy * mapW + pxx;
      const le = pxx + 1 < mapW ? layerOf[i + 1] : layerOf[i];
      const ls = pyy + 1 < mapH ? layerOf[i + mapW] : layerOf[i];
      if (le !== layerOf[i] || ls !== layerOf[i]) {
        const ramp = rampOf[i] || (pxx + 1 < mapW && rampOf[i + 1]) || (pyy + 1 < mapH && rampOf[i + mapW]);
        const f = ramp ? 0.8 : 0.42;
        const o = ((OY + pyy) * img.w + OX + pxx) * 3;
        img.data[o] = clamp8(img.data[o] * f);
        img.data[o+1] = clamp8(img.data[o+1] * f);
        img.data[o+2] = clamp8(img.data[o+2] * f);
      }
    }

  // ---- regions (under doodads/units so markers stay readable)
  for (const rg of regions) {
    const p = rg.position || {};
    const [x0, y0] = toPx(p.left, p.top), [x1, y1] = toPx(p.right, p.bottom);
    const col = Array.isArray(rg.color) && rg.color.length >= 3 ? rg.color : [255, 255, 255];
    strokeRect(img, Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1), col, 1, 0.9);
    fillRect(img, Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1), col, 0.08);
    if (rg.name) {
      const label = String(rg.name).slice(0, 24);
      const lx = Math.max(OX + 1, Math.min(Math.round(x0) + 2, OX + mapW - label.length * 6 - 2));
      const ly = Math.max(OY + 1, Math.min(Math.round(y0) + 2, OY + mapH - 8));
      text(img, lx, ly, label, [255, 255, 255], 1, [0, 0, 0]);
    }
  }

  // ---- doodads
  const classify = (t) => {
    if (customIds.has(t)) return 'prop';
    if (KNOWN_ROCKS.has(t) || /^.Tr[ck]/.test(t)) return 'rock';
    if (t[1] === 'T') return 'tree'; // <tileset>T.. tree/destructable wall family
    if (/^D[0-9A-Z]{3}$/.test(t) && t !== 'D000'.slice(4)) return 'prop'; // generated custom ids
    return 'stock';
  };
  const dr = Math.max(2, Math.round(ppt * 0.22));
  const seen = { tree: 0, rock: 0, prop: 0, stock: 0 };
  for (const d of (doodads.regular || [])) {
    const cls = classify(d.type);
    seen[cls]++;
    const [dx, dy] = toPx(d.position[0], d.position[1]);
    const scale = d.scale ? Math.max(0.6, Math.min(2.2, (d.scale[0] + d.scale[1]) / 2)) : 1;
    const r = cls === 'tree' ? dr * scale : dr * 1.1 * scale;
    disc(img, dx, dy, r + 1, [0, 0, 0], 0.5);
    disc(img, dx, dy, r, CLASS_COLORS[cls], 0.95);
  }

  // ---- units
  const GOLD_MINES = new Set(['ngol', 'egol', 'ugol']);
  const playerColor = (p) => p < 24 ? PLAYER_COLORS[p] : p === 24 ? NEUTRAL_HOSTILE : p === 27 ? NEUTRAL_PASSIVE : [235, 235, 235];
  const ur = Math.max(3, Math.round(ppt * 0.3));
  for (const u of units) {
    if (u.type === 'sloc') continue; // drawn last, on top
    const [ux, uy] = toPx(u.position[0], u.position[1]);
    const col = playerColor(u.player | 0);
    if (GOLD_MINES.has(u.type)) {
      disc(img, ux, uy, ur * 1.7, [0, 0, 0], 0.6);
      disc(img, ux, uy, ur * 1.45, [255, 204, 40], 1);
      text(img, ux - 2, uy - 3, 'G', [90, 60, 0]);
    } else {
      fillRect(img, Math.round(ux - ur), Math.round(uy - ur), Math.round(ux + ur), Math.round(uy + ur), [0, 0, 0], 0.55);
      fillRect(img, Math.round(ux - ur + 1), Math.round(uy - ur + 1), Math.round(ux + ur - 1), Math.round(uy + ur - 1), col, 1);
    }
  }
  for (const u of units) {
    if (u.type !== 'sloc') continue;
    const [ux, uy] = toPx(u.position[0], u.position[1]);
    const col = playerColor(u.player | 0);
    const r = Math.max(8, ppt * 0.75);
    ring(img, ux, uy, r + 2, 2, [0, 0, 0], 0.7);
    ring(img, ux, uy, r, 3, [255, 255, 255], 1);
    disc(img, ux, uy, r - 3, col, 0.92);
    const lbl = 'P' + ((u.player | 0) + 1);
    text(img, Math.round(ux - lbl.length * 3), Math.round(uy - 3), lbl, [255, 255, 255], 1);
  }

  // ---- title
  const mapName = resolveTrigstr(info && info.map && info.map.name, strings) || path.basename(dir);
  const sub = `${TILESET_NAMES[terrain.tileset] || terrain.tileset}  ${W}X${H} TILES  (${ppt} PX/TILE)`;
  text(img, M, M - 2, String(mapName).slice(0, 40), [240, 240, 245], 2);
  text(img, M, M + 14, sub, [150, 155, 165], 1);

  // ---- legend
  let lx = M, ly = OY + mapH + 12;
  text(img, lx, ly, 'GROUND (OUR PALETTE, NOT GAME TEXTURES)', [150, 155, 165], 1);
  ly += 12;
  let col6 = 0;
  const legendItem = (rgb, label, outline) => {
    if (lx + 150 > img.w - M) { lx = M; ly += 20; }
    fillRect(img, lx, ly, lx + 12, ly + 12, rgb);
    strokeRect(img, lx, ly, lx + 12, ly + 12, outline || [90, 90, 96]);
    text(img, lx + 17, ly + 3, label.slice(0, 18), [210, 212, 218]);
    lx += 150; col6++;
  };
  for (const pe of paletteEntries) legendItem(pe.rgb, `${pe.id} ${pe.name}`);
  legendItem(WATER_COLOR, 'WATER');
  legendItem([50, 42, 46], 'CLIFF EDGE');
  legendItem(BLIGHT_COLOR, 'BLIGHT');
  lx = M; ly += 22;
  // marker legend
  const mk = (draw, label) => {
    if (lx + 170 > img.w - M) { lx = M; ly += 20; }
    draw(lx + 6, ly + 6);
    text(img, lx + 17, ly + 3, label, [210, 212, 218]);
    lx += 150;
  };
  mk((x, y) => disc(img, x, y, 4, CLASS_COLORS.tree), `TREES (${seen.tree})`);
  mk((x, y) => disc(img, x, y, 4, CLASS_COLORS.rock), `ROCKS (${seen.rock})`);
  if (seen.prop) mk((x, y) => disc(img, x, y, 4, CLASS_COLORS.prop), `CUSTOM PROPS (${seen.prop})`);
  if (seen.stock) mk((x, y) => disc(img, x, y, 4, CLASS_COLORS.stock), `STOCK DOODADS (${seen.stock})`);
  mk((x, y) => { ring(img, x, y, 6, 2, [255, 255, 255]); disc(img, x, y, 3, PLAYER_COLORS[0]); }, 'START LOC');
  mk((x, y) => { disc(img, x, y, 5, [255, 204, 40]); }, 'GOLD MINE');
  mk((x, y) => { fillRect(img, x - 4, y - 4, x + 4, y + 4, PLAYER_COLORS[1]); }, 'UNIT (PLAYER COLOR)');
  // scale bar: 8 tiles = 1024 world units
  lx = M; ly += 22;
  const barW = 8 * ppt;
  fillRect(img, lx, ly + 4, lx + barW, ly + 7, [230, 230, 235]);
  strokeRect(img, lx, ly + 4, lx + barW, ly + 7, [0, 0, 0]);
  text(img, lx + barW + 8, ly + 2, '8 TILES = 1024 WU', [210, 212, 218]);

  writePNG(img, out);
  console.log(`wrote ${out}  (${img.w}x${img.h}, ${ppt}px/tile, ` +
    `${(doodads.regular || []).length} doodads, ${units.length} units, ${regions.length} regions)`);
}
main();
