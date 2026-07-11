#!/usr/bin/env node
// generate-longship.mjs — reproducibly generates
// imports/war3mapImported/NorthLongship.mdx
//
// A stylized northern longship: wooden hull with raised prow and stern,
// mast + yard spar, and a big square sail. The sail is pure ReplaceableId 1
// (player team color); the woodwork is the same texture tinted dark brown
// via per-geoset static GeosetAnim colors. Used by the custom unit 'h001'
// (Longship, objects-units.json, umdl = war3mapImported\NorthLongship.mdx).
// Faces +X (facing angle 0 = east), like every WC3 unit model.
//
//   node maps/northreach/assets/generate-longship.mjs
//
// Sanity bar (mdx-m3-viewer sanityTest, 0 errors / 0 severes) is enforced
// by mdl-lib.buildModel at generation time and again by validate-map and
// test/northreach.test.js on the committed binary.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { box, quad, merge, buildModel } from './mdl-lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'imports', 'war3mapImported', 'NorthLongship.mdx');

// --- hull + prow/stern wedges + mast + yard (wood geoset) -------------------
const hullBox = box(-60, 60, -26, 26, 8, 34);
// bow wedge: front face corners -> tip
const bow = {
  verts: [[60, -26, 8], [60, 26, 8], [60, -26, 34], [60, 26, 34], [108, 0, 46]],
  faces: [[0, 1, 4], [2, 3, 4], [0, 2, 4], [1, 3, 4]],
};
// stern wedge: rear face corners -> tip
const stern = {
  verts: [[-60, -26, 8], [-60, 26, 8], [-60, -26, 34], [-60, 26, 34], [-108, 0, 42]],
  faces: [[0, 1, 4], [2, 3, 4], [0, 2, 4], [1, 3, 4]],
};
// mast: two crossed planes (TwoSided material, so single quads suffice)
const mastA = quad([-3, 0, 30], [3, 0, 30], [3, 0, 150], [-3, 0, 150]);
const mastB = quad([0, -3, 30], [0, 3, 30], [0, 3, 150], [0, -3, 150]);
// yard spar the sail hangs from
const yard = quad([0, -44, 136], [0, 44, 136], [0, 44, 142], [0, -44, 142]);
const wood = merge(hullBox, bow, stern, mastA, mastB, yard);

// --- sail (team color geoset) ------------------------------------------------
// slightly ahead of the mast, spanning the yard, hanging to gunwale height
const sail = quad([7, -38, 64], [7, 38, 64], [7, 38, 136], [7, -38, 136]);

buildModel({
  name: 'NorthLongship',
  extents: { min: [-110, -46, 0], max: [110, 46, 155], radius: 160 },
  geosets: [
    { name: 'Hull', mesh: wood, tint: [0.45, 0.31, 0.18], additive: false },
    { name: 'Sail', mesh: sail, tint: null, additive: false },
  ],
  outFile: OUT,
});
