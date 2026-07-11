'use strict';
// lib/constants.js — generated named Lua constants (no raw FourCCs in map
// scripts): naming rule, TRIGSTR resolution, collision handling, all seven
// object types + skin twins, placement fallbacks, regions/sounds tables,
// marker-block injection idempotency, and the build-map constants.json index.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const {
  collectConstants, generateConstantsBlock, stripConstantsBlock,
  injectConstantsIntoLua, constantsIndex, sanitizeName, rawcodeChunk,
  resolveTrigstr, BEGIN_MARK,
} = require('../lib/constants');
const { checkLuaSyntax } = require('../lib/luacheck');

const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'wc3-constants-test-'));
test.after(() => fs.rmSync(WORK, { recursive: true, force: true }));

function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');
}
const mod = (id, value) => ({ id, type: 'string', level: 0, column: 0, value });

// ---- naming helpers --------------------------------------------------------

test('sanitizeName: CamelCase split, color codes, punctuation, non-ASCII', () => {
  assert.strictEqual(sanitizeName('SpawnNorth'), 'SPAWN_NORTH');
  assert.strictEqual(sanitizeName('Crossroads Militia'), 'CROSSROADS_MILITIA');
  assert.strictEqual(sanitizeName('|cffff0000Blood Mage|r'), 'BLOOD_MAGE');
  assert.strictEqual(sanitizeName("Sen'jin Watcher (Elite)"), 'SEN_JIN_WATCHER_ELITE');
  assert.strictEqual(sanitizeName('Épée Ancienne'), 'EPEE_ANCIENNE'); // accents decomposed
  assert.strictEqual(sanitizeName('大剑'), ''); // nothing ASCII left -> caller falls back
});

test('rawcodeChunk: case preserved (Lua ids are case-sensitive), non-alnum hex-escaped', () => {
  assert.strictEqual(rawcodeChunk('hfoo'), 'hfoo');
  assert.strictEqual(rawcodeChunk('Hpal'), 'Hpal'); // != hpal
  assert.strictEqual(rawcodeChunk('h!0"'), 'hx210x22');
});

test('resolveTrigstr: strips leading zeros, dangling refs -> null, plain strings pass', () => {
  const strings = { 15: { value: 'Crossroads Militia' } };
  assert.strictEqual(resolveTrigstr('TRIGSTR_015', strings), 'Crossroads Militia');
  assert.strictEqual(resolveTrigstr('TRIGSTR_15', strings), 'Crossroads Militia');
  assert.strictEqual(resolveTrigstr('TRIGSTR_999', strings), null);
  assert.strictEqual(resolveTrigstr('Plain Name', strings), 'Plain Name');
});

// ---- collection: all types, TRIGSTR, skins, collisions, fallbacks ----------

