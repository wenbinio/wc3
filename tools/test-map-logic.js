#!/usr/bin/env node
'use strict';
// test-map-logic.js [--coverage] [<map-source-dir> ...]
//
// Runs a map's headless LOGIC TESTS: JS test files under
// maps/<name>/tests/*.test.js that execute the map's PACKED war3map.lua in
// the lib/sim harness (real Lua 5.3 VM + mocked WC3 natives) and assert on
// game state — alliances, gold, spawned units, victory/defeat verdicts,
// recorded native calls. The primary convention is node:test JS files (they
// are ALSO auto-discovered by the repo-wide `npm test`); this tool is the
// targeted runner for map development loops.
//
// With no directories, every maps/*/tests/ suite runs. --coverage adds two
// per-map reports (printed AFTER the test run):
//   * NATIVE-CALL coverage — loads the map in the sim (config() + main() +
//     30 virtual seconds) and reports which natives ran with real semantics
//     vs fell through to the recording auto-stub tier. Stubs are inert, so
//     anything logic-relevant in that list means the sim is not simulating
//     it.
//   * script LINE coverage — the test processes run with line collection
//     enabled (WC3_SIM_LINECOV_DIR; lib/sim/coverage.js) and their hits are
//     merged per map: % of executable SOURCE war3map.lua lines any test
//     walked, plus every never-executed range collapsed to whole functions
//     where possible ("which mechanics no test walks" — the five-boss bug
//     class). Generated blocks (constants + CreateAllUnits) are excluded
//     from the source numbers and summarized separately. A map with no
//     tests gets line coverage of the probe run instead, clearly labeled.
//
//   node tools/test-map-logic.js maps/northreach
//   node tools/test-map-logic.js --coverage
//   npm run test:logic

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

function discoverDefaultDirs() {
  const mapsDir = path.join(ROOT, 'maps');
  if (!fs.existsSync(mapsDir)) return [];
  return fs.readdirSync(mapsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(mapsDir, e.name, 'tests')))
    .map((e) => path.join(mapsDir, e.name));
}

function testFilesOf(mapDir) {
  const testsDir = path.join(mapDir, 'tests');
  if (!fs.existsSync(testsDir)) return [];
  return fs.readdirSync(testsDir)
    .filter((f) => /\.test\.(js|cjs|mjs)$/.test(f))
    .map((f) => path.join(testsDir, f));
}

function printLineCoverage(lines, label) {
  const s = lines.source;
  console.log(`  script lines: ${s.pct}% (${s.hit}/${s.executable} executable source lines) — ${label}`);
  if (s.missedRanges.length === 0) {
    console.log('  never executed: (none)');
  } else {
    console.log('  never executed:');
    for (const r of s.missedRanges) {
      const span = r.start === r.end ? `line ${r.start}` : `lines ${r.start}-${r.end}`;
      if (r.kind === 'function') console.log(`    function ${r.name} (${span})`);
      else console.log(`    ${span}${r.within ? ` (in ${r.within})` : ''}`);
    }
  }
  const g = lines.generated;
  console.log(`  generated blocks (constants + CreateAllUnits): ${g.hit}/${g.executable} executable lines hit`);
}

function printCoverage(mapDir, hasTests, mergedLineCov) {
  const { loadMap, assemblePackedLua } = require('../lib/sim');
  const { lineReport } = require('../lib/sim/coverage');
  const name = path.basename(mapDir);
  try {
    // probe run: native coverage (and line coverage when the map has no
    // tests to aggregate — then the probe is the only execution we have)
    const sim = loadMap(mapDir, hasTests ? undefined : { lineCoverage: true });
    sim.advance(30);
    const { implemented, stubbed, lines: probeLines } = sim.coverage();
    console.log(`\n== ${name}: coverage ==`);
    console.log(`  natives after config() + main() + 30s —`);
    console.log(`  real semantics (${implemented.length}): ${implemented.join(', ')}`);
    console.log(`  auto-stubbed   (${stubbed.length}): ${stubbed.join(', ') || '(none)'}`);
    if (hasTests) {
      const merged = mergedLineCov.get(path.resolve(mapDir));
      if (merged) {
        const lines = lineReport(assemblePackedLua(mapDir), merged.hits);
        printLineCoverage(lines, `across ${merged.runs} sim run(s) from the map's logic tests`);
      } else {
        console.log('  script lines: (no line-coverage data collected from the test run)');
      }
    } else if (probeLines) {
      printLineCoverage(probeLines, 'config()+main()+30s probe only — map has no logic tests');
    }
  } catch (e) {
    console.error(`\n== ${name}: FAILED to load in the sim: ${e.message || e}`);
    process.exitCode = 1;
  }
}

function main(argv) {
  const coverage = argv.includes('--coverage');
  let dirs = argv.filter((a) => a !== '--coverage');
  if (dirs.length === 0) dirs = discoverDefaultDirs();
  if (dirs.length === 0) {
    console.error('no map source dirs with tests/ found; usage: node tools/test-map-logic.js [--coverage] [<map-source-dir> ...]');
    process.exit(2);
  }

  let files = [];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      console.error(`map source dir not found: ${dir}`);
      process.exit(2);
    }
    const own = testFilesOf(dir);
    if (own.length === 0 && !coverage) {
      console.error(`warning: ${dir} has no tests/*.test.js logic tests`);
    }
    files = files.concat(own);
  }

  // With --coverage the spawned test processes collect line hits into a
  // scratch dir (lib/sim auto-enables collection under this env var and
  // dumps at process exit); merged after the run. Without --coverage the
  // env var is NOT set and no debug hook is ever installed.
  let covDir = null;
  if (coverage) covDir = fs.mkdtempSync(path.join(os.tmpdir(), 'w3xlinecov-'));

  if (files.length > 0) {
    console.log(`\nrunning ${files.length} logic-test file(s): ${files.map((f) => path.relative(ROOT, f)).join(', ')}\n`);
    const env = coverage
      ? Object.assign({}, process.env, { WC3_SIM_LINECOV_DIR: covDir })
      : process.env;
    const res = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit', cwd: ROOT, env });
    process.exitCode = res.status === null ? 1 : res.status;
  }

  if (coverage) {
    const { mergeDumps } = require('../lib/sim/coverage');
    const merged = mergeDumps(covDir);
    for (const dir of dirs) printCoverage(dir, testFilesOf(dir).length > 0, merged);
    fs.rmSync(covDir, { recursive: true, force: true });
  }
}

if (require.main === module) main(process.argv.slice(2));
