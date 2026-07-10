#!/usr/bin/env node
'use strict';
// w3x-extract.js <map.w3x> <outdir>
// Detects and saves the 512-byte HM3W pre-header (as <outdir>/_header.json),
// then extracts all MPQ contents into <outdir>.
// Works on bare MPQs too (no pre-header -> no _header.json written).

const fs = require('fs');
const path = require('path');
const { hasHM3W, parseHeader } = require('../lib/header');
const { extractAll } = require('../lib/mpq');
const { writeJson } = require('../lib/source');

function main(argv) {
  const [mapPath, outDir] = argv;
  if (!mapPath || !outDir) {
    console.error('usage: node tools/w3x-extract.js <map.w3x> <outdir>');
    process.exit(2);
  }
  const buf = fs.readFileSync(mapPath);
  fs.mkdirSync(outDir, { recursive: true });

  if (hasHM3W(buf)) {
    const header = parseHeader(buf);
    writeJson(path.join(outDir, '_header.json'), header);
    console.log(`HM3W pre-header: name=${JSON.stringify(header.name)} flags=${header.flags} maxPlayers=${header.maxPlayers} -> _header.json`);
  } else if (buf.toString('latin1', 0, 3) === 'MPQ') {
    console.log('no HM3W pre-header (bare MPQ archive)');
  } else {
    console.error('warning: neither HM3W nor MPQ magic at offset 0; trying smpq anyway');
  }

  const extracted = extractAll(mapPath, outDir);
  if (extracted.length === 0) {
    console.error('error: nothing extracted (no listfile and no known file names matched)');
    process.exit(1);
  }
  console.log(`extracted ${extracted.length} file(s) to ${outDir}:`);
  for (const f of extracted) console.log('  ' + f);
}

main(process.argv.slice(2));
