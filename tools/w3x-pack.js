#!/usr/bin/env node
'use strict';
// w3x-pack.js [--bare] <dir> <out.w3x>
// Packs a directory of raw archive members (as produced by w3x-extract) into
// an MPQ v1 and prepends the 512-byte HM3W pre-header.
// Header fields come from <dir>/_header.json if present (as saved by
// w3x-extract), otherwise they are synthesized (name from war3map.w3i when
// parseable, else the directory name).
// --bare emits a bare MPQ instead (no HM3W pre-header, archive at offset 0)
// — the modern container real 2023+ maps ship; only 1.31+ clients read it.
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

function packDir(dir, outW3x, opts) {
  opts = opts || {};
  const files = walk(dir).filter((f) => !f.startsWith('_') && f !== 'manifest.json');
  if (files.length === 0) throw new Error(`no files to pack in ${dir}`);

  if (opts.bare) {
    // Bare MPQ (no HM3W pre-header, archive at offset 0): the modern .w3x
    // container. stormlib: create fresh with no pre-written header file;
    // smpq: no concat step — both are what createArchive does without a
    // headerBuf argument.
    const outAbs = createArchive(outW3x, dir, files);
    return { files, headerFields: null, bare: true, bytes: fs.statSync(outAbs).size };
  }

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

  // One-pass .w3x creation: the 512-byte HM3W pre-header is written first and
  // the MPQ v1 archive follows at offset 512 (lib/mpq.js handles both
  // backends; with stormlib-node no concat step is needed at all).
  const outAbs = createArchive(outW3x, dir, files, buildHeader(headerFields));
  return { files, headerFields, bare: false, bytes: fs.statSync(outAbs).size };
}

function main(argv) {
  const bare = argv.includes('--bare');
  const [dir, outW3x] = argv.filter((a) => a !== '--bare');
  if (!dir || !outW3x) {
    console.error('usage: node tools/w3x-pack.js [--bare] <dir> <out.w3x>');
    process.exit(2);
  }
  const { files, headerFields, bytes } = packDir(dir, outW3x, { bare });
  console.log(`packed ${files.length} file(s) into ${outW3x} (${bytes} bytes)`);
  if (bare) console.log('bare MPQ container (no HM3W pre-header — 1.31+ clients only)');
  else console.log(`HM3W header: name=${JSON.stringify(headerFields.name)} flags=${headerFields.flags ?? 0} maxPlayers=${headerFields.maxPlayers ?? 4}`);
}

if (require.main === module) main(process.argv.slice(2));
module.exports = { packDir, synthesizeHeader };
