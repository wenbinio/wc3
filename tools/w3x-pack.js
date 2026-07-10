#!/usr/bin/env node
'use strict';
// w3x-pack.js <dir> <out.w3x>
// Packs a directory of raw archive members (as produced by w3x-extract) into
// an MPQ v1 and prepends the 512-byte HM3W pre-header.
// Header fields come from <dir>/_header.json if present (as saved by
// w3x-extract), otherwise they are synthesized (name from war3map.w3i when
// parseable, else the directory name).
// Files named _*, manifest.json are never packed.

const fs = require('fs');
const path = require('path');
const { buildHeader, readW3iFlags } = require('../lib/header');
const { createArchive } = require('../lib/mpq');
const { walk, readJson } = require('../lib/source');
const { byWar, warToJson } = require('../lib/filemap');

function synthesizeHeader(dir) {
  const fields = { name: path.basename(path.resolve(dir)), flags: 0, maxPlayers: 4, unknown: 0 };
  try {
    const w3i = path.join(dir, 'war3map.w3i');
    if (fs.existsSync(w3i)) {
      const info = warToJson(byWar.get('war3map.w3i'), fs.readFileSync(w3i));
      if (info.map && info.map.name && !/^TRIGSTR_/.test(info.map.name)) fields.name = info.map.name;
      if (Array.isArray(info.players) && info.players.length > 0) fields.maxPlayers = info.players.length;
    }
  } catch { /* classic w3i etc. — keep defaults */ }
  return fields;
}

function packDir(dir, outW3x) {
  const files = walk(dir).filter((f) => !f.startsWith('_') && f !== 'manifest.json');
  if (files.length === 0) throw new Error(`no files to pack in ${dir}`);

  const hdrPath = path.join(dir, '_header.json');
  const headerFields = fs.existsSync(hdrPath) ? readJson(hdrPath) : synthesizeHeader(dir);

  // World Editor mirrors the w3i map-flags dword into the HM3W pre-header;
  // flags=0 there diverges from every real map. When the header fields don't
  // already carry flags (fresh sources, old _header.json), derive them from
  // the war3map.w3i being packed. A nonzero _header.json value wins (it came
  // from an extracted original).
  if (!headerFields.flags) {
    const w3iPath = path.join(dir, 'war3map.w3i');
    if (fs.existsSync(w3iPath)) {
      const flags = readW3iFlags(fs.readFileSync(w3iPath));
      if (flags !== null) headerFields.flags = flags;
    }
  }

  const tmpMpq = path.resolve(outW3x) + '.mpq.tmp';
  createArchive(tmpMpq, dir, files);
  const w3x = Buffer.concat([buildHeader(headerFields), fs.readFileSync(tmpMpq)]);
  fs.rmSync(tmpMpq, { force: true });
  fs.mkdirSync(path.dirname(path.resolve(outW3x)), { recursive: true });
  fs.writeFileSync(outW3x, w3x);
  return { files, headerFields, bytes: w3x.length };
}

function main(argv) {
  const [dir, outW3x] = argv;
  if (!dir || !outW3x) {
    console.error('usage: node tools/w3x-pack.js <dir> <out.w3x>');
    process.exit(2);
  }
  const { files, headerFields, bytes } = packDir(dir, outW3x);
  console.log(`packed ${files.length} file(s) into ${outW3x} (${bytes} bytes)`);
  console.log(`HM3W header: name=${JSON.stringify(headerFields.name)} flags=${headerFields.flags ?? 0} maxPlayers=${headerFields.maxPlayers ?? 4}`);
}

if (require.main === module) main(process.argv.slice(2));
module.exports = { packDir, synthesizeHeader };
