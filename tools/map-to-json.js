#!/usr/bin/env node
'use strict';
// map-to-json.js <extracted-dir> <json-dir>
// Runs every applicable wc3maptranslator warToJson over an extracted map
// directory, producing a MAP SOURCE directory (see lib/source.js for layout).
// Unknown/opaque files (shd, wpm, mmp, blp, mdx, wtg, ...) are copied through
// untouched under files/ and recorded in manifest.json. Files that fail to
// translate (e.g. classic-format w3i/w3e/doo) are also copied through, with
// the error recorded in the manifest — and on ANY translator failure a
// fallback parse via mdx-m3-viewer-th is attempted for files it has a parser
// for, written under _viewer/<name>.json (READ-ONLY diagnostics in the
// viewer's schema; not build-source, never repacked). Fallback failures are
// recorded in manifest.viewerFallbackErrors and warned about below (a
// truncated classic w3i additionally gets a tolerant second-tier read via
// lib/classicw3i.js). Underscore-prefixed inputs (e.g. w3x-extract's
// _unknown/ pseudo-file dump) are skipped, never treated as map source.

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
  if ((manifest.skipped || []).length) {
    console.log(`skipped ${manifest.skipped.length} non-archive diagnostic file(s) (_unknown/, _viewer/, ...): not map source`);
  }
  for (const e of manifest.errors) {
    console.error(`  WARN could not translate ${e.file} (copied through raw): ${e.error}${e.note ? ` [${e.note}]` : ''}`);
  }
  for (const [war, out] of Object.entries(manifest.viewerFallback || {})) {
    console.log(`  viewer fallback: ${war} -> ${out} (read-only diagnostics — not build-source)`);
  }
  for (const e of manifest.viewerFallbackErrors || []) {
    console.error(`  WARN viewer fallback failed for ${e.file}: ${e.error}${e.note ? ` (${e.note})` : ''}`);
  }
  console.log(`manifest written to ${jsonDir}/manifest.json`);
}

main(process.argv.slice(2));
