'use strict';
// Regression tests for the pick-time / load-time crash fixes:
//   (a) built war3map.w3i carries four ZERO bytes for "no global weather",
//       never the ASCII string "0000" (invalid weather id -> picker rejects)
//   (b) built archives ship a minimap preview (war3mapMap.tga) and a
//       non-empty war3map.mmp with one colored entry per start location
//   (c) the packed war3map.lua contains a generated CreateAllUnits() with
//       one CreateUnit per non-'sloc' unit (war3mapUnits.doo is editor-only)
//   (d) the committed custom MDX passes mdx-m3-viewer's sanityTest clean
//       (a malformed MDX hard-crashes the game on map load)
//   (e) the HM3W pre-header flags dword is nonzero and mirrors the w3i flags

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { buildMap } = require(path.join(ROOT, 'tools', 'build-map.js'));
const { extractAll } = require(path.join(ROOT, 'lib', 'mpq'));
const { parseHeader, readW3iFlags } = require(path.join(ROOT, 'lib', 'header'));
const { byWar, warToJson } = require(path.join(ROOT, 'lib', 'filemap'));
const { injectUnitsIntoLua } = require(path.join(ROOT, 'lib', 'unitscript'));

const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'wc3-toolkit-fixes-test-'));
const MAPS = {
  demo: { src: path.join(ROOT, 'maps', 'demo') },
  'crossroads-siege': { src: path.join(ROOT, 'maps', 'crossroads-siege') },
};

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

test.before(() => {
  for (const [name, m] of Object.entries(MAPS)) {
    m.w3x = path.join(WORK, `${name}.w3x`);
    buildMap(m.src, m.w3x);
    m.extracted = path.join(WORK, `${name}-extracted`);
    fs.mkdirSync(m.extracted, { recursive: true });
    m.members = extractAll(m.w3x, m.extracted);
    m.units = readJson(path.join(m.src, 'units.json'));
  }
});

test('(a) built w3i has zero bytes, not ASCII "0000", for null globalWeather', () => {
  for (const [name, m] of Object.entries(MAPS)) {
    const w3i = fs.readFileSync(path.join(m.extracted, 'war3map.w3i'));
    assert.ok(!w3i.includes(Buffer.from('0000', 'latin1')),
      `${name}: war3map.w3i must not contain the ASCII bytes "0000"`);
    // the translator dialect still reads the zero bytes back as '0000'
    const info = warToJson(byWar.get('war3map.w3i'), w3i);
    assert.strictEqual(info.globalWeather, '0000', `${name}: JSON round-trip keeps the '0000' dialect`);
  }
});

test('(b) built archives ship war3mapMap.tga and a populated war3map.mmp', () => {
  const expectedMmpCount = { demo: 3, 'crossroads-siege': 11 }; // slocs + gold mines (+ neutral buildings)
  for (const [name, m] of Object.entries(MAPS)) {
    assert.ok(m.members.includes('war3mapMap.tga'), `${name}: minimap image packed`);
    const tga = fs.readFileSync(path.join(m.extracted, 'war3mapMap.tga'));
    assert.strictEqual(tga.readUInt8(2), 2, 'uncompressed true-color TGA');
    assert.strictEqual(tga.readUInt16LE(12), 256, '256 px wide');
    assert.strictEqual(tga.readUInt16LE(14), 256, '256 px tall');
    assert.strictEqual(tga.readUInt8(16), 24, '24 bpp');
    assert.strictEqual(tga.length, 18 + 256 * 256 * 3, 'raw pixel payload');

    assert.ok(m.members.includes('war3map.mmp'), `${name}: war3map.mmp packed`);
    const mmp = fs.readFileSync(path.join(m.extracted, 'war3map.mmp'));
    assert.strictEqual(mmp.readInt32LE(0), 0, 'mmp format 0');
    const count = mmp.readInt32LE(4);
    assert.strictEqual(mmp.length, 8 + count * 16, `${name}: 16 bytes per mmp entry`);
    assert.strictEqual(count, expectedMmpCount[name], `${name}: mmp icon count`);

    // one type-2 (start location) entry per 'sloc', at sane minimap coords
    const slocs = m.units.filter((u) => u.type === 'sloc');
    let startIcons = 0;
    for (let i = 0; i < count; i++) {
      const o = 8 + i * 16;
      const type = mmp.readInt32LE(o);
      const x = mmp.readInt32LE(o + 4);
      const y = mmp.readInt32LE(o + 8);
      assert.ok(type >= 0 && type <= 2, 'known icon type');
      assert.ok(x >= 0 && x <= 256 && y >= 0 && y <= 256, 'coords in minimap space');
      if (type === 2) {
        startIcons++;
        assert.notStrictEqual(mmp.readUInt32LE(o + 12), 0xFFFFFFFF, 'start location colored by player');
      }
    }
    assert.strictEqual(startIcons, slocs.length, `${name}: one start-location icon per sloc`);
  }
});

