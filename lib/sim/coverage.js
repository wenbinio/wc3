'use strict';
// Script LINE coverage for the headless logic sim (audit Tier-2 item 4).
// Native-call coverage says "which natives ran"; line coverage says "which
// BEATS of the map script no test walks" — the five-boss bug class.
//
// Executable-line definition (pragmatic, statement-granular, LINE coverage
// only — no branch instrumentation):
//   * an EXECUTABLE LINE is the start line of every luaparse statement node
//     (Local/Assignment/Call/Return/Break/Goto/While/Repeat/ForNumeric/
//     ForGeneric/FunctionDeclaration/If — plus IfClause/ElseifClause headers,
//     so an unreached `elseif` arm is a visible miss). DoStatement,
//     ElseClause and LabelStatement keyword lines generate no code and are
//     excluded, as are blank lines, comments and `end` keywords.
//   * a raw VM line event is attributed to the INNERMOST statement whose
//     span contains it, and marks that statement's start line hit. This
//     absorbs fengari's real event placement: multi-line statements fire on
//     continuation lines (`local x =\n  5` fires only line 2) and closure
//     creation fires on the function's `end` line — both attribute to the
//     statement that owns them, so a statement counts once, at its start.
//
// Packed→source mapping (gotcha 27d): the generated constants block is
// PREPENDED (user line 1 = packed line offset+1, offset from the END marker
// exactly as lib/constlint.js computes it) and the generated CreateAllUnits
// block is APPENDED (everything from its BEGIN marker down). Generated-block
// lines are excluded from the source denominator and reported as a separate
// one-line {hit, executable} summary.
//
// Collection is opt-in (loadMap opts.lineCoverage, or the
// WC3_SIM_LINECOV_DIR env var that tools/test-map-logic.js --coverage sets
// for the spawned test processes): a normal run installs NO debug hook —
// zero overhead, nothing for a golden run to observe. The hook itself only
// records line numbers; it never touches Lua-visible state.

const fs = require('fs');
const path = require('path');
const luaparse = require('luaparse');
const { blockOffset } = require('../constlint');
const { BEGIN_MARK: UNITS_BEGIN_MARK } = require('../unitscript');

// Statement-like node types whose start line is executable and which own
// the lines of their span for hit attribution (innermost wins).
const STMT_TYPES = new Set([
  'LocalStatement', 'AssignmentStatement', 'CallStatement', 'ReturnStatement',
  'BreakStatement', 'GotoStatement', 'IfStatement', 'IfClause', 'ElseifClause',
  'WhileStatement', 'RepeatStatement', 'ForNumericStatement',
  'ForGenericStatement', 'FunctionDeclaration',
]);

// "t.a.b" / "t:m" for function names; null for anonymous functions.
function functionName(id) {
  if (!id) return null;
  if (id.type === 'Identifier') return id.name;
  if (id.type === 'MemberExpression') {
    const base = functionName(id.base);
    return base ? `${base}${id.indexer}${id.identifier.name}` : id.identifier.name;
  }
  return null;
}

// Parse the packed script and derive the coverage geometry. Throws only if
// the text does not parse (sim callers have already executed it).
function analyzePacked(packedLua) {
  const ast = luaparse.parse(packedLua, { luaVersion: '5.3', comments: false, locations: true });
  const executable = new Set();   // packed start lines
  const ownerStart = new Map();   // packed line -> owning statement's start line
  const stmtEnd = new Map();      // start line -> max end line of statements starting there
  const functions = [];           // named FunctionDeclarations {name, start, end}

  (function walk(node) {
    if (Array.isArray(node)) { for (const c of node) walk(c); return; }
    if (!node || typeof node !== 'object' || typeof node.type !== 'string') return;
    if (STMT_TYPES.has(node.type) && node.loc) {
      const start = node.loc.start.line;
      const end = node.loc.end.line;
      executable.add(start);
      if (!stmtEnd.has(start) || stmtEnd.get(start) < end) stmtEnd.set(start, end);
      for (let l = start; l <= end; l++) ownerStart.set(l, start);
      if (node.type === 'FunctionDeclaration') {
        const name = functionName(node.identifier);
        if (name) functions.push({ name, start, end });
      }
    }
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'range' || key === 'raw') continue;
      const child = node[key];
      if (child && typeof child === 'object') walk(child);
    }
  })(ast);

  // Generated-block geometry: constants block prepended (lines 1..constOffset
  // incl. the blank separator), CreateAllUnits block appended (unitsBegin on).
  const constOffset = blockOffset(packedLua);
  const lines = packedLua.split('\n');
  let unitsBegin = Infinity;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === UNITS_BEGIN_MARK) { unitsBegin = i + 1; break; }
  }
  return { executable, ownerStart, stmtEnd, functions, constOffset, unitsBegin };
}

function inGenerated(line, geo) {
  return line <= geo.constOffset || line >= geo.unitsBegin;
}

