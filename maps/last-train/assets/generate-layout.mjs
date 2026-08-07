#!/usr/bin/env node
// generate-layout.mjs — authoring script for the Yio Chu Kang estate:
// terrain.json + doodads.json + units.json + regions.json in ONE pass so
// every coordinate (roads, pads, props, spawn anchors, the leak-free rail
// corridor) stays consistent. Pattern: maps/coinstead/assets/
// generate-terrain.mjs, extended to place the preplaced units too.
//
//   node maps/last-train/assets/generate-layout.mjs
//
// World: 96x96 Lordaeron Summer tiles (FourCCs from docs/FORMATS.md 'L'
// tables ONLY — gotcha 20), world -6144..6144, JSON row 0 = map NORTH.
// Heightfield only — deliberately NO cliffs, so zombie ground pathing is
// never in doubt (the coinstead rule). Layout:
//   - the ELEVATED MRT LINE: a raised berm strip on the east edge
//     (x 4480..4720) carrying generated TrackSegment units; the station
//     platform sits mid-line at (4550, 0) with a hardstanding apron;
//   - a dirt MAIN ROAD (y=0) from the estate to the station, a N-S road
//     at x=-1200, and the PARK CONNECTOR green corridor at x=-2600
//     (the horde's patrol route, tree-lined);
//   - five HDB district clusters (Teck Ghee, Kebun Baru, Yio Chu Kang
//     Gardens, Seletar Hills, Cheng San), each with tower pads, void-deck
//     props and civilians;
//   - the Mayflower Hawker Centre (loot-dense), the Teck Ghee Polyclinic
//     (the cure region), three SUBSTATIONS spread to force traversal;
//   - the kampong-remnant Broodmother lair in the far SW corner
//     (Lorong Buangkok, mucky ground, nests + guards).
//
// NOTE (CLAUDE.md gotcha 6): committed JSON is a translator FIXED POINT —
// after regenerating run build-map --stabilize once and commit. wpm/shd/
// minimap stay auto-generated (files/ ships none; gotchas 8, 12).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '..');

const W = 96, H = 96;
const COLS = W + 1, ROWS = H + 1;
const OFFSET = -(W * 128) / 2; // -6144

