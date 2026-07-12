#!/usr/bin/env node
// generate-terrain.mjs — authoring script for the Coinstead field:
// terrain.json (tile variation, four toll roads, the defensible town
// center) and doodads.json (tree lanes, groves, roadside rocks).
// Pattern: maps/vaults-of-ash/assets/generate-terrain.mjs.
//
//   node maps/coinstead/assets/generate-terrain.mjs
//
// Layout (64x64 Lordaeron Summer tiles, world -4096..4096, JSON row 0 =
// map NORTH; FourCCs from the docs/FORMATS.md 'L' tables only — gotcha 20):
//   - a dirt TOLL ROAD runs from each map edge (the wave spawn approaches
//     at (0,+-3800)/(+-3800,0), EDGE_POS in war3map.lua) to the center;
//   - the town center: a paved-dirt plaza around the Depot (0,0) inside a
//     raised EARTHWORK BERM ring (heightfield only — deliberately NO
//     cliffs, so raider ground pathing to the Depot is never in doubt),
//     broken where the four roads pass through;
//   - founder pads (grassy dirt) at the four start locations (+-512,+-512);
//   - trampled rough-dirt fans at the four spawn edges, meadow noise
//     (dark/grassy-dirt patches) everywhere else, corner groves.
//   - doodads: LTlt tree lanes flanking every road (they shape the raider
//     lanes without closing them), corner groves, LTrc rock clusters at
//     the spawn fans and on the berm crest. Nothing lands on roads, pads,
//     the plaza, or within the DepotCore leak rect.
//
// NOTE (CLAUDE.md gotcha 6): the committed JSON is a translator FIXED
// POINT — after regenerating, run build-map --stabilize once and commit
// the stabilized files. wpm/shd/minimap stay auto-generated (files/ is
// empty; gotchas 8, 12). Camera bounds in info.json (-3328..3328 x
// -3584..3072) stay inside the -4096..4096 world.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '..');

const W = 64, H = 64;               // tiles
const COLS = W + 1, ROWS = H + 1;   // vertices
const OFFSET = -(W * 128) / 2;      // -4096

