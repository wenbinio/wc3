#!/usr/bin/env node
// community-death-fix.mjs — the verified Death-sequence fix for community
// models (docs/ASSETS.md; CLAUDE.md gotcha 14): mdx-m3-viewer's sanityTest
// reports "Missing Death sequence" as SEVERE, and build-map enforces
// 0 errors / 0 severes on everything under a map source's imports/.
//
// Two model families in maps/last-train/imports/ need it:
//   * Ilya Alaric's Citizen Pack rigs death on the Blizzard Villager rig's
//     "Death Alternate" tag (the alternate form is an armed stance this map
//     never morphs into). Appending a duplicate "Death" over the same
//     interval trips the sanity tester's overlapping-sequence severes, so
//     the fix RENAMES "Death Alternate" -> "Death" (and the matching
//     "Decay * Alternate" tags when no plain twin exists): same authored
//     motion, standard sequence names, zero overlaps.
//   * HerrDave's Urban Prop Pack props are Stand-only — the fix appends a
//     short still NonLooping "Death" interval past the last keyframe (a
//     static death; fine for scenery props).
//
// Usage:  node community-death-fix.mjs <model.mdx> [more.mdx ...]
// Edits IN PLACE (war3-model parse -> append sequence -> generateMDX) and
// re-runs the sanity bar. The committed imports have already been fixed —
// this script documents and reproduces the modification (its provenance is
// recorded per-file in ../imports-credits.json under "modified").

import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseMDX, generateMDX } = require('war3-model');
const viewer = require('../../../lib/viewer.js');

for (const file of process.argv.slice(2)) {
  const buf = fs.readFileSync(file);
  const model = parseMDX(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  if (model.Sequences.some((s) => s.Name === 'Death')) {
    console.log(`${file}: already has a Death sequence — untouched`);
    continue;
  }
  const alt = model.Sequences.find((s) => s.Name === 'Death Alternate');
  let how;
  if (alt) {
    // rename the alternate-tag death (+ decay twins) to the plain names
    for (const s of model.Sequences) {
      const plain = s.Name.replace(/ Alternate$/, '');
      if (/^(Death|Decay Flesh|Decay Bone) Alternate$/.test(s.Name)
          && !model.Sequences.some((o) => o.Name === plain)) {
        s.Name = plain;
      }
    }
    how = 'renamed Death/Decay Alternate tags to plain names';
  } else {
    const end = Math.max(...model.Sequences.map((s) => s.Interval[1]));
    model.Sequences.push({
      Name: 'Death',
      Interval: [end + 100, end + 200], // still frame past every keyframe
      NonLooping: true,
      MinimumExtent: model.Info.MinimumExtent,
      MaximumExtent: model.Info.MaximumExtent,
      BoundsRadius: model.Info.BoundsRadius,
    });
    how = 'appended still-frame NonLooping Death';
  }
  fs.writeFileSync(file, Buffer.from(generateMDX(model)));
  const r = viewer.sanityCheckModel(fs.readFileSync(file), false);
  if (r.errors > 0 || r.severe > 0) {
    throw new Error(`${file}: still fails sanity after the fix (errors=${r.errors} severe=${r.severe})`);
  }
  console.log(`${file}: ${how} — sanity clean`);
}
