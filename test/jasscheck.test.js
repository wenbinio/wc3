'use strict';
// JASS syntax gate (lib/jasscheck.js) — the war3map.j twin of the luaparse
// gate, via the OPTIONAL pjass checker (built by scripts/setup.sh into
// vendor/pjass; the smpq-fallback pattern: absent tool = graceful WARN).
//
// Coverage here:
//   - pjass PRESENT (skipped with a message when it is not in the test env):
//     good JASS builds + validates PASS, broken JASS FAILS the build with
//     the pjass error + line, validate-map FAILs a packed broken .j,
//     grammar mode ignores undeclared natives (no common.j supplied).
//   - pjass ABSENT (always runs, via the WC3_PJASS deterministic switch):
//     checkJassSyntax reports checked:false, build-map packs with a warning,
//     validate-map emits the "packed unchecked" WARN and still exits 0.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const { checkJassSyntax, findPjass } = require(path.join(ROOT, 'lib', 'jasscheck'));

const PJASS = findPjass();
const NO_PJASS_ENV = { ...process.env, WC3_PJASS: path.join(os.tmpdir(), 'no-such-pjass') };

function run(tool, args, env) {
  return spawnSync('node', [path.join(ROOT, 'tools', tool), ...args],
    { encoding: 'utf8', env: env || process.env });
}

// Turn a copy of maps/demo into a minimal JASS map source (scriptLanguage 0
// + war3map.j instead of war3map.lua).
function makeJassSource(dir, jassText) {
  fs.cpSync(path.join(ROOT, 'maps', 'demo'), dir, { recursive: true });
  fs.rmSync(path.join(dir, 'war3map.lua'));
  fs.rmSync(path.join(dir, 'constants.json'), { force: true });
  const infoPath = path.join(dir, 'info.json');
  const info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
  info.scriptLanguage = 0; // JASS
  fs.writeFileSync(infoPath, JSON.stringify(info, null, 2));
  fs.writeFileSync(path.join(dir, 'war3map.j'), jassText);
}

const GOOD_JASS = [
  'function config takes nothing returns nothing',
  '    call SetMapName("jass gate test")',
  '    call SetPlayers(2)',
  '    call SetTeams(2)',
  '    call DefineStartLocation(0, -1024., 0.)',
  '    call DefineStartLocation(1, 1024., 0.)',
  'endfunction',
  '',
  'function main takes nothing returns nothing',
  '    call DisplayTextToPlayer(Player(0), 0., 0., "hello")',
  'endfunction',
  '',
].join('\n');

const BROKEN_JASS = [
  'function main takes nothing returns nothing',
  '    local integer i = ', // missing initializer expression
  'endfunction',
  '',
].join('\n');

test('checkJassSyntax degrades gracefully when pjass is unavailable', () => {
  const r = checkJassSyntax(GOOD_JASS, { env: NO_PJASS_ENV });
  assert.strictEqual(r.checked, false);
  assert.match(r.reason, /pjass not installed/);
});

test('checkJassSyntax: grammar mode accepts natives, rejects syntax errors', { skip: PJASS ? false : 'pjass not available in this environment (scripts/setup.sh builds it when a C toolchain is present)' }, () => {
  // no common.j/Blizzard.j supplied -> grammar-only: undeclared natives OK
  const good = checkJassSyntax(GOOD_JASS);
  assert.deepStrictEqual(good, { checked: true, mode: 'grammar', errors: [] });

  // a function starting on LINE 1 pins the pjass first-function annotation
  // quirk workaround (the grammar-mode newline shim in lib/jasscheck.js)
  const line1 = checkJassSyntax('function f takes nothing returns nothing\n    call SomeNative(1)\nendfunction\n');
  assert.deepStrictEqual(line1.errors, [], 'undeclared native in a line-1 function must be ignored in grammar mode');

  const bad = checkJassSyntax(BROKEN_JASS);
  assert.strictEqual(bad.checked, true);
  assert.strictEqual(bad.errors.length, 1);
  // pjass reports the incomplete expression when the NEXT line's token
  // arrives (line 3, 'endfunction'); the assert pins that the grammar-mode
  // newline shim is compensated (uncompensated it would read 4).
  assert.strictEqual(bad.errors[0].line, 3, 'line number refers to the text as given (shim compensated)');
  assert.match(bad.errors[0].message, /syntax error/);
});

test('build-map: broken war3map.j fails the build when pjass is present', { skip: PJASS ? false : 'pjass not available in this environment' }, () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'wc3-jasscheck-'));
  try {
    const src = path.join(work, 'src');
    makeJassSource(src, BROKEN_JASS);
    const out = path.join(work, 'bad.w3x');
    const res = run('build-map.js', [src, out]);
    assert.notStrictEqual(res.status, 0, 'build must fail');
    assert.match(res.stderr, /war3map\.j: pjass/, 'names the file and checker');
    assert.match(res.stderr, /line \d+: syntax error/, 'reports the line');
    assert.ok(!fs.existsSync(out), 'no .w3x is produced');
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
});

test('build-map + validate-map: good JASS map builds and passes the jass gate', { skip: PJASS ? false : 'pjass not available in this environment' }, () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'wc3-jasscheck-'));
  try {
    const src = path.join(work, 'src');
    makeJassSource(src, GOOD_JASS);
    const out = path.join(work, 'good.w3x');
    let res = run('build-map.js', [src, out]);
    assert.strictEqual(res.status, 0, res.stderr);
    res = run('validate-map.js', [out]);
    assert.strictEqual(res.status, 0, res.stderr);
    assert.match(res.stdout, /PASS {2}jass syntax war3map\.j {2}\(pjass grammar check OK\)/);

    // pack a broken .j into the same members: validate must FAIL the layer
    const extracted = path.join(work, 'extracted');
    res = run('w3x-extract.js', [out, extracted]);
    assert.strictEqual(res.status, 0, res.stderr);
    fs.writeFileSync(path.join(extracted, 'war3map.j'), BROKEN_JASS);
    const bad = path.join(work, 'bad.w3x');
    res = run('w3x-pack.js', [extracted, bad]);
    assert.strictEqual(res.status, 0, res.stderr);
    res = run('validate-map.js', [bad]);
    assert.notStrictEqual(res.status, 0, 'validate must fail');
    assert.match(res.stdout, /FAIL {2}jass syntax war3map\.j\s+\(line \d+: syntax error/);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
});

test('pjass absent: build warns + packs unchecked, validate WARNs and exits 0', () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'wc3-jasscheck-'));
  try {
    const src = path.join(work, 'src');
    makeJassSource(src, GOOD_JASS);
    const out = path.join(work, 'unchecked.w3x');
    let res = run('build-map.js', [src, out], NO_PJASS_ENV);
    assert.strictEqual(res.status, 0, res.stderr);
    assert.match(res.stderr, /war3map\.j packed unchecked \(pjass not installed\)/);
    res = run('validate-map.js', [out], NO_PJASS_ENV);
    assert.strictEqual(res.status, 0, 'pjass absence must never fail the map');
    assert.match(res.stdout, /WARN {2}jass syntax war3map\.j {2}\(war3map\.j packed unchecked \(pjass not installed\)\)/);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
});
