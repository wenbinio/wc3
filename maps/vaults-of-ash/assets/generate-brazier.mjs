#!/usr/bin/env node
// generate-brazier.mjs — reproducibly generates
// imports/war3mapImported/EmberBrazier.mdx
//
// The Ember Brazier marking boon pedestals and shrine plates: a squat
// stone bowl on a plinth with two crossed additive team-color flame planes
// rising from it. Used by custom units 'n002' (Ember Brazier) and 'n003'
// (Ashen Shrine, scaled up) — objects-units.json,
// umdl = war3mapImported\EmberBrazier.mdl (gotcha 22). Sanity bar:
// CLAUDE.md gotcha 14, enforced by mdl-lib's buildModel.
//
//   node maps/vaults-of-ash/assets/generate-brazier.mjs

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { box, quad, merge, buildModel } from '../../northreach/assets/mdl-lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'imports', 'war3mapImported', 'EmberBrazier.mdx');

// --- stone bowl (gray geoset): plinth + stem + flared bowl rim -------------
const plinth = box(-26, 26, -26, 26, 0, 10);
const stem = box(-10, 10, -10, 10, 10, 34);
const bowl = box(-24, 24, -24, 24, 34, 50);
const hollow = box(-18, 18, -18, 18, 50, 54); // inner lip
const stone = merge(plinth, stem, bowl, hollow);

// --- crossed flame planes (additive team-color geoset) ---------------------
// two vertical quads in an X; additive+unshaded reads as fire glow
const flameA = quad([-20, 0, 46], [20, 0, 46], [12, 0, 108], [-12, 0, 108]);
const flameB = quad([0, -20, 46], [0, 20, 46], [0, 12, 108], [0, -12, 108]);
const flames = merge(flameA, flameB);

buildModel({
  name: 'EmberBrazier',
  extents: { min: [-30, -30, 0], max: [30, 30, 112], radius: 120 },
  geosets: [
    { name: 'Bowl', mesh: stone, tint: [0.38, 0.36, 0.38], additive: false },
    { name: 'Flames', mesh: flames, tint: null, additive: true },
  ],
  outFile: OUT,
});
