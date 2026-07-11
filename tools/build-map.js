#!/usr/bin/env node
'use strict';
// build-map.js <map-source-dir> <out.w3x>
// The top-level map compiler:
//   map source (JSON + war3map.lua + files/ + imports/)
//     -> translate JSON to war3map.* binaries (temp dir)
//     -> pack into MPQ v1
//     -> prepend HM3W pre-header (from _header.json or synthesized)
//
// Sanity checks before packing: a map script must exist (war3map.lua or
// war3map.j) and info.json/terrain.json should be present for a playable map.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { sourceToExtracted, writeJson } = require('../lib/source');
const { checkLuaSyntax } = require('../lib/luacheck');
const { packDir } = require('./w3x-pack');

function buildMap(sourceDir, outW3x) {
  if (!fs.existsSync(sourceDir)) throw new Error(`map source dir not found: ${sourceDir}`);

  const hasScript = ['war3map.lua', 'war3map.j'].some((s) => fs.existsSync(path.join(sourceDir, s)));
  if (!hasScript) throw new Error(`${sourceDir}: no map script (war3map.lua or war3map.j) — the map would not run`);
  for (const f of ['info.json', 'terrain.json']) {
    if (!fs.existsSync(path.join(sourceDir, f))) {
      console.error(`warning: ${sourceDir}/${f} missing — the map may not load in game`);
    }
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'w3xbuild-'));
  try {
    const { written, header } = sourceToExtracted(sourceDir, tmp);
    if (header) writeJson(path.join(tmp, '_header.json'), header);
    // The packed war3map.lua (source + generated blocks) must be valid Lua —
    // a script that doesn't parse loads as a silently dead map.
    const luaPath = path.join(tmp, 'war3map.lua');
    if (fs.existsSync(luaPath)) {
      const err = checkLuaSyntax(fs.readFileSync(luaPath, 'utf8'));
      if (err) {
        throw new Error(
          `war3map.lua: Lua syntax error at line ${err.line ?? '?'}: ${err.message}` +
          ' (line refers to the packed script: source war3map.lua + generated blocks)'
        );
      }
    }
    const res = packDir(tmp, outW3x);
    return { members: written, ...res };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function main(argv) {
  const [sourceDir, outW3x] = argv;
  if (!sourceDir || !outW3x) {
    console.error('usage: node tools/build-map.js <map-source-dir> <out.w3x>');
    process.exit(2);
  }
  try {
    const { files, headerFields, bytes } = buildMap(sourceDir, outW3x);
    console.log(`built ${outW3x} (${bytes} bytes, ${files.length} archive members)`);
    console.log(`HM3W header: name=${JSON.stringify(headerFields.name)} maxPlayers=${headerFields.maxPlayers ?? 4}`);
  } catch (e) {
    console.error('build failed: ' + (e.message || e));
    process.exit(1);
  }
}

if (require.main === module) main(process.argv.slice(2));
module.exports = { buildMap };
