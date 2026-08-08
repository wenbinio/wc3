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
//     (Lorong Buangkok, mucky ground, nests + guards);
//   - PHASE 2B: BLOCK 6A'S INTERIOR — the tower-escape slice (playtest-2
//     verdict: interior survival horror, "fight your way out of a HDB").
//     Six walled interior POCKETS on the south margin (inside camera
//     bounds, below every estate system: 6F corridor -> 5F flat warren ->
//     4F dark corridor -> 3F blocked landing -> 2F nest floor -> 1F void
//     deck), connected by TRIGGER-TELEPORT stairwell doors (region rects;
//     no waygate ability — the robust, sim-testable form). Walls keep
//     the game-verified LTrc rock-rank BLOCKING geometry (NO cliffs —
//     the pathing-safety doctrine) but wear the Sol round-4 interior
//     skin: LTrc-based clone classes carrying SolHDBWallSegment/Corner
//     art (pathing inherited — zero behavior change; the wall block
//     below documents why). The four class circles + slocs moved INTO
//     the 6F corridor: you pick your neighbour identity as you flee
//     your flat.
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

// ---- phase 2B: the Block 6A interior (the tower-escape slice) ----------
// Six pockets, west->east = top floor -> void deck. Band y [-5540,-4980]
// sits INSIDE the camera bounds (bottom -5632) and below every estate
// anchor (lair region ends at x -4100 / y -3900; Cheng San substation pad
// bottom -4800; trickle edge points moved to y -4600 in war3map.lua).
// war3map.lua's TOWER table mirrors these numbers — keep them in sync.
const TOWER_Y = -5260;                     // pocket centerline
const TOWER_HALF_H = 280, TOWER_HALF_W = 420;
const TOWER_POCKETS = [
  { key: '6f', cx: -3400 },   // start: corridor, class circles, dead lift
  { key: '5f', cx: -2400 },   // flat warren: rummage-rich, the neighbour
  { key: '4f', cx: -1400 },   // dark corridor: watchfire country
  { key: '3f', cx: -400 },    // blocked landing: smash through
  { key: '2f', cx: 600 },     // nest floor: burn it or sneak past
  { key: '1f', cx: 1600 },    // void deck interior: the final fight
];
const TOWER_BAND = {
  x0: TOWER_POCKETS[0].cx - TOWER_HALF_W - 120,
  y0: TOWER_Y - TOWER_HALF_H - 120,
  x1: TOWER_POCKETS[5].cx + TOWER_HALF_W + 120,
  y1: TOWER_Y + TOWER_HALF_H + 120,
};
const inTowerBand = (x, y) => x >= TOWER_BAND.x0 && x <= TOWER_BAND.x1
  && y >= TOWER_BAND.y0 && y <= TOWER_BAND.y1;
// TILE-ONLY apron (playtest-3 "interior reads as lawn" fix): the 120-unit
// band margin is UNDER one tile (128), so estate-grass tile blending bled
// into the pocket floors and the walls stood visibly on lawn. Tiles get a
// wider 260-unit apron (2 tiles) of dead hard ground around the whole
// band — a void ring between the block and the estate. Walls/asserts/
// regions keep using TOWER_BAND (geometry unchanged); ONLY tile painting
// and tree keep-out use the wide rect. NO blight anywhere: the zombies
// are ugho (Ghoul) clones — undead blight-regen would turn a cosmetic
// ground stain into a combat buff the sim cannot model.
const TOWER_APRON = 260;
const inTowerTiles = (x, y) => x >= TOWER_BAND.x0 - TOWER_APRON + 120
  && x <= TOWER_BAND.x1 + TOWER_APRON - 120
  && y >= TOWER_BAND.y0 - TOWER_APRON + 120
  && y <= TOWER_BAND.y1 + TOWER_APRON - 120;
// stairwell door rect (inside each pocket, east end) + the next pocket's
// arrival spot (west end) — war3map.lua teleports between them
const doorOf = (p) => ({ x: p.cx + 330, y: TOWER_Y });
const arriveOf = (p) => ({ x: p.cx - 320, y: TOWER_Y });

