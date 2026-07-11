'use strict';
// Version-aware codec tests: lib/codecs/w3e11.js (terrain v11) and
// lib/codecs/w3i31.js (info v25/v31).
//
// Three layers of proof:
//   1. Synthetic fixtures — minimal v11/v31/v25 binaries produced by OUR
//      writer are cross-verified by mdx-m3-viewer-th's independent parsers
//      (field-level reads AND a byte-identical viewer re-save), then must be
//      read->write byte fixpoints and JSON-stable through the codec.
//   2. Real map samples (guarded by fs.existsSync; read-only scratchpad
//      files, never copied into the repo) — byte fixpoint + JSON stability.
//   3. Pipeline integration — map-to-json/json-to-map level edit round-trip
//      on a v11 terrain, and a full build-map -> validate-map ALL-PASS run
//      on a map with v11 terrain + v31 info.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const w3e11 = require('../lib/codecs/w3e11');
const w3i31 = require('../lib/codecs/w3i31');
const { byWar, byJson, warToJson, jsonToWar } = require('../lib/filemap');
const { extractedToSource, sourceToExtracted, readJson, writeJson } = require('../lib/source');

// mdx-m3-viewer-th: the INDEPENDENT parser stack (gotcha 15: always feed it
// fresh Uint8Array copies, never Node Buffers)
const w3x = require('mdx-m3-viewer-th/dist/cjs/parsers/w3x/index.js').default;

const SCRATCH = '/tmp/claude-0/-home-user-wc3/df8a77ea-156b-5f11-9fb8-e8ed8104d142/scratchpad';
const REAL_W3E_V11 = [
  path.join(SCRATCH, 'modern-maps/gwz-extracted/war3map.w3e'),
  path.join(SCRATCH, 'modern-maps2/eaw-extracted/war3map.w3e'),
  path.join(SCRATCH, 'modern-maps2/nb-extracted/war3map.w3e'),
  path.join(SCRATCH, 'modern-maps/xhs-extracted/war3map.w3e'),
];
const REAL_W3I_V31 = [
  path.join(SCRATCH, 'modern-maps2/eaw-extracted/war3map.w3i'),
  path.join(SCRATCH, 'modern-maps2/nb-extracted/war3map.w3i'),
];
const REAL_W3I_V25 = [path.join(SCRATCH, 'modern-maps/xhs-extracted/war3map.w3i')];

// ---------------------------------------------------------------- fixtures

// Terrain JSON in the upstream TerrainTranslator dialect + version 11.
// 2x2 corners (map 1x1). JSON rows are top-down; the file is bottom-up.
function syntheticTerrainV11() {
  return {
    version: 11,
    tileset: 'L',
    customTileset: false,
    tilePalette: ['Ldrt', 'Lgrs'],
    cliffTilePalette: ['CLdi'],
    map: { width: 1, height: 1, offset: { x: -128, y: -256 } },
    //             top row     bottom row
    groundHeight: [8192, 8704, 8192, 8192],
    // upstream dialect quirk: waterHeight KEEPS the 0x4000 boundary bit
    waterHeight: [8192, 8192, 9000 | 0x4000, 8192],
    boundaryFlag: [false, false, true, false],
    // v12-positioned bits: ramp 0x40, blight 0x80, water 0x100
    flags: [0, 0x40, 0x80, 0x100],
    groundTexture: [0, 1, 1, 0],
    groundVariation: [8, 0, 16, 0], // upstream's unshifted & 0xF8 mask
    cliffVariation: [0, 1, 2, 3],
    cliffTexture: [0, 16, 240, 32], // unshifted & 0xF0 mask
    layerHeight: [2, 2, 3, 4],
  };
}

