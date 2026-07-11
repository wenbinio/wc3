'use strict';
// Modern-map hardening (all fixtures synthesized in-test — shaped after real
// protected/production maps, no third-party content):
//
//   A. protection-trap heuristic (lib/traps.js): a tiny stub (e.g. 8-byte
//      war3map.w3r = version + 4 ASCII letters where the count belongs)
//      must be flagged, skipped by every parser (ours AND the viewer
//      fallback, which would otherwise allocate on the absurd count), and
//      degrade to raw-copy + manifest note in map-to-json and a per-file
//      WARN in validate-map — never an abort.
//   B. bounded readString (lib/translator-fixes.js FIX B): truncated string
//      data throws a catchable RangeError instead of upstream's infinite
//      `while (buf[off] !== 0)` loop-until-OOM.
//   C. doodad life:0 (FIX C): upstream writes `life || 100`, silently
//      turning a 0%-life doodad into 100% and failing round-trip comparison
//      on intact files (GWZ's war3map.doo, 184 doodads). Our jsonToWar
//      passes the 0 byte through; round-trip is stable and honest.
//   D. UTF-8-safe string reads (FIX A): upstream reads strings latin1 but
//      writes UTF-8, corrupting non-ASCII object data on rebuild (GWZ's
//      war3mapSkin.w3u em dashes / curly quotes). read->write->read must be
//      lossless with correct UTF-8 bytes on disk.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { checkSuspectedTrap } = require('../lib/traps');
const { byWar, warToJson, jsonToWar } = require('../lib/filemap');
const { extractedToSource } = require('../lib/source');
const { W3Buffer } = require('wc3maptranslator/dist/src/W3Buffer');

function tmpdir(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `wc3-${label}-`));
}

// An 8-byte booby-trapped w3r: int32 version 5, then 4 ASCII letters where
// the region count belongs (~1.3 billion regions "declared") — the shape
// protectors use (seen in a real modern map's war3map.w3r).
const TRAP_W3R = Buffer.concat([
  Buffer.from([0x05, 0x00, 0x00, 0x00]),
  Buffer.from('TRAP', 'latin1'),
]);

// ---- A. trap heuristic ------------------------------------------------------

test('traps: tiny w3r with absurd count is flagged with a precise note', () => {
  const note = checkSuspectedTrap('war3map.w3r', TRAP_W3R);
  assert.ok(note, 'trap detected');
  assert.match(note, /possible protection trap/);
  assert.match(note, /tiny 8-byte file/);
  assert.match(note, /at most 0 could fit/);
});

test('traps: no false positives on legit small or normal files', () => {
  // legitimately empty tables (count 0)
  assert.strictEqual(checkSuspectedTrap('war3map.w3r', Buffer.from([5, 0, 0, 0, 0, 0, 0, 0])), null);
  assert.strictEqual(checkSuspectedTrap('war3map.w3u', Buffer.from([3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])), null);
  // a one-region file small enough to sit under 64 bytes is honest
  const oneRegion = Buffer.alloc(40);
  oneRegion.writeInt32LE(5, 0);
  oneRegion.writeInt32LE(1, 4);
  assert.strictEqual(checkSuspectedTrap('war3map.w3r', oneRegion), null);
  // negative counts are absurd too
  const neg = Buffer.alloc(20);
  neg.writeInt32LE(5, 0);
  neg.writeInt32LE(-1, 4);
  assert.match(checkSuspectedTrap('war3map.w3r', neg), /possible protection trap/);
  // KB+ files are never second-guessed here (real parsing decides)
  assert.strictEqual(checkSuspectedTrap('war3map.w3r', Buffer.alloc(4096)), null);
  // formats without a known count field are never flagged
  assert.strictEqual(checkSuspectedTrap('war3map.w3i', TRAP_W3R), null);
});

test('traps: doo count-field offset is after the W3do magic + versions', () => {
  const dooTrap = Buffer.concat([
    Buffer.from('W3do', 'latin1'),
    Buffer.from([8, 0, 0, 0, 11, 0, 0, 0]),
    Buffer.from('TRAP', 'latin1'), // count
  ]);
  assert.match(checkSuspectedTrap('war3map.doo', dooTrap), /possible protection trap/);
});