// slocs + survivor spawn: the 6F corridor's west end (was the void deck).
// GEOMETRY RULE: the spawn band (y -5290..-5210) must stay clear of the
// class-circle rects (south wall row, y <= -5350) — walking around the
// corridor must never accidentally re-pick a class.
const SLOCS = [[-3740, -5290], [-3640, -5290], [-3740, -5210], [-3640, -5210]];
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
    if (inTowerTiles(x, y)) gh = 8192;     // interior + apron dead flat
    groundHeight.push(gh);
    waterHeight.push(8192);
    boundaryFlag.push(false);
    flags.push(0);

    // texture
    let tex;
    if (inTowerTiles(x, y)) {
      // interior + void ring: HARD DEAD GROUND ONLY (playtest-3: the old
      // 30% Lgrd "dark grass" is still grass-green — the floors read as
      // lawn). Rock with rough-dirt flecks; never a grass tile anywhere
      // inside the wide apron. The pocket floors themselves are covered
      // by the unshaded FloorSlab doodads below — these tiles are the
      // between-pocket void and the under-slab backup.
      tex = n < 0.25 ? T.rough : T.rock;
    } else if (onBerm(x)) {
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
  && !(x >= PLATFORM_RECT.x0 - 300 && x <= PLATFORM_RECT.x1)
  && !inTowerTiles(x, y) && !inTowerTiles(x, y - 260); // Block 6A + apron

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
// Angle 0 keeps each tower's glint faces toward the camera. Sol round 3:
// the row is now six DISTINCT silhouettes — the scaled duplicate slab at
// x=1500 became the net-new SolSkyTowerArc (bowed front, 660 tall), so
// the roofline runs 560/620/700/780/660/790 with no repeats.
DX('D008', -5600, 5950, 0, 560);                 // twin towers
DX('D005', -3900, 6000, 0, 620);                 // slab
DX('D006', -2100, 5920, 0, 700);                 // stepped
DX('D007', -300, 5980, 0, 780);                  // three-column crown deck
DX('D018', 1500, 5940, 0, 660);                  // bowed-front arc (Sol r3)
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
// the station approach on the south shoulder. Sol round 3: the Sol
// segment is a 128-long open-ended TILE (in-house was 270); the local-x
// scale 2.11 stretches it to the exact 270 slot the run spacing assumes,
// so ends stay flush and every position/id is unchanged (posts read ~17
// wide instead of 8 — invisible at estate scale).
const LINK_SCALE = [2.11, 1, 1];
DX('D00D', -860, 252, 0, 96, LINK_SCALE); DX('D00D', -590, 252, 0, 96, LINK_SCALE);
DX('D00D', 200, 480, 90, 96, LINK_SCALE); DX('D00D', 200, 750, 90, 96, LINK_SCALE);
DX('D00D', 200, 1020, 90, 96, LINK_SCALE);
DX('D00D', 3390, -252, 0, 96, LINK_SCALE); DX('D00D', 3660, -252, 0, 96, LINK_SCALE);
DX('D00D', 3930, -252, 0, 96, LINK_SCALE);

// Laundry racks flush on tower south faces. Offset = the tower model's
// half-extent along its rotated long axis (A 234 / B 152 / Sol 130).
// Sol round 3 frame change: the in-house rack was +x-outreach (mounted at
// angle 270 so local +x pointed south); Sol's rack is wall-flush in the
// local y=0 plane with −y outreach ("wall flush: y range [-36,0]" in the
// gate report), so ANGLE 0 now puts the wall on the tower's south face
// with the poles/cloth hanging south. Positions are unchanged.
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
for (const [v, tx, ty] of RACKS) DX('D00C', tx, ty - RACK_OFFS[v], 0, 232);

// ---------------------- 2026-08-07 Sol round-2 batch (gate-clean, credits
// in ../imports-credits.json). Ten more PURE-DECOR classes (D00E..D017,
// objects-doodads.json) — solid:false, sim-invisible, appended AFTER every
// existing doodad so all round-1 ids stay byte-stable. All pieces are low
// (max top 140, camera-safe anywhere) and DX-asserted keep-out clean; the
// one deliberate SD exception is documented below (platform screen doors,
// the D000 canopy precedent).
//
// Kampong lair dressing (the Broodmother's approach — the boss unit u005
// itself now wears SolBroodmother.mdx, 300x300 at usca 1.0): ruined house
// shells on the NE/N approach fringe, flesh pods hugging the h018 nests,
// bone mounds in the open muck between them.
DX('D010', -4250, -4350, 320, 140);
DX('D010', -4620, -3950, 290, 140);
DX('D010', -5480, -3920, 250, 140);
DX('D010', -5780, -4620, 200, 140);
DX('D00E', -4780, -4510, 0, 80); DX('D00E', -5230, -5060, 70, 80);
DX('D00E', -4880, -5240, 140, 80); DX('D00E', -5330, -4420, 210, 80);
DX('D00E', -4530, -4880, 280, 80);
DX('D00F', -4430, -4600, 30, 60); DX('D00F', -5560, -4900, 120, 60);
DX('D00F', -4980, -4080, 200, 60); DX('D00F', -5110, -5350, 300, 60);
// Station: a fare-gate line across the forecourt walkway, flanking the
// D00A entrance portal (west of the platform keep-out box).
DX('D011', 4055, -120, 90, 60);
DX('D011', 4055, -430, 90, 60);
// Platform screen doors: three tiling segments along the platform's east
// (track-side) edge, on the gap line the announcements warn about.
// Deliberate SD (not DX): dressing the platform IS the point here — the
// D000 canopy precedent; solid:false, top exactly 100 (camera-safe), the
// train berths east of them (train body x 4720..4860).
SD('D012', 4705, -320, 90);
SD('D012', 4705, 0, 90);
SD('D012', 4705, 320, 90);
// Void-deck set: pillar rows, mailbox walls and bike racks at the spawn
// void deck and the district void decks the round-1 kopitiam clusters
// didn't fill (Gardens, Cheng San; Seletar + the station each get a lone
// bike rack).
DX('D013', -880, -360, 0, 110);   // spawn
DX('D014', -960, -220, 0, 90);
DX('D015', -280, -540, 90, 50);
DX('D013', -160, 2900, 0, 110);   // Yio Chu Kang Gardens
DX('D014', -260, 3300, 0, 90);
DX('D015', 380, 3120, 90, 50);
DX('D013', 1440, -3260, 0, 110);  // Cheng San
DX('D014', 1560, -2860, 0, 90);
DX('D015', 1980, -2900, 90, 50);
DX('D015', 2940, 3700, 45, 50);   // Seletar Hills
DX('D015', 3980, 340, 0, 50);     // station mouth (commuter racks)
// Street pieces: abandoned taxis among the round-1 cars (varied angles,
// shoulder-parked outside the road core), food carts at the hawker
// forecourt and the main/N-S junction corner.
DX('D016', -2100, 310, 250, 40);
DX('D016', 1700, -290, 45, 40);
DX('D016', -890, -800, 120, 40);
DX('D017', 430, 1520, 200, 70);
DX('D017', -1450, 330, 300, 70);

// ---------------------- 2026-08-07 Sol round-3 additions (gate-clean,
// credits in ../imports-credits.json), APPENDED after every existing
// doodad so all prior ids stay byte-stable.
// ViaductBent (D019): the gate flagged Sol's crosshead as 86 TOTAL span —
// verified here against the in-house TrackSegment: its deck is 160 wide
// with 172-wide integrated crossheads, and its deck soffit sits at z170
// vs the bent's z150 top, so a straight pier-treatment swap would leave
// the deck overhanging a too-narrow, too-short bent. TrackSegment
// therefore keeps its integrated deck+piers, and the Sol bents stand in
// the INTER-SPAN GAPS along the berm centerline — the between-span pier
// rhythm every real viaduct has. Angle 0 = crosshead east-west,
// perpendicular to the line. Midpoints derive from the h019 loop below
// (y step 760, platform span skipped) so the coordinates always agree.
{
  const segYs = [];
  for (let y = -6000; y <= 6000; y += 760) {
    if (y > PLATFORM_RECT.y0 - 200 && y < PLATFORM_RECT.y1 + 200) continue;
    segYs.push(y);
  }
  for (let i = 1; i < segYs.length; i++) {
    if (segYs[i] - segYs[i - 1] !== 760) continue;   // the platform gap
    DX('D019', TRACK_X, segYs[i - 1] + 380, 0, 150);
  }
}
// StationClock (D01A): two clock totems at the platform ends beside the
// D000 canopies. Deliberate SD, not DX — the D000/D012 platform-dressing
// precedent (dressing the platform IS the point); solid:false, 120 tall
// (camera-safe), 24x24 footprint on the slab's west edge, clear of the
// boarding walk and the track-side door line.
SD('D01A', 4400, -430, 0);
SD('D01A', 4400, 430, 0);

// ---------------------- phase 2B: the Block 6A interior (tower-escape
// slice; APPENDED after every existing doodad so all prior ids stay
// byte-stable). WALL SKIN (Sol round 4, 2026-08-08): the blockers keep the
// PROVEN rock-rank geometry — same positions, same counts, same
// solid:true flags — but each post is re-typed from stock LTrc to an
// LTrc-BASED custom doodad class (D01B segment / objects-doodads.json)
// wearing SolHDBWallSegment.mdl. Pathing is UNCHANGED by construction:
// a clone inherits LTrc's pathing texture (the blocking authority — only
// dnam/dfil/dvar are overridden), doodad pathing footprints neither scale
// nor change with the model, and square footprints are rotation-proof.
// dvar is pinned to 1 on the clone: LTrc has multiple variations and the
// engine appends the variation digit to multi-variation doodad model
// paths — inherited dvar would make it load SolHDBWallSegment0.mdl,
// i.e. render NOTHING (gotcha 31's silent-miss class).
// Skin geometry: segments are 128 long and tile end-to-end (0 end-cap
// faces), so local-x scale 112/128 = 0.875 makes the 112-pitch posts
// tile EXACTLY — no co-planar overlap to z-fight. N/S runs lie at angle
// 0 (long axis E-W), W/E columns at angle 90. The 48-unit face slivers
// where perpendicular runs meet are masked by non-solid D01C corner
// columns (SolHDBWallCorner, scaled 3x) at the four pocket corners.
const TW = (x, y, horiz) => {
  // wall post: solid, proven blocking (see the block comment above)
  if (y < -5632 + 32) throw new Error(`tower wall below camera bounds: ${x},${y}`);
  if (!inTowerBand(x, y)) throw new Error(`tower wall outside the band: ${x},${y}`);
  // local-y scale 2 doubles the VISUAL slab depth (16 -> 32 units): the
  // playtest-3 verdict read the 16-unit skin as paper/cardboard from the
  // iso camera. Doodad scale is model-space (y = through-wall axis under
  // both angles) and pathing footprints neither scale nor change with the
  // model (the block comment above) — blocking geometry is byte-identical.
  doodads.push({
    type: 'D01B', position: [x, y, 0], angle: horiz ? 0 : 90,
    scale: [0.875, 2, 1],
    flags: { visible: true, solid: true, fixedZ: false },
    id: did++, variation: 0,
  });
};
for (const p of TOWER_POCKETS) {
  const x0 = p.cx - TOWER_HALF_W, x1 = p.cx + TOWER_HALF_W;
  const y0 = TOWER_Y - TOWER_HALF_H, y1 = TOWER_Y + TOWER_HALF_H;
  for (let x = x0; x <= x1; x += 112) { TW(x, y0, true); TW(x, y1, true); }   // S + N walls
  for (let y = y0 + 112; y <= y1 - 112; y += 112) { TW(x0, y, false); TW(x1, y, false); } // W + E
  // corner columns: decor patches over the run junctions (non-solid)
  for (const [cx, cy] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
    SD('D01C', cx, cy, 0, [3, 3, 1]);
  }
}
// interior dressing (non-solid Sol decor; the round-4 interior set):
// the 6F dead lift bank flush on the N wall (war3map.lua's TOWER[1].lift
// spark anchor sits just in front of its doors — keep in sync), 5F
// mailbox wall, 1F void-deck pillars + bike rack at the exit mouth.
// 6F dead lift bank: scaled up 1.9x/1.6x (playtest-3: it read TINY against
// the 840-unit wall run) and pulled to the thickened N wall's interior
// face (y -5012: wall face -4996 + scaled 16-unit half-depth). The
// war3map.lua TOWER[1].lift spark anchor at (-3760,-5040) stays ~12 in
// front of the scaled doors — still in sync.
SD('D01E', -3760, -5012, 0, [1.9, 1.6, 1]);
SD('D014', -2600, -5100, 0);            // 5F: corridor mailbox wall
SD('D013', 1400, -5100, 0);             // 1F: void-deck pillar row
SD('D015', 1860, -5150, 90);            // 1F: bike rack by the exit

// ---- Sol round-4 corridor dressing (2026-08-08, all non-solid decor,
// APPENDED last so every prior doodad id stays byte-stable). The tower
// pockets get their interior read: flat doors in a decor rhythm along the
// corridor walls, stairwell flights hugging the west/east walls at every
// arrival/door (the teleport fiction made visible), tube lights on the
// ceiling of the LIT floors only (6F/5F/1F — dark floors 4F/3F/2F stay
// dark until their DB box, and map-placed doodads cannot be shown/hidden
// from script, so the tubes are static and honest: no glow where the
// fiction says none), and two-three covered bodies as somber texture.
const TOWER_WALL_N = TOWER_Y + TOWER_HALF_H;    // -4980 (wall centerline)
const TOWER_WALL_S = TOWER_Y - TOWER_HALF_H;    // -5540
const TD = (type, x, y, angle, scale) => {
  if (!inTowerBand(x, y)) throw new Error(`tower decor outside the band: ${x},${y}`);
  SD(type, x, y, angle, scale);
};
// flat doors flush on the wall interior faces (door slab is 12 deep; the
// N-wall row faces south = angle 0, the S-wall row faces north = 180).
// Offset 24 = the thickened wall's 16-unit half-depth + the door's 6-unit
// half-depth + 2 clearance (was 14 against the old 8-unit half-depth).
for (const [dx2] of [[-3480], [-3200], [-2560], [-2280], [-1520], [-480], [480]]) {
  TD('D01D', dx2, TOWER_WALL_N - 24, 0);
}
for (const [dx2] of [[-3060], [-2480], [-2160], [-1280]]) {
  TD('D01D', dx2, TOWER_WALL_S + 24, 180);
}
// stairwell flights: one against the east wall at every stair DOOR
// (pockets 6F..2F), one against the west wall at every ARRIVAL (5F..1F);
// the flight rises INTO the wall it hugs, reading as the next half-turn
for (const p of TOWER_POCKETS.slice(0, 5)) TD('D01F', p.cx + 370, TOWER_Y, 0);
for (const p of TOWER_POCKETS.slice(1)) TD('D01F', p.cx - 370, TOWER_Y, 180);
// ceiling tube lights (fixedZ at z 128, just under the 140 wall top;
// underglow faces down per the model) — LIT floors only, see above
for (const p of [TOWER_POCKETS[0], TOWER_POCKETS[1], TOWER_POCKETS[5]]) {
  for (const ox of [-250, 0, 250]) {
    if (!inTowerBand(p.cx + ox, TOWER_Y)) throw new Error('tube light outside the band');
    doodads.push({
      type: 'D01G', position: [p.cx + ox, TOWER_Y, 128], angle: 0,
      scale: [1, 1, 1],
      flags: { visible: true, solid: false, fixedZ: true },
      id: did++, variation: 0,
    });
  }
}
// covered bodies: the neighbours who waited for the lift, the one nobody
// went back for in the dark, the one at the exit who almost made it
TD('D01H', -3620, -5090, 320);          // 6F: by the dead lift
TD('D01H', -1300, -5340, 40);           // 4F: the dark corridor
TD('D01H', 1210, -5150, 290);           // 1F: the void deck

// ---- playtest-3 interior-credibility pass (2026-08-08, APPENDED LAST so
// every prior doodad id stays byte-stable). FLOOR SLABS: one generated
// unshaded concrete slab per pocket (800x520, 4 tall — inside the
// thickened walls' interior faces at +-404/+-264) so the floor reads as a
// building slab in ANY lighting: the map is permanent night and terrain
// tiles both blend at edges and go near-black under night ambient. LIT
// floors (6F/5F/1F — the floors whose tube lights are on) get the
// mid-concrete D01I slab; DARK floors (4F/3F/2F) get the near-black D01J
// slab, so the lit-vs-dark floor fiction survives the fix. Non-solid,
// z 0 (top face at 4): pathing untouched.
const SLAB_LIT = new Set(['6f', '5f', '1f']);
for (const p of TOWER_POCKETS) {
  TD(SLAB_LIT.has(p.key) ? 'D01I' : 'D01J', p.cx, TOWER_Y, 0);
}

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

// hawker centre: the building, six stall tables in two tight STALL ROWS
// under the pavilion mouth (phase 2B placement-coherence pass: tables
// live in stall rows, not loose on the forecourt lawn), three civilians
U('h014', HAWKER.x, HAWKER.y + 260, P_PASSIVE);
for (let i = 0; i < 6; i++) {
  U('n024', HAWKER.x - 260 + (i % 3) * 260, HAWKER.y - 60 - Math.floor(i / 3) * 200, P_PASSIVE);
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

// Phase 2A (the fun transplant, DESIGN-WALKTHROUGH.md): the four CLASS
// CIRCLES — a statue of each class stands on its circle; walking a
// survivor onto the rect transforms them (chat -class is gone, gotcha
// 33). PHASE 2B moved them INTO the 6F corridor (you pick your neighbour
// identity as you flee your flat); same unit slots/ids, new positions.
// Plus the PROVISION SHOP (goblin-merchant base, Merchant.mdl — tools
// priced in clips) at the void deck. APPENDED after everything above so
// all existing unit ids stay byte-stable.
const CLASS_CIRCLES = [
  ['h000', -3560, -5420],   // Heartlander
  ['h001', -3420, -5420],   // Auxiliary Police Officer
  ['h002', -3280, -5420],   // Paramedic
  ['h003', -3140, -5420],   // Town Council Technician
];
for (const [t, x, y] of CLASS_CIRCLES) U(t, x, y, P_PASSIVE);
U('h01H', -140, -420, P_PASSIVE);  // the Provision Shop

// ---- phase 2B: Block 6A interior units (APPENDED LAST — ids stable) ----
// Furniture goes where furniture lives (playtest-2 placement verdict):
// every interior prop sits inside its pocket; the encounters mirror
// war3map.lua's TOWER table and DESIGN-WALKTHROUGH.md's floor beats.
// Sol round-4 re-art note (2026-08-08): the interior FLAT furniture slots
// are re-pointed to the round-4 flat-furniture classes (n02A bed / n02B
// wardrobe / n02C kitchen / n02D TV / n02E altar) IN PLACE — same
// positions, same unit-id order, and each new class keeps its slot's
// ORIGINAL loot kind in war3map.lua's PROP_KINDS, so rummage proximity,
// PropRec registration order and every seeded draw are byte-stable. The
// 3F blocker group and the tower benches STAY n020/n021 — tests select
// them by type (tower-escape/tower-activity), and a bench barricade is
// the right fiction anyway.
// 6F corridor: the dead neighbour's flat (wardrobe holds the seeded draw;
// the guaranteed Parang is a ground item placed by main()), one riser.
U('n02B', -3400, -5100, P_PASSIVE);   // 6F: the neighbour's wardrobe (>250 from every sloc; locker slot -> "locker" loot kind kept)
U('n020', -3260, -5380, P_PASSIVE);   // 6F: corridor bench
U('u000', -3300, -5160, P_HORDE);     // 6F: what's left of the neighbour
// 5F flat warren: rummage-rich, the trapped neighbour (the rescue beat) —
// the full flat set: bed, wardrobe, TV console, kitchen unit, the altar
U('n02A', -2780, -5400, P_PASSIVE);   // bed frame (bench slot)
U('n02B', -2700, -5120, P_PASSIVE);   // wardrobe (locker slot)
U('n02D', -2340, -5400, P_PASSIVE);   // TV console (desk slot)
U('n02C', -2260, -5120, P_PASSIVE);   // kitchen unit (table slot)
U('n02E', -2060, -5300, P_PASSIVE);   // family altar (dumpster slot)
U('n000', -2200, -5100, P_VICTIM);    // 5F: Uncle Heng, trapped
U('u000', -2560, -5260, P_HORDE);
U('u001', -2140, -5180, P_HORDE);
// 4F dark corridor: no working lights — watchfire country; the Molotov
// for the nest floor is a ground item placed by main(). Two search pulls
// so the dark asks: light it, risk it, or push on (activity density)
U('n022', -1660, -5400, P_PASSIVE);
U('n023', -1150, -5150, P_PASSIVE);
U('u000', -1420, -5140, P_HORDE);
U('u000', -1120, -5380, P_HORDE);
// 3F blocked landing: a furniture barricade squats on the stair door —
// war3map.lua registers props in the blocker zone and refuses the door
// while any stand (smash through: loud, or shove past: impossible)
U('n021', -140, -5260, P_PASSIVE);    // 3F blockers (zone x -240..-40)
U('n020', -140, -5160, P_PASSIVE);
U('n020', -140, -5360, P_PASSIVE);
U('n020', -700, -5120, P_PASSIVE);    // 3F: a bench clear of the barricade
U('u001', -520, -5200, P_HORDE);
// 2F nest floor: burn it or sneak past — plus two search pulls competing
// with the nest for your attention (activity density)
U('h018', 560, -5140, P_HORDE);       // 2F rat-king nest
U('n021', 300, -5400, P_PASSIVE);
U('n020', 900, -5140, P_PASSIVE);
U('u000', 400, -5380, P_HORDE);
U('u002', 760, -5320, P_HORDE);       // a sprinter naps by the chute
// 1F void deck interior: the final fight, then the rain
U('u000', 1380, -5180, P_HORDE);
U('u000', 1520, -5380, P_HORDE);
U('u001', 1700, -5160, P_HORDE);
U('u000', 1820, -5300, P_HORDE);
U('n020', 1300, -5400, P_PASSIVE);    // 1F: the last bench before outside
U('n022', 1850, -5400, P_PASSIVE);    // 1F: the storeroom by the exit
// A1 darkness: each dark floor (4F/3F/2F) carries a DB BOX — flip it by
// standing 5s (lights the floor, hums +loudness) or leave it dark and
// pay in time and extra bodies. Coordinates mirror war3map.lua's
// TOWER[].breaker fields — keep in sync.
U('h01K', -1750, -5150, P_PASSIVE);   // 4F DB box
U('h01K', -750, -5380, P_PASSIVE);    // 3F DB box
U('h01K', 140, -5390, P_PASSIVE);     // 2F DB box

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
// phase 2A class-circle rects (one per statue above; walk in = transform)
// — phase 2B: the circles live in the 6F corridor, rects ±90 so the four
// stay distinct at the tighter interior pitch
const CIRCLE_NAMES = ['PickHeartlander', 'PickPolice', 'PickParamedic', 'PickTech'];
CLASS_CIRCLES.forEach(([, cx, cy], i) => {
  regions.push(region(CIRCLE_NAMES[i],
    { x0: cx - 70, y0: cy - 70, x1: cx + 70, y1: cy + 70 },
    [90, 200, 255]));
});

// phase 2B stairwell doors (trigger teleports; APPENDED after every
// existing region so prior ids stay stable). DoorA..DoorE lead down one
// floor each; TowerExit steps out into the void deck rain.
const DOOR_NAMES = ['TowerDoorA', 'TowerDoorB', 'TowerDoorC', 'TowerDoorD', 'TowerDoorE'];
TOWER_POCKETS.slice(0, 5).forEach((p, i) => {
  const d = doorOf(p);
  regions.push(region(DOOR_NAMES[i],
    { x0: d.x - 60, y0: d.y - 60, x1: d.x + 60, y1: d.y + 60 },
    [255, 160, 60]));
});
{
  const d = doorOf(TOWER_POCKETS[5]);
  regions.push(region('TowerExit',
    { x0: d.x - 60, y0: d.y - 60, x1: d.x + 60, y1: d.y + 60 },
    [120, 255, 120]));
}
// A3 rubbish-chute mouths (6F/5F/4F/3F -> the 2F bin alcove at 340,-5080;
// war3map.lua's CHUTE_LANDING mirrors it): instant descent, bruising,
// LOUD, skips the floors between. Placed clear of every prop/spawn.
const CHUTES = [
  ['ChuteA', -3660, -5080], ['ChuteB', -2100, -5050],
  ['ChuteC', -1660, -5060], ['ChuteD', -560, -5050],
];
for (const [nm, cxx, cyy] of CHUTES) {
  regions.push(region(nm,
    { x0: cxx - 40, y0: cyy - 40, x1: cxx + 40, y1: cyy + 40 },
    [255, 220, 90]));
}

// ------------------------------------------------- placement-coherence
// asserts (playtest-2: "things are placed kind of nonsensically").
// Furniture lives WHERE FURNITURE LIVES: every searchable furniture prop
// (bench/dumpster/locker/desk/table) must sit inside a tower pocket or
// within reach of a building anchor (tower foot = void deck, hawker
// forecourt, clinic, station house, spawn deck, shop). Street classes
// (cars, vans, phones, bus stops, lamps) are exempt — they live on the
// road shoulders by design.
{
  const FURNITURE = new Set(['n020', 'n021', 'n022', 'n023', 'n024']);
  const anchors = [[SPAWN.x, SPAWN.y], [HAWKER.x, HAWKER.y],
    [CLINIC.x, CLINIC.y], [STATION.x, STATION.y], [-140, -420]];
  for (const d of DISTRICTS) for (const [, tx, ty] of d.towers) anchors.push([tx, ty]);
  for (const [, tx, ty] of SOL_TOWERS) anchors.push([tx, ty]);
  for (const u of units) {
    if (!FURNITURE.has(u.type)) continue;
    const [x, y] = u.position;
    const pocketed = TOWER_POCKETS.some((p) =>
      Math.abs(x - p.cx) <= TOWER_HALF_W - 40 && Math.abs(y - TOWER_Y) <= TOWER_HALF_H - 40);
    const anchored = anchors.some(([ax, ay]) => Math.hypot(x - ax, y - ay) <= 460);
    if (!pocketed && !anchored) {
      throw new Error(`furniture on a lawn: ${u.type} at ${x},${y}`);
    }
  }
  // tower geometry must stay inside the camera bounds margin
  for (const p of TOWER_POCKETS) {
    const d = doorOf(p), a = arriveOf(p);
    for (const pt of [d, a]) {
      if (pt.x < -5376 || pt.x > 5376 || pt.y < -5632 || pt.y > 5120) {
        throw new Error(`tower point outside camera bounds: ${pt.x},${pt.y}`);
      }
    }
  }
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