// The same map assembled BY HAND straight from the v11 spec — independent of
// the codec's writer.
function syntheticTerrainV11Bytes() {
  const buf = Buffer.alloc(37 + 3 * 4 + 4 * 7);
  let o = 0;
  buf.write('W3E!', o, 'latin1'); o += 4;
  buf.writeInt32LE(11, o); o += 4;
  buf.write('L', o, 'latin1'); o += 1;
  buf.writeInt32LE(0, o); o += 4; // customTileset
  buf.writeInt32LE(2, o); o += 4;
  buf.write('Ldrt', o, 'latin1'); o += 4;
  buf.write('Lgrs', o, 'latin1'); o += 4;
  buf.writeInt32LE(1, o); o += 4;
  buf.write('CLdi', o, 'latin1'); o += 4;
  buf.writeInt32LE(2, o); o += 4; // stored width
  buf.writeInt32LE(2, o); o += 4; // stored height
  buf.writeFloatLE(-128, o); o += 4;
  buf.writeFloatLE(-256, o); o += 4;
  // v11 corner: i16 groundHeight; i16 water|boundary(0x4000);
  // u8 flags(bits 4-7: ramp 0x10 blight 0x20 water 0x40 boundary 0x80)|tex(bits 0-3);
  // u8 groundVariation(bits 3-7)|cliffVariation(bits 0-2);
  // u8 cliffTexture(bits 4-7)|layerHeight(bits 0-3).
  // File rows are bottom-up: JSON indices 2,3 first, then 0,1.
  const corner = (gh, water, texflags, variation, cliff) => {
    buf.writeInt16LE(gh, o); o += 2;
    buf.writeInt16LE(water, o); o += 2;
    buf[o++] = texflags; buf[o++] = variation; buf[o++] = cliff;
  };
  corner(8192, 9000 | 0x4000, 0x20 | 1, 16 | 2, 240 | 3); // JSON idx 2: blight, tex 1
  corner(8192, 8192, 0x40 | 0, 0 | 3, 32 | 4);            // JSON idx 3: water flag
  corner(8192, 8192, 0x00 | 0, 8 | 0, 0 | 2);             // JSON idx 0: no flags
  corner(8704, 8192, 0x10 | 1, 0 | 1, 16 | 2);            // JSON idx 1: ramp, tex 1
  return buf;
}

// Info JSON in the upstream InfoTranslator dialect + version 25/31.
function syntheticInfo(version) {
  const player = (num, name) => ({
    name,
    startingPos: { x: num * 512, y: -256.25, fixed: num === 0 },
    playerNum: num,
    type: 1,
    race: num + 1,
    allyLowPriorityFlags: num === 0 ? ['blue'] : [],
    allyHighPriorityFlags: [],
    enemyLowPriorityFlags: [],
    enemyHighPriorityFlags: [],
  });
  return {
    version,
    map: {
      name: 'Codec Test',
      author: 'toolkit',
      description: 'synthetic w3i',
      recommendedPlayers: '2',
      playableArea: { width: 84, height: 84 },
      mainTileType: 'L',
      flags: {
        hideMinimapInPreview: false, modifyAllyPriorities: false, isMeleeMap: true,
        maskedPartiallyVisible: false, fixedPlayerSetting: false, useCustomForces: true,
        useCustomTechtree: false, useCustomAbilities: false, useCustomUpgrades: false,
        waterWavesOnCliffShores: false, waterWavesOnRollingShores: false,
        useTerrainFog: false, useItemClassificationSystem: false, enableWaterTinting: false,
        useAccurateProbabilityForCalculations: false, useCustomAbilitySkins: false,
        disableDenyIcon: false, forceDefaultCameraZoom: false, forceMaxCameraZoom: false,
        forceMinCameraZoom: false,
      },
    },
    loadingScreen: { background: -1, path: '', text: '', title: '', subtitle: '' },
    prologue: { path: '', text: '', title: '', subtitle: '' },
    fog: { type: 0, startHeight: 3000, endHeight: 5000, density: 0.5, color: [10, 20, 30] },
    camera: {
      bounds: [-1792, -2304, 1792, 1280, -1792, 1280, 1792, -2304],
      complements: [6, 6, 4, 8],
    },
    players: [player(0, 'Player 1'), player(1, 'Player 2')],
    forces: [{
      name: 'Force 1',
      flags: { allied: true, alliedVictory: true, shareVision: false, shareUnitControl: false, shareAdvUnitControl: false },
      players: ['red', 'blue'],
    }],
    upgrades: [{ id: 'Rhme', players: ['red'], level: 1, availability: 2 }],
    techtree: [{ players: ['red', 'blue'], id: 'hkee' }],
    randomGroupTable: [{
      number: 0, name: 'Group 1', positions: [0, 2],
      rows: [{ chance: 100, entries: ['hfoo', 'ratc'] }],
    }],
    randomItemTable: [{
      name: 'Table 1', number: 0,
      sets: [[{ chance: 60, id: 'ratc' }, { chance: 40, id: 'rde1' }]],
    }],
    saves: 3,
    editorVersion: 6060,
    gameDataVersion: 1,
    gameDataSet: 0,
    scriptLanguage: 1,
    supportedModes: 3,
    gameVersion: { major: 1, minor: 36, patch: 1, build: 20719 },
    globalWeather: '0000',
    customSoundEnvironment: '',
    customLightEnv: 'L',
    water: [255, 128, 64],
    forceDefaultCameraZoom: 0,
    forceMaxCameraZoom: 0,
    forceMinCameraZoom: 0,
  };
}

