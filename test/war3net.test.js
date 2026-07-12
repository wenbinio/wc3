'use strict';
// War3Net v6 cross-validator + wtg/wct trigger dump (scripts/
// crossvalidate-war3net.sh). OPTIONAL-PATH doctrine: dotnet is not a
// dependency — the whole suite skips (with a message) when dotnet is absent,
// and degrades to a skip if the checker cannot be built in this environment
// (e.g. NuGet unreachable): a missing optional tool must never fail the
// toolkit's tests.
//
// Bundled map sources ship no war3map.wtg (WE-only file — the game reads the
// compiled script, gotcha 10's sibling fact), so the fixture is SYNTHETIC:
// the script's --make-sample-triggers mode has War3Net itself write a
// minimal wtg + wct (our own artifact), which --dump-triggers must then read
// back and dump as JSON under the _triggers/ underscore path.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'crossvalidate-war3net.sh');

const HAS_DOTNET = spawnSync('dotnet', ['--version'], { encoding: 'utf8' }).status === 0;

function runScript(...args) {
  return spawnSync('bash', [SCRIPT, ...args], { encoding: 'utf8' });
}

test('War3Net v6: synthetic wtg/wct round-trips through the --dump-triggers mode', { skip: HAS_DOTNET ? false : 'dotnet not installed (War3Net third opinion is optional)' }, (t) => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'wc3-war3net-'));
  try {
    const mk = runScript('--make-sample-triggers', work);
    if (mk.status !== 0) {
      // dotnet exists but the checker could not be built (NuGet unreachable,
      // SDK too old, ...) — optional path, degrade to a skip, loudly.
      t.skip(`War3Net checker unavailable in this environment: ${String(mk.stderr).trim().split('\n').pop()}`);
      return;
    }
    assert.ok(fs.existsSync(path.join(work, 'war3map.wtg')), 'sample wtg written');
    assert.ok(fs.existsSync(path.join(work, 'war3map.wct')), 'sample wct written');

    const dump = runScript('--dump-triggers', work);
    assert.strictEqual(dump.status, 0, dump.stdout + dump.stderr);
    assert.match(dump.stdout, /PASS {2}war3map\.wtg/);
    assert.match(dump.stdout, /PASS {2}war3map\.wct/);

    const wtg = JSON.parse(fs.readFileSync(path.join(work, '_triggers', 'war3map.wtg.json'), 'utf8'));
    assert.strictEqual(wtg._type, 'MapTriggers');
    assert.strictEqual(wtg.FormatVersion, 'v7');
    assert.strictEqual(wtg.TriggerItems.length, 2);
    const types = wtg.TriggerItems.map((i) => i._type);
    assert.deepStrictEqual(types, ['TriggerCategoryDefinition', 'TriggerDefinition']);
    assert.strictEqual(wtg.TriggerItems[0].Name, 'Sample Category');
    assert.strictEqual(wtg.TriggerItems[1].Name, 'Sample Trigger');
    assert.strictEqual(wtg.TriggerItems[1].IsEnabled, true);

    const wct = JSON.parse(fs.readFileSync(path.join(work, '_triggers', 'war3map.wct.json'), 'utf8'));
    assert.strictEqual(wct._type, 'MapCustomTextTriggers');
    assert.strictEqual(wct.CustomTextTriggers.length, 1);
    assert.match(wct.CustomTextTriggers[0].Code, /DoNothing/);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
});

test('War3Net v6: default check mode still parses a bundled modern map (w3i v33 / w3e v12)', { skip: HAS_DOTNET ? false : 'dotnet not installed (War3Net third opinion is optional)' }, (t) => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'wc3-war3net-'));
  try {
    const res = spawnSync('node',
      [path.join(ROOT, 'tools', 'w3x-extract.js'), path.join(ROOT, 'maps', 'builds', 'demo.w3x'), work],
      { encoding: 'utf8' });
    assert.strictEqual(res.status, 0, res.stderr);
    const check = runScript(work);
    if (check.status !== 0 && !/FAIL {2}/.test(check.stdout)) {
      // nonzero without a parse FAIL = the checker itself could not run
      // (dotnet/NuGet environment problem) — optional path, skip loudly
      t.skip(`War3Net checker unavailable in this environment: ${String(check.stderr).trim().split('\n').pop()}`);
      return;
    }
    assert.strictEqual(check.status, 0, check.stdout + check.stderr);
    assert.match(check.stdout, /PASS {2}war3map\.w3i/);
    assert.match(check.stdout, /PASS {2}war3map\.w3e/);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
});
