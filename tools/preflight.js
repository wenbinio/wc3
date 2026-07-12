#!/usr/bin/env node
'use strict';
// preflight.js [--json[=file]] [--no-logic] [--no-validate] [--no-crossexec]
//              [--coverage-floor <pct>] [--locals-warn <n>] [<map-source-dir> ...]
//
// ONE-SHOT pre-playtest gate: automates the whole confidence program of
// docs/reference/preflight-2026-07.md so it never needs re-deriving. One
// invocation -> every check -> one PASS/WARN/FAIL verdict per map + overall
// exit code (0 = no FAILs anywhere; WARNs never fail a map). No args = every
// bundled map source under maps/ (maps/builds excluded). `npm run preflight`.
//
// CHEAPNESS IS THE POINT: each map is built ONCE into a temp dir via the real
// build-map machinery (that single build already runs the luaparse gate, the
// generated-constant lint, the strict imports/ model-sanity bar, the pjass
// gate and wpm/shd/minimap generation — check 1 counts them all as covered),
// then every other check reads that one artifact/extraction. Slow tiers are
// opt-OUT-able, never cut: --no-logic (the map's own tests/*.test.js suite),
// --no-validate (the full validate-map layer stack), --no-crossexec (native
// lua5.3 cross-execution).
//
// CHECK CATALOG (ids are stable; tests and --json consumers key on them):
//   build            build-map succeeds (implies: luaparse, constlint, strict
//                    import-model sanity, pjass gate, wpm/shd/minimap autogen)
//   build-warnings   WARN row when the build emitted warnings (gotcha 8 etc.)
//   validate         tools/validate-map layers: FAIL if any layer fails;
//                    WARN count surfaced (WARNs don't fail — validate policy)
//   w3i-weather      pick-time: no literal ASCII '0000' (0x30303030) bytes in
//                    the w3i weather field (gotcha 11 — the picker rejects it)
//   header-flags     pick-time: HM3W flags nonzero AND == readW3iFlags(w3i)
//                    (gotcha 13); bare-MPQ container = WARN (no pre-header)
//   forces           pick-time: w3i forces non-empty + every player covered
//                    by a force (gotcha 18's `forces: []` divergence)
//   lobby-teams      pick-time: with Use Custom Forces + Fixed Player
//                    Settings, every SetPlayerTeam(Player(n), m) in the
//                    packed config() names a force m containing player n
//                    (gotcha 18 — the greyed-out-Create bug)
//   minimap          pick-time: preview image present + parses (TGA dims/bpp
//                    or BLP magic) AND war3map.mmp holds >= 1 start-location
//                    icon per w3i player (gotcha 12)
//   trigstr          pick-time: every TRIGSTR_n referenced by info.json /
//                    objects-*.json resolves in strings.json, and the HM3W
//                    header name equals the resolved w3i name (gotcha 17)
//   start-locations  pick-time: w3i players == units.json slocs ==
//                    DefineStartLocation calls, coordinates matching
//   model-fields     load-time: object-data model fields use .mdl and
//                    war3mapImported model refs resolve to a member after
//                    .mdl<->.mdx normalization (gotcha 22) — FAIL here (our
//                    own pre-playtest sources; validate-map keeps it WARN)
//   imports-resolve  load-time: EVERY war3mapImported\ string in object data
//                    resolves to an archive member (icons too, not just
//                    model fields)
//   object-lint      WARN row for the remaining lib/objectlint.js heuristics
//                    (gotchas 23/25 — identity leaks, builder w/o repair)
//   script-language  runtime: info.json scriptLanguage matches the packed
//                    script file (gotcha 7)
//   create-all-units runtime: generated CreateAllUnits() present + invoked
//                    when units.json places units (gotcha 10)
//   chunk-locals     runtime: main-chunk declared locals vs Lua's 200 cap
//                    (gotcha 28) — WARN above --locals-warn (default 150),
//                    FAIL at >= 200; count matches `luac -l` locvars exactly
//                    (incl. the 3 internal control vars per for loop)
//   camera-bounds    runtime: info.json camera bounds inside the terrain
//                    extent (PIPELINE §3) — WARN only
//   luac-compile     cross-exec (OPTIONAL native lua5.3, smpq/pjass pattern):
//                    the packed script loads under the 64-bit reference
//                    implementation (real syntax + real 200-locals
//                    enforcement); absent = WARN "unchecked"
//   prng-portability cross-exec: detect a Park-Miller/Schrage PRNG block
//                    (pattern-based on the Schrage constants 16807/127773/
//                    2836 — not map-name-specific) and, when found, run a
//                    reduced 3-seeds x 10k-draws cross-check (fengari 32-bit
//                    vs native lua5.3 64-bit) asserting byte-identical
//                    integer output (gotcha 29). Draw values are compared as
//                    floor(x * 2^31) — which recovers the exact Park-Miller
//                    state — because fengari's string.format("%.17g") is NOT
//                    C-faithful for floats (it prints JS shortest-round-trip
//                    form), so formatted floats can never be byte-compared
//                    across the two implementations.
//   bitwise-ops      cross-exec: WARN on any Lua bitwise operator in the
//                    packed script (& | ~ << >>) — the integer-width-
//                    sensitive class of gotcha 29 (AST-based; comments can't
//                    false-positive)
//   nondeterminism   cross-exec: WARN on math.random/os.time/os.clock/
//                    os.date references (sim-unreplayable randomness,
//                    gotchas 29/30) and GetLocalPlayer (desync class)
//   logic-tests      logic tier: run maps/<name>/tests/*.test.js through
//                    node --test (the test-map-logic convention); FAIL on
//                    failing tests, WARN when a map has NO logic tests
//   line-coverage    logic tier: script line coverage aggregated from that
//                    run (lib/sim/coverage.js); WARN below --coverage-floor
//                    (default 60% — the floor catches maps with no
//                    meaningful tests, it does not chase 95%)
//
// HONESTY: a full PASS is still not game acceptance. The residual risks the
// preflight doc lists as untestable without the game (ability data-field
// interpretation, pathing/reachability, stock-asset path typos, engine base-
// class edge behavior, multiplayer interleavings, render perf) are printed
// at the end of every run so a PASS is never overread.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const luaparse = require('luaparse');

const { buildMap } = require('./build-map');
const { validate } = require('./validate-map');
const { extractAll } = require('../lib/mpq');
const { hasHM3W, parseHeader, readW3iFlags } = require('../lib/header');
const { byWar, byJson, jsonToWar } = require('../lib/filemap');
const { lintObjectData } = require('../lib/objectlint');
const { walk, readJson } = require('../lib/source');

