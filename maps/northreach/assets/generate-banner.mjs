#!/usr/bin/env node
// generate-banner.mjs — reproducibly generates
// imports/war3mapImported/FounderBanner.mdx
//
// The settlement-claim standard planted when a Northreach settlement is
// founded: a tall dark pole with a crossbar and a hanging team-color banner
// cloth ending in a swallowtail cut. Cloth is pure ReplaceableId 1 (player
// team color); the woodwork is the same texture tinted near-black. Used by
// the custom unit 'n000' (Settlement Banner, objects-units.json,
// umdl = war3mapImported\FounderBanner.mdx), created by war3map.lua's
// FoundSettlement().
//
//   node maps/northreach/assets/generate-banner.mjs

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { quad, merge, buildModel } from './mdl-lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'imports', 'war3mapImported', 'FounderBanner.mdx');

// --- pole + crossbar (wood geoset, crossed TwoSided planes) ------------------
const poleA = quad([-3, 0, 0], [3, 0, 0], [3, 0, 190], [-3, 0, 190]);
const poleB = quad([0, -3, 0], [0, 3, 0], [0, 3, 190], [0, -3, 190]);
const crossbar = quad([0, -4, 176], [0, 54, 176], [0, 54, 182], [0, -4, 182]);
const wood = merge(poleA, poleB, crossbar);

// --- banner cloth (team color geoset) ----------------------------------------
// hangs from the crossbar; bottom edge cut into a swallowtail
const clothTop = quad([0, 5, 118], [0, 51, 118], [0, 51, 174], [0, 5, 174]);
const tailL = { verts: [[0, 5, 118], [0, 21, 118], [0, 13, 96]], faces: [[0, 1, 2]] };
const tailR = { verts: [[0, 35, 118], [0, 51, 118], [0, 43, 96]], faces: [[0, 1, 2]] };
const cloth = merge(clothTop, tailL, tailR);

buildModel({
  name: 'FounderBanner',
  extents: { min: [-8, -8, 0], max: [8, 56, 195], radius: 200 },
  geosets: [
    { name: 'Pole', mesh: wood, tint: [0.28, 0.22, 0.15], additive: false },
    { name: 'Cloth', mesh: cloth, tint: null, additive: false },
  ],
  outFile: OUT,
});
