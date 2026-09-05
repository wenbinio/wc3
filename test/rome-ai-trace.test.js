'use strict';
// The Fall of Rome AI harness, wired into `npm test`.
//
// WHY THIS FILE EXISTS. An external audit of scripts/experimental/rome-ai/
// observed that trace.py -- 400+ assertions over the shipped for-ai.j, and
// the only gate that has ever caught a real defect in that module -- was not
// invoked by `npm test` at all. It ran only when an agent remembered to run
// it. That observation was verified and is correct: a gate nobody runs is a
// gate that does not exist, and this repo has already paid for that lesson
// four times (see gotcha 34 and the "instrument that cannot fire" family).
//
// Two harnesses are run here, both of which read their subject FROM THE
// SHIPPED SOURCE so they cannot drift away from it:
//
//   * trace.py       -- interprets a restricted JASS subset of for-ai.j and
//                       asserts on the real decision functions. Exit 0 = no
//                       FAILs. ~2.5s.
//   * parse-events.py --selftest
//                    -- the telemetry parser, including the mission-churn
//                       detector driven against the owner's own logged lines
//                       from the first live run.
//
// OPTIONAL-TOOL PATTERN (the smpq/pjass convention used throughout this
// repo): python3 absent = SKIP with a message, never a failure. The map
// itself is third-party and is never committed, so nothing here needs it --
// both harnesses read only source that lives in the repo.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const AI_DIR = path.join(ROOT, 'scripts', 'experimental', 'rome-ai');

function python() {
  for (const bin of [process.env.WC3_PYTHON, 'python3', 'python']) {
    if (!bin) continue;
    const r = spawnSync(bin, ['-c', 'import sys; print(sys.version_info[0])'],
      { encoding: 'utf8' });
    if (r.status === 0 && (r.stdout || '').trim() === '3') return bin;
  }
  return null;
}

const PY = python();
const HAVE_DIR = fs.existsSync(path.join(AI_DIR, 'trace.py'));

function run(script, args) {
  return spawnSync(PY, [path.join(AI_DIR, script), ...(args || [])],
    { encoding: 'utf8', cwd: AI_DIR, maxBuffer: 32 * 1024 * 1024 });
}

test('rome-ai: trace.py passes every assertion against the shipped for-ai.j', (t) => {
  if (!HAVE_DIR) return t.skip('scripts/experimental/rome-ai not present');
  if (!PY) return t.skip('python3 not installed (optional tool)');
  const r = run('trace.py');
  const out = (r.stdout || '') + (r.stderr || '');
  // A crash must not read as a pass: assert on the exit code AND on the
  // absence of FAIL lines, because the two can diverge (an exception exits
  // non-zero with no FAIL line, a logic failure exits 1 with them).
  const fails = out.split('\n').filter((l) => /\bFAIL\b/.test(l));
  assert.deepStrictEqual(fails, [], `trace.py reported failures:\n${fails.join('\n')}`);
  assert.strictEqual(r.status, 0, `trace.py exited ${r.status}\n${out.slice(-3000)}`);
  // The suite must notice if the harness ever goes quiet: an empty run would
  // otherwise satisfy both checks above. This is the exact failure mode the
  // file's own docstrings warn about.
  const passes = out.split('\n').filter((l) => /\bPASS\b/.test(l)).length;
  assert.ok(passes > 300,
    `trace.py produced only ${passes} PASS lines — the harness has gone quiet`);
});

test('rome-ai: the gate toy holds every outcome and reproduces every reverted defect', (t) => {
  if (!HAVE_DIR) return t.skip('scripts/experimental/rome-ai not present');
  if (!PY) return t.skip('python3 not installed (optional tool)');
  // DESIGN 33: the first closed-loop instrument in the programme. It drives the
  // SHIPPED for-ai.j through a kinematic world for simulated minutes and
  // asserts OUTCOMES (the army is through, the gate is shut again, it never
  // opened into an enemy...), then reverts each shipped gate fix and requires
  // the historical defect to come back as a failed outcome. A PASS line here
  // is a world predicate, not a decision; a NEGATIVE CONTROL line is proof the
  // predicate can fail. ~10s.
  const r = run('gate_toy.py');
  const out = (r.stdout || '') + (r.stderr || '');
  const fails = out.split('\n').filter((l) => /\bFAIL\b/.test(l));
  assert.deepStrictEqual(fails, [], `gate_toy.py reported failures:\n${fails.join('\n')}`);
  assert.strictEqual(r.status, 0, `gate_toy.py exited ${r.status}\n${out.slice(-3000)}`);
  const controls = out.split('\n').filter((l) => /PASS NEGATIVE CONTROL/.test(l)).length;
  assert.ok(controls >= 8,
    `gate_toy.py ran only ${controls} negative controls — the reversions have gone quiet`);
});

test('rome-ai: the telemetry parser self-test passes, incl. the churn detector', (t) => {
  if (!HAVE_DIR) return t.skip('scripts/experimental/rome-ai not present');
  if (!PY) return t.skip('python3 not installed (optional tool)');
  const r = run('parse-events.py', ['--selftest']);
  const out = (r.stdout || '') + (r.stderr || '');
  assert.strictEqual(r.status, 0, `parse-events.py --selftest exited ${r.status}\n${out.slice(-3000)}`);
  // Its negative controls must be present AND passing: the self-test proves
  // truncation, double-extraction and mission churn are all DETECTED, which
  // is the only reason to trust a clean report from a real log.
  for (const needle of ['truncated log is detected',
    'duplicate extraction is detected',
    'restarting on target 108 is flagged']) {
    assert.ok(out.includes(needle), `self-test did not cover: ${needle}`);
  }
  assert.ok(!/\bFAIL\b/.test(out), `self-test reported a failure:\n${out.slice(-3000)}`);
});

test('rome-ai: the apostrophe delta lint runs clean against the shipped module', (t) => {
  if (!HAVE_DIR) return t.skip('scripts/experimental/rome-ai not present');
  if (!PY) return t.skip('python3 not installed (optional tool)');
  // gotcha 34: only the DELTA check holds. There is no baseline war3map.j in
  // the repo (the map is third-party and never committed), so the invariant
  // asserted here is the one that needs no baseline: the module introduces no
  // ASCII apostrophe inside a double-quoted literal at all.
  const src = fs.readFileSync(path.join(AI_DIR, 'for-ai.j'), 'utf8');
  const offenders = (src.match(/"[^"\n]*"/g) || []).filter((s) => s.includes("'"));
  assert.deepStrictEqual(offenders, [],
    `for-ai.j string literals contain ASCII apostrophes: ${offenders.slice(0, 3).join(', ')}`);
});
