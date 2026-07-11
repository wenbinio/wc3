#!/usr/bin/env node
'use strict';
// validate-map.js <map.w3x>
// Extracts the map, parses every translatable file back through
// wc3maptranslator (plus a full JSON->binary->JSON stability cycle),
// verifies a map script is present, then cross-validates with a SECOND,
// independent parser stack (mdx-m3-viewer-th): its MPQ reader must open the
// archive, every inner file it has a parser for must parse (it also covers
// wpm/shd/mmp/wct which wc3maptranslator can't), and every imported
// .mdx/.mdl must pass its sanity test with 0 errors AND 0 severe issues
// (a malformed MDX hard-crashes the game on map load — same bar as
// test/fixes.test.js). Prints a pass/fail summary; exit code 0 = all passed.

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { hasHM3W, parseHeader, HEADER_SIZE } = require('../lib/header');
const { extractAll } = require('../lib/mpq');
const { byWar, CONSUMED_AS_SKIN, warToJson, jsonToWar } = require('../lib/filemap');
const { walk } = require('../lib/source');
const { checkLuaSyntax } = require('../lib/luacheck');
const viewer = require('../lib/viewer');

function validate(mapPath) {
  const results = [];
  const ok = (name, detail) => results.push({ name, pass: true, detail });
  const fail = (name, detail) => results.push({ name, pass: false, detail });

  const buf = fs.readFileSync(mapPath);

  // 1. HM3W pre-header + MPQ magic
  if (hasHM3W(buf)) {
    const h = parseHeader(buf);
    ok('HM3W pre-header', `name=${JSON.stringify(h.name)} maxPlayers=${h.maxPlayers}`);
    const mpqMagic = buf.toString('latin1', HEADER_SIZE, HEADER_SIZE + 4);
    if (mpqMagic === 'MPQ\x1a') ok('MPQ magic at offset 512', '');
    else fail('MPQ magic at offset 512', `found ${JSON.stringify(mpqMagic)}`);
  } else if (buf.toString('latin1', 0, 4) === 'MPQ\x1a') {
    fail('HM3W pre-header', 'bare MPQ: WC3 expects the 512-byte HM3W pre-header on .w3x maps');
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

    // 4. Parse every translatable file + stability cycle
    for (const rel of walk(tmp).sort()) {
      if (CONSUMED_AS_SKIN.has(rel)) continue;
      const entry = byWar.get(rel);
      if (!entry) continue;
      try {
        let skinBuf;
        if (entry.skinWar && fs.existsSync(path.join(tmp, entry.skinWar))) {
          skinBuf = fs.readFileSync(path.join(tmp, entry.skinWar));
        }
        const json1 = warToJson(entry, fs.readFileSync(path.join(tmp, rel)), skinBuf);
        const back = jsonToWar(entry, json1);
        const json2 = warToJson(entry, back.buffer, back.skinBuffer);
        assert.deepStrictEqual(json2, json1);
        ok(`translate ${rel}`, `${entry.json}, round-trip stable`);
      } catch (e) {
        fail(`translate ${rel}`, String(e.message || e).split('\n')[0]);
      }
    }

    // 5. Second opinion: mdx-m3-viewer-th (independent MPQ + format parsers).
    crossValidate(buf, tmp, ok, fail);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return results;
}

// Cross-validate with mdx-m3-viewer-th. NB: its parsers must be fed fresh
// Uint8Array copies, never Node Buffers (its MPQ code mutates the input in
// place and would misparse); its MPQ save/write path is known-broken
// (locale/platform swap) and is never used — everything here is read-only.
function crossValidate(w3xBuf, extractedDir, ok, fail) {
  // 5a. The viewer's own MPQ reader must open the archive.
  let viewerMap = null;
  try {
    viewerMap = viewer.openMapReadonly(w3xBuf);
    // filter MPQ-internal files and unresolved pseudo-names (e.g. an
    // '(attributes)' entry missing from the listfile shows up as FileNNNNNNNN)
    const names = viewerMap.getFileNames().filter((n) => !n.startsWith('(') && !/^File\d{8}/.test(n));
    if (names.length > 0) ok('viewer opens archive', `${names.length} member(s) via mdx-m3-viewer-th MPQ reader`);
    else fail('viewer opens archive', 'mdx-m3-viewer-th MPQ reader found no members');
  } catch (e) {
    fail('viewer opens archive', String(e.message || e).split('\n')[0]);
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
    try {
      viewer.parseMember(base, fs.readFileSync(path.join(extractedDir, rel)), ctx);
      ok(`viewer parse ${rel}`, 'second opinion agrees');
    } catch (e) {
      fail(`viewer parse ${rel}`, String(e.message || e).split('\n')[0]);
    }
  }

  // 5c. Sanity-test every imported model. Errors AND severe issues both fail
  // (a model missing e.g. its Death sequence or referencing a nonexistent
  // GeosetAnim hard-crashes the game — the bar set when SiegeCrystal.mdx
  // was fixed, enforced in test/fixes.test.js).
  for (const rel of rels) {
    const isMdl = rel.toLowerCase().endsWith('.mdl');
    if (!rel.toLowerCase().endsWith('.mdx') && !isMdl) continue;
    try {
      const r = viewer.sanityCheckModel(fs.readFileSync(path.join(extractedDir, rel)), isMdl);
      const detail = `errors=${r.errors} severe=${r.severe} warnings=${r.warnings}`;
      if (r.errors === 0 && r.severe === 0) ok(`viewer sanity ${rel}`, detail);
      else fail(`viewer sanity ${rel}`, detail + ' — the game may hard-crash loading this model');
    } catch (e) {
      fail(`viewer sanity ${rel}`, String(e.message || e).split('\n')[0]);
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
    for (const r of results) {
      console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  (' + r.detail + ')' : ''}`);
      if (!r.pass) failures++;
    }
    console.log(`\n${results.length - failures}/${results.length} checks passed`);
    process.exit(failures === 0 ? 0 : 1);
  } catch (e) {
    console.error('validate failed: ' + (e.message || e));
    process.exit(1);
  }
}

if (require.main === module) main(process.argv.slice(2));
module.exports = { validate };
