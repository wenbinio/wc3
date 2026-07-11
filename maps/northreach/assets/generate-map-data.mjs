#!/usr/bin/env node
// generate-map-data.mjs — authoring script for the Northreach Founders
// terrain/doodads/units/regions JSON plus the terrain-sized opaque files
// (war3map.wpm / war3map.shd).
//
//   node maps/northreach/assets/generate-map-data.mjs
//
// Layout (80x80 Northrend tiles, world -5120..5120, JSON row 0 = map NORTH):
//   - cold sea along the SOUTH and WEST edges (deep water, wavy coastline),
//     dirt beaches along every waterline;
//   - a fjord cutting north from the south sea at x ~ 0, and a shallow river
//     winding down from the eastern mountains into the fjord head;
//   - mountain massif in the NORTHEAST (cliff layers 3 and 4, rock + snow,
//     a frozen tarn) with a ramp on its southwest face up to a plateau;
//   - 6 recommended sites marked by waystone cairns (2 of them keep a
//     creep-guarded flavor gold mine);
//   - one COMMUNAL landing on the southern coast (4 slocs + 4 Founder
//     heroes + the Northreach Market), fishing shoals offshore, deer and
//     wolf packs in the wild (FoTN mechanics — docs/reference/fotn-analysis.md).
//
// NOTE (CLAUDE.md gotcha 6): the committed JSON is a translator FIXED POINT
// produced by running build -> extract -> map-to-json once over this
// script's output and committing the stabilized *.json. Re-running this
// script regenerates the pre-stabilization authoring state (rotations at
// exact degrees etc.), so after edits repeat the stabilization cycle.
// FourCCs come from the docs/FORMATS.md tables only.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '..');

const W = 80, H = 80;           // tiles
const COLS = W + 1, ROWS = H + 1; // vertices
const OFFSET = -(W * 128) / 2;  // -5120

// world <-> vertex-grid helpers (row 0 = north)
const colOf = (x) => (x - OFFSET) / 128;
const rowOf = (y) => (-(y) - OFFSET) / 128;

