'use strict';
// Script LINE coverage for the logic sim (lib/sim/coverage.js + the vm.js
// line hook + the loadMap wiring) — audit Tier-2 item 4.
//
// Doctrine under test: coverage OBSERVES, never perturbs. A run without
// coverage installs no debug hook at all; a run with coverage produces the
// exact same sim behavior plus a line report.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { loadMap } = require('../lib/sim');
const { analyzePacked, lineReport, mergeDumps } = require('../lib/sim/coverage');
const { injectConstantsIntoLua } = require('../lib/constants');
const { injectUnitsIntoLua } = require('../lib/unitscript');

const SCRIPT = [
  'function config()',      // 1
  'end',                    // 2
  '-- comment line',        // 3
  'function DeadCode()',    // 4
  '  print("never")',       // 5
  '  print("ever")',        // 6
  'end',                    // 7
  '',                       // 8
  'function main()',        // 9
  '  local x =',            // 10  (multi-line statement: VM events fire on 11)
  '    5',                  // 11
  '  if x > 3 then',        // 12
  '    x = x + 1',          // 13
  '  else',                 // 14
  '    x = 0',              // 15
  '  end',                  // 16
  'end',                    // 17
].join('\n');

test('line hook collects hits for the map chunk; coverage off installs no hook', () => {
  const on = loadMap(null, { script: SCRIPT, lineCoverage: true });
  const lines = on.coverage().lines;
  assert.ok(lines, 'coverage-on run reports line data');
  // executable = decl 1, decl 4, prints 5+6, decl 9, local 10, if 12,
  // then 13, else-branch 15 — comments/blank/end/else lines are NOT counted
  assert.equal(lines.source.executable, 9);
  // missed: DeadCode body (5, 6) and the else branch (15)
  assert.equal(lines.source.hit, 6);
  // hook is observable only on the coverage run — a normal run has none
  assert.equal(on.run('return debug.gethook()')[0], 'external hook');
  const off = loadMap(null, { script: SCRIPT });
  assert.equal(off.coverage().lines, null, 'no line report without coverage');
  assert.equal(off.run('return debug.gethook()')[0], undefined, 'no debug hook installed');
});

test('coverage does not perturb the run (same script, same behavior)', () => {
  const script = [
    'function config() end',
    'function main()',
    '  SeedableRandomDistReset = nil', // plain global write, keeps chunk deterministic
    '  for i = 1, 3 do',
    '    DisplayTextToPlayer(Player(0), 0, 0, "beat " .. i .. " " .. GetRandomInt(1, 100))',
    '  end',
    'end',
  ].join('\n');
  const a = loadMap(null, { script });
  const b = loadMap(null, { script, lineCoverage: true });
  assert.deepStrictEqual(
    b.messages.map((m) => m.text),
    a.messages.map((m) => m.text),
    'seeded RNG + messages identical with the hook installed'
  );
  assert.deepStrictEqual(b.calls, a.calls, 'recorded native calls identical');
});

test('harness/test chunks are not counted — only the map chunk', () => {
  const sim = loadMap(null, { script: 'function main() end', lineCoverage: true });
  const before = sim.coverage().lines.source.hit;
  sim.run('local a = 1\nlocal b = 2\nlocal c = 3'); // '@<test>' chunk
  assert.equal(sim.coverage().lines.source.hit, before, 'test-chunk lines not attributed');
});

test('multi-line statements count once, at their start line', () => {
  const sim = loadMap(null, { script: SCRIPT, lineCoverage: true });
  const lines = sim.coverage().lines;
  // `local x =\n 5` (lines 10-11): fengari fires the event on line 11; the
  // hit must be attributed to the statement's start line 10, which is the
  // only executable line of the pair.
  const missedLines = new Set();
  for (const r of lines.source.missedRanges) {
    for (let l = r.start; l <= r.end; l++) missedLines.add(l);
  }
  assert.ok(!missedLines.has(10), 'multi-line local statement is hit at its start line');
});

test('missedRanges collapse: whole dead functions become named units, the rest bare ranges', () => {
  const sim = loadMap(null, { script: SCRIPT, lineCoverage: true });
  const ranges = sim.coverage().lines.source.missedRanges;
  assert.deepStrictEqual(ranges, [
    { kind: 'function', name: 'DeadCode', start: 4, end: 7 },
    { kind: 'range', start: 15, end: 15, within: 'main' },
  ]);
});

