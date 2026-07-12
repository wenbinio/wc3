'use strict';
// OPTIONAL JASS syntax gate via pjass (https://github.com/lep/pjass) — the
// community-standard JASS2 checker, the war3map.j twin of lib/luacheck.js.
//
// pjass is NOT a dependency of this toolkit (the smpq-fallback pattern):
// scripts/setup.sh builds it from source into vendor/pjass/ when a C
// toolchain (flex/bison/make/cc) is available, and everything here degrades
// gracefully when the binary is absent — build-map prints a warning and
// packs the .j unchecked, validate-map emits a WARN line.
//
// Binary discovery order:
//   1. WC3_PJASS env var — exact path to the pjass binary. When set it is
//      authoritative: a non-executable value means "unavailable" (no PATH
//      fallback), which also gives tests a deterministic absence switch.
//   2. vendor/pjass/pjass (what scripts/setup.sh builds).
//   3. `pjass` on PATH.
//
// TWO CHECKING MODES (pjass's own design: `pjass common.j Blizzard.j map.j`):
//   - full: when the game's API files are supplied by the USER via env —
//     WC3_JASS_API_DIR (a directory containing common.j + Blizzard.j, case-
//     insensitive) or WC3_COMMONJ + WC3_BLIZZARDJ (explicit file paths).
//     Those files are Blizzard-authored and are NEVER shipped in this repo
//     (CLAUDE.md Legal); pointing at a local game install is the user's call.
//   - grammar: without them, pjass runs with `+nosemanticerror
//     +noruntimeerror`, so undeclared natives/types (everything common.j
//     would declare) are ignored and only JASS grammar/syntax errors remain.
//     This is exactly the coverage tier of the luaparse gate.
//
// pjass quirk handled here (verified against pjass git-378a1ca): command-line
// `+flags` are latched into each function's flag set AT ITS HEADER from a
// per-LINE annotation state that only picks up the command-line flags after
// the first newline token — so a `function` starting on line 1 of the file
// would still report semantic errors under +nosemanticerror. In grammar mode
// the script is therefore written to the temp file with one prepended
// newline, and reported line numbers are shifted back by one.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_PJASS = path.join(__dirname, '..', 'vendor', 'pjass', 'pjass');

function isExecutable(p) {
  try {
    fs.accessSync(p, fs.constants.X_OK);
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

// Locate the pjass binary (see discovery order above). Returns an absolute
// path or null. `env` defaults to process.env (injectable for tests).
function findPjass(env) {
  env = env || process.env;
  if (env.WC3_PJASS !== undefined && env.WC3_PJASS !== '') {
    return isExecutable(env.WC3_PJASS) ? env.WC3_PJASS : null;
  }
  if (isExecutable(REPO_PJASS)) return REPO_PJASS;
  for (const dir of String(env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    const cand = path.join(dir, 'pjass');
    if (isExecutable(cand)) return cand;
  }
  return null;
}

// User-supplied JASS API files (common.j + Blizzard.j) for full checking.
// Returns [] (grammar mode) or the two file paths in common-first order.
// Both files are required for full mode — common.j alone would make every
// Blizzard.j BJ call an error and vice versa.
function apiFiles(env) {
  env = env || process.env;
  let common = null;
  let blizzard = null;
  if (env.WC3_JASS_API_DIR) {
    try {
      for (const name of fs.readdirSync(env.WC3_JASS_API_DIR)) {
        const lower = name.toLowerCase();
        if (lower === 'common.j') common = path.join(env.WC3_JASS_API_DIR, name);
        else if (lower === 'blizzard.j') blizzard = path.join(env.WC3_JASS_API_DIR, name);
      }
    } catch { /* unreadable dir: fall through to grammar mode */ }
  } else {
    if (env.WC3_COMMONJ && fs.existsSync(env.WC3_COMMONJ)) common = env.WC3_COMMONJ;
    if (env.WC3_BLIZZARDJ && fs.existsSync(env.WC3_BLIZZARDJ)) blizzard = env.WC3_BLIZZARDJ;
  }
  return common && blizzard ? [common, blizzard] : [];
}

// Check JASS source text with pjass. Mirrors lib/luacheck.js's contract but
// carries the optional-tool dimension:
//   { checked: false, reason }                    pjass unavailable
//   { checked: true, mode, errors: [] }           clean (mode: 'full'|'grammar')
//   { checked: true, mode, errors: [{line, message}, ...] }   findings
// Line numbers are 1-based and refer to the text as given (the grammar-mode
// newline shim is compensated internally).
function checkJassSyntax(jassText, opts) {
  opts = opts || {};
  const env = opts.env || process.env;
  const pjass = 'pjass' in opts ? opts.pjass : findPjass(env);
  if (!pjass) return { checked: false, reason: 'pjass not installed' };

  const api = apiFiles(env);
  const full = api.length === 2;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pjass-'));
  try {
    const scriptPath = path.join(tmp, 'war3map.j');
    const lineShift = full ? 0 : 1; // grammar-mode newline shim (see header)
    fs.writeFileSync(scriptPath, full ? jassText : '\n' + jassText);
    const args = full
      ? [...api, scriptPath]
      : ['+nosemanticerror', '+noruntimeerror', scriptPath];
    // generous maxBuffer: a wrong-patch API pairing can emit thousands of
    // error lines and the default 1 MiB turns that into an opaque ENOBUFS
    const r = spawnSync(pjass, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (r.error) {
      return { checked: false, reason: `pjass failed to run: ${r.error.message}` };
    }
    const errors = [];
    for (const line of String(r.stdout || '').split('\n')) {
      // pjass error lines: <file>:<line>: <message>
      const m = /^(.*):(\d+): (.*)$/.exec(line);
      if (!m) continue;
      if (m[1] === scriptPath) {
        errors.push({ line: Number(m[2]) - lineShift, message: m[3] });
      } else if (full && api.includes(m[1])) {
        // an error inside the USER-supplied API files themselves (wrong
        // patch pairing, truncated file...) — surface it, attributed
        errors.push({ line: 0, message: `${path.basename(m[1])}:${m[2]}: ${m[3]}` });
      }
    }
    if (r.status !== 0 && errors.length === 0) {
      // failed without a parseable error line (shouldn't happen; be honest)
      const tail = String(r.stdout || r.stderr || '').trim().split('\n').pop();
      errors.push({ line: 0, message: `pjass exited ${r.status}: ${tail}` });
    }
    return { checked: true, mode: full ? 'full' : 'grammar', errors };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

module.exports = { findPjass, apiFiles, checkJassSyntax, REPO_PJASS };
