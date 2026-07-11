#!/usr/bin/env node
// generate-terrain.mjs — authoring script for The Vaults of Ash
// terrain/regions/units/doodads JSON plus the terrain-sized opaque files
// (war3map.wpm / war3map.shd).  Pattern: maps/northreach/assets/generate-map-data.mjs.
//
//   node maps/vaults-of-ash/assets/generate-terrain.mjs
//
// Layout (128x128 Dungeon tiles, world -8192..8192, JSON row 0 = map NORTH):
//   - everything is DARK VOID (cliff layer 1, sunken dark rock) except
//     16 cliff-walled islands (cliff layer 2, one full cliff level above
//     the void, no ramps between islands — travel is trigger teleport only):
//       * the HUB (south center): party spawn, 3 floor doors + the Vault
//         Gate on the north edge, 3 boon pedestals, the Ashen Shrine
//         campfire with 3 rune plates;
//       * 12 ROOM islands in three floor rows going north (4 per floor);
//         every room has a raised reliquary dais (layer 3) at its north
//         end with a ramp on the south face — the only ramps on the map;
//       * the BOSS SUMMIT (north center) with a lava-cracked heart ring.
//   - regions.json carries every interactive rect (doors, plates) AND one
//     rect per room/arena so war3map.lua reads geometry from the generated
//     REGION_* constants — the single source of truth (CLAUDE.md gotcha 27).
//
// NOTE (CLAUDE.md gotcha 6): the committed JSON is a translator FIXED POINT
// produced by running build -> extract -> map-to-json once over this
// script's output and committing the stabilized *.json. FourCCs come from
// the docs/FORMATS.md Dungeon ('D') tables only.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '..');

const W = 128, H = 128;             // tiles
const COLS = W + 1, ROWS = H + 1;   // vertices
const OFFSET = -(W * 128) / 2;      // -8192

// world <-> vertex-grid helpers (row 0 = north)
const colOf = (x) => (x - OFFSET) / 128;
const rowOf = (y) => (-y - OFFSET) / 128;

