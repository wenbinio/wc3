'use strict';
// lib/objectlint.js — semantic WARN-only lint of object data, encoding the
// Northreach + Coinstead playtest lessons (CLAUDE.md gotchas 22/23/25/31):
//   a) model FIELDS must use .mdl (a literal .mdx renders an invisible
//      unit) and war3mapImported references must resolve to an archive
//      member after .mdl<->.mdx normalization; imported ICON references
//      (uico/iico) must resolve too (no extension swap for textures);
//   b) an item overriding unam without ifil/iico leaks the base's art
//      ("deer drops cheese");
//   c) a unit with a build list whose overridden uabi has no repair
//      ability starts buildings that never finish (AHbu needs Ahrp);
//   d) stock art paths must be in the verified facts table
//      lib/data/stock-art.json (listfile-verified or better = silent);
//   e) clone crowds: >=2 custom units on one base, all renamed, none
//      re-arted — the coinstead five-farm wall;
//   f) an imported BTN command-button texture needs its DISBTN twin.
// Also pins the validate-map integration: warnings print as WARN lines,
// never flip a map to FAIL. Committed builds: crossroads/demo/tidewatch/
// coinstead are fully warning-clean; northreach and vaults-of-ash carry
// ONLY the expected gotcha-31 art WARNs (their stock icons predate the
// table / their creep-tier pairs share base art) — any other WARN class
// on a committed build is a regression.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const { lintObjectData } = require('../lib/objectlint');

const ROOT = path.join(__dirname, '..');

const mod = (id, value) => ({ id, type: 'string', level: 0, column: 0, value });
const unitsFile = (custom, original) =>
  ({ war: 'war3map.w3u', objectType: 'units', json: { original: original || {}, custom } });
const itemsFile = (custom) =>
  ({ war: 'war3map.w3t', objectType: 'items', json: { original: {}, custom } });

test('lint a: .mdx model-field value warns; .mdl with matching .mdx member is clean', () => {
  const members = ['war3mapImported/MyModel.mdx', 'war3map.w3i'];
  const bad = lintObjectData(
    [unitsFile({ 'h000:hfoo': [mod('umdl', 'war3mapImported\\MyModel.mdx')] })], members);
  assert.strictEqual(bad.length, 1);
  assert.strictEqual(bad[0].objectId, 'h000:hfoo');
  assert.match(bad[0].message, /ends in \.mdx/);
  assert.match(bad[0].message, /\.mdl extension/);

  const good = lintObjectData(
    [unitsFile({ 'h000:hfoo': [mod('umdl', 'war3mapImported\\MyModel.mdl')] })], members);
  assert.deepStrictEqual(good, []);
});

test('lint a: war3mapImported reference with no archive member warns (after .mdl<->.mdx normalization)', () => {
  const w = lintObjectData(
    [unitsFile({ 'h000:hfoo': [mod('umdl', 'war3mapImported\\Ghost.mdl')] })],
    ['war3mapImported/MyModel.mdx']);
  assert.strictEqual(w.length, 1);
  assert.match(w[0].message, /no archive member/);
  // built-in paths are NOT checked against the archive (no import needed) —
  // since gotcha 31 they route to rule (d)'s stock-art table instead: a
  // TABLE-VERIFIED stock path is clean, an unknown one draws only the
  // table WARN (never the archive-member one)
  const builtin = lintObjectData(
    [unitsFile({ 'h000:hfoo': [mod('umdl', 'units\\human\\Peasant\\peasant.mdl')] })], []);
  assert.deepStrictEqual(builtin, []);
  const unknownBuiltin = lintObjectData(
    [unitsFile({ 'h000:hfoo': [mod('umdl', 'units\\human\\Footman\\Footman.mdl')] })], []);
  assert.strictEqual(unknownBuiltin.length, 1);
  assert.match(unknownBuiltin[0].message, /stock-art table/);
  assert.doesNotMatch(unknownBuiltin[0].message, /no archive member/);
});