test('traps: map-to-json path degrades to raw copy + manifest note, no abort', () => {
  const extracted = tmpdir('trap-ex');
  const source = tmpdir('trap-src');
  fs.writeFileSync(path.join(extracted, 'war3map.w3r'), TRAP_W3R);
  fs.writeFileSync(path.join(extracted, 'war3map.lua'), 'function config() end\nfunction main() end\n');

  const manifest = extractedToSource(extracted, source);

  const err = manifest.errors.find((e) => e.file === 'war3map.w3r');
  assert.ok(err, 'manifest records the trap file');
  assert.match(err.error, /possible protection trap/);
  assert.match(err.note, /suspected protection trap/);
  // copied through raw, byte-identical; never translated, no viewer fallback
  assert.ok(fs.readFileSync(path.join(source, 'files', 'war3map.w3r')).equals(TRAP_W3R));
  assert.ok(!fs.existsSync(path.join(source, 'regions.json')), 'not translated');
  assert.ok(!fs.existsSync(path.join(source, '_viewer', 'war3map.w3r.json')),
    'viewer fallback must not run on a suspected trap');
  assert.ok(!(manifest.viewerFallback && manifest.viewerFallback['war3map.w3r']));

  fs.rmSync(extracted, { recursive: true, force: true });
  fs.rmSync(source, { recursive: true, force: true });
});

test('traps: validate-map WARNs on the trap file and still completes', () => {
  // Build a real map from the demo template with the trap w3r injected as an
  // opaque file, then validate it end-to-end.
  const { validate } = require('../tools/validate-map');
  const srcDir = tmpdir('trap-mapsrc');
  const outDir = tmpdir('trap-mapout');
  fs.cpSync(path.join(__dirname, '..', 'maps', 'demo'), srcDir, { recursive: true });
  fs.mkdirSync(path.join(srcDir, 'files'), { recursive: true });
  fs.writeFileSync(path.join(srcDir, 'files', 'war3map.w3r'), TRAP_W3R);
  const w3x = path.join(outDir, 'trap.w3x');
  const { execFileSync } = require('child_process');
  execFileSync(process.execPath, [path.join(__dirname, '..', 'tools', 'build-map.js'), srcDir, w3x], { stdio: 'pipe' });

  const results = validate(w3x);
  const tr = results.find((r) => r.name === 'translate war3map.w3r');
  assert.ok(tr, 'trap file surfaced as a per-file result');
  assert.ok(tr.warn, 'reported as WARN, not FAIL');
  assert.match(tr.detail, /possible protection trap/);
  // the viewer's w3r parser is skipped for the trapped member too
  const vp = results.find((r) => r.name === 'viewer parse war3map.w3r');
  assert.ok(vp && vp.warn && /trap/.test(vp.detail), 'viewer parse skipped with a warn');
  // validation ran to completion and the rest of the demo map still passes
  const failures = results.filter((r) => !r.pass && !r.warn);
  assert.deepStrictEqual(failures, [], 'no hard failures on an otherwise-valid map');

  fs.rmSync(srcDir, { recursive: true, force: true });
  fs.rmSync(outDir, { recursive: true, force: true });
});

// ---- B. bounded readString --------------------------------------------------

test('readString: unterminated string throws RangeError instead of looping', () => {
  const b = new W3Buffer(Buffer.from('no terminator here', 'utf8'));
  assert.throws(() => b.readString(), RangeError);
  // and a translator over garbage-with-strings fails fast and catchably
  const { SoundsTranslator } = require('wc3maptranslator');
  const garbage = Buffer.concat([
    Buffer.from([3, 0, 0, 0, 2, 0, 0, 0]), // version 3, "2 sounds"
    Buffer.from('unterminated', 'utf8'),
  ]);
  assert.throws(() => SoundsTranslator.warToJson(garbage), RangeError);
});

// ---- C. doodad life:0 -------------------------------------------------------