// per-vertex hash noise (stable regardless of evaluation order)
function vnoise(r, c, salt) {
  let h = (r * 73856093) ^ (c * 19349663) ^ (salt * 83492791);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

// ---------------------------------------------------------------- layout ---
// Named world-coordinate anchors — regions.json/units.json and war3map.lua
// (via the generated REGION_* constants) all derive from these numbers.

export const HUB = { cx: 0, cy: -6272, hx: 1792, hy: 1152 };   // 28x18 tiles
export const BOSS = { cx: 0, cy: 6272, hx: 1792, hy: 1024 };   // 28x16 tiles
export const ROOM_HX = 1280, ROOM_HY = 1024;                   // 20x16 tiles
export const FLOOR_CY = [-2944, 256, 3456];                    // floors 1..3
export const ROOM_CX = [-5952, -1984, 1984, 5952];             // 4 rooms/floor

// hub furniture
export const HERO_SPAWNS = [
  { x: -320, y: -6912 }, { x: 0, y: -6912 }, { x: 320, y: -6912 },
];
export const HUB_RETURN = { x: 0, y: -6592 };
export const DOOR_X = [-1344, -448, 448, 1344];  // A, B, C, Vault Gate
export const DOOR_Y = -5504;                     // region centers
export const DOOR_FRAME_Y = -5280;               // Sealstone Door units
export const OBELISK_DX = -256, OBELISK_Y = -5696;
export const BOON_PLATES = [
  { x: -576, y: -6208 }, { x: 0, y: -6208 }, { x: 576, y: -6208 },
];
export const SHRINE_PLATES = [
  { x: 896, y: -7040 }, { x: 1216, y: -7040 }, { x: 1536, y: -7040 },
];
export const SHRINE_REKINDLE = { x: 576, y: -7040 };   // phase 2: revive plate
export const SHRINE_KEEPER = { x: 1216, y: -6592 };

// phase 2 hub furniture: the Trial door (west edge, below the door row) and
// the four Covenant altars (west mirror of the shrine plates)
export const TRIAL_DOOR = { x: -1600, y: -5888 };       // region center
export const TRIAL_FRAME = { x: -1600, y: -5664 };      // Sealstone Door unit
export const TRIAL_OBELISK = { x: -1600, y: -6144 };    // Omen Obelisk unit
export const COVENANT_ALTARS = [                        // Cinders/Stillness/Sealed/Unbound
  { x: -1600, y: -7040 }, { x: -1280, y: -7040 }, { x: -960, y: -7040 }, { x: -640, y: -7040 },
];

// phase 3 hub furniture: the three hero pedestals (west, between the altar
// row and the boon pedestals) — Torchbearer / Ashblade / Chorister
export const HERO_PEDESTALS = [
  { x: -1600, y: -6496 }, { x: -1280, y: -6496 }, { x: -960, y: -6496 },
];

// per-room geometry (relative to room center)
export const ROOM_ENTRY_DY = -704;   // party teleport target
export const DAIS = { dy: 640, hx: 384, hy: 256 };  // raised reliquary dais

// boss arena
export const BOSS_ENTRY = { x: 0, y: 5504 };
export const BOSS_SPAWN = { x: 0, y: 6400 };

// ------------------------------------------------------------- islands ---

const rects = []; // { x0,x1,y0,y1, kind }
rects.push({ x0: HUB.cx - HUB.hx, x1: HUB.cx + HUB.hx, y0: HUB.cy - HUB.hy, y1: HUB.cy + HUB.hy, kind: 'hub' });
rects.push({ x0: BOSS.cx - BOSS.hx, x1: BOSS.cx + BOSS.hx, y0: BOSS.cy - BOSS.hy, y1: BOSS.cy + BOSS.hy, kind: 'boss' });
const roomRects = [];
for (let f = 0; f < 3; f++) {
  for (let i = 0; i < 4; i++) {
    const cx = ROOM_CX[i], cy = FLOOR_CY[f];
    const rr = { x0: cx - ROOM_HX, x1: cx + ROOM_HX, y0: cy - ROOM_HY, y1: cy + ROOM_HY, kind: 'room', floor: f + 1, idx: i, cx, cy };
    rects.push(rr);
    roomRects.push(rr);
  }
}

function islandAt(x, y) {
  for (const r of rects) {
    if (x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) return r;
  }
  return null;
}

function daisAt(x, y) {
  for (const r of roomRects) {
    const dx = Math.abs(x - r.cx), dy = Math.abs(y - (r.cy + DAIS.dy));
    if (dx <= DAIS.hx && dy <= DAIS.hy) return r;
  }
  // decorative heart dais on the boss summit
  if (Math.abs(x - BOSS.cx) <= 512 && Math.abs(y - (BOSS.cy + 512)) <= 256) return 'boss';
  return null;
}

// -------------------------------------------------------------- terrain ---

// tile palette indices
const T = { dirt: 0, brick: 1, stones: 2, dark: 3, tiles: 4, lava: 5 };

const groundHeight = [];
const waterHeight = [];
const boundaryFlag = [];
const flags = [];
const groundTexture = [];
const groundVariation = [];
const cliffVariation = [];
const cliffTexture = [];
const layerHeight = [];

// layer per vertex: void 1, island 2, dais 3
const layerAt = [];
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const x = OFFSET + c * 128;
    const y = -(OFFSET + r * 128);
    const isle = islandAt(x, y);
    layerAt.push(isle ? (daisAt(x, y) ? 3 : 2) : 1);
  }
}
const lay = (r, c) => layerAt[r * COLS + c];