function codecFixpoint(t, mod, buf) {
  const json1 = mod.warToJson(buf).json;
  const back = mod.jsonToWar(json1).buffer;
  assert.ok(back.equals(buf), 'read -> write must be byte-faithful');
  const json2 = mod.warToJson(back).json;
  assert.deepStrictEqual(json2, json1, 'read -> write -> read must be JSON-stable');
  return json1;
}

// -------------------------------------------------- w3e v11: synthetic

test('w3e11: writer emits the exact hand-assembled v11 layout', () => {
  const built = w3e11.jsonToWar(syntheticTerrainV11()).buffer;
  assert.ok(built.equals(syntheticTerrainV11Bytes()),
    'codec bytes must match the spec-assembled fixture byte-for-byte');
});

test('w3e11: mdx-m3-viewer-th independently parses the synthetic v11 terrain', () => {
  const built = w3e11.jsonToWar(syntheticTerrainV11()).buffer;
  const viewer = new w3x.w3e.File();
  viewer.load(new Uint8Array(built)); // fresh copy, never a Buffer (gotcha 15)
  assert.strictEqual(viewer.version, 11);
  assert.strictEqual(viewer.tileset, 'L');
  assert.deepStrictEqual(Array.from(viewer.mapSize), [2, 2]);
  assert.deepStrictEqual(viewer.groundTilesets, ['Ldrt', 'Lgrs']);
  assert.deepStrictEqual(viewer.cliffTilesets, ['CLdi']);
  // viewer corners[row][col] is in FILE order (bottom row first):
  // corners[0][*] = JSON indices 2,3; corners[1][*] = JSON indices 0,1
  const [bottom, top] = viewer.corners;
  assert.strictEqual(top[1].groundHeight, 1, '(8704-8192)/512');
  assert.strictEqual(top[1].ramp !== 0, true, 'JSON flags 0x40 is the v11 ramp bit');
  assert.strictEqual(top[1].groundTexture, 1);
  assert.strictEqual(bottom[0].blight !== 0, true, 'JSON flags 0x80 is the v11 blight bit');
  assert.strictEqual(bottom[0].layerHeight, 3);
  assert.strictEqual(bottom[0].cliffTexture, 15, 'cliffTexture 240 unshifted = 15 shifted');
  assert.strictEqual(bottom[1].water !== 0, true, 'JSON flags 0x100 is the v11 water bit');
  assert.strictEqual(top[0].ramp | top[0].blight | top[0].water | top[0].boundary, 0);
  // ... and the viewer's own re-save agrees byte-for-byte with the codec
  assert.ok(Buffer.from(viewer.save()).equals(built), 'viewer re-save must be byte-identical');
});

test('w3e11: synthetic v11 is a byte fixpoint and JSON-stable through the codec', (t) => {
  const built = w3e11.jsonToWar(syntheticTerrainV11()).buffer;
  const json = codecFixpoint(t, w3e11, built);
  assert.strictEqual(json.version, 11);
  assert.deepStrictEqual(json, syntheticTerrainV11(),
    'reading our own write must reproduce the source JSON exactly');
});

test('w3e11: v11-unrepresentable values are rejected with clear errors', () => {
  // an out-of-spec padded palette (>16 entries) is tolerated in BOTH
  // directions — only the first 16 tiles are addressable by 4-bit indices
  const big = syntheticTerrainV11();
  big.tilePalette = Array.from({ length: 20 }, (_, i) => 'T' + String(i).padStart(3, '0'));
  const bigBin = w3e11.jsonToWar(big).buffer;
  assert.deepStrictEqual(w3e11.warToJson(bigBin).json.tilePalette, big.tilePalette,
    'padded palettes survive the round-trip');
  const badTex = syntheticTerrainV11();
  badTex.groundTexture[0] = 16; // needs v12's 6-bit field
  assert.throws(() => w3e11.jsonToWar(badTex), /out of v11 range/);
  const badFlags = syntheticTerrainV11();
  badFlags.flags[0] = 0x400; // v12-only flag bit
  assert.throws(() => w3e11.jsonToWar(badFlags), /outside the v11-representable set/);
  const v12 = syntheticTerrainV11();
  v12.version = 12;
  assert.throws(() => w3e11.jsonToWar(v12), /"version": 11/);
});