function makeFixtureSource() {
  const src = path.join(WORK, 'fixture-src');
  writeJson(path.join(src, 'strings.json'), {
    7: { value: 'Named Via Trigstr' },
  });
  writeJson(path.join(src, 'objects-units.json'), {
    original: { hfoo: [mod('uhpm', '500')] }, // modified original, no name
    custom: {
      'h000:hfoo': [mod('unam', 'Twin')],
      'h001:hfoo': [mod('unam', 'Twin')], // collision with h000
      'h002:hpea': [mod('unam', 'TRIGSTR_007')],
      'h003:hrif': [], // custom without a name -> rawcode fallback
    },
  });
  // Reforged skin twin: display name lives in the skin file only
  writeJson(path.join(src, 'objects-units-skin.json'), {
    original: {}, custom: { 'h003:hrif': [mod('unam', 'Skin Named')] },
  });
  writeJson(path.join(src, 'objects-items.json'), {
    original: {}, custom: { 'I000:ratf': [mod('unam', 'Great Blade')] },
  });
  writeJson(path.join(src, 'objects-destructables.json'), {
    original: {}, custom: { 'B000:LTlt': [mod('bnam', 'Iron Tree')] },
  });
  writeJson(path.join(src, 'objects-doodads.json'), {
    original: {}, custom: { 'D000:YOtf': [mod('dnam', 'Torch Ring')] },
  });
  writeJson(path.join(src, 'objects-abilities.json'), {
    original: {}, custom: { 'A000:ACtc': [mod('anam', 'Colossus Slam')] },
  });
  writeJson(path.join(src, 'objects-buffs.json'), {
    original: {}, custom: { 'B001:BPSE': [mod('fnam', 'Deep Chill')] },
  });
  writeJson(path.join(src, 'objects-upgrades.json'), {
    original: {}, custom: { 'R000:Rhme': [mod('gnam', 'Sharper Steel')] },
  });
  writeJson(path.join(src, 'units.json'), [
    { type: 'sloc', position: [0, 0, 0], rotation: 270, player: 0, id: 0 },
    { type: 'ogru', position: [0, 0, 0], rotation: 0, player: 0, id: 1,
      inventory: [{ slot: 0, type: 'ratf' }],
      customItemSets: [{ crys: 33 }],
      abilities: [{ ability: 'Aloc', active: false }] },
    { type: 'h000', position: [1, 1, 0], rotation: 0, player: 0, id: 2 }, // custom: no dup
  ]);
  writeJson(path.join(src, 'doodads.json'), {
    regular: [
      { type: 'B000', position: [0, 0, 0], angle: 0, id: 10 }, // custom destructable: no dup
      { type: 'LTlt', position: [0, 0, 0], angle: 0, id: 11 }, // unclassified -> DOOD_
    ],
    special: [{ type: 'LTrc', position: [0, 0, 0], angle: 0, id: 12 }],
  });
  writeJson(path.join(src, 'regions.json'), [
    { name: 'SpawnNorth', id: 0, position: { left: -384, bottom: 3264, right: 384, top: 3552 } },
    { name: 'Spawn North', id: 1, position: { left: 0, bottom: 0, right: 64, top: 64 } }, // collides
  ]);
  writeJson(path.join(src, 'sounds.json'), [
    { variableName: 'WaveReward', path: 'Abilities\\Tomes.flac', volume: 127,
      flags: { looping: false, '3dSound': false, stopOutOfRange: false, music: false, imported: false },
      fadeRate: { in: 10, out: 10 }, effect: 'SpellsEAX', channel: 8 },
  ]);
  return src;
}

test('collectConstants: all seven types, skin name merge, TRIGSTR, collisions, fallbacks', () => {
  const src = makeFixtureSource();
  const entries = collectConstants(src);
  const names = new Map(entries.map((e) => [e.constName, e]));

  // collision: BOTH twins get the rawcode suffix (order-independent rule)
  assert.ok(!names.has('UNIT_TWIN'), 'plain colliding name not assigned');
  assert.strictEqual(names.get('UNIT_TWIN_h000').rawcode, 'h000');
  assert.strictEqual(names.get('UNIT_TWIN_h001').rawcode, 'h001');
  // TRIGSTR-resolved name
  assert.strictEqual(names.get('UNIT_NAMED_VIA_TRIGSTR').rawcode, 'h002');
  // skin twin supplies the display name for the main-file entry
  assert.strictEqual(names.get('UNIT_SKIN_NAMED').rawcode, 'h003');
  // modified original with no name override -> rawcode fallback
  assert.strictEqual(names.get('UNIT_hfoo').rawcode, 'hfoo');
  // all seven object types
  assert.strictEqual(names.get('ITEM_GREAT_BLADE').rawcode, 'I000');
  assert.strictEqual(names.get('DEST_IRON_TREE').rawcode, 'B000');
  assert.strictEqual(names.get('DOOD_TORCH_RING').rawcode, 'D000');
  assert.strictEqual(names.get('ABIL_COLOSSUS_SLAM').rawcode, 'A000');
  assert.strictEqual(names.get('BUFF_DEEP_CHILL').rawcode, 'B001');
  assert.strictEqual(names.get('UPGR_SHARPER_STEEL').rawcode, 'R000');

  // placement fallbacks from units.json: unit, inventory item, customItemSets
  // item, preplaced ability; sloc skipped, custom h000 not duplicated
  assert.strictEqual(names.get('UNIT_ogru').rawcode, 'ogru');
  assert.strictEqual(names.get('ITEM_ratf').rawcode, 'ratf');
  assert.strictEqual(names.get('ITEM_crys').rawcode, 'crys');
  assert.strictEqual(names.get('ABIL_Aloc').rawcode, 'Aloc');
  assert.ok(!names.has('UNIT_sloc'));
  assert.strictEqual(entries.filter((e) => e.rawcode === 'h000').length, 1, 'custom unit deduped');
  assert.strictEqual(entries.filter((e) => e.rawcode === 'B000').length, 1, 'custom destructable deduped');
  // unclassified doodads.json types default to DOOD_ (regular AND special)
  assert.strictEqual(names.get('DOOD_LTlt').rawcode, 'LTlt');
  assert.strictEqual(names.get('DOOD_LTrc').rawcode, 'LTrc');

  // regions: colliding sanitized names both get the region-id suffix
  assert.ok(names.has('REGION_SPAWN_NORTH_0') && names.has('REGION_SPAWN_NORTH_1'));
  assert.match(names.get('REGION_SPAWN_NORTH_0').luaValue, /minX = -384\.0.*maxY = 3552\.0/);
  // sounds: CreateSound argument table
  assert.match(names.get('SOUND_WAVE_REWARD').luaValue,
    /path = "Abilities\\\\Tomes\.flac".*effect = "SpellsEAX".*volume = 127/);

  // FourCC value form
  assert.strictEqual(names.get('UNIT_ogru').luaValue, 'FourCC("ogru")');
});

