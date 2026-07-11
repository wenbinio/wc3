'use strict';
// Regressions from hands-on profiling of four ambitious production maps
// (Gaias Retaliation, Sunken City, DracoL1ch DotA, Island Troll Tribes):
//   (1) falsy-zero write-throughs in the doo/unitsdoo writers (FIX C,
//       lib/translator-fixes.js): randomItemSetId/hitpoints/mana/gold/color/
//       scale zeros silently became defaults on rebuild — canaries pin each
//       upstream bug, fixed round-trips prove the substitution layer
//   (2) two-tier model sanity bar: validate-map WARNs (third-party maps ship
//       hundreds of failing-but-running models), build-map hard-FAILs on
//       imports/ (gotcha 14)
//   (3) protector-truncated w3i tail sections: lib/codecs/w3i31.js tolerant
//       read + byte-faithful truncated write (DracoL1ch DotA's v25 w3i)
//   (4) KNOWN_FILES covers the engine SLK-optimization set (lib/mpq.js)
//   (5) wts dialect fidelity: BOM / newline style / block separator survive
//       round-trips byte-identically (Sunken City's BOM+CRLF+no-separator)
//   (6) w3x-extract container forensics: trailing filler bytes (ITT: 8.8MB)
//       and nonstandard MPQ header-size fields (Sunken, Gaias) are reported
// Synthetic fixtures first; real-map checks are guarded by fs.existsSync on
// read-only scratchpad artifacts (never copied into the repo).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { isDeepStrictEqual } = require('util');

const ROOT = path.join(__dirname, '..');
const { byWar, warToJson, jsonToWar } = require(path.join(ROOT, 'lib', 'filemap'));
const { UPSTREAM_ORIGINALS, fixDoodadFalsyZeroes, fixUnitFalsyZeroes } =
  require(path.join(ROOT, 'lib', 'translator-fixes'));
const w3i31 = require(path.join(ROOT, 'lib', 'codecs', 'w3i31'));
const wts = require(path.join(ROOT, 'lib', 'wts'));
const { KNOWN_FILES, createArchive, extractAll, probeExtract, backendName } =
  require(path.join(ROOT, 'lib', 'mpq'));
const { containerForensics } = require(path.join(ROOT, 'tools', 'w3x-extract'));
const { buildHeader } = require(path.join(ROOT, 'lib', 'header'));

const SCRATCH = '/tmp/claude-0/-home-user-wc3/df8a77ea-156b-5f11-9fb8-e8ed8104d142/scratchpad/ambitious-hands';
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'wc3-prodmap-fixes-'));
test.after(() => fs.rmSync(WORK, { recursive: true, force: true }));

const guarded = (t, p) => (fs.existsSync(p) ? false : (t.skip('scratchpad sample not present'), true));

// ===========================================================================
// (1) falsy-zero write-throughs (FIX C round 2)
// ===========================================================================

const DOO_ENTRY = byWar.get('war3map.doo');
const UNITS_ENTRY = byWar.get('war3mapUnits.doo');

function makeDoodad(extra) {
  return {
    type: 'ATtr', variation: 0, position: [0, 0, 128], angle: 0,
    scale: [1, 1, 1], flags: { visible: true, solid: false, fixedZ: false },
    id: 1, ...extra,
  };
}
function makeUnit(extra) {
  return {
    type: 'hfoo', position: [0, 0, 0], rotation: 0,
    hero: { level: 1, str: 0, agi: 0, int: 0 }, player: 0, id: 7, ...extra,
  };
}

// Each case: the JSON zero upstream's writer drops, and how the drop shows
// up after write -> read through the UNPATCHED original (the canary — these
// assertions pin the upstream bugs; when upstream fixes them, FIX C can go).
const DOODAD_CASES = [
  { name: 'randomItemSetId: 0 -> dropped (written as -1)', json: makeDoodad({ randomItemSetId: 0 }),
    broken: (d) => d.randomItemSetId === undefined },
  { name: 'life: 0 -> dropped (written as 100)', json: makeDoodad({ life: 0 }),
    broken: (d) => d.life === undefined },
  { name: 'scale component 0 -> 1', json: makeDoodad({ scale: [1, 0, 1] }),
    broken: (d) => d.scale[1] === 1 },
];
const UNIT_CASES = [
  { name: 'randomItemSetId: 0 -> dropped (written as -1)', json: makeUnit({ randomItemSetId: 0 }),
    broken: (u) => u.randomItemSetId === undefined },
  { name: 'hitpoints: 0 -> dropped (written as -1)', json: makeUnit({ hitpoints: 0 }),
    broken: (u) => u.hitpoints === undefined },
  { name: 'mana: 0 -> dropped (written as -1)', json: makeUnit({ mana: 0 }),
    broken: (u) => u.mana === undefined },
  { name: 'color: 0 (red) -> dropped (written as -1)', json: makeUnit({ color: 0 }),
    broken: (u) => u.color === undefined },
  { name: 'gold: 0 -> 12500 (gold mine)', json: makeUnit({ type: 'ngol', gold: 0 }),
    broken: (u) => u.gold === 12500 },
];

