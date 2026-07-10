#!/usr/bin/env node
'use strict';
// validate-map.js <map.w3x>
// Extracts the map, parses every translatable file back through
// wc3maptranslator (plus a full JSON->binary->JSON stability cycle),
// verifies a map script is present, and prints a pass/fail summary.
// Exit code 0 = all checks passed.

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { hasHM3W, parseHeader, HEADER_SIZE } = require('../lib/header');
const { extractAll } = require('../lib/mpq');
const { byWar, CONSUMED_AS_SKIN, warToJson, jsonToWar } = require('../lib/filemap');
const { walk } = require('../lib/source');

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
    const extracted = extractAll(mapPath, tmp);
    if (extracted.length === 0) {
      fail('extract archive', 'nothing extracted');
      return results;
    }
    ok('extract archive', `${extracted.length} file(s)`);

    // 3. Required files + script presence
    for (const req of ['war3map.w3i', 'war3map.w3e']) {
      if (extracted.includes(req)) ok(`required file ${req}`, '');
      else fail(`required file ${req}`, 'missing');
    }
    const scripts = ['war3map.lua', 'war3map.j', 'scripts/war3map.j', 'scripts/war3map.lua']
      .filter((s) => fs.existsSync(path.join(tmp, s)));
    if (scripts.length > 0) ok('map script present', scripts.join(', '));
    else fail('map script present', 'no war3map.lua or war3map.j in archive');

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
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return results;
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
