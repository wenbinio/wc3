'use strict';
// Stale generated-constant lint (lib/constlint.js; gotcha 27 as a build FAIL):
//   1. unit level: stale references, prefix squatting in every declaration
//      form, exemptions (table fields, goto labels, engine API names,
//      dynamic _G access), source-relative line math, rename suggestions
//   2. end-to-end: build-map FAILS a map whose script references a constant
//      the generated block doesn't define, and names the identifier, the
//      source-relative line and the nearest defined constant; prefix
//      squatting fails too; dynamic access alone still builds.
// (That the five bundled maps still build clean under the lint is pinned by
// test/builds-freshness.test.js, which buildMap()s every committed source.)

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const { lintGeneratedConstants } = require(path.join(ROOT, 'lib', 'constlint'));
const { generateConstantsBlock, injectConstantsIntoLua } = require(path.join(ROOT, 'lib', 'constants'));

const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'wc3-constlint-test-'));

// A minimal generated-block context: two defined constants, injected exactly
// the way sourceToExtracted does it (block prepended above the user script).
const ENTRIES = [
  { kind: 'unit', constName: 'UNIT_FOOTMAN', rawcode: 'hfoo', displayName: 'Footman', source: 'objects-units.json', luaValue: 'FourCC("hfoo")' },
  { kind: 'unit', constName: 'UNIT_FOOTMAN_h001', rawcode: 'h001', displayName: 'Footman', source: 'objects-units.json', luaValue: 'FourCC("h001")' },
];
const DEFINED = ENTRIES.map((e) => e.constName);

function packed(userLua) {
  return injectConstantsIntoLua(userLua, ENTRIES);
}

test('clean script: references to defined constants and engine API names pass', () => {
  const lua = packed([
    'function main()',
    '    CreateUnit(Player(0), UNIT_FOOTMAN, 0.0, 0.0, 270.0)',
    '    local hp = GetUnitState(u, UNIT_STATE_LIFE) -- engine API, not ours',
    '    SetUnitState(u, UNIT_STATE_MAX_LIFE, hp)',
    'end',
  ].join('\n'));
  assert.deepStrictEqual(lintGeneratedConstants(lua, DEFINED), []);
});

test('stale reference: named, source-relative line, rename suggestion', () => {
  const user = [
    '-- line 1',
    'function main()',
    '    CreateUnit(Player(0), UNIT_FOTMAN, 0.0, 0.0, 270.0)', // line 3, typo
    'end',
  ].join('\n');
  const findings = lintGeneratedConstants(packed(user), DEFINED);
  assert.strictEqual(findings.length, 1);
  const f = findings[0];
  assert.strictEqual(f.kind, 'stale');
  assert.strictEqual(f.name, 'UNIT_FOTMAN');
  assert.strictEqual(f.sourceLine, 3, 'line is source-relative (generated block offset removed)');
  assert.strictEqual(f.suggestion, 'UNIT_FOOTMAN');
  assert.match(f.message, /war3map\.lua:3/);
  assert.match(f.message, /UNIT_FOOTMAN/);
});

test('collision-suffix rename (gotcha 27a) suggests the suffixed constant', () => {
  // Reference predates a second "Footman" being added: the old unsuffixed
  // name is stale, the suffixed collider is the suggestion (prefix relation).
  const findings = lintGeneratedConstants(
    packed('u = CreateUnit(Player(0), UNIT_FOOTMAN_h002, 0.0, 0.0, 0.0)'), DEFINED);
  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].suggestion, 'UNIT_FOOTMAN_h001');
});

test('prefix squatting fails in every declaration form (gotcha 27b)', () => {
  const cases = [
    ['ITEM_MINE = 5', 'assignment'],
    ['local BUFF_LOCAL = 1', 'local declaration'],
    ['function DEST_HELPER() end', 'function declaration'],
    ['local function f(ABIL_PARAM) end', 'function parameter'],
    ['for UPGR_I = 1, 3 do end', 'loop variable'],
    ['for REGION_K, v in pairs({}) do end', 'loop variable'],
  ];
  for (const [lua, role] of cases) {
    const findings = lintGeneratedConstants(packed(lua), DEFINED);
    assert.strictEqual(findings.length, 1, lua);
    assert.strictEqual(findings[0].kind, 'squat', lua);
    assert.match(findings[0].message, new RegExp(role), lua);
  }
  // reassigning a DEFINED constant is squatting too
  const f = lintGeneratedConstants(packed('UNIT_FOOTMAN = 7'), DEFINED);
  assert.strictEqual(f.length, 1);
  assert.strictEqual(f[0].kind, 'squat');
});

