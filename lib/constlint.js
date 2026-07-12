'use strict';
// Stale generated-constant lint (gotcha 27's worst trap, made a build FAIL).
//
// The generated constants block (lib/constants.js) defines every UNIT_/ITEM_/
// DEST_/DOOD_/ABIL_/BUFF_/UPGR_/REGION_/SOUND_ global a map source yields.
// Constant names derive from DISPLAY names, so renaming an object (or adding
// a same-named second entry — all colliders then get a _<rawcode> suffix)
// RENAMES the constant; a script still using the old name sees nil at
// RUNTIME, which luaparse can never catch. This module walks the PACKED
// script's AST (luaparse, same grammar as the syntax gate) and reports:
//
//   (a) 'stale'  — a reserved-prefix identifier REFERENCED outside the
//       generated block that the block does not define, with the nearest
//       same-prefix defined name when edit distance suggests a rename;
//   (b) 'squat'  — a reserved-prefix identifier ASSIGNED or DECLARED
//       (global/local/function/parameter/loop variable) outside the
//       generated block (gotcha 27b: user code must not define its own
//       globals with the nine prefixes — and a local/parameter would
//       silently shadow the generated global).
//
// Scope is deliberately DIRECT IDENTIFIERS ONLY: dynamic access such as
// _G["UNIT_" .. x] is string data, not an identifier, and is not (and cannot
// reliably be) checked. Table fields (t.UNIT_X, { UNIT_X = 1 }) and goto
// labels are separate namespaces and are skipped.
//
// The game's own JASS API surface overlaps the prefixes (UNIT_STATE_LIFE,
// UNIT_TYPE_HERO, ITEM_TYPE_*, SOUND_VOLUMEGROUP_* — 70 engine constants):
// those are engine globals, not generated constants, and REFERENCES to them
// are exempt (whitelist: lib/sim/data/jass-constants.json, the same API
// table the sim uses). ASSIGNING one still fails — overwriting an engine
// constant is worse than squatting.
//
// Line numbers are reported source-relative (packed line minus the generated
// block's length — gotcha 27d): the constants block is PREPENDED, so user
// code shifts down by the block length + 1 blank separator line. Findings
// inside the appended CreateAllUnits block (past the source text) cannot
// occur from generated code, but a finding there would still map through the
// same offset.

const luaparse = require('luaparse');
const { PREFIX, END_MARK } = require('./constants');

const RESERVED_PREFIXES = Object.values(PREFIX);

// Engine API names that share the reserved prefixes (references exempt).
const API_NAMES = (() => {
  const api = require('./sim/data/jass-constants.json');
  const names = new Set();
  for (const list of [Object.keys(api.constants), api.functions]) {
    for (const n of list) {
      if (RESERVED_PREFIXES.some((p) => n.startsWith(p))) names.add(n);
    }
  }
  return names;
})();

function reservedPrefixOf(name) {
  return RESERVED_PREFIXES.find((p) => name.startsWith(p)) || null;
}

// Plain Levenshtein distance — inputs are short identifiers, O(n*m) is fine.
function editDistance(a, b) {
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = cur;
  }
  return prev[n];
}

// Nearest defined constant with the SAME prefix, when close enough that a
// rename is the likely story: a collision suffix (_<rawcode>) appearing or
// disappearing makes one name a prefix of the other, and a display-name edit
// moves a handful of characters. Returns null when nothing is plausible.
function nearestDefined(name, definedNames) {
  const prefix = reservedPrefixOf(name);
  let best = null;
  let bestDist = Infinity;
  for (const cand of definedNames) {
    if (!cand.startsWith(prefix)) continue;
    const d = editDistance(name, cand);
    if (d < bestDist) {
      bestDist = d;
      best = cand;
    }
  }
  if (!best) return null;
  const related = best.startsWith(name) || name.startsWith(best)
    || bestDist <= Math.max(2, Math.floor(Math.max(name.length, best.length) / 4));
  return related ? best : null;
}