for (const c of DOODAD_CASES) {
  test(`falsy-zero canary (doo): upstream still drops ${c.name}`, () => {
    const buf = UPSTREAM_ORIGINALS.doodadsJsonToWar({ regular: [c.json], special: [] }).buffer;
    const back = warToJson(DOO_ENTRY, buf).regular[0];
    assert.ok(c.broken(back),
      `upstream bug gone (${JSON.stringify(back)}) — retire this FIX C substitution`);
  });
}
for (const c of UNIT_CASES) {
  test(`falsy-zero canary (unitsdoo): upstream still drops ${c.name}`, () => {
    const buf = UPSTREAM_ORIGINALS.unitsJsonToWar([c.json]).buffer;
    const back = warToJson(UNITS_ENTRY, buf)[0];
    assert.ok(c.broken(back),
      `upstream bug gone (${JSON.stringify(back)}) — retire this FIX C substitution`);
  });
}

test('falsy-zero FIXED (doo): all zero fields survive write -> read -> write (JSON fixed point)', () => {
  const json = { regular: DOODAD_CASES.map((c, i) => ({ ...c.json, id: i })), special: [] };
  const buf = jsonToWar(DOO_ENTRY, json).buffer;
  const j1 = warToJson(DOO_ENTRY, buf);
  assert.strictEqual(j1.regular[0].randomItemSetId, 0, 'randomItemSetId 0 kept');
  assert.strictEqual(j1.regular[1].life, 0, 'life 0 kept');
  assert.strictEqual(j1.regular[2].scale[1], 0, 'scale 0 kept');
  const j2 = warToJson(DOO_ENTRY, jsonToWar(DOO_ENTRY, j1).buffer);
  assert.deepStrictEqual(j2, j1, 'stability cycle (what validate-map checks)');
  assert.strictEqual(json.regular[0].randomItemSetId, 0, 'input JSON never mutated');
});

test('falsy-zero FIXED (unitsdoo): all zero fields survive write -> read -> write (JSON fixed point)', () => {
  const json = UNIT_CASES.map((c, i) => ({ ...c.json, id: i }));
  const buf = jsonToWar(UNITS_ENTRY, json).buffer;
  const j1 = warToJson(UNITS_ENTRY, buf);
  assert.strictEqual(j1[0].randomItemSetId, 0);
  assert.strictEqual(j1[1].hitpoints, 0);
  assert.strictEqual(j1[2].mana, 0);
  assert.strictEqual(j1[3].color, 0);
  assert.strictEqual(j1[4].gold, 0, 'a 0-gold mine stays empty');
  const j2 = warToJson(UNITS_ENTRY, jsonToWar(UNITS_ENTRY, j1).buffer);
  assert.deepStrictEqual(j2, j1);
  assert.strictEqual(json[0].randomItemSetId, 0, 'input JSON never mutated');
});

test('falsy-zero fixers return the input untouched when nothing needs fixing', () => {
  const doo = { regular: [makeDoodad({})], special: [] };
  assert.strictEqual(fixDoodadFalsyZeroes(doo), doo, 'no copy when no zero present');
  const units = [makeUnit({})];
  assert.strictEqual(fixUnitFalsyZeroes(units), units);
});

test('falsy-zero guarded real sample: Sunken City war3map.doo is JSON-stable (73 randomItemSetId:0 + 113 life:0)', (t) => {
  const p = path.join(SCRATCH, 'sunken-x', 'war3map.doo');
  if (guarded(t, p)) return;
  const j1 = warToJson(DOO_ENTRY, fs.readFileSync(p));
  assert.ok(j1.regular.some((d) => d.randomItemSetId === 0), 'sample carries randomItemSetId: 0');
  const j2 = warToJson(DOO_ENTRY, jsonToWar(DOO_ENTRY, j1).buffer);
  assert.ok(isDeepStrictEqual(j2, j1), 'read -> write -> read fixed point');
});