function vnoise(r, c, salt) {
  let h = (r * 73856093) ^ (c * 19349663) ^ (salt * 83492791);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

const PALETTE = ['Ldrt', 'Ldro', 'Ldrg', 'Lrok', 'Lgrs', 'Lgrd'];
const T = { dirt: 0, rough: 1, grassy: 2, rock: 3, grass: 4, dark: 5 };

// ---------------------------------------------------------------- anchors
// (mirrored by war3map.lua's DISTRICTS table and regions.json)
const SPAWN = { x: -600, y: -200 };
const SLOCS = [[-700, -400], [-500, -400], [-700, 0], [-500, 0]];
const TRACK_X = 4600;                    // the elevated line
const BERM = { x0: 4470, x1: 4730, h: 96 };
const STATION = { x: 4250, y: 0 };       // station house (west of the line)
const PLATFORM = { x: 4550, y: 0 };      // platform piece on the berm
const PLATFORM_RECT = { x0: 4280, y0: -576, x1: 4830, y1: 576 };
const ROAD_MAIN_Y = 0;                   // E-W main road
const ROAD_NS_X = -1200;                 // N-S estate road
const PARK_X = -2600;                    // park connector corridor
const ROAD_HALF = 200, ROAD_CORE = 88;
const HAWKER = { x: 200, y: 1400 };
const CLINIC = { x: -2900, y: -1600 };
const CLINIC_RECT = { x0: -3260, y0: -1960, x1: -2540, y1: -1240 };
const LAIR = { x: -5000, y: -4800 };
const LAIR_RECT = { x0: -5900, y0: -5700, x1: -4100, y1: -3900 };

const DISTRICTS = [
  { key: 'teckghee', name: 'Teck Ghee', x: -800, y: -3200,
    towers: [['A', -1400, -3400], ['B', -600, -2900], ['A', -100, -3700]] },
  { key: 'kebunbaru', name: 'Kebun Baru', x: -4200, y: 800,
    towers: [['A', -4600, 400], ['B', -3800, 1300]] },
  { key: 'gardens', name: 'Yio Chu Kang Gardens', x: 400, y: 3200,
    towers: [['A', 0, 3000], ['B', 900, 3600], ['A', 500, 4200]] },
  { key: 'seletar', name: 'Seletar Hills', x: 3200, y: 3800,
    towers: [['B', 2700, 3500], ['A', 3600, 4200]] },
  { key: 'chengsan', name: 'Cheng San', x: 2200, y: -3400,
    towers: [['A', 1700, -3100], ['B', 2600, -3800]] },
];
const SUBSTATIONS = [
  ['Kebun Baru Substation', -4400, 2500],
  ['Seletar Substation', 3400, 2500],
  ['Cheng San Substation', 2400, -4500],
];

// ------------------------------------------------------------- predicates
const onMainRoad = (x, y, half) => Math.abs(y - ROAD_MAIN_Y) <= half && x >= -5200 && x <= 4360;
const onNSRoad = (x, y, half) => Math.abs(x - ROAD_NS_X) <= half && y >= -4600 && y <= 4600;
const onRoad = (x, y, half) => onMainRoad(x, y, half) || onNSRoad(x, y, half);
const onPark = (x) => Math.abs(x - PARK_X) <= 300;
const onBerm = (x) => x >= BERM.x0 && x <= BERM.x1;
const nearAny = (x, y, pts, r) => pts.some(([px, py]) => Math.hypot(x - px, y - py) <= r);

const pads = []; // hardstanding pads (rock texture, flat)
function pad(x, y, r) { pads.push([x, y, r]); }
pad(SPAWN.x, SPAWN.y, 620);
pad(HAWKER.x, HAWKER.y, 560);
pad(CLINIC.x, CLINIC.y, 420);
pad(STATION.x, STATION.y, 520);
for (const d of DISTRICTS) for (const [, tx, ty] of d.towers) pad(tx, ty, 380);
for (const [, sx, sy] of SUBSTATIONS) pad(sx, sy, 300);

// ----------------------------------------------------------------- terrain
const groundHeight = [], waterHeight = [], boundaryFlag = [], flags = [];
const groundTexture = [], groundVariation = [], cliffVariation = [];
const cliffTexture = [], layerHeight = [];

for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const x = OFFSET + c * 128;
    const y = -(OFFSET + r * 128);
    const n = vnoise(r, c, 2);

    // height: gentle estate noise; the rail berm rises, everything else flat
    let gh = 8192 + Math.round((vnoise(r, c, 1) - 0.5) * 4) * 4;
    if (onBerm(x)) {
      gh = 8192 + BERM.h;
    }
    if (nearAny(x, y, pads, 0) || onRoad(x, y, ROAD_HALF)) gh = 8192;
    if (pads.some(([px, py, pr]) => Math.hypot(x - px, y - py) <= pr) && !onBerm(x)) gh = 8192;
    groundHeight.push(gh);
    waterHeight.push(8192);
    boundaryFlag.push(false);
    flags.push(0);

    // texture
    let tex;
    if (onBerm(x)) {
      tex = T.rock;                                        // the viaduct strip
    } else if (pads.some(([px, py, pr]) => Math.hypot(x - px, y - py) <= pr)) {
      tex = n < 0.35 ? T.rough : T.rock;                   // concrete hardstanding
    } else if (onRoad(x, y, ROAD_CORE)) {
      tex = T.dirt;                                        // road
    } else if (onRoad(x, y, ROAD_HALF)) {
      tex = T.rough;                                       // shoulder
    } else if (onPark(x)) {
      tex = n < 0.25 ? T.grassy : T.grass;                 // park connector green
    } else if (Math.hypot(x - LAIR.x, y - LAIR.y) <= 1100) {
      tex = n < 0.45 ? T.rough : T.dark;                   // kampong muck
    } else {
      tex = n < 0.12 ? T.grassy : (n > 0.88 ? T.dark : T.grass); // estate green
    }
    groundTexture.push(tex);

    groundVariation.push([0, 8, 16][Math.floor(vnoise(r, c, 3) * 3)]);
    cliffVariation.push(0);
    cliffTexture.push(240);
    layerHeight.push(2);
  }
}