// -------------------------------------------------- w3i v31/v25: synthetic

test('w3i31: mdx-m3-viewer-th independently parses the synthetic v31 info', () => {
  const built = w3i31.jsonToWar(syntheticInfo(31)).buffer;
  const viewer = new w3x.w3i.File();
  viewer.load(new Uint8Array(built).buffer);
  assert.strictEqual(viewer.version, 31);
  assert.strictEqual(viewer.name, 'Codec Test');
  assert.deepStrictEqual(Array.from(viewer.buildVersion), [1, 36, 1, 20719]);
  // hand-written JSON (no flagsUnknown): upstream's forced bits 0x400|0x4000|0x8000
  // + isMeleeMap 0x4 + useCustomForces 0x40
  assert.strictEqual(viewer.flags, 0x4 | 0x40 | 0x400 | 0x4000 | 0x8000);
  assert.strictEqual(viewer.scriptMode, 1, 'scriptLanguage lands in the v28+ slot');
  assert.strictEqual(viewer.graphicsMode, 3, 'supportedModes lands in the v31 slot');
  assert.strictEqual(viewer.unknown1, 1, 'gameDataVersion lands in the v31 slot');
  assert.strictEqual(viewer.globalWeather, 0, "'0000' means four zero bytes, not ASCII '0'");
  assert.strictEqual(viewer.players.length, 2);
  assert.strictEqual(viewer.players[0].allyLowPriorities, 0b10, 'blue = bit 1');
  assert.strictEqual(viewer.forces.length, 1);
  // upstream dialect: force #0 carries the bits of all nonexistent players 0-23
  assert.strictEqual(viewer.forces[0].playerMasks, 0xffffff);
  assert.strictEqual(viewer.randomUnitTables.length, 1);
  assert.strictEqual(viewer.randomItemTables.length, 1);
  assert.ok(Buffer.from(viewer.save()).equals(built), 'viewer re-save must be byte-identical');
});

test('w3i31: mdx-m3-viewer-th independently parses the synthetic v25 info', () => {
  const built = w3i31.jsonToWar(syntheticInfo(25)).buffer;
  const built31 = w3i31.jsonToWar(syntheticInfo(31)).buffer;
  // v25 lacks gameVersion (16) + scriptLanguage (4) + supportedModes/
  // gameDataVersion (8) + 2 players x enemy priorities (16) = 44 bytes
  assert.strictEqual(built31.length - built.length, 44, 'exact v25<->v31 byte delta');
  const viewer = new w3x.w3i.File();
  viewer.load(new Uint8Array(built).buffer);
  assert.strictEqual(viewer.version, 25);
  assert.strictEqual(viewer.name, 'Codec Test');
  assert.deepStrictEqual(Array.from(viewer.buildVersion), [0, 0, 0, 0], 'no gameVersion below v28');
  assert.strictEqual(viewer.players.length, 2);
  assert.ok(Buffer.from(viewer.save()).equals(built), 'viewer re-save must be byte-identical');
});

for (const version of [25, 31]) {
  test(`w3i31: synthetic v${version} is a byte fixpoint and JSON-stable through the codec`, (t) => {
    const built = w3i31.jsonToWar(syntheticInfo(version)).buffer;
    const json = codecFixpoint(t, w3i31, built);
    assert.strictEqual(json.version, version);
    assert.strictEqual(json.map.name, 'Codec Test');
    assert.strictEqual(json.map.flagsUnknown, 0x400 | 0x4000,
      'the write-side forced bits come back as explicit unknown flags (0x8000 is named)');
    if (version >= 31) {
      assert.strictEqual(json.scriptLanguage, 1);
      assert.deepStrictEqual(json.gameVersion, { major: 1, minor: 36, patch: 1, build: 20719 });
    } else {
      assert.strictEqual(json.scriptLanguage, 0, 'below v28 the field does not exist; neutral default');
      assert.deepStrictEqual(json.gameVersion, { major: 0, minor: 0, patch: 0, build: 0 });
    }
  });
}