test('falsy-zero guarded real sample: Island Troll Tribes war3mapUnits.doo is JSON-stable (2 randomItemSetId:0)', (t) => {
  const p = path.join(SCRATCH, 'itt-x', 'war3mapUnits.doo');
  if (guarded(t, p)) return;
  const j1 = warToJson(UNITS_ENTRY, fs.readFileSync(p));
  assert.ok(j1.some((u) => u.randomItemSetId === 0), 'sample carries randomItemSetId: 0');
  const j2 = warToJson(UNITS_ENTRY, jsonToWar(UNITS_ENTRY, j1).buffer);
  assert.ok(isDeepStrictEqual(j2, j1), 'read -> write -> read fixed point');
});

// ===========================================================================
// (2) two-tier model sanity bar
// ===========================================================================

// A model that PARSES fine but fails sanityTest: SiegeCrystal with its bone
// pointing at a nonexistent GeosetAnim — the classic gotcha-14 crash shape.
function makeBadModel() {
  const MdlxModel = require('mdx-m3-viewer-th/dist/cjs/parsers/mdlx/model.js').default;
  const good = fs.readFileSync(path.join(ROOT, 'maps', 'crossroads-siege', 'imports', 'war3mapImported', 'SiegeCrystal.mdx'));
  const m = new MdlxModel();
  m.load(new Uint8Array(good));
  m.bones[0].geosetAnimationId = 42; // no such GeosetAnim
  const bad = Buffer.from(m.saveMdx());
  const viewer = require(path.join(ROOT, 'lib', 'viewer'));
  const r = viewer.sanityCheckModel(bad, false);
  assert.ok(r.errors > 0 || r.severe > 0, 'precondition: the synthetic model fails the bar');
  return bad;
}

test('model bar, strict tier: build-map FAILs on a sanity-broken imports/ model (gotcha 14)', () => {
  const { buildMap } = require(path.join(ROOT, 'tools', 'build-map'));
  const src = path.join(WORK, 'badmodel-src');
  fs.cpSync(path.join(ROOT, 'maps', 'demo'), src, { recursive: true });
  fs.mkdirSync(path.join(src, 'imports', 'war3mapImported'), { recursive: true });
  fs.writeFileSync(path.join(src, 'imports', 'war3mapImported', 'bad.mdx'), makeBadModel());
  assert.throws(
    () => buildMap(src, path.join(WORK, 'badmodel.w3x')),
    /sanityTest|hard-crash/i,
    'the build must fail, not produce a crashing map');
  assert.ok(!fs.existsSync(path.join(WORK, 'badmodel.w3x')), 'no artifact left behind');
});

test('model bar, advisory tier: validate-map WARNs (never FAILs) on a packed sanity-broken model', () => {
  // bypass the build gate the way a repacked third-party map would: the model
  // arrives as an opaque archive member (files/), not a source import
  const { buildMap } = require(path.join(ROOT, 'tools', 'build-map'));
  const { validate } = require(path.join(ROOT, 'tools', 'validate-map'));
  const src = path.join(WORK, 'warnmodel-src');
  fs.cpSync(path.join(ROOT, 'maps', 'demo'), src, { recursive: true });
  fs.mkdirSync(path.join(src, 'files', 'war3mapImported'), { recursive: true });
  fs.writeFileSync(path.join(src, 'files', 'war3mapImported', 'bad.mdx'), makeBadModel());
  const w3x = path.join(WORK, 'warnmodel.w3x');
  buildMap(src, w3x);

  const results = validate(w3x);
  const sanity = results.find((r) => r.name === 'viewer sanity war3mapImported/bad.mdx');
  assert.ok(sanity, 'the model was sanity-tested');
  assert.ok(sanity.warn, 'finding reported as WARN');
  assert.match(sanity.detail, /errors=1/, 'the finding itself is still fully surfaced');
  assert.match(sanity.detail, /build-map/, 'points at the strict tier');
  const failures = results.filter((r) => !r.pass);
  assert.deepStrictEqual(failures, [], 'no hard failures: exit code stays 0');
});

