'use strict';
// Conversion between an EXTRACTED map directory (raw war3map.* binaries, as
// produced by w3x-extract) and a MAP SOURCE directory (the human/agent
// editable form used under maps/).
//
// MAP SOURCE LAYOUT
//   *.json            translatable data (info.json, terrain.json, units.json,
//                     objects-*.json ... see lib/filemap.js)
//   war3map.lua/.j    map script(s), verbatim text
//   files/<path>      opaque binaries copied verbatim into the archive root
//                     (war3map.shd, war3map.wpm, war3map.mmp, war3mapMap.blp,
//                     war3map.wtg, ... anything not translatable)
//   imports/<path>    custom assets (MDX/BLP/...); packed into the archive at
//                     <path> and auto-listed in war3map.imp when imports.json
//                     is absent
//   _header.json      HM3W pre-header fields {name, flags, maxPlayers}
//   manifest.json     written by map-to-json (informational)
// Files starting with '_' plus manifest.json never enter the archive.

const fs = require('fs');
const path = require('path');
const { TRANSLATABLE, SCRIPT_FILES, byWar, byJson, CONSUMED_AS_SKIN, warToJson, jsonToWar } = require('./filemap');
const { checkSuspectedTrap } = require('./traps');
const { generateMinimapTGA, generateMmp } = require('./minimap');
const { injectUnitsIntoLua } = require('./unitscript');
const { collectConstants, injectConstantsIntoLua } = require('./constants');

function walk(dir, base) {
  base = base || dir;
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p, base));
    else out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out;
}

function writeFileP(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, data);
}

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    throw new Error(`${p}: ${e.message || e}`);
  }
}

function writeJson(p, obj) {
  writeFileP(p, JSON.stringify(obj, null, 2) + '\n');
}

// Fallback reader for files wc3maptranslator rejects (classic/pre-Reforged
// formats, but also any other translator throw — classic files often fail
// with plain RangeErrors rather than version messages): parse with
// mdx-m3-viewer-th instead and write the result under _viewer/<war-name>.json.
// This output is READ-ONLY DIAGNOSTICS in the viewer's own object schema —
// it is NOT the build-source dialect: json-to-map/build-map ignore _viewer/
// entirely (underscore-prefixed paths never enter an archive) and cannot
// compile it back. Fallback failures are RECORDED (manifest
// .viewerFallbackErrors), never swallowed; a war3map.w3i whose viewer parse
// fails (e.g. protector-truncated) gets a second-tier tolerant classic read
// via lib/classicw3i.js.
function viewerFallbackToSource(base, srcPath, sourceDir, manifest) {
  const recordError = (error, note) => {
    if (!manifest.viewerFallbackErrors) manifest.viewerFallbackErrors = [];
    const e = { file: base, error: String(error && error.message || error) };
    if (note) e.note = note;
    manifest.viewerFallbackErrors.push(e);
  };
  const writeDiag = (schema, data) => {
    const rel = `_viewer/${base}.json`;
    writeJson(path.join(sourceDir, rel), {
      _schema: schema,
      _readOnly: 'diagnostics only — NOT build-source dialect; json-to-map ignores _viewer/',
      _source: base,
      data,
    });
    if (!manifest.viewerFallback) manifest.viewerFallback = {};
    manifest.viewerFallback[base] = rel;
  };
  let viewer;
  try {
    viewer = require('./viewer'); // lazy: only classic maps need it
  } catch (e) {
    recordError(e, 'mdx-m3-viewer-th not loadable');
    return;
  }
  if (!viewer.hasParser(base)) return; // nothing to try — raw copy is it
  try {
    const dir = path.dirname(srcPath);
    const ctx = viewer.contextFor((name) => {
      const p = path.join(dir, name);
      return fs.existsSync(p) ? fs.readFileSync(p) : null;
    });
    const parsed = viewer.parseMember(base, fs.readFileSync(srcPath), ctx);
    writeDiag('mdx-m3-viewer-th', viewer.toPlainJson(parsed));
  } catch (e) {
    // the raw copy under files/ stays the ground truth; second tier for w3i:
    // protectors often truncate the tail past the forces block, which every
    // strict parser rejects — the tolerant classic reader keeps what's there.
    if (base === 'war3map.w3i') {
      try {
        const { readClassicW3i } = require('./classicw3i');
        writeDiag('wc3-map-toolkit-classic-w3i', readClassicW3i(fs.readFileSync(srcPath)));
        recordError(e, 'viewer parse failed; recovered with the tolerant classic w3i reader (lib/classicw3i.js)');
        return;
      } catch { /* fall through to plain error record */ }
    }
    recordError(e);
  }
}

