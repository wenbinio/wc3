'use strict';
// End-to-end pipeline tests:
//   1. build maps/demo -> demo.w3x (valid HM3W header + MPQ)
//   2. validate-map passes on the built map
//   3. extract -> map-to-json works and matches the source JSON
//   4. json-to-map -> repack -> validate: translatable content is preserved
// All CLIs are exercised as child processes, exactly as a user would run them.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DEMO_SRC = path.join(ROOT, 'maps', 'demo');
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'wc3-toolkit-test-'));
const DEMO_W3X = path.join(WORK, 'demo.w3x');

function run(tool, ...args) {
  return execFileSync('node', [path.join(ROOT, 'tools', tool), ...args], { encoding: 'utf8' });
}
function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

test('build-map: maps/demo -> demo.w3x with HM3W header and MPQ archive', () => {
  const out = run('build-map.js', DEMO_SRC, DEMO_W3X);
  assert.match(out, /built .*demo\.w3x/);
  const buf = fs.readFileSync(DEMO_W3X);
  assert.strictEqual(buf.toString('latin1', 0, 4), 'HM3W', 'HM3W magic at offset 0');
  assert.strictEqual(buf.toString('latin1', 512, 516), 'MPQ\x1a', 'MPQ magic at offset 512');
  assert.ok(buf.length > 512 + 32, 'archive has content');
});

test('validate-map passes on the built demo map', () => {
  const out = run('validate-map.js', DEMO_W3X); // non-zero exit -> throws
  assert.doesNotMatch(out, /^FAIL/m);
  assert.match(out, /map script present/);
  assert.match(out, /translate war3map\.w3i/);
});

test('w3x-extract + map-to-json reproduce the demo source JSON', () => {
  const extractDir = path.join(WORK, 'extracted');
  const jsonDir = path.join(WORK, 'src');
  run('w3x-extract.js', DEMO_W3X, extractDir);
  assert.ok(fs.existsSync(path.join(extractDir, 'war3map.w3e')), 'terrain extracted');
  assert.ok(fs.existsSync(path.join(extractDir, '_header.json')), 'header saved');

  run('map-to-json.js', extractDir, jsonDir);
  const manifest = readJson(path.join(jsonDir, 'manifest.json'));
  assert.deepStrictEqual(manifest.errors, [], 'no translation errors');
  assert.strictEqual(manifest.translated['war3map.w3i'], 'info.json');

  // Translatable content must match the committed map source exactly
  // (the demo source is a translator fixed point).
  for (const f of ['info.json', 'terrain.json', 'units.json', 'doodads.json', 'strings.json']) {
    assert.deepStrictEqual(readJson(path.join(jsonDir, f)), readJson(path.join(DEMO_SRC, f)), f);
  }
  // Script came through: source text plus the generated CreateAllUnits block
  const packedLua = fs.readFileSync(path.join(jsonDir, 'war3map.lua'), 'utf8');
  const srcLua = fs.readFileSync(path.join(DEMO_SRC, 'war3map.lua'), 'utf8');
  assert.ok(packedLua.startsWith(srcLua), 'packed lua starts with the source script');
  assert.match(packedLua, /BEGIN wc3-map-toolkit generated: CreateAllUnits/);
  // Opaque files came through; generated minimap files appear under files/
  for (const f of ['war3map.shd', 'war3map.wpm']) {
    assert.ok(
      fs.readFileSync(path.join(jsonDir, 'files', f)).equals(fs.readFileSync(path.join(DEMO_SRC, 'files', f))),
      `${f} copied verbatim`
    );
  }
  for (const f of ['war3map.mmp', 'war3mapMap.tga']) {
    assert.ok(fs.existsSync(path.join(jsonDir, 'files', f)), `generated ${f} present in archive`);
  }
});

test('full repack round-trip preserves translatable content and header', () => {
  const jsonDir = path.join(WORK, 'src'); // produced by previous test
  const rebuiltDir = path.join(WORK, 'rebuilt');
  const w3x2 = path.join(WORK, 'demo2.w3x');
  run('json-to-map.js', jsonDir, rebuiltDir);
  run('w3x-pack.js', rebuiltDir, w3x2);
  run('validate-map.js', w3x2);

  // Extract the repacked map and compare all translated JSON with pass 1.
  const extractDir2 = path.join(WORK, 'extracted2');
  const jsonDir2 = path.join(WORK, 'src2');
  run('w3x-extract.js', w3x2, extractDir2);
  run('map-to-json.js', extractDir2, jsonDir2);
  assert.deepStrictEqual(
    readJson(path.join(jsonDir2, '_header.json')),
    readJson(path.join(jsonDir, '_header.json')),
    'HM3W header preserved'
  );
  for (const f of fs.readdirSync(jsonDir).filter((f) => f.endsWith('.json') && f !== 'manifest.json')) {
    assert.deepStrictEqual(readJson(path.join(jsonDir2, f)), readJson(path.join(jsonDir, f)), f);
  }
});

test.after(() => {
  fs.rmSync(WORK, { recursive: true, force: true });
});
