#!/usr/bin/env node
'use strict';
// json-to-map.js <json-dir> <out-dir>
// Inverse of map-to-json: turns a MAP SOURCE directory (JSON + scripts +
// files/ + imports/) back into a directory of raw war3map.* archive members,
// ready for w3x-pack. _header.json is copied through so w3x-pack can preserve
// the original HM3W header.

const fs = require('fs');
const path = require('path');
const { sourceToExtracted, writeJson } = require('../lib/source');

function main(argv) {
  const [jsonDir, outDir] = argv;
  if (!jsonDir || !outDir) {
    console.error('usage: node tools/json-to-map.js <json-dir> <out-dir>');
    process.exit(2);
  }
  try {
    const { written, header } = sourceToExtracted(jsonDir, outDir);
    if (header) writeJson(path.join(outDir, '_header.json'), header);
    console.log(`wrote ${written.length} archive member(s) to ${outDir}:`);
    for (const f of written) console.log('  ' + f);
    if (header) console.log('_header.json carried through for w3x-pack');
  } catch (e) {
    console.error('convert failed: ' + (e.message || e));
    process.exit(1);
  }
}

main(process.argv.slice(2));