// extracted dir (war3map.* binaries) -> map source dir (JSON + files/ + imports/)
// Returns a manifest { translated, copied, scripts, errors, skipped,
// viewerFallback?, viewerFallbackErrors? }.
function extractedToSource(extractedDir, sourceDir) {
  const manifest = { translated: {}, scripts: [], copied: [], errors: [], skipped: [] };
  const all = walk(extractedDir);
  fs.mkdirSync(sourceDir, { recursive: true });

  for (const rel of all) {
    const base = rel.includes('/') ? null : rel; // translatables live at archive root
    const srcPath = path.join(extractedDir, rel);

    if (base === '_header.json' || base === 'manifest.json') {
      fs.copyFileSync(srcPath, path.join(sourceDir, base));
      continue;
    }
    if (rel.startsWith('_')) {
      // toolkit diagnostics (e.g. w3x-extract's _unknown/ pseudo-file dump):
      // not archive members — keep them out of files/ so they are never
      // treated as map source or repacked into an archive.
      manifest.skipped.push(rel);
      continue;
    }
    if (base && CONSUMED_AS_SKIN.has(base)) continue; // merged into its parent below
    const entry = base ? byWar.get(base) : undefined;

    if (entry) {
      const raw = fs.readFileSync(srcPath);
      // Protection-trap heuristic FIRST (lib/traps.js): a tiny stub whose
      // count field is absurd would make any parser loop or allocate GBs
      // (including the viewer fallback) — record it and copy raw instead.
      const trap = checkSuspectedTrap(base, raw);
      if (trap) {
        manifest.errors.push({
          file: rel,
          error: `translation skipped: ${trap}`,
          note: 'suspected protection trap — copied through raw; parsers (incl. viewer fallback) deliberately not run',
        });
        // fall through to the opaque copy below
      } else {
        try {
          let skinBuf;
          if (entry.skinWar) {
            const skinPath = path.join(extractedDir, entry.skinWar);
            if (fs.existsSync(skinPath)) skinBuf = fs.readFileSync(skinPath);
          }
          const json = warToJson(entry, raw, skinBuf);
          writeJson(path.join(sourceDir, entry.json), json);
          manifest.translated[base] = entry.json;
          continue;
        } catch (e) {
          // classic-format or corrupt file: fall through to opaque copy
          manifest.errors.push({ file: rel, error: String(e.message || e) });
          // ANY translator throw additionally gets a read-only fallback parse
          // attempt under _viewer/ when the viewer has a parser for the file —
          // classic formats don't reliably fail with a version message (e.g.
          // classic war3map.doo throws a plain RangeError). Fallback failures
          // are recorded in manifest.viewerFallbackErrors, never swallowed.
          viewerFallbackToSource(base, srcPath, sourceDir, manifest);
        }
      }
    }

    if (base && SCRIPT_FILES.includes(base)) {
      fs.copyFileSync(srcPath, path.join(sourceDir, base));
      manifest.scripts.push(base);
      continue;
    }

    // Everything else is opaque: copy under files/ preserving relative path.
    writeFileP(path.join(sourceDir, 'files', rel), fs.readFileSync(srcPath));
    manifest.copied.push(rel);
  }

  writeJson(path.join(sourceDir, 'manifest.json'), manifest);
  return manifest;
}

// wc3maptranslator dialect: a null FourCC (e.g. "no global weather", four
// zero BYTES in war3map.w3i) reads back from warToJson as the ASCII string
// '0000' — but jsonToWar would then write the literal ASCII bytes
// 0x30303030, which the game/map picker rejects as an invalid weather id
// (it is not an entry in TerrainArt\Weather.slk). Normalize such w3i
// null-sentinel FourCC fields before translating so the emitted bytes are
// 00 00 00 00 again. globalWeather is the only nullable FourCC in w3i that
// the translator gives a zero-sentinel write path; extend here if more are
// discovered. The '0000' form stays in the source JSON (translator dialect).
function normalizeForWar(entry, json) {
  if (entry.json === 'info.json' && json && typeof json === 'object') {
    const gw = json.globalWeather;
    if (gw == null || gw === '0000' || gw === '    ') {
      return { ...json, globalWeather: '' }; // falsy -> translator writes int 0
    }
  }
  return json;
}

