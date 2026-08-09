#!/usr/bin/env node
'use strict';
// Player-facing text overlay for the FoR-AI build.
//
// Every player-facing string in this map is a TRIGSTR reference into
// war3map.wts, so the map name, the picker description and the loading screen
// all live in one file. This script applies the AI build's overlay to it:
//
//   TRIGSTR_001  internal map name   -> distinct from the original (gotcha 17)
//   TRIGSTR_003  picker description  -> AI notice appended, ToaNoah credited
//   TRIGSTR_736  loading title       -> distinct
//   TRIGSTR_737  loading subtitle    -> credit + AI notice
//   TRIGSTR_738  loading body        -> one more hint line
//
// The archive is a BARE MPQ with no HM3W pre-header, so the w3i name is what
// the map picker shows and there is no second name to keep in sync. If a
// pre-header is ever added, _header.json must carry the same name.
//
// Everything goes through lib/wts.js so the file's byte dialect (BOM, CRLF,
// blank separator) survives the edit -- gotcha 35, which is exactly the class
// of silent breakage this kind of text patch causes. Nothing else in the
// archive is touched, and the ORIGINAL text is appended to, never replaced:
// the author's own description and Discord link stay intact.
//
// English is written apostrophe-free (gotcha 34 style precaution) and ASCII.
//
// Usage:  node describe.js <in.wts> <out.wts>
//         FORAI_WORK=<dir> node describe.js      (extract/ -> build-ai/)
//
// Idempotent: re-running on an already-overlaid file is a no-op.

const fs = require('fs');
const path = require('path');
const wts = require(path.join(__dirname, '..', '..', '..', 'lib', 'wts.js'));

const WORK = process.env.FORAI_WORK || __dirname;
const IN = process.argv[2] || path.join(WORK, 'extract', 'war3map.wts');
const OUT = process.argv[3] || path.join(WORK, 'build-ai', 'war3map.wts');

const NAME_SUFFIX = ' + AI';
const MARKER = 'AI BUILD -';
const AI_LINE =
  'AI BUILD - all empty slots, and any slot set to Computer, are played by an AI. ' +
  'Type -aieasy, -ainormal or -aihard to set the level. Original map by ToaNoah.';
const AI_HINT =
  '-All empty slots, and any Computer slots, are played by AI (-aieasy, -ainormal, -aihard)';

// The strings we expect to find. Overlaying text we have not read is how a
// patch like this silently mangles somebody else's map.
const EXPECT = {
  1: 'The Fall of Rome 1.06',
  736: 'Fall of Rome 1.06',
  737: 'By ToaNoah',
};

const orig = fs.readFileSync(IN);
const j = wts.warToJson(orig).json;

if (String(j['3'] && j['3'].value).includes(MARKER)) {
  fs.writeFileSync(OUT, orig);
  console.log('already overlaid; copied unchanged -> ' + OUT);
  process.exit(0);
}

for (const [k, want] of Object.entries(EXPECT)) {
  if (!j[k] || j[k].value !== want) {
    console.error(
      'refusing to patch: TRIGSTR_' + String(k).padStart(3, '0') +
      ' is ' + JSON.stringify(j[k] && j[k].value) + ', expected ' + JSON.stringify(want));
    process.exit(1);
  }
}

j['1'].value = EXPECT[1] + NAME_SUFFIX;
j['736'].value = EXPECT[736] + NAME_SUFFIX;
j['737'].value = 'By ToaNoah - AI computer players added';
j['3'].value = j['3'].value + '\r\n' + AI_LINE + '\r\n';
j['738'].value = j['738'].value + AI_HINT + '\r\n';

const authored = [j['1'].value, j['3'].value, j['736'].value, j['737'].value, j['738'].value].join('');
if (/'/.test(authored)) {
  console.error('refusing to patch: an apostrophe reached the authored text');
  process.exit(1);
}
if (/[^\x00-\x7F]/.test(authored)) {
  console.error('refusing to patch: non-ASCII reached the authored text');
  process.exit(1);
}

const out = wts.jsonToWar(j).buffer;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, out);

// dialect + blast-radius report, so a run of this script is self-verifying
const back = wts.warToJson(out).json;
const before = wts.warToJson(orig).json;
const keys = Object.keys(before).filter((k) => k !== '_dialect');
const changed = keys.filter((k) => before[k].value !== back[k].value);
console.log('wrote %s (%d -> %d bytes)', OUT, orig.length, out.length);
console.log('  dialect  : %s -> %s',
  JSON.stringify(before._dialect), JSON.stringify(back._dialect));
console.log('  entries  : %d -> %d', keys.length, Object.keys(back).filter((k) => k !== '_dialect').length);
console.log('  changed  : %d (%s)', changed.length,
  changed.map((k) => 'TRIGSTR_' + k.padStart(3, '0')).join(', '));