// ramps: the south face of every room dais (middle 3 columns), the only
// place layer 3 meets layer 2 below it
const rampVerts = new Set();
for (const rr of roomRects) {
  const daisCy = rr.cy + DAIS.dy;
  const southY = daisCy - DAIS.hy;              // world y of the dais south edge
  const rTop = Math.round(rowOf(southY));       // vertex row of that edge
  const cMid = Math.round(colOf(rr.cx));
  for (const c of [cMid - 1, cMid, cMid + 1]) {
    for (const r of [rTop - 1, rTop, rTop + 1]) {
      if (r > 0 && r < ROWS - 1 && lay(r, c) === 3 && lay(r + 1, c) === 2) {
        rampVerts.add(`${r},${c}`);
        rampVerts.add(`${r + 1},${c}`);
      }
    }
  }
}

for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const x = OFFSET + c * 128;
    const y = -(OFFSET + r * 128);
    const layer = lay(r, c);
    const isle = islandAt(x, y);

    // --- height: islands near ground zero, the void sunk far below
    let gh = 8192 + Math.round((vnoise(r, c, 1) - 0.5) * 8) * 4;
    if (layer === 1) gh = 8192 - 96 - Math.round(vnoise(r, c, 4) * 12) * 4;
    if (layer === 3) gh += 16;
    groundHeight.push(gh);
    waterHeight.push(8192);
    boundaryFlag.push(false);

    let f = 0;
    if (rampVerts.has(`${r},${c}`)) f |= 0x40;
    flags.push(f);

    // --- ground texture
    let tex;
    const n = vnoise(r, c, 2);
    if (layer === 1) {
      tex = T.dark;                                   // the void floor
    } else if (layer === 3) {
      tex = T.tiles;                                  // dais: square tiles
    } else if (isle && isle.kind === 'boss') {
      // lava-cracked ring around the heart, worked tiles at the center
      const d = Math.hypot(x - BOSS.cx, y - BOSS.cy);
      tex = d < 640 ? T.tiles : (d < 1100 && n < 0.5 ? T.lava : T.brick);
    } else if (isle && isle.kind === 'hub') {
      const d = Math.hypot(x - HUB.cx, y - HUB.cy);
      tex = d < 900 ? T.tiles : (n < 0.7 ? T.brick : T.stones);
    } else {
      // room floors: worn brick with patches of round stones and dirt
      const edge = Math.min(x - isle.x0, isle.x1 - x, y - isle.y0, isle.y1 - y) < 384;
      tex = edge ? T.stones : (n < 0.6 ? T.brick : (n < 0.85 ? T.dirt : T.stones));
    }
    groundTexture.push(tex);

    groundVariation.push([0, 8, 16][Math.floor(vnoise(r, c, 3) * 3)]);
    cliffVariation.push(0);

    // cliff texture marker at layer transitions (vs S/E/SE neighbors)
    const trans = [[1, 0], [0, 1], [1, 1]].some(([dr, dc]) => {
      const rr2 = r + dr, cc2 = c + dc;
      return rr2 < ROWS && cc2 < COLS && lay(rr2, cc2) !== layer;
    });
    cliffTexture.push(trans ? 0 : 240);
    layerHeight.push(layer);
  }
}

const terrain = {
  tileset: 'D',
  customTileset: true,
  // FourCCs straight from the docs/FORMATS.md Dungeon tables
  tilePalette: ['Ddrt', 'Dbrk', 'Drds', 'Ddkr', 'Dsqd', 'Dlvc'],
  cliffTilePalette: ['CDdi', 'CDsq'],
  map: { width: W, height: H, offset: { x: OFFSET, y: OFFSET } },
  groundHeight, waterHeight, boundaryFlag, flags,
  groundTexture, groundVariation, cliffVariation, cliffTexture, layerHeight,
};

// ------------------------------------------------------------ assertions ---