const terrain = {
  tileset: 'L',
  customTileset: false,
  tilePalette: PALETTE,
  cliffTilePalette: ['CLdi', 'CLgr'],
  map: { width: W, height: H, offset: { x: OFFSET, y: OFFSET } },
  groundHeight, waterHeight, boundaryFlag, flags,
  groundTexture, groundVariation, cliffVariation, cliffTexture, layerHeight,
};

// ----------------------------------------------------------------- doodads
// LTlt trees + LTrc rocks only (game-verified via the bundled maps).
const doodads = [];
let did = 100;
const D = (type, x, y, salt) => {
  doodads.push({
    type, position: [x, y, 0], angle: 270,
    scale: [1, 1, 1].map(() => +(0.85 + vnoise(did, salt, 7) * 0.3).toFixed(2)),
    flags: { visible: true, solid: true, fixedZ: false },
    id: did++, variation: 0,
  });
};
const treeClear = (x, y) =>
  !onRoad(x, y, ROAD_HALF + 260)
  && !onBerm(x) && x < BERM.x0 - 300
  && !pads.some(([px, py, pr]) => Math.hypot(x - px, y - py) <= pr + 300)
  && !(x >= PLATFORM_RECT.x0 - 300 && x <= PLATFORM_RECT.x1);

// park connector tree lines (broken at the main road)
for (let y = -5600; y <= 5600; y += 420) {
  for (const s of [-1, 1]) {
    const x = PARK_X + s * 340;
    if (treeClear(x, y)) D('LTlt', x, y, 11);
  }
}
// estate greenery clusters
for (const [gx, gy] of [[-4800, -2400], [-3600, 3600], [1600, 2200], [3400, -1600],
  [-1900, 1900], [2900, 1200], [-300, -4900], [3700, -4700], [1200, 5000], [-4700, 4600]]) {
  for (const [ox, oy] of [[0, 0], [300, 140], [-260, 220], [140, -300], [-180, -200], [340, -120]]) {
    if (treeClear(gx + ox, gy + oy)) D('LTlt', gx + ox, gy + oy, 12);
  }
}
// kampong lair fringe (dead trees ring the nests)
for (let k = 0; k < 8; k++) {
  const a = (Math.PI * 2 * k) / 8;
  const x = LAIR.x + Math.round(Math.cos(a) * 950);
  const y = LAIR.y + Math.round(Math.sin(a) * 950);
  if (treeClear(x, y)) D('LTlt', x, y, 13);
}
// rocks along the berm foot and the lair
for (let y = -5800; y <= 5800; y += 1600) D('LTrc', BERM.x0 - 160, y, 14);
D('LTrc', LAIR.x + 500, LAIR.y - 300, 15);
D('LTrc', LAIR.x - 400, LAIR.y + 500, 15);

