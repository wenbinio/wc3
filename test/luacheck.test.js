'use strict';
// Lua syntax gate: a map source whose war3map.lua does not parse must fail
// the build with the parse error and line number (a broken script otherwise
// packs fine and the game loads a silently dead map), and validate-map must
// flag a packed map whose war3map.lua is broken. Also pins that luaparse's
// 5.3 grammar accepts the Lua 5.3 features map scripts may use.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const { checkLuaSyntax } = require(path.join(ROOT, 'lib', 'luacheck'));

function run(tool, ...args) {
  return spawnSync('node', [path.join(ROOT, 'tools', tool), ...args], { encoding: 'utf8' });
}

test('checkLuaSyntax accepts Lua 5.3 features and all bundled map scripts', () => {
  const lua53 = 'local a = 7 // 2\nlocal b = (5 & 3) | (1 ~ 2)\nlocal c = 1 << 4 >> 2\ngoto done\n::done::\n';
  assert.strictEqual(checkLuaSyntax(lua53), null, 'Lua 5.3 operators/goto must parse');
  for (const m of ['demo', 'crossroads-siege', 'tidewatch-arena']) {
    const src = fs.readFileSync(path.join(ROOT, 'maps', m, 'war3map.lua'), 'utf8');
    assert.strictEqual(checkLuaSyntax(src), null, `${m}/war3map.lua must parse`);
  }
  const err = checkLuaSyntax('function broken(\n');
  assert.ok(err, 'broken lua must be rejected');
  assert.strictEqual(typeof err.line, 'number', 'error carries a line number');
});

test('build-map fails a broken-lua map source with the parse error + line', () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'wc3-luacheck-'));
  try {
    const src = path.join(work, 'broken-src');
    fs.cpSync(path.join(ROOT, 'maps', 'demo'), src, { recursive: true });
    // Break the script mid-file so the reported line number is meaningful.
    const luaPath = path.join(src, 'war3map.lua');
    const lines = fs.readFileSync(luaPath, 'utf8').split('\n');
    lines.splice(3, 0, 'function broken( -- unterminated parameter list');
    fs.writeFileSync(luaPath, lines.join('\n'));

    const out = path.join(work, 'broken.w3x');
    const res = run('build-map.js', src, out);
    assert.notStrictEqual(res.status, 0, 'build must fail');
    assert.match(res.stderr, /war3map\.lua: Lua syntax error/, 'names the file and problem');
    assert.match(res.stderr, /at line \d+/, 'reports a line number');
    assert.ok(!fs.existsSync(out), 'no .w3x is produced');
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
});

test('validate-map flags a packed map whose war3map.lua is broken', () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'wc3-luacheck-'));
  try {
    // Build a good map, unpack-style edit: rebuild from a source whose lua is
    // valid, then pack a variant with the broken script via w3x-pack.
    const src = path.join(work, 'src');
    fs.cpSync(path.join(ROOT, 'maps', 'demo'), src, { recursive: true });
    const good = path.join(work, 'good.w3x');
    let res = run('build-map.js', src, good);
    assert.strictEqual(res.status, 0, res.stderr);
    res = run('validate-map.js', good);
    assert.strictEqual(res.status, 0, res.stderr);
    assert.match(res.stdout, /PASS {2}lua syntax war3map\.lua/, 'good map passes the lua check');

    // Now pack the same members but with a syntactically broken script.
    const extracted = path.join(work, 'extracted');
    res = run('w3x-extract.js', good, extracted);
    assert.strictEqual(res.status, 0, res.stderr);
    fs.appendFileSync(path.join(extracted, 'war3map.lua'), '\nfunction broken(\n');
    const bad = path.join(work, 'bad.w3x');
    res = run('w3x-pack.js', extracted, bad);
    assert.strictEqual(res.status, 0, res.stderr);
    res = run('validate-map.js', bad);
    assert.notStrictEqual(res.status, 0, 'validate must fail');
    assert.match(res.stdout, /FAIL {2}lua syntax war3map\.lua\s+\(line \d+/, 'reports the parse error line');
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
});