test('w3i31: raw playersMask passthrough survives bits the name-array dialect cannot express', () => {
  const info = syntheticInfo(31);
  // bits 24-31 + a nonexistent-player bit — exactly what real v31 maps carry
  info.forces[0].playersMask = 0xffffc003;
  const built = w3i31.jsonToWar(info).buffer;
  const json = w3i31.warToJson(built).json;
  assert.strictEqual(json.forces[0].playersMask, 0xffffc003, 'mask read back raw');
  assert.deepStrictEqual(json.forces[0].players, ['red', 'blue'], 'name array still filtered to real players');
  assert.ok(w3i31.jsonToWar(json).buffer.equals(built), 'byte fixpoint with the passthrough');
});

test('w3i31: v33 files are refused (they belong to the upstream translator)', () => {
  const entry = byWar.get('war3map.w3i');
  const v33 = jsonToWar(entry, readJson(path.join(__dirname, '..', 'maps', 'demo', 'info.json'))).buffer;
  assert.strictEqual(v33.readInt32LE(0), 33);
  assert.throws(() => w3i31.warToJson(v33), /unsupported version 33/);
  assert.ok(!w3i31.isSupported(v33), 'filemap routing must NOT divert v33 to the codec');
});

// -------------------------------------------------- real map samples (guarded)

for (const p of REAL_W3E_V11) {
  test(`w3e11: real v11 sample fixpoint: ${path.basename(path.dirname(p))}`, (t) => {
    if (!fs.existsSync(p)) return t.skip('scratchpad sample not present');
    const json = codecFixpoint(t, w3e11, fs.readFileSync(p));
    assert.strictEqual(json.version, 11);
  });
}
for (const p of REAL_W3I_V31) {
  test(`w3i31: real v31 sample fixpoint: ${path.basename(path.dirname(p))}`, (t) => {
    if (!fs.existsSync(p)) return t.skip('scratchpad sample not present');
    const json = codecFixpoint(t, w3i31, fs.readFileSync(p));
    assert.strictEqual(json.version, 31);
  });
}
for (const p of REAL_W3I_V25) {
  test(`w3i31: real v25 sample fixpoint (stretch): ${path.basename(path.dirname(p))}`, (t) => {
    if (!fs.existsSync(p)) return t.skip('scratchpad sample not present');
    const json = codecFixpoint(t, w3i31, fs.readFileSync(p));
    assert.strictEqual(json.version, 25);
  });
}

// -------------------------------------------------- filemap routing

test('filemap: war3map.w3e routes v11 to the codec and v12 to upstream', () => {
  const entry = byWar.get('war3map.w3e');
  const v11 = w3e11.jsonToWar(syntheticTerrainV11()).buffer;
  const json = warToJson(entry, v11);
  assert.strictEqual(json.version, 11, 'codec output carries the version marker');
  assert.ok(jsonToWar(entry, json).buffer.equals(v11), 'jsonToWar routes version 11 back to the codec');

  // v12 (the demo fixture path): upstream, no version marker
  const demoTerrain = readJson(path.join(__dirname, '..', 'maps', 'demo', 'terrain.json'));
  const v12 = jsonToWar(entry, demoTerrain).buffer;
  assert.strictEqual(v12.readInt32LE(4), 12);
  assert.strictEqual(warToJson(entry, v12).version, undefined);
});

test('filemap: war3map.w3i routes v25/v31 to the codec and v33 to upstream', () => {
  const entry = byWar.get('war3map.w3i');
  for (const version of [25, 31]) {
    const bin = w3i31.jsonToWar(syntheticInfo(version)).buffer;
    const json = warToJson(entry, bin);
    assert.strictEqual(json.version, version);
    assert.ok(jsonToWar(entry, json).buffer.equals(bin));
  }
  const demoInfo = readJson(path.join(__dirname, '..', 'maps', 'demo', 'info.json'));
  const v33 = jsonToWar(entry, demoInfo).buffer;
  assert.strictEqual(v33.readInt32LE(0), 33);
  assert.strictEqual(warToJson(entry, v33).version, undefined);
});

// -------------------------------------------------- pipeline integration