// ---------------------------------------------------- Sol ambience decor
// The 2026-08-07 Sol batch (commissioned, gate-clean; provenance in
// ../imports-credits.json) placed as PURE DECOR: custom DOODAD classes
// (objects-doodads.json, D000..D004) — the sim classifies doodad-class
// types as decorative and never instantiates them, so no logic test can
// shift. All pieces are solid:false and sit clear of roads, pads, the
// berm and the platform's boarding ground (pathing-safety keep-out:
// ambience must never block a walk the game needs).
const SD = (type, x, y, angle, scale) => {
  doodads.push({
    type, position: [x, y, 0], angle,
    scale: scale || [1, 1, 1],
    flags: { visible: true, solid: false, fixedZ: false },
    id: did++, variation: 0,
  });
};
// D000 MRT platform canopies: dress the platform ENDS (the boarding
// center stays clear); long axis rotated onto the platform's N-S run.
SD('D000', 4550, -430, 90);
SD('D000', 4550, 430, 90);
// D001 bus-stop shelters (Sol variant, decor): road mouths the searchable
// n029 stops do not cover; kerbside, outside the ROAD_HALF band.
SD('D001', -3400, ROAD_MAIN_Y + 320, 270);
SD('D001', 600, ROAD_MAIN_Y - 320, 270);
SD('D001', ROAD_NS_X + 320, -3000, 270);
// D002 monsoon drain: a continuous canal run along the estate flank
// between the park connector and the N-S road (x=-2080), broken nowhere
// it would cross the main road's band (|y| >= 400 throughout).
for (let y = -2375; y <= 2375; y += 250) {
  if (Math.abs(y) < 400) continue;
  SD('D002', PARK_X + 520, y, 90, [2, 1, 1]);
}
// D003 pedestrian overhead bridges: one over the main road between the
// spawn blocks and the park connector, one over the N-S estate road.
// Scaled to span the full road + shoulders; solid:false is load-bearing
// here — a bridge must NEVER block the road it crosses.
SD('D003', -2000, ROAD_MAIN_Y, 90, [1.6, 1.2, 1.2]);
SD('D003', ROAD_NS_X, 2600, 0, [1.6, 1.2, 1.2]);
// D004 kopitiam seating clusters: the spawn void deck, the hawker centre
// forecourt, and two district void decks (near, not on, the prop units).
SD('D004', -350, -450, 270); SD('D004', -260, -380, 90); SD('D004', -350, -300, 0);
SD('D004', HAWKER.x - 140, HAWKER.y - 150, 270);
SD('D004', HAWKER.x + 140, HAWKER.y - 150, 90);
SD('D004', HAWKER.x, HAWKER.y - 250, 0);
SD('D004', -1550, -3660, 270); SD('D004', -1440, -3580, 90);   // Teck Ghee
SD('D004', -4450, 120, 270); SD('D004', -4530, 240, 0);        // Kebun Baru

// ------------------------- 2026-08-07 visual-identity pass (README:
// "Visual identity & the camera-safety doctrine"). All pieces are custom
// decor DOODAD classes (D005..D00D) — solid:false, sim-invisible, zero
// logic shift. CAMERA-SAFETY: WC3's camera looks from the SOUTH, tilted
// down, so tall models south of walkable space occlude units. Skyline
// pieces (500-800 tall) therefore stand ONLY on the north-edge fringe
// (y >= 5800 — nothing walkable behind them); mid/low pieces stay under
// ~175; linkway canopies under 100. Laundry racks (~230) are the one
// documented exception: flush against each tower's SOUTH face, the tower
// itself directly behind — they occlude nothing a player can stand on.
const DECOR_KEEPOUT = (x, y, top) => {
  const inPlatform = x >= PLATFORM_RECT.x0 - 200 && x <= PLATFORM_RECT.x1
    && y >= PLATFORM_RECT.y0 - 200 && y <= PLATFORM_RECT.y1 + 200;
  if (inPlatform) throw new Error(`decor inside platform keep-out: ${x},${y}`);
  if (onRoad(x, y, ROAD_CORE)) throw new Error(`decor on a road core: ${x},${y}`);
  if (top > 400 && y < 5800) throw new Error(`skyline-height decor south of the north edge: ${x},${y}`);
};
const DX = (type, x, y, angle, top, scale) => {
  DECOR_KEEPOUT(x, y, top);
  SD(type, x, y, angle, scale);
};

// CBD skyline backdrop: six silhouettes along the NORTH map edge, heights
// 560-790 world units at varied spacing (the "city beyond the estate").
// Angle 0 keeps each tower's glint faces toward the camera.
DX('D008', -5600, 5950, 0, 560);                 // twin towers
DX('D005', -3900, 6000, 0, 620);                 // slab
DX('D006', -2100, 5920, 0, 700);                 // stepped
DX('D007', -300, 5980, 0, 780);                  // three-column crown deck
DX('D005', 1500, 5940, 0, 694, [1.12, 1.12, 1.12]); // slab, taller variant
DX('D009', 3300, 6000, 0, 790);                  // spire