// deterministic pseudo-random (mulberry32)
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(0x5eed);
// per-vertex hash noise (stable regardless of evaluation order)
function vnoise(r, c, salt) {
  let h = (r * 73856093) ^ (c * 19349663) ^ (salt * 83492791);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

// ---------------------------------------------------------------- layout ---

// Named world-coordinate anchors — units.json/regions.json/war3map.lua and
// info.json startingPos all use these numbers.
// FoTN-style communal landing: all four charters start together on the
// southern coast (see docs/reference/fotn-analysis.md).
export const STARTS = [
  { x: -2816, y: -2624 }, // P0 red
  { x: -2560, y: -2624 }, // P1 blue
  { x: -2816, y: -2368 }, // P2 teal
  { x: -2560, y: -2368 }, // P3 purple
];
export const FOUNDERS = [
  { x: -2880, y: -2688 }, { x: -2496, y: -2688 },
  { x: -2880, y: -2304 }, { x: -2496, y: -2304 },
];
export const MARKET = { x: -2240, y: -2496 };
// fishing shoals sit just offshore (south beach + west coast)
export const SHOALS = [
  { x: -3328, y: -3392 }, { x: -1408, y: -3712 }, { x: -3968, y: 320 },
];
export const DEER = [
  { x: -1664, y: -896 }, { x: -896, y: 1408 }, { x: 512, y: 2176 },
  { x: 2688, y: 384 }, { x: -2176, y: 896 }, { x: 1408, y: -256 },
];
// two den packs + two roaming packs
export const WOLVES = [
  ['nwlt', -704, 4416], ['nwlt', -832, 4352], ['nwlg', -768, 4480],
  ['nwlt', 4544, -448], ['nwlt', 4480, -320], ['nwlg', 4608, -384],
  ['nwlt', -2944, 1664], ['nwlt', -2816, 1536],
  ['nwlt', 2816, -1088], ['nwlg', 2688, -1152],
];
export const SITES = [
  { name: 'Midlands', x: -640, y: 128 },
  { name: 'Northwood', x: -2816, y: 3648 },
  { name: 'Northgate', x: 256, y: 3904 },
  { name: 'Eastmark', x: 3968, y: -256 },
  { name: 'Fjordmouth', x: 1664, y: -1664 },
  { name: 'Highcairn', x: 2048, y: 1792 }, // mountain plateau, layer 3
];
export const DENS = [
  { name: 'DenNorthPass', x: -768, y: 4736 },
  { name: 'DenEastShore', x: 4736, y: -640 },
];

// sea boundaries (vertex space)
const southSeaRow = (c) => 67 + Math.round(1.8 * Math.sin(c * 0.31));
const westSeaCol = (r) => 12 + Math.round(1.8 * Math.sin(r * 0.27 + 1));

// fjord: from the south sea up to row 46 around col 40
const FJORD_TOP = 46;
function inFjord(r, c) {
  if (r < FJORD_TOP) return false;
  const fc = 40 + 2.2 * Math.sin(r * 0.18);
  const hw = 1.7 + Math.max(0, r - 58) * 0.12;
  return Math.abs(c - fc) <= hw;
}

// river: mountain (r20,c60) -> fjord head (r46,c40), shallow
const riverPts = [];
for (let i = 0; i <= 60; i++) {
  const t = i / 60;
  riverPts.push([20 + 26 * t, 60 - 20 * t + 2.5 * Math.sin(t * 5)]);
}
function inRiver(r, c) {
  for (const [rr, cc] of riverPts) {
    const d2 = (r - rr) * (r - rr) + (c - cc) * (c - cc);
    if (d2 <= 1.44) return true;
  }
  return false;
}

// frozen tarn in the high mountains
const inTarn = (r, c) => r >= 9 && r <= 12 && c >= 52 && c <= 56;

// mountain massif: nested ellipses centered (r16, c62)
function mountainLayer(r, c) {
  const e1 = ((r - 16) / 15) ** 2 + ((c - 62) / 19) ** 2;
  if (e1 > 1) return 2;
  const e2 = ((r - 16) / 8) ** 2 + ((c - 62) / 10) ** 2;
  return e2 <= 1 ? 4 : 3;
}

// ramp up the southwest face of the massif (cols 55..57)
const RAMP_COLS = [55, 56, 57];

// tile palette indices (terrain.json tilePalette below)
const T = { dirt: 0, darkdirt: 1, grass: 2, snow: 3, rock: 4, ice: 5 };

// -------------------------------------------------------------- terrain ---

const seaWater = (r, c) => r >= southSeaRow(c) || c <= westSeaCol(r);
const isWater = (r, c) => seaWater(r, c) || inFjord(r, c) || inRiver(r, c) || inTarn(r, c);

function nearWater(r, c, dist) {
  for (let dr = -dist; dr <= dist; dr++) {
    for (let dc = -dist; dc <= dist; dc++) {
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && cc >= 0 && rr < ROWS && cc < COLS && isWater(rr, cc)) return true;
    }
  }
  return false;
}

const groundHeight = [];
const waterHeight = [];
const boundaryFlag = [];
const flags = [];
const groundTexture = [];
const groundVariation = [];
const cliffVariation = [];
const cliffTexture = [];
const layerHeight = [];

const layerAt = [];
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    layerAt.push(isWater(r, c) ? 2 : mountainLayer(r, c));
  }
}
const lay = (r, c) => layerAt[r * COLS + c];

// ramp rows: where the massif's layer-3 boundary meets the ramp columns
const rampVerts = new Set();
for (const c of RAMP_COLS) {
  for (let r = 1; r < ROWS - 1; r++) {
    if (lay(r, c) === 3 && lay(r + 1, c) === 2) {
      rampVerts.add(`${r},${c}`);
      rampVerts.add(`${r + 1},${c}`);
    }
  }
}

