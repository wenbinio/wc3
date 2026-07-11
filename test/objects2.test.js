'use strict';
// Object-data v1/v2 codec tests: lib/codecs/objects2.js.
//
// Three layers of proof (same doctrine as test/codecs.test.js):
//   1. Synthetic fixtures — minimal v1/v2 binaries produced by OUR writer
//      are checked against hand-assembled spec bytes, cross-verified by
//      mdx-m3-viewer-th's independent w3u/w3d parsers (field-level reads AND
//      a byte-identical viewer re-save), then must be read->write byte
//      fixpoints and JSON-stable through the codec.
//   2. Real map samples (guarded by fs.existsSync; read-only scratchpad
//      files, never copied into the repo) — byte fixpoint + JSON stability
//      on Island Troll Tribes (Wurst-emitted v2, all seven files), DracoL1ch
//      DotA (v2 w3a/w3b/w3d) and X Hero Siege (classic WE v2).
//   3. Pipeline integration — map-to-json/json-to-map level edit round-trip
//      on a v2 object file (editable objects-*.json with a version marker,
//      NOT the read-only _viewer/ fallback).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const objects2 = require('../lib/codecs/objects2');
const { byWar, warToJson, jsonToWar } = require('../lib/filemap');
const { extractedToSource, sourceToExtracted, readJson, writeJson } = require('../lib/source');

// mdx-m3-viewer-th: the INDEPENDENT parser stack (gotcha 15: always feed it
// fresh Uint8Array copies, never Node Buffers)
const w3x = require('mdx-m3-viewer-th/dist/cjs/parsers/w3x/index.js').default;

const SCRATCH = '/tmp/claude-0/-home-user-wc3/df8a77ea-156b-5f11-9fb8-e8ed8104d142/scratchpad';
const REAL_SAMPLES = [
  // Island Troll Tribes v3.9c — current Wurst toolchain output, all seven
  ...['w3u', 'w3t', 'w3b', 'w3d', 'w3a', 'w3h', 'w3q']
    .map((ext) => ['ambitious-hands/itt-x', ext]),
  // DracoL1ch DotA — hand-tooled v2
  ...['w3a', 'w3b', 'w3d'].map((ext) => ['ambitious-hands/dota-x', ext]),
  // X Hero Siege (2024) — classic WE-saved v2
  ...['w3u', 'w3t', 'w3a', 'w3h', 'w3q'].map((ext) => ['modern-maps/xhs-extracted', ext]),
].map(([dir, ext]) => ({
  path: path.join(SCRATCH, dir, `war3map.${ext}`),
  type: EXT_TYPES(ext),
  label: `${path.basename(dir)}/war3map.${ext}`,
}));

function EXT_TYPES(ext) {
  return {
    w3u: 'units', w3t: 'items', w3b: 'destructables', w3d: 'doodads',
    w3a: 'abilities', w3h: 'buffs', w3q: 'upgrades',
  }[ext];
}

// ---------------------------------------------------------------- fixtures

// Units (simple family: no per-modification level/column ints) in the
// upstream ObjectsTranslator dialect + version marker.
function syntheticUnits(version) {
  return {
    version,
    original: {
      hfoo: [
        { id: 'uhpm', type: 'int', level: 0, column: 0, value: 500 },
        // non-ASCII string + a trailing sanity check that deviates from the
        // convention (original table -> base id) -> raw passthrough key
        { id: 'unam', type: 'string', level: 0, column: 0, value: 'Süßwasser-Soldat', sanityCheck: 0xdeadbeef },
      ],
    },
    custom: {
      'h001:hfoo': [
        // 0.1 is not exactly representable: proves exact float32 reads
        { id: 'udef', type: 'unreal', level: 0, column: 0, value: Math.fround(0.1) },
        { id: 'uspd', type: 'real', level: 0, column: 0, value: 1.25 },
      ],
    },
  };
}

// The same units file assembled BY HAND straight from the v2 spec —
// independent of the codec's writer.
function syntheticUnitsV2Bytes() {
  const chunks = [];
  const i32 = (v) => { const b = Buffer.alloc(4); b.writeInt32LE(v); chunks.push(b); };
  const u32 = (v) => { const b = Buffer.alloc(4); b.writeUInt32LE(v); chunks.push(b); };
  const f32 = (v) => { const b = Buffer.alloc(4); b.writeFloatLE(v); chunks.push(b); };
  const cc = (s) => chunks.push(Buffer.from(s, 'latin1'));
  const str = (s) => chunks.push(Buffer.from(s, 'utf8'), Buffer.from([0]));
  i32(2);          // format version
  u32(1);          // original table: 1 object
  cc('hfoo'); u32(0);          // base id, no custom id
  u32(2);                      // 2 modifications (no v3 sets wrapper)
  cc('uhpm'); i32(0); i32(500); cc('hfoo');            // int, conventional trailer
  cc('unam'); i32(3); str('Süßwasser-Soldat'); u32(0xdeadbeef); // string, stray trailer
  u32(1);          // custom table: 1 object
  cc('hfoo'); cc('h001');      // base id, custom id
  u32(2);
  cc('udef'); i32(2); f32(0.1); u32(0);                // unreal, conventional 0 trailer
  cc('uspd'); i32(1); f32(1.25); u32(0);               // real
  return Buffer.concat(chunks);
}