test('lint a: applies to ifil/bfil/dfil too, and to the original scope', () => {
  const w = lintObjectData([
    itemsFile({ 'I000:ches': [mod('ifil', 'war3mapImported\\Hide.mdx'), mod('unam', 'Deer Hide'),
      mod('iico', 'ReplaceableTextures\\CommandButtons\\BTNCheese.blp')] }),
    // a TABLE-VERIFIED stock path with the .mdx mistake: only rule (a) fires
    { war: 'war3map.w3b', objectType: 'destructables', json: { original: { LTlt: [mod('bfil', 'Doodads\\LordaeronSummer\\Structures\\Barn\\Barn.mdx')] }, custom: {} } },
    { war: 'war3map.w3d', objectType: 'doodads', json: { original: {}, custom: { 'D000:LTba': [mod('dfil', 'war3mapImported\\Barrel.mdx')] } } },
  ], ['war3mapImported/Hide.mdx', 'war3mapImported/Barrel.mdx']);
  const fields = w.map((x) => x.message.split(' ')[0]).sort();
  assert.deepStrictEqual(fields, ['bfil', 'dfil', 'ifil']);
});

test('lint b: item overriding unam without ifil/iico warns; either art field silences it', () => {
  const bare = lintObjectData([itemsFile({ 'I000:ches': [mod('unam', 'Deer Hide')] })], []);
  assert.strictEqual(bare.length, 1);
  assert.match(bare[0].message, /deer drops cheese/);

  const withIcon = lintObjectData(
    [itemsFile({ 'I000:ches': [mod('unam', 'Deer Hide'), mod('iico', 'ReplaceableTextures\\CommandButtons\\BTNStag.blp')] })], []);
  assert.deepStrictEqual(withIcon, []);
  const withModel = lintObjectData(
    [itemsFile({ 'I000:ches': [mod('unam', 'Deer Hide'), mod('ifil', 'Objects\\InventoryItems\\Rune\\Rune.mdl')] })], []);
  assert.deepStrictEqual(withModel, []);
});

test('lint b: deliberately scoped to items — a renamed unit keeping base art is not flagged', () => {
  const w = lintObjectData([unitsFile({ 'H000:Hpal': [mod('unam', 'TRIGSTR_005')] })], []);
  assert.deepStrictEqual(w, []);
});

test('lint c: build list + uabi override without a repair ability warns; Ahrp (or race equivalent) silences it', () => {
  const broken = lintObjectData(
    [unitsFile({ 'H000:Hpal': [mod('uabi', 'AInv,AHbu'), mod('ubui', 'h004,h006')] })], []);
  assert.strictEqual(broken.length, 1);
  assert.match(broken[0].message, /never progress/);

  const fixed = lintObjectData(
    [unitsFile({ 'H000:Hpal': [mod('uabi', 'AInv,AHbu,Ahrp'), mod('ubui', 'h004,h006')] })], []);
  assert.deepStrictEqual(fixed, []);
  const orc = lintObjectData(
    [unitsFile({ 'o000:opeo': [mod('uabi', 'AObu,Arep'), mod('ubui', 'o001')] })], []);
  assert.deepStrictEqual(orc, []);
});

test('lint c: no warning when uabi is not overridden (base ability set is not visible) or ubui is empty', () => {
  const noUabi = lintObjectData(
    [unitsFile({}, { hpea: [mod('ubui', 'h004,h006')] })], []);
  assert.deepStrictEqual(noUabi, []);
  const emptyUbui = lintObjectData(
    [unitsFile({ 'n000:nech': [mod('uabi', ''), mod('ubui', '')] })], []);
  assert.deepStrictEqual(emptyUbui, []);
});

// --- rule a, icon side: imported icon references must resolve ----------

