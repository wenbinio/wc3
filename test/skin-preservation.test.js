'use strict';
// Regression fixtures establish byte preservation, not validity in Warcraft.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { extractedToSource, sourceToExtracted } = require('../lib/source');
const { byWar } = require('../lib/filemap');
const paired = [...byWar.values()].filter(entry => entry.skinWar);

function dirs(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wc3-skin-preserve-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const extracted = path.join(root, 'extracted'), source = path.join(root, 'source'), rebuilt = path.join(root, 'rebuilt');
  fs.mkdirSync(extracted);
  return { extracted, source, rebuilt };
}

test('orphan skin companions survive source conversion and rebuilding byte-for-byte', t => {
  assert.ok(paired.length > 0, 'exercise the actual registered companion set');
  for (const entry of paired) {
    const d = dirs(t);
    const bytes = Buffer.from('opaque companion regression input');
    fs.writeFileSync(path.join(d.extracted, entry.skinWar), bytes);
    const manifest = extractedToSource(d.extracted, d.source);
    assert.ok(manifest.copied.includes(entry.skinWar), entry.skinWar);
    assert.ok(manifest.errors.some(e => e.file === entry.skinWar && /preserved/.test(e.note)), entry.skinWar);
    sourceToExtracted(d.source, d.rebuilt);
    assert.deepEqual(fs.readFileSync(path.join(d.rebuilt, entry.skinWar)), bytes);
  }
});

test('failed parent conversion preserves both parent and companion', t => {
  for (const entry of paired) {
    const d = dirs(t), parent = Buffer.from([1, 0]), skin = Buffer.from('opaque companion');
    fs.writeFileSync(path.join(d.extracted, entry.war), parent);
    fs.writeFileSync(path.join(d.extracted, entry.skinWar), skin);
    const manifest = extractedToSource(d.extracted, d.source);
    assert.ok(manifest.copied.includes(entry.war), entry.war);
    assert.ok(manifest.copied.includes(entry.skinWar), entry.skinWar);
    sourceToExtracted(d.source, d.rebuilt);
    assert.deepEqual(fs.readFileSync(path.join(d.rebuilt, entry.war)), parent);
    assert.deepEqual(fs.readFileSync(path.join(d.rebuilt, entry.skinWar)), skin);
  }
});

test('successfully merged companions do not become stale opaque overrides', t => {
  for (const entry of paired) {
    const d = dirs(t);
    // Version 3, empty original/custom object tables: codec-level fixture.
    const bytes = Buffer.alloc(12); bytes.writeUInt32LE(3, 0);
    fs.writeFileSync(path.join(d.extracted, entry.war), bytes);
    fs.writeFileSync(path.join(d.extracted, entry.skinWar), bytes);
    const manifest = extractedToSource(d.extracted, d.source);
    assert.equal(manifest.translated[entry.war], entry.json, entry.war);
    assert.equal(manifest.copied.includes(entry.skinWar), false, entry.skinWar);
    assert.equal(fs.existsSync(path.join(d.source, 'files', entry.skinWar)), false);
  }
});