test('separate misses with a hit line between stay separate ranges', () => {
  const script = [
    'function main()',   // 1
    '  local a = Cond',  // 2
    '  if a then',       // 3
    '    print(1)',      // 4  missed
    '  end',             // 5
    '  local b = 2',     // 6  hit
    '  if a then',       // 7
    '    print(2)',      // 8  missed
    '  end',             // 9
    'end',               // 10
  ].join('\n');
  const sim = loadMap(null, { script, lineCoverage: true });
  const ranges = sim.coverage().lines.source.missedRanges;
  assert.deepStrictEqual(ranges, [
    { kind: 'range', start: 4, end: 4, within: 'main' },
    { kind: 'range', start: 8, end: 8, within: 'main' },
  ]);
});

test('member-expression function names are attributed (Lib.fn / obj:m)', () => {
  const script = [
    'Lib = {}',
    'function Lib.never()',
    '  print(1)',
    'end',
    'function main() end',
  ].join('\n');
  const sim = loadMap(null, { script, lineCoverage: true });
  const fn = sim.coverage().lines.source.missedRanges.find((r) => r.kind === 'function');
  assert.equal(fn.name, 'Lib.never');
});

test('offset mapping: generated blocks excluded from source, counted separately', () => {
  const user = [
    'function config()',   // source 1
    'end',                 // source 2
    'function main()',     // source 3
    '  CreateAllUnits()',  // source 4
    '  local dead = Never', // source 5 (we will mark it missed)
    'end',                 // source 6
  ].join('\n');
  const entries = [{
    constName: 'UNIT_HFOO', luaValue: 'FourCC("hfoo")', rawcode: 'hfoo',
    displayName: 'Footman', source: 'objects-units.json', index: {},
  }];
  const units = [{ type: 'hfoo', player: 0, position: [0, 0], rotation: 0 }];
  let packed = injectUnitsIntoLua(user, units);
  packed = injectConstantsIntoLua(packed, entries);

  const geo = analyzePacked(packed);
  assert.ok(geo.constOffset > 0, 'constants block detected above the user script');
  assert.ok(Number.isFinite(geo.unitsBegin), 'CreateAllUnits block detected below');

  // Hit everything EXCEPT the packed line of source line 5.
  const missPacked = 5 + geo.constOffset;
  const hits = [...geo.executable].filter((l) => l !== missPacked);
  const rep = lineReport(packed, hits);

  // user executable lines: config decl (1), main decl (3), call (4), local (5)
  assert.equal(rep.source.executable, 4, 'only user statements in the source denominator');
  assert.equal(rep.source.hit, 3);
  assert.deepStrictEqual(rep.source.missedRanges, [
    { kind: 'range', start: 5, end: 5, within: 'main' },
  ], 'packed line maps back to SOURCE line 5 (gotcha 27d offset)');
  assert.ok(rep.generated.executable > 0, 'generated statements counted in their own bucket');
  assert.equal(rep.generated.hit, rep.generated.executable);
});

test('end-to-end on a real map source: demo under lineCoverage', () => {
  const demo = path.join(__dirname, '..', 'maps', 'demo');
  const sim = loadMap(demo, { lineCoverage: true });
  sim.advance(5);
  const lines = sim.coverage().lines;
  assert.ok(lines.generated.executable > 0, 'demo has generated CreateAllUnits/constants statements');
  assert.ok(lines.source.executable > 0);
  assert.ok(lines.source.hit > 0);
  assert.ok(lines.source.pct >= 0 && lines.source.pct <= 100);
});

test('WC3_SIM_LINECOV_DIR dump + mergeDumps aggregation (child process)', () => {
  const covDir = fs.mkdtempSync(path.join(os.tmpdir(), 'w3xlinecovtest-'));
  try {
    const demo = path.join(__dirname, '..', 'maps', 'demo');
    const child = require('child_process').spawnSync(process.execPath, ['-e', `
      const { loadMap } = require(${JSON.stringify(path.join(__dirname, '..', 'lib', 'sim'))});
      loadMap(${JSON.stringify(demo)});
      loadMap(${JSON.stringify(demo)});
    `], { env: Object.assign({}, process.env, { WC3_SIM_LINECOV_DIR: covDir }) });
    assert.equal(child.status, 0, String(child.stderr));
    const merged = mergeDumps(covDir);
    const entry = merged.get(path.resolve(demo));
    assert.ok(entry, 'dump keyed by resolved map dir');
    assert.equal(entry.runs, 2, 'both loadMap runs aggregated');
    assert.ok(entry.hits.size > 0, 'hit lines recorded');
  } finally {
    fs.rmSync(covDir, { recursive: true, force: true });
  }
});
