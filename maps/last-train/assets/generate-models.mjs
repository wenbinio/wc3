#!/usr/bin/env node
// generate-models.mjs — Last Train from Yio Chu Kang's generated identity
// models, authored with assets/mdl-lib.mjs (the northreach/coinstead
// known-good MDL library; CLAUDE.md gotchas 14/19). Every model passes
// mdx-m3-viewer's sanityTest at generation time (mdl-lib self-checks;
// build-map re-enforces the same bar on imports/) and embeds nothing
// Blizzard-authored (docs/ASSETS.md). The estate's HUMAN-scale pieces
// (citizens, zombies, cars, furniture) are community models — see
// ../imports-credits.json; these generated pieces are the map's signature
// infrastructure no community pack depicts:
//
//   node maps/last-train/assets/generate-models.mjs
//
//   MRTTrain.mdx        — the map's signature: three box-body train cars in
//                         the North-South line livery (red cab band, white
//                         body, window strip), coupled, on wheel skirts
//   StationPlatform.mdx — platform slab + twin shelter canopy on columns +
//                         yellow warning line ("mind the platform gap")
//   TrackSegment.mdx    — one span of elevated viaduct: two grey piers, a
//                         deck slab, twin rails (repeated along the line)
//   HDBBlockA.mdx       — a 10-storey HDB slab block: banded window
//                         floors, void deck columns at street level, and a
//                         TEAM-COLOR roof water tank (untinted = raw
//                         ReplaceableId 1, the northreach/coinstead trick)
//   HDBBlockB.mdx       — the point-block variant: squarer plan, corridor
//                         band, different roofline (visual variety so the
//                         estate never reads as a clone crowd, gotcha 31)
//   Substation.mdx      — the generator objective: fenced yard, transformer
//                         box, insulator posts, an additive amber live-lamp
//   Barricade.mdx       — the craftable barricade: crossed planks over a
//                         frame with sandbag feet

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { box, quad, merge, buildModel } from './mdl-lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'imports', 'war3mapImported');

// palette (plain RGB — mdl-lib handles the MDX B,G,R order, gotcha 19)
const CONCRETE = [0.62, 0.60, 0.56];
const CONCRETE_DARK = [0.42, 0.41, 0.39];
const WHITE_BODY = [0.88, 0.88, 0.90];
const MRT_RED = [0.78, 0.12, 0.12];
const WINDOW_DARK = [0.10, 0.12, 0.16];
const ROOF_GREY = [0.30, 0.30, 0.33];
const RAIL_IRON = [0.16, 0.16, 0.18];
const WARN_YELLOW = [0.95, 0.80, 0.10];
const HDB_CREAM = [0.82, 0.78, 0.70];
const HDB_BAND = [0.55, 0.65, 0.60];
const TIMBER = [0.50, 0.36, 0.22];
const TIMBER_DARK = [0.34, 0.25, 0.15];
const SANDBAG = [0.58, 0.52, 0.40];
const FENCE_GREY = [0.35, 0.35, 0.37];
const AMBER = [1.0, 0.72, 0.20];

// ------------------------------------------------------------- MRT train
// Three cars along the Y axis (the track runs north-south on the map).
function trainCar(y0, y1, cab) {
  const parts = [
    box(-52, 52, y0 + 6, y1 - 6, 26, 118),            // body shell
    box(-56, 56, y0 + 10, y1 - 10, 96, 104),          // roofline rib
  ];
  const m = merge(...parts);
  return m;
}
buildModel({
  name: 'MRTTrain',
  extents: { min: [-70, -430, 0], max: [70, 430, 150], radius: 470 },
  geosets: [
    { name: 'bodies', tint: WHITE_BODY, mesh: merge(
      trainCar(-420, -150), trainCar(-140, 140), trainCar(150, 420),
    ) },
    { name: 'windows', tint: WINDOW_DARK, mesh: merge(
      box(-54, 54, -400, -170, 62, 88),
      box(-54, 54, -120, 120, 62, 88),
      box(-54, 54, 170, 400, 62, 88),
    ) },
    { name: 'redband', tint: MRT_RED, mesh: merge(
      box(-55, 55, -424, -406, 30, 116),   // south cab face band
      box(-55, 55, 406, 424, 30, 116),     // north cab face band
      box(-54, 54, -400, 400, 40, 52),     // waist stripe (through couplers)
    ) },
    { name: 'roof', tint: ROOF_GREY, mesh: merge(
      box(-46, 46, -414, -156, 104, 122),
      box(-46, 46, -134, 134, 104, 122),
      box(-46, 46, 156, 414, 104, 122),
    ) },
    { name: 'skirts', tint: RAIL_IRON, mesh: merge(
      box(-44, 44, -404, -166, 0, 30),
      box(-44, 44, -124, 124, 0, 30),
      box(-44, 44, 166, 404, 0, 30),
      box(-20, 20, -150, -140, 60, 80),    // couplers
      box(-20, 20, 140, 150, 60, 80),
    ) },
    { name: 'headlight', tint: AMBER, additive: true, mesh: merge(
      box(-30, 30, -428, -422, 44, 60),
      box(-30, 30, 422, 428, 44, 60),
    ) },
  ],
  outFile: path.join(OUT, 'MRTTrain.mdx'),
});

