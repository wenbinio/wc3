'use strict';
// tools/preflight.js — the one-shot pre-playtest gate that automates
// docs/reference/preflight-2026-07.md.
//
// Coverage here:
//   - every bundled map preflights with ZERO FAILs (the standing regression
//     gate). The logic tier is disabled in THIS suite only because npm test
//     already runs every maps/*/tests/*.test.js suite directly — running
//     them a second time inside the preflight test would double the whole
//     suite's runtime for no extra coverage. `npm run preflight` runs it.
//   - a synthetically broken demo variant produces exactly the right
//     FAIL/WARN rows (forces [], dangling TRIGSTR name, missing sloc,
//     >150 chunk locals).
//   - the w3i ASCII-weather detector (gotcha 11) flags literal 0x30303030
//     weather bytes and passes the normalized four-zero-BYTES form.
//   - native lua5.3 ABSENT degrades the cross-execution checks to WARN
//     "unchecked" (deterministic WC3_LUA53 switch, the WC3_PJASS pattern).
//   - --json emits a stable machine-readable shape and exit code 0.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const {
  preflight, preflightMap, discoverBundledMaps, RESIDUAL_RISKS,
  findLua53, checkW3iWeatherBytes, detectSchragePrng,
} = require(path.join(ROOT, 'tools', 'preflight'));
const { byJson, jsonToWar } = require(path.join(ROOT, 'lib', 'filemap'));

const LUA53 = findLua53();
const NO_LUA53_ENV = { ...process.env, WC3_LUA53: path.join(os.tmpdir(), 'no-such-lua53') };

const rowsById = (mapResult) => new Map(mapResult.checks.map((c) => [c.id, c]));

test('every bundled map preflights with zero FAILs (standing gate; logic tier runs via npm test directly)', () => {
  const dirs = discoverBundledMaps();
  assert.ok(dirs.length >= 5, `expected the 5 bundled maps, found ${dirs.length}`);
  const result = preflight(dirs, { logic: false });
  assert.strictEqual(result.verdict, 'PASS');
  assert.strictEqual(result.failures, 0,
    'FAILs: ' + JSON.stringify(result.maps.flatMap((m) => m.checks.filter((c) => c.status === 'FAIL').map((c) => `${m.name}/${c.id}: ${c.detail}`))));
  for (const m of result.maps) {
    const rows = rowsById(m);
    // the stable check catalog every map must be measured against
    for (const id of ['build', 'validate', 'w3i-weather', 'header-flags', 'forces',
      'lobby-teams', 'minimap', 'trigstr', 'start-locations', 'model-fields',
      'imports-resolve', 'script-language', 'create-all-units', 'chunk-locals',
      'camera-bounds', 'luac-compile', 'prng-portability', 'bitwise-ops',
      'nondeterminism']) {
      assert.ok(rows.has(id), `${m.name}: missing check row ${id}`);
    }
    assert.strictEqual(rows.get('build').status, 'PASS', `${m.name}: build`);
    assert.strictEqual(rows.get('validate').status, 'PASS', `${m.name}: validate`);
    // lobby wiring must come from EXECUTING config(), not the literal scan
    // (bundled maps assign teams in loops — the regex fallback can't see them)
    assert.match(rows.get('lobby-teams').detail, /sim\(config\(\)\)|custom forces .* off/,
      `${m.name}: lobby-teams should be sim-observed`);
  }
  // the vaults cautions must surface exactly as the preflight doc records them
  const vaults = result.maps.find((m) => m.name === 'vaults-of-ash');
  const vRows = rowsById(vaults);
  assert.strictEqual(vRows.get('chunk-locals').status, 'WARN');
  assert.match(vRows.get('chunk-locals').detail, /169 declared main-chunk locals/);
  if (LUA53) {
    assert.strictEqual(vRows.get('prng-portability').status, 'PASS');
    assert.match(vRows.get('prng-portability').detail, /bit-identical/);
    assert.strictEqual(vRows.get('luac-compile').status, 'PASS');
  } else {
    assert.strictEqual(vRows.get('prng-portability').status, 'WARN');
    assert.match(vRows.get('prng-portability').detail, /lua5\.3 not installed/);
  }
  // honesty footer data is part of the contract
  assert.strictEqual(RESIDUAL_RISKS.length, 7);
  assert.deepStrictEqual(result.residualRisks, RESIDUAL_RISKS);
});