// MRT identity: station-approach entrance portal (on the station
// forecourt pad), roundel-suggestive line signs at the station and two
// main-road corners.
DX('D00A', 4050, -270, 90, 172);
DX('D00B', 4060, 240, 0, 172);
DX('D00B', -1050, 250, 0, 172);
DX('D00B', 2500, 250, 0, 172);

// Estate linkways (covered walkways, < 100 tall): three runs — the spawn
// void deck eastward, the hawker-centre approach off the main road, and
// the station approach on the south shoulder.
DX('D00D', -860, 252, 0, 96); DX('D00D', -590, 252, 0, 96);
DX('D00D', 200, 480, 90, 96); DX('D00D', 200, 750, 90, 96);
DX('D00D', 200, 1020, 90, 96);
DX('D00D', 3390, -252, 0, 96); DX('D00D', 3660, -252, 0, 96);
DX('D00D', 3930, -252, 0, 96);

// Laundry racks flush on tower south faces (angle 270: local +x = south,
// backboard spans east-west). Offset = the tower model's half-extent
// along its rotated long axis (A 234 / B 152 / Sol 130).
const RACK_OFFS = { A: 234, B: 152, S: 130 };
const RACKS = [
  ['A', -1320, -3400],           // Teck Ghee tower A (x nudged off the
  ['A', -4600, 400],             //   kopitiam cluster), then Kebun Baru,
  ['A', 0, 3000],                // Gardens,
  ['B', 2700, 3500],             // Seletar (point block),
  ['A', 1700, -3100],            // Cheng San
  // Sol towers (Teck Ghee's at -1250,-2700 gets NO rack: its south foot
  // falls on the N-S road core — the keep-out assert rejects it)
  ['S', -3600, 500], ['S', 1000, 2900],
  ['S', 3900, 3500], ['S', 1900, -4000],
];
for (const [v, tx, ty] of RACKS) DX('D00C', tx, ty - RACK_OFFS[v], 270, 232);

// ------------------------------------------------------------------- units
// Type ids mirror objects-units.json (the generated UNIT_ constants).
const units = [];
let uid = 0;
const U = (type, x, y, player, extra) => {
  units.push({
    type, position: [x, y, 0], rotation: 270,
    hero: { level: type === 'sloc' ? 0 : 1, str: 0, agi: 0, int: 0 },
    player, id: uid++,
    ...(type === 'sloc' ? { targetAcquisition: 0 } : {}),
    ...(extra || {}),
  });
};

// start locations (the survivors' void deck)
SLOCS.forEach(([x, y], i) => U('sloc', x, y, i));

const P_PASSIVE = 27, P_VICTIM = 25, P_HORDE = 24;

// HDB towers + district furniture
for (const d of DISTRICTS) {
  for (const [variant, tx, ty] of d.towers) {
    U(variant === 'A' ? 'h010' : 'h011', tx, ty, P_PASSIVE);
  }
  const [, bx, by] = d.towers[0];
  U('n020', bx + 260, by + 60, P_PASSIVE);   // void deck bench
  U('n020', bx + 260, by - 140, P_PASSIVE);  // second bench
  U('n021', bx - 280, by + 160, P_PASSIVE);  // rubbish chute dumpster
  U('n022', bx + 60, by + 280, P_PASSIVE);   // storeroom locker
  // three residents per district
  U('n000', d.x + 120, d.y + 80, P_VICTIM);
  U('n001', d.x - 160, d.y + 200, P_VICTIM);
  U('n002', d.x + 40, d.y - 220, P_VICTIM);
}

