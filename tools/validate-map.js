#!/usr/bin/env node
'use strict';
// validate-map.js <map.w3x>
// Extracts the map, parses every translatable file back through
// wc3maptranslator (plus a full JSON->binary->JSON stability cycle),
// verifies a map script is present, then cross-validates with a SECOND,
// independent parser stack (mdx-m3-viewer-th): its MPQ reader must open the
// archive, every inner file it has a parser for must parse (it also covers
// wpm/shd/mmp/wct which wc3maptranslator can't), and every packed .mdx/.mdl
// gets mdx-m3-viewer's sanity test. Object data additionally gets a semantic
// lint (lib/objectlint.js — gotchas 22/23/25) whose findings print as WARN
// lines and never fail the map. Prints a pass/fail summary; exit code
// 0 = all PASS (warnings allowed).
//
// MODEL SANITY IS A TWO-TIER BAR (gotcha 14):
//   - validate-map (this tool, any .w3x): sanity findings are WARN only.
//     Repacked third-party production maps ship hundreds of models that
//     fail the 0-errors/0-severes bar yet demonstrably run in game (Gaias:
//     402 of 1047; Sunken City: ~190) — hard-failing them makes validate
//     useless on exactly the maps worth studying, and a WARN still surfaces
//     every finding.
//   - build-map (our own artifacts): every .mdx/.mdl under the map source's
//     imports/ must pass with 0 errors AND 0 severe issues or the BUILD
//     fails — a malformed custom model hard-crashes the game at map load
//     (the SiegeCrystal.mdx postmortem bar, also enforced per-map in
//     test/fixes.test.js and test/northreach.test.js).

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { hasHM3W, parseHeader, HEADER_SIZE } = require('../lib/header');
const { extractAll } = require('../lib/mpq');
const { byWar, CONSUMED_AS_SKIN, warToJson, jsonToWar } = require('../lib/filemap');
const { checkSuspectedTrap } = require('../lib/traps');
const { walk } = require('../lib/source');
const { checkLuaSyntax } = require('../lib/luacheck');
const { lintObjectData } = require('../lib/objectlint');
const viewer = require('../lib/viewer');

