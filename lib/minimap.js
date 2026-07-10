'use strict';
// Minimap preview generation. Every real .w3x ships a minimap image
// (war3mapMap.blp/.tga) and a minimap-icons file (war3map.mmp); the map
// picker renders both, and maps without them are at best blank in the list.
// build-map generates both automatically when a map source doesn't provide
// its own under files/ (drop in files/war3mapMap.tga|blp / files/war3map.mmp
// to override).
//
// war3mapMap.tga: 256x256 uncompressed 24-bit TGA rendered from terrain.json
// (color per ground-texture, water/blight/boundary tinting, cliff shading).
// The game accepts TGA in this slot (war3mapMap.tga is a standard member
// name in War3Net's and mdx-m3-viewer's listfiles).
//
// war3map.mmp (format mirrored from War3Net's MapFactory.PreviewIcons):
//   i32 format (0)
//   i32 count
//   count * { i32 iconType, i32 x, i32 y, u8[4] color BGRA }
// x/y are 0..255 minimap coords (y flipped); iconType 0 = gold mine,
// 1 = neutral building, 2 = player start location (colored by player).

const SIZE = 256;

// WE player colors (see War3Net PlayerColor), RGB.
const PLAYER_COLORS = [
  [0xFF, 0x03, 0x03], // 0 red
  [0x00, 0x42, 0xFF], // 1 blue
  [0x1C, 0xE6, 0xB9], // 2 teal
  [0x54, 0x00, 0x81], // 3 purple
  [0xFF, 0xFC, 0x00], // 4 yellow
  [0xFE, 0x8A, 0x0E], // 5 orange
  [0x20, 0xC0, 0x00], // 6 green
  [0xE5, 0x5B, 0xB0], // 7 pink
  [0x95, 0x96, 0x97], // 8 gray
  [0x7E, 0xBF, 0xF1], // 9 light blue
  [0x10, 0x62, 0x46], // 10 dark green
  [0x4E, 0x2A, 0x04], // 11 brown
  [0x9B, 0x00, 0x00], // 12 maroon
  [0x00, 0x00, 0xC3], // 13 navy
  [0x00, 0xEA, 0xFF], // 14 turquoise
  [0xBE, 0x00, 0xFE], // 15 violet
  [0xEB, 0xCD, 0x87], // 16 wheat
  [0xF8, 0xA4, 0x8B], // 17 peach
  [0xBF, 0xFF, 0x80], // 18 mint
  [0xDC, 0xB9, 0xEB], // 19 lavender
  [0x28, 0x28, 0x28], // 20 coal
  [0xEB, 0xF0, 0xFF], // 21 snow
  [0x00, 0x78, 0x1E], // 22 emerald
  [0xA4, 0x6F, 0x33], // 23 peanut
];

// Icon type ids and the rawcodes that produce them (subset of WE's list,
// mirrored from War3Net's MapPreviewIconProvider).
const ICON_START_LOCATION = 2;
const ICON_GOLD_MINE = 0;
const ICON_NEUTRAL_BUILDING = 1;
const GOLD_MINES = new Set(['ngol', 'egol', 'ugol']);
const NEUTRAL_BUILDINGS = new Set([
  'ndrg', 'ndrk', 'ndro', 'ndrr', 'ndru', 'ndrz', // dragon roosts
  'nfoh', 'nmoo', // fountains
  'ngad', 'ngme', 'nmrk', 'nshp', 'ntav', 'nwgt', // lab/merchant/market/shipyard/tavern/waygate
  'nmer', 'nmra', 'nmrb', 'nmrc', 'nmrd', 'nmre', 'nmrf', // mercenary camps
  'nmr0', 'nmr1', 'nmr2', 'nmr3', 'nmr4', 'nmr5', 'nmr6', 'nmr7', 'nmr8', 'nmr9',
]);

// Rough terrain-tile colors by the tile id's type suffix (chars 1..3 of the
// FourCC; the first char is the tileset). Fallback below covers the rest.
const TILE_COLORS = {
  dirt: [114, 84, 55], drt: [114, 84, 55],
  dro: [126, 94, 60], // rough dirt
  drg: [96, 104, 48], // grassy dirt
  rok: [112, 112, 112], // rock
  grs: [52, 110, 42], // grass
  grd: [38, 88, 34], // dark grass
  snw: [225, 230, 238], // snow
  ice: [170, 205, 225],
  san: [205, 185, 130], // sand
  sqd: [205, 185, 130],
  lvc: [60, 45, 45], // lava cracks
  lav: [180, 60, 20],
  vin: [70, 95, 45], // vines
  lea: [70, 100, 45], // leaves
};
const FALLBACK_COLORS = [
  [110, 82, 54], [96, 104, 48], [52, 110, 42], [112, 112, 112],
  [38, 88, 34], [126, 94, 60], [140, 120, 90], [80, 80, 96],
];
const WATER_COLOR = [40, 76, 138];
const BLIGHT_COLOR = [86, 62, 74];

// v12 w3e per-tilepoint flags as stored in terrain.json (classic nibble << 2):
const FLAG_RAMP = 0x40;
const FLAG_BLIGHT = 0x80;
const FLAG_WATER = 0x100;
const FLAG_BOUNDARY = 0x200;

function tileColor(tileId, paletteIndex) {
  if (typeof tileId === 'string' && tileId.length === 4) {
    const suffix = tileId.slice(1).toLowerCase();
    if (TILE_COLORS[suffix]) return TILE_COLORS[suffix];
  }
  return FALLBACK_COLORS[Math.abs(paletteIndex) % FALLBACK_COLORS.length];
}