test('lint a (icons): unresolved war3mapImported uico/iico warns; .blp<->.tga near-miss is named', () => {
  const missing = lintObjectData(
    [unitsFile({ 'h000:hfoo': [mod('uico', 'war3mapImported\\BTNGhost.blp')] })], []);
  assert.strictEqual(missing.length, 1);
  assert.match(missing[0].message, /green square/);

  const nearMiss = lintObjectData(
    [itemsFile({ 'I000:ches': [mod('unam', 'X'), mod('iico', 'war3mapImported\\BTNFoo.blp')] })],
    ['war3mapImported/BTNFoo.tga', 'war3mapImported/DISBTNFoo.tga']);
  assert.strictEqual(nearMiss.length, 1);
  assert.match(nearMiss[0].message, /\.blp<->\.tga twin/);
  assert.match(nearMiss[0].message, /NO extension swap/);

  const resolved = lintObjectData(
    [itemsFile({ 'I000:ches': [mod('unam', 'X'), mod('iico', 'war3mapImported\\BTNFoo.blp')] })],
    ['war3mapImported/BTNFoo.blp', 'war3mapImported/DISBTNFoo.blp']);
  assert.deepStrictEqual(resolved, []);
});

// --- rule d: stock paths vs lib/data/stock-art.json --------------------

test('lint d: a stock path not in the verified table warns; listfile-verified or better is silent', () => {
  const unknown = lintObjectData(
    [unitsFile({ 'h000:hfoo': [mod('umdl', 'units\\human\\Footman\\Footman.mdl')] })], []);
  assert.strictEqual(unknown.length, 1);
  assert.match(unknown[0].message, /not in the verified stock-art table/);
  assert.match(unknown[0].message, /gotcha 31/);

  // game-verified (coinstead playtest) and listfile-verified are silent
  const verified = lintObjectData([
    itemsFile({ 'I000:ches': [mod('unam', 'X'),
      mod('ifil', 'Objects\\InventoryItems\\TreasureChest\\treasurechest.mdl'),
      mod('iico', 'ReplaceableTextures\\CommandButtons\\BTNCheese.blp')] }),
    unitsFile({ 'u000:uzom': [mod('umdl', 'Units\\Creeps\\Zombie\\Zombie.mdl'),
      mod('uico', 'ReplaceableTextures\\CommandButtons\\BTNZombie.blp')] }),
  ], []);
  assert.deepStrictEqual(verified, []);

  // a value imported AT a stock-like path is an import, not stock art
  const imported = lintObjectData(
    [unitsFile({ 'h000:hfoo': [mod('uico', 'ReplaceableTextures\\CommandButtons\\BTNMine.blp')] })],
    ['ReplaceableTextures/CommandButtons/BTNMine.blp',
      'ReplaceableTextures/CommandButtonsDisabled/DISBTNMine.blp']);
  assert.deepStrictEqual(imported, []);
});

test('lint d: the near-miss class the table exists for (LumberMill vs HumanLumberMill) warns', () => {
  const w = lintObjectData(
    [unitsFile({ 'h000:hfoo': [mod('umdl', 'Buildings\\Human\\LumberMill\\LumberMill.mdl')] })], []);
  assert.strictEqual(w.length, 1);
  assert.match(w[0].message, /renders NOTHING/);
  const right = lintObjectData(
    [unitsFile({ 'h000:hfoo': [mod('umdl', 'Buildings\\Human\\HumanLumberMill\\HumanLumberMill.mdl')] })], []);
  assert.deepStrictEqual(right, []);
});

// --- rule e: clone crowds ----------------------------------------------

test('lint e: >=2 renamed clones of one base with no art override warn once per group', () => {
  const crowd = lintObjectData([unitsFile({
    'h001:hhou': [mod('unam', 'Woodcamp')],
    'h002:hhou': [mod('unam', 'Quarry')],
    'h003:hhou': [mod('unam', 'Grainfield')],
  })], []);
  assert.strictEqual(crowd.length, 1);
  assert.match(crowd[0].message, /3 custom units share base hhou/);
  assert.match(crowd[0].message, /clone crowd/);
  assert.match(crowd[0].message, /gotcha 31/);
  assert.strictEqual(crowd[0].objectId, 'h001:hhou,h002:hhou,h003:hhou');
});

