'use strict';
// End-to-end pipeline tests for maps/northreach — the "FoTN mechanics +
// custom models" map source: 80x80 Northrend coast (sea along south/west,
// fjord, river, NE mountain massif with cliff layers 3-4 and ramp flags),
// 4 user players who all start TOGETHER at one communal southern landing
// (4 one-player forces, team index = force index, the tidewatch invariant),
// an active hunting/fishing item economy sold at a neutral Market, a
// corruption tax with coin counter-play, free-form Shelter -> Homestead ->
// Town Hall founding, wolves that hunt at night, a player-declared
// '-endgame' purge, THREE generated custom MDX models (longship / founder
// banner / waystone cairn, all sanity-clean), and a '-test' debug mode.
// Design source: docs/reference/fotn-analysis.md.
// Mirrors test/siege.test.js: build -> validate -> extract -> compare ->
// full repack round-trip. The committed JSON is a translator fixed point.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'maps', 'northreach');
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'wc3-toolkit-northreach-test-'));
const W3X = path.join(WORK, 'northreach.w3x');

const MODELS = ['NorthLongship.mdx', 'FounderBanner.mdx', 'WaystoneCairn.mdx'];

// every translatable JSON file this map source carries
const SOURCE_JSON = [
  'info.json', 'terrain.json', 'units.json', 'doodads.json', 'strings.json',
  'regions.json', 'cameras.json', 'sounds.json', 'objects-units.json',
  'objects-items.json',
];

function run(tool, ...args) {
  return execFileSync('node', [path.join(ROOT, 'tools', tool), ...args], { encoding: 'utf8' });
}
function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

