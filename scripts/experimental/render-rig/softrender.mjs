// Approach B: pure-node software render of an MDX — flat-shaded Lambert,
// painter's-algorithm depth sort, no textures. Cross-check for the browser rig:
// if a silhouette looks wrong in BOTH renderers, the geometry is wrong; if only
// in the browser, suspect the rig.
// Usage: node scripts/experimental/render-rig/softrender.mjs <group/file.mdx> <out.png> [azDeg] [elDeg]
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { createRequire } from 'module';
import { REPO, STAGE } from './env.mjs';

const requireRepo = createRequire(path.join(REPO, 'package.json'));
const { parseMDX } = requireRepo('war3-model');

const [rel, outPng, azArg, elArg] = process.argv.slice(2);
if (!rel || !outPng) {
  console.error('usage: node softrender.mjs <group/file.mdx> <out.png> [azDeg] [elDeg]');
  process.exit(1);
}
const file = path.isAbsolute(rel) ? rel : path.join(STAGE, rel);
const buf = fs.readFileSync(file);
const model = parseMDX(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

// collect triangles
const tris = [];
let min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
for (const g of model.Geosets || []) {
  const v = g.Vertices, f = g.Faces;
  for (let i = 0; i < v.length; i += 3) for (let k = 0; k < 3; k++) {
    min[k] = Math.min(min[k], v[i + k]); max[k] = Math.max(max[k], v[i + k]);
  }
  for (let i = 0; i < f.length; i += 3) {
    tris.push([
      [v[f[i] * 3], v[f[i] * 3 + 1], v[f[i] * 3 + 2]],
      [v[f[i + 1] * 3], v[f[i + 1] * 3 + 1], v[f[i + 1] * 3 + 2]],
      [v[f[i + 2] * 3], v[f[i + 2] * 3 + 1], v[f[i + 2] * 3 + 2]],
    ]);
  }
}
const cx = (min[0] + max[0]) / 2, cy = (min[1] + max[1]) / 2, cz = (min[2] + max[2]) / 2;
const r = Math.max(Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2, 1);

// camera (matches page.html defaults)
const az = (azArg === undefined ? 335 : +azArg) * Math.PI / 180;
const el = (elArg === undefined ? 22 : +elArg) * Math.PI / 180;
const d = r * 2.65;
const eye = [cx + d * Math.cos(el) * Math.cos(az), cy + d * Math.cos(el) * Math.sin(az), cz + d * Math.sin(el)];
// basis: forward, right, up
const norm = (a) => { const l = Math.hypot(...a); return a.map((x) => x / l); };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const fwd = norm(sub([cx, cy, cz], eye));
const right = norm(cross(fwd, [0, 0, 1]));
const up = cross(right, fwd);

const W = 800, H = 800;
const fov = Math.PI / 4.5, focal = (H / 2) / Math.tan(fov / 2);
function project(p) {
  const v = sub(p, eye);
  const z = dot(v, fwd);
  return [W / 2 + (dot(v, right) / z) * focal, H / 2 - (dot(v, up) / z) * focal, z];
}

const light = norm([-0.5, 0.4, 0.8]);
const img = new Float32Array(W * H * 3).fill(0.11);

// painter sort by mean camera-depth, far to near
const proj = tris.map((t) => {
  const p = t.map(project);
  const n = norm(cross(sub(t[1], t[0]), sub(t[2], t[0])));
  const lam = Math.abs(dot(n, light)); // two-sided
  const shade = 0.25 + 0.65 * lam;
  return { p, z: (p[0][2] + p[1][2] + p[2][2]) / 3, shade };
}).filter((t) => t.p.every((q) => q[2] > 0.01));
proj.sort((a, b) => b.z - a.z);

for (const { p, shade } of proj) {
  // rasterize
  const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]);
  const x0 = Math.max(0, Math.floor(Math.min(...xs))), x1 = Math.min(W - 1, Math.ceil(Math.max(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(H - 1, Math.ceil(Math.max(...ys)));
  const [ax, ay] = [xs[0], ys[0]], [bx, by] = [xs[1], ys[1]], [cx2, cy2] = [xs[2], ys[2]];
  const area = (bx - ax) * (cy2 - ay) - (by - ay) * (cx2 - ax);
  if (Math.abs(area) < 1e-9) continue;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const w0 = ((bx - ax) * (y - ay) - (by - ay) * (x - ax)) / area;
      const w1 = ((cx2 - bx) * (y - by) - (cy2 - by) * (x - bx)) / area;
      const w2 = ((ax - cx2) * (y - cy2) - (ay - cy2) * (x - cx2)) / area;
      if (w0 >= -1e-6 && w1 >= -1e-6 && w2 >= -1e-6) {
        const o = (y * W + x) * 3;
        img[o] = 0.75 * shade; img[o + 1] = 0.73 * shade; img[o + 2] = 0.70 * shade;
      }
    }
  }
}

// PNG encode (8-bit RGB, no filter)
function pngEncode(w, h, rgbFloat) {
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    const row = y * (1 + w * 3);
    raw[row] = 0;
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 3, q = row + 1 + x * 3;
      raw[q] = Math.min(255, rgbFloat[o] * 255) | 0;
      raw[q + 1] = Math.min(255, rgbFloat[o + 1] * 255) | 0;
      raw[q + 2] = Math.min(255, rgbFloat[o + 2] * 255) | 0;
    }
  }
  const chunks = [];
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32 ? zlib.crc32(td) : crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  function crc32(b) {
    let c = ~0;
    for (let i = 0; i < b.length; i++) { c ^= b[i]; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); }
    return ~c >>> 0;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  chunks.push(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  chunks.push(chunk('IHDR', ihdr));
  chunks.push(chunk('IDAT', zlib.deflateSync(raw)));
  chunks.push(chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(chunks);
}
fs.writeFileSync(outPng, pngEncode(W, H, img));
console.log('soft-rendered', rel, '->', outPng, `${tris.length} tris r=${r.toFixed(1)}`);
