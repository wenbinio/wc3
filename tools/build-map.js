#!/usr/bin/env node
'use strict';
// build-map.js [--bare] [--stabilize] [--variant-name <name>] <map-source-dir> <out.w3x>
// The top-level map compiler:
//   map source (JSON + war3map.lua + files/ + imports/)
//     -> translate JSON to war3map.* binaries (temp dir)
//     -> pack into MPQ v1
//     -> prepend HM3W pre-header (from _header.json or synthesized)
// --bare packs a bare MPQ instead (no HM3W pre-header, archive at offset 0)
// — the modern container real 2023+ maps ship; only 1.31+ clients read it.
// Passed straight through to the pack layer (tools/w3x-pack.js packDir).
// --stabilize: after a successful build, round-trip the built .w3x
// (extract -> extracted-to-source) and rewrite ONLY the translatable *.json
// files in the map source that changed — the gotcha-6 stabilization cycle
// in one command, without its copy-the-extracted-lua-back trap (war3map.lua/
// war3map.j, files/ and imports/ are never touched).
// --variant-name <name>: overlay the internal map name (HM3W header + w3i
// name, resolving TRIGSTR indirection) at pack time for in-game A/B variants
// (gotcha 17) — the source directory is not modified. Mutually exclusive
// with --stabilize (the overlay must never reach the source).
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
// The packed war3map.lua must parse (luaparse gate) AND pass the generated-
// constant lint (lib/constlint.js, gotcha 27): a reserved-prefix identifier
// (UNIT_/ITEM_/...) referenced but not defined by the generated block —
// runtime nil after an object rename — or user code squatting on the
// prefixes FAILS the build.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { sourceToExtracted, extractedToSource, writeJson, walk } = require('../lib/source');
const { collectConstants, constantsIndex } = require('../lib/constants');
const { checkLuaSyntax } = require('../lib/luacheck');
const { checkJassSyntax } = require('../lib/jasscheck');
const { lintGeneratedConstants } = require('../lib/constlint');
const { extractAll } = require('../lib/mpq');
const { byJson } = require('../lib/filemap');
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

// --stabilize: round-trip the built .w3x back to source JSON and rewrite the
// translatable *.json files that changed (lib/filemap.js's byJson set knows
// which — scripts, files/ and imports/ are NEVER touched: gotcha 6's trap).
// A json the round-trip could not produce (e.g. a read-only classic format)
// is left alone. Returns the list of rewritten source-relative file names.
function stabilizeSource(sourceDir, w3xPath) {
  const tmpExtract = fs.mkdtempSync(path.join(os.tmpdir(), 'w3xstab-x-'));
  const tmpSource = fs.mkdtempSync(path.join(os.tmpdir(), 'w3xstab-s-'));
  try {
    extractAll(w3xPath, tmpExtract);
    extractedToSource(tmpExtract, tmpSource);
    const changed = [];
    for (const jsonName of byJson.keys()) {
      const srcPath = path.join(sourceDir, jsonName);
      const rtPath = path.join(tmpSource, jsonName);
      if (!fs.existsSync(srcPath) || !fs.existsSync(rtPath)) continue;
      const next = fs.readFileSync(rtPath);
      if (!next.equals(fs.readFileSync(srcPath))) {
        fs.writeFileSync(srcPath, next);
        changed.push(jsonName);
      }
    }
    return changed;
  } finally {
    fs.rmSync(tmpExtract, { recursive: true, force: true });
    fs.rmSync(tmpSource, { recursive: true, force: true });
  }
}