test('northreach source has the advertised moving parts', () => {
  const terrain = readJson(path.join(SRC, 'terrain.json'));
  assert.strictEqual(terrain.tileset, 'N', 'Northrend tileset');
  assert.strictEqual(terrain.map.width, 80);
  assert.strictEqual(terrain.map.height, 80);
  assert.strictEqual(terrain.groundHeight.length, 81 * 81, 'per-vertex arrays sized (w+1)*(h+1)');
  // FourCCs from the docs/FORMATS.md Northrend tables only
  for (const t of terrain.tilePalette) assert.match(t, /^N(drt|drd|rck|grs|ice|snw|snr)$/, `tile ${t}`);
  assert.deepStrictEqual(terrain.cliffTilePalette, ['CNdi', 'CNsn']);
  assert.ok(terrain.flags.filter((f) => (f & 256) !== 0).length > 1000, 'cold sea flagged (south/west)');
  assert.ok(terrain.flags.some((f) => (f & 64) !== 0), 'mountain ramp flags set');
  assert.ok(terrain.layerHeight.some((l) => l === 3), 'mountain cliff layer 3');
  assert.ok(terrain.layerHeight.some((l) => l === 4), 'mountain core layer 4');
  const cols = 81;
  const at = (arr, r, c) => arr[r * cols + c];
  // sea along the south edge and the west edge, land midfield
  assert.strictEqual(at(terrain.flags, 79, 40) & 256, 256, 'south edge is sea');
  assert.strictEqual(at(terrain.flags, 40, 2) & 256, 256, 'west edge is sea');
  assert.strictEqual(at(terrain.flags, 40, 40) & 256, 0, 'midfield is dry land');
  // fjord cuts north from the south sea around x ~ 0 (col ~40)
  assert.strictEqual(at(terrain.flags, 55, 40) & 256, 256, 'fjord water inland of the coast');
  // the northeast massif is raised
  assert.strictEqual(at(terrain.layerHeight, 16, 62), 4, 'massif core on layer 4');

  // --- units: communal start, no per-player bases, huntable wild ---
  const units = readJson(path.join(SRC, 'units.json'));
  const slocs = units.filter((u) => u.type === 'sloc');
  assert.strictEqual(slocs.length, 4, '4 start locations (lobby validity)');
  for (const s of slocs) {
    // all four slocs cluster at the communal landing near the southern coast
    assert.ok(Math.abs(s.position[0] - -2688) <= 256 && Math.abs(s.position[1] - -2496) <= 256,
      `sloc ${s.player} is at the communal landing (got ${s.position[0]},${s.position[1]})`);
  }
  assert.strictEqual(units.filter((u) => u.type === 'H000').length, 4, 'one Founder hero per player');
  assert.strictEqual(units.filter((u) => u.type === 'h003').length, 0, 'no preplaced Town Halls/capitals');
  assert.strictEqual(units.filter((u) => u.type === 'hpea').length, 0, 'no starting workers (FoTN)');
  assert.strictEqual(units.filter((u) => u.type === 'h001').length, 0, 'longships are trained, not preplaced');
  assert.strictEqual(units.filter((u) => u.type === 'n002').length, 1, 'one neutral Northreach Market');
  assert.strictEqual(units.filter((u) => u.type === 'n003').length, 3, 'three fishing shoals');
  assert.ok(units.filter((u) => u.type === 'nder').length >= 6, 'deer to hunt');
  assert.ok(units.filter((u) => /^nwl[tg]$/.test(u.type)).length >= 8, 'wolf packs to fear');
  assert.strictEqual(units.filter((u) => u.type === 'ngol').length, 2,
    'exactly 2 creep-guarded flavor mines -- players have no gold mines');
  assert.strictEqual(units.filter((u) => u.type === 'n001').length, 6, 'a waystone cairn at every site');
  assert.ok(units.filter((u) => u.player === 24 && u.targetAcquisition === -2).length >= 6,
    'camp-acquisition creep guards');

  const doodads = readJson(path.join(SRC, 'doodads.json'));
  assert.ok(doodads.regular.length >= 150, `150+ doodads (${doodads.regular.length})`);
  assert.ok(doodads.regular.filter((d) => d.type === 'NTtw').length >= 100, 'Northrend tree forests');

  const info = readJson(path.join(SRC, 'info.json'));
  assert.strictEqual(info.players.length, 4, '4 players');
  assert.strictEqual(info.players.filter((p) => p.type === 1).length, 4, 'all USER slots');
  assert.strictEqual(info.scriptLanguage, 1, 'Lua map');
  assert.strictEqual(info.map.mainTileType, 'N');
  // the tidewatch lobby invariant: 4 one-player forces, team i = force i
  assert.strictEqual(info.forces.length, 4, 'four forces');
  info.forces.forEach((f, i) => {
    assert.strictEqual(f.players.length, 1, `force ${i} holds exactly one player`);
  });
  for (const p of info.players) {
    assert.ok(
      slocs.some((s) => s.player === p.playerNum
        && s.position[0] === p.startingPos.x && s.position[1] === p.startingPos.y),
      `player ${p.playerNum} startingPos has a matching sloc`
    );
  }

  const regions = readJson(path.join(SRC, 'regions.json'));
  assert.strictEqual(regions.length, 8, '6 recommended sites + 2 wolf dens');
  assert.strictEqual(regions.filter((r) => r.name.startsWith('Site')).length, 6);
  assert.strictEqual(regions.filter((r) => r.name.startsWith('Den')).length, 2);
  assert.strictEqual(readJson(path.join(SRC, 'cameras.json')).length, 2, 'two cameras');
  assert.ok(readJson(path.join(SRC, 'sounds.json')).length >= 2, 'sounds defined');

  const strings = readJson(path.join(SRC, 'strings.json'));
  const objUnits = readJson(path.join(SRC, 'objects-units.json'));
  const objItems = readJson(path.join(SRC, 'objects-items.json'));
  const referenced = JSON.stringify(info) + JSON.stringify(objUnits) + JSON.stringify(objItems);
  for (const ref of referenced.match(/TRIGSTR_(\d+)/g)) {
    const n = String(parseInt(ref.replace('TRIGSTR_', ''), 10));
    assert.ok(strings[n], `${ref} resolves in strings.json`);
  }
  // gotcha 16: wts strings must stay ASCII-only
  for (const [k, v] of Object.entries(strings)) {
    assert.match(v.value, /^[\x20-\x7e]*$/, `strings.json entry ${k} is ASCII-only`);
  }

  // custom units reference all three generated models; binaries committed.
  // Model FIELDS must use the .mdl extension (the engine swaps it for .mdx
  // at load; a literal .mdx path fails to resolve and the unit is invisible
  // in-game — FoTN's w3u uses .mdl for every one of its imported .mdx files).
  const unitBlob = JSON.stringify(objUnits.custom);
  for (const m of MODELS) {
    const ref = m.replace(/\.mdx$/, '.mdl');
    assert.ok(unitBlob.includes(`war3mapImported\\\\${ref}`),
      `a custom unit references ${ref} (.mdl form of ${m})`);
    assert.ok(!unitBlob.includes(m),
      `no umdl references the literal .mdx path for ${m}`);
    assert.ok(fs.existsSync(path.join(SRC, 'imports', 'war3mapImported', m)), `${m} committed`);
  }
  // the founding chain and the market wiring live in object data
  const flat = {};
  for (const [k, mods] of Object.entries(objUnits.custom)) {
    flat[k.split(':')[0]] = Object.fromEntries(mods.map((m) => [m.id, m.value]));
  }
  assert.strictEqual(flat.h004.uupt, 'h005', 'Shelter upgrades to Homestead');
  assert.strictEqual(flat.h005.uupt, 'h003', 'Homestead upgrades to Town Hall');
  assert.ok(flat.H000.ubui.includes('h004'), 'the Founder himself builds the Shelter');
  assert.ok(flat.H000.uabi.includes('AHbu'), 'Founder carries the human build ability');
  assert.ok(flat.H000.uabi.includes('Ahrp'),
    'Founder carries human Repair (Ahrp) -- human-style construction never completes without it');
  assert.strictEqual(flat.h006.utra, 'h001', 'the Longship trains at the coastal Dock');
  assert.strictEqual(flat.n002.usei, 'I003,I004,I005', 'Market sells the three Trade Coins');
  // hunt drops and coins: every custom item is pawnable with a gold value
  const itemIds = Object.keys(objItems.custom).map((k) => k.split(':')[0]).sort();
  assert.deepStrictEqual(itemIds, ['I000', 'I001', 'I002', 'I003', 'I004', 'I005']);
  for (const [k, mods] of Object.entries(objItems.custom)) {
    const byId = Object.fromEntries(mods.map((m) => [m.id, m.value]));
    assert.ok(byId.igol > 0, `${k} has a gold value`);
    assert.strictEqual(byId.ipaw, 1, `${k} is pawnable at the Market`);
    // every item must carry its FULL visible identity, or the ches base's
    // cheese art/tooltip leaks through in-game (field ids verified against
    // FoTN's own working ches-based trade goods): name, description, shop
    // tooltip + extended tooltip, icon, ground model.
    for (const id of ['unam', 'ides', 'utip', 'utub', 'iico', 'ifil']) {
      assert.ok(byId[id], `${k} sets ${id}`);
    }
    assert.match(byId.iico, /^ReplaceableTextures\\CommandButtons\\BTN[\w]+\.blp$/,
      `${k} iico is a stock command-button path`);
    assert.match(byId.ifil, /\.mdl$/, `${k} ifil uses the .mdl extension (model-field convention)`);
  }

  // the map script drives the FoTN loop and the '-test' debug mode
  const lua = fs.readFileSync(path.join(SRC, 'war3map.lua'), 'utf8');
  for (const needle of ['function config()', 'function main()', 'CreateAllUnits()',
    'InitCustomPlayerSlots', 'InitCustomTeams', 'TriggerRegisterPlayerChatEvent',
    'EVENT_PLAYER_UNIT_CONSTRUCT_FINISH', 'EVENT_PLAYER_UNIT_UPGRADE_FINISH',
    'EVENT_PLAYER_UNIT_PAWN_ITEM',           // market sale top-up wiring
    'DoCorruptionTick', 'TAX_PERIOD',        // corruption tax wiring
    'GRACE_PERIOD', 'WolfSurge',             // grace period + night threat
    'SetFounderTruce', 'SetPlayerAlliance', 'ALLIANCE_PASSIVE', // real truce state
    'CreateMultiboard', 'CustomVictoryBJ', 'ReviveHero',
    '"-test"', '"-endgame"', '"-town"', '-gold', '"-found"', '"-tax"',
    '"-wolves"', '"-grace"', '"-reveal"', '"-victory"', '"-ff"', '-help']) {
    assert.ok(lua.includes(needle), `war3map.lua contains ${needle}`);
  }
  assert.strictEqual(lua.includes('SETTLEMENTS_TO_WIN'), false,
    'no first-to-N auto victory remains');
});