test('model bar: build-map still builds clean sources (crossroads-siege imports pass the strict gate)', () => {
  const { buildMap } = require(path.join(ROOT, 'tools', 'build-map'));
  const out = path.join(WORK, 'siege-strict.w3x');
  buildMap(path.join(ROOT, 'maps', 'crossroads-siege'), out);
  assert.ok(fs.existsSync(out));
});

// ===========================================================================
// (3) protector-truncated w3i tail (write-capable codec)
// ===========================================================================

// Minimal complete v25 whose four trailing tables are empty: truncating the
// last 16 bytes (the four zero counts) cuts EXACTLY before the upgrades
// section — the DotA shape.
function syntheticV25() {
  const player = (num, name) => ({
    name, startingPos: { x: 0, y: 0, fixed: false }, playerNum: num,
    type: 1, race: 1, allyLowPriorityFlags: [], allyHighPriorityFlags: [],
    enemyLowPriorityFlags: [], enemyHighPriorityFlags: [],
  });
  return {
    version: 25,
    map: {
      name: 'Trunc Test', author: 'a', description: 'd', recommendedPlayers: '2',
      playableArea: { width: 32, height: 32 }, mainTileType: 'L',
      flags: {}, flagsUnknown: 0x8010,
    },
    loadingScreen: { background: -1, path: '', text: '', title: '', subtitle: '' },
    prologue: { path: '', text: '', title: '', subtitle: '' },
    fog: { type: 0, startHeight: 0, endHeight: 0, density: 0, color: [0, 0, 0] },
    camera: { bounds: [0, 0, 0, 0, 0, 0, 0, 0], complements: [0, 0, 0, 0] },
    players: [player(0, 'P1'), player(1, 'P2')],
    forces: [{ name: 'F1', flags: {}, players: [], playersMask: 0xffffffff }],
    upgrades: [], techtree: [], randomGroupTable: [], randomItemTable: [],
    saves: 0, editorVersion: 0, gameDataVersion: 1, gameDataSet: 0,
    scriptLanguage: 0, supportedModes: 3,
    gameVersion: { major: 0, minor: 0, patch: 0, build: 0 },
    globalWeather: '0000', customSoundEnvironment: '', customLightEnv: 'L',
    water: [0, 0, 0],
    forceDefaultCameraZoom: 0, forceMaxCameraZoom: 0, forceMinCameraZoom: 0,
  };
}

test('w3i31 truncation: clean cut before the upgrades section reads tolerantly and rebuilds byte-faithfully', () => {
  const full = w3i31.jsonToWar(syntheticV25()).buffer;
  const trunc = full.subarray(0, full.length - 16); // drop 4 empty tail counts
  const json = w3i31.warToJson(trunc).json;
  assert.strictEqual(json._truncated, true);
  assert.strictEqual(json._truncatedAt, 'upgrades');
  assert.strictEqual(json._truncatedTail, undefined, 'clean section-boundary cut: no leftover bytes');
  assert.strictEqual(json.players.length, 2, 'sections before the cut fully read');
  assert.strictEqual(json.forces.length, 1);
  assert.deepStrictEqual(json.upgrades, [], 'missing sections default to empty');
  assert.ok(w3i31.jsonToWar(json).buffer.equals(trunc), 'byte-faithful rebuild');
  assert.ok(isDeepStrictEqual(w3i31.warToJson(w3i31.jsonToWar(json).buffer).json, json), 'JSON-stable');
});

test('w3i31 truncation: stray bytes after the cut are preserved verbatim (_truncatedTail)', () => {
  const full = w3i31.jsonToWar(syntheticV25()).buffer;
  const trunc = Buffer.concat([full.subarray(0, full.length - 16), Buffer.from([0xff, 0x03])]);
  const json = w3i31.warToJson(trunc).json;
  assert.strictEqual(json._truncatedAt, 'upgrades');
  assert.strictEqual(json._truncatedTail, 'ff03');
  assert.ok(w3i31.jsonToWar(json).buffer.equals(trunc), 'byte-faithful incl. the stray tail');
});

test('w3i31 truncation: mid-section cut drops the partial section but stays byte-faithful', () => {
  const full = w3i31.jsonToWar(syntheticV25()).buffer;
  // cut inside the forces section: forces = flags(4)+mask(4)+'F1\0'(3) = 11
  // bytes after its count; slice 5 bytes into it
  const trunc = full.subarray(0, full.length - 16 - 11 + 5);
  const json = w3i31.warToJson(trunc).json;
  assert.strictEqual(json._truncatedAt, 'forces');
  assert.deepStrictEqual(json.forces, [], 'partial section dropped as a whole');
  assert.ok(json._truncatedTail.length > 0, 'its bytes kept for the rebuild');
  assert.ok(w3i31.jsonToWar(json).buffer.equals(trunc), 'byte-faithful rebuild');
});

