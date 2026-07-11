#!/usr/bin/env node
'use strict';
// Regenerates lib/sim/data/jass-constants.json — the JASS API constant table
// the headless logic-test harness (lib/sim/) exposes to map scripts.
//
// Source of truth: the community-documented common.j / Blizzard.j API
// listings in the jassdoc project (https://github.com/lep/jassdoc). Only
// declaration FACTS are extracted (constant name, handle type, integer/real
// value) — no Blizzard code or assets are copied; this is the same API
// surface every WC3 tooling stack (w3ts, jass typings, vJass compilers)
// ships. Run with network access:
//
//   node scripts/gen-jass-constants.js
//
// Output JSON shape (lib/sim/natives.js consumes it):
//   { "constants": {
//       "NAME": { "conv": "ConvertPlayerState", "arg": 1 },  handle constant
//       "NAME": { "value": 24 },                             plain number/bool
//       "NAME": { "call": "GetPlayerNeutralAggressive" } },  native-call value
//     "functions": ["CreateUnit", ...] }   every native + BJ function name —
// the auto-stub tier only answers for THESE names, so unknown map-author
// globals keep normal Lua nil semantics.

const https = require('https');
const fs = require('fs');
const path = require('path');

const SOURCES = [
  'https://raw.githubusercontent.com/lep/jassdoc/master/common.j',
  'https://raw.githubusercontent.com/lep/jassdoc/master/Blizzard.j',
];

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) return reject(new Error(`${url}: HTTP ${res.statusCode}`));
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    }).on('error', reject);
  });
}

function parseConstants(text, out) {
  // constant <type> <NAME> = <expr>  (globals-block declarations)
  const re = /^\s*constant\s+(\w+)\s+(\w+)\s*=\s*(.+?)\s*(?:\/\/.*)?$/gm;
  let m;
  while ((m = re.exec(text)) !== null) {
    const [, , name, expr] = m;
    if (out[name]) continue;
    let mm;
    if ((mm = expr.match(/^(Convert\w+)\(\s*(-?\d+)\s*\)$/))) {
      out[name] = { conv: mm[1], arg: Number(mm[2]) };
    } else if ((mm = expr.match(/^(GetPlayerNeutralPassive|GetPlayerNeutralAggressive|GetBJMaxPlayers|GetBJPlayerNeutralVictim|GetBJPlayerNeutralExtra|GetBJMaxPlayerSlots)\(\)$/))) {
      out[name] = { call: mm[1] };
    } else if (/^-?\d+$/.test(expr)) {
      out[name] = { value: Number(expr) };
    } else if (/^-?(\d+\.\d*|\.\d+)$/.test(expr)) {
      out[name] = { value: Number(expr) };
    } else if (/^0x[0-9a-fA-F]+$/.test(expr)) {
      out[name] = { value: parseInt(expr, 16) };
    } else if (expr === 'true' || expr === 'false') {
      out[name] = { value: expr === 'true' };
    } else if (/^'.{4}'$/.test(expr)) {
      const s = expr.slice(1, -1);
      let v = 0;
      for (const ch of s) v = v * 256 + ch.charCodeAt(0);
      out[name] = { value: v };
    } else if (out[expr]) {
      out[name] = out[expr]; // alias of an earlier constant
    }
    // anything else (string constants, arithmetic) is skipped — the sim's
    // auto-stub sentinel covers names the table doesn't carry
  }
}

function parseFunctionNames(text, out) {
  // native <name> takes ...   /   function <name> takes ...  (Blizzard.j BJs)
  const re = /^\s*(?:constant\s+)?(?:native|function)\s+(\w+)\s+takes\s/gm;
  let m;
  while ((m = re.exec(text)) !== null) out.add(m[1]);
}

async function main() {
  const constants = {};
  const fns = new Set();
  for (const url of SOURCES) {
    process.stderr.write(`fetching ${url} ...\n`);
    const text = await fetch(url);
    parseConstants(text, constants);
    parseFunctionNames(text, fns);
  }
  const out = { constants, functions: [...fns].sort() };
  const dest = path.join(__dirname, '..', 'lib', 'sim', 'data', 'jass-constants.json');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(out, null, 1) + '\n');
  console.log(`wrote ${dest} (${Object.keys(constants).length} constants, ${fns.size} functions)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
