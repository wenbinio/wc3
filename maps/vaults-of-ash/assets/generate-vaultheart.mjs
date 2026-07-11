#!/usr/bin/env node
// generate-vaultheart.mjs — reproducibly generates
// imports/war3mapImported/VaultHeart.mdx
//
// The Vault Heart boss: a large octahedral crystal hovering over a cracked
// stone base, wrapped in two additive team-color energy shells (inner
// bright core + outer faint aura) that read as a pulse under the game's
// team-color glow. Used by custom unit 'u008' (Vault Heart,
// objects-units.json, umdl = war3mapImported\VaultHeart.mdl — gotcha 22).
// Sanity bar: CLAUDE.md gotcha 14, enforced by mdl-lib's buildModel.
//
//   node maps/vaults-of-ash/assets/generate-vaultheart.mjs

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { box, merge, buildModel } from '../../northreach/assets/mdl-lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'imports', 'war3mapImported', 'VaultHeart.mdx');

// octahedron helper: apexes at z0/z1, square waist at zm with half-width w
function octa(w, z0, zm, z1) {
  return {
    verts: [
      [0, 0, z1],                       // top apex
      [0, 0, z0],                       // bottom apex
      [w, 0, zm], [0, w, zm], [-w, 0, zm], [0, -w, zm],
    ],
    faces: [
      [0, 2, 3], [0, 3, 4], [0, 4, 5], [0, 5, 2],
      [1, 3, 2], [1, 4, 3], [1, 5, 4], [1, 2, 5],
    ],
  };
}

// --- cracked stone base (dark geoset) ---------------------------------------
const slabA = box(-70, 70, -70, 70, 0, 16);
const slabB = box(-46, 46, -46, 46, 16, 30);
const shardL = box(-64, -40, -20, 20, 16, 52);
const shardR = box(40, 64, -16, 24, 16, 44);
const base = merge(slabA, slabB, shardL, shardR);

// --- the heart crystal (solid, deep red tint) --------------------------------
const crystal = octa(52, 40, 130, 230);

// --- pulsing energy shells (additive team-color geosets) ---------------------
const coreShell = octa(64, 32, 130, 242);
const auraShell = octa(84, 18, 130, 262);

buildModel({
  name: 'VaultHeart',
  extents: { min: [-90, -90, 0], max: [90, 90, 270], radius: 290 },
  geosets: [
    { name: 'Base', mesh: base, tint: [0.28, 0.26, 0.30], additive: false },
    { name: 'Crystal', mesh: crystal, tint: [0.75, 0.18, 0.22], additive: false },
    { name: 'CoreShell', mesh: coreShell, tint: null, additive: true },
    { name: 'AuraShell', mesh: auraShell, tint: null, additive: true },
  ],
  outFile: OUT,
});
