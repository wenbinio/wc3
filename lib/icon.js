'use strict';
// lib/icon.js — generated 64x64 command-button icons, pure Node.
//
// Pipeline (docs/ASSETS.md "Generated icons"):
//   1. paint a 64x64 RGBA canvas with the primitives below (fill/gradient/
//      disc/rect/stroke/noise) — all deterministic (noise is a seeded
//      Park-Miller/Schrage LCG, gotcha 29's portable form);
//   2. bake the beveled BORDER FRAME as the LAST pass (community-documented:
//      the game does NOT composite button borders onto icon textures — a
//      borderless BTN looks flat/wrong next to stock buttons in-game);
//   3. encode: PNG intermediate (minimal encoder over built-in zlib) ->
//      BLP1 via Pillow (docs/ASSETS.md: blp_version="BLP1" is REQUIRED,
//      Pillow's default BLP2 is a WoW format WC3 does not read). Pillow
//      absent -> 32-bit uncompressed TGA (the game reads TGA in texture
//      slots; lib/minimap.js precedent) + a "BLP preferred" warning;
//   4. auto-derive the DISBTN twin (desaturate + multiply ~0.5 — the
//      engine shows DISBTN for disabled/unavailable buttons and falls back
//      to a green checkerboard when it is missing; lint rule (f)).
//
// Import paths (writeIconImports): the path under imports/ IS the archive
// path, so icons land at
//   ReplaceableTextures\CommandButtons\BTN<Name>.blp        (enabled)
//   ReplaceableTextures\CommandButtonsDisabled\DISBTN<Name>.blp
// and object-data uico/iico reference the SAME path with the extension
// actually imported (textures get NO extension swap in-game — unlike
// models, gotcha 22 does not apply to icons).
//
// Python/Pillow discovery follows the WC3_PJASS pattern (lib/jasscheck.js):
// WC3_PYTHON is authoritative when set — an unusable value means "treat as
// not installed", no PATH fallback; unset falls back to `python3` on PATH.

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { spawnSync } = require('child_process');

const SIZE = 64;

// --- canvas + primitives ----------------------------------------------------

function createCanvas(size) {
  size = size || SIZE;
  return { size, data: Buffer.alloc(size * size * 4) };
}

const clamp8 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

function setPx(c, x, y, rgb, alpha) {
  if (x < 0 || y < 0 || x >= c.size || y >= c.size) return;
  const o = (y * c.size + x) * 4;
  const a = alpha === undefined ? 1 : alpha;
  c.data[o] = clamp8(rgb[0] * a + c.data[o] * (1 - a));
  c.data[o + 1] = clamp8(rgb[1] * a + c.data[o + 1] * (1 - a));
  c.data[o + 2] = clamp8(rgb[2] * a + c.data[o + 2] * (1 - a));
  c.data[o + 3] = 255;
}

function fill(c, rgb) {
  for (let y = 0; y < c.size; y++) for (let x = 0; x < c.size; x++) setPx(c, x, y, rgb);
}

// vertical linear gradient, top color -> bottom color
function gradient(c, top, bottom) {
  for (let y = 0; y < c.size; y++) {
    const t = y / (c.size - 1);
    const rgb = [0, 1, 2].map((i) => top[i] + (bottom[i] - top[i]) * t);
    for (let x = 0; x < c.size; x++) setPx(c, x, y, rgb);
  }
}

// filled axis-aligned rectangle, inclusive coords
function rect(c, x0, y0, x1, y1, rgb, alpha) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) setPx(c, x, y, rgb, alpha);
}

// filled disc (anti-aliasing-free, deliberately chunky at 64px)
function disc(c, cx, cy, r, rgb, alpha) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= r * r) setPx(c, x, y, rgb, alpha);
    }
  }
}

// thick line from (x0,y0) to (x1,y1)
function stroke(c, x0, y0, x1, y1, thickness, rgb, alpha) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1) * 2;
  const r = thickness / 2;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    disc(c, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r, rgb, alpha);
  }
}