test('separate namespaces and dynamic access are not checked', () => {
  const lua = packed([
    'local t = { UNIT_KEY = 1 }',      // table key string
    'x = t.UNIT_FIELD',                // member property
    't.UNIT_FIELD = 2',                // member property assignment
    'local n = _G["UNIT_" .. "hfoo"]', // dynamic access: string data
    'goto UNIT_SKIP',
    '::UNIT_SKIP::',
  ].join('\n'));
  assert.deepStrictEqual(lintGeneratedConstants(lua, DEFINED), []);
});

test('no generated block (no derivable constants): offset 0, references still fail', () => {
  const lua = 'function main()\n    u = CreateUnit(Player(0), UNIT_GHOST, 0.0, 0.0, 0.0)\nend\n';
  const findings = lintGeneratedConstants(lua, []);
  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].kind, 'stale');
  assert.strictEqual(findings[0].sourceLine, 2);
  assert.strictEqual(findings[0].suggestion, undefined, 'nothing to suggest');
});

test('generated block itself is exempt (its assignments are the definitions)', () => {
  const block = generateConstantsBlock(ENTRIES);
  assert.match(block, /^UNIT_FOOTMAN = FourCC/m, 'block assigns reserved-prefix names');
  assert.deepStrictEqual(lintGeneratedConstants(packed('x = 1'), DEFINED), []);
});

// ---- end to end through build-map ------------------------------------------

function tryBuild(srcDir, out) {
  try {
    execFileSync('node', [path.join(ROOT, 'tools', 'build-map.js'), srcDir, out],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, output: '' };
  } catch (e) {
    return { ok: false, output: String(e.stderr) };
  }
}

test('build-map FAILS on a stale constant reference, with line + suggestion', () => {
  const src = path.join(WORK, 'stale-map');
  fs.cpSync(path.join(ROOT, 'maps', 'demo'), src, { recursive: true });
  const luaPath = path.join(src, 'war3map.lua');
  const lines = fs.readFileSync(luaPath, 'utf8').split('\n');
  fs.appendFileSync(luaPath, '\nfunction DebugSpawn()\n    CreateUnit(Player(0), UNIT_hfooo, 0.0, 0.0, 270.0)\nend\n');
  const staleLine = lines.length + 2; // appended after the trailing newline
  const r = tryBuild(src, path.join(WORK, 'stale.w3x'));
  assert.strictEqual(r.ok, false, 'build must fail');
  assert.match(r.output, /generated-constant lint failed \(gotcha 27/);
  assert.match(r.output, new RegExp(`war3map\\.lua:${staleLine}: reference to 'UNIT_hfooo'`), 'source-relative line');
  assert.match(r.output, /nearest defined constant: 'UNIT_hfoo'/, 'rename suggestion');
});

test('build-map FAILS on prefix squatting; dynamic access alone still builds', () => {
  const squat = path.join(WORK, 'squat-map');
  fs.cpSync(path.join(ROOT, 'maps', 'demo'), squat, { recursive: true });
  fs.appendFileSync(path.join(squat, 'war3map.lua'), '\nITEM_MY_SPECIAL = 5\n');
  const r1 = tryBuild(squat, path.join(WORK, 'squat.w3x'));
  assert.strictEqual(r1.ok, false);
  assert.match(r1.output, /assignment of 'ITEM_MY_SPECIAL'.*reserved/);

  const dyn = path.join(WORK, 'dyn-map');
  fs.cpSync(path.join(ROOT, 'maps', 'demo'), dyn, { recursive: true });
  fs.appendFileSync(path.join(dyn, 'war3map.lua'), '\nlocal n = _G["UNIT_" .. "hfoo"]\n');
  const r2 = tryBuild(dyn, path.join(WORK, 'dyn.w3x'));
  assert.strictEqual(r2.ok, true, `dynamic access is out of scope, build passes: ${r2.output}`);
});

test.after(() => {
  fs.rmSync(WORK, { recursive: true, force: true });
});