function validate(mapPath) {
  const results = [];
  const ok = (name, detail) => results.push({ name, pass: true, detail });
  const fail = (name, detail) => results.push({ name, pass: false, detail });
  // warnings never fail the map (semantic heuristics, gotchas 22/23/25)
  const warn = (name, detail) => results.push({ name, pass: true, warn: true, detail });

  const buf = fs.readFileSync(mapPath);

  // 1. HM3W pre-header + MPQ magic
  if (hasHM3W(buf)) {
    const h = parseHeader(buf);
    ok('HM3W pre-header', `name=${JSON.stringify(h.name)} maxPlayers=${h.maxPlayers}`);
    const mpqMagic = buf.toString('latin1', HEADER_SIZE, HEADER_SIZE + 4);
    if (mpqMagic === 'MPQ\x1a') ok('MPQ magic at offset 512', '');
    else fail('MPQ magic at offset 512', `found ${JSON.stringify(mpqMagic)}`);
  } else if (buf.toString('latin1', 0, 4) === 'MPQ\x1a') {
    // Real modern maps (2023+) ship exactly this: a bare MPQ with no HM3W
    // pre-header. 1.31+ clients read it fine; only pre-1.31 clients need the
    // pre-header. Container warning only — every other check still runs.
    warn('HM3W pre-header', 'missing (MPQ magic at offset 0): modern bare-MPQ container, 1.31+ clients only');
  } else {
    fail('HM3W pre-header', 'no HM3W or MPQ magic at offset 0');
    return results; // nothing more we can do
  }

  // 2. Extract
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'w3xvalidate-'));
  try {
    const { extracted, unresolved } = extractAll(mapPath, tmp);
    if (extracted.length === 0) {
      fail('extract archive', 'nothing extracted');
      return results;
    }
    ok('extract archive', `${extracted.length} file(s)${unresolved ? `, ${unresolved} unresolved (anonymous) entr${unresolved === 1 ? 'y' : 'ies'} skipped` : ''}`);

    // 3. Required files + script presence
    for (const req of ['war3map.w3i', 'war3map.w3e']) {
      if (extracted.includes(req)) ok(`required file ${req}`, '');
      else fail(`required file ${req}`, 'missing');
    }
    const scripts = ['war3map.lua', 'war3map.j', 'scripts/war3map.j', 'scripts/war3map.lua']
      .filter((s) => fs.existsSync(path.join(tmp, s)));
    if (scripts.length > 0) ok('map script present', scripts.join(', '));
    else fail('map script present', 'no war3map.lua or war3map.j in archive');

    // 3b. Lua scripts must actually parse (Lua 5.3 grammar via luaparse) —
    // a syntactically broken war3map.lua loads as a silently dead map.
    for (const s of scripts.filter((n) => n.endsWith('.lua'))) {
      const err = checkLuaSyntax(fs.readFileSync(path.join(tmp, s), 'utf8'));
      if (err) fail(`lua syntax ${s}`, `line ${err.line ?? '?'}: ${err.message}`);
      else ok(`lua syntax ${s}`, 'parses as Lua 5.3 (luaparse)');
    }

    // 4. Parse every translatable file + stability cycle. Every per-file
    // step is isolated: a throw degrades to a per-file FAIL and validation
    // continues. Protection-trap stubs (lib/traps.js — tiny file, absurd
    // count field) are detected BEFORE parsing and reported as WARN: the
    // game itself tolerates these files, and running a parser (ours or the
    // viewer's, see crossValidate) on them means loops/GB allocations.
    const objectFiles = []; // successfully translated object data, for 4b
    const trapped = new Set(); // suspected-trap members: viewer must skip too
    for (const rel of walk(tmp).sort()) {
      if (CONSUMED_AS_SKIN.has(rel)) continue;
      const entry = byWar.get(rel);
      if (!entry) continue;
      try {
        const raw = fs.readFileSync(path.join(tmp, rel));
        const trap = checkSuspectedTrap(rel, raw);
        if (trap) {
          trapped.add(rel);
          warn(`translate ${rel}`, `${trap} — parsing skipped, file passed through unvalidated`);
          continue;
        }
        let skinBuf;
        if (entry.skinWar && fs.existsSync(path.join(tmp, entry.skinWar))) {
          skinBuf = fs.readFileSync(path.join(tmp, entry.skinWar));
        }
        const json1 = warToJson(entry, raw, skinBuf);
        const back = jsonToWar(entry, json1);
        const json2 = warToJson(entry, back.buffer, back.skinBuffer);
        assert.deepStrictEqual(json2, json1);
        ok(`translate ${rel}`, `${entry.json}, round-trip stable`);
        if (entry.objectType) objectFiles.push({ war: rel, objectType: entry.objectType, json: json1 });
      } catch (e) {
        fail(`translate ${rel}`, String(e.message || e).split('\n')[0]);
      }
    }

    // 4b. Semantic lint of the object data — WARN lines only, never
    // failures (playtest heuristics, CLAUDE.md gotchas 22/23/25):
    // .mdx model-field values / unresolved war3mapImported model paths,
    // items renamed without re-arting, builders without a repair ability.
    try {
      for (const w of lintObjectData(objectFiles, walk(tmp))) {
        warn(`lint ${w.file} ${w.objectId}`, w.message);
      }
    } catch (e) {
      warn('lint object data', `lint pass itself failed: ${String(e.message || e).split('\n')[0]}`);
    }

    // 5. Second opinion: mdx-m3-viewer-th (independent MPQ + format parsers).
    crossValidate(buf, tmp, ok, fail, warn, trapped);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return results;
}

