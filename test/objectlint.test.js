'use strict';
// lib/objectlint.js — semantic WARN-only lint of object data, encoding the
// Northreach playtest lessons (CLAUDE.md gotchas 22/23/25):
//   a) model FIELDS must use .mdl (a literal .mdx renders an invisible
//      unit) and war3mapImported references must resolve to an archive
//      member after .mdl<->.mdx normalization;
//   b) an item overriding unam without ifil/iico leaks the base's art
//      ("deer drops cheese");
//   c) a unit with a build list whose overridden uabi has no repair
//      ability starts buildings that never finish (AHbu needs Ahrp).
// Also pins the validate-map integration: warnings print as WARN lines,
// never flip a map to FAIL, and every committed build is warning-clean
// (the crossroads-siege true positives the lint originally caught are
// fixed in source, like northreach's playtest-commit fixes before them).

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
  // Blizzard built-in paths are NOT checked against the archive (no import needed)
  const builtin = lintObjectData(
    [unitsFile({ 'h000:hfoo': [mod('umdl', 'units\\human\\Footman\\Footman.mdl')] })], []);
  assert.deepStrictEqual(builtin, []);
});

test('lint a: applies to ifil/bfil/dfil too, and to the original scope', () => {
  const w = lintObjectData([
    itemsFile({ 'I000:ches': [mod('ifil', 'war3mapImported\\Hide.mdx'), mod('unam', 'Deer Hide'), mod('iico', 'x.blp')] }),
    { war: 'war3map.w3b', objectType: 'destructables', json: { original: { LTlt: [mod('bfil', 'Doodads\\Terrain\\Gate\\Gate.mdx')] }, custom: {} } },
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

test('validate-map: every committed build is warning-clean (and no FAIL)', () => {
  const builds = fs.readdirSync(path.join(ROOT, 'maps', 'builds'))
    .filter((f) => f.endsWith('.w3x'));
  assert.ok(builds.length >= 4, `expected the bundled builds, got ${builds.join(', ')}`);
  for (const w3x of builds) {
    const out = runValidate(w3x);
    assert.doesNotMatch(out, /^FAIL/m, `${w3x} has a FAIL line`);
    assert.doesNotMatch(out, /^WARN/m, `${w3x} has a WARN line`);
  }
});