test('lint e: a single renamed clone never triggers; one art override anywhere silences the group', () => {
  const single = lintObjectData([unitsFile({ 'h001:hhou': [mod('unam', 'Woodcamp')] })], []);
  assert.deepStrictEqual(single, []);
  const distinguished = lintObjectData([unitsFile({
    'h001:hhou': [mod('unam', 'Woodcamp'),
      mod('uico', 'ReplaceableTextures\\CommandButtons\\BTNBundleOfLumber.blp')],
    'h002:hhou': [mod('unam', 'Quarry')],
  })], []);
  assert.deepStrictEqual(distinguished, []);
  // two clones that DON'T rename are not a crowd of confusable identities
  const unnamed = lintObjectData([unitsFile({
    'h001:hhou': [mod('uhpm', '500')],
    'h002:hhou': [mod('uhpm', '600')],
  })], []);
  assert.deepStrictEqual(unnamed, []);
});

// --- rule f: BTN without DISBTN twin ------------------------------------

test('lint f: an imported BTN texture without its DISBTN twin warns; the pair is silent', () => {
  const lone = lintObjectData([], ['ReplaceableTextures/CommandButtons/BTNOre.blp']);
  assert.strictEqual(lone.length, 1);
  assert.match(lone[0].message, /no DISBTN twin/);
  assert.match(lone[0].message, /DISBTNOre\.blp/);

  const paired = lintObjectData([], [
    'ReplaceableTextures/CommandButtons/BTNOre.blp',
    'ReplaceableTextures/CommandButtonsDisabled/DISBTNOre.blp',
  ]);
  assert.deepStrictEqual(paired, []);
  // cross-extension twins count (TGA-fallback BTN + hand-made BLP DISBTN)
  const crossExt = lintObjectData([], [
    'war3mapImported/BTNOre.tga',
    'ReplaceableTextures/CommandButtonsDisabled/DISBTNOre.blp',
  ]);
  assert.deepStrictEqual(crossExt, []);
});

// --- validate-map integration on the COMMITTED builds -----------------

function runValidate(w3x) {
  // execFileSync throws on non-zero exit — warnings must never fail a map
  return execFileSync('node',
    [path.join(ROOT, 'tools', 'validate-map.js'), path.join(ROOT, 'maps', 'builds', w3x)],
    { encoding: 'utf8' });
}

test('validate-map: crossroads-siege (lint true positives fixed in source) is warning-clean', () => {
  const out = runValidate('crossroads-siege.w3x');
  assert.doesNotMatch(out, /^FAIL/m);
  assert.doesNotMatch(out, /^WARN/m);
  assert.match(out, /35\/35 checks passed/);
});

test('validate-map: committed builds carry no FAIL and no WARN outside the expected gotcha-31 art class', () => {
  const builds = fs.readdirSync(path.join(ROOT, 'maps', 'builds'))
    .filter((f) => f.endsWith('.w3x'));
  assert.ok(builds.length >= 4, `expected the bundled builds, got ${builds.join(', ')}`);
  // maps whose art is fully table-verified stay strictly warning-clean;
  // northreach + vaults-of-ash predate the stock-art table and are
  // EXPECTED to carry gotcha-31 WARNs (unknown stock icons / renamed
  // creep-tier pairs sharing base art) — nothing else.
  const strictlyClean = new Set(['demo.w3x', 'crossroads-siege.w3x', 'tidewatch-arena.w3x', 'coinstead.w3x', 'last-train.w3x']);
  const gotcha31 = /not in the verified stock-art table|clone crowd/;
  for (const w3x of builds) {
    const out = runValidate(w3x);
    assert.doesNotMatch(out, /^FAIL/m, `${w3x} has a FAIL line`);
    const warns = out.split('\n').filter((l) => /^WARN/.test(l));
    if (strictlyClean.has(w3x)) {
      assert.deepStrictEqual(warns, [], `${w3x} must be strictly warning-clean`);
    } else {
      assert.ok(warns.length > 0, `${w3x}: expected the gotcha-31 art WARNs`);
      for (const l of warns) {
        assert.match(l, gotcha31, `${w3x}: unexpected WARN class: ${l}`);
      }
    }
  }
});