test('collectConstants: real map — crossroads-siege TRIGSTR names', () => {
  const entries = collectConstants(path.join(ROOT, 'maps', 'crossroads-siege'));
  const byName = new Map(entries.map((e) => [e.constName, e]));
  assert.strictEqual(byName.get('UNIT_CROSSROADS_MILITIA').rawcode, 'h000'); // TRIGSTR_015
  assert.strictEqual(byName.get('ITEM_BLADE_OF_THE_CROSSROADS').rawcode, 'I000');
  assert.ok(byName.has('REGION_SPAWN_NORTH'));
  assert.ok(byName.has('SOUND_WAVE_REWARD'));
});

// ---- lua block + injection --------------------------------------------------

test('generated block is valid Lua 5.3 and injection is idempotent', () => {
  const entries = collectConstants(makeFixtureSource());
  const block = generateConstantsBlock(entries);
  assert.strictEqual(checkLuaSyntax(block), null, 'block parses as Lua');

  const user = 'function config() end\nfunction main()\n  CreateUnit(Player(0), UNIT_ogru, 0.0, 0.0, 0.0)\nend\n';
  const once = injectConstantsIntoLua(user, entries);
  assert.ok(once.startsWith(BEGIN_MARK), 'block prepended ABOVE the user script');
  assert.ok(once.endsWith(user), 'user script follows unmodified');
  assert.strictEqual(injectConstantsIntoLua(once, entries), once, 'inject twice = inject once');
  assert.strictEqual(stripConstantsBlock(once), user, 'strip restores the user script');
  assert.strictEqual(checkLuaSyntax(once), null, 'packed script parses as Lua');
});

test('no derivable constants: no block emitted, stale block stripped', () => {
  const empty = path.join(WORK, 'empty-src');
  fs.mkdirSync(empty, { recursive: true });
  const user = 'function main() end\n';
  assert.deepStrictEqual(collectConstants(empty), []);
  const stale = generateConstantsBlock(collectConstants(makeFixtureSource())) + '\n' + user;
  assert.strictEqual(injectConstantsIntoLua(stale, []), user, 'stale block removed, none re-added');
  assert.strictEqual(injectConstantsIntoLua(user, []), user);
});

// ---- build-map integration ---------------------------------------------------

test('build-map emits constants.json and the packed script defines the constants', () => {
  // build a COPY of maps/demo so this test owns its constants.json
  const src = path.join(WORK, 'demo-copy');
  fs.cpSync(path.join(ROOT, 'maps', 'demo'), src, { recursive: true });
  const out = path.join(WORK, 'demo-copy.w3x');
  execFileSync('node', [path.join(ROOT, 'tools', 'build-map.js'), src, out], { encoding: 'utf8' });

  const idx = JSON.parse(fs.readFileSync(path.join(src, 'constants.json'), 'utf8'));
  assert.deepStrictEqual(idx.constants.UNIT_hfoo,
    { kind: 'unit', rawcode: 'hfoo', source: 'units.json' });
  assert.deepStrictEqual(idx.constants.DOOD_LTlt,
    { kind: 'doodad', rawcode: 'LTlt', source: 'doodads.json' });
  // index matches the generator output exactly
  assert.deepStrictEqual(idx, constantsIndex(collectConstants(src)));
  // the demo's adoption line (UNIT_hfoo instead of FourCC("hfoo")) is backed
  // by a definition in the packed script — validate-map's luaparse gate plus
  // this keeps the loop closed
  execFileSync('node', [path.join(ROOT, 'tools', 'validate-map.js'), out], { encoding: 'utf8' });
});