// Abilities (leveled family: every modification carries level + column ints
// at ALL format versions — a per-type property, not a v3 addition).
function syntheticAbilities(version) {
  return {
    version,
    original: {},
    custom: {
      'A000:AHbz': [
        { id: 'ahdu', type: 'unreal', level: 1, column: 2, value: 0.5 },
        { id: 'Idam', type: 'int', level: 3, column: 1, value: 42, sanityCheck: 7 },
        { id: 'aub1', type: 'string', level: 2, column: 0, value: 'per-level tooltip' },
      ],
    },
  };
}

function codecFixpoint(t, type, buf) {
  const json1 = objects2.warToJson(type, buf).json;
  const back = objects2.jsonToWar(type, json1).buffer;
  assert.ok(back.equals(buf), 'read -> write must be byte-faithful');
  const json2 = objects2.warToJson(type, back).json;
  assert.deepStrictEqual(json2, json1, 'read -> write -> read must be JSON-stable');
  return json1;
}

// -------------------------------------------------- synthetic: units (simple)

test('objects2: writer emits the exact hand-assembled v2 units layout', () => {
  const built = objects2.jsonToWar('units', syntheticUnits(2)).buffer;
  assert.ok(built.equals(syntheticUnitsV2Bytes()),
    'codec bytes must match the spec-assembled fixture byte-for-byte');
});

test('objects2: mdx-m3-viewer-th independently parses the synthetic v2 units', () => {
  const built = objects2.jsonToWar('units', syntheticUnits(2)).buffer;
  const viewer = new w3x.w3u.File();
  viewer.load(new Uint8Array(built)); // fresh copy, never a Buffer (gotcha 15)
  assert.strictEqual(viewer.version, 2);
  assert.strictEqual(viewer.originalTable.objects.length, 1);
  assert.strictEqual(viewer.customTable.objects.length, 1);
  const orig = viewer.originalTable.objects[0];
  assert.strictEqual(orig.oldId, 'hfoo');
  assert.strictEqual(orig.newId, '\0\0\0\0');
  assert.strictEqual(orig.modifications.length, 2);
  assert.strictEqual(orig.modifications[0].id, 'uhpm');
  assert.strictEqual(orig.modifications[0].variableType, 0);
  assert.strictEqual(orig.modifications[0].value, 500);
  assert.strictEqual(orig.modifications[1].value, 'Süßwasser-Soldat', 'UTF-8 string value');
  assert.strictEqual(orig.modifications[1].u1 >>> 0, 0xdeadbeef, 'raw sanityCheck passthrough');
  const cust = viewer.customTable.objects[0];
  assert.strictEqual(cust.oldId, 'hfoo');
  assert.strictEqual(cust.newId, 'h001');
  assert.strictEqual(cust.modifications[0].variableType, 2);
  assert.strictEqual(cust.modifications[0].value, Math.fround(0.1), 'exact float32, no rounding');
  // ... and the viewer's own re-save agrees byte-for-byte with the codec
  assert.ok(Buffer.from(viewer.save()).equals(built), 'viewer re-save must be byte-identical');
});

// -------------------------------------------------- synthetic: abilities (leveled)

test('objects2: mdx-m3-viewer-th independently parses the synthetic v2 abilities (leveled)', () => {
  const built = objects2.jsonToWar('abilities', syntheticAbilities(2)).buffer;
  const viewer = new w3x.w3d.File(); // the w3d/w3a/w3q leveled-family parser
  viewer.load(new Uint8Array(built));
  assert.strictEqual(viewer.version, 2);
  assert.strictEqual(viewer.originalTable.objects.length, 0);
  const obj = viewer.customTable.objects[0];
  assert.strictEqual(obj.oldId, 'AHbz');
  assert.strictEqual(obj.newId, 'A000');
  assert.strictEqual(obj.modifications.length, 3);
  assert.strictEqual(obj.modifications[0].levelOrVariation, 1, 'level int present in v2');
  assert.strictEqual(obj.modifications[0].dataPointer, 2, 'column int present in v2');
  assert.strictEqual(obj.modifications[0].value, 0.5);
  assert.strictEqual(obj.modifications[1].levelOrVariation, 3);
  assert.strictEqual(obj.modifications[1].u1, 7, 'raw sanityCheck passthrough');
  assert.strictEqual(obj.modifications[2].value, 'per-level tooltip');
  assert.ok(Buffer.from(viewer.save()).equals(built), 'viewer re-save must be byte-identical');
});

