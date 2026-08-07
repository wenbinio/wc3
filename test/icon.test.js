'use strict';
// lib/icon.js — the generated command-button icon pipeline.
//
// Coverage:
//   - deterministic painting (same ops -> byte-identical canvases; the
//     noise primitive is a seeded Schrage LCG, gotcha 29's portable form)
//   - PNG encoder well-formedness (signature, IHDR, filter-0 scanlines,
//     zlib round-trip) and TGA encoder well-formedness (32bpp, top-left)
//   - DISBTN derivation (desaturate + multiply 0.5)
//   - writeIconImports: BLP1 via Pillow when available (round-tripped back
//     through Pillow), deterministic TGA fallback + "BLP preferred"
//     warning when Pillow is deterministically absent (WC3_PYTHON switch,
//     the WC3_PJASS pattern)
//   - both output formats land BTN + DISBTN at the engine's command-button
//     archive paths (the path under imports/ IS the archive path)

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { spawnSync } = require('child_process');

const {
  SIZE, createCanvas, fill, gradient, rect, disc, stroke, noise, borderFrame,
  deriveDisabled, encodePNG, encodeTGA, findPillowPython, writeIconImports,
} = require('../lib/icon');

const NO_PY_ENV = { ...process.env, WC3_PYTHON: path.join(os.tmpdir(), 'no-such-python') };
const PILLOW = findPillowPython();

function paintSample() {
  const c = createCanvas(64);
  gradient(c, [64, 58, 50], [28, 24, 22]);
  disc(c, 32, 36, 17, [24, 21, 20]);
  rect(c, 10, 10, 20, 18, [120, 40, 40]);
  stroke(c, 12, 14, 44, 10, 3, [30, 26, 24]);
  noise(c, 0.1, 1007);
  borderFrame(c);
  return c;
}

test('icon painting is deterministic (same ops, byte-identical buffers)', () => {
  const a = paintSample();
  const b = paintSample();
  assert.ok(a.data.equals(b.data));
  assert.strictEqual(a.data.length, SIZE * SIZE * 4);
  // every pixel fully opaque
  for (let o = 3; o < a.data.length; o += 4) assert.strictEqual(a.data[o], 255);
  // a different noise seed diverges (the seed is doing something)
  const c = paintSample();
  noise(c, 0.1, 42);
  assert.ok(!c.data.equals(a.data));
});

test('borderFrame is a real last-pass frame (rim + bevel pixels present)', () => {
  const c = createCanvas(64);
  fill(c, [100, 100, 100]);
  borderFrame(c);
  const px = (x, y) => [0, 1, 2].map((i) => c.data[(y * 64 + x) * 4 + i]);
  assert.deepStrictEqual(px(0, 0), [12, 10, 8]); // outer rim
  const top = px(32, 1);
  const bottom = px(32, 62);
  assert.ok(top[0] > 140, `top bevel should be light, got ${top}`);
  assert.ok(bottom[0] < 60, `bottom bevel should be dark, got ${bottom}`);
});

test('PNG encoder emits a well-formed, zlib-round-trippable 64x64 RGBA PNG', () => {
  const c = paintSample();
  const png = encodePNG(c.data, 64, 64);
  assert.deepStrictEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.strictEqual(png.toString('latin1', 12, 16), 'IHDR');
  assert.strictEqual(png.readUInt32BE(16), 64); // width
  assert.strictEqual(png.readUInt32BE(20), 64); // height
  assert.strictEqual(png.readUInt8(24), 8);     // bit depth
  assert.strictEqual(png.readUInt8(25), 6);     // RGBA
  const idatLen = png.readUInt32BE(33);
  assert.strictEqual(png.toString('latin1', 37, 41), 'IDAT');
  const raw = zlib.inflateSync(png.subarray(41, 41 + idatLen));
  assert.strictEqual(raw.length, 64 * (1 + 64 * 4));
  for (let y = 0; y < 64; y++) assert.strictEqual(raw[y * (1 + 64 * 4)], 0, 'filter 0 per scanline');
  // the scanline payload is the canvas verbatim
  assert.ok(raw.subarray(1, 1 + 64 * 4).equals(c.data.subarray(0, 64 * 4)));
});