// Collapse the missed SOURCE lines into human-useful units: whole named
// functions first ("function FooBar (lines a-b): never executed" when no
// statement inside the body ever ran), then bare ranges of consecutive
// missed statements (annotated with the enclosing named function, if any).
function collapseMissed(geo, hitStarts) {
  const missed = [...geo.executable]
    .filter((l) => !hitStarts.has(l) && !inGenerated(l, geo))
    .sort((a, b) => a - b);
  const missedSet = new Set(missed);
  const consumed = new Set();
  const ranges = [];

  // Named source-region functions, outermost first, whose whole body missed.
  // The declaration's own start line is excluded from the "did the body run"
  // test (creating the closure hits it even when nothing inside ever runs).
  const fns = geo.functions
    .filter((f) => !inGenerated(f.start, geo) && !inGenerated(f.end, geo))
    .sort((a, b) => (b.end - b.start) - (a.end - a.start));
  for (const f of fns) {
    const body = [];
    for (const l of geo.executable) {
      if (l > f.start && l <= f.end && !inGenerated(l, geo)) body.push(l);
    }
    if (body.length === 0) continue;
    if (body.some((l) => hitStarts.has(l) || consumed.has(l))) continue;
    ranges.push({ kind: 'function', name: f.name, start: f.start, end: f.end });
    for (const l of body) consumed.add(l);
    consumed.add(f.start); // fold a missed declaration line into the unit
  }

  // Bare ranges over what's left; break on a hit or consumed executable line.
  const rest = missed.filter((l) => !consumed.has(l));
  const blocked = (a, b) => { // any executable line strictly between a and b that was hit/consumed
    for (let l = a + 1; l < b; l++) {
      if (geo.executable.has(l) && !missedSet.has(l)) return true;
      if (consumed.has(l)) return true;
    }
    return false;
  };
  let i = 0;
  while (i < rest.length) {
    let j = i;
    while (j + 1 < rest.length && !blocked(rest[j], rest[j + 1])) j++;
    const start = rest[i];
    const end = Math.max(rest[j], geo.stmtEnd.get(rest[j]) || rest[j]);
    const encl = geo.functions
      .filter((f) => f.start < start && f.end >= end && !inGenerated(f.start, geo))
      .sort((a, b) => (a.end - a.start) - (b.end - b.start))[0];
    ranges.push({ kind: 'range', start, end, within: encl ? encl.name : undefined });
    i = j + 1;
  }
  ranges.sort((a, b) => a.start - b.start);
  return ranges;
}

// Full line-coverage report for a packed script + a set of RAW hit lines
// (packed coordinates, as collected by the VM hook). All reported line
// numbers are SOURCE war3map.lua lines (packed minus the prepended block).
function lineReport(packedLua, hitPackedLines) {
  const geo = analyzePacked(packedLua);

  // Attribute raw hits to their innermost owning statement's start line.
  const hitStarts = new Set();
  for (const raw of hitPackedLines) {
    const owner = geo.ownerStart.get(raw);
    if (owner !== undefined) hitStarts.add(owner);
  }

  let srcExec = 0, srcHit = 0, genExec = 0, genHit = 0;
  for (const l of geo.executable) {
    if (inGenerated(l, geo)) { genExec++; if (hitStarts.has(l)) genHit++; }
    else { srcExec++; if (hitStarts.has(l)) srcHit++; }
  }

  const toSource = (r) => ({
    ...r,
    start: r.start - geo.constOffset,
    end: r.end - geo.constOffset,
  });
  return {
    source: {
      executable: srcExec,
      hit: srcHit,
      pct: srcExec === 0 ? 100 : Math.round((srcHit / srcExec) * 1000) / 10,
      missedRanges: collapseMissed(geo, hitStarts).map(toSource),
    },
    generated: { executable: genExec, hit: genHit },
  };
}

// ---- cross-process aggregation (tools/test-map-logic.js --coverage) --------
// Each loadMap under WC3_SIM_LINECOV_DIR registers its live hit set; one
// exit handler per process dumps every run to a unique JSON file in that
// dir. The runner merges them per map source dir.

const ENV_VAR = 'WC3_SIM_LINECOV_DIR';
const pendingRuns = [];
let exitHookInstalled = false;

function registerRunDump(mapDir, hitsSet, dir) {
  pendingRuns.push({ mapDir, hits: hitsSet, dir });
  if (exitHookInstalled) return;
  exitHookInstalled = true;
  process.on('exit', () => {
    const byDir = new Map();
    for (const r of pendingRuns) {
      if (!byDir.has(r.dir)) byDir.set(r.dir, []);
      byDir.get(r.dir).push({ mapDir: r.mapDir, hits: [...r.hits] });
    }
    for (const [dir, runs] of byDir) {
      try {
        const file = path.join(dir, `linecov-${process.pid}-${Math.random().toString(36).slice(2)}.json`);
        fs.writeFileSync(file, JSON.stringify({ runs }));
      } catch (e) { /* coverage observes; a failed dump must never fail a test run */ }
    }
  });
}

// Merge every dump in `dir` -> Map<resolved mapDir, { runs, hits:Set }>.
function mergeDumps(dir) {
  const merged = new Map();
  if (!fs.existsSync(dir)) return merged;
  for (const f of fs.readdirSync(dir)) {
    if (!/^linecov-.*\.json$/.test(f)) continue;
    let parsed;
    try { parsed = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { continue; }
    for (const run of parsed.runs || []) {
      const key = path.resolve(run.mapDir);
      if (!merged.has(key)) merged.set(key, { runs: 0, hits: new Set() });
      const m = merged.get(key);
      m.runs++;
      for (const l of run.hits) m.hits.add(l);
    }
  }
  return merged;
}

module.exports = { analyzePacked, lineReport, registerRunDump, mergeDumps, ENV_VAR };
