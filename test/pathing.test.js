'use strict';
// war3map.wpm / war3map.shd auto-generation (lib/pathing.js; gotcha 8):
//   1. unit level: byte layout, dimension math, mismatch detection
//   2. end-to-end: a source WITHOUT files/war3map.wpm+shd builds into a
//      valid archive containing correctly sized all-passable/no-shadow
//      binaries (and validate-map's independent viewer parsers accept them);
//      a PROVIDED files/ copy is packed verbatim (never clobbered); a
//      provided copy whose size mismatches terrain dims surfaces a warning.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const { generateWpm, generateShd, checkPathingFile, pathingDims } = require(path.join(ROOT, 'lib', 'pathing'));
const { buildMap } = require(path.join(ROOT, 'tools', 'build-map'));
const { extractAll } = require(path.join(ROOT, 'lib', 'mpq'));

const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'wc3-pathing-test-'));
const DEMO_SRC = path.join(ROOT, 'maps', 'demo');
const demoTerrain = () => JSON.parse(fs.readFileSync(path.join(DEMO_SRC, 'terrain.json'), 'utf8'));

test('generateWpm: MP3W header + tiles*4 dims + all-passable body', () => {
  const terrain = demoTerrain(); // 32x32 tiles
  const { width, height } = pathingDims(terrain);
  assert.strictEqual(width, terrain.map.width * 4);
  const wpm = generateWpm(terrain);
  assert.strictEqual(wpm.length, 16 + width * height);
  assert.strictEqual(wpm.toString('latin1', 0, 4), 'MP3W');
  assert.strictEqual(wpm.readInt32LE(4), 0, 'version 0');
  assert.strictEqual(wpm.readInt32LE(8), width);
  assert.strictEqual(wpm.readInt32LE(12), height);
  assert.ok(wpm.subarray(16).every((b) => b === 0), 'flag bytes all 0 = passable');
  // matches the committed demo reference byte for byte
  assert.ok(wpm.equals(fs.readFileSync(path.join(DEMO_SRC, 'files', 'war3map.wpm'))));
});

test('generateShd: (tiles*4)^2 zero bytes, matches the demo reference', () => {
  const terrain = demoTerrain();
  const shd = generateShd(terrain);
  assert.strictEqual(shd.length, terrain.map.width * 4 * terrain.map.height * 4);
  assert.ok(shd.every((b) => b === 0), 'no shadow');
  assert.ok(shd.equals(fs.readFileSync(path.join(DEMO_SRC, 'files', 'war3map.shd'))));
});

test('checkPathingFile: consistent files pass, mismatches are described', () => {
  const terrain = demoTerrain();
  assert.strictEqual(checkPathingFile('war3map.wpm', generateWpm(terrain), terrain), null);
  assert.strictEqual(checkPathingFile('war3map.shd', generateShd(terrain), terrain), null);
  const short = Buffer.alloc(8000);
  assert.match(checkPathingFile('war3map.shd', short, terrain), /8000 bytes.*implies 16384/);
  const grown = { ...terrain, map: { ...terrain.map, width: 64, height: 64 } };
  assert.match(checkPathingFile('war3map.wpm', generateWpm(terrain), grown), /128x128 cells.*implies 256x256/);
  assert.match(checkPathingFile('war3map.wpm', Buffer.alloc(20), terrain), /no 'MP3W' header/);
});

test('build without files/wpm+shd: generated members with terrain-derived sizes', () => {
  const src = path.join(WORK, 'nopath-map');
  fs.cpSync(DEMO_SRC, src, { recursive: true });
  fs.rmSync(path.join(src, 'files', 'war3map.wpm'));
  fs.rmSync(path.join(src, 'files', 'war3map.shd'));
  const w3x = path.join(WORK, 'nopath.w3x');
  const res = buildMap(src, w3x, {});
  assert.deepStrictEqual(res.warnings, [], 'no warnings for a consistent source');
  assert.ok(res.files.includes('war3map.wpm') && res.files.includes('war3map.shd'), 'both members packed');

  const out = path.join(WORK, 'nopath-extract');
  extractAll(w3x, out);
  const wpm = fs.readFileSync(path.join(out, 'war3map.wpm'));
  const shd = fs.readFileSync(path.join(out, 'war3map.shd'));
  assert.strictEqual(wpm.length, 16 + 128 * 128, 'wpm sized from terrain (32x32 tiles)');
  assert.strictEqual(wpm.readInt32LE(8), 128);
  assert.strictEqual(shd.length, 128 * 128);

  // the independent mdx-m3-viewer-th parsers must accept the generated files
  const report = execFileSync('node', [path.join(ROOT, 'tools', 'validate-map.js'), w3x], { encoding: 'utf8' });
  assert.match(report, /PASS {2}viewer parse war3map\.wpm/);
  assert.match(report, /PASS {2}viewer parse war3map\.shd/);
});

test('provided files/ pathing data is packed verbatim, never clobbered', () => {
  const src = path.join(WORK, 'custom-path-map');
  fs.cpSync(DEMO_SRC, src, { recursive: true });
  // a real (non-default) path map: mark one cell unbuildable
  const custom = generateWpm(demoTerrain());
  custom[16] = 0x0A;
  fs.writeFileSync(path.join(src, 'files', 'war3map.wpm'), custom);
  const w3x = path.join(WORK, 'custom-path.w3x');
  const res = buildMap(src, w3x, {});
  assert.deepStrictEqual(res.warnings, []);
  const out = path.join(WORK, 'custom-path-extract');
  extractAll(w3x, out);
  assert.ok(fs.readFileSync(path.join(out, 'war3map.wpm')).equals(custom), 'user data byte-identical');
});

test('provided files/ copy with a size mismatching terrain dims warns (gotcha 8)', () => {
  const src = path.join(WORK, 'badpath-map');
  fs.cpSync(DEMO_SRC, src, { recursive: true });
  fs.writeFileSync(path.join(src, 'files', 'war3map.shd'), Buffer.alloc(8000)); // wrong size
  const res = buildMap(src, path.join(WORK, 'badpath.w3x'), {});
  assert.strictEqual(res.warnings.length, 1);
  assert.match(res.warnings[0], /war3map\.shd.*8000 bytes.*implies 16384.*gotcha 8/);
  // the CLI surfaces it on stderr and still exits 0 (WARN, not FAIL)
  const run = spawnSync('node',
    [path.join(ROOT, 'tools', 'build-map.js'), src, path.join(WORK, 'badpath2.w3x')], { encoding: 'utf8' });
  assert.strictEqual(run.status, 0, 'size mismatch is a warning, not a failure');
  assert.match(run.stderr, /warning: files\/war3map\.shd/);
});

test.after(() => {
  fs.rmSync(WORK, { recursive: true, force: true });
});