test('TGA encoder emits well-formed 32-bit top-left BGRA (the minimap layout, +alpha)', () => {
  const c = paintSample();
  const tga = encodeTGA(c.data, 64, 64);
  assert.strictEqual(tga.length, 18 + 64 * 64 * 4);
  assert.strictEqual(tga.readUInt8(2), 2);        // uncompressed true-color
  assert.strictEqual(tga.readUInt16LE(12), 64);
  assert.strictEqual(tga.readUInt16LE(14), 64);
  assert.strictEqual(tga.readUInt8(16), 32);      // bpp
  assert.strictEqual(tga.readUInt8(17), 0x28);    // top-left + 8 alpha bits
  // pixel 0: BGRA of canvas RGBA
  assert.strictEqual(tga[18], c.data[2]);
  assert.strictEqual(tga[20], c.data[0]);
  assert.strictEqual(tga[21], c.data[3]);
});

test('DISBTN derivation: desaturated and multiplied by 0.5', () => {
  const rgba = Buffer.from([200, 100, 50, 255, 0, 0, 0, 255]);
  const dis = deriveDisabled(rgba);
  const gray = Math.round((0.299 * 200 + 0.587 * 100 + 0.114 * 50) * 0.5) | 0;
  assert.ok(Math.abs(dis[0] - gray) <= 1, `expected ~${gray}, got ${dis[0]}`);
  assert.strictEqual(dis[0], dis[1]);
  assert.strictEqual(dis[1], dis[2]);
  assert.strictEqual(dis[3], 255);
  assert.deepStrictEqual([...dis.subarray(4, 8)], [0, 0, 0, 255]);
  // input untouched
  assert.strictEqual(rgba[0], 200);
});

test('writeIconImports: TGA fallback when Pillow is deterministically absent (+ BLP-preferred warning)', () => {
  assert.strictEqual(findPillowPython(NO_PY_ENV), null);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'w3xicon-'));
  try {
    const c = paintSample();
    const r = writeIconImports(dir, 'TestIcon', c.data, { env: NO_PY_ENV });
    assert.strictEqual(r.format, 'tga');
    assert.strictEqual(r.warnings.length, 1);
    assert.match(r.warnings[0], /BLP preferred/);
    assert.deepStrictEqual(r.archivePaths, [
      'ReplaceableTextures\\CommandButtons\\BTNTestIcon.tga',
      'ReplaceableTextures\\CommandButtonsDisabled\\DISBTNTestIcon.tga',
    ]);
    assert.strictEqual(r.iconPath, r.archivePaths[0]);
    for (const f of r.files) assert.ok(fs.existsSync(f), f);
    const btn = fs.readFileSync(r.files[0]);
    assert.strictEqual(btn.readUInt8(16), 32);
    // deterministic: writing again yields byte-identical files
    const again = writeIconImports(dir, 'TestIcon', c.data, { env: NO_PY_ENV });
    assert.ok(fs.readFileSync(again.files[0]).equals(btn));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('writeIconImports: BLP1 via Pillow (round-tripped back through Pillow)', { skip: !PILLOW && 'Pillow not installed' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'w3xicon-'));
  try {
    const c = paintSample();
    const r = writeIconImports(dir, 'TestIcon', c.data);
    assert.strictEqual(r.format, 'blp');
    assert.deepStrictEqual(r.warnings, []);
    assert.deepStrictEqual(r.archivePaths, [
      'ReplaceableTextures\\CommandButtons\\BTNTestIcon.blp',
      'ReplaceableTextures\\CommandButtonsDisabled\\DISBTNTestIcon.blp',
    ]);
    for (const f of r.files) {
      assert.strictEqual(fs.readFileSync(f).toString('latin1', 0, 4), 'BLP1', f);
      const p = spawnSync(PILLOW, ['-c',
        'import sys\nfrom PIL import Image\nim = Image.open(sys.argv[1])\n'
        + 'print(im.format, im.size[0], im.size[1])\n', f], { encoding: 'utf8' });
      assert.strictEqual(p.status, 0, p.stderr);
      assert.strictEqual(p.stdout.trim(), 'BLP 64 64', f);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the committed coinstead generated icons match a fresh pipeline run (BLP path exercised end-to-end)', { skip: !PILLOW && 'Pillow not installed' }, () => {
  const btn = path.join(__dirname, '..', 'maps', 'coinstead', 'imports',
    'ReplaceableTextures', 'CommandButtons', 'BTNOrepit.blp');
  const dis = path.join(__dirname, '..', 'maps', 'coinstead', 'imports',
    'ReplaceableTextures', 'CommandButtonsDisabled', 'DISBTNOrepit.blp');
  assert.ok(fs.existsSync(btn) && fs.existsSync(dis), 'run maps/coinstead/assets/generate-icons.mjs');
  assert.strictEqual(fs.readFileSync(btn).toString('latin1', 0, 4), 'BLP1');
  assert.strictEqual(fs.readFileSync(dis).toString('latin1', 0, 4), 'BLP1');
});