for (const version of [1, 2]) {
  test(`objects2: synthetic v${version} units + abilities are byte fixpoints and JSON-stable`, (t) => {
    for (const [type, json] of [['units', syntheticUnits(version)], ['abilities', syntheticAbilities(version)]]) {
      const built = objects2.jsonToWar(type, json).buffer;
      assert.strictEqual(built.readInt32LE(0), version, 'version dword preserved');
      const round = codecFixpoint(t, type, built);
      assert.deepStrictEqual(round, json,
        'reading our own write must reproduce the source JSON exactly');
    }
  });
}

test('objects2: v1 and v2 differ ONLY in the version dword', () => {
  const v1 = objects2.jsonToWar('units', syntheticUnits(1)).buffer;
  const v2 = objects2.jsonToWar('units', syntheticUnits(2)).buffer;
  assert.strictEqual(v1.length, v2.length);
  assert.ok(v1.subarray(4).equals(v2.subarray(4)), 'identical payload after the version dword');
});

test('objects2: v2 destructables do NOT split skin fields (bnam is a classic main-file field)', () => {
  const json = {
    version: 2,
    original: {},
    custom: { 'B001:LTlt': [{ id: 'bnam', type: 'string', level: 0, column: 0, value: 'Old Oak' }] },
  };
  const r = objects2.jsonToWar('destructables', json);
  assert.strictEqual(r.bufferSkin, undefined, 'no war3mapSkin.w3b twin at v2');
  const back = objects2.warToJson('destructables', r.buffer).json;
  assert.strictEqual(back.custom['B001:LTlt'][0].id, 'bnam', 'bnam stays in the main file');
  // contrast: upstream v3 moves the same field into the skin buffer
  const entry = byWar.get('war3map.w3b');
  const v3 = jsonToWar(entry, { original: {}, custom: json.custom });
  assert.ok(v3.skinBuffer, 'upstream v3 splits bnam into war3mapSkin.w3b');
});

test('objects2: skin twin buffer is merged on read like upstream', () => {
  const main = objects2.jsonToWar('destructables', {
    version: 2, original: {}, custom: { 'B001:LTlt': [{ id: 'bvar', type: 'int', level: 0, column: 0, value: 3 }] },
  }).buffer;
  const skin = objects2.jsonToWar('destructables', {
    version: 2, original: {}, custom: { 'B001:LTlt': [{ id: 'bnam', type: 'string', level: 0, column: 0, value: 'Old Oak' }] },
  }).buffer;
  const merged = objects2.warToJson('destructables', main, skin).json;
  assert.deepStrictEqual(merged.custom['B001:LTlt'].map((m) => m.id), ['bvar', 'bnam']);
});

test('objects2: malformed input is rejected with clear errors', () => {
  assert.throws(() => objects2.jsonToWar('units', syntheticUnits(3)), /"version": 1 or 2/);
  assert.throws(() => objects2.jsonToWar('wizards', syntheticUnits(2)), /unknown object type/);
  const badId = syntheticUnits(2);
  badId.original.hfoo[0].id = 'toolong';
  assert.throws(() => objects2.jsonToWar('units', badId), /must be exactly 4 bytes/);
  const badType = syntheticUnits(2);
  badType.original.hfoo[0].type = 'bool';
  assert.throws(() => objects2.jsonToWar('units', badType), /unknown type "bool"/);
  // binary side: garbage value type / truncation throw (catchable, gotcha 26)
  const built = objects2.jsonToWar('units', syntheticUnits(2)).buffer;
  const garbage = Buffer.from(built);
  garbage.writeInt32LE(9, 16); // first modification's value type dword
  assert.throws(() => objects2.warToJson('units', garbage), /unknown modification value type/);
  assert.throws(() => objects2.warToJson('units', built.subarray(0, built.length - 6)), RangeError);
  const trailing = Buffer.concat([built, Buffer.from([1, 2, 3])]);
  assert.throws(() => objects2.warToJson('units', trailing), /trailing byte/);
});

test('objects2: v3 files are refused (they belong to the upstream translator)', () => {
  const entry = byWar.get('war3map.w3u');
  const v3 = jsonToWar(entry, { original: {}, custom: { 'h001:hfoo': [{ id: 'uhpm', type: 'int', value: 500 }] } }).buffer;
  assert.strictEqual(v3.readInt32LE(0), 3);
  assert.throws(() => objects2.warToJson('units', v3), /v3/);
  assert.ok(!objects2.isSupported(v3), 'filemap routing must NOT divert v3 to the codec');
});

