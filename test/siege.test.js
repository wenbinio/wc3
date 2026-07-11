'use strict';
// End-to-end pipeline tests for maps/crossroads-siege — the "everything at
// once" map source: 64x64 non-flat terrain, 5 players/2 forces, 70+ units
// (incl. custom types), 160+ doodads, regions/cameras/sounds, custom object
// data (w3u/w3t/w3a), TRIGSTR strings, and a generated MDX import.
// Mirrors test/build.test.js: build -> validate -> extract -> compare ->
// full repack round-trip. The committed JSON is a translator fixed point.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SIEGE_SRC = path.join(ROOT, 'maps', 'crossroads-siege');
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'wc3-toolkit-siege-test-'));
const SIEGE_W3X = path.join(WORK, 'crossroads-siege.w3x');

// every translatable JSON file this map source carries
const SOURCE_JSON = [
  'info.json', 'terrain.json', 'units.json', 'doodads.json', 'strings.json',
  'regions.json', 'cameras.json', 'sounds.json',
  'objects-units.json', 'objects-items.json', 'objects-abilities.json',
];

function run(tool, ...args) {
  return execFileSync('node', [path.join(ROOT, 'tools', tool), ...args], { encoding: 'utf8' });
}
function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

test('crossroads-siege source has the advertised moving parts', () => {
  const terrain = readJson(path.join(SIEGE_SRC, 'terrain.json'));
  assert.strictEqual(terrain.map.width, 64);
  assert.strictEqual(terrain.map.height, 64);
  assert.strictEqual(terrain.groundHeight.length, 65 * 65, 'per-vertex arrays sized (w+1)*(h+1)');
  assert.ok(new Set(terrain.groundTexture).size >= 4, 'at least 4 ground tile types in use');
  assert.ok(new Set(terrain.layerHeight).size >= 3, 'varied cliff levels');
  assert.ok(terrain.flags.some((f) => (f & 256) !== 0), 'water flag set somewhere');
  assert.ok(new Set(terrain.groundHeight).size > 10, 'non-flat height variation');

  const units = readJson(path.join(SIEGE_SRC, 'units.json'));
  assert.ok(units.length >= 60, `60+ preplaced units (${units.length})`);
  assert.strictEqual(units.filter((u) => u.type === 'sloc').length, 5, '5 start locations');
  assert.ok(units.some((u) => u.type === 'h001'), 'custom keep placed');
  assert.ok(units.some((u) => u.type === 'n000'), 'custom-model ward crystal placed');
  assert.ok(units.some((u) => u.type === 'ngol'), 'gold mines placed');
  assert.ok(units.filter((u) => u.player === 24).length >= 10, 'neutral hostile creep camps');

  const doodads = readJson(path.join(SIEGE_SRC, 'doodads.json'));
  assert.ok(doodads.regular.length >= 100, `100+ doodads (${doodads.regular.length})`);

  assert.ok(readJson(path.join(SIEGE_SRC, 'regions.json')).length >= 6, '6+ regions');
  assert.ok(readJson(path.join(SIEGE_SRC, 'cameras.json')).length >= 2, '2+ cameras');
  assert.ok(readJson(path.join(SIEGE_SRC, 'sounds.json')).length >= 1, 'sounds defined');

  const info = readJson(path.join(SIEGE_SRC, 'info.json'));
  assert.strictEqual(info.players.length, 5, '4 humans + 1 computer');
  assert.strictEqual(info.players.filter((p) => p.type === 1).length, 4);
  assert.strictEqual(info.players.filter((p) => p.type === 2).length, 1);
  assert.strictEqual(info.forces.length, 2);
  assert.strictEqual(info.scriptLanguage, 1, 'Lua map');

  const strings = readJson(path.join(SIEGE_SRC, 'strings.json'));
  assert.ok(Object.keys(strings).length >= 12, '12+ trigger strings');
  // TRIGSTR keys referenced from info.json must exist in strings.json
  for (const ref of JSON.stringify(info).match(/TRIGSTR_(\d+)/g)) {
    const n = String(parseInt(ref.replace('TRIGSTR_', ''), 10));
    assert.ok(strings[n], `${ref} resolves in strings.json`);
  }

  const objUnits = readJson(path.join(SIEGE_SRC, 'objects-units.json'));
  assert.ok(Object.keys(objUnits.custom).length >= 3, '3+ custom units');
  assert.ok(
    JSON.stringify(objUnits.custom).includes('war3mapImported\\\\SiegeCrystal.mdl'),
    'a custom unit references the imported model (.mdl field value, gotcha 22)'
  );
  assert.ok(fs.existsSync(path.join(SIEGE_SRC, 'imports', 'war3mapImported', 'SiegeCrystal.mdx')));

  // the map script drives config()/main() and references the grove + keep
  const lua = fs.readFileSync(path.join(SIEGE_SRC, 'war3map.lua'), 'utf8');
  for (const needle of ['function config()', 'function main()', 'ShortcutGrove', 'KillDestructable', 'h001', 'u000']) {
    assert.ok(lua.includes(needle), `war3map.lua contains ${needle}`);
  }
});