// deterministic per-pixel brightness noise — Park-Miller via Schrage
// (gotcha 29: every intermediate < 2^31, portable everywhere)
function noise(c, amount, seed) {
  let state = ((seed || 1) % 2147483646) + 1;
  const next = () => {
    const hi = Math.floor(state / 127773);
    const lo = state % 127773;
    state = 16807 * lo - 2836 * hi;
    if (state <= 0) state += 2147483647;
    return state / 2147483647;
  };
  for (let y = 0; y < c.size; y++) {
    for (let x = 0; x < c.size; x++) {
      const o = (y * c.size + x) * 4;
      const f = 1 + (next() * 2 - 1) * amount;
      c.data[o] = clamp8(c.data[o] * f);
      c.data[o + 1] = clamp8(c.data[o + 1] * f);
      c.data[o + 2] = clamp8(c.data[o + 2] * f);
    }
  }
}

// The baked beveled border frame — ALWAYS the last pass. 3px frame:
// light top/left bevel, dark bottom/right, near-black outermost rim.
function borderFrame(c) {
  const n = c.size;
  const rim = [12, 10, 8];
  for (let i = 0; i < n; i++) {
    setPx(c, i, 0, rim); setPx(c, i, n - 1, rim);
    setPx(c, 0, i, rim); setPx(c, n - 1, i, rim);
  }
  for (let d = 1; d <= 2; d++) {
    const lightA = d === 1 ? 0.85 : 0.45;
    for (let i = d; i < n - d; i++) {
      setPx(c, i, d, [190, 175, 140], lightA);      // top bevel
      setPx(c, d, i, [170, 155, 120], lightA);      // left bevel
      setPx(c, i, n - 1 - d, [30, 24, 18], lightA); // bottom shadow
      setPx(c, n - 1 - d, i, [40, 32, 24], lightA); // right shadow
    }
  }
}

// --- DISBTN derivation ------------------------------------------------------

// desaturate + multiply ~0.5 — the community-standard disabled look
function deriveDisabled(rgba) {
  const out = Buffer.from(rgba);
  for (let o = 0; o < out.length; o += 4) {
    const gray = 0.299 * out[o] + 0.587 * out[o + 1] + 0.114 * out[o + 2];
    const v = clamp8(gray * 0.5);
    out[o] = v; out[o + 1] = v; out[o + 2] = v;
  }
  return out;
}

// --- encoders ---------------------------------------------------------------

const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// minimal PNG: 8-bit RGBA, filter 0 on every scanline, one IDAT
function encodePNG(rgba, w, h) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.writeUInt8(8, 8);  // bit depth
  ihdr.writeUInt8(6, 9);  // color type: RGBA
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0; // filter: none
    rgba.copy(raw, y * (1 + w * 4) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// 32-bit uncompressed BGRA TGA, top-left origin (lib/minimap.js precedent
// writes the 24-bit form of the same layout)
function encodeTGA(rgba, w, h) {
  const header = Buffer.alloc(18);
  header.writeUInt8(2, 2);        // uncompressed true-color
  header.writeUInt16LE(w, 12);
  header.writeUInt16LE(h, 14);
  header.writeUInt8(32, 16);      // bits per pixel
  header.writeUInt8(0x28, 17);    // top-left origin + 8 alpha bits
  const px = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    px[i * 4] = rgba[i * 4 + 2];     // B
    px[i * 4 + 1] = rgba[i * 4 + 1]; // G
    px[i * 4 + 2] = rgba[i * 4];     // R
    px[i * 4 + 3] = rgba[i * 4 + 3]; // A
  }
  return Buffer.concat([header, px]);
}

// --- Pillow (PNG -> BLP1) ---------------------------------------------------