for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const water = isWater(r, c);
    const layer = lay(r, c);

    // --- height
    let gh = 8192 + Math.round((vnoise(r, c, 1) - 0.5) * 10) * 4;
    if (seaWater(r, c)) {
      // deepen with distance past the waterline
      const past = Math.max(r - southSeaRow(c), westSeaCol(r) - c, 0);
      gh = 8192 - 44 - Math.min(past * 24, 96);
    } else if (inFjord(r, c) || inRiver(r, c)) {
      gh = 8192 - 48;
    } else if (inTarn(r, c)) {
      gh = 8192 - 36;
    } else if (layer === 3) {
      gh += 32;
    } else if (layer === 4) {
      gh += 64;
    }
    groundHeight.push(gh);
    waterHeight.push(8192);
    boundaryFlag.push(false);

    // --- flags
    let f = 0;
    if (water) f |= 0x100;
    if (rampVerts.has(`${r},${c}`)) f |= 0x40;
    flags.push(f);

    // --- ground texture
    let tex;
    const n = vnoise(r, c, 2);
    if (inTarn(r, c)) tex = T.ice;
    else if (water) tex = T.dirt;
    else if (nearWater(r, c, 2) && layer === 2) tex = n < 0.25 ? T.darkdirt : T.dirt; // beaches
    else if (layer === 4) tex = T.snow;
    else if (layer === 3) {
      // rocky near the cliff edges, snowy on top
      const edge = [[-2, 0], [2, 0], [0, -2], [0, 2]].some(([dr, dc]) => {
        const rr = r + dr, cc = c + dc;
        return rr >= 0 && cc >= 0 && rr < ROWS && cc < COLS && lay(rr, cc) !== layer;
      });
      tex = edge ? T.rock : (n < 0.7 ? T.snow : T.rock);
    } else if (r < 18) tex = n < 0.55 ? T.snow : T.grass;   // snowy north
    else if (r < 30) tex = n < 0.3 ? T.snow : T.grass;
    else tex = n < 0.14 ? T.darkdirt : T.grass;              // green lowlands
    groundTexture.push(tex);

    groundVariation.push([0, 8, 16][Math.floor(vnoise(r, c, 3) * 3)]);
    cliffVariation.push(0);

    // cliff texture marker at layer transitions (vs S/E/SE neighbors)
    const trans = [[1, 0], [0, 1], [1, 1]].some(([dr, dc]) => {
      const rr = r + dr, cc = c + dc;
      return rr < ROWS && cc < COLS && lay(rr, cc) !== layer;
    });
    cliffTexture.push(trans ? 0 : 240);
    layerHeight.push(layer);
  }
}

const terrain = {
  tileset: 'N',
  customTileset: true,
  // FourCCs straight from the docs/FORMATS.md Northrend tables
  tilePalette: ['Ndrt', 'Ndrd', 'Ngrs', 'Nsnw', 'Nrck', 'Nice'],
  cliffTilePalette: ['CNdi', 'CNsn'],
  map: { width: W, height: H, offset: { x: OFFSET, y: OFFSET } },
  groundHeight, waterHeight, boundaryFlag, flags,
  groundTexture, groundVariation, cliffVariation, cliffTexture, layerHeight,
};

// ------------------------------------------------------------ assertions ---

function vertexInfo(x, y) {
  const c = Math.round(colOf(x));
  const r = Math.round(rowOf(y));
  return { r, c, water: isWater(r, c), layer: lay(r, c) };
}
const mustBeLand = [
  ...STARTS.map((p, i) => ({ ...p, tag: `start ${i}` })),
  ...FOUNDERS.map((p, i) => ({ ...p, tag: `founder ${i}` })),
  { ...MARKET, tag: 'market' },
  ...DEER.map((p, i) => ({ ...p, tag: `deer ${i}` })),
  ...WOLVES.map(([, x, y], i) => ({ x, y, tag: `wolf ${i}` })),
  ...SITES.map((s) => ({ ...s, tag: `site ${s.name}` })),
  ...DENS.map((s) => ({ ...s, tag: `den ${s.name}` })),
];
for (const p of mustBeLand) {
  const v = vertexInfo(p.x, p.y);
  if (v.water) throw new Error(`${p.tag} (${p.x},${p.y}) is on water (vertex r${v.r} c${v.c})`);
}
for (const [i, p] of SHOALS.entries()) {
  const v = vertexInfo(p.x, p.y);
  if (!v.water) throw new Error(`shoal ${i} (${p.x},${p.y}) is on land (vertex r${v.r} c${v.c})`);
}
const high = vertexInfo(SITES[5].x, SITES[5].y);
if (high.layer !== 3) throw new Error(`Highcairn expected layer 3, got ${high.layer}`);
if (rampVerts.size === 0) throw new Error('no ramp vertices generated');
for (const s of SITES.slice(0, 5)) {
  const v = vertexInfo(s.x, s.y);
  if (v.layer !== 2) throw new Error(`site ${s.name} expected layer 2, got ${v.layer}`);
}

