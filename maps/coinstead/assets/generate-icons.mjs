#!/usr/bin/env node
// generate-icons.mjs — Coinstead's generated command-button icons, authored
// with lib/icon.js (the pure-Node 64x64 icon pipeline; docs/ASSETS.md
// "Generated icons"). Deterministic output; the beveled border frame is
// baked as the LAST pass (the game does not composite button borders) and
// the DISBTN twin is auto-derived (desaturate + multiply 0.5).
//
//   node maps/coinstead/assets/generate-icons.mjs
//
// Writes into ../imports/ReplaceableTextures/CommandButtons[Disabled]/ —
// the path under imports/ IS the archive path, and uico references the
// exact imported extension (BLP via Pillow; 32-bit TGA fallback + warning
// when Pillow is absent — textures get no extension swap in-game).
//
//   BTNOrepit — the Orepit harvester (report §6): dark pit mouth sunk in
//               stone, amber raw-ore glints, the crane jib overhead.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  createCanvas, gradient, rect, disc, stroke, noise, borderFrame, writeIconImports,
} = require('../../../lib/icon.js');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MAP = path.join(HERE, '..');

// ---------------------------------------------------------------- BTNOrepit
const c = createCanvas(64);
gradient(c, [64, 58, 50], [28, 24, 22]);            // dusty ground falling into shade
disc(c, 32, 36, 22, [52, 48, 44]);                  // spoil apron
disc(c, 32, 36, 17, [24, 21, 20]);                  // pit ring
disc(c, 32, 36, 12, [10, 8, 9]);                    // the dark pit mouth
disc(c, 27, 32, 2.4, [255, 190, 70]);               // raw ore glints catching light
disc(c, 37, 40, 2.0, [230, 160, 50]);
disc(c, 31, 42, 1.6, [200, 135, 40]);
stroke(c, 12, 14, 44, 10, 3, [30, 26, 24]);         // crane jib crossing overhead
stroke(c, 12, 14, 12, 30, 3, [38, 33, 30]);         // crane post
stroke(c, 40, 11, 40, 24, 1.4, [70, 62, 55]);       // hoist line down to the pit
rect(c, 36, 24, 44, 30, [45, 40, 36]);              // ore bucket
noise(c, 0.10, 1007);                               // grit (seeded — deterministic)
borderFrame(c);                                     // ALWAYS last

const r = writeIconImports(MAP, 'Orepit', c.data);
for (const w of r.warnings) console.warn('WARN:', w);
console.log(`coinstead icons regenerated: BTNOrepit + DISBTNOrepit (${r.format})`);
