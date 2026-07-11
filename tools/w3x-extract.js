#!/usr/bin/env node
'use strict';
// w3x-extract.js [--dump-unknown] [--recover-names] <map.w3x> <outdir>
// Detects and saves the 512-byte HM3W pre-header (as <outdir>/_header.json),
// then extracts all MPQ contents into <outdir>.
// Works on bare MPQs too (no pre-header -> no _header.json written).
// Protected maps (stripped OR fake listfile): named extraction always probes
// the listfile ∪ known names; the summary always reports how many anonymous
// (unresolved) entries remain.
// --dump-unknown (or WC3_EXTRACT_UNKNOWN=1) additionally dumps those under
// <outdir>/_unknown/ with their FileNNNNNNNN pseudo-names and content-sniffed
// extensions (MDLX -> .mdx, BLP1/BLP2 -> .blp, ...). _unknown/ is diagnostics
// only — map-to-json ignores it and it never enters a rebuilt archive.
// --recover-names (implies --dump-unknown for the remainder) then harvests
// candidate path strings from the extracted content itself (scripts, object
// data, .toc lists, MDX TEXS chunks, derived BTN/DISBTN + .mdl/.mdx
// variants), hash-probes them against the archive, and extracts every hit
// under its real name — see lib/recover.js.

const fs = require('fs');
const path = require('path');
const { hasHM3W, parseHeader } = require('../lib/header');
const { extractAll } = require('../lib/mpq');
const { recoverNames } = require('../lib/recover');
const { writeJson } = require('../lib/source');

function main(argv) {
  const recover = argv.includes('--recover-names');
  const dumpUnknown = argv.includes('--dump-unknown') || recover;
  const [mapPath, outDir] = argv.filter((a) => !a.startsWith('--'));
  if (!mapPath || !outDir) {
    console.error('usage: node tools/w3x-extract.js [--dump-unknown] [--recover-names] <map.w3x> <outdir>');
    process.exit(2);
  }
  try {
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

    const result = dumpUnknown ? extractAll(mapPath, outDir, { dumpUnknown: true })
      : extractAll(mapPath, outDir);
    const { extracted, total, unresolved, unknown } = result;
    if (extracted.length === 0 && unknown.length === 0) {
      console.error('error: nothing extracted (no listfile and no known file names matched)');
      process.exit(1);
    }
    console.log(`archive entries: ${total ?? 'unknown'} — named extracted: ${extracted.length}, unresolved (anonymous): ${unresolved ?? 'unknown'}`);
    console.log(`extracted ${extracted.length} file(s) to ${outDir}:`);
    for (const f of extracted) console.log('  ' + f);
    if (unknown.length > 0) {
      console.log(`dumped ${unknown.length} anonymous member(s) under ${outDir}/_unknown/ (pseudo-names + sniffed extensions; diagnostics only, never repacked):`);
      for (const f of unknown) console.log('  ' + f);
    } else if (unresolved > 0) {
      console.log(`note: ${unresolved} anonymous member(s) were NOT extracted (listfile stripped?) — rerun with --dump-unknown (or WC3_EXTRACT_UNKNOWN=1) to dump them under _unknown/`);
    }
    if (recover) {
      const st = recoverNames(mapPath, outDir);
      console.log(`name recovery: ${st.recovered.length} name(s) recovered (${st.probed} candidate(s) probed over ${st.passes} pass(es); ${st.pruned} _unknown/ duplicate(s) pruned):`);
      for (const f of st.recovered.slice().sort()) console.log('  ' + f);
      if (st.recovered.length === 0) console.log('  (none — the map may not reference its hidden members by path)');
    }
  } catch (e) {
    console.error('extract failed: ' + (e.message || e));
    process.exit(1);
  }
}

main(process.argv.slice(2));