// ------------------------------------------------------ station platform
buildModel({
  name: 'StationPlatform',
  extents: { min: [-190, -330, 0], max: [190, 330, 210], radius: 420 },
  geosets: [
    { name: 'slab', tint: CONCRETE, mesh: box(-180, 180, -320, 320, 0, 34) },
    { name: 'warnline', tint: WARN_YELLOW, mesh: box(140, 164, -320, 320, 34, 38) },
    { name: 'columns', tint: CONCRETE_DARK, mesh: merge(
      box(-90, -70, -300, -280, 34, 170), box(-90, -70, 280, 300, 34, 170),
      box(-90, -70, -90, -70, 34, 170), box(-90, -70, 70, 90, 34, 170),
    ) },
    { name: 'canopy', tint: ROOF_GREY, mesh: merge(
      box(-150, 60, -330, -30, 170, 190),
      box(-150, 60, 30, 330, 170, 190),
    ) },
    { name: 'signband', tint: MRT_RED, mesh: box(-150, -130, -330, 330, 150, 170) },
  ],
  outFile: path.join(OUT, 'StationPlatform.mdx'),
});

// -------------------------------------------------------- track segment
buildModel({
  name: 'TrackSegment',
  extents: { min: [-90, -260, 0], max: [90, 260, 240], radius: 380 },
  geosets: [
    { name: 'piers', tint: CONCRETE_DARK, mesh: merge(
      box(-40, 40, -240, -180, 0, 170),
      box(-40, 40, 180, 240, 0, 170),
    ) },
    { name: 'deck', tint: CONCRETE, mesh: merge(
      box(-80, 80, -256, 256, 170, 206),
      box(-88, -76, -256, 256, 206, 226),   // parapets
      box(76, 88, -256, 256, 206, 226),
    ) },
    { name: 'rails', tint: RAIL_IRON, mesh: merge(
      box(-34, -22, -256, 256, 206, 216),
      box(22, 34, -256, 256, 206, 216),
    ) },
  ],
  outFile: path.join(OUT, 'TrackSegment.mdx'),
});

// ------------------------------------------------------------ HDB blocks
// Slab block: long plan, window bands per floor, void deck at street level.
function windowBands(hx, hy, floors, z0, dz) {
  const parts = [];
  for (let i = 0; i < floors; i++) {
    const z = z0 + i * dz;
    parts.push(box(-hx - 2, hx + 2, -hy - 2, hy + 2, z + dz - 14, z + dz - 4));
  }
  return merge(...parts);
}
buildModel({
  name: 'HDBBlockA',
  extents: { min: [-230, -120, 0], max: [230, 120, 560], radius: 600 },
  geosets: [
    { name: 'voiddeck', tint: CONCRETE_DARK, mesh: merge(
      box(-215, -195, -95, -75, 0, 64), box(195, 215, -95, -75, 0, 64),
      box(-215, -195, 75, 95, 0, 64), box(195, 215, 75, 95, 0, 64),
      box(-75, -55, -95, -75, 0, 64), box(55, 75, -95, -75, 0, 64),
      box(-75, -55, 75, 95, 0, 64), box(55, 75, 75, 95, 0, 64),
      box(-225, 225, -105, 105, 64, 92),   // first slab over the void deck
    ) },
    { name: 'body', tint: HDB_CREAM, mesh: box(-220, 220, -100, 100, 92, 520) },
    { name: 'bands', tint: HDB_BAND, mesh: windowBands(220, 100, 9, 92, 46) },
    { name: 'roof', tint: CONCRETE, mesh: box(-228, 228, -108, 108, 520, 544) },
    // the roof water tank renders raw team color (untinted geoset)
    { name: 'tank', mesh: box(-60, 20, -50, 40, 544, 600) },
  ],
  outFile: path.join(OUT, 'HDBBlockA.mdx'),
});
buildModel({
  name: 'HDBBlockB',
  extents: { min: [-150, -150, 0], max: [150, 150, 640], radius: 640 },
  geosets: [
    { name: 'voiddeck', tint: CONCRETE_DARK, mesh: merge(
      box(-135, -115, -135, -115, 0, 64), box(115, 135, -135, -115, 0, 64),
      box(-135, -115, 115, 135, 0, 64), box(115, 135, 115, 135, 0, 64),
      box(-145, 145, -145, 145, 64, 92),
    ) },
    { name: 'body', tint: HDB_CREAM, mesh: box(-140, 140, -140, 140, 92, 580) },
    { name: 'corridor', tint: HDB_BAND, mesh: windowBands(140, 140, 10, 92, 48) },
    { name: 'stair', tint: CONCRETE, mesh: box(-60, 60, 120, 156, 92, 620) },
    { name: 'roof', tint: CONCRETE, mesh: box(-148, 148, -148, 148, 580, 604) },
    { name: 'tank', mesh: box(-40, 40, -60, 20, 604, 640) },
  ],
  outFile: path.join(OUT, 'HDBBlockB.mdx'),
});