function clamp8(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

// terrain.json -> 256x256 24-bit uncompressed TGA buffer.
// terrain arrays are (width+1)x(height+1) tilepoints, row 0 = map north.
function generateMinimapTGA(terrain) {
  const w = terrain.map.width;
  const h = terrain.map.height;
  const cols = w + 1;
  const rows = h + 1;
  const at = (arr, r, c) => arr[r * cols + c];

  const header = Buffer.alloc(18);
  header.writeUInt8(2, 2); // image type: uncompressed true-color
  header.writeUInt16LE(SIZE, 12);
  header.writeUInt16LE(SIZE, 14);
  header.writeUInt8(24, 16); // bits per pixel
  header.writeUInt8(0x20, 17); // descriptor: top-left origin

  const pixels = Buffer.alloc(SIZE * SIZE * 3);
  for (let py = 0; py < SIZE; py++) {
    // pixel row 0 = image top = terrain JSON row 0 (north)
    const r = Math.min(rows - 1, Math.floor((py * rows) / SIZE));
    for (let px = 0; px < SIZE; px++) {
      const c = Math.min(cols - 1, Math.floor((px * cols) / SIZE));
      const flags = at(terrain.flags, r, c) | 0;
      const layer = at(terrain.layerHeight, r, c) | 0;
      let rgb;
      if (flags & FLAG_BOUNDARY) {
        rgb = [10, 10, 10];
      } else if (flags & FLAG_WATER) {
        rgb = WATER_COLOR;
      } else if (flags & FLAG_BLIGHT) {
        rgb = BLIGHT_COLOR;
      } else {
        const texIdx = at(terrain.groundTexture, r, c) | 0;
        rgb = tileColor((terrain.tilePalette || [])[texIdx], texIdx);
      }
      // subtle relief from ground height, brighter on higher cliff layers
      const gh = at(terrain.groundHeight, r, c) | 0;
      let f = 1 + ((gh - 8192) / 2048) * 0.25 + (layer - 2) * 0.08;
      // darken cliff transitions (layer change vs south/east neighbor)
      const southLayer = r + 1 < rows ? at(terrain.layerHeight, r + 1, c) : layer;
      const eastLayer = c + 1 < cols ? at(terrain.layerHeight, r, c + 1) : layer;
      if (southLayer !== layer || eastLayer !== layer) f *= 0.55;
      const o = (py * SIZE + px) * 3;
      pixels[o] = clamp8(rgb[2] * f); // TGA stores BGR
      pixels[o + 1] = clamp8(rgb[1] * f);
      pixels[o + 2] = clamp8(rgb[0] * f);
    }
  }
  return Buffer.concat([header, pixels]);
}

// info.json + units.json + terrain.json -> war3map.mmp buffer.
// World->minimap mapping mirrors War3Net's MapFactory.PreviewIcons: the
// playable area (terrain extent minus camera complements) is fitted into a
// square, units map to 0..255 with y flipped.
function generateMmp(info, units, terrain) {
  const compl = (info && info.camera && info.camera.complements) || [0, 0, 0, 0];
  const [cL, cR, cB, cT] = compl;
  const envLeft = terrain.map.offset.x;
  const envBottom = terrain.map.offset.y;
  const envRight = envLeft + terrain.map.width * 128;
  const envTop = envBottom + terrain.map.height * 128;

  let left = envLeft + 128 * cL;
  let bottom = envBottom + 128 * cB;
  const width = envRight - 128 * cR - left;
  const height = envTop - 128 * cT - bottom;
  const size = Math.max(width, height) || 1;
  if (width < size) left -= 0.5 * (size - width);
  if (height < size) bottom -= 0.5 * (size - height);

  const icons = [];
  for (const u of units || []) {
    let iconType;
    let rgb = [255, 255, 255];
    if (u.type === 'sloc') {
      iconType = ICON_START_LOCATION;
      rgb = PLAYER_COLORS[u.player] || [255, 255, 255];
    } else if (GOLD_MINES.has(u.type)) {
      iconType = ICON_GOLD_MINE;
    } else if (NEUTRAL_BUILDINGS.has(u.type)) {
      iconType = ICON_NEUTRAL_BUILDING;
    } else {
      continue;
    }
    // clamp: units can legally sit outside the complement-adjusted bounds
    const x = Math.min(255, Math.max(0, Math.trunc((256 * (u.position[0] - left)) / size)));
    const y = Math.min(255, Math.max(0, 256 - Math.trunc((256 * (u.position[1] - bottom)) / size)));
    icons.push({ iconType, x, y, rgb });
  }

  const buf = Buffer.alloc(8 + icons.length * 16);
  buf.writeInt32LE(0, 0); // format
  buf.writeInt32LE(icons.length, 4);
  let o = 8;
  for (const icon of icons) {
    buf.writeInt32LE(icon.iconType, o);
    buf.writeInt32LE(icon.x, o + 4);
    buf.writeInt32LE(icon.y, o + 8);
    buf.writeUInt8(icon.rgb[2], o + 12); // BGRA
    buf.writeUInt8(icon.rgb[1], o + 13);
    buf.writeUInt8(icon.rgb[0], o + 14);
    buf.writeUInt8(255, o + 15);
    o += 16;
  }
  return buf;
}

module.exports = { generateMinimapTGA, generateMmp, PLAYER_COLORS };
