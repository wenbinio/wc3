#!/usr/bin/env node
// generate-sealstone.mjs — reproducibly generates
// imports/war3mapImported/SealstoneDoor.mdx
//
// The Sealstone door frame standing on the hub's north edge: two heavy
// stone jambs, a lintel across the top, and an additive team-color seal
// membrane filling the doorway (the "unbroken seal" the party steps
// through). Used by custom unit 'n000' (Sealstone Door,
// objects-units.json, umdl = war3mapImported\SealstoneDoor.mdl —
// gotcha 22). Sanity bar: CLAUDE.md gotcha 14, enforced by mdl-lib.
//
//   node maps/vaults-of-ash/assets/generate-sealstone.mjs

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { box, quad, merge, buildModel } from '../../northreach/assets/mdl-lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'imports', 'war3mapImported', 'SealstoneDoor.mdx');

// --- stone frame (gray geoset): jambs + lintel + step ------------------------
const jambL = box(-70, -42, -18, 18, 0, 150);
const jambR = box(42, 70, -18, 18, 0, 150);
const lintel = box(-78, 78, -20, 20, 150, 182);
const keystone = box(-16, 16, -22, 22, 182, 206);
const step = box(-78, 78, -26, 26, 0, 8);
const frame = merge(jambL, jambR, lintel, keystone, step);

// --- seal membrane (additive team-color geoset) filling the doorway ----------
const membrane = quad([-42, 0, 8], [42, 0, 8], [42, 0, 150], [-42, 0, 150]);

buildModel({
  name: 'SealstoneDoor',
  extents: { min: [-82, -30, 0], max: [82, 30, 210], radius: 220 },
  geosets: [
    { name: 'Frame', mesh: frame, tint: [0.35, 0.33, 0.36], additive: false },
    { name: 'Seal', mesh: membrane, tint: null, additive: true },
  ],
  outFile: OUT,
});