// -------------------------------------------------------------- doodads ---

// forest zones (vertex-space rects) — NTtw Northrend trees (proven id)
const FORESTS = [
  { r0: 4, r1: 26, c0: 15, c1: 36, density: 0.30 },  // Northwood
  { r0: 28, r1: 44, c0: 16, c1: 30, density: 0.18 }, // west inland woods
  { r0: 44, r1: 60, c0: 22, c1: 36, density: 0.22 }, // south-central woods
  { r0: 38, r1: 56, c0: 58, c1: 74, density: 0.22 }, // east woods
  { r0: 50, r1: 62, c0: 44, c1: 54, density: 0.16 }, // fjord-east copse
];

function nearAnchor(x, y, dist) {
  return mustBeLand.some((p) => Math.abs(p.x - x) < dist && Math.abs(p.y - y) < dist);
}

const regular = [];
let did = 0;
for (const zone of FORESTS) {
  for (let r = zone.r0; r <= zone.r1; r++) {
    for (let c = zone.c0; c <= zone.c1; c++) {
      if (vnoise(r, c, 7) > zone.density) continue;
      if (isWater(r, c) || nearWater(r, c, 1) || lay(r, c) !== 2) continue;
      const x = OFFSET + c * 128 + Math.round((vnoise(r, c, 8) - 0.5) * 64);
      const y = -(OFFSET + r * 128) + Math.round((vnoise(r, c, 9) - 0.5) * 64);
      if (nearAnchor(x, y, 600)) continue;
      regular.push({
        type: 'NTtw',
        position: [x, y, 0],
        angle: Math.round(vnoise(r, c, 10) * 360),
        scale: [1, 1, 1],
        flags: { visible: true, solid: true, fixedZ: false },
        id: did++,
        variation: Math.floor(vnoise(r, c, 11) * 5),
      });
    }
  }
}

// rock piles (LTrc, proven id) along the mountain fringe and shorelines
const ROCK_SPOTS = [];
for (let i = 0; i < 600 && ROCK_SPOTS.length < 22; i++) {
  const r = Math.floor(rand() * ROWS);
  const c = Math.floor(rand() * COLS);
  const fringe = lay(r, c) === 2 && mountainLayer(r, c) === 2
    && ((mountainLayer(r - 2, c) || 2) > 2 || (mountainLayer(r, c - 2) || 2) > 2
      || (nearWater(r, c, 2) && !isWater(r, c)));
  if (!fringe || isWater(r, c)) continue;
  const x = OFFSET + c * 128, y = -(OFFSET + r * 128);
  if (nearAnchor(x, y, 500)) continue;
  ROCK_SPOTS.push({ r, c, x, y });
}
for (const s of ROCK_SPOTS) {
  regular.push({
    type: 'LTrc',
    position: [s.x, s.y, 0],
    angle: Math.round(vnoise(s.r, s.c, 12) * 360),
    scale: [1, 1, 1],
    flags: { visible: true, solid: true, fixedZ: false },
    id: did++,
    variation: Math.floor(vnoise(s.r, s.c, 13) * 4),
  });
}

const doodads = { regular, special: [] };

// ---------------------------------------------------------------- units ---

