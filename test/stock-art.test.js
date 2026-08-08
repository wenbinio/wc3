'use strict';
// lib/data/stock-art.json — the verified stock-art PATH facts table
// (gotcha 31). The table stores paths only, never assets (CLAUDE.md Legal);
// entries are verified against the WurstScript community listfiles at
// table-build time and promoted to game-verified by playtests
// (docs/ASSETS.md "Stock art by path").

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const TABLE = require('../lib/data/stock-art.json');
const { stockArtEntry, collectStockArtRefs } = require('../lib/objectlint');

const STATUSES = ['community-doc', 'listfile-verified', 'game-verified'];

test('table integrity: entry shape, statuses, .mdl dialect, no duplicates', () => {
  assert.ok(Array.isArray(TABLE.entries) && TABLE.entries.length >= 100,
    `expected the seeded table (>=100 entries), got ${TABLE.entries && TABLE.entries.length}`);
  const seen = new Set();
  for (const e of TABLE.entries) {
    assert.deepStrictEqual(Object.keys(e).sort(),
      ['class', 'kind', 'path', 'source', 'status', 'verifiedBy'], JSON.stringify(e));
    // 2026-08 (last-train 2B): the table also registers SCRIPT-side stock
    // paths — 'effect' (AddSpecialEffect models) and 'sound' (CreateSound
    // files) — same fact discipline, listfile-verified at entry time
    assert.ok(['model', 'icon', 'effect', 'sound'].includes(e.kind), e.path);
    assert.ok(STATUSES.includes(e.status), e.path);
    assert.ok(e.path.includes('\\'), `archive paths are backslash-separated: ${e.path}`);
    assert.ok(!/^war3mapimported\\/i.test(e.path), `imports are not stock art: ${e.path}`);
    if (e.kind === 'model' || e.kind === 'effect') {
      // the field-value dialect (gotcha 22): .mdl in the table, never .mdx
      assert.match(e.path, /\.mdl$/, e.path);
    } else if (e.kind === 'sound') {
      assert.match(e.path, /\.wav$/, e.path);
    } else {
      assert.match(e.path, /^ReplaceableTextures\\/, e.path);
      assert.match(e.path, /\.blp$/, e.path);
      assert.strictEqual(e.class, 'command-button', e.path);
    }
    const n = e.path.toLowerCase();
    assert.ok(!seen.has(n), `duplicate: ${e.path}`);
    seen.add(n);
    assert.ok(typeof e.source === 'string' && e.source.length > 0, e.path);
    assert.ok(typeof e.verifiedBy === 'string' && e.verifiedBy.length > 0, e.path);
  }
});

test('seed contents: the report\'s game-verified and listfile-verified sets are present', () => {
  const get = (p) => TABLE.entries.find((e) => e.path.toLowerCase() === p.toLowerCase());
  // coinstead 2026-08 playtest (explicit overrides)
  const chest = get('Objects\\InventoryItems\\TreasureChest\\treasurechest.mdl');
  assert.strictEqual(chest && chest.status, 'game-verified');
  for (const n of ['BTNBundleOfLumber', 'BTNCheese', 'BTNRepair', 'BTNPillage']) {
    const e = get(`ReplaceableTextures\\CommandButtons\\${n}.blp`);
    assert.strictEqual(e && e.status, 'game-verified', n);
  }
  // crossroads (verified earlier)
  assert.strictEqual(get('Objects\\InventoryItems\\Rune\\Rune.mdl').status, 'game-verified');
  assert.strictEqual(get('ReplaceableTextures\\CommandButtons\\BTNSteelMelee.blp').status, 'game-verified');
  // northreach: listfile tier, re-verification pending
  const barrels = get('Buildings\\Other\\BarrelsUnit0\\BarrelsUnit0.mdl');
  assert.strictEqual(barrels.status, 'listfile-verified');
  assert.match(barrels.source, /re-verification pending/);
  // the report's near-miss lessons: exact listfile spellings made it in
  assert.ok(get('Buildings\\Human\\HumanLumberMill\\HumanLumberMill.mdl'), 'HumanLumberMill, not LumberMill');
  assert.ok(get('ReplaceableTextures\\CommandButtons\\BTNGraveYard.blp'), 'BTNGraveYard capital Y');
  assert.ok(get('ReplaceableTextures\\CommandButtons\\BTNMeatWagon.blp'), 'BTNMeatWagon capital W');
  // section 6 fix paths + section 7 undead set
  assert.ok(get('Doodads\\LordaeronSummer\\Structures\\Barn\\Barn.mdl'));
  assert.ok(get('Buildings\\Other\\GoldMine\\Goldmine.mdl'));
  assert.ok(get('Doodads\\LordaeronSummer\\Structures\\WindMill\\WindMill.mdl'));
  assert.ok(get('Buildings\\Undead\\Necropolis\\Necropolis.mdl'));
  assert.ok(get('Units\\Creeps\\Zombie\\Zombie.mdl'));
  assert.ok(get('Doodads\\LordaeronSummer\\Props\\PeasantGrave\\PeasantGrave2.mdl'));
});

test('stockArtEntry lookup: case-insensitive, slash-tolerant, .mdl<->.mdx and bare-icon forms', () => {
  const hit = stockArtEntry('objects\\inventoryitems\\rune\\rune.mdl');
  assert.ok(hit && hit.status === 'game-verified');
  assert.ok(stockArtEntry('Objects/InventoryItems/Rune/Rune.mdx'), '.mdx form resolves');
  assert.ok(stockArtEntry('ReplaceableTextures\\CommandButtons\\BTNCheese'), 'extension-less icon resolves');
  assert.strictEqual(stockArtEntry('Objects\\NoSuch\\Thing.mdl'), null);
});

test('every bundled-map stock art reference used by committed sources classifies as verified — except vaults\' known unknowns', () => {
  const ROOT = path.join(__dirname, '..');
  const maps = fs.readdirSync(path.join(ROOT, 'maps'))
    .filter((m) => fs.existsSync(path.join(ROOT, 'maps', m, 'info.json')));
  for (const m of maps) {
    const objectFiles = [];
    for (const f of fs.readdirSync(path.join(ROOT, 'maps', m)).filter((f) => /^objects-.*\.json$/.test(f))) {
      const objectType = /units/.test(f) ? 'units' : /items/.test(f) ? 'items'
        : /destructables/.test(f) ? 'destructables' : /doodads/.test(f) ? 'doodads' : null;
      if (!objectType) continue;
      objectFiles.push({ war: f, objectType, json: JSON.parse(fs.readFileSync(path.join(ROOT, 'maps', m, f), 'utf8')) });
    }
    // archive members: the imports/ tree (path under imports/ IS the
    // archive path) — assets imported at stock-like paths (generated
    // icons) are imports, not stock references
    const members = [];
    const importsDir = path.join(ROOT, 'maps', m, 'imports');
    (function walk(d, rel) {
      if (!fs.existsSync(d)) return;
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory()) walk(path.join(d, e.name), rel + e.name + '/');
        else members.push(rel + e.name);
      }
    })(importsDir, '');
    const refs = collectStockArtRefs(objectFiles, members);
    const unknown = refs.filter((r) => r.status === null || r.status === 'community-doc');
    if (m === 'vaults-of-ash') {
      assert.ok(unknown.length > 0, 'vaults\' pre-table stock icons are the known unknown set');
    } else {
      assert.deepStrictEqual([...new Set(unknown.map((r) => r.value))], [],
        `${m}: stock refs missing from lib/data/stock-art.json`);
    }
  }
});
