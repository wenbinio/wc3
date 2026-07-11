'use strict';
// End-to-end pipeline tests for maps/tidewatch-arena — the "cliff/ramp/water
// at small scale" map source: 48x48 Northrend terrain with a raised circular
// arena (cliff layer 3), a water moat, four ramp entrances, 2 players on
// opposite corners, neutral creeps + a custom Hpal-based boss (w3u), regions,
// one camera, TRIGSTR strings — and deliberately NO custom imports.
// Mirrors test/siege.test.js: build -> validate -> extract -> compare ->
// full repack round-trip. The committed JSON is a translator fixed point.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'maps', 'tidewatch-arena');
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'wc3-toolkit-tidewatch-test-'));
const W3X = path.join(WORK, 'tidewatch-arena.w3x');

// every translatable JSON file this map source carries
const SOURCE_JSON = [
  'info.json', 'terrain.json', 'units.json', 'doodads.json', 'strings.json',
  'regions.json', 'cameras.json', 'objects-units.json',
];

function run(tool, ...args) {
  return execFileSync('node', [path.join(ROOT, 'tools', tool), ...args], { encoding: 'utf8' });
}
function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

test('tidewatch-arena source has the advertised moving parts', () => {
  const terrain = readJson(path.join(SRC, 'terrain.json'));
  assert.strictEqual(terrain.tileset, 'N', 'Northrend tileset');
  assert.strictEqual(terrain.map.width, 48);
  assert.strictEqual(terrain.map.height, 48);
  assert.strictEqual(terrain.groundHeight.length, 49 * 49, 'per-vertex arrays sized (w+1)*(h+1)');
  assert.ok(terrain.flags.some((f) => (f & 256) !== 0), 'water moat flagged');
  assert.ok(terrain.flags.some((f) => (f & 64) !== 0), 'ramp flags set');
  assert.ok(terrain.layerHeight.some((l) => l === 3), 'raised arena cliff layer');
  // the arena is raised at the center, the moat ring around it is water
  const cols = 49;
  const at = (arr, r, c) => arr[r * cols + c];
  assert.strictEqual(at(terrain.layerHeight, 24, 24), 3, 'center vertex on layer 3');
  assert.strictEqual(at(terrain.flags, 24, 24) & 256, 0, 'no water on the arena floor');
  // the cardinal axes are ramp causeways (dry); the moat rings the diagonals
  assert.strictEqual(at(terrain.flags, 24, 24 + 10) & 256, 0, 'east causeway is dry');
  assert.strictEqual(at(terrain.flags, 24 + 7, 24 + 7) & 256, 256, 'water on the SE diagonal (moat)');
  assert.strictEqual(at(terrain.flags, 24 - 7, 24 - 7) & 256, 256, 'water on the NW diagonal (moat)');

  const units = readJson(path.join(SRC, 'units.json'));
  const slocs = units.filter((u) => u.type === 'sloc');
  assert.strictEqual(slocs.length, 2, '2 start locations');
  assert.ok(units.some((u) => u.type === 'H000' && u.player === 24), 'custom boss placed neutral hostile');
  assert.strictEqual(units.filter((u) => u.type === 'ngol').length, 2, 'one gold mine per side');
  assert.ok(units.filter((u) => u.player === 24 && u.type !== 'ngol').length >= 4, 'neutral creeps');
  assert.ok(units.every((u) => u.type !== 'sloc' || u.hero.level === 0));

  const info = readJson(path.join(SRC, 'info.json'));
  assert.strictEqual(info.players.length, 2, '2 players');
  assert.strictEqual(info.scriptLanguage, 1, 'Lua map');
  assert.strictEqual(info.map.mainTileType, 'N');
  assert.ok(info.forces.length >= 1, 'at least one force');
  // players' startingPos must match the slocs
  for (const p of info.players) {
    assert.ok(
      slocs.some((s) => s.player === p.playerNum
        && s.position[0] === p.startingPos.x && s.position[1] === p.startingPos.y),
      `player ${p.playerNum} startingPos has a matching sloc`
    );
  }

  assert.strictEqual(readJson(path.join(SRC, 'regions.json')).length, 3, 'arena + 2 spawn regions');
  assert.strictEqual(readJson(path.join(SRC, 'cameras.json')).length, 1, 'one camera');

  const strings = readJson(path.join(SRC, 'strings.json'));
  for (const ref of JSON.stringify(info).match(/TRIGSTR_(\d+)/g)) {
    const n = String(parseInt(ref.replace('TRIGSTR_', ''), 10));
    assert.ok(strings[n], `${ref} resolves in strings.json`);
  }

  const objUnits = readJson(path.join(SRC, 'objects-units.json'));
  assert.ok(objUnits.custom['H000:Hpal'], 'Arena Champion derived from Hpal');

  // no custom imports on this map — that path is covered by crossroads-siege
  assert.ok(!fs.existsSync(path.join(SRC, 'imports')), 'no imports directory');

  // the map script drives config()/main() and the arena/victory logic
  const lua = fs.readFileSync(path.join(SRC, 'war3map.lua'), 'utf8');
  for (const needle of ['function config()', 'function main()', 'CreateAllUnits()',
    'TriggerRegisterEnterRegion', 'H000', 'CustomVictoryBJ']) {
    assert.ok(lua.includes(needle), `war3map.lua contains ${needle}`);
  }
});

