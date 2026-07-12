'use strict';
// build-map flags:
//   --stabilize  — the gotcha-6 stabilization cycle in one command: after a
//     successful build the built .w3x is round-tripped and ONLY changed
//     translatable *.json source files are rewritten (never war3map.lua/.j,
//     files/ or imports/ — the copy-the-lua-back trap is structurally
//     impossible). One run reaches the translator fixed point; a second run
//     rewrites nothing.
//   --variant-name <name> — pack-time internal-name overlay for in-game A/B
//     variants (gotcha 17): HM3W header name + w3i map name (TRIGSTR
//     indirection resolved to the plain string), source dir untouched.
//   The two flags are mutually exclusive (the overlay must never be
//   stabilized into the source).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'wc3-buildflags-test-'));
const { parseHeader } = require(path.join(ROOT, 'lib', 'header'));
const { byWar, warToJson } = require(path.join(ROOT, 'lib', 'filemap'));
const { extractAll } = require(path.join(ROOT, 'lib', 'mpq'));

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function snapshot(dir) {
  const out = new Map();
  for (const f of fs.readdirSync(dir, { recursive: true })) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isFile()) out.set(String(f), fs.readFileSync(p));
  }
  return out;
}

test('--stabilize: an unstabilized rotation reaches its fixed point in one run', () => {
  const src = path.join(WORK, 'stab-map');
  fs.cpSync(path.join(ROOT, 'maps', 'demo'), src, { recursive: true });
  // introduce an unstabilized value: 270 degrees goes through float32 radians
  const doodadsPath = path.join(src, 'doodads.json');
  const doodads = readJson(doodadsPath);
  doodads.regular[0].angle = 270;
  fs.writeFileSync(doodadsPath, JSON.stringify(doodads, null, 2) + '\n');

  const luaBefore = fs.readFileSync(path.join(src, 'war3map.lua'));
  const filesBefore = snapshot(path.join(src, 'files'));

  const out1 = execFileSync('node',
    [path.join(ROOT, 'tools', 'build-map.js'), '--stabilize', src, path.join(WORK, 'stab1.w3x')],
    { encoding: 'utf8' });
  assert.match(out1, /stabilize: rewrote 1 source file\(s\): doodads\.json/);
  const angle = readJson(doodadsPath).regular[0].angle;
  assert.notStrictEqual(angle, 270, 'rotation stabilized through float32 radians');
  assert.ok(Math.abs(angle - 270) < 0.1, `still ~270 (got ${angle})`);

  // scripts and opaque files are NEVER touched (gotcha 6's trap)
  assert.ok(fs.readFileSync(path.join(src, 'war3map.lua')).equals(luaBefore), 'war3map.lua untouched');
  for (const [f, buf] of filesBefore) {
    assert.ok(fs.readFileSync(path.join(src, 'files', f)).equals(buf), `files/${f} untouched`);
  }

  // second run: already a fixed point, nothing rewritten
  const out2 = execFileSync('node',
    [path.join(ROOT, 'tools', 'build-map.js'), '--stabilize', src, path.join(WORK, 'stab2.w3x')],
    { encoding: 'utf8' });
  assert.match(out2, /stabilize: source already at its translator fixed point/);
});

test('--variant-name: HM3W header + w3i name (TRIGSTR resolved), source untouched', () => {
  // crossroads-siege stores its w3i name as TRIGSTR_001 — the overlay must
  // resolve/override the indirection so the displayed name actually changes.
  const src = path.join(ROOT, 'maps', 'crossroads-siege');
  assert.strictEqual(readJson(path.join(src, 'info.json')).map.name, 'TRIGSTR_001', 'fixture uses TRIGSTR indirection');
  const before = snapshot(src);

  const w3x = path.join(WORK, 'variant.w3x');
  const out = execFileSync('node',
    [path.join(ROOT, 'tools', 'build-map.js'), '--variant-name', 'Siege DIAG-1 no-sounds', src, w3x],
    { encoding: 'utf8' });
  assert.match(out, /variant name overlay/);

  const header = parseHeader(fs.readFileSync(w3x));
  assert.strictEqual(header.name, 'Siege DIAG-1 no-sounds', 'HM3W header name');
  assert.notStrictEqual(header.flags, 0, 'header flags still mirrored from w3i (gotcha 13)');

  const extractDir = path.join(WORK, 'variant-extract');
  extractAll(w3x, extractDir);
  const info = warToJson(byWar.get('war3map.w3i'), fs.readFileSync(path.join(extractDir, 'war3map.w3i')));
  assert.strictEqual(info.map.name, 'Siege DIAG-1 no-sounds', 'w3i name resolved to the plain variant string');

  // the source directory is byte-identical (constants.json regeneration is a
  // fixed point for a committed source)
  const after = snapshot(src);
  assert.deepStrictEqual([...after.keys()].sort(), [...before.keys()].sort(), 'no files added/removed');
  for (const [f, buf] of before) {
    assert.ok(after.get(f).equals(buf), `${f} untouched by the variant build`);
  }
});

test('--stabilize and --variant-name are mutually exclusive', () => {
  const run = spawnSync('node',
    [path.join(ROOT, 'tools', 'build-map.js'), '--stabilize', '--variant-name', 'X',
      path.join(ROOT, 'maps', 'demo'), path.join(WORK, 'nope.w3x')], { encoding: 'utf8' });
  assert.notStrictEqual(run.status, 0);
  assert.match(run.stderr, /mutually exclusive/);
});

test.after(() => {
  fs.rmSync(WORK, { recursive: true, force: true });
});