test('all three model generators are committed and models pass sanityTest', () => {
  const sanityTest = require('mdx-m3-viewer-th/dist/cjs/utils/mdlx/sanitytest/sanitytest.js').default;
  const Model = require('mdx-m3-viewer-th/dist/cjs/parsers/mdlx/model.js').default;
  for (const m of MODELS) {
    const gen = `generate-${m === 'NorthLongship.mdx' ? 'longship'
      : m === 'FounderBanner.mdx' ? 'banner' : 'cairn'}.mjs`;
    assert.ok(fs.existsSync(path.join(SRC, 'assets', gen)), `${gen} committed`);
    const model = new Model();
    // NB: must be a fresh Uint8Array, never a Node Buffer (the parser slices .buffer)
    model.load(new Uint8Array(fs.readFileSync(path.join(SRC, 'imports', 'war3mapImported', m))));
    const result = sanityTest(model);
    assert.strictEqual(result.errors, 0, `${m}: no sanity errors`);
    assert.strictEqual(result.severe, 0, `${m}: no severe issues`);
    assert.ok(model.sequences.some((s) => s.name.toLowerCase().startsWith('death')),
      `${m} has a Death sequence`);
    assert.ok(model.sequences.some((s) => s.name.toLowerCase().startsWith('stand')),
      `${m} has a Stand sequence`);
  }
});

