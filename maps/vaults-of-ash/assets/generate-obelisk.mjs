#!/usr/bin/env node
// generate-obelisk.mjs — reproducibly generates
// imports/war3mapImported/OmenObelisk.mdx
//
// The Omen Obelisk that fronts every vault door: a tapered dark stone
// pillar with an additive team-color glow band near the top (the omen
// light). Used by custom unit 'n001' (Omen Obelisk, objects-units.json,
// umdl = war3mapImported\OmenObelisk.mdl — model FIELDS take .mdl even for
// an .mdx member, CLAUDE.md gotcha 22). Sanity bar: CLAUDE.md gotcha 14,
// enforced by mdl-lib's buildModel (0 errors / 0 severes).
//
//   node maps/vaults-of-ash/assets/generate-obelisk.mjs

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { box, merge, buildModel } from '../../northreach/assets/mdl-lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'imports', 'war3mapImported', 'OmenObelisk.mdx');

// --- tapered pillar (dark stone geoset): base plinth + 3 shrinking tiers ---
const plinth = box(-34, 34, -34, 34, 0, 14);
const tier1 = box(-24, 24, -24, 24, 14, 70);
const tier2 = box(-18, 18, -18, 18, 70, 130);
const tier3 = box(-11, 11, -11, 11, 130, 182);
const cap = box(-14, 14, -14, 14, 182, 196);
const pillar = merge(plinth, tier1, tier2, tier3, cap);

// --- omen glow band (additive team-color geoset) wrapping the upper tier ---
const band = box(-14, 14, -14, 14, 140, 162);

buildModel({
  name: 'OmenObelisk',
  extents: { min: [-38, -38, 0], max: [38, 38, 200], radius: 210 },
  geosets: [
    { name: 'Pillar', mesh: pillar, tint: [0.32, 0.30, 0.34], additive: false },
    { name: 'OmenBand', mesh: band, tint: null, additive: true },
  ],
  outFile: OUT,
});