// spawn void deck: benches, a desk (the TC office corner), a public phone
U('n020', SPAWN.x + 300, SPAWN.y + 120, P_PASSIVE);
U('n023', SPAWN.x + 320, SPAWN.y - 160, P_PASSIVE);
U('n027', SPAWN.x - 320, SPAWN.y + 200, P_PASSIVE);

// hawker centre: the building, six stall tables, three civilians
U('h014', HAWKER.x, HAWKER.y + 260, P_PASSIVE);
for (let i = 0; i < 6; i++) {
  U('n024', HAWKER.x - 350 + (i % 3) * 350, HAWKER.y - 140 - Math.floor(i / 3) * 240, P_PASSIVE);
}
U('n000', HAWKER.x - 120, HAWKER.y - 60, P_VICTIM);
U('n001', HAWKER.x + 200, HAWKER.y - 300, P_VICTIM);
U('n002', HAWKER.x - 300, HAWKER.y + 40, P_VICTIM);

// clinic: the building, a desk, a locker
U('h015', CLINIC.x, CLINIC.y + 180, P_PASSIVE);
U('n023', CLINIC.x + 260, CLINIC.y - 60, P_PASSIVE);
U('n022', CLINIC.x - 260, CLINIC.y - 40, P_PASSIVE);

// station: house + platform piece + a public phone; track segments march
// the whole east edge (skipping the platform span)
U('h012', STATION.x, STATION.y, P_PASSIVE);
U('h01B', PLATFORM.x, PLATFORM.y, P_PASSIVE);      // the platform piece
U('n027', STATION.x - 200, STATION.y + 300, P_PASSIVE);
for (let y = -6000; y <= 6000; y += 760) {
  if (y > PLATFORM_RECT.y0 - 200 && y < PLATFORM_RECT.y1 + 200) continue;
  U('h019', TRACK_X, y, P_PASSIVE);
}

// substations (the three generator objectives)
for (const [, sx, sy] of SUBSTATIONS) U('h013', sx, sy, P_PASSIVE);

// abandoned cars along the roads (searchable)
const CARS = [[-3000, 300, 'n025'], [-1500, -320, 'n026'], [800, 280, 'n025'],
  [2500, -300, 'n025'], [3800, 320, 'n026']];
for (const [cx, cy, t] of CARS) U(t, cx, ROAD_MAIN_Y + cy, P_PASSIVE);
U('n025', ROAD_NS_X + 300, 2200, P_PASSIVE);   // N-S road stragglers
U('n026', ROAD_NS_X - 320, -2600, P_PASSIVE);

// night ambience: street lamps pool light at every pad and along the main
// road; bus stops mark the road at the estate mouths (searchable)
for (const [lx, ly] of [
  [SPAWN.x - 200, SPAWN.y + 380], [SPAWN.x + 420, SPAWN.y - 300],
  [HAWKER.x - 420, HAWKER.y + 60], [HAWKER.x + 420, HAWKER.y - 60],
  [CLINIC.x + 80, CLINIC.y + 380], [STATION.x - 80, STATION.y + 420],
  [STATION.x - 80, STATION.y - 420],
  [-4200, 260], [-2200, -260], [-400, 260], [1600, -260], [3200, 260],
  [ROAD_NS_X + 260, 1400], [ROAD_NS_X - 260, -1400], [ROAD_NS_X + 260, 3400],
]) U('n028', lx, ly, P_PASSIVE);
for (const d of DISTRICTS) {
  U('n028', d.towers[0][1] + 120, d.towers[0][2] - 300, P_PASSIVE);
}
U('n029', -2000, ROAD_MAIN_Y + 300, P_PASSIVE);
U('n029', 1400, ROAD_MAIN_Y - 300, P_PASSIVE);
U('n029', 3600, ROAD_MAIN_Y + 300, P_PASSIVE);

