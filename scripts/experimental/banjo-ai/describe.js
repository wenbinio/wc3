#!/usr/bin/env node
'use strict';
// Player-facing text for the AI build.
//
// The owner holds both the original and this build, and the WC3 map list shows
// the INTERNAL name, never the filename (gotcha 17) -- so without this the two
// are indistinguishable in the picker. The map name and description are
// TRIGSTR references into war3map.wts, so both live in one file.
//
//   TRIGSTR_001  map name     -> "... + AI" appended, colour codes preserved
//   TRIGSTR_003  description  -> AI notice + commands appended, authors credited
//   TRIGSTR_004  author       -> UNCHANGED (Garfield1337 and Dayne)
//
// Everything goes through lib/wts.js so the file's byte dialect (BOM, CRLF,
// separator) survives -- gotcha 35, the exact class of silent load-time
// breakage a naive text patch causes.
//
// It refuses to run if the strings it would overlay are not the ones it
// expects, so it cannot quietly mangle a different build, and it is idempotent.
//
// Usage: node describe.js <in.wts> <out.wts>

const fs = require('fs');
const path = require('path');
const wts = require('../../../lib/wts.js');

const EXPECT_NAME = '|c00468BFFBanjoball v1.22C1|r';
const EXPECT_DESC = '|c00468BFFA futbol (soccer) map with spells. Join the community on discord at https://discord.gg/hkH6VCn|r';

const NEW_NAME = '|c00468BFFBanjoball v1.22C1 + AI|r';
const NOTE = ' |cffffcc00AI BUILD - empty and Computer slots are played by a bot. '
           + 'Type -aieasy, -ainormal or -aihard to set its level, -aioff to turn it off. '
           + 'Original map by Garfield1337 and Dayne.|r';

function main() {
  const [inPath, outPath] = process.argv.slice(2);
  if (!inPath || !outPath) {
    console.error('usage: node describe.js <in.wts> <out.wts>');
    return 2;
  }

  const buf = fs.readFileSync(inPath);
  const res = wts.warToJson(buf);
  const j = res.json || res;
  const before = j._dialect ? JSON.stringify(j._dialect) : '(WE default)';

  const name = j['1'] && j['1'].value;
  const desc = j['3'] && j['3'].value;

  if (name === NEW_NAME) {
    console.log('already described — nothing to do (idempotent)');
    fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
    fs.writeFileSync(outPath, buf);
    return 0;
  }
  if (name !== EXPECT_NAME || desc !== EXPECT_DESC) {
    console.error('REFUSING: this is not the build this overlay was written for');
    console.error('  name: ' + JSON.stringify(name));
    console.error('  desc: ' + JSON.stringify(desc));
    return 1;
  }

  // The authored English is ASCII and apostrophe-free (gotcha 34, kept as a
  // cost-free style precaution).
  const authored = NEW_NAME + NOTE;
  if (/[^\x00-\x7F]/.test(authored) || authored.includes("'")) {
    console.error('REFUSING: authored text is not apostrophe-free ASCII');
    return 1;
  }

  j['1'].value = NEW_NAME;
  j['3'].value = desc + NOTE;

  const out = wts.jsonToWar(j);
  const outBuf = out.buffer || out;
  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  fs.writeFileSync(outPath, outBuf);

  // Re-read and prove the dialect and the entry count survived.
  const back = wts.warToJson(fs.readFileSync(outPath));
  const bj = back.json || back;
  const after = bj._dialect ? JSON.stringify(bj._dialect) : '(WE default)';
  const countIn = Object.keys(j).filter((k) => k !== '_dialect').length;
  const countOut = Object.keys(bj).filter((k) => k !== '_dialect').length;
  const bareLF = (outBuf.toString('latin1').match(/(?<!\r)\n/g) || []).length;

  console.log('dialect   in ' + before + '  ->  out ' + after);
  console.log('entries   ' + countIn + ' in, ' + countOut + ' out, 2 changed');
  console.log('bare LF   ' + bareLF + ' (a CRLF file must report 0)');
  console.log('name      ' + bj['1'].value);

  if (before !== after || countIn !== countOut || bareLF !== 0) {
    console.error('VERIFY FAILED: the byte dialect or entry set did not survive');
    return 1;
  }
  return 0;
}

process.exit(main());