const ROOT = path.join(__dirname, '..');

// wc3maptranslator's force-membership dialect: force.players holds WE color
// names, index == playerNum (same table the translator itself uses).
const COLOR_NAMES = Object.values(require('wc3maptranslator/dist/src/PlayerBitfield').Player);

const RESIDUAL_RISKS = [
  'ability data-field interpretation (custom abilities on stock bases) — no headless ability engine',
  'pathing / spatial reachability — region triggers assume units can WALK there; the sim teleports',
  'stock-asset path typos (icons/models referenced by in-game path) — unverifiable without game data',
  'engine edge behaviors of base unit classes (critter wander, targeting, ...)',
  'multiplayer latency interleavings of chat/commitment ordering',
  'rendering performance of custom MDX under the real client',
  'anything WARNed above on a headroom threshold (e.g. chunk locals) — safe today, tight for future edits',
];

// ---------------------------------------------------------------------------
// small helpers

function resolveTrigstr(value, strings) {
  if (typeof value !== 'string' || !strings) return value;
  const m = /^TRIGSTR_(\d+)$/.exec(value);
  if (!m) return value;
  const entry = strings[String(Number(m[1]))];
  return entry && typeof entry.value === 'string' ? entry.value : value;
}

function readJsonIf(p) {
  return fs.existsSync(p) ? readJson(p) : null;
}

