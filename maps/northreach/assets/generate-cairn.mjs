#!/usr/bin/env node
// generate-cairn.mjs — reproducibly generates
// imports/war3mapImported/WaystoneCairn.mdx
//
// A stone waystone cairn marking each Northreach expansion site: three
// stacked, slightly offset gray stone blocks with a small additive
// team-color rune diamond floating above. Stones are ReplaceableId 1 tinted
// neutral gray (grayscale, so channel order is moot); the rune keeps full
// team color with an Additive layer. Used by the custom unit 'n001'
// (Waystone Cairn, objects-units.json,
// umdl = war3mapImported\WaystoneCairn.mdx), preplaced neutral-passive at
// every expansion site (units.json).
//
//   node maps/northreach/assets/generate-cairn.mjs

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { box, merge, buildModel } from './mdl-lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'imports', 'war3mapImported', 'WaystoneCairn.mdx');

// --- stacked stones (gray geoset) --------------------------------------------
const base = box(-30, 30, -30, 30, 0, 20);
const mid = box(-17, 25, -24, 18, 20, 37);
const top = box(-15, 9, -10, 14, 37, 50);
const stones = merge(base, mid, top);

// --- floating rune diamond (additive team-color geoset) -----------------------
const rune = {
  verts: [
    [0, 0, 88],   // top apex
    [0, 0, 58],   // bottom apex
    [10, 0, 73], [0, 10, 73], [-10, 0, 73], [0, -10, 73],
  ],
  faces: [
    [0, 2, 3], [0, 3, 4], [0, 4, 5], [0, 5, 2],
    [1, 3, 2], [1, 4, 3], [1, 5, 4], [1, 2, 5],
  ],
};

buildModel({
  name: 'WaystoneCairn',
  extents: { min: [-34, -34, 0], max: [34, 34, 92], radius: 100 },
  geosets: [
    { name: 'Stones', mesh: stones, tint: [0.55, 0.56, 0.6], additive: false },
    { name: 'Rune', mesh: rune, tint: null, additive: true },
  ],
  outFile: OUT,
});
