'use strict';
// lib/wts.js — the linear war3map.wts parser/serializer that replaces
// wc3maptranslator's StringsTranslator in both directions (filemap wiring).
//
// Invariants proven here:
//   1. EQUIVALENCE: on ASCII inputs, warToJson matches upstream
//      StringsTranslator's JSON exactly and jsonToWar is byte-identical —
//      existing strings.json sources keep producing the same archives.
//   2. SCALE: production-sized wts (~10k STRING blocks, ~1.5MB — the shape
//      of X Hero Siege / Northrend Bound, where upstream's
//      O(size x blocks) regex loop dies with a multi-GB heap) parses and
//      serializes in well under 2 seconds on a normal heap.
//   3. UTF-8: non-ASCII values survive write->read losslessly as real UTF-8
//      bytes (upstream's writer truncates each char to one byte — gotcha 16;
//      for wts that rule is fixed at our layer).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const wts = require('../lib/wts');
const { StringsTranslator } = require('wc3maptranslator');
const { byWar, byJson, warToJson, jsonToWar } = require('../lib/filemap');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'war3map.wts');

test('wts: filemap routes war3map.wts/strings.json through lib/wts.js', () => {
  assert.strictEqual(byWar.get('war3map.wts').module, wts);
  assert.strictEqual(byJson.get('strings.json').module, wts);
});

test('wts: json equivalent to upstream StringsTranslator on the fixture', () => {
  const buf = fs.readFileSync(FIXTURE);
  const ours = wts.warToJson(buf).json;
  const upstream = StringsTranslator.warToJson(buf).json;
  assert.ok(Object.keys(ours).length > 50, 'fixture has a real string table');
  assert.deepStrictEqual(ours, upstream);
});

test('wts: jsonToWar byte-identical to upstream on ASCII (fixture)', () => {
  const json = wts.warToJson(fs.readFileSync(FIXTURE)).json;
  const ours = wts.jsonToWar(json).buffer;
  const upstream = StringsTranslator.jsonToWar(json).buffer;
  assert.ok(ours.equals(upstream), 'serialized bytes must match upstream for ASCII sources');
  // and the rewrite re-reads to the same JSON (translator fixed-point)
  assert.deepStrictEqual(wts.warToJson(ours).json, json);
});

// Synthetic corner cases, checked against upstream on the same bytes so the
// two parsers agree block-for-block: BOM, LF-only and CRLF endings, comment
// lines (kept verbatim incl. their newline), duplicate ids (last wins),
// values containing blank lines / '{' / 'STRING n' text, junk between
// blocks, and a "STRING x" non-block that must be skipped.
test('wts: dialect corner cases match upstream', () => {
  const text = '﻿' +
    'STRING 0\r\n// Comment: kept verbatim (Hotkey - Learn)\r\n{\r\nU\r\n}\r\n\r\n' +
    'STRING 1\n{\nLF-only endings\n}\n\n' +
    'STRING 2\r\n{\r\nfirst\r\n}\r\n\r\n' +
    'STRING 2\r\n{\r\nlast one wins\r\n}\r\n\r\n' +
    'garbage between blocks\r\n' +
    'STRING x not a block\r\n' +
    'STRING 007\r\n{\r\nleading zeros stay literal\r\n}\r\n\r\n' +
    'STRING 3\r\n{\r\nvalue with { brace\r\nand a blank line:\r\n\r\nand STRING 99 inside\r\n}\r\n\r\n';
  const buf = Buffer.from(text, 'utf8');
  const ours = wts.warToJson(buf).json;
  const upstream = StringsTranslator.warToJson(buf).json;
  assert.deepStrictEqual(ours, upstream);
  assert.strictEqual(ours['2'].value, 'last one wins');
  assert.strictEqual(ours['007'].value, 'leading zeros stay literal');
  assert.strictEqual(ours['0'].comment, '// Comment: kept verbatim (Hotkey - Learn)\r\n');
  assert.strictEqual(ours['3'].value, 'value with { brace\r\nand a blank line:\r\n\r\nand STRING 99 inside');
  // ASCII re-serialization also byte-matches upstream
  assert.ok(wts.jsonToWar(ours).buffer.equals(StringsTranslator.jsonToWar(upstream).buffer));
});

test('wts: production-scale file (~10k strings) parses in <2s on a normal heap', () => {
  // Shape modeled on the real X Hero Siege / Northrend Bound tables:
  // ~10k blocks, many with "// ..." comments, multi-line color-coded values,
  // ~1.5MB total. (Synthetic: no third-party map content enters the repo.)
  const parts = ['﻿'];
  for (let i = 0; i < 10000; i++) {
    parts.push(`STRING ${i}\r\n`);
    if (i % 3 === 0) parts.push(`// Units: u${i.toString(36)} (Attack ${i}), Name (Name)\r\n`);
    parts.push('{\r\n');
    parts.push(`|cffFF6666Hero ${i}|r deals ${i * 7} damage\r\nSecond line of tooltip text for entry number ${i}, padded ${'x'.repeat(60)}\r\n`);
    parts.push('}\r\n\r\n');
  }
  const buf = Buffer.from(parts.join(''), 'utf8');
  assert.ok(buf.length > 1_300_000, `synthetic wts is production-sized (${buf.length} bytes)`);

  const t0 = Date.now();
  const json = wts.warToJson(buf).json;
  const rewritten = wts.jsonToWar(json).buffer;
  const json2 = wts.warToJson(rewritten).json;
  const elapsed = Date.now() - t0;

  assert.strictEqual(Object.keys(json).length, 10000);
  assert.deepStrictEqual(json2, json);
  assert.ok(elapsed < 2000, `parse+serialize+reparse took ${elapsed}ms (must be <2000ms)`);
});

test('wts: non-ASCII survives as real UTF-8 both directions (gotcha 16 fixed for wts)', () => {
  const json = {
    0: { value: 'em dash — curly “quotes” … café → 你好' },
    1: { value: 'plain ascii', comment: '// commented — too\r\n' },
  };
  const buf = wts.jsonToWar(json).buffer;
  // bytes are genuine UTF-8 (em dash = E2 80 94), not charCode&0xFF (= 0x14)
  assert.ok(buf.includes(Buffer.from([0xE2, 0x80, 0x94])), 'em dash written as UTF-8');
  assert.ok(!buf.includes(0x14), 'no truncated control byte');
  assert.deepStrictEqual(wts.warToJson(buf).json, json);
});

test('wts: filemap warToJson/jsonToWar use lib/wts.js end to end', () => {
  const entry = byWar.get('war3map.wts');
  const json = warToJson(entry, fs.readFileSync(FIXTURE));
  assert.deepStrictEqual(json, wts.warToJson(fs.readFileSync(FIXTURE)).json);
  const back = jsonToWar(entry, json);
  assert.ok(back.buffer.equals(wts.jsonToWar(json).buffer));
});
