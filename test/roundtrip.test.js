'use strict';
// JSON round-trip tests over the MIT fixtures (current/Reforged formats).
// Byte-for-byte equality is NOT guaranteed by wc3maptranslator (e.g. floats,
// field ordering), so the invariant we test is JSON stability:
//   warToJson(bin) == warToJson(jsonToWar(warToJson(bin)))

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { TRANSLATABLE, warToJson, jsonToWar } = require('../lib/filemap');

const FIXTURES = path.join(__dirname, '..', 'fixtures');

for (const entry of TRANSLATABLE) {
  const warPath = path.join(FIXTURES, entry.war);
  if (!fs.existsSync(warPath)) continue; // not all skin variants have fixtures

  test(`fixture round-trip: ${entry.war} <-> ${entry.json}`, () => {
    let skinBuf;
    if (entry.skinWar) {
      const p = path.join(FIXTURES, entry.skinWar);
      if (fs.existsSync(p)) skinBuf = fs.readFileSync(p);
    }
    const json1 = warToJson(entry, fs.readFileSync(warPath), skinBuf);
    const back = jsonToWar(entry, json1);
    assert.ok(Buffer.isBuffer(back.buffer) && back.buffer.length > 0, 'jsonToWar produced bytes');
    const json2 = warToJson(entry, back.buffer, back.skinBuffer);
    assert.deepStrictEqual(json2, json1, 'JSON not stable across jsonToWar/warToJson');
  });
}

test('destructables skin split: skin fields go to war3mapSkin.w3b', () => {
  const entry = TRANSLATABLE.find((e) => e.war === 'war3map.w3b');
  const json = warToJson(
    entry,
    fs.readFileSync(path.join(FIXTURES, 'war3map.w3b')),
    fs.readFileSync(path.join(FIXTURES, 'war3mapSkin.w3b'))
  );
  const back = jsonToWar(entry, json);
  // The fixture skin file contains skin-only fields, so a skin buffer must
  // reappear when writing back.
  assert.ok(back.skinBuffer && back.skinBuffer.length > 4, 'expected a war3mapSkin.w3b buffer');
});