test('pipeline: v11 terrain goes to editable terrain.json, an edit lands, rest is fixpoint-stable', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'codec-e2e-'));
  try {
    // synthetic EXTRACTED dir with a v11 terrain
    const extracted = path.join(tmp, 'extracted');
    fs.mkdirSync(extracted, { recursive: true });
    const w3eBin = w3e11.jsonToWar(syntheticTerrainV11()).buffer;
    fs.writeFileSync(path.join(extracted, 'war3map.w3e'), w3eBin);
    fs.writeFileSync(path.join(extracted, 'war3map.lua'),
      'function config() end\nfunction main() end\n');

    // map-to-json: MUST land in terrain.json (editable), NOT _viewer/
    const source = path.join(tmp, 'source');
    const manifest = extractedToSource(extracted, source);
    assert.strictEqual(manifest.translated['war3map.w3e'], 'terrain.json',
      'v11 w3e must translate into the normal editable terrain.json');
    assert.strictEqual(manifest.errors.length, 0, 'no translator error recorded');
    assert.ok(!manifest.viewerFallback, 'no read-only _viewer/ fallback used');
    assert.ok(!fs.existsSync(path.join(source, '_viewer')), 'no _viewer/ dir written');

    // edit one tile height in the JSON source
    const terrainPath = path.join(source, 'terrain.json');
    const terrain = readJson(terrainPath);
    assert.strictEqual(terrain.version, 11);
    terrain.groundHeight[0] += 512; // raise the top-left corner one height unit
    writeJson(terrainPath, terrain);

    // json-to-map, then re-extract (parse what was written)
    const out = path.join(tmp, 'out');
    sourceToExtracted(source, out);
    const rebuilt = fs.readFileSync(path.join(out, 'war3map.w3e'));
    assert.strictEqual(rebuilt.readInt32LE(4), 11, 'the rebuilt terrain is still v11');
    const reread = w3e11.warToJson(rebuilt).json;
    assert.strictEqual(reread.groundHeight[0], syntheticTerrainV11().groundHeight[0] + 512,
      'the edit landed in the binary');
    // everything else must be untouched: reverting the edit reproduces the
    // original file byte-for-byte
    reread.groundHeight[0] -= 512;
    assert.ok(w3e11.jsonToWar(reread).buffer.equals(w3eBin),
      'all non-edited data is byte-fixpoint-stable through the pipeline');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('pipeline: build-map + validate-map fully PASS a map with v11 terrain and v31 info', () => {
  const { buildMap } = require('../tools/build-map');
  const { validate } = require('../tools/validate-map');
  const demo = path.join(__dirname, '..', 'maps', 'demo');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'codec-v11map-'));
  try {
    // clone the demo source and downshift terrain to v11, info to v31
    const src = path.join(tmp, 'src');
    fs.cpSync(demo, src, { recursive: true });
    const terrain = readJson(path.join(src, 'terrain.json'));
    writeJson(path.join(src, 'terrain.json'), { version: 11, ...terrain });
    const info = readJson(path.join(src, 'info.json'));
    writeJson(path.join(src, 'info.json'), { version: 31, ...info });

    const out = path.join(tmp, 'v11map.w3x');
    buildMap(src, out);

    const results = validate(out);
    const failures = results.filter((r) => !r.pass);
    assert.deepStrictEqual(failures, [], 'validate-map must be ALL-PASS');
    const byName = new Map(results.map((r) => [r.name, r]));
    for (const name of ['translate war3map.w3e', 'translate war3map.w3i',
      'viewer parse war3map.w3e', 'viewer parse war3map.w3i']) {
      const r = byName.get(name);
      assert.ok(r && r.pass && !r.warn, `${name} must be a real PASS (not a WARN fallback), got ${JSON.stringify(r)}`);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('build-map --bare packs a bare MPQ (no HM3W pre-header)', () => {
  const { buildMap } = require('../tools/build-map');
  const demo = path.join(__dirname, '..', 'maps', 'demo');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'codec-bare-'));
  try {
    const out = path.join(tmp, 'bare.w3x');
    const res = buildMap(demo, out, { bare: true });
    assert.strictEqual(res.bare, true);
    assert.strictEqual(res.headerFields, null, 'no HM3W header fields in bare mode');
    const head = fs.readFileSync(out).subarray(0, 4).toString('latin1');
    assert.strictEqual(head, 'MPQ\x1a', 'archive starts at offset 0');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// byJson import is used by the routing tests above via jsonToWar(entry,...);
// keep an explicit assertion that the source-side lookup still resolves.
test('filemap: terrain.json/info.json byJson entries still resolve', () => {
  assert.ok(byJson.get('terrain.json'));
  assert.ok(byJson.get('info.json'));
});
