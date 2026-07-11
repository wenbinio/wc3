'use strict';
// mdx-m3-viewer-th second-opinion tests:
//   (a) map-to-json's fallback READER: a classic (pre-Reforged) file that
//       wc3maptranslator rejects with a version error gets a read-only
//       viewer parse under _viewer/ (diagnostics schema, never repacked)
//   (b) lib/viewer.parseMember agrees with wc3maptranslator on the bundled
//       Reforged fixtures it has parsers for

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const viewer = require(path.join(ROOT, 'lib', 'viewer'));
const { extractedToSource } = require(path.join(ROOT, 'lib', 'source'));

const FIXTURES = path.join(ROOT, 'fixtures');
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'wc3-toolkit-viewer-test-'));

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

// Downgrade the Reforged v12 w3e fixture to a pre-classic v10 with the
// viewer's own parser (sub-v12 corners are 7 bytes vs 8 — a version-byte
// patch would not do): wc3maptranslator@5 must then refuse it with its
// version error. v10 deliberately: v11 is now handled by lib/codecs/w3e11
// and never reaches this fallback (see test/codecs.test.js) — the read-only
// _viewer/ path is for versions NO first-class reader supports.
function makeClassicW3e() {
  const w3eFile = require('mdx-m3-viewer-th/dist/cjs/parsers/w3x/w3e/file.js').default;
  const f = new w3eFile();
  f.load(new Uint8Array(fs.readFileSync(path.join(FIXTURES, 'war3map.w3e'))));
  f.version = 10;
  return Buffer.from(f.save());
}

test('(a) classic w3e: translator version error triggers the read-only _viewer/ fallback', () => {
  const classic = makeClassicW3e();
  const { TerrainTranslator } = require('wc3maptranslator');
  assert.throws(() => TerrainTranslator.warToJson(classic), /cannot currently parse this version/i,
    'precondition: wc3maptranslator rejects the classic file');

  const extractedDir = path.join(WORK, 'extracted');
  fs.mkdirSync(extractedDir, { recursive: true });
  fs.writeFileSync(path.join(extractedDir, 'war3map.w3e'), classic);
  const sourceDir = path.join(WORK, 'src');
  const manifest = extractedToSource(extractedDir, sourceDir);

  // raw copy is still the ground truth...
  assert.strictEqual(manifest.errors.length, 1);
  assert.match(manifest.errors[0].error, /cannot currently parse this version/i);
  assert.ok(fs.readFileSync(path.join(sourceDir, 'files', 'war3map.w3e')).equals(classic), 'raw copy under files/');
  // ...plus the viewer diagnostics under _viewer/
  assert.strictEqual(manifest.viewerFallback['war3map.w3e'], '_viewer/war3map.w3e.json');
  const diag = readJson(path.join(sourceDir, '_viewer', 'war3map.w3e.json'));
  assert.strictEqual(diag._schema, 'mdx-m3-viewer-th');
  assert.match(diag._readOnly, /NOT build-source/);
  assert.strictEqual(diag.data.version, 10, 'viewer parsed the classic version');
  assert.ok(Array.isArray(diag.data.corners) && diag.data.corners.length > 0, 'terrain corners present');
});

test('(b) viewer parses the Reforged fixtures it has parsers for (second opinion)', () => {
  const ctx = viewer.contextFor((name) => {
    const p = path.join(FIXTURES, name);
    return fs.existsSync(p) ? fs.readFileSync(p) : null;
  });
  assert.ok(ctx.buildVersion >= 131, `Reforged buildVersion from fixture w3i (got ${ctx.buildVersion})`);
  const parsed = [];
  for (const name of fs.readdirSync(FIXTURES)) {
    if (!viewer.hasParser(name)) continue;
    viewer.parseMember(name, fs.readFileSync(path.join(FIXTURES, name)), ctx); // throws on disagreement
    parsed.push(name);
  }
  assert.ok(parsed.length >= 12, `viewer second-opinion covers the fixture set (${parsed.length} parsed)`);
});

test.after(() => {
  fs.rmSync(WORK, { recursive: true, force: true });
});