test('build-map: maps/northreach -> .w3x with HM3W header and MPQ archive', () => {
  const out = run('build-map.js', SRC, W3X);
  assert.match(out, /built .*northreach\.w3x/);
  const buf = fs.readFileSync(W3X);
  assert.strictEqual(buf.toString('latin1', 0, 4), 'HM3W', 'HM3W magic at offset 0');
  assert.strictEqual(buf.toString('latin1', 512, 516), 'MPQ\x1a', 'MPQ magic at offset 512');
});

test('validate-map passes on the built northreach map (incl. 3 MDX sanity lines)', () => {
  const out = run('validate-map.js', W3X); // non-zero exit -> throws
  assert.doesNotMatch(out, /^FAIL/m);
  assert.match(out, /map script present/);
  assert.match(out, /PASS {2}lua syntax war3map\.lua/);
  // every translatable family must be present AND round-trip stable
  for (const war of ['w3i', 'w3e', 'w3r', 'w3c', 'w3s', 'w3u', 'w3t', 'wts', 'imp']) {
    assert.match(out, new RegExp(`PASS  translate war3map\\.${war}`), `war3map.${war} packed and stable`);
  }
  assert.match(out, /PASS {2}translate war3mapUnits\.doo/);
  assert.match(out, /PASS {2}translate war3map\.doo /);
  // cross-validation: mdx-m3-viewer-th second opinion, incl. the formats
  // wc3maptranslator can't parse (wpm/shd/mmp) and the three custom models
  assert.match(out, /PASS {2}viewer opens archive/);
  for (const f of ['war3map.wpm', 'war3map.shd', 'war3map.mmp', 'war3map.w3e', 'war3mapUnits.doo']) {
    assert.match(out, new RegExp(`PASS {2}viewer parse ${f.replace('.', '\\.')}`), `${f} second opinion`);
  }
  for (const m of MODELS) {
    assert.match(out, new RegExp(`PASS {2}viewer sanity war3mapImported/${m} {2}\\(errors=0 severe=0`),
      `${m} sanity-clean in the packed archive`);
  }
});

