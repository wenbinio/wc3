'use strict';
// lib/objectlint.js rule (g) — imports provenance (lintImportsCredits):
// every file under a map source's imports/ must be covered by an
// imports-credits.json entry (exact path, or a directory-prefix key ending
// in '/'), and no entry may be stale. Community-fetched assets are only
// legal to ship with per-author credit (CLAUDE.md Legal, docs/ASSETS.md);
// the first consumer is maps/last-train's Hive Workshop models. The rule
// is WARN-only at both consumers (build-map warnings, preflight's
// imports-credits check) — provenance gaps never break the map for
// players, they break the Legal doctrine.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { lintImportsCredits } = require('../lib/objectlint');

const ROOT = path.join(__dirname, '..');

function tmpMap(setup) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'w3xcredits-'));
  setup(dir);
  return dir;
}

function write(dir, rel, content) {
  const p = path.join(dir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

test('no imports/ (or an empty one) is silent, credits file or not', () => {
  const bare = tmpMap(() => {});
  assert.deepStrictEqual(lintImportsCredits(bare), []);
  const empty = tmpMap((d) => fs.mkdirSync(path.join(d, 'imports')));
  assert.deepStrictEqual(lintImportsCredits(empty), []);
});

test('a non-empty imports/ with no credits file is a single WARN', () => {
  const dir = tmpMap((d) => write(d, 'imports/war3mapImported/Thing.mdx', 'x'));
  const w = lintImportsCredits(dir);
  assert.strictEqual(w.length, 1);
  assert.ok(/no imports-credits\.json/.test(w[0].message));
});

test('exact-path entries cover files; uncovered files WARN by name', () => {
  const dir = tmpMap((d) => {
    write(d, 'imports/war3mapImported/Credited.mdx', 'x');
    write(d, 'imports/war3mapImported/Orphan.mdx', 'x');
    write(d, 'imports-credits.json', JSON.stringify({
      entries: {
        'war3mapImported/Credited.mdx': { author: 'somebody', resource: 'r', source: 's', license: 'l', fetched: '2026-08-07' },
      },
    }));
  });
  const w = lintImportsCredits(dir);
  assert.strictEqual(w.length, 1);
  assert.strictEqual(w[0].file, 'war3mapImported/Orphan.mdx');
  assert.ok(/unknown provenance/.test(w[0].message));
});

test('a directory-prefix entry (ending in "/") covers a whole subtree', () => {
  const dir = tmpMap((d) => {
    write(d, 'imports/ReplaceableTextures/CommandButtons/BTNThing.blp', 'x');
    write(d, 'imports/ReplaceableTextures/CommandButtonsDisabled/DISBTNThing.blp', 'x');
    write(d, 'imports-credits.json', JSON.stringify({
      entries: {
        'ReplaceableTextures/': { author: 'generated', resource: 'icons', source: 'assets/gen.mjs', license: 'l', fetched: '2026-08-07' },
      },
    }));
  });
  assert.deepStrictEqual(lintImportsCredits(dir), []);
});

test('stale entries WARN: exact paths with no file, prefixes with no subtree', () => {
  const dir = tmpMap((d) => {
    write(d, 'imports/war3mapImported/Alive.mdx', 'x');
    write(d, 'imports-credits.json', JSON.stringify({
      entries: {
        'war3mapImported/Alive.mdx': { author: 'a' },
        'war3mapImported/Removed.mdx': { author: 'a' },
        'Sounds/': { author: 'a' },
      },
    }));
  });
  const w = lintImportsCredits(dir);
  assert.strictEqual(w.length, 2);
  assert.ok(w.every((f) => /stale imports-credits\.json entry/.test(f.message)));
  assert.deepStrictEqual(w.map((f) => f.file).sort(), ['Sounds/', 'war3mapImported/Removed.mdx']);
});

test('backslash-style keys normalize (archive-path dialect tolerated)', () => {
  const dir = tmpMap((d) => {
    write(d, 'imports/war3mapImported/Thing.mdx', 'x');
    write(d, 'imports-credits.json', JSON.stringify({
      entries: { 'war3mapImported\\Thing.mdx': { author: 'a' } },
    }));
  });
  assert.deepStrictEqual(lintImportsCredits(dir), []);
});

test('an unparseable credits file WARNs instead of crashing the lint', () => {
  const dir = tmpMap((d) => {
    write(d, 'imports/war3mapImported/Thing.mdx', 'x');
    write(d, 'imports-credits.json', '{ not json');
  });
  const w = lintImportsCredits(dir);
  assert.strictEqual(w.length, 1);
  assert.strictEqual(w[0].file, 'imports-credits.json');
  assert.ok(/unparseable/.test(w[0].message));
});

test('every bundled map source is provenance-clean (the fleet convention)', () => {
  const mapsDir = path.join(ROOT, 'maps');
  for (const name of fs.readdirSync(mapsDir)) {
    const dir = path.join(mapsDir, name);
    if (!fs.statSync(dir).isDirectory() || name === 'builds') continue;
    assert.deepStrictEqual(lintImportsCredits(dir), [], `${name} imports-credits lint`);
  }
});

test('last-train: the first consumer credits every community author on file', () => {
  const credits = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'maps', 'last-train', 'imports-credits.json'), 'utf8'));
  const authors = new Set(Object.values(credits.entries).map((e) => e.author));
  for (const needle of ['HerrDave', 'Ilya Alaric', 'bakr', 'Wayshan', 'Sol (GPT 5.6 Codex fleet)']) {
    assert.ok([...authors].some((a) => a.includes(needle)), `${needle} credited`);
  }
  for (const [file, e] of Object.entries(credits.entries)) {
    if (String(e.author).includes('generated')) continue;
    if (/commissioned/.test(String(e.license))) {
      // third provenance class (2026-08-07 Sol ambience batch):
      // externally-authored models commissioned for this project — no Hive
      // URL to carry, but author + delivery record + license are mandatory
      assert.ok(e.author && e.source, `${file}: commissioned entries name author + delivery`);
      assert.ok(e.license && e.fetched, `${file}: license note + delivery date`);
      continue;
    }
    assert.ok(/^https:\/\/www\.hiveworkshop\.com\//.test(e.source),
      `${file}: community entries carry their Hive source URL`);
    assert.ok(e.license && e.fetched, `${file}: license note + fetch date`);
  }
});