// per-vertex hash noise (stable regardless of evaluation order)
function vnoise(r, c, salt) {
  let h = (r * 73856093) ^ (c * 19349663) ^ (salt * 83492791);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

// tile palette indices (same palette the map already ships)
const PALETTE = ['Ldrt', 'Ldro', 'Ldrg', 'Lrok', 'Lgrs', 'Lgrd'];
const T = { dirt: 0, rough: 1, grassy: 2, rock: 3, grass: 4, dark: 5 };

// layout anchors (world units) — mirror war3map.lua's numbers
const PLAZA_R = 760;                 // paved town center
const PLAZA_CORE_R = 420;           // inner pavement around the Depot
const BERM_IN = 980, BERM_OUT = 1310, BERM_MID = (BERM_IN + BERM_OUT) / 2;
const ROAD_HALF = 224;              // road corridor half-width
const ROAD_CORE = 96;               // packed center line
const PAD = 512, PAD_HALF = 236;    // founder pads at (+-512,+-512)
const EDGE_FAN = { d: 3800, r: 560 }; // trampled spawn approaches

const onRoad = (x, y, half) =>
  (Math.abs(x) <= half && Math.abs(y) >= PLAZA_CORE_R - 128) ||
  (Math.abs(y) <= half && Math.abs(x) >= PLAZA_CORE_R - 128);
const onPad = (x, y) =>
  Math.abs(Math.abs(x) - PAD) <= PAD_HALF && Math.abs(Math.abs(y) - PAD) <= PAD_HALF;
const fanDist = (x, y) => Math.min(
  Math.hypot(x - 0, y - EDGE_FAN.d), Math.hypot(x - 0, y + EDGE_FAN.d),
  Math.hypot(x - EDGE_FAN.d, y - 0), Math.hypot(x + EDGE_FAN.d, y - 0));

const groundHeight = [];
const waterHeight = [];
const boundaryFlag = [];
const flags = [];
const groundTexture = [];
const groundVariation = [];
const cliffVariation = [];
const cliffTexture = [];
const layerHeight = [];

for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const x = OFFSET + c * 128;
    const y = -(OFFSET + r * 128);
    const d = Math.hypot(x, y);
    const n = vnoise(r, c, 2);
    const road = onRoad(x, y, ROAD_HALF);

    // --- height: gentle meadow noise + the earthwork berm (no cliffs)
    let gh = 8192 + Math.round((vnoise(r, c, 1) - 0.5) * 6) * 4;
    if (d >= BERM_IN && d <= BERM_OUT && !onRoad(x, y, ROAD_HALF + 96)) {
      const t = 1 - Math.abs(d - BERM_MID) / (BERM_OUT - BERM_MID);
      gh += Math.round((88 * t) / 4) * 4;
    }
    if (d <= PLAZA_R || road) gh = 8192; // plaza and roads sit flat
    groundHeight.push(gh);
    waterHeight.push(8192);
    boundaryFlag.push(false);
    flags.push(0);

    // --- ground texture
    let tex;
    if (d <= PLAZA_CORE_R) {
      tex = T.dirt;                                     // the Depot's yard
    } else if (road) {
      tex = onRoad(x, y, ROAD_CORE) ? T.dirt : T.rough; // road + shoulder
    } else if (d <= PLAZA_R) {
      tex = n < 0.55 ? T.rough : T.grassy;              // plaza fringe
    } else if (d >= BERM_IN && d <= BERM_OUT) {
      tex = n < 0.3 ? T.rock : T.dark;                  // the berm crest
    } else if (onPad(x, y)) {
      tex = T.grassy;                                   // founder pads
    } else if (fanDist(x, y) <= EDGE_FAN.r) {
      tex = n < 0.35 ? T.rock : T.rough;                // trampled spawns
    } else {
      tex = n < 0.1 ? T.grassy : (n > 0.9 ? T.dark : T.grass);
    }
    groundTexture.push(tex);

    groundVariation.push([0, 8, 16][Math.floor(vnoise(r, c, 3) * 3)]);
    cliffVariation.push(0);
    cliffTexture.push(240); // single layer, no transitions
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

// ---------------------------------------------------------------- doodads
// LTlt tree walls and LTrc rocks only (both used by the game-verified
// bundled maps). Keep-out: roads, plaza, berm gaps, founder pads, the
// DepotCore rect, the market stall at (896, 0).
const doodads = [];
let did = 100;
const KEEPOUT = 300;
function clearOf(x, y) {
  if (onRoad(x, y, ROAD_HALF + KEEPOUT)) return false;
  if (Math.hypot(x, y) <= PLAZA_R + KEEPOUT) return false;
  if (onPad(x, y)) return false;
  if (Math.hypot(x - 896, y) <= KEEPOUT) return false;
  return true;
}
const D = (type, x, y, salt) => {
  doodads.push({
    type, position: [x, y, 0], angle: 270,
    scale: [1, 1, 1].map(() => +(0.85 + vnoise(did, salt, 7) * 0.3).toFixed(2)),
    flags: { visible: true, solid: true, fixedZ: false },
    id: did++, variation: 0,
  });
};

// tree lanes flanking each road (funnel the raiders without closing lanes)
for (let i = 0; i < 7; i++) {
  const a = 1500 + i * 340; // from past the berm out toward the edges
  for (const s of [-1, 1]) {
    D('LTlt', s * 560, a, 11); D('LTlt', s * 560, -a, 12);   // N + S roads
    D('LTlt', a, s * 560, 13); D('LTlt', -a, s * 560, 14);   // E + W roads
  }
}
// corner groves
for (const [gx, gy] of [[-2900, -2900], [2900, -2900], [-2900, 2900], [2900, 2900]]) {
  for (const [ox, oy] of [[0, 0], [280, 120], [-240, 200], [120, -280], [-160, -180], [320, -120], [-320, 40]]) {
    D('LTlt', gx + ox, gy + oy, 15);
  }
}
// rocks at the four spawn fans (flanking, never blocking, the spawn line)
for (const [rx, ry] of [[760, 3760], [-760, 3760], [760, -3760], [-760, -3760],
  [3760, 760], [3760, -760], [-3760, 760], [-3760, -760]]) {
  D('LTrc', rx, ry, 16);
}
// rocks on the berm crest diagonals, between the road gaps
for (let k = 0; k < 4; k++) {
  const ang = Math.PI / 4 + (Math.PI / 2) * k;
  D('LTrc', Math.round(Math.cos(ang) * BERM_MID), Math.round(Math.sin(ang) * BERM_MID), 17);
}

for (const dd of doodads) {
  if (!clearOf(dd.position[0], dd.position[1])) {
    throw new Error(`doodad ${dd.id} (${dd.type}) at ${dd.position} violates a keep-out zone`);
  }
}

// ------------------------------------------------------------------ write
const write = (rel, data) =>
  fs.writeFileSync(path.join(SRC, rel), JSON.stringify(data, null, 2) + '\n');
write('terrain.json', terrain);
write('doodads.json', { regular: doodads, special: [] });

console.log(`terrain: ${W}x${H}, roads+plaza+berm painted, ` +
  `${groundHeight.filter((h) => h > 8192).length} raised verts`);
console.log(`doodads: ${doodads.length} (trees + rocks), all keep-outs clear`);
