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
// With no directories, every maps/*/tests/ suite runs. --coverage
// additionally loads each map in the sim (config() + main() + 30 virtual
// seconds) and reports which natives ran with real semantics vs fell
// through to the recording auto-stub tier — stubs are inert, so anything
// logic-relevant in that list means the sim is not simulating it.
//
//   node tools/test-map-logic.js maps/northreach
//   node tools/test-map-logic.js --coverage
//   npm run test:logic

const fs = require('fs');
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

function printCoverage(mapDir) {
  const { loadMap } = require('../lib/sim');
  const name = path.basename(mapDir);
  try {
    const sim = loadMap(mapDir);
    sim.advance(30);
    const { implemented, stubbed } = sim.coverage();
    console.log(`\n== ${name}: native coverage after config() + main() + 30s ==`);
    console.log(`  real semantics (${implemented.length}): ${implemented.join(', ')}`);
    console.log(`  auto-stubbed   (${stubbed.length}): ${stubbed.join(', ') || '(none)'}`);
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

  if (coverage) for (const dir of dirs) printCoverage(dir);

  if (files.length > 0) {
    console.log(`\nrunning ${files.length} logic-test file(s): ${files.map((f) => path.relative(ROOT, f)).join(', ')}\n`);
    const res = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit', cwd: ROOT });
    process.exitCode = res.status === null ? 1 : res.status;
  }
}

if (require.main === module) main(process.argv.slice(2));