// the initial horde: shamblers/withered dotted through the estate
const SEED_ZOMBIES = [
  ['u000', -2200, -2600], ['u001', -1600, -3800], ['u000', -3900, -600],
  ['u001', -4500, 1900], ['u000', -2600, 2600], ['u001', -400, 2400],
  ['u000', 1200, 3900], ['u001', 2400, 4400], ['u000', 3600, 3000],
  ['u000', 3000, -2400], ['u001', 1400, -4300], ['u000', 2900, -4900],
  ['u001', -2600, -4600], ['u000', -2600, 4400],
];
for (const [t, zx, zy] of SEED_ZOMBIES) U(t, zx, zy, P_HORDE);

// the kampong lair: three nests, guards, the Broodmother
U('h018', LAIR.x + 350, LAIR.y + 250, P_HORDE);
U('h018', LAIR.x - 300, LAIR.y - 350, P_HORDE);
U('h018', LAIR.x + 150, LAIR.y - 500, P_HORDE);
U('u003', LAIR.x + 500, LAIR.y + 500, P_HORDE);
U('u003', LAIR.x - 550, LAIR.y + 350, P_HORDE);
U('u000', LAIR.x + 600, LAIR.y - 200, P_HORDE);
U('u000', LAIR.x - 250, LAIR.y + 600, P_HORDE);
U('u001', LAIR.x + 100, LAIR.y + 650, P_HORDE);
U('u001', LAIR.x - 650, LAIR.y - 250, P_HORDE);
U('u005', LAIR.x, LAIR.y, P_HORDE);

// Sol HDB point towers (the 27-storey SolHDBBlock — the 2026-08-07 Sol
// batch's third tower variant, gotcha-31 visual variety): one per
// district, off-road/off-pad, APPENDED LAST so every existing unit id and
// the CreateAllUnits order above stay byte-stable. Visual-identity pass:
// each district's tower is a DIFFERENT pastel-wash clone (h01D..h01G add
// uclr/uclg/uclb over the same Sol model — Singapore estates repaint per
// precinct; Sol's file itself is never edited). Same count/order, so unit
// ids stay byte-stable.
const SOL_TOWERS = [
  ['h01C', -1250, -2700],   // Teck Ghee (unwashed white)
  ['h01D', -3600, 500],     // Kebun Baru (mint)
  ['h01E', 1000, 2900],     // Yio Chu Kang Gardens (peach)
  ['h01F', 3900, 3500],     // Seletar Hills (sky)
  ['h01G', 1900, -4000],    // Cheng San (lavender)
];
for (const [t, x, y] of SOL_TOWERS) U(t, x, y, P_PASSIVE);

// ----------------------------------------------------------------- regions
const NUL = '\u0000\u0000\u0000\u0000';
let rid = 0;
const region = (name, rect, color) => ({
  name, id: rid++, weatherEffect: NUL, ambientSound: '',
  color, position: { left: rect.x0, bottom: rect.y0, right: rect.x1, top: rect.y1 },
});
const regions = [
  region('Platform', PLATFORM_RECT, [255, 64, 64]),
  region('Clinic', CLINIC_RECT, [64, 255, 128]),
  region('Lair', LAIR_RECT, [160, 64, 200]),
];
for (const d of DISTRICTS) {
  regions.push(region(d.name.replace(/ /g, ''),
    { x0: d.x - 1000, y0: d.y - 1000, x1: d.x + 1000, y1: d.y + 1000 },
    [200, 200, 80]));
}

// ------------------------------------------------------------------- write
const write = (rel, data) =>
  fs.writeFileSync(path.join(SRC, rel), JSON.stringify(data, null, 2) + '\n');
write('terrain.json', terrain);
write('doodads.json', { regular: doodads, special: [] });
write('units.json', units);
write('regions.json', regions);

console.log(`terrain: ${W}x${H}, berm+roads+pads painted, `
  + `${groundHeight.filter((h) => h > 8192).length} raised verts`);
console.log(`doodads: ${doodads.length}; units: ${units.length} `
  + `(${units.filter((u) => u.type === 'sloc').length} slocs, `
  + `${units.filter((u) => u.player === P_HORDE).length} horde, `
  + `${units.filter((u) => u.player === P_VICTIM).length} civilians); `
  + `regions: ${regions.length}`);