test('build-map: maps/tidewatch-arena -> .w3x with HM3W header and MPQ archive', () => {
  const out = run('build-map.js', SRC, W3X);
  assert.match(out, /built .*tidewatch-arena\.w3x/);
  const buf = fs.readFileSync(W3X);
  assert.strictEqual(buf.toString('latin1', 0, 4), 'HM3W', 'HM3W magic at offset 0');
  assert.strictEqual(buf.toString('latin1', 512, 516), 'MPQ\x1a', 'MPQ magic at offset 512');
});

test('validate-map passes on the built tidewatch-arena map', () => {
  const out = run('validate-map.js', W3X); // non-zero exit -> throws
  assert.doesNotMatch(out, /^FAIL/m);
  assert.match(out, /map script present/);
  // every translatable family must be present AND round-trip stable
  for (const war of ['w3i', 'w3e', 'w3r', 'w3c', 'w3u', 'wts']) {
    assert.match(out, new RegExp(`PASS  translate war3map\\.${war}`), `war3map.${war} packed and stable`);
  }
  assert.match(out, /PASS {2}translate war3mapUnits\.doo/);
  assert.match(out, /PASS {2}translate war3map\.doo /);
  // cross-validation: mdx-m3-viewer-th second opinion, incl. the formats
  // wc3maptranslator can't parse (wpm/shd/mmp)
  assert.match(out, /PASS {2}viewer opens archive/);
  for (const f of ['war3map.wpm', 'war3map.shd', 'war3map.mmp', 'war3map.w3e', 'war3mapUnits.doo']) {
    assert.match(out, new RegExp(`PASS {2}viewer parse ${f.replace('.', '\\.')}`), `${f} second opinion`);
  }
});

test('w3x-extract + map-to-json reproduce the tidewatch-arena source JSON', () => {
  const extractDir = path.join(WORK, 'extracted');
  const jsonDir = path.join(WORK, 'src');
  run('w3x-extract.js', W3X, extractDir);
  run('map-to-json.js', extractDir, jsonDir);
  const manifest = readJson(path.join(jsonDir, 'manifest.json'));
  assert.deepStrictEqual(manifest.errors, [], 'no translation errors');

  // Translatable content must match the committed source exactly
  // (the source is a translator fixed point).
  for (const f of SOURCE_JSON) {
    assert.deepStrictEqual(readJson(path.join(jsonDir, f)), readJson(path.join(SRC, f)), f);
  }
  // script came through: source text plus the generated CreateAllUnits block,
  // and no main() wrapper (the source script calls CreateAllUnits itself)
  const packedLua = fs.readFileSync(path.join(jsonDir, 'war3map.lua'), 'utf8');
  const srcLua = fs.readFileSync(path.join(SRC, 'war3map.lua'), 'utf8');
  assert.ok(packedLua.startsWith(srcLua), 'packed lua starts with the source script');
  assert.match(packedLua, /BEGIN wc3-map-toolkit generated: CreateAllUnits/);
  assert.doesNotMatch(packedLua, /__wc3tk_user_main/, 'no wrapper: main() calls CreateAllUnits');
  // the boss gets its hero level from units.json
  assert.match(packedLua, /SetHeroLevel\(u, 10, false\)/, 'boss hero level applied');
  // generated minimap preview files appear under files/
  for (const f of ['war3map.mmp', 'war3mapMap.tga']) {
    assert.ok(fs.existsSync(path.join(jsonDir, 'files', f)), `generated ${f} present in archive`);
  }
  // opaque files come through verbatim
  for (const f of ['war3map.shd', 'war3map.wpm']) {
    assert.ok(
      fs.readFileSync(path.join(jsonDir, 'files', f)).equals(fs.readFileSync(path.join(SRC, 'files', f))),
      `${f} copied verbatim`
    );
  }
  // wpm/shd sizes derive from the 48x48 terrain (w*4 x h*4 cells)
  assert.strictEqual(fs.statSync(path.join(jsonDir, 'files', 'war3map.wpm')).size, 16 + 192 * 192);
  assert.strictEqual(fs.statSync(path.join(jsonDir, 'files', 'war3map.shd')).size, 192 * 192);
});

test('full repack round-trip preserves tidewatch-arena content and header', () => {
  const jsonDir = path.join(WORK, 'src'); // produced by previous test
  const rebuiltDir = path.join(WORK, 'rebuilt');
  const w3x2 = path.join(WORK, 'tidewatch-arena2.w3x');
  run('json-to-map.js', jsonDir, rebuiltDir);
  run('w3x-pack.js', rebuiltDir, w3x2);
  run('validate-map.js', w3x2);

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