test('w3x-extract + map-to-json reproduce the northreach source JSON', () => {
  const extractDir = path.join(WORK, 'extracted');
  const jsonDir = path.join(WORK, 'src');
  run('w3x-extract.js', W3X, extractDir);
  for (const m of MODELS) {
    assert.ok(fs.existsSync(path.join(extractDir, 'war3mapImported', m)), `${m} extracted`);
  }

  run('map-to-json.js', extractDir, jsonDir);
  const manifest = readJson(path.join(jsonDir, 'manifest.json'));
  assert.deepStrictEqual(manifest.errors, [], 'no translation errors');

  // Translatable content must match the committed source exactly
  // (the source is a translator fixed point).
  for (const f of SOURCE_JSON) {
    assert.deepStrictEqual(readJson(path.join(jsonDir, f)), readJson(path.join(SRC, f)), f);
  }
  // auto-generated import manifest lists the three models
  assert.deepStrictEqual(
    readJson(path.join(jsonDir, 'imports.json')).slice().sort(),
    MODELS.map((m) => `war3mapImported\\${m}`).sort()
  );
  // script came through: source text plus the generated CreateAllUnits block,
  // and the FoTN systems + chat-command wiring is in the packed script
  const packedLua = fs.readFileSync(path.join(jsonDir, 'war3map.lua'), 'utf8');
  const srcLua = fs.readFileSync(path.join(SRC, 'war3map.lua'), 'utf8');
  assert.ok(packedLua.startsWith(srcLua), 'packed lua starts with the source script');
  assert.match(packedLua, /BEGIN wc3-map-toolkit generated: CreateAllUnits/);
  assert.doesNotMatch(packedLua, /__wc3tk_user_main/, 'no wrapper: main() calls CreateAllUnits');
  for (const needle of ['TriggerRegisterPlayerChatEvent', '"-test"', '%-gold%s+(%d+)',
    '"-endgame"', '"-town"', '"-found"', '"-tax"', '"-wolves"', '"-grace"',
    '"-reveal"', '"-victory"', '"-ff"', '"-help"',
    'EVENT_PLAYER_UNIT_PAWN_ITEM', 'DoCorruptionTick',       // tax + market top-up
    'DROPS', 'HandleHuntDeath', 'ScheduleRespawn',           // hunt-drop loop
    'GRACE_PERIOD', 'WolfSurge', 'EliminationSweep',         // grace/night/purge
    'SetPlayerAlliance(Player(i), Player(j), ALLIANCE_PASSIVE, peace)', // grace truce
    'SetFounderTruce(true)', 'SetFounderTruce(false)']) {    // ...set AND torn down
    assert.ok(packedLua.includes(needle), `packed war3map.lua contains ${needle}`);
  }
  // creep camps get WE "camp" acquisition from units.json targetAcquisition -2
  assert.match(packedLua, /SetUnitAcquireRange\(u, 200\.0\)/, 'camp acquisition applied');
  // generated minimap preview files appear under files/
  for (const f of ['war3map.mmp', 'war3mapMap.tga']) {
    assert.ok(fs.existsSync(path.join(jsonDir, 'files', f)), `generated ${f} present in archive`);
  }
  // opaque files and the binary MDX assets come through verbatim
  for (const f of ['war3map.shd', 'war3map.wpm']) {
    assert.ok(
      fs.readFileSync(path.join(jsonDir, 'files', f)).equals(fs.readFileSync(path.join(SRC, 'files', f))),
      `${f} copied verbatim`
    );
  }
  for (const m of MODELS) {
    assert.ok(
      fs.readFileSync(path.join(jsonDir, 'files', 'war3mapImported', m))
        .equals(fs.readFileSync(path.join(SRC, 'imports', 'war3mapImported', m))),
      `${m} byte-identical after archive round-trip`
    );
  }
  // wpm/shd sizes derive from the 80x80 terrain (w*4 x h*4 cells)
  assert.strictEqual(fs.statSync(path.join(jsonDir, 'files', 'war3map.wpm')).size, 16 + 320 * 320);
  assert.strictEqual(fs.statSync(path.join(jsonDir, 'files', 'war3map.shd')).size, 320 * 320);
});

test('full repack round-trip preserves northreach content and header', () => {
  const jsonDir = path.join(WORK, 'src'); // produced by previous test
  const rebuiltDir = path.join(WORK, 'rebuilt');
  const w3x2 = path.join(WORK, 'northreach2.w3x');
  run('json-to-map.js', jsonDir, rebuiltDir);
  run('w3x-pack.js', rebuiltDir, w3x2);
  run('validate-map.js', w3x2);

  const extractDir2 = path.join(WORK, 'extracted2');
  const jsonDir2 = path.join(WORK, 'src2');
  run('w3x-extract.js', w3x2, extractDir2);
  run('map-to-json.js', extractDir2, jsonDir2);
  assert.deepStrictEqual(
    readJson(path.join(jsonDir2, '_header.json')),
    readJson(path.join(jsonDir, '_header.json')),
    'HM3W header preserved'
  );
  for (const f of fs.readdirSync(jsonDir).filter((f) => f.endsWith('.json') && f !== 'manifest.json')) {
    assert.deepStrictEqual(readJson(path.join(jsonDir2, f)), readJson(path.join(jsonDir, f)), f);
  }
});

test.after(() => {
  fs.rmSync(WORK, { recursive: true, force: true });
});
