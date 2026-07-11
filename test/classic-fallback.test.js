'use strict';
// Classic/protected-map fallback regressions (map-to-json path):
//   (1) the _viewer/ fallback runs on ANY translator error, not only on
//       "cannot currently parse this version" messages — classic war3map.doo
//       (v8) makes wc3maptranslator throw a plain RangeError, yet
//       mdx-m3-viewer-th parses it fine
//   (2) fallback failures are recorded in manifest.viewerFallbackErrors and
//       warned about by map-to-json — never swallowed silently
//   (3) a protector-truncated CLASSIC w3i: TAIL-section truncation now lands
//       in EDITABLE info.json via lib/codecs/w3i31.js's tolerant read
//       (byte-faithful write-back); truncation inside the settings block
//       still gets the second-tier read-only lib/classicw3i.js fallback
// Plus unit tests for the tolerant classic w3i reader itself.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const FIXTURES = path.join(ROOT, 'fixtures');
const { extractedToSource } = require(path.join(ROOT, 'lib', 'source'));
const { readClassicW3i } = require(path.join(ROOT, 'lib', 'classicw3i'));

const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'wc3-toolkit-classic-test-'));

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

// Down-convert the Reforged v8+skins doo fixture to the CLASSIC on-disk
// layout with the viewer's own writer (buildVersion 0 => no skin fields).
function makeClassicDoo() {
  const w3x = require('mdx-m3-viewer-th/dist/cjs/parsers/w3x/index.js').default;
  const f = new w3x.doo.File();
  f.load(new Uint8Array(fs.readFileSync(path.join(FIXTURES, 'war3map.doo'))), 132);
  return { buffer: Buffer.from(f.save(0)), doodads: f.doodads.length };
}

// Synthesize a classic TFT (v25) war3map.w3i. `complete` appends the empty
// trailing tables (upgrades/tech/random) so strict parsers accept it; the
// truncated variant cuts mid-way through player 2 — the shape a protector-
// mangled w3i has. Layout independently validated: mdx-m3-viewer-th parses
// the complete buffer and agrees on every field.
function makeV25W3i({ complete }) {
  const parts = [];
  const marks = {};
  const i32 = (v) => { const b = Buffer.alloc(4); b.writeInt32LE(v, 0); parts.push(b); };
  const f32 = (v) => { const b = Buffer.alloc(4); b.writeFloatLE(v, 0); parts.push(b); };
  const str = (s) => parts.push(Buffer.from(s + '\0', 'utf8'));
  const u8s = (...v) => parts.push(Buffer.from(v));
  const mark = (n) => { marks[n] = parts.reduce((a, b) => a + b.length, 0); };

  i32(25); i32(3); i32(6059); // version, saves, editorVersion
  str('Frozen Vale'); str('protector'); str('desc'); str('1v1');
  for (let i = 0; i < 8; i++) f32(-2048 + i); // camera bounds
  for (let i = 0; i < 4; i++) i32(6); // complements
  i32(84); i32(84); i32(0x8010); // playable w/h, flags
  u8s(0x4C); // tileset 'L'
  i32(-1); str(''); str('load text'); str('title'); str('sub'); // loading screen
  i32(0); str(''); str(''); str(''); str(''); // game data set + prologue
  i32(0); f32(3000); f32(5000); f32(0.5); u8s(0, 0, 0, 255); // fog
  i32(0); str(''); u8s(0x4C); u8s(0, 0, 0, 255); // weather, sound env, light tileset, water
  i32(2); // players
  i32(0); i32(1); i32(1); i32(0); str('Player 1'); f32(0); f32(0); i32(0); i32(0);
  mark('afterPlayer0');
  i32(1); i32(1); i32(2); i32(0); str('Player 2'); f32(-64); f32(64); i32(0); i32(0);
  i32(1); i32(0); i32(-1); str('Force 1'); // forces
  if (complete) { i32(0); i32(0); i32(0); i32(0); } // upgrades/tech/random tables
  const buf = Buffer.concat(parts);
  return complete ? buf : buf.slice(0, marks.afterPlayer0 + 6);
}

