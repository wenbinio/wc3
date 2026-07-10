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
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function writeJson(p, obj) {
  writeFileP(p, JSON.stringify(obj, null, 2) + '\n');
}

// extracted dir (war3map.* binaries) -> map source dir (JSON + files/ + imports/)
// Returns a manifest { translated, copied, scripts, errors }.
function extractedToSource(extractedDir, sourceDir) {
  const manifest = { translated: {}, scripts: [], copied: [], errors: [] };
  const all = walk(extractedDir);
  fs.mkdirSync(sourceDir, { recursive: true });

  for (const rel of all) {
    const base = rel.includes('/') ? null : rel; // translatables live at archive root
    const srcPath = path.join(extractedDir, rel);

    if (base === '_header.json' || base === 'manifest.json') {
      fs.copyFileSync(srcPath, path.join(sourceDir, base));
      continue;
    }
    if (base && CONSUMED_AS_SKIN.has(base)) continue; // merged into its parent below
    const entry = base ? byWar.get(base) : undefined;

    if (entry) {
      try {
        let skinBuf;
        if (entry.skinWar) {
          const skinPath = path.join(extractedDir, entry.skinWar);
          if (fs.existsSync(skinPath)) skinBuf = fs.readFileSync(skinPath);
        }
        const json = warToJson(entry, fs.readFileSync(srcPath), skinBuf);
        writeJson(path.join(sourceDir, entry.json), json);
        manifest.translated[base] = entry.json;
        continue;
      } catch (e) {
        // classic-format or corrupt file: fall through to opaque copy
        manifest.errors.push({ file: rel, error: String(e.message || e) });
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

// map source dir -> extracted-style dir of raw archive members.
// Returns { written: [relpaths], header: {..}|null }
function sourceToExtracted(sourceDir, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const written = [];
  const rootEntries = fs.readdirSync(sourceDir, { withFileTypes: true });

  // 1. Translate *.json files known to the filemap.
  for (const ent of rootEntries) {
    if (!ent.isFile()) continue;
    const entry = byJson.get(ent.name);
    if (!entry) continue;
    const json = readJson(path.join(sourceDir, ent.name));
    const { buffer, skinBuffer } = jsonToWar(entry, json);
    writeFileP(path.join(outDir, entry.war), buffer);
    written.push(entry.war);
    if (skinBuffer && entry.skinWar) {
      writeFileP(path.join(outDir, entry.skinWar), skinBuffer);
      written.push(entry.skinWar);
    }
  }

  // 2. Copy scripts verbatim.
  for (const s of SCRIPT_FILES) {
    const p = path.join(sourceDir, s);
    if (fs.existsSync(p)) {
      fs.copyFileSync(p, path.join(outDir, s));
      written.push(s);
    }
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

  // 5. Header fields pass through for the packer.
  let header = null;
  const hdrPath = path.join(sourceDir, '_header.json');
  if (fs.existsSync(hdrPath)) header = readJson(hdrPath);

  return { written, header };
}

module.exports = { walk, readJson, writeJson, writeFileP, extractedToSource, sourceToExtracted };