test('doo: life 0 round-trips (upstream would silently write 100)', () => {
  const entry = byWar.get('war3map.doo');
  const doodads = {
    regular: [
      { type: 'ATtr', variation: 0, position: [0, 0, 128], angle: 0, scale: [1, 1, 1], flags: { visible: true, solid: false, fixedZ: false }, life: 0, id: 1 },
      { type: 'BTtw', variation: 2, position: [64, -64, 0], angle: 90, scale: [1, 1, 1], flags: { visible: true, solid: false, fixedZ: false }, id: 2 },
      { type: 'CTtc', variation: 0, position: [0, 0, 0], angle: 0, scale: [1, 1, 1], flags: { visible: true, solid: false, fixedZ: false }, life: 37, id: 3 },
    ],
    special: [],
  };
  const buf = jsonToWar(entry, doodads).buffer;
  // the life byte of the first doodad sits at a fixed offset in v8 sub 11:
  // W3do(4) ver(4) sub(4) count(4) type(4) var(4) pos(12) angle(4) scale(12)
  // skin(4) flags(1) -> life at 57
  assert.strictEqual(buf[57], 0, 'life byte written as 0, not 100');

  const j1 = warToJson(entry, buf);
  assert.strictEqual(j1.regular[0].life, 0, 'life: 0 present after re-read');
  assert.strictEqual(j1.regular[1].life, undefined, 'default 100 stays omitted');
  assert.strictEqual(j1.regular[2].life, 37);

  // full stability cycle (what validate-map checks) and no input mutation
  const j2 = warToJson(entry, jsonToWar(entry, j1).buffer);
  assert.deepStrictEqual(j2, j1);
  assert.strictEqual(j1.regular[0].life, 0, 'jsonToWar must not mutate its input');

  // document the upstream asymmetry this guards against: read keeps 0,
  // write drops it (`life || 100`) — if upstream ever fixes it, FIX C in
  // lib/translator-fixes.js can be retired.
  const { DoodadsTranslator } = require('wc3maptranslator');
  const upstreamBack = DoodadsTranslator.jsonToWar(j1).buffer;
  assert.strictEqual(upstreamBack[57], 100, 'upstream still has the life||100 bug');
});

// ---- D. UTF-8-safe strings in binary formats --------------------------------

test('object data: non-ASCII string mods round-trip as correct UTF-8', () => {
  const entry = byWar.get('war3mapSkin.w3u');
  const json = {
    original: {},
    custom: {
      'h001:hfoo': [
        { id: 'unam', type: 'string', level: 0, column: 0, value: 'Rifleman — “Long” Rifles… naïve élite' },
        { id: 'utub', type: 'string', level: 0, column: 0, value: 'Deals 25–40 damage' },
        { id: 'uhpm', type: 'int', level: 0, column: 0, value: 500 },
      ],
    },
  };
  const buf = jsonToWar(entry, json).buffer;
  // bytes on disk are real UTF-8: em dash E2 80 94, NOT latin1/truncated
  assert.ok(buf.includes(Buffer.from('— “Long” Rifles… naïve élite', 'utf8')));

  // read -> write -> read lossless (the GWZ war3mapSkin.w3u scenario)
  const j1 = warToJson(entry, buf);
  assert.strictEqual(j1.custom['h001:hfoo'][0].value, 'Rifleman — “Long” Rifles… naïve élite');
  assert.strictEqual(j1.custom['h001:hfoo'][1].value, 'Deals 25–40 damage');
  const j2 = warToJson(entry, jsonToWar(entry, j1).buffer);
  assert.deepStrictEqual(j2, j1);
});

test('readString: valid UTF-8 decodes; invalid bytes fall back to latin1', () => {
  const utf8 = new W3Buffer(Buffer.concat([Buffer.from('a—b', 'utf8'), Buffer.from([0])]));
  assert.strictEqual(utf8.readString(), 'a—b');
  // a lone 0xE9 is not valid UTF-8 -> legacy per-byte behavior is preserved
  const latin1 = new W3Buffer(Buffer.from([0x63, 0x61, 0x66, 0xE9, 0x00]));
  assert.strictEqual(latin1.readString(), 'café');
});

test('info.json strings: non-ASCII map name/description round-trip', () => {
  // end-to-end through InfoTranslator (readString patch + UTF-8 write)
  const entry = byWar.get('war3map.w3i');
  const infoJson = warToJson(entry, fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'war3map.w3i')));
  infoJson.map.name = 'Crossroads — Siege «Deluxe»';
  infoJson.map.description = 'Hold the line… or don’t.';
  const j1 = warToJson(entry, jsonToWar(entry, infoJson).buffer);
  assert.strictEqual(j1.map.name, 'Crossroads — Siege «Deluxe»');
  assert.strictEqual(j1.map.description, 'Hold the line… or don’t.');
});