function vertexInfo(x, y) {
  const c = Math.round(colOf(x));
  const r = Math.round(rowOf(y));
  return { r, c, layer: lay(r, c) };
}
const mustBeIsland = [
  ...HERO_SPAWNS.map((p, i) => ({ ...p, tag: `hero spawn ${i}` })),
  { ...HUB_RETURN, tag: 'hub return' },
  ...DOOR_X.map((x, i) => ({ x, y: DOOR_Y, tag: `door region ${i}` })),
  ...DOOR_X.map((x, i) => ({ x, y: DOOR_FRAME_Y, tag: `door frame ${i}` })),
  ...DOOR_X.map((x, i) => ({ x: x + OBELISK_DX, y: OBELISK_Y, tag: `obelisk ${i}` })),
  ...BOON_PLATES.map((p, i) => ({ ...p, tag: `boon plate ${i}` })),
  ...SHRINE_PLATES.map((p, i) => ({ ...p, tag: `shrine plate ${i}` })),
  { ...SHRINE_REKINDLE, tag: 'shrine rekindle plate' },
  { ...SHRINE_KEEPER, tag: 'shrine keeper' },
  { ...TRIAL_DOOR, tag: 'trial door region' },
  { ...TRIAL_FRAME, tag: 'trial door frame' },
  { ...TRIAL_OBELISK, tag: 'trial obelisk' },
  ...COVENANT_ALTARS.map((p, i) => ({ ...p, tag: `covenant altar ${i}` })),
  ...COVENANT_ALTARS.map((p, i) => ({ x: p.x, y: p.y + 224, tag: `covenant altar unit ${i}` })),
  ...HERO_PEDESTALS.map((p, i) => ({ ...p, tag: `hero pedestal ${i}` })),
  ...HERO_PEDESTALS.map((p, i) => ({ x: p.x, y: p.y + 224, tag: `hero pedestal unit ${i}` })),
  { ...BOSS_ENTRY, tag: 'boss entry' },
  { ...BOSS_SPAWN, tag: 'boss spawn' },
  ...roomRects.map((rr) => ({ x: rr.cx, y: rr.cy + ROOM_ENTRY_DY, tag: `room f${rr.floor} i${rr.idx} entry` })),
  ...roomRects.map((rr) => ({ x: rr.cx, y: rr.cy, tag: `room f${rr.floor} i${rr.idx} center` })),
];
for (const p of mustBeIsland) {
  const v = vertexInfo(p.x, p.y);
  if (v.layer < 2) throw new Error(`${p.tag} (${p.x},${p.y}) is in the void (vertex r${v.r} c${v.c})`);
}
for (const rr of roomRects) {
  const v = vertexInfo(rr.cx, rr.cy + DAIS.dy);
  if (v.layer !== 3) throw new Error(`room f${rr.floor} i${rr.idx} dais expected layer 3, got ${v.layer}`);
}
if (rampVerts.size === 0) throw new Error('no ramp vertices generated');
// islands must be pairwise separated by void (no accidental cliff bridges)
for (let a = 0; a < rects.length; a++) {
  for (let b = a + 1; b < rects.length; b++) {
    const ra = rects[a], rb = rects[b];
    const gapX = Math.max(ra.x0, rb.x0) - Math.min(ra.x1, rb.x1);
    const gapY = Math.max(ra.y0, rb.y0) - Math.min(ra.y1, rb.y1);
    if (gapX < 384 && gapY < 384) throw new Error(`islands ${a} and ${b} are closer than 3 tiles`);
  }
}

// -------------------------------------------------------------- regions ---

const PLATE_HALF = 144; // small step-on plates
const DOOR_HALF = 144;
const regions = [];
let rid = 0;
const addRegion = (name, cx, cy, hx, hy, color) => {
  regions.push({
    name, id: rid++,
    weatherEffect: '\u0000\u0000\u0000\u0000', ambientSound: '',
    color,
    position: { left: cx - hx, bottom: cy - hy, right: cx + hx, top: cy + hy },
  });
};