function buildMap(sourceDir, outW3x, opts) {
  opts = opts || {};
  if (!fs.existsSync(sourceDir)) throw new Error(`map source dir not found: ${sourceDir}`);
  if (opts.stabilize && opts.variantName) {
    throw new Error('--stabilize and --variant-name are mutually exclusive — stabilizing would write the variant overlay into the source');
  }

  const hasScript = ['war3map.lua', 'war3map.j'].some((s) => fs.existsSync(path.join(sourceDir, s)));
  if (!hasScript) throw new Error(`${sourceDir}: no map script (war3map.lua or war3map.j) — the map would not run`);
  for (const f of ['info.json', 'terrain.json']) {
    if (!fs.existsSync(path.join(sourceDir, f))) {
      console.error(`warning: ${sourceDir}/${f} missing — the map may not load in game`);
    }
  }
  checkImportedModels(sourceDir); // gotcha 14 strict tier: build-time FAIL

  // Imports provenance (lib/objectlint.js rule g): every file under
  // imports/ needs an imports-credits.json entry (community assets are only
  // legal to ship with per-author credit); stale entries are flagged too.
  // WARN-only — provenance gaps do not break the map for players.
  try {
    const { lintImportsCredits } = require('../lib/objectlint');
    for (const w of lintImportsCredits(sourceDir)) {
      console.error(`warning: imports-credits: ${w.file ? w.file + ': ' : ''}${w.message}`);
    }
  } catch (e) {
    console.error(`warning: imports-credits lint crashed: ${e.message || e}`);
  }

  // Machine-readable index of the generated named constants (the Lua block
  // itself is injected by sourceToExtracted — lib/constants.js): written
  // into the map source dir so agents can grep constant -> rawcode -> file.
  // Regenerated every build; only written when the source yields constants.
  // The collected set also feeds the stale-constant lint below; when
  // collection itself fails the lint is skipped (no set to lint against).
  let constants = null;
  try {
    constants = collectConstants(sourceDir);
    if (constants.length > 0) {
      writeJson(path.join(sourceDir, 'constants.json'), constantsIndex(constants));
    }
  } catch (e) {
    console.error(`warning: could not write ${sourceDir}/constants.json: ${e.message || e}`);
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'w3xbuild-'));
  try {
    const converted = sourceToExtracted(sourceDir, tmp, { variantName: opts.variantName });
    const { written, warnings } = converted;
    for (const w of warnings || []) console.error(`warning: ${w}`);
    // Variant overlay reaches the HM3W header too (gotcha 17: the picker
    // shows header + w3i name). With no _header.json, packDir synthesizes
    // the header from the packed w3i — which already carries the overlay.
    const header = opts.variantName && converted.header
      ? { ...converted.header, name: opts.variantName }
      : converted.header;
    if (header) writeJson(path.join(tmp, '_header.json'), header);
    // The packed war3map.lua (source + generated blocks) must be valid Lua —
    // a script that doesn't parse loads as a silently dead map.
    const luaPath = path.join(tmp, 'war3map.lua');
    if (fs.existsSync(luaPath)) {
      const lua = fs.readFileSync(luaPath, 'utf8');
      const err = checkLuaSyntax(lua);
      if (err) {
        throw new Error(
          `war3map.lua: Lua syntax error at line ${err.line ?? '?'}: ${err.message}` +
          ' (line refers to the packed script: source war3map.lua + generated blocks)'
        );
      }
      // Generated-constant lint (gotcha 27): a reserved-prefix identifier the
      // generated block doesn't define is a RUNTIME nil the syntax gate can't
      // see (the object-rename trap); user declarations squatting on the nine
      // prefixes shadow/collide with generated globals. Both FAIL the build.
      if (constants !== null) {
        const findings = lintGeneratedConstants(lua, constants.map((e) => e.constName));
        if (findings.length > 0) {
          throw new Error(
            'generated-constant lint failed (gotcha 27; line numbers are source-relative):\n  '
            + findings.map((f) => f.message).join('\n  '));
        }
      }
    }
    // JASS twin of the luaparse gate, via the OPTIONAL pjass checker
    // (lib/jasscheck.js): syntax errors FAIL the build; a missing pjass
    // degrades to a warning and the .j packs unchecked (validate-map WARNs
    // on the same condition). Full API-level checking needs user-supplied
    // common.j/Blizzard.j (WC3_JASS_API_DIR or WC3_COMMONJ+WC3_BLIZZARDJ);
    // without them pjass runs grammar/syntax-level only.
    const jassPath = path.join(tmp, 'war3map.j');
    if (fs.existsSync(jassPath)) {
      const jr = checkJassSyntax(fs.readFileSync(jassPath, 'utf8'));
      if (!jr.checked) {
        console.error(`warning: war3map.j packed unchecked (${jr.reason}) — scripts/setup.sh builds pjass when a C toolchain is available`);
      } else if (jr.errors.length > 0) {
        throw new Error(
          `war3map.j: pjass ${jr.mode === 'full' ? 'check' : 'syntax check (grammar-only: no common.j/Blizzard.j supplied)'} failed:\n  `
          + jr.errors.map((e) => `line ${e.line || '?'}: ${e.message}`).join('\n  '));
      }
    }
    const res = packDir(tmp, outW3x, { bare: opts.bare });
    const stabilized = opts.stabilize ? stabilizeSource(sourceDir, outW3x) : null;
    return { members: written, warnings, stabilized, ...res };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const USAGE = 'usage: node tools/build-map.js [--bare] [--stabilize] [--variant-name <name>] <map-source-dir> <out.w3x>';

function main(argv) {
  const opts = { bare: false, stabilize: false, variantName: null };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--bare') opts.bare = true;
    else if (a === '--stabilize') opts.stabilize = true;
    else if (a === '--variant-name') {
      opts.variantName = argv[++i];
      if (opts.variantName == null || opts.variantName.startsWith('--')) {
        console.error(USAGE + '\n--variant-name needs a value');
        process.exit(2);
      }
    } else rest.push(a);
  }
  const [sourceDir, outW3x] = rest;
  if (!sourceDir || !outW3x) {
    console.error(USAGE);
    process.exit(2);
  }
  try {
    const { files, headerFields, bytes, stabilized } = buildMap(sourceDir, outW3x, opts);
    console.log(`built ${outW3x} (${bytes} bytes, ${files.length} archive members)`);
    if (opts.bare) console.log('bare MPQ container (no HM3W pre-header — 1.31+ clients only)');
    else console.log(`HM3W header: name=${JSON.stringify(headerFields.name)} maxPlayers=${headerFields.maxPlayers ?? 4}`);
    if (opts.variantName) console.log(`variant name overlay: ${JSON.stringify(opts.variantName)} (HM3W header + w3i; source not modified)`);
    if (stabilized) {
      if (stabilized.length === 0) console.log('stabilize: source already at its translator fixed point — nothing rewritten');
      else console.log(`stabilize: rewrote ${stabilized.length} source file(s): ${stabilized.join(', ')}`);
    }
  } catch (e) {
    console.error('build failed: ' + (e.message || e));
    process.exit(1);
  }
}

if (require.main === module) main(process.argv.slice(2));
module.exports = { buildMap };