function isExecutable(p) {
  try {
    fs.accessSync(p, fs.constants.X_OK);
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

// Native 64-bit Lua 5.3 discovery — the WC3_PJASS pattern (lib/jasscheck.js):
// WC3_LUA53 is authoritative when set (a non-executable value = "treat as
// not installed", no PATH fallback — the tests' deterministic absence
// switch); else `lua5.3` on PATH; else `lua` on PATH if -v reports 5.3.
function findLua53(env) {
  env = env || process.env;
  if (env.WC3_LUA53 !== undefined && env.WC3_LUA53 !== '') {
    return isExecutable(env.WC3_LUA53) ? env.WC3_LUA53 : null;
  }
  for (const dir of String(env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    const cand = path.join(dir, 'lua5.3');
    if (isExecutable(cand)) return cand;
  }
  for (const dir of String(env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    const cand = path.join(dir, 'lua');
    if (!isExecutable(cand)) continue;
    const r = spawnSync(cand, ['-v'], { encoding: 'utf8' });
    if (/Lua 5\.3/.test(String(r.stdout || '') + String(r.stderr || ''))) return cand;
  }
  return null;
}

// ---------------------------------------------------------------------------
// AST helpers (single parse of the packed script, shared by several checks)

function parseLua(luaText, opts) {
  return luaparse.parse(luaText, { luaVersion: '5.3', comments: false, ...opts });
}

// Main-chunk declared locals, matching `luac5.3 -l`'s locvars count exactly
// (calibrated against all five bundled maps): every `local` name declared
// outside any function body, plus the loop-control variables Lua's compiler
// generates for chunk-level for loops (3 internals + the user vars).
function countChunkLocals(ast) {
  let count = 0;
  const walkBlock = (stmts) => { for (const st of stmts || []) walkStmt(st); };
  function walkStmt(st) {
    if (!st || typeof st !== 'object') return;
    switch (st.type) {
      case 'LocalStatement': count += st.variables.length; return;
      case 'FunctionDeclaration': if (st.isLocal) count += 1; return; // own scope
      case 'IfStatement': for (const c of st.clauses) walkBlock(c.body); return;
      case 'WhileStatement':
      case 'RepeatStatement':
      case 'DoStatement': walkBlock(st.body); return;
      case 'ForNumericStatement': count += 4; walkBlock(st.body); return;
      case 'ForGenericStatement': count += 3 + st.variables.length; walkBlock(st.body); return;
      default: return;
    }
  }
  walkBlock(ast.body);
  return count;
}

// One full-AST sweep collecting the width/determinism findings: bitwise
// operators (& | ~ << >>, unary ~) and references to math.random/os.time/
// os.clock/os.date/GetLocalPlayer. AST-based so comments never match.
const BITWISE_BINOPS = new Set(['&', '|', '~', '<<', '>>']);
const NONDET_MEMBERS = new Set(['math.random', 'os.time', 'os.clock', 'os.date']);
function scanWidthAndNondeterminism(ast) {
  const bitwise = [];
  const nondet = [];
  (function visit(node) {
    if (Array.isArray(node)) { for (const n of node) visit(n); return; }
    if (!node || typeof node !== 'object' || typeof node.type !== 'string') return;
    if (node.type === 'BinaryExpression' && BITWISE_BINOPS.has(node.operator)) {
      bitwise.push({ op: node.operator, line: node.loc && node.loc.start.line });
    } else if (node.type === 'UnaryExpression' && node.operator === '~') {
      bitwise.push({ op: '~ (unary)', line: node.loc && node.loc.start.line });
    } else if (node.type === 'MemberExpression' && node.indexer === '.'
        && node.base && node.base.type === 'Identifier'
        && node.identifier && node.identifier.type === 'Identifier') {
      const name = `${node.base.name}.${node.identifier.name}`;
      if (NONDET_MEMBERS.has(name)) nondet.push({ name, line: node.loc && node.loc.start.line });
    } else if (node.type === 'Identifier' && node.name === 'GetLocalPlayer') {
      nondet.push({ name: 'GetLocalPlayer', line: node.loc && node.loc.start.line });
    }
    for (const k of Object.keys(node)) {
      if (k === 'type' || k === 'loc' || k === 'range') continue;
      visit(node[k]);
    }
  })(ast);
  return { bitwise, nondet };
}

// ---------------------------------------------------------------------------
// PRNG detection + reduced cross-check (gotcha 29, pattern-based)

const SCHRAGE_CONSTANTS = [16807, 127773, 2836]; // Park-Miller via Schrage

function collectNumericLiterals(node, out) {
  if (Array.isArray(node)) { for (const n of node) collectNumericLiterals(n, out); return out; }
  if (!node || typeof node !== 'object') return out;
  if (node.type === 'NumericLiteral') out.add(node.value);
  for (const k of Object.keys(node)) {
    if (k === 'type' || k === 'range' || k === 'loc') continue;
    collectNumericLiterals(node[k], out);
  }
  return out;
}

function collectAssignedIdentifiers(node, out) {
  if (Array.isArray(node)) { for (const n of node) collectAssignedIdentifiers(n, out); return out; }
  if (!node || typeof node !== 'object') return out;
  if (node.type === 'AssignmentStatement') {
    for (const v of node.variables) if (v.type === 'Identifier') out.add(v.name);
  }
  for (const k of Object.keys(node)) {
    if (k === 'type' || k === 'range' || k === 'loc') continue;
    collectAssignedIdentifiers(node[k], out);
  }
  return out;
}

// Detect a map-owned Park-Miller/Schrage PRNG: a global function whose body
// uses all three Schrage constants (the draw fn) plus a second global
// function assigning the same state variable (the seed fn; the one holding
// 2147483646/2147483647 preferred). Data-driven — nothing vaults-specific.
// Returns { seedName, nextName, chunk } or null.
function detectSchragePrng(luaText) {
  const ast = parseLua(luaText, { ranges: true });
  const fns = ast.body.filter((s) => s.type === 'FunctionDeclaration' && !s.isLocal
    && s.identifier && s.identifier.type === 'Identifier');
  let next = null;
  for (const f of fns) {
    const lits = collectNumericLiterals(f.body, new Set());
    if (SCHRAGE_CONSTANTS.every((c) => lits.has(c))) { next = f; break; }
  }
  if (!next) return null;
  const stateVars = collectAssignedIdentifiers(next.body, new Set());
  let seed = null;
  for (const f of fns) {
    if (f === next) continue;
    const assigns = collectAssignedIdentifiers(f.body, new Set());
    if (![...assigns].some((n) => stateVars.has(n))) continue;
    const lits = collectNumericLiterals(f.body, new Set());
    if (lits.has(2147483646) || lits.has(2147483647)) { seed = f; break; }
    if (!seed) seed = f;
  }
  if (!seed) return null;
  const slice = (n) => luaText.slice(n.range[0], n.range[1]);
  return {
    seedName: seed.identifier.name,
    nextName: next.identifier.name,
    chunk: slice(seed) + '\n' + slice(next) + '\n',
  };
}

// Reduced cross-check: seeds x draws through the extracted PRNG chunk on
// BOTH implementations, emitting integers only — floor(x * 2^31) recovers
// the exact Park-Miller state (state/(2^31-1) * 2^31 floors back to state),
// and the two floor mappings are the RandInt class real map code uses.
// Integer emission because fengari's %.17g float formatting is not
// C-faithful (see header) — values, not formatting, are what must match.
function crossCheckPrng(prng, lua53, opts) {
  const seeds = (opts && opts.prngSeeds) || [3, 424242, 999999999];
  const draws = (opts && opts.prngDraws) || 10000;
  const driver = (emit) => prng.chunk + `
local acc = {}
for _, s in ipairs({${seeds.join(', ')}}) do
  ${prng.seedName}(s)
  for i = 1, ${draws} do
    local x = ${prng.nextName}()
    acc[#acc + 1] = string.format("%d %d %d", math.floor(x * 2147483648.0), 1 + math.floor(x * 100), 1 + math.floor(x * 6))
  end
end
${emit}
`;
  // 32-bit side: fengari via the sim's own VM wrapper (lib/sim/vm.js)
  const { createVM } = require('../lib/sim/vm');
  const vm = createVM();
  vm.run(driver('__PRNG_RESULT = table.concat(acc, "\\n")'), '@prng-crosscheck');
  const fengariOut = vm.getGlobal('__PRNG_RESULT');
  // 64-bit side: native lua5.3
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'w3xprng-'));
  try {
    const drv = path.join(tmp, 'driver.lua');
    fs.writeFileSync(drv, driver('io.write(table.concat(acc, "\\n"))'));
    const r = spawnSync(lua53, [drv], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
    if (r.status !== 0) {
      return { ok: false, detail: `native lua5.3 failed running the extracted PRNG chunk: ${String(r.stderr || '').trim().split('\n')[0]}` };
    }
    const identical = fengariOut === r.stdout;
    return {
      ok: identical,
      detail: identical
        ? `${prng.seedName}/${prng.nextName}: ${seeds.length} seeds x ${draws} draws + 2 floor mappings bit-identical (32-bit fengari vs 64-bit lua5.3)`
        : `${prng.seedName}/${prng.nextName}: 32-bit fengari and 64-bit lua5.3 DIVERGE over ${seeds.length} seeds x ${draws} draws — integer-width-portability bug (gotcha 29)`,
    };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// individual pick-time / load-time helpers (exported for unit tests)

// Literal ASCII '0000' (0x30303030) in the w3i weather field = a map the
// picker rejects (gotcha 11). The translator reads BOTH four zero bytes and
// four ASCII zeros as the JSON dialect '0000', so the check must look at the
// bytes; a found '0000' substring is attributed by re-serializing the parsed
// JSON both ways and matching bytes (a '0000' inside a text string is fine).
function checkW3iWeatherBytes(w3iBuf) {
  const ascii = Buffer.from('0000', 'latin1');
  if (!w3iBuf.includes(ascii)) return { ok: true, detail: 'no ASCII 0x30303030 bytes in war3map.w3i' };
  const entry = byWar.get('war3map.w3i');
  try {
    const { warToJson } = require('../lib/filemap');
    const json = warToJson(entry, w3iBuf);
    if (jsonToWar(entry, { ...json, globalWeather: '' }).buffer.equals(w3iBuf)) {
      return { ok: true, detail: "ASCII '0000' bytes present but weather field is four zero BYTES (a text field contains the substring)" };
    }
    if (jsonToWar(entry, { ...json, globalWeather: '0000' }).buffer.equals(w3iBuf)) {
      return { ok: false, detail: 'weather field is literal ASCII 0x30303030 — the map picker rejects it (gotcha 11: never bypass lib/source.js for info.json)' };
    }
    return { ok: false, warnOnly: true, detail: "ASCII '0000' bytes present in war3map.w3i but could not be attributed (w3i is not a translator fixed point) — verify the weather field manually" };
  } catch (e) {
    return { ok: false, warnOnly: true, detail: `ASCII '0000' bytes present and the w3i could not be parsed to attribute them (${String(e.message || e).split('\n')[0]})` };
  }
}

// Lobby wiring, best source first: EXECUTE config() in the sim (lib/sim —
// Lua maps only; sees loop-generated and constant-indexed calls, exactly
// what the game's lobby sees) and harvest the recorded SetPlayerTeam /
// DefineStartLocation / SetPlayerStartLocation native calls. Falls back to
// a literal-call scan of the script text (JASS maps, or a script the sim
// cannot load) — that fallback misses loop-generated calls, so consumers
// downgrade to WARN when it comes back empty.
function harvestLobbyFromSim(mapDir) {
  const { loadMap } = require('../lib/sim');
  const sim = loadMap(mapDir, { main: false }); // config() only: lobby wiring lives there
  const pnum = (h) => Number(String(h).split(':')[1]);
  return {
    source: 'sim(config())',
    teams: sim.callsOf('SetPlayerTeam').map((c) => ({ player: pnum(c.args[0]), team: c.args[1] })),
    defines: sim.callsOf('DefineStartLocation').map((c) => ({ index: c.args[0], x: c.args[1], y: c.args[2] })),
    startLocs: new Map(sim.callsOf('SetPlayerStartLocation').map((c) => [pnum(c.args[0]), c.args[1]])),
  };
}

function parseLobbyCalls(packedLua) {
  const teams = [];
  const defines = [];
  const startLocs = new Map(); // playerNum -> start-location index
  let m;
  const teamRe = /SetPlayerTeam\s*\(\s*Player\s*\(\s*(\d+)\s*\)\s*,\s*(\d+)\s*\)/g;
  while ((m = teamRe.exec(packedLua)) !== null) teams.push({ player: Number(m[1]), team: Number(m[2]) });
  const defRe = /DefineStartLocation\s*\(\s*(\d+)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/g;
  while ((m = defRe.exec(packedLua)) !== null) defines.push({ index: Number(m[1]), x: Number(m[2]), y: Number(m[3]) });
  const slRe = /SetPlayerStartLocation\s*\(\s*Player\s*\(\s*(\d+)\s*\)\s*,\s*(\d+)\s*\)/g;
  while ((m = slRe.exec(packedLua)) !== null) startLocs.set(Number(m[1]), Number(m[2]));
  return { source: 'literal-scan', teams, defines, startLocs };
}

// Recursively collect every string value in a JSON tree matching pred.
function collectStrings(node, pred, out) {
  if (typeof node === 'string') {
    if (pred(node)) out.push(node);
  } else if (Array.isArray(node)) {
    for (const v of node) collectStrings(v, pred, out);
  } else if (node && typeof node === 'object') {
    for (const v of Object.values(node)) collectStrings(v, pred, out);
  }
  return out;
}

// ---------------------------------------------------------------------------
// the per-map preflight

// opts: { logic, validate, crossexec (default true), coverageFloor (60),
//         localsWarn (150), prngDraws, prngSeeds, env (process.env), keepW3x }
function preflightMap(mapDir, opts) {
  opts = opts || {};
  const env = opts.env || process.env;
  const t0 = Date.now();
  const checks = [];
  const add = (id, status, detail) => checks.push({ id, status, detail });
  const guarded = (id, fn) => {
    try { fn(); } catch (e) { add(id, 'FAIL', `check crashed: ${String(e.message || e).split('\n')[0]}`); }
  };
  const finish = () => {
    const failures = checks.filter((c) => c.status === 'FAIL').length;
    const warnings = checks.filter((c) => c.status === 'WARN').length;
    return {
      dir: path.relative(ROOT, path.resolve(mapDir)) || mapDir,
      name: path.basename(path.resolve(mapDir)),
      verdict: failures > 0 ? 'FAIL' : warnings > 0 ? 'WARN' : 'PASS',
      failures,
      warnings,
      checks,
      ms: Date.now() - t0,
    };
  };

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'w3xpreflight-'));
  const w3xPath = path.join(tmp, 'preflight.w3x');
  const xdir = path.join(tmp, 'extracted');
  try {
    // 1. build (covers: luaparse gate, constlint, strict import-model
    //    sanity, pjass gate, wpm/shd/minimap generation — see build-map)
    let build;
    try {
      build = buildMap(mapDir, w3xPath, {});
      add('build', 'PASS',
        `${build.bytes} bytes, ${build.files.length} members (covers luaparse + constlint + import-model sanity + pjass + wpm/shd/minimap autogen)`);
    } catch (e) {
      add('build', 'FAIL', String(e.message || e).split('\n').slice(0, 2).join(' '));
      return finish(); // nothing downstream can run without an artifact
    }
    if (build.warnings && build.warnings.length > 0) {
      add('build-warnings', 'WARN', build.warnings.map((w) => String(w).split('\n')[0]).join('; '));
    }

    extractAll(w3xPath, xdir);
    const members = walk(xdir);
    const packedLuaPath = path.join(xdir, 'war3map.lua');
    const packedLua = fs.existsSync(packedLuaPath) ? fs.readFileSync(packedLuaPath, 'utf8') : null;
    const w3iBuf = fs.existsSync(path.join(xdir, 'war3map.w3i'))
      ? fs.readFileSync(path.join(xdir, 'war3map.w3i')) : null;
    const w3xBuf = fs.readFileSync(w3xPath);
    const info = readJsonIf(path.join(mapDir, 'info.json'));
    const units = readJsonIf(path.join(mapDir, 'units.json')) || [];
    const strings = readJsonIf(path.join(mapDir, 'strings.json'));
    let lobby = { source: 'none', teams: [], defines: [], startLocs: new Map() };
    const jassPath = ['war3map.j', 'scripts/war3map.j'].map((s) => path.join(xdir, s)).find((p) => fs.existsSync(p));
    if (info && info.scriptLanguage === 1 && packedLua) {
      try {
        lobby = harvestLobbyFromSim(mapDir); // executes config() — sees loops
      } catch {
        lobby = parseLobbyCalls(packedLua); // sim couldn't load: literal scan
      }
    } else if (packedLua || jassPath) {
      lobby = parseLobbyCalls(packedLua || fs.readFileSync(jassPath, 'utf8'));
    }
    let ast = null;
    if (packedLua) {
      try { ast = parseLua(packedLua, { locations: true }); } catch { /* build already gated syntax */ }
    }

    // 2. validate-map layers (opt-out: --no-validate)
    if (opts.validate !== false) {
      guarded('validate', () => {
        const results = validate(w3xPath);
        const fails = results.filter((r) => !r.pass && !r.warn);
        const warns = results.filter((r) => r.warn);
        if (fails.length > 0) {
          add('validate', 'FAIL', `${fails.length} layer(s) fail: ` + fails.slice(0, 3).map((r) => `${r.name} (${r.detail})`).join('; '));
        } else {
          add('validate', 'PASS', `${results.length - warns.length} layers pass, ${warns.length} WARN(s)`
            + (warns.length > 0 ? ': ' + warns.slice(0, 3).map((r) => r.name).join('; ') + (warns.length > 3 ? ` (+${warns.length - 3} more)` : '') : ''));
        }
      });
    } else {
      add('validate', 'WARN', 'skipped (--no-validate)');
    }

    // 3. pick-time class ----------------------------------------------------
    guarded('w3i-weather', () => {
      if (!w3iBuf) { add('w3i-weather', 'FAIL', 'no war3map.w3i in the archive'); return; }
      const r = checkW3iWeatherBytes(w3iBuf);
      add('w3i-weather', r.ok ? 'PASS' : r.warnOnly ? 'WARN' : 'FAIL', r.detail);
    });

    guarded('header-flags', () => {
      if (!hasHM3W(w3xBuf)) {
        add('header-flags', 'WARN', 'bare MPQ container (no HM3W pre-header, 1.31+ clients only) — flags mirror check n/a');
        return;
      }
      const h = parseHeader(w3xBuf);
      const w3iFlags = w3iBuf ? readW3iFlags(w3iBuf) : null;
      if (h.flags === 0) add('header-flags', 'FAIL', 'HM3W header flags are 0 — a pick-time divergence every tool notices (gotcha 13)');
      else if (w3iFlags === null) add('header-flags', 'WARN', `HM3W flags 0x${h.flags.toString(16)} but the w3i flags dword could not be read`);
      else if (h.flags !== w3iFlags) add('header-flags', 'FAIL', `HM3W flags 0x${h.flags.toString(16)} != w3i flags 0x${w3iFlags.toString(16)} (WE mirrors them, gotcha 13)`);
      else add('header-flags', 'PASS', `HM3W flags == w3i flags == 0x${h.flags.toString(16)} (nonzero)`);
    });

    guarded('forces', () => {
      if (!info) { add('forces', 'FAIL', 'no info.json in the map source'); return; }
      const forces = info.forces || [];
      if (forces.length === 0) { add('forces', 'FAIL', 'forces: [] — a pick-time divergence (gotcha 18)'); return; }
      const uncovered = (info.players || []).filter((p) =>
        !forces.some((f) => (f.players || []).includes(COLOR_NAMES[p.playerNum])));
      if (uncovered.length > 0) {
        add('forces', 'FAIL', `player(s) ${uncovered.map((p) => p.playerNum).join(', ')} belong to no force`);
      } else {
        add('forces', 'PASS', `${forces.length} force(s) cover all ${(info.players || []).length} player(s)`);
      }
    });

    guarded('lobby-teams', () => {
      if (!info) { add('lobby-teams', 'FAIL', 'no info.json'); return; }
      const flags = (info.map && info.map.flags) || {};
      if (!(flags.useCustomForces && flags.fixedPlayerSetting)) {
        add('lobby-teams', 'PASS', 'custom forces / fixed player settings off — lobby arrangement is free (gotcha 18 n/a)');
        return;
      }
      if (lobby.teams.length === 0) {
        add('lobby-teams', 'WARN', `custom forces on but no SetPlayerTeam calls observed (source: ${lobby.source}) — verify config() manually`);
        return;
      }
      const forces = info.forces || [];
      const bad = lobby.teams.filter(({ player, team }) => {
        const force = forces[team];
        return !force || !(force.players || []).includes(COLOR_NAMES[player]);
      });
      if (bad.length > 0) {
        add('lobby-teams', 'FAIL',
          bad.map(({ player, team }) => `SetPlayerTeam(Player(${player}), ${team}) has no matching w3i force`).join('; ')
          + ' — the locked lobby has no valid arrangement (gotcha 18: greyed-out Create)');
      } else {
        add('lobby-teams', 'PASS', `${lobby.teams.length} SetPlayerTeam call(s) (${lobby.source}) all match a w3i force containing that player`);
      }
    });

    guarded('minimap', () => {
      const problems = [];
      const facts = [];
      const tgaPath = path.join(xdir, 'war3mapMap.tga');
      const blpPath = path.join(xdir, 'war3mapMap.blp');
      if (fs.existsSync(tgaPath)) {
        const tga = fs.readFileSync(tgaPath);
        const type = tga.readUInt8(2);
        const w = tga.readUInt16LE(12);
        const h = tga.readUInt16LE(14);
        const bpp = tga.readUInt8(16);
        if (![2, 10].includes(type) || w === 0 || h === 0 || ![24, 32].includes(bpp)) {
          problems.push(`war3mapMap.tga malformed (type=${type} ${w}x${h} ${bpp}bpp)`);
        } else facts.push(`tga ${w}x${h} ${bpp}bpp`);
      } else if (fs.existsSync(blpPath)) {
        const magic = fs.readFileSync(blpPath).toString('latin1', 0, 4);
        if (magic !== 'BLP1' && magic !== 'BLP2') problems.push(`war3mapMap.blp bad magic ${JSON.stringify(magic)}`);
        else facts.push(`blp (${magic})`);
      } else {
        problems.push('no war3mapMap.tga/.blp packed — the picker shows nothing (gotcha 12)');
      }
      const mmpPath = path.join(xdir, 'war3map.mmp');
      if (!fs.existsSync(mmpPath)) {
        problems.push('no war3map.mmp packed (gotcha 12)');
      } else {
        const mmp = fs.readFileSync(mmpPath);
        let startIcons = 0;
        if (mmp.length >= 8) {
          const count = mmp.readInt32LE(4);
          for (let i = 0; i < count && 8 + i * 16 + 16 <= mmp.length; i++) {
            if (mmp.readInt32LE(8 + i * 16) === 2) startIcons++;
          }
        }
        const wanted = info ? (info.players || []).length : 0;
        if (startIcons < wanted) problems.push(`war3map.mmp has ${startIcons} start-location icon(s) for ${wanted} w3i player(s)`);
        else facts.push(`mmp ${startIcons} start-location icon(s) for ${wanted} player(s)`);
      }
      add('minimap', problems.length > 0 ? 'FAIL' : 'PASS', (problems.concat(facts)).join('; '));
    });

    guarded('trigstr', () => {
      const refs = [];
      const isTrigstr = (s) => /^TRIGSTR_\d+$/.test(s);
      if (info) collectStrings(info, isTrigstr, refs);
      for (const [jsonName, entry] of byJson) {
        if (!entry.objectType) continue;
        const json = readJsonIf(path.join(mapDir, jsonName));
        if (json) collectStrings(json, isTrigstr, refs);
      }
      const missing = [...new Set(refs)].filter((r) => resolveTrigstr(r, strings) === r);
      const problems = [];
      if (missing.length > 0) problems.push(`dangling TRIGSTR reference(s): ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ` (+${missing.length - 5})` : ''}`);
      if (hasHM3W(w3xBuf) && info && info.map) {
        const headerName = parseHeader(w3xBuf).name;
        const w3iName = resolveTrigstr(info.map.name, strings);
        if (headerName !== w3iName) {
          problems.push(`HM3W header name ${JSON.stringify(headerName)} != resolved w3i name ${JSON.stringify(w3iName)} (gotcha 17)`);
        }
      }
      add('trigstr', problems.length > 0 ? 'FAIL' : 'PASS',
        problems.length > 0 ? problems.join('; ')
          : `${new Set(refs).size} distinct TRIGSTR reference(s) all resolve; header name matches w3i name`);
    });

    guarded('start-locations', () => {
      if (!info) { add('start-locations', 'FAIL', 'no info.json'); return; }
      const players = info.players || [];
      const slocs = units.filter((u) => u && u.type === 'sloc');
      const problems = [];
      if (players.length !== slocs.length) problems.push(`${players.length} w3i player(s) vs ${slocs.length} units.json sloc(s)`);
      // A literal scan that saw NO defines proves nothing (calls may be
      // loop-generated) — skip the script side then; the sim source is exact.
      const scriptSide = lobby.source === 'sim(config())' || lobby.defines.length > 0;
      if (scriptSide && lobby.defines.length !== players.length) {
        problems.push(`${lobby.defines.length} DefineStartLocation call(s) vs ${players.length} w3i player(s)`);
      }
      const near = (a, b) => Math.abs(a - b) <= 0.51;
      for (const p of players) {
        const sloc = slocs.find((u) => u.player === p.playerNum);
        if (sloc && !(near(sloc.position[0], p.startingPos.x) && near(sloc.position[1], p.startingPos.y))) {
          problems.push(`player ${p.playerNum}: sloc (${sloc.position[0]}, ${sloc.position[1]}) != w3i startingPos (${p.startingPos.x}, ${p.startingPos.y})`);
        }
        if (scriptSide && lobby.defines.length > 0) {
          const locIdx = lobby.startLocs.has(p.playerNum) ? lobby.startLocs.get(p.playerNum) : p.playerNum;
          const def = lobby.defines.find((d) => d.index === locIdx);
          if (!def) problems.push(`player ${p.playerNum}: no DefineStartLocation(${locIdx}, ...) observed (${lobby.source})`);
          else if (!(near(def.x, p.startingPos.x) && near(def.y, p.startingPos.y))) {
            problems.push(`player ${p.playerNum}: DefineStartLocation(${locIdx}, ${def.x}, ${def.y}) != w3i startingPos (${p.startingPos.x}, ${p.startingPos.y})`);
          }
        }
      }
      add('start-locations', problems.length > 0 ? 'FAIL' : 'PASS',
        problems.length > 0 ? problems.slice(0, 4).join('; ')
          : `${players.length} player(s) == ${slocs.length} sloc(s) == ${lobby.defines.length} DefineStartLocation call(s) (${lobby.source}), coordinates match`);
    });

    // 4. load-time class ----------------------------------------------------
    const objectFiles = [];
    for (const [jsonName, entry] of byJson) {
      if (!entry.objectType) continue;
      const json = readJsonIf(path.join(mapDir, jsonName));
      if (json) objectFiles.push({ war: entry.war, objectType: entry.objectType, json, jsonName });
    }

    guarded('model-fields', () => {
      const findings = lintObjectData(objectFiles, members);
      // gotcha-22 class (load/render breakage) FAILS preflight; the identity/
      // builder heuristics (gotchas 23/25) stay WARN like validate-map.
      const hard = findings.filter((f) => /ends in \.mdx|matches no archive member/.test(f.message));
      const soft = findings.filter((f) => !hard.includes(f));
      if (hard.length > 0) {
        add('model-fields', 'FAIL', hard.slice(0, 3).map((f) => `${f.file} ${f.objectId}: ${f.message.split(' — ')[0]}`).join('; ') + (hard.length > 3 ? ` (+${hard.length - 3})` : ''));
      } else {
        add('model-fields', 'PASS', 'all object-data model fields use .mdl and resolve (gotcha 22)');
      }
      if (soft.length > 0) {
        add('object-lint', 'WARN', soft.slice(0, 3).map((f) => `${f.file} ${f.objectId}: ${f.message.split(' — ')[0].split(' ("')[0]}`).join('; ') + (soft.length > 3 ? ` (+${soft.length - 3})` : ''));
      }
    });

    guarded('imports-resolve', () => {
      const memberSet = new Set(members.map((m) => m.replace(/\\/g, '/').toLowerCase()));
      const refs = [];
      for (const of_ of objectFiles) {
        collectStrings(of_.json, (s) => /^war3mapimported\\/i.test(s), refs);
      }
      const missing = [...new Set(refs)].filter((r) => {
        const n = r.replace(/\\/g, '/').toLowerCase();
        const cands = [n, n.replace(/\.mdl$/, '.mdx'), n.replace(/\.mdx$/, '.mdl')];
        return !cands.some((c) => memberSet.has(c));
      });
      if (missing.length > 0) {
        add('imports-resolve', 'FAIL', `unresolved war3mapImported reference(s): ${missing.slice(0, 4).join(', ')}${missing.length > 4 ? ` (+${missing.length - 4})` : ''}`);
      } else {
        add('imports-resolve', 'PASS', `${new Set(refs).size} war3mapImported reference(s) all resolve to archive members`);
      }
    });

    // 5. runtime class ------------------------------------------------------
    guarded('script-language', () => {
      if (!info) { add('script-language', 'FAIL', 'no info.json'); return; }
      const hasLua = members.includes('war3map.lua');
      const hasJ = members.includes('war3map.j') || members.includes('scripts/war3map.j');
      if (info.scriptLanguage === 1 && hasLua) add('script-language', 'PASS', 'scriptLanguage 1 (Lua) + war3map.lua packed');
      else if (info.scriptLanguage === 0 && hasJ) add('script-language', 'PASS', 'scriptLanguage 0 (JASS) + war3map.j packed');
      else add('script-language', 'FAIL', `scriptLanguage ${info.scriptLanguage} but packed scripts: ${[hasLua && 'war3map.lua', hasJ && 'war3map.j'].filter(Boolean).join(', ') || 'none'} (gotcha 7)`);
    });

    guarded('create-all-units', () => {
      const placed = units.filter((u) => u && u.type !== 'sloc');
      if (placed.length === 0) { add('create-all-units', 'PASS', 'no preplaced units in units.json — n/a'); return; }
      if (!packedLua) { add('create-all-units', 'FAIL', `${placed.length} preplaced unit(s) but no packed war3map.lua (JASS maps write their own CreateAllUnits)`); return; }
      const defined = packedLua.includes('function CreateAllUnits()');
      const invoked = /(?<!function\s)CreateAllUnits\s*\(\s*\)/.test(packedLua);
      if (defined && invoked) add('create-all-units', 'PASS', `generated block present + invoked (${placed.length} preplaced unit(s))`);
      else add('create-all-units', 'FAIL', `CreateAllUnits ${defined ? '' : 'NOT defined'}${!defined && !invoked ? ' and ' : ''}${invoked ? '' : 'never invoked'} — preplaced units will not spawn (gotcha 10)`);
    });

    guarded('chunk-locals', () => {
      if (!ast) { add('chunk-locals', packedLua ? 'WARN' : 'PASS', packedLua ? 'packed script did not parse for the locals count' : 'no Lua script — n/a'); return; }
      const count = countChunkLocals(ast);
      const warnAt = opts.localsWarn ?? 150;
      const detail = `${count} declared main-chunk locals (headroom ${200 - count} to Lua's 200-per-function cap, gotcha 28)`;
      if (count >= 200) add('chunk-locals', 'FAIL', detail + ' — the chunk will refuse to LOAD');
      else if (count > warnAt) add('chunk-locals', 'WARN', detail + ` — above the ${warnAt} warning threshold; add future script-level state as globals only`);
      else add('chunk-locals', 'PASS', detail);
    });

    guarded('camera-bounds', () => {
      const terrain = readJsonIf(path.join(mapDir, 'terrain.json'));
      if (!info || !terrain || !info.camera || !Array.isArray(info.camera.bounds)) {
        add('camera-bounds', 'PASS', 'no camera bounds / terrain to compare — n/a');
        return;
      }
      const left = terrain.map.offset.x;
      const bottom = terrain.map.offset.y;
      const right = left + terrain.map.width * 128;
      const top = bottom + terrain.map.height * 128;
      const b = info.camera.bounds; // 4 corner points (x, y)
      const outside = [];
      for (let i = 0; i + 1 < b.length; i += 2) {
        if (b[i] < left || b[i] > right || b[i + 1] < bottom || b[i + 1] > top) outside.push(`(${b[i]}, ${b[i + 1]})`);
      }
      if (outside.length > 0) add('camera-bounds', 'WARN', `camera bound point(s) ${outside.join(' ')} outside the terrain extent [${left}, ${bottom}]..[${right}, ${top}]`);
      else add('camera-bounds', 'PASS', 'camera bounds inside the terrain extent');
    });

    // 6. 64-bit cross-execution (OPTIONAL native lua5.3) ---------------------
    if (opts.crossexec !== false && packedLua) {
      const lua53 = findLua53(env);
      guarded('luac-compile', () => {
        if (!lua53) { add('luac-compile', 'WARN', 'unchecked (lua5.3 not installed) — scripts/setup.sh installs it when apt is available'); return; }
        const t = fs.mkdtempSync(path.join(os.tmpdir(), 'w3xluac-'));
        try {
          const scriptPath = path.join(t, 'packed.lua');
          const checkerPath = path.join(t, 'check.lua');
          fs.writeFileSync(scriptPath, packedLua);
          // loadfile compiles without running: real 5.3 syntax + the real
          // 200-locals-per-function enforcement (luac -p equivalent).
          fs.writeFileSync(checkerPath,
            'local f, err = loadfile((...))\nif not f then io.stderr:write(tostring(err) .. "\\n") os.exit(1) end\n');
          const r = spawnSync(lua53, [checkerPath, scriptPath], { encoding: 'utf8' });
          if (r.status === 0) add('luac-compile', 'PASS', 'packed war3map.lua compiles under native 64-bit Lua 5.3 (reference syntax + real 200-locals enforcement)');
          else add('luac-compile', 'FAIL', `native lua5.3 refuses the packed script: ${String(r.stderr || '').trim().split('\n')[0]}`);
        } finally {
          fs.rmSync(t, { recursive: true, force: true });
        }
      });

      guarded('prng-portability', () => {
        const prng = detectSchragePrng(packedLua);
        if (!prng) { add('prng-portability', 'PASS', 'no seeded Park-Miller/Schrage PRNG block detected — n/a (engine randomness is not sim-replayable anyway, gotcha 29)'); return; }
        if (!lua53) { add('prng-portability', 'WARN', `PRNG block detected (${prng.seedName}/${prng.nextName}) but unchecked (lua5.3 not installed)`); return; }
        const r = crossCheckPrng(prng, lua53, opts);
        add('prng-portability', r.ok ? 'PASS' : 'FAIL', r.detail);
      });
    } else {
      add('luac-compile', 'WARN', packedLua ? 'skipped (--no-crossexec)' : 'no packed war3map.lua — n/a');
      add('prng-portability', 'WARN', packedLua ? 'skipped (--no-crossexec)' : 'no packed war3map.lua — n/a');
    }

    if (ast) {
      guarded('bitwise-ops', () => {
        const { bitwise, nondet } = scanWidthAndNondeterminism(ast);
        if (bitwise.length > 0) {
          add('bitwise-ops', 'WARN', `${bitwise.length} bitwise operator(s) in the packed script (first: ${bitwise[0].op} at packed line ${bitwise[0].line}) — integer-width-sensitive between the 32-bit sim and the 64-bit game (gotcha 29)`);
        } else {
          add('bitwise-ops', 'PASS', 'no bitwise operators in the packed script');
        }
        if (nondet.length > 0) {
          const names = [...new Set(nondet.map((n) => n.name))];
          add('nondeterminism', 'WARN', `${names.join(', ')} referenced (first at packed line ${nondet[0].line}) — sim-unreplayable randomness / desync class (gotchas 29-30)`);
        } else {
          add('nondeterminism', 'PASS', 'no math.random/os.time/os.clock/os.date/GetLocalPlayer references');
        }
      });
    }

    // 7. logic tier (opt-out: --no-logic) ------------------------------------
    if (opts.logic !== false) {
      guarded('logic-tests', () => {
        const testsDir = path.join(mapDir, 'tests');
        const testFiles = fs.existsSync(testsDir)
          ? fs.readdirSync(testsDir).filter((f) => /\.test\.(js|cjs|mjs)$/.test(f)).map((f) => path.join(testsDir, f))
          : [];
        if (testFiles.length === 0) {
          add('logic-tests', 'WARN', 'no tests/*.test.js — the sim never executes this map\'s mechanics (PIPELINE §8)');
          add('line-coverage', 'WARN', 'n/a (no logic tests to aggregate coverage from)');
          return;
        }
        const covDir = fs.mkdtempSync(path.join(os.tmpdir(), 'w3xpfcov-'));
        try {
          const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...testFiles], {
            encoding: 'utf8',
            cwd: ROOT,
            maxBuffer: 256 * 1024 * 1024,
            env: { ...env, WC3_SIM_LINECOV_DIR: covDir },
          });
          const tap = String(r.stdout || '');
          const num = (k) => { const m = new RegExp(`^# ${k} (\\d+)`, 'm').exec(tap); return m ? Number(m[1]) : null; };
          const tests = num('tests');
          const failed = num('fail');
          if (r.status !== 0 || failed === null || failed > 0) {
            add('logic-tests', 'FAIL', `${failed ?? '?'} of ${tests ?? '?'} logic test(s) failed (run: node tools/test-map-logic.js ${path.relative(ROOT, mapDir)})`);
          } else {
            add('logic-tests', 'PASS', `${tests} logic test(s) in ${testFiles.length} file(s), all pass`);
          }
          // line coverage aggregated from that same run (lib/sim/coverage.js)
          const { mergeDumps, lineReport } = require('../lib/sim/coverage');
          const merged = mergeDumps(covDir).get(path.resolve(mapDir));
          if (!merged || !packedLua) {
            add('line-coverage', 'WARN', 'no line-coverage data collected from the test run');
          } else {
            const lines = lineReport(packedLua, merged.hits).source;
            const floor = opts.coverageFloor ?? 60;
            const detail = `${lines.pct}% (${lines.hit}/${lines.executable} executable source lines across ${merged.runs} sim run(s); floor ${floor}%)`;
            add('line-coverage', lines.pct < floor ? 'WARN' : 'PASS',
              lines.pct < floor ? detail + ' — below the floor: mechanics exist that no test walks' : detail);
          }
        } finally {
          fs.rmSync(covDir, { recursive: true, force: true });
        }
      });
    } else {
      add('logic-tests', 'WARN', 'skipped (--no-logic)');
      add('line-coverage', 'WARN', 'skipped (--no-logic)');
    }

    if (opts.keepW3x) fs.copyFileSync(w3xPath, opts.keepW3x);
    return finish();
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// multi-map driver

function discoverBundledMaps() {
  const mapsDir = path.join(ROOT, 'maps');
  if (!fs.existsSync(mapsDir)) return [];
  return fs.readdirSync(mapsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(mapsDir, e.name, 'info.json')))
    .map((e) => path.join(mapsDir, e.name));
}

function preflight(mapDirs, opts) {
  const t0 = Date.now();
  const maps = mapDirs.map((d) => preflightMap(d, opts));
  const failures = maps.reduce((n, m) => n + m.failures, 0);
  const warnings = maps.reduce((n, m) => n + m.warnings, 0);
  return {
    version: 1,
    verdict: failures > 0 ? 'FAIL' : 'PASS',
    failures,
    warnings,
    ms: Date.now() - t0,
    maps,
    residualRisks: RESIDUAL_RISKS,
  };
}

const USAGE = 'usage: node tools/preflight.js [--json[=file]] [--no-logic] [--no-validate] [--no-crossexec] [--coverage-floor <pct>] [--locals-warn <n>] [<map-source-dir> ...]';

function main(argv) {
  const opts = {};
  let jsonOut = null; // false = off, '' = stdout, string = file
  const dirs = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') jsonOut = '';
    else if (a.startsWith('--json=')) jsonOut = a.slice(7);
    else if (a === '--no-logic') opts.logic = false;
    else if (a === '--no-validate') opts.validate = false;
    else if (a === '--no-crossexec') opts.crossexec = false;
    else if (a === '--coverage-floor') opts.coverageFloor = Number(argv[++i]);
    else if (a === '--locals-warn') opts.localsWarn = Number(argv[++i]);
    else if (a.startsWith('--')) { console.error(USAGE + `\nunknown flag ${a}`); process.exit(2); }
    else dirs.push(a);
  }
  const mapDirs = dirs.length > 0 ? dirs : discoverBundledMaps();
  if (mapDirs.length === 0) { console.error(USAGE + '\nno map source dirs found'); process.exit(2); }
  for (const d of mapDirs) {
    if (!fs.existsSync(path.join(d, 'info.json')) && !fs.existsSync(path.join(d, 'war3map.lua')) && !fs.existsSync(path.join(d, 'war3map.j'))) {
      console.error(`not a map source dir (no info.json or map script): ${d}`);
      process.exit(2);
    }
  }

  const result = preflight(mapDirs, opts);

  if (jsonOut === '') {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    const idWidth = Math.max(...result.maps.flatMap((m) => m.checks.map((c) => c.id.length)));
    for (const m of result.maps) {
      console.log(`\n== ${m.name} — ${m.verdict} (${m.failures} FAIL, ${m.warnings} WARN, ${(m.ms / 1000).toFixed(1)}s) ==`);
      for (const c of m.checks) {
        console.log(`${c.status.padEnd(4)}  ${c.id.padEnd(idWidth)}  ${c.detail}`);
      }
    }
    console.log(`\npreflight verdict: ${result.verdict} — ${result.maps.length} map(s), ${result.failures} FAIL, ${result.warnings} WARN (${(result.ms / 1000).toFixed(1)}s total)`);
    console.log('\nNOT checkable headlessly — only the game can test these (docs/reference/preflight-2026-07.md):');
    for (const r of RESIDUAL_RISKS) console.log(`  - ${r}`);
    if (jsonOut) {
      fs.writeFileSync(jsonOut, JSON.stringify(result, null, 2) + '\n');
      console.log(`\nmachine-readable result written to ${jsonOut}`);
    }
  }
  process.exit(result.failures > 0 ? 1 : 0);
}

if (require.main === module) main(process.argv.slice(2));
module.exports = {
  preflight,
  preflightMap,
  discoverBundledMaps,
  RESIDUAL_RISKS,
  // exported for targeted unit tests
  findLua53,
  checkW3iWeatherBytes,
  countChunkLocals,
  detectSchragePrng,
  crossCheckPrng,
  parseLobbyCalls,
};