addRegion('DoorA', DOOR_X[0], DOOR_Y, DOOR_HALF, DOOR_HALF, [255, 64, 64]);
addRegion('DoorB', DOOR_X[1], DOOR_Y, DOOR_HALF, DOOR_HALF, [255, 128, 64]);
addRegion('DoorC', DOOR_X[2], DOOR_Y, DOOR_HALF, DOOR_HALF, [255, 192, 64]);
addRegion('VaultGate', DOOR_X[3], DOOR_Y, DOOR_HALF, DOOR_HALF, [255, 0, 0]);
addRegion('BoonPlateA', BOON_PLATES[0].x, BOON_PLATES[0].y, PLATE_HALF, PLATE_HALF, [64, 255, 128]);
addRegion('BoonPlateB', BOON_PLATES[1].x, BOON_PLATES[1].y, PLATE_HALF, PLATE_HALF, [64, 255, 160]);
addRegion('BoonPlateC', BOON_PLATES[2].x, BOON_PLATES[2].y, PLATE_HALF, PLATE_HALF, [64, 255, 192]);
addRegion('ShrineHeal', SHRINE_PLATES[0].x, SHRINE_PLATES[0].y, PLATE_HALF, PLATE_HALF, [64, 128, 255]);
addRegion('ShrineReroll', SHRINE_PLATES[1].x, SHRINE_PLATES[1].y, PLATE_HALF, PLATE_HALF, [96, 128, 255]);
addRegion('ShrineFortify', SHRINE_PLATES[2].x, SHRINE_PLATES[2].y, PLATE_HALF, PLATE_HALF, [128, 128, 255]);
addRegion('ShrineRekindle', SHRINE_REKINDLE.x, SHRINE_REKINDLE.y, PLATE_HALF, PLATE_HALF, [160, 128, 255]);
addRegion('TrialDoor', TRIAL_DOOR.x, TRIAL_DOOR.y, DOOR_HALF, DOOR_HALF, [255, 255, 96]);
addRegion('AltarCinders', COVENANT_ALTARS[0].x, COVENANT_ALTARS[0].y, PLATE_HALF, PLATE_HALF, [255, 96, 32]);
addRegion('AltarStillness', COVENANT_ALTARS[1].x, COVENANT_ALTARS[1].y, PLATE_HALF, PLATE_HALF, [96, 196, 255]);
addRegion('AltarSealed', COVENANT_ALTARS[2].x, COVENANT_ALTARS[2].y, PLATE_HALF, PLATE_HALF, [196, 96, 255]);
addRegion('AltarUnbound', COVENANT_ALTARS[3].x, COVENANT_ALTARS[3].y, PLATE_HALF, PLATE_HALF, [255, 255, 255]);

// one rect per room/arena so the map script reads island geometry from the
// generated REGION_* constants instead of duplicating coordinates
const FLOOR_TAG = ['F1', 'F2', 'F3'];
const IDX_TAG = ['A', 'B', 'C', 'D'];
for (const rr of roomRects) {
  addRegion(`Room${FLOOR_TAG[rr.floor - 1]}${IDX_TAG[rr.idx]}`, rr.cx, rr.cy, ROOM_HX, ROOM_HY,
    [80 + rr.floor * 40, 80, 200 - rr.idx * 30]);
}
addRegion('BossArena', BOSS.cx, BOSS.cy, BOSS.hx, BOSS.hy, [255, 32, 32]);
addRegion('HubReturn', HUB_RETURN.x, HUB_RETURN.y, 192, 192, [200, 200, 200]);
// phase 3: hero pedestal plates (appended so earlier region ids stay stable)
addRegion('PedestalTorchbearer', HERO_PEDESTALS[0].x, HERO_PEDESTALS[0].y, PLATE_HALF, PLATE_HALF, [255, 220, 120]);
addRegion('PedestalAshblade', HERO_PEDESTALS[1].x, HERO_PEDESTALS[1].y, PLATE_HALF, PLATE_HALF, [255, 160, 80]);
addRegion('PedestalChorister', HERO_PEDESTALS[2].x, HERO_PEDESTALS[2].y, PLATE_HALF, PLATE_HALF, [160, 255, 200]);