// -------------------------------------------------- real map samples (guarded)

for (const sample of REAL_SAMPLES) {
  test(`objects2: real v2 sample fixpoint: ${sample.label}`, (t) => {
    if (!fs.existsSync(sample.path)) return t.skip('scratchpad sample not present');
    const json = codecFixpoint(t, sample.type, fs.readFileSync(sample.path));
    assert.strictEqual(json.version, 2);
  });
}

// -------------------------------------------------- filemap routing

test('filemap: object files route v1/v2 to the codec and v3 to upstream', () => {
  const entry = byWar.get('war3map.w3u');
  for (const version of [1, 2]) {
    const bin = objects2.jsonToWar('units', syntheticUnits(version)).buffer;
    const json = warToJson(entry, bin);
    assert.strictEqual(json.version, version, 'codec output carries the version marker');
    assert.ok(jsonToWar(entry, json).buffer.equals(bin), 'jsonToWar routes the marker back to the codec');
  }
  // v3 (upstream): no version marker, and the v3 sets wrapper on disk
  const v3 = jsonToWar(entry, { original: {}, custom: { 'h001:hfoo': [{ id: 'uhpm', type: 'int', value: 500 }] } }).buffer;
  assert.strictEqual(v3.readInt32LE(0), 3);
  assert.strictEqual(warToJson(entry, v3).version, undefined);
});

test('filemap: war3mapSkin.* twins route identically', () => {
  const entry = byWar.get('war3mapSkin.w3u');
  const bin = objects2.jsonToWar('units', syntheticUnits(2)).buffer;
  const json = warToJson(entry, bin);
  assert.strictEqual(json.version, 2);
  assert.ok(jsonToWar(entry, json).buffer.equals(bin));
});

// -------------------------------------------------- pipeline integration

test('pipeline: v2 object data goes to editable objects-*.json, an edit lands, rest is fixpoint-stable', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'objects2-e2e-'));
  try {
    // synthetic EXTRACTED dir with v2 units + abilities object data
    const extracted = path.join(tmp, 'extracted');
    fs.mkdirSync(extracted, { recursive: true });
    const w3uBin = objects2.jsonToWar('units', syntheticUnits(2)).buffer;
    const w3aBin = objects2.jsonToWar('abilities', syntheticAbilities(2)).buffer;
    fs.writeFileSync(path.join(extracted, 'war3map.w3u'), w3uBin);
    fs.writeFileSync(path.join(extracted, 'war3map.w3a'), w3aBin);
    fs.writeFileSync(path.join(extracted, 'war3map.lua'),
      'function config() end\nfunction main() end\n');

    // map-to-json: MUST land in editable objects-*.json, NOT _viewer/
    const source = path.join(tmp, 'source');
    const manifest = extractedToSource(extracted, source);
    assert.strictEqual(manifest.translated['war3map.w3u'], 'objects-units.json');
    assert.strictEqual(manifest.translated['war3map.w3a'], 'objects-abilities.json');
    assert.strictEqual(manifest.errors.length, 0, 'no translator error recorded');
    assert.ok(!fs.existsSync(path.join(source, '_viewer')), 'no read-only _viewer/ fallback used');

    // edit one value in the JSON source
    const unitsPath = path.join(source, 'objects-units.json');
    const units = readJson(unitsPath);
    assert.strictEqual(units.version, 2, 'source JSON carries the version marker');
    units.original.hfoo[0].value = 750; // uhpm 500 -> 750
    writeJson(unitsPath, units);

    // json-to-map, then re-read what was written
    const out = path.join(tmp, 'out');
    sourceToExtracted(source, out);
    const rebuilt = fs.readFileSync(path.join(out, 'war3map.w3u'));
    assert.strictEqual(rebuilt.readInt32LE(0), 2, 'the rebuilt object data is still v2');
    const reread = objects2.warToJson('units', rebuilt).json;
    assert.strictEqual(reread.original.hfoo[0].value, 750, 'the edit landed in the binary');
    // everything else must be untouched: reverting the edit reproduces the
    // original file byte-for-byte
    reread.original.hfoo[0].value = 500;
    assert.ok(objects2.jsonToWar('units', reread).buffer.equals(w3uBin),
      'all non-edited data is byte-fixpoint-stable through the pipeline');
    // the untouched abilities file round-trips byte-identically end to end
    assert.ok(fs.readFileSync(path.join(out, 'war3map.w3a')).equals(w3aBin));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