// ------------------------------------------------------------ substation
buildModel({
  name: 'Substation',
  extents: { min: [-130, -130, 0], max: [130, 130, 190], radius: 280 },
  geosets: [
    { name: 'yard', tint: CONCRETE, mesh: box(-120, 120, -120, 120, 0, 12) },
    { name: 'fence', tint: FENCE_GREY, mesh: merge(
      box(-120, 120, -120, -112, 12, 70), box(-120, 120, 112, 120, 12, 70),
      box(-120, -112, -112, 112, 12, 70), box(112, 120, -40, 112, 12, 70),
      box(112, 120, -112, -60, 12, 70),   // gate gap on the east face
    ) },
    { name: 'transformer', tint: ROOF_GREY, mesh: merge(
      box(-70, 20, -60, 60, 12, 120),
      box(-90, -70, -30, 30, 12, 96),      // radiator fins block
    ) },
    { name: 'insulators', tint: WHITE_BODY, mesh: merge(
      box(-52, -40, -12, 0, 120, 168), box(-10, 2, -12, 0, 120, 168),
    ) },
    { name: 'livelamp', tint: AMBER, additive: true,
      mesh: box(40, 70, -16, 16, 90, 130) },
  ],
  outFile: path.join(OUT, 'Substation.mdx'),
});

// NOTE: the street-lamp model used to be generated here (Lamppost.mdx).
// The 2026-08-07 Sol ambience batch replaced it — n028 Street Lamp now uses
// war3mapImported\SolLampPost.mdx (richer additive lamp glow; provenance in
// ../imports-credits.json). The generator entry was removed WITH the file
// so this script keeps regenerating exactly what ships (assets doctrine).

// --------------------------------------------------------------- bus stop
buildModel({
  name: 'BusStop',
  extents: { min: [-150, -70, 0], max: [150, 70, 190], radius: 260 },
  geosets: [
    { name: 'kerb', tint: CONCRETE, mesh: box(-140, 140, -60, 60, 0, 10) },
    { name: 'posts', tint: FENCE_GREY, mesh: merge(
      box(-130, -118, -50, -38, 10, 160), box(118, 130, -50, -38, 10, 160),
      box(-130, -118, 38, 50, 10, 160), box(118, 130, 38, 50, 10, 160),
    ) },
    { name: 'bench', tint: TIMBER, mesh: box(-110, 110, 10, 44, 46, 58) },
    { name: 'roof', tint: MRT_RED, mesh: box(-146, 146, -66, 66, 160, 176) },
    { name: 'sign', tint: WHITE_BODY, mesh: box(126, 138, -58, -46, 160, 208) },
  ],
  outFile: path.join(OUT, 'BusStop.mdx'),
});

// ------------------------------------------------------------- barricade
buildModel({
  name: 'Barricade',
  extents: { min: [-110, -60, 0], max: [110, 60, 130], radius: 190 },
  geosets: [
    { name: 'frame', tint: TIMBER_DARK, mesh: merge(
      box(-100, -84, -20, 20, 0, 110), box(84, 100, -20, 20, 0, 110),
    ) },
    { name: 'planks', tint: TIMBER, mesh: merge(
      box(-104, 104, -14, -2, 30, 52),
      box(-104, 104, 2, 14, 62, 84),
      box(-104, 104, -8, 8, 94, 112),
    ) },
    { name: 'sandbags', tint: SANDBAG, mesh: merge(
      box(-108, -40, -52, -16, 0, 26), box(30, 106, 18, 54, 0, 26),
      box(-70, -10, 20, 52, 0, 24),
    ) },
  ],
  outFile: path.join(OUT, 'Barricade.mdx'),
});

console.log('last-train models regenerated: MRTTrain, StationPlatform, TrackSegment, HDBBlockA, HDBBlockB, Substation, BusStop, Barricade');