test('w3i31 truncation: non-truncated files are unaffected (no markers, trailing-bytes check intact)', () => {
  const full = w3i31.jsonToWar(syntheticV25()).buffer;
  const json = w3i31.warToJson(full).json;
  assert.strictEqual(json._truncated, undefined);
  assert.strictEqual(json._truncatedAt, undefined);
  // appending junk PAST a complete file still errors (that is corruption,
  // not tail truncation)
  assert.throws(() => w3i31.warToJson(Buffer.concat([full, Buffer.from([1, 2, 3])])),
    /trailing byte/);
});

test('w3i31 truncation: filemap routes a truncated v25 through the codec both ways', () => {
  const entry = byWar.get('war3map.w3i');
  const full = w3i31.jsonToWar(syntheticV25()).buffer;
  const trunc = full.subarray(0, full.length - 16);
  const json = warToJson(entry, trunc);
  assert.strictEqual(json.version, 25);
  assert.strictEqual(json._truncatedAt, 'upgrades');
  assert.ok(jsonToWar(entry, json).buffer.equals(trunc), 'jsonToWar routes the marked JSON back to the codec');
});

test('w3i31 truncation guarded real sample: DracoL1ch DotA w3i v25 (cut at byte 640 + 1 stray byte)', (t) => {
  const p = path.join(SCRATCH, 'dota-x', 'war3map.w3i');
  if (guarded(t, p)) return;
  const buf = fs.readFileSync(p);
  const json = w3i31.warToJson(buf).json;
  assert.strictEqual(json.version, 25);
  assert.strictEqual(json._truncated, true);
  assert.strictEqual(json._truncatedAt, 'upgrades', 'players+forces complete, upgrades onward missing');
  assert.strictEqual(json._truncatedTail, 'ff', 'the single stray protector byte');
  assert.strictEqual(json.players.length, 10);
  assert.ok(w3i31.jsonToWar(json).buffer.equals(buf), 'byte-faithful rebuild of the real file');
  assert.ok(isDeepStrictEqual(w3i31.warToJson(w3i31.jsonToWar(json).buffer).json, json), 'JSON-stable');
});

// ===========================================================================
// (4) KNOWN_FILES: engine SLK-optimization set
// ===========================================================================

// The floor: all 9 verified present in DracoL1ch DotA.
const SLK_FLOOR = [
  'Units\\UnitData.slk', 'Units\\UnitBalance.slk', 'Units\\ItemData.slk',
  'Units\\AbilityData.slk', 'Units\\UnitAbilities.slk', 'Units\\UnitUI.slk',
  'Units\\UnitWeapons.slk', 'Units\\UpgradeData.slk', 'Units\\ItemFunc.txt',
];

