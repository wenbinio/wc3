#!/usr/bin/env node
'use strict';
// build-map.js [--bare] <map-source-dir> <out.w3x>
// The top-level map compiler:
//   map source (JSON + war3map.lua + files/ + imports/)
//     -> translate JSON to war3map.* binaries (temp dir)
//     -> pack into MPQ v1
//     -> prepend HM3W pre-header (from _header.json or synthesized)
// --bare packs a bare MPQ instead (no HM3W pre-header, archive at offset 0)
// — the modern container real 2023+ maps ship; only 1.31+ clients read it.
// Passed straight through to the pack layer (tools/w3x-pack.js packDir).
//
// Sanity checks before packing: a map script must exist (war3map.lua or
// war3map.j), info.json/terrain.json should be present for a playable map,
// and — the STRICT tier of the two-tier model bar (gotcha 14) — every
// .mdx/.mdl under the source's imports/ must pass mdx-m3-viewer's sanityTest
// with 0 errors AND 0 severe issues or the build FAILS: a malformed custom
// model hard-crashes the game at map load. (validate-map only WARNs on model
// sanity findings, because repacked third-party maps legitimately ship
// hundreds of models that fail this bar yet run in game — the strict bar is
// for models WE are about to ship from a map source.)

const fs = require('fs');
const os = require('os');
const path = require('path');
const { sourceToExtracted, writeJson, walk } = require('../lib/source');
const { collectConstants, constantsIndex } = require('../lib/constants');
const { checkLuaSyntax } = require('../lib/luacheck');
const { packDir } = require('./w3x-pack');

// Gotcha 14, strict tier — see header. Throws when any imports/ model fails.
function checkImportedModels(sourceDir) {
  const importsDir = path.join(sourceDir, 'imports');
  const models = walk(importsDir).filter((r) => /\.(mdx|mdl)$/i.test(r));
  if (models.length === 0) return;
  let viewer;
  try {
    viewer = require('../lib/viewer');
  } catch {
    console.error('warning: mdx-m3-viewer-th not loadable — imported models NOT sanity-checked (gotcha 14)');
    return;
  }
  const bad = [];
  for (const rel of models) {
    try {
      const r = viewer.sanityCheckModel(
        fs.readFileSync(path.join(importsDir, rel)), /\.mdl$/i.test(rel));
      if (r.errors > 0 || r.severe > 0) {
        bad.push(`imports/${rel}: errors=${r.errors} severe=${r.severe} warnings=${r.warnings}`);
      }
    } catch (e) {
      bad.push(`imports/${rel}: viewer could not parse the model (${String(e.message || e).split('\n')[0]})`);
    }
  }
  if (bad.length > 0) {
    throw new Error(
      'imported model(s) fail mdx-m3-viewer\'s sanityTest — the game may hard-crash loading them (gotcha 14):\n  '
      + bad.join('\n  ')
      + '\n(strict 0-errors/0-severes bar for map-source imports/; validate-map reports third-party models as WARN only)');
  }
}

function buildMap(sourceDir, outW3x, opts) {
  opts = opts || {};
  if (!fs.existsSync(sourceDir)) throw new Error(`map source dir not found: ${sourceDir}`);

  const hasScript = ['war3map.lua', 'war3map.j'].some((s) => fs.existsSync(path.join(sourceDir, s)));
  if (!hasScript) throw new Error(`${sourceDir}: no map script (war3map.lua or war3map.j) — the map would not run`);
  for (const f of ['info.json', 'terrain.json']) {
    if (!fs.existsSync(path.join(sourceDir, f))) {
      console.error(`warning: ${sourceDir}/${f} missing — the map may not load in game`);
    }
  }
  checkImportedModels(sourceDir); // gotcha 14 strict tier: build-time FAIL

  // Machine-readable index of the generated named constants (the Lua block
  // itself is injected by sourceToExtracted — lib/constants.js): written
  // into the map source dir so agents can grep constant -> rawcode -> file.
  // Regenerated every build; only written when the source yields constants.
  try {
    const constants = collectConstants(sourceDir);
    if (constants.length > 0) {
      writeJson(path.join(sourceDir, 'constants.json'), constantsIndex(constants));
    }
  } catch (e) {
    console.error(`warning: could not write ${sourceDir}/constants.json: ${e.message || e}`);
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
    const res = packDir(tmp, outW3x, { bare: opts.bare });
    return { members: written, ...res };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function main(argv) {
  const bare = argv.includes('--bare');
  const [sourceDir, outW3x] = argv.filter((a) => a !== '--bare');
  if (!sourceDir || !outW3x) {
    console.error('usage: node tools/build-map.js [--bare] <map-source-dir> <out.w3x>');
    process.exit(2);
  }
  try {
    const { files, headerFields, bytes } = buildMap(sourceDir, outW3x, { bare });
    console.log(`built ${outW3x} (${bytes} bytes, ${files.length} archive members)`);
    if (bare) console.log('bare MPQ container (no HM3W pre-header — 1.31+ clients only)');
    else console.log(`HM3W header: name=${JSON.stringify(headerFields.name)} maxPlayers=${headerFields.maxPlayers ?? 4}`);
  } catch (e) {
    console.error('build failed: ' + (e.message || e));
    process.exit(1);
  }
}

if (require.main === module) main(process.argv.slice(2));
module.exports = { buildMap };
