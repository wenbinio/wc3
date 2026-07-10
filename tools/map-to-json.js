#!/usr/bin/env node
'use strict';
// map-to-json.js <extracted-dir> <json-dir>
// Runs every applicable wc3maptranslator warToJson over an extracted map
// directory, producing a MAP SOURCE directory (see lib/source.js for layout).
// Unknown/opaque files (shd, wpm, mmp, blp, mdx, wtg, ...) are copied through
// untouched under files/ and recorded in manifest.json. Files that fail to
// translate (e.g. classic-format w3i/w3e) are also copied through, with the
// error recorded in the manifest.

const fs = require('fs');
const { extractedToSource } = require('../lib/source');

function main(argv) {
  const [extractedDir, jsonDir] = argv;
  if (!extractedDir || !jsonDir) {
    console.error('usage: node tools/map-to-json.js <extracted-dir> <json-dir>');
    process.exit(2);
  }
  if (!fs.existsSync(extractedDir)) {
    console.error(`translate failed: extracted dir not found: ${extractedDir}`);
    process.exit(1);
  }
  const manifest = extractedToSource(extractedDir, jsonDir);
  const nT = Object.keys(manifest.translated).length;
  console.log(`translated ${nT} file(s):`);
  for (const [war, json] of Object.entries(manifest.translated)) console.log(`  ${war} -> ${json}`);
  if (manifest.scripts.length) console.log(`scripts copied: ${manifest.scripts.join(', ')}`);
  if (manifest.copied.length) {
    console.log(`copied opaque file(s) under files/: ${manifest.copied.length}`);
    for (const f of manifest.copied) console.log('  ' + f);
  }
  for (const e of manifest.errors) {
    console.error(`  WARN could not translate ${e.file} (copied through raw): ${e.error}`);
  }
  console.log(`manifest written to ${jsonDir}/manifest.json`);
}

main(process.argv.slice(2));