// Cross-validate with mdx-m3-viewer-th. NB: its parsers must be fed fresh
// Uint8Array copies, never Node Buffers (its MPQ code mutates the input in
// place and would misparse); its MPQ save/write path is known-broken
// (locale/platform swap) and is never used — everything here is read-only.
function crossValidate(w3xBuf, extractedDir, ok, fail, warn, trapped) {
  trapped = trapped || new Set();
  // 5a. The viewer's own MPQ reader should open the archive. crossValidate
  // only ever runs AFTER StormLib successfully extracted the same bytes, so
  // a viewer-side failure here is a nonstandard-container disagreement
  // (protector-mangled header fields, stripped/fake listfile), not proof of
  // a broken map — WARN, never FAIL (lib/viewer.js already normalizes known
  // header mangling on a copy before the viewer sees it).
  let viewerMap = null;
  try {
    viewerMap = viewer.openMapReadonly(w3xBuf);
    // filter MPQ-internal files and unresolved pseudo-names (e.g. an
    // '(attributes)' entry missing from the listfile shows up as FileNNNNNNNN)
    const names = viewerMap.getFileNames().filter((n) => !n.startsWith('(') && !/^File\d{8}/.test(n));
    if (names.length > 0) ok('viewer opens archive', `${names.length} member(s) via mdx-m3-viewer-th MPQ reader`);
    else warn('viewer opens archive', 'skipped: nonstandard archive — viewer found no named members (stripped/fake listfile?) though StormLib reads it');
  } catch (e) {
    warn('viewer opens archive', `skipped: nonstandard archive — viewer failed to open what StormLib reads (${String(e.message || e).split('\n')[0]})`);
  }

  // 5b. Parse every inner file the viewer has a parser for (this covers
  // wpm/shd/mmp/wct, which wc3maptranslator has no translator for).
  const rels = walk(extractedDir).sort();
  const readFile = (name) => {
    const p = path.join(extractedDir, name);
    return fs.existsSync(p) ? fs.readFileSync(p) : null;
  };
  const ctx = viewer.contextFor(readFile);
  for (const rel of rels) {
    const base = rel.includes('/') ? null : rel;
    if (!base || !viewer.hasParser(base)) continue;
    if (trapped.has(base)) {
      // suspected protection trap (step 4): the viewer parser would loop or
      // allocate on the absurd count — same skip, surfaced as a warning.
      (warn || fail)(`viewer parse ${rel}`, 'skipped: suspected protection trap (see translate warning above)');
      continue;
    }
    try {
      viewer.parseMember(base, fs.readFileSync(path.join(extractedDir, rel)), ctx);
      ok(`viewer parse ${rel}`, 'second opinion agrees');
    } catch (e) {
      fail(`viewer parse ${rel}`, String(e.message || e).split('\n')[0]);
    }
  }

  // 5c. Sanity-test every packed model. Findings (errors/severes, or a model
  // the viewer can't even parse) are WARN, never FAIL: this tool validates
  // arbitrary .w3x files, and repacked third-party production maps ship
  // hundreds of models that fail this bar yet run in game (see the two-tier
  // policy in the header). The STRICT tier lives in build-map, which fails
  // the build when a model under the map source's imports/ has errors or
  // severe issues (gotcha 14 — a bad custom model hard-crashes the game).
  for (const rel of rels) {
    const isMdl = rel.toLowerCase().endsWith('.mdl');
    if (!rel.toLowerCase().endsWith('.mdx') && !isMdl) continue;
    try {
      const r = viewer.sanityCheckModel(fs.readFileSync(path.join(extractedDir, rel)), isMdl);
      const detail = `errors=${r.errors} severe=${r.severe} warnings=${r.warnings}`;
      if (r.errors === 0 && r.severe === 0) ok(`viewer sanity ${rel}`, detail);
      else warn(`viewer sanity ${rel}`, detail + ' — fails the strict bar our own imports must meet (build-map enforces it); shipping third-party models often fail it yet run in game');
    } catch (e) {
      warn(`viewer sanity ${rel}`, `viewer could not parse the model (${String(e.message || e).split('\n')[0]}) — advisory only on repacked maps; build-map enforces the strict bar on source imports/`);
    }
  }
}

function main(argv) {
  const [mapPath] = argv;
  if (!mapPath) {
    console.error('usage: node tools/validate-map.js <map.w3x>');
    process.exit(2);
  }
  try {
    const results = validate(mapPath);
    let failures = 0;
    let warnings = 0;
    for (const r of results) {
      console.log(`${r.warn ? 'WARN' : r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  (' + r.detail + ')' : ''}`);
      if (r.warn) warnings++;
      else if (!r.pass) failures++;
    }
    const checks = results.length - warnings;
    console.log(`\n${checks - failures}/${checks} checks passed${warnings ? `, ${warnings} warning(s) — warnings don't fail the map` : ''}`);
    process.exit(failures === 0 ? 0 : 1);
  } catch (e) {
    console.error('validate failed: ' + (e.message || e));
    process.exit(1);
  }
}

if (require.main === module) main(process.argv.slice(2));
module.exports = { validate };