// ---------------------------------------------------------------- units ---
// Preplaced NEUTRAL furniture only. Party heroes are spawned by
// war3map.lua for the players actually seated (1-3 co-op).

let uid = 0;
const units = [];
const U = (type, x, y, player, extra = {}) => {
  units.push({
    type, position: [x, y, 0], rotation: 270,
    hero: { level: type === 'sloc' ? 0 : 1, str: 0, agi: 0, int: 0 },
    player, id: uid++, ...extra,
  });
};

// start locations for the 3 co-op slots
HERO_SPAWNS.forEach((p, i) => U('sloc', p.x, p.y, i, { targetAcquisition: 0 }));

// doors + omen obelisks on the hub's north edge
DOOR_X.forEach((x) => U('n000', x, DOOR_FRAME_Y, 27));            // Sealstone Door
DOOR_X.forEach((x) => U('n001', x + OBELISK_DX, OBELISK_Y, 27));  // Omen Obelisk

// boon pedestal braziers + shrine plates' braziers + the shrine keeper
BOON_PLATES.forEach((p) => U('n002', p.x, p.y + 224, 27));        // Ember Brazier
SHRINE_PLATES.forEach((p) => U('n002', p.x, p.y + 224, 27));
U('n003', SHRINE_KEEPER.x, SHRINE_KEEPER.y, 27);                  // Ashen Shrine
// two braziers flanking the party spawn
U('n002', -704, -6912, 27);
U('n002', 704, -6912, 27);

// phase 2: the Trial door (frame + omen obelisk), the Rekindling plate's
// brazier and the four Covenant altars
U('n000', TRIAL_FRAME.x, TRIAL_FRAME.y, 27);                      // Sealstone Door
U('n001', TRIAL_OBELISK.x, TRIAL_OBELISK.y, 27);                  // Omen Obelisk
U('n002', SHRINE_REKINDLE.x, SHRINE_REKINDLE.y + 224, 27);        // Ember Brazier
COVENANT_ALTARS.forEach((p) => U('n005', p.x, p.y + 224, 27));    // Covenant Altar

// phase 3: the three hero pedestal markers (Torchbearer / Ashblade / Chorister)
HERO_PEDESTALS.forEach((p) => U('n006', p.x, p.y + 224, 27));     // Torch Pedestal

const doodads = { regular: [], special: [] };

// ---------------------------------------------------------------- write ---

const write = (rel, data) =>
  fs.writeFileSync(path.join(SRC, rel), JSON.stringify(data, null, 2) + '\n');

write('terrain.json', terrain);
write('regions.json', regions);
write('units.json', units);
write('doodads.json', doodads);

// war3map.wpm / war3map.shd sized for 128x128 tiles (512x512 cells)
const PW = W * 4, PH = H * 4;
const wpm = Buffer.alloc(16 + PW * PH);
wpm.write('MP3W', 0, 'latin1');
wpm.writeInt32LE(0, 4);
wpm.writeInt32LE(PW, 8);
wpm.writeInt32LE(PH, 12);
fs.mkdirSync(path.join(SRC, 'files'), { recursive: true });
fs.writeFileSync(path.join(SRC, 'files', 'war3map.wpm'), wpm);
fs.writeFileSync(path.join(SRC, 'files', 'war3map.shd'), Buffer.alloc(PW * PH));

console.log(`terrain: ${W}x${H}, ${ROWS * COLS} vertices, ` +
  `${layerAt.filter((l) => l === 1).length} void verts, ${rampVerts.size} ramp verts`);
console.log(`islands: hub + ${roomRects.length} rooms + boss summit`);
console.log(`units: ${units.length}, regions: ${regions.length}`);