test('(c) packed war3map.lua defines CreateAllUnits with one CreateUnit per non-sloc unit', () => {
  for (const [name, m] of Object.entries(MAPS)) {
    const lua = fs.readFileSync(path.join(m.extracted, 'war3map.lua'), 'utf8');
    assert.match(lua, /function CreateAllUnits\(\)/, `${name}: CreateAllUnits defined`);
    const block = lua.split('BEGIN wc3-map-toolkit generated: CreateAllUnits')[1];
    assert.ok(block, `${name}: generated block marker present`);
    const nonSloc = m.units.filter((u) => u.type !== 'sloc').length;
    const calls = (block.match(/CreateUnit\(/g) || []).length;
    assert.strictEqual(calls, nonSloc, `${name}: ${nonSloc} CreateUnit calls`);
    // gold mines get their resource amount
    const mines = m.units.filter((u) => typeof u.gold === 'number').length;
    assert.strictEqual((block.match(/SetResourceAmount\(/g) || []).length, mines, `${name}: gold mine amounts`);
    // both bundled sources call CreateAllUnits themselves -> no main() wrapper
    assert.ok(!block.includes('__wc3tk_user_main'), `${name}: user script controls the call site`);
    // regeneration is idempotent (repack of an extracted source stays stable)
    assert.strictEqual(injectUnitsIntoLua(lua, m.units), lua, `${name}: injection idempotent`);
  }
});

test('(c2) scripts that never mention CreateAllUnits get a main() wrapper', () => {
  const lua = injectUnitsIntoLua('function main()\nend\n', [
    { type: 'hfoo', position: [0, 0, 0], rotation: 270, player: 0, hero: { level: 1, str: 0, agi: 0, int: 0 } },
    { type: 'sloc', position: [0, 0, 0], rotation: 270, player: 0, hero: { level: 0, str: 0, agi: 0, int: 0 } },
  ]);
  assert.match(lua, /__wc3tk_user_main/, 'wrapper emitted');
  assert.strictEqual((lua.match(/CreateUnit\(/g) || []).length, 1, 'sloc skipped');
  assert.strictEqual(injectUnitsIntoLua(lua, []), injectUnitsIntoLua('function main()\nend\n', []), 'strip+regen stable');
});

test('(d) SiegeCrystal.mdx passes mdx-m3-viewer sanityTest with no errors/severes', () => {
  const sanityTest = require('mdx-m3-viewer-th/dist/cjs/utils/mdlx/sanitytest/sanitytest.js').default;
  const Model = require('mdx-m3-viewer-th/dist/cjs/parsers/mdlx/model.js').default;
  const p = path.join(MAPS['crossroads-siege'].src, 'imports', 'war3mapImported', 'SiegeCrystal.mdx');
  const model = new Model();
  // NB: must be a fresh Uint8Array, never a Node Buffer (the parser slices .buffer)
  model.load(new Uint8Array(fs.readFileSync(p)));
  const result = sanityTest(model);
  assert.strictEqual(result.errors, 0, 'no sanity errors');
  assert.strictEqual(result.severe, 0, 'no severe issues (e.g. missing Death sequence)');
  assert.ok(model.sequences.some((s) => s.name.toLowerCase().startsWith('death')), 'has a Death sequence');
});

test('(e) HM3W pre-header flags are nonzero and mirror the packed w3i flags', () => {
  for (const [name, m] of Object.entries(MAPS)) {
    const header = parseHeader(fs.readFileSync(m.w3x));
    const w3iFlags = readW3iFlags(fs.readFileSync(path.join(m.extracted, 'war3map.w3i')));
    assert.notStrictEqual(header.flags, 0, `${name}: HM3W flags nonzero`);
    assert.strictEqual(header.flags >>> 0, w3iFlags >>> 0, `${name}: HM3W flags == w3i flags`);
  }
});

test.after(() => {
  fs.rmSync(WORK, { recursive: true, force: true });
});