function toSource(name, files) {
  const extractedDir = path.join(WORK, name + '-extracted');
  fs.mkdirSync(extractedDir, { recursive: true });
  for (const [rel, buf] of Object.entries(files)) fs.writeFileSync(path.join(extractedDir, rel), buf);
  const sourceDir = path.join(WORK, name + '-src');
  return { extractedDir, sourceDir, manifest: extractedToSource(extractedDir, sourceDir) };
}

test('(1) classic doo: a translator RangeError (not a version message) still triggers the _viewer/ fallback', () => {
  const { buffer: classic, doodads } = makeClassicDoo();
  // precondition: the translator throw is NOT a version rejection — the old
  // /cannot currently parse this version/ gate would have missed it
  const { DoodadsTranslator } = require('wc3maptranslator');
  let translatorError = null;
  try { DoodadsTranslator.warToJson(classic); } catch (e) { translatorError = String(e.message || e); }
  assert.ok(translatorError, 'precondition: translator rejects the classic doo');
  assert.doesNotMatch(translatorError, /cannot currently parse this version/i,
    'precondition: rejection is a plain RangeError, not a version message');

  const { sourceDir, manifest } = toSource('classic-doo', { 'war3map.doo': classic });
  assert.strictEqual(manifest.errors.length, 1);
  assert.match(manifest.errors[0].error, /out of range/i, 'original translator error stays in the manifest');
  assert.ok(fs.readFileSync(path.join(sourceDir, 'files', 'war3map.doo')).equals(classic), 'raw copy is still ground truth');
  assert.strictEqual(manifest.viewerFallback['war3map.doo'], '_viewer/war3map.doo.json', 'fallback ran despite the non-version error');
  const diag = readJson(path.join(sourceDir, '_viewer', 'war3map.doo.json'));
  assert.strictEqual(diag._schema, 'mdx-m3-viewer-th');
  assert.strictEqual(diag.data.doodads.length, doodads, 'viewer recovered every doodad');
  assert.ok(!manifest.viewerFallbackErrors, 'no fallback failure recorded on success');
});

test('(2) fallback failure is recorded in manifest.viewerFallbackErrors, not swallowed', () => {
  // a truncated REFORGED w3i: translator throws, the viewer w3i parser throws
  // (premature end), and the classic second tier refuses (version 28+)
  const full = fs.readFileSync(path.join(FIXTURES, 'war3map.w3i'));
  const trunc = full.slice(0, Math.floor(full.length * 0.6));
  const { sourceDir, manifest } = toSource('trunc-reforged-w3i', { 'war3map.w3i': trunc });

  assert.strictEqual(manifest.errors.length, 1, 'translator error recorded');
  assert.ok(Array.isArray(manifest.viewerFallbackErrors), 'fallback failure list present');
  const fe = manifest.viewerFallbackErrors.find((e) => e.file === 'war3map.w3i');
  assert.ok(fe, 'w3i fallback failure recorded with the file name');
  assert.match(fe.error, /premature end/i, 'the viewer error message is preserved');
  assert.ok(!manifest.viewerFallback, 'no _viewer output claimed');
  assert.ok(!fs.existsSync(path.join(sourceDir, '_viewer')), 'no _viewer dir written');
  assert.ok(fs.existsSync(path.join(sourceDir, 'files', 'war3map.w3i')), 'raw copy still made');

  // ... and map-to-json surfaces it as a warning line on stderr
  const res = spawnSync('node', [path.join(ROOT, 'tools', 'map-to-json.js'),
    path.join(WORK, 'trunc-reforged-w3i-extracted'), path.join(WORK, 'trunc-reforged-w3i-src2')],
  { encoding: 'utf8' });
  assert.strictEqual(res.status, 0, res.stderr);
  assert.match(res.stderr, /WARN viewer fallback failed for war3map\.w3i/, 'user sees the fallback failure');
});