test('a broken demo variant produces the right FAIL/WARN rows', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'w3xpf-broken-'));
  try {
    fs.cpSync(path.join(ROOT, 'maps', 'demo'), dir, { recursive: true });
    // break 1: empty forces (pick-time, gotcha 18)
    // break 2: w3i name -> dangling TRIGSTR (pick-time, gotcha 17)
    const infoPath = path.join(dir, 'info.json');
    const info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
    info.forces = [];
    info.map.name = 'TRIGSTR_099';
    fs.writeFileSync(infoPath, JSON.stringify(info, null, 2));
    // break 3: drop player 1's start location from units.json (pick-time:
    // sloc/player mismatch AND a minimap.mmp start-icon shortfall)
    const unitsPath = path.join(dir, 'units.json');
    const units = JSON.parse(fs.readFileSync(unitsPath, 'utf8'))
      .filter((u) => !(u.type === 'sloc' && u.player === 1));
    fs.writeFileSync(unitsPath, JSON.stringify(units, null, 2));
    // break 4 (WARN class): 160 main-chunk locals — past the 150 threshold,
    // still loadable (gotcha 28's headroom caution, the vaults 169 pattern)
    const luaPath = path.join(dir, 'war3map.lua');
    let lua = fs.readFileSync(luaPath, 'utf8');
    for (let i = 0; i < 160; i++) lua += `local pf_pad_${i} = ${i}\n`;
    fs.writeFileSync(luaPath, lua);

    const m = preflightMap(dir, { logic: false, validate: false });
    const rows = rowsById(m);
    assert.strictEqual(m.verdict, 'FAIL');
    assert.strictEqual(rows.get('build').status, 'PASS'); // still builds — preflight catches what build can't
    assert.strictEqual(rows.get('forces').status, 'FAIL');
    assert.match(rows.get('forces').detail, /forces: \[\]/);
    assert.strictEqual(rows.get('trigstr').status, 'FAIL');
    assert.match(rows.get('trigstr').detail, /TRIGSTR_099/);
    assert.strictEqual(rows.get('start-locations').status, 'FAIL');
    assert.match(rows.get('start-locations').detail, /2 w3i player\(s\) vs 1 units\.json sloc\(s\)/);
    assert.strictEqual(rows.get('minimap').status, 'FAIL');
    assert.match(rows.get('minimap').detail, /1 start-location icon\(s\) for 2 w3i player\(s\)/);
    assert.strictEqual(rows.get('chunk-locals').status, 'WARN');
    assert.match(rows.get('chunk-locals').detail, /160 declared main-chunk locals \(headroom 40/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('w3i ASCII weather bytes (gotcha 11) are detected; zero-byte form passes', () => {
  const entry = byJson.get('info.json');
  const info = JSON.parse(fs.readFileSync(path.join(ROOT, 'maps', 'demo', 'info.json'), 'utf8'));
  // the un-normalized translator write path: literal ASCII 0x30303030
  const asciiBuf = jsonToWar(entry, { ...info, globalWeather: '0000' }).buffer;
  const bad = checkW3iWeatherBytes(asciiBuf);
  assert.strictEqual(bad.ok, false);
  assert.ok(!bad.warnOnly, 'attributed ASCII weather must be a hard FAIL');
  assert.match(bad.detail, /literal ASCII 0x30303030/);
  // the normalized write path (lib/source.js): four zero BYTES
  const zeroBuf = jsonToWar(entry, { ...info, globalWeather: '' }).buffer;
  assert.strictEqual(checkW3iWeatherBytes(zeroBuf).ok, true);
});

test('lua5.3 absent: cross-execution checks degrade to WARN "unchecked" (WC3_LUA53 switch)', () => {
  assert.strictEqual(findLua53(NO_LUA53_ENV), null);
  const m = preflightMap(path.join(ROOT, 'maps', 'vaults-of-ash'),
    { logic: false, validate: false, env: NO_LUA53_ENV });
  const rows = rowsById(m);
  assert.strictEqual(rows.get('luac-compile').status, 'WARN');
  assert.match(rows.get('luac-compile').detail, /unchecked \(lua5\.3 not installed\)/);
  assert.strictEqual(rows.get('prng-portability').status, 'WARN');
  assert.match(rows.get('prng-portability').detail, /SeedRNG\/NextRand.*lua5\.3 not installed/);
  assert.strictEqual(m.failures, 0, 'a missing optional tool must never FAIL the map');
});

test('PRNG detection is pattern-based (Schrage constants), not map-specific', () => {
  const detected = detectSchragePrng(`
myState = 0
function Reseed(n) myState = (n % 2147483646) + 1 end
function Draw()
  local hi = myState // 127773
  local lo = myState % 127773
  myState = 16807 * lo - 2836 * hi
  if myState <= 0 then myState = myState + 2147483647 end
  return myState / 2147483647.0
end
`);
  assert.ok(detected, 'Schrage block under other names must be detected');
  assert.strictEqual(detected.seedName, 'Reseed');
  assert.strictEqual(detected.nextName, 'Draw');
  assert.strictEqual(detectSchragePrng('function f() return 1 end'), null);
});

test('--json emits a stable machine-readable shape and exit 0', () => {
  const r = spawnSync('node',
    [path.join(ROOT, 'tools', 'preflight.js'), '--json', '--no-logic', '--no-validate', path.join(ROOT, 'maps', 'demo')],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  assert.strictEqual(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.strictEqual(out.version, 1);
  assert.strictEqual(out.verdict, 'PASS');
  assert.strictEqual(typeof out.ms, 'number');
  assert.strictEqual(typeof out.failures, 'number');
  assert.strictEqual(typeof out.warnings, 'number');
  assert.ok(Array.isArray(out.residualRisks) && out.residualRisks.length === 7);
  assert.strictEqual(out.maps.length, 1);
  const m = out.maps[0];
  assert.strictEqual(m.name, 'demo');
  assert.ok(['PASS', 'WARN', 'FAIL'].includes(m.verdict));
  assert.ok(Array.isArray(m.checks) && m.checks.length > 0);
  for (const c of m.checks) {
    assert.deepStrictEqual(Object.keys(c).sort(), ['detail', 'id', 'status']);
    assert.ok(['PASS', 'WARN', 'FAIL'].includes(c.status), `${c.id}: ${c.status}`);
  }
});