let uid = 0;
const units = [];
const U = (type, x, y, player, extra = {}) => {
  units.push({
    type, position: [x, y, 0], rotation: 270,
    hero: { level: type === 'sloc' ? 0 : 1, str: 0, agi: 0, int: 0 },
    player, id: uid++, ...extra,
  });
};

// the communal landing: slocs, one Founder hero per player, the Market
STARTS.forEach((p, i) => U('sloc', p.x, p.y, i, { targetAcquisition: 0 }));
FOUNDERS.forEach((p, i) => U('H000', p.x, p.y, i));           // the Founder
U('n002', MARKET.x, MARKET.y, 27);                            // Northreach Market

// the huntable wild: shoals, deer, wolves
SHOALS.forEach((p) => U('n003', p.x, p.y, 24, { targetAcquisition: -2 }));
DEER.forEach((p) => U('nder', p.x, p.y, 27));
WOLVES.forEach(([code, x, y]) => U(code, x, y, 24, { targetAcquisition: -2 }));

// waystone cairns mark every recommended site; two sites also keep a
// creep-guarded flavor gold mine (players have no way to mine)
SITES.forEach((s) => U('n001', s.x - 288, s.y + 224, 27));    // Waystone Cairn
const FLAVOR_MINES = [
  { site: 1, gold: 11000, camp: ['ngno', 'ngno', 'ngnb'] },   // Northwood — gnolls
  { site: 5, gold: 12000, camp: ['nogr', 'nogr', 'nogm'] },   // Highcairn — ogres
];
FLAVOR_MINES.forEach(({ site, gold, camp }) => {
  const s = SITES[site];
  U('ngol', s.x, s.y, 24, { gold });
  camp.forEach((code, k) => {
    U(code, s.x + 224 - k * 160, s.y - 256, 24, { targetAcquisition: -2 });
  });
});

// -------------------------------------------------------------- regions ---

const REGION_HALF = 384; // 768x768 site claim boxes
const regions = [];
SITES.forEach((s, i) => {
  regions.push({
    name: `Site${s.name}`, id: i,
    weatherEffect: '\u0000\u0000\u0000\u0000', ambientSound: '',
    color: [64 + i * 24, 128, 255 - i * 24],
    position: {
      left: s.x - REGION_HALF, bottom: s.y - REGION_HALF,
      right: s.x + REGION_HALF, top: s.y + REGION_HALF,
    },
  });
});
DENS.forEach((s, i) => {
  regions.push({
    name: s.name, id: SITES.length + i,
    weatherEffect: '\u0000\u0000\u0000\u0000', ambientSound: '',
    color: [255, 64 + i * 64, 64],
    position: {
      left: s.x - 256, bottom: s.y - 256,
      right: s.x + 256, top: s.y + 256,
    },
  });
});

// ---------------------------------------------------------------- write ---

const write = (rel, data) =>
  fs.writeFileSync(path.join(SRC, rel), JSON.stringify(data, null, 2) + '\n');

write('terrain.json', terrain);
write('doodads.json', doodads);
write('units.json', units);
write('regions.json', regions);

// war3map.wpm / war3map.shd sized for 80x80 tiles (320x320 cells)
const PW = W * 4, PH = H * 4;
const wpm = Buffer.alloc(16 + PW * PH);
wpm.write('MP3W', 0, 'latin1');
wpm.writeInt32LE(0, 4);
wpm.writeInt32LE(PW, 8);
wpm.writeInt32LE(PH, 12);
fs.writeFileSync(path.join(SRC, 'files', 'war3map.wpm'), wpm);
fs.writeFileSync(path.join(SRC, 'files', 'war3map.shd'), Buffer.alloc(PW * PH));

console.log(`terrain: ${W}x${H}, ${ROWS * COLS} vertices, ` +
  `${flags.filter((f) => f & 0x100).length} water, ${rampVerts.size} ramp verts`);
console.log(`doodads: ${regular.length} (${regular.filter((d) => d.type === 'NTtw').length} trees)`);
console.log(`units: ${units.length}, regions: ${regions.length}`);