test('(3) protector-truncated classic w3i, TAIL sections: lands in EDITABLE info.json via the tolerant w3i31 codec', () => {
  // truncated mid-way through player 2 — a TAIL-section truncation, which
  // lib/codecs/w3i31.js now reads tolerantly (and writes back byte-faithfully)
  // instead of demoting the file to the read-only _viewer/ fallback.
  const trunc = makeV25W3i({ complete: false });
  const { sourceDir, manifest } = toSource('trunc-classic-w3i', { 'war3map.w3i': trunc });

  assert.strictEqual(manifest.errors.length, 0, 'no translator error: the codec tolerates tail truncation');
  assert.strictEqual(manifest.translated['war3map.w3i'], 'info.json', 'editable info.json, not _viewer/');
  assert.ok(!manifest.viewerFallback, 'no _viewer fallback needed');
  assert.ok(!fs.existsSync(path.join(sourceDir, '_viewer')), 'no _viewer dir written');
  const info = readJson(path.join(sourceDir, 'info.json'));
  assert.strictEqual(info.version, 25);
  assert.strictEqual(info.map.name, 'Frozen Vale');
  assert.strictEqual(info._truncated, true);
  assert.strictEqual(info._truncatedAt, 'players', 'partial players section dropped as a whole');
  assert.deepStrictEqual(info.players, []);
  assert.ok(info._truncatedTail.length > 0, 'undecodable tail kept as hex');
  // write-capable: rebuilding from the JSON reproduces the truncated original
  const w3i31 = require(path.join(ROOT, 'lib', 'codecs', 'w3i31'));
  assert.ok(w3i31.jsonToWar(info).buffer.equals(trunc), 'byte-faithful rebuild of the truncated file');
});

test('(3b) w3i truncated INSIDE the settings block still falls back to the second-tier classic reader', () => {
  // cut mid camera-bounds: nothing byte-faithful can be written from half a
  // settings block, so the codec throws and the read-only diagnostics tiers
  // take over (viewer parse fails -> lib/classicw3i.js tolerant read).
  const trunc = makeV25W3i({ complete: true }).slice(0, 60);
  const { sourceDir, manifest } = toSource('trunc-classic-w3i-head', { 'war3map.w3i': trunc });

  assert.strictEqual(manifest.errors.length, 1, 'translator error recorded');
  const fe = (manifest.viewerFallbackErrors || []).find((e) => e.file === 'war3map.w3i');
  assert.ok(fe, 'viewer failure recorded');
  assert.match(fe.note || '', /tolerant classic w3i/i, 'recovery noted');
  assert.strictEqual(manifest.viewerFallback['war3map.w3i'], '_viewer/war3map.w3i.json');
  const diag = readJson(path.join(sourceDir, '_viewer', 'war3map.w3i.json'));
  assert.strictEqual(diag._schema, 'wc3-map-toolkit-classic-w3i');
  assert.strictEqual(diag.data.version, 25);
  assert.strictEqual(diag.data.name, 'Frozen Vale');
  assert.strictEqual(diag.data._truncated, true);
});

test('classicw3i: complete v25 parses through forces; truncation returns a marked partial; Reforged is refused', () => {
  const full = readClassicW3i(makeV25W3i({ complete: true }));
  assert.strictEqual(full._truncated, false);
  assert.strictEqual(full.version, 25);
  assert.strictEqual(full.name, 'Frozen Vale');
  assert.strictEqual(full.tileset, 'L');
  assert.strictEqual(full.playableWidth, 84);
  assert.deepStrictEqual(full.players.map((p) => p.name), ['Player 1', 'Player 2']);
  assert.deepStrictEqual(full.forces, [{ flags: 0, playerMasks: -1, name: 'Force 1' }]);

  const part = readClassicW3i(makeV25W3i({ complete: false }));
  assert.strictEqual(part._truncated, true);
  assert.strictEqual(part._truncatedAt, 'players');
  assert.strictEqual(part.name, 'Frozen Vale');
  assert.strictEqual(part.players.length, 1);
  assert.strictEqual(part.forces, undefined, 'never reached');

  assert.throws(() => readClassicW3i(fs.readFileSync(path.join(FIXTURES, 'war3map.w3i'))),
    /not a classic w3i/, 'Reforged w3i belongs to the translator, not this reader');
});

test.after(() => {
  fs.rmSync(WORK, { recursive: true, force: true });
});