// map source dir -> extracted-style dir of raw archive members.
// Returns { written: [relpaths], header: {..}|null }
function sourceToExtracted(sourceDir, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const written = [];
  const rootEntries = fs.readdirSync(sourceDir, { withFileTypes: true });

  const readSourceJson = (name) => {
    const p = path.join(sourceDir, name);
    return fs.existsSync(p) ? readJson(p) : null;
  };

  // 1. Translate *.json files known to the filemap.
  for (const ent of rootEntries) {
    if (!ent.isFile()) continue;
    const entry = byJson.get(ent.name);
    if (!entry) continue;
    const json = normalizeForWar(entry, readJson(path.join(sourceDir, ent.name)));
    const { buffer, skinBuffer } = jsonToWar(entry, json);
    writeFileP(path.join(outDir, entry.war), buffer);
    written.push(entry.war);
    if (skinBuffer && entry.skinWar) {
      writeFileP(path.join(outDir, entry.skinWar), skinBuffer);
      written.push(entry.skinWar);
    }
  }

  // 2. Copy scripts verbatim — except war3map.lua, which gets two generated
  //    marker-delimited blocks (each stripped before regeneration, so
  //    repacking an extracted source is stable):
  //      - the CreateAllUnits() block APPENDED from units.json
  //        (war3mapUnits.doo is editor-only data; the game only creates
  //        script-created units) — lib/unitscript.js;
  //      - the named-constants block PREPENDED above the user script
  //        (UNIT_/ITEM_/... globals derived from the source JSON, so map
  //        code needs no raw FourCC literals) — lib/constants.js.
  //    JASS (war3map.j) sources are copied untouched — write CreateAllUnits
  //    and your own constants yourself there.
  const unitsJson = readSourceJson('units.json');
  const constants = collectConstants(sourceDir);
  for (const s of SCRIPT_FILES) {
    const p = path.join(sourceDir, s);
    if (!fs.existsSync(p)) continue;
    if (s === 'war3map.lua') {
      let lua = fs.readFileSync(p, 'utf8');
      if (unitsJson) lua = injectUnitsIntoLua(lua, unitsJson);
      lua = injectConstantsIntoLua(lua, constants);
      fs.writeFileSync(path.join(outDir, s), lua);
    } else {
      fs.copyFileSync(p, path.join(outDir, s));
    }
    written.push(s);
  }

  // 3. Copy opaque files/ tree to the archive root.
  for (const rel of walk(path.join(sourceDir, 'files'))) {
    writeFileP(path.join(outDir, rel), fs.readFileSync(path.join(sourceDir, 'files', rel)));
    written.push(rel);
  }

  // 4. Copy imports/ tree; auto-generate war3map.imp if no imports.json given.
  const importRels = walk(path.join(sourceDir, 'imports'));
  for (const rel of importRels) {
    writeFileP(path.join(outDir, rel), fs.readFileSync(path.join(sourceDir, 'imports', rel)));
    written.push(rel);
  }
  if (importRels.length > 0 && !written.includes('war3map.imp')) {
    const impEntry = byJson.get('imports.json');
    const impJson = importRels.map((r) => r.replace(/\//g, '\\'));
    writeFileP(path.join(outDir, impEntry.war), jsonToWar(impEntry, impJson).buffer);
    written.push(impEntry.war);
  }

  // 5. Minimap preview: every real map ships a minimap image
  //    (war3mapMap.blp/.tga) and icon file (war3map.mmp) — the map picker
  //    renders them. Generate both from the JSON when the source doesn't
  //    provide its own under files/.
  const terrainJson = readSourceJson('terrain.json');
  if (terrainJson && !written.includes('war3mapMap.blp') && !written.includes('war3mapMap.tga')) {
    writeFileP(path.join(outDir, 'war3mapMap.tga'), generateMinimapTGA(terrainJson));
    written.push('war3mapMap.tga');
  }
  if (terrainJson && !written.includes('war3map.mmp')) {
    const infoJson = readSourceJson('info.json');
    writeFileP(path.join(outDir, 'war3map.mmp'), generateMmp(infoJson, unitsJson || [], terrainJson));
    written.push('war3map.mmp');
  }

  // 6. Header fields pass through for the packer.
  let header = null;
  const hdrPath = path.join(sourceDir, '_header.json');
  if (fs.existsSync(hdrPath)) header = readJson(hdrPath);

  return { written, header };
}

module.exports = { walk, readJson, writeJson, writeFileP, extractedToSource, sourceToExtracted };
