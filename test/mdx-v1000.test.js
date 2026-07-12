'use strict';
// MDX v1000 (Reforged model format) spot-check for the two-tier model bar
// (gotcha 14), which was calibrated entirely on v800 models. The fixture is
// SYNTHETIC and generated at test time from a committed v800 model of our
// own (maps/northreach/imports — produced by assets/mdl-lib.mjs): war3-model
// parses it, the version is bumped to 1000, and war3-model's version-aware
// writer emits the v900+/v1000 chunk layout (material shader string, layer
// extensions). No binary fixture is committed; the chain stays in sync with
// the committed model.
//
// VERDICT PINNED HERE (recorded in docs/FORMATS.md and the 2026-07 audit):
// mdx-m3-viewer-th 5.13.4's sanityCheckModel handles v1000 — it parses the
// version-branched layout, preserves content, reports 0 errors/0 severes on
// a clean model AND still detects error-tier problems (invalid
// GeosetAnimId), so the strict build-map gate can be trusted for
// Reforged-version models. Honest scope: the fixture carries SD content
// tagged v1000 (no skin weights/tangents/HD shaders) — HD-content models
// are not exercised.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MODEL_V800 = path.join(ROOT, 'maps', 'northreach', 'imports', 'war3mapImported', 'WaystoneCairn.mdx');

function toArrayBuffer(buf) {
  // war3-model wants an ArrayBuffer, never a Node Buffer (CLAUDE.md gotcha 5)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

function makeV1000(mutate) {
  const { parseMDX, generateMDX } = require('war3-model');
  const model = parseMDX(toArrayBuffer(fs.readFileSync(MODEL_V800)));
  assert.strictEqual(model.Version, 800, 'committed source model is v800');
  model.Version = 1000;
  if (mutate) mutate(model);
  return Buffer.from(generateMDX(model));
}

test('sanityCheckModel passes a clean synthetic v1000 model (strict gate trustworthy)', () => {
  const viewer = require(path.join(ROOT, 'lib', 'viewer'));
  const v1000 = makeV1000();
  const r = viewer.sanityCheckModel(v1000, false);
  assert.strictEqual(r.errors, 0, 'no errors on a clean v1000 model');
  assert.strictEqual(r.severe, 0, 'no severe issues on a clean v1000 model');

  // the viewer really read it as v1000 with content intact (not a lucky
  // misparse): version, node counts and name must survive the round trip
  const MdlxModel = require('mdx-m3-viewer-th/dist/cjs/parsers/mdlx/model.js').default;
  const m = new MdlxModel();
  m.load(new Uint8Array(v1000));
  const orig = new MdlxModel();
  orig.load(new Uint8Array(fs.readFileSync(MODEL_V800)));
  assert.strictEqual(m.version, 1000);
  assert.strictEqual(m.name, orig.name);
  assert.strictEqual(m.geosets.length, orig.geosets.length);
  assert.strictEqual(m.materials.length, orig.materials.length);
  assert.strictEqual(m.sequences.length, orig.sequences.length);
  assert.strictEqual(typeof m.materials[0].shader, 'string', 'v900+ material shader field parsed');
});

test('sanityCheckModel still reports error-tier findings on a broken v1000 model', () => {
  const viewer = require(path.join(ROOT, 'lib', 'viewer'));
  // gotcha 14's classic crash trap: a Bone GeosetAnimId pointing nowhere
  const broken = makeV1000((model) => { model.Bones[0].GeosetAnimId = 7; });
  const r = viewer.sanityCheckModel(broken, false);
  assert.ok(r.errors > 0, 'invalid GeosetAnimId must be an error-tier finding at v1000');
});