test('KNOWN_FILES contains the engine SLK-optimization set', () => {
  for (const name of SLK_FLOOR) {
    assert.ok(KNOWN_FILES.includes(name), `${name} in KNOWN_FILES`);
  }
  // the widely-shipped TXT pair seen on Sunken City / ITT / Gaias
  assert.ok(KNOWN_FILES.includes('Units\\CommandFunc.txt'));
  assert.ok(KNOWN_FILES.includes('Units\\CommandStrings.txt'));
  // no duplicates crept in (probing cost + dedupe hygiene)
  const keys = KNOWN_FILES.map((n) => n.toUpperCase().replace(/\//g, '\\'));
  assert.strictEqual(new Set(keys).size, keys.length, 'KNOWN_FILES has no duplicate names');
});

test(`[${backendName()}] extractAll recovers SLK-optimization members`, () => {
  const src = path.join(WORK, 'slk-members', 'Units');
  fs.mkdirSync(src, { recursive: true });
  fs.writeFileSync(path.join(src, 'UnitData.slk'), 'ID;PWXL;N;E\nB;X1;Y1;D0\n');
  fs.writeFileSync(path.join(src, 'CommandFunc.txt'), '[cmdmove]\n');
  const w3x = path.join(WORK, 'slk.w3x');
  createArchive(w3x, path.join(WORK, 'slk-members'),
    ['Units/UnitData.slk', 'Units/CommandFunc.txt'],
    buildHeader({ name: 'slk', flags: 0, maxPlayers: 2 }));
  const out = path.join(WORK, 'slk-x');
  const res = extractAll(w3x, out);
  assert.ok(res.extracted.includes('Units/UnitData.slk'));
  assert.ok(res.extracted.includes('Units/CommandFunc.txt'));
  assert.ok(fs.existsSync(path.join(out, 'Units', 'UnitData.slk')), 'verified on disk');
});

test('KNOWN_FILES guarded real sample: the 9 verified members hash-probe out of DracoL1ch DotA', (t) => {
  const p = path.join(SCRATCH, 'dota.w3x');
  if (guarded(t, p)) return;
  const out = path.join(WORK, 'dota-slk-probe');
  const res = probeExtract(p, out, SLK_FLOOR);
  assert.deepStrictEqual(res.recovered.map((r) => r.replace(/\//g, '\\')).sort(),
    SLK_FLOOR.slice().sort(), 'all 9 recovered by exact-name lookup');
});

// ===========================================================================
// (5) wts dialect fidelity
// ===========================================================================

const BOM = Buffer.from([0xEF, 0xBB, 0xBF]);

test('wts dialect: BOM + CRLF file round-trips byte-identically', () => {
  const body = 'STRING 0\r\n{\r\nfirst\r\n}\r\n\r\nSTRING 7\r\n// c\r\n{\r\nsecond\r\n}\r\n\r\n';
  const buf = Buffer.concat([BOM, Buffer.from(body, 'utf8')]);
  const json = wts.warToJson(buf).json;
  assert.deepStrictEqual(json._dialect, { bom: true, newline: 'crlf', separator: 'blank' });
  assert.ok(wts.jsonToWar(json).buffer.equals(buf), 'byte-identical round-trip');
});

test('wts dialect: BOM + CRLF + no blank separator (the Sunken City shape) round-trips byte-identically', () => {
  const body = 'STRING 0\r\n{\r\nR\r\n}\r\nSTRING 1\r\n{\r\nSunken\r\n}\r\n';
  const buf = Buffer.concat([BOM, Buffer.from(body, 'utf8')]);
  const json = wts.warToJson(buf).json;
  assert.deepStrictEqual(json._dialect, { bom: true, newline: 'crlf', separator: 'none' });
  assert.ok(wts.jsonToWar(json).buffer.equals(buf), 'byte-identical round-trip');
});

test('wts dialect: LF-only file round-trips byte-identically', () => {
  const buf = Buffer.from('STRING 3\n// note\n{\nvalue line\n}\n\nSTRING 4\n{\nmore\n}\n\n', 'utf8');
  const json = wts.warToJson(buf).json;
  assert.deepStrictEqual(json._dialect, { bom: false, newline: 'lf', separator: 'blank' });
  assert.strictEqual(json['3'].comment, '// note\n', 'comment keeps its own LF ending');
  assert.ok(wts.jsonToWar(json).buffer.equals(buf), 'byte-identical round-trip');
});

test('wts dialect: the WE default (no BOM, CRLF, blank separator) emits NO _dialect key', () => {
  const buf = Buffer.from('STRING 0\r\n{\r\nplain\r\n}\r\n\r\n', 'utf8');
  const json = wts.warToJson(buf).json;
  assert.ok(!('_dialect' in json), 'default dialect stays keyless — committed strings.json unchanged');
  assert.ok(wts.jsonToWar(json).buffer.equals(buf));
});

test('wts dialect: jsonToWar ignores every _-prefixed key (never a STRING id)', () => {
  const out = wts.jsonToWar({ _dialect: { bom: false }, _note: 'x', 5: { value: 'v' } }).buffer;
  assert.strictEqual(out.toString('utf8'), 'STRING 5\r\n{\r\nv\r\n}\r\n\r\n');
});

test('wts dialect guarded real sample: Sunken City war3map.wts round-trips byte-identically', (t) => {
  const p = path.join(SCRATCH, 'sunken-x', 'war3map.wts');
  if (guarded(t, p)) return;
  const buf = fs.readFileSync(p);
  const json = wts.warToJson(buf).json;
  assert.deepStrictEqual(json._dialect, { bom: true, newline: 'crlf', separator: 'none' });
  assert.ok(Object.keys(json).length > 10000, 'production-scale table');
  assert.ok(wts.jsonToWar(json).buffer.equals(buf), 'byte-identical round-trip of the real file');
});

// ===========================================================================
// (6) container forensics
// ===========================================================================

function buildDemo(name) {
  const { buildMap } = require(path.join(ROOT, 'tools', 'build-map'));
  const out = path.join(WORK, name);
  buildMap(path.join(ROOT, 'maps', 'demo'), out);
  return out;
}

test(`[${backendName()}] forensics: a clean toolkit-built map has no notes`, () => {
  const f = containerForensics(fs.readFileSync(buildDemo('clean.w3x')));
  assert.ok(f, 'header parsed');
  assert.strictEqual(f.mpqOffset, 512, 'HM3W pre-header container');
  assert.strictEqual(f.formatVersion, 0, 'MPQ v1');
  assert.strictEqual(f.headerSize, 0x20);
  assert.strictEqual(f.trailingBytes, 0);
  assert.deepStrictEqual(f.notes, []);
});

test(`[${backendName()}] forensics: trailing filler bytes are reported (the ITT scheme)`, () => {
  const buf = Buffer.concat([fs.readFileSync(buildDemo('padded-base.w3x')), Buffer.alloc(1000, 0xAA)]);
  const f = containerForensics(buf);
  assert.strictEqual(f.trailingBytes, 1000);
  assert.strictEqual(f.notes.length, 1);
  assert.match(f.notes[0], /1,000 trailing byte/);

  // ...and the CLI prints it as an informational note while extraction works
  const padded = path.join(WORK, 'padded.w3x');
  fs.writeFileSync(padded, buf);
  const { execFileSync } = require('child_process');
  const stdout = execFileSync(process.execPath,
    [path.join(ROOT, 'tools', 'w3x-extract.js'), padded, path.join(WORK, 'padded-x')],
    { encoding: 'utf8' });
  assert.match(stdout, /container note: 1,000 trailing byte/);
  assert.match(stdout, /extracted \d+ file/, 'extraction unaffected');
});

test('forensics: a nonstandard header-size field is reported (the Sunken/Gaias scheme)', () => {
  const buf = fs.readFileSync(buildDemo('mangled-base.w3x'));
  buf.writeUInt32LE(0x504F7856, 512 + 4); // 'VxOP' — observed in the wild
  const f = containerForensics(buf);
  assert.ok(f.notes.some((n) => /nonstandard MPQ header-size/.test(n)), f.notes.join('; '));
});

test('forensics: an archive-size field overshooting the file is reported', () => {
  const buf = fs.readFileSync(buildDemo('overshoot-base.w3x'));
  buf.writeUInt32LE(buf.length + 4096, 512 + 8);
  const f = containerForensics(buf);
  assert.ok(f.trailingBytes < 0);
  assert.ok(f.notes.some((n) => /overshoots the file/.test(n)), f.notes.join('; '));
});

test('forensics: non-MPQ input returns null (no crash)', () => {
  assert.strictEqual(containerForensics(Buffer.from('not a map')), null);
  assert.strictEqual(containerForensics(Buffer.alloc(0)), null);
});

const REAL_FORENSICS = [
  ['itt.w3x', (f) => {
    assert.strictEqual(f.mpqOffset, 0, 'bare MPQ');
    assert.strictEqual(f.trailingBytes, 8814760, '8.8 MB of filler after the archive');
    assert.ok(f.notes.some((n) => /trailing byte/.test(n)));
  }],
  ['sunken-city.w3x', (f) => {
    assert.strictEqual(f.headerSize, 1347385430, 'mangled header-size field');
    assert.ok(f.notes.some((n) => /nonstandard MPQ header-size/.test(n)));
  }],
  ['gaias.w3x', (f) => {
    assert.strictEqual(f.headerSize, 2097410, 'mangled header-size field');
    assert.ok(f.notes.some((n) => /nonstandard MPQ header-size/.test(n)));
  }],
  ['dota.w3x', (f) => {
    assert.strictEqual(f.mpqOffset, 512, 'HM3W container');
    assert.deepStrictEqual(f.notes, [], 'container itself is clean');
  }],
];
for (const [name, check] of REAL_FORENSICS) {
  test(`forensics guarded real sample: ${name}`, (t) => {
    const p = path.join(SCRATCH, name);
    if (guarded(t, p)) return;
    check(containerForensics(fs.readFileSync(p)));
  });
}
