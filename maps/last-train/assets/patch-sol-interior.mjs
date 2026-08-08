#!/usr/bin/env node
// patch-sol-interior.mjs — the RECORDED local modification (Legal doctrine:
// "local modifications are recorded per-file with the committed script that
// made them"; ledger entries in ../imports-credits.json) applied to Sol's
// round-4 Block 6A interior set after the 2026-08-08 playtest-3 verdict
// ("Looks goofy": the pocket walls rendered as flat BLACK slabs in-game).
//
// ROOT CAUSE: the map runs in PERMANENT NIGHT (SetTimeOfDay 22, scale 0,
// low blue fog). Sol's models use LIT materials (shading flags 0 or 0x10
// TwoSided only), so the night doodad ambient crushes their pale two-tone
// concrete to near-black — while every in-house mdl-lib model is Unshaded
// by construction and reads fine. This script makes the tower-EXCLUSIVE
// Sol interior pieces self-lit the same way:
//
//   - sets the Unshaded flag (0x1) on every material layer of:
//       SolHDBWallSegment, SolHDBWallCorner, SolHDBFlatDoor,
//       SolStairwellFlight, SolHDBLiftDead, SolCorpseCovered
//     (SolTubeLightFlicker already ships an Unshaded+Additive glow layer;
//     shared estate classes — mailbox/pillars/bike rack — are NOT touched:
//     they also dress estate void decks and keep Sol's authored look there)
//   - lifts the walls' pale face geoset-anim to a fixed brighter tone so
//     the corridor shell reads clearly against the night (absolute values,
//     so re-running the script is a no-op — idempotent by design)
//
// Geometry is untouched (the visual wall THICKNESS doubling is a doodad
// scale in generate-layout.mjs, not a model edit). Every patched file must
// re-pass mdx-m3-viewer's sanityTest at 0 errors / 0 severes or this
// script fails before writing anything permanent.
//
//   node maps/last-train/assets/patch-sol-interior.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMP = path.join(HERE, '..', 'imports', 'war3mapImported');
const REPO = path.join(HERE, '..', '..', '..');
const wm = require(path.join(REPO, 'node_modules', 'war3-model'));
const { sanityCheckModel } = require(path.join(REPO, 'lib', 'viewer.js'));

const UNSHADED = 0x1;

// files to patch; wall entries also get the fixed brighter pale-face tone.
// GeosetAnim colors are stored in the MDX B,G,R order (gotcha 19) — the
// PALE_FACE constant below is BGR for RGB (0.78, 0.80, 0.76).
const PALE_FACE_BGR = [0.76, 0.8, 0.78];
const FILES = [
  { file: 'SolHDBWallSegment.mdx', paleGeosetAnim: 0 },
  { file: 'SolHDBWallCorner.mdx', paleGeosetAnim: 0 },
  { file: 'SolHDBFlatDoor.mdx' },
  { file: 'SolStairwellFlight.mdx' },
  { file: 'SolHDBLiftDead.mdx' },
  { file: 'SolCorpseCovered.mdx' },
];

for (const job of FILES) {
  const p = path.join(IMP, job.file);
  const buf = fs.readFileSync(p);
  const model = wm.parseMDX(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

  let flagged = 0;
  for (const mat of model.Materials || []) {
    for (const layer of mat.Layers || []) {
      if ((layer.Shading & UNSHADED) === 0) { layer.Shading |= UNSHADED; flagged++; }
    }
  }
  let toned = false;
  if (job.paleGeosetAnim !== undefined) {
    const ga = (model.GeosetAnims || [])[job.paleGeosetAnim];
    if (!ga || !ga.Color) throw new Error(`${job.file}: expected GeosetAnim ${job.paleGeosetAnim}`);
    for (let i = 0; i < 3; i++) {
      if (Math.abs(ga.Color[i] - PALE_FACE_BGR[i]) > 1e-4) { ga.Color[i] = PALE_FACE_BGR[i]; toned = true; }
    }
  }

  const out = Buffer.from(wm.generateMDX(model));
  const sanity = sanityCheckModel(out, false);
  if ((sanity.errors || 0) > 0 || (sanity.severe || 0) > 0) {
    throw new Error(`${job.file}: patched model fails sanityTest `
      + `errors=${sanity.errors} severe=${sanity.severe} warnings=${sanity.warnings}`);
  }
  fs.writeFileSync(p, out);
  console.log(`${job.file}: unshaded ${flagged} layer(s)${toned ? ', pale face re-toned' : ''}, sanity 0/0`);
}
console.log('Sol interior set patched (idempotent; re-run any time).');