// The generated block is prepended as `block + '\n' + user`: user line 1 sits
// at packed line (blockEndLine + 2). Returns the packed→source line offset
// (0 when no block is present, e.g. no constants were derivable).
function blockOffset(packedLua) {
  const lines = packedLua.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === END_MARK) return i + 2; // END line (1-based i+1) + blank
  }
  return 0;
}

// Walk the AST reporting every reserved-prefix Identifier with its role.
// `report(node, role)` — role is 'reference' or a declaration kind string.
function walkIdentifiers(node, report, parentType, parentKey) {
  if (Array.isArray(node)) {
    for (const child of node) walkIdentifiers(child, report, parentType, parentKey);
    return;
  }
  if (!node || typeof node !== 'object' || typeof node.type !== 'string') return;

  if (node.type === 'Identifier') {
    // Separate namespaces / non-variable positions:
    if (parentType === 'MemberExpression' && parentKey === 'identifier') return; // t.X / t:X
    if (parentType === 'TableKeyString' && parentKey === 'key') return; // { X = 1 }
    if ((parentType === 'LabelStatement' || parentType === 'GotoStatement') && parentKey === 'label') return;
    // Declaration / assignment positions (rule b):
    if (parentType === 'AssignmentStatement' && parentKey === 'variables') return report(node, 'assignment');
    if (parentType === 'LocalStatement' && parentKey === 'variables') return report(node, 'local declaration');
    if (parentType === 'FunctionDeclaration' && parentKey === 'identifier') return report(node, 'function declaration');
    if (parentType === 'FunctionDeclaration' && parentKey === 'parameters') return report(node, 'function parameter');
    if (parentType === 'ForNumericStatement' && parentKey === 'variable') return report(node, 'loop variable');
    if (parentType === 'ForGenericStatement' && parentKey === 'variables') return report(node, 'loop variable');
    return report(node, 'reference');
  }

  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'range' || key === 'raw') continue;
    const child = node[key];
    if (child && typeof child === 'object') walkIdentifiers(child, report, node.type, key);
  }
}

// Lint a PACKED war3map.lua against the generated constant set.
// `definedNames` is an iterable of the constNames lib/constants.js derived
// for this build (identical to what the injected block defines). Returns an
// array of findings: { kind: 'stale'|'squat', name, packedLine, sourceLine,
// suggestion?, message }. Empty array = clean. Throws only if the text does
// not parse (callers run the syntax gate first).
function lintGeneratedConstants(packedLua, definedNames) {
  const defined = new Set(definedNames);
  const ast = luaparse.parse(packedLua, { luaVersion: '5.3', comments: false, locations: true });
  const offset = blockOffset(packedLua);
  const findings = [];
  const squatted = new Set();

  const record = (node, role) => {
    const name = node.name;
    if (!reservedPrefixOf(name)) return;
    const packedLine = node.loc && node.loc.start ? node.loc.start.line : 0;
    if (offset > 0 && packedLine <= offset - 1) return; // inside the generated block
    const sourceLine = packedLine - offset;
    const where = `war3map.lua:${sourceLine > 0 ? sourceLine : packedLine}`;
    if (role !== 'reference') {
      squatted.add(name);
      findings.push({
        kind: 'squat', name, packedLine, sourceLine,
        message: `${where}: ${role} of '${name}' — the ${reservedPrefixOf(name)} prefix is reserved for `
          + 'generated constants (gotcha 27b); rename the identifier',
      });
      return;
    }
    if (defined.has(name) || API_NAMES.has(name) || squatted.has(name)) return;
    const suggestion = nearestDefined(name, defined);
    findings.push({
      kind: 'stale', name, packedLine, sourceLine, suggestion: suggestion || undefined,
      message: `${where}: reference to '${name}' — not defined by the generated constants block `
        + `(runtime nil)${suggestion ? `; nearest defined constant: '${suggestion}' (renamed object or collision suffix? `
          + 'grep constants.json)' : '; grep constants.json for the right name'}`,
    });
  };

  walkIdentifiers(ast, record, null, null);
  return findings;
}

module.exports = { lintGeneratedConstants, RESERVED_PREFIXES, editDistance, nearestDefined };