test('build-map: maps/crossroads-siege -> .w3x with HM3W header and MPQ archive', () => {
  const out = run('build-map.js', SIEGE_SRC, SIEGE_W3X);
  assert.match(out, /built .*crossroads-siege\.w3x/);
  const buf = fs.readFileSync(SIEGE_W3X);
  assert.strictEqual(buf.toString('latin1', 0, 4), 'HM3W', 'HM3W magic at offset 0');
  assert.strictEqual(buf.toString('latin1', 512, 516), 'MPQ\x1a', 'MPQ magic at offset 512');
});

test('validate-map passes on the built crossroads-siege map', () => {
  const out = run('validate-map.js', SIEGE_W3X); // non-zero exit -> throws
  assert.doesNotMatch(out, /^FAIL/m);
  assert.match(out, /map script present/);
  // every translatable family must be present AND round-trip stable
  for (const war of ['w3i', 'w3e', 'w3r', 'w3c', 'w3s', 'w3u', 'w3t', 'w3a', 'wts', 'imp']) {
    assert.match(out, new RegExp(`PASS  translate war3map\\.${war}`), `war3map.${war} packed and stable`);
  }
  assert.match(out, /PASS {2}translate war3mapUnits\.doo/);
  assert.match(out, /PASS {2}translate war3map\.doo /);
  // cross-validation: mdx-m3-viewer-th second opinion, incl. the formats
  // wc3maptranslator can't parse (wpm/shd/mmp) and the imported model
  assert.match(out, /PASS {2}viewer opens archive/);
  for (const f of ['war3map.wpm', 'war3map.shd', 'war3map.mmp', 'war3map.w3e', 'war3mapUnits.doo']) {
    assert.match(out, new RegExp(`PASS {2}viewer parse ${f.replace('.', '\\.')}`), `${f} second opinion`);
  }
  assert.match(out, /PASS {2}viewer sanity war3mapImported\/SiegeCrystal\.mdx {2}\(errors=0 severe=0/);
});

test('w3x-extract + map-to-json reproduce the crossroads-siege source JSON', () => {
  const extractDir = path.join(WORK, 'extracted');
  const jsonDir = path.join(WORK, 'src');
  run('w3x-extract.js', SIEGE_W3X, extractDir);
  assert.ok(fs.existsSync(path.join(extractDir, 'war3mapImported', 'SiegeCrystal.mdx')), 'import extracted');

  run('map-to-json.js', extractDir, jsonDir);
  const manifest = readJson(path.join(jsonDir, 'manifest.json'));
  assert.deepStrictEqual(manifest.errors, [], 'no translation errors');

  // Translatable content must match the committed source exactly
  // (the source is a translator fixed point).
  for (const f of SOURCE_JSON) {
    assert.deepStrictEqual(readJson(path.join(jsonDir, f)), readJson(path.join(SIEGE_SRC, f)), f);
  }
  // auto-generated import manifest lists the model
  assert.deepStrictEqual(readJson(path.join(jsonDir, 'imports.json')), ['war3mapImported\\SiegeCrystal.mdx']);
  // script came through: generated constants block + source text + the
  // generated CreateAllUnits block
  const packedLua = fs.readFileSync(path.join(jsonDir, 'war3map.lua'), 'utf8');
  const srcLua = fs.readFileSync(path.join(SIEGE_SRC, 'war3map.lua'), 'utf8');
  assert.ok(packedLua.startsWith('-- ### BEGIN wc3-map-toolkit generated: constants'),
    'packed lua starts with the generated constants block');
  assert.ok(packedLua.includes(srcLua), 'packed lua contains the source script verbatim');
  assert.match(packedLua, /BEGIN wc3-map-toolkit generated: CreateAllUnits/);
  // generated minimap preview files appear under files/
  for (const f of ['war3map.mmp', 'war3mapMap.tga']) {
    assert.ok(fs.existsSync(path.join(jsonDir, 'files', f)), `generated ${f} present in archive`);
  }
  // opaque files and the binary MDX asset come through verbatim
  for (const f of ['war3map.shd', 'war3map.wpm']) {
    assert.ok(
      fs.readFileSync(path.join(jsonDir, 'files', f)).equals(fs.readFileSync(path.join(SIEGE_SRC, 'files', f))),
      `${f} copied verbatim`
    );
  }
  assert.ok(
    fs.readFileSync(path.join(jsonDir, 'files', 'war3mapImported', 'SiegeCrystal.mdx'))
      .equals(fs.readFileSync(path.join(SIEGE_SRC, 'imports', 'war3mapImported', 'SiegeCrystal.mdx'))),
    'imported MDX byte-identical after archive round-trip'
  );
  // wpm/shd sizes derive from the 64x64 terrain (w*4 x h*4 cells)
  assert.strictEqual(fs.statSync(path.join(jsonDir, 'files', 'war3map.wpm')).size, 16 + 256 * 256);
  assert.strictEqual(fs.statSync(path.join(jsonDir, 'files', 'war3map.shd')).size, 256 * 256);
});

test('full repack round-trip preserves crossroads-siege content and header', () => {
  const jsonDir = path.join(WORK, 'src'); // produced by previous test
  const rebuiltDir = path.join(WORK, 'rebuilt');
  const w3x2 = path.join(WORK, 'crossroads-siege2.w3x');
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