function isExecutable(p) {
  try {
    fs.accessSync(p, fs.constants.X_OK);
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

// WC3_PYTHON authoritative when set (unusable value = not installed, no
// PATH fallback — the deterministic-absence switch); else python3 on PATH.
// Returns the interpreter path only when Pillow actually imports.
function findPillowPython(env) {
  env = env || process.env;
  let cand = null;
  if (env.WC3_PYTHON !== undefined && env.WC3_PYTHON !== '') {
    if (!isExecutable(env.WC3_PYTHON)) return null;
    cand = env.WC3_PYTHON;
  } else {
    for (const dir of String(env.PATH || '').split(path.delimiter)) {
      if (!dir) continue;
      const p = path.join(dir, 'python3');
      if (isExecutable(p)) { cand = p; break; }
    }
  }
  if (!cand) return null;
  const r = spawnSync(cand, ['-c', 'import PIL.Image'], { encoding: 'utf8' });
  return r.status === 0 ? cand : null;
}

// PNG buffer -> BLP1 buffer via Pillow (docs/ASSETS.md: blp_version="BLP1"
// REQUIRED — the default BLP2 is a WoW format WC3 does not read). Pillow's
// BLP encoder (verified on 12.3.0) accepts mode "P" ONLY ("Unsupported BLP
// image mode" for RGB), so the icon is quantized to a 256-color adaptive
// palette — the classic paletted-BLP1 form the game reads natively. BTN
// icons are opaque; no alpha needed.
function pngToBlp1(pngBuf, python) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'w3xblp-'));
  try {
    const inPath = path.join(tmp, 'icon.png');
    const outPath = path.join(tmp, 'icon.blp');
    fs.writeFileSync(inPath, pngBuf);
    const r = spawnSync(python, ['-c',
      'import sys\nfrom PIL import Image\n'
      + 'im = Image.open(sys.argv[1]).convert("RGB")\n'
      + 'im = im.convert("P", palette=Image.ADAPTIVE, colors=256)\n'
      + 'im.save(sys.argv[2], blp_version="BLP1")\n',
      inPath, outPath], { encoding: 'utf8' });
    if (r.status !== 0) {
      throw new Error('Pillow PNG->BLP1 failed: ' + String(r.stderr || '').trim().split('\n')[0]);
    }
    const blp = fs.readFileSync(outPath);
    if (blp.toString('latin1', 0, 4) !== 'BLP1') {
      throw new Error('Pillow produced ' + JSON.stringify(blp.toString('latin1', 0, 4)) + ', expected BLP1');
    }
    return blp;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// --- the per-map entry point ------------------------------------------------

// Write BTN<name> + auto-derived DISBTN<name> into a map source's imports/
// tree at the engine's command-button paths. rgba must be a SIZE*SIZE*4
// buffer that already went through borderFrame().
// opts: { env } (findPillowPython switch, tests force absence).
// Returns { format: 'blp'|'tga', files: [absolute paths], archivePaths:
// [backslash archive paths], iconPath: the uico/iico value to reference,
// warnings: [] }.
function writeIconImports(mapDir, name, rgba, opts) {
  opts = opts || {};
  const size = Math.round(Math.sqrt(rgba.length / 4));
  const warnings = [];
  const python = findPillowPython(opts.env);
  const format = python ? 'blp' : 'tga';
  if (!python) {
    warnings.push(`Pillow not available — ${name} written as 32-bit TGA (BLP preferred; `
      + 'install Pillow or set WC3_PYTHON, docs/ASSETS.md)');
  }
  const encode = (buf) => (python
    ? pngToBlp1(encodePNG(buf, size, size), python)
    : encodeTGA(buf, size, size));
  const ext = '.' + format;
  const rel = [
    path.join('ReplaceableTextures', 'CommandButtons', 'BTN' + name + ext),
    path.join('ReplaceableTextures', 'CommandButtonsDisabled', 'DISBTN' + name + ext),
  ];
  const bufs = [encode(rgba), encode(deriveDisabled(rgba))];
  const files = [];
  for (let i = 0; i < rel.length; i++) {
    const abs = path.join(mapDir, 'imports', rel[i]);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, bufs[i]);
    files.push(abs);
  }
  const archivePaths = rel.map((r) => r.split(path.sep).join('\\'));
  return { format, files, archivePaths, iconPath: archivePaths[0], warnings };
}

module.exports = {
  SIZE,
  createCanvas, fill, gradient, rect, disc, stroke, noise, borderFrame,
  deriveDisabled, encodePNG, encodeTGA,
  findPillowPython, pngToBlp1, writeIconImports,
};
