// Tiny static server for the model-preview rig (see README.md).
// - /viewer.min.js            -> mdx-m3-viewer-th UMD bundle (from repo node_modules, read-only)
// - /page.html                -> the in-browser render page (served from this directory)
// - /models/<group>/<file>    -> staged MDX (from <work>/stage/, see stage-fleet.mjs)
// - /tex/<war3 path>          -> local texture pool (case-insensitive), else synthesized solid TGA
//
// Usage: node scripts/experimental/render-rig/server.mjs   (RENDER_RIG_PORT to move off 8931)
import http from 'http';
import fs from 'fs';
import path from 'path';
import { RIG_SRC, REPO, STAGE, PORT } from './env.mjs';

const VIEWER = path.join(REPO, 'node_modules/mdx-m3-viewer-th/dist/umd/viewer.min.js');

// case-insensitive index of the local texture pool (real BLPs/TGAs staged from imports/)
const texDir = path.join(STAGE, 'tex');
fs.mkdirSync(texDir, { recursive: true });
const texIndex = new Map();
for (const f of fs.readdirSync(texDir)) texIndex.set(f.toLowerCase(), path.join(texDir, f));

function hashColor(s) {
  // deterministic muted color per path so different materials separate visually
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  h >>>= 0;
  const hue = h % 360, sat = 0.25, lit = 0.55 + ((h >>> 9) % 20) / 100; // 0.55-0.74
  // hsl -> rgb
  const c = (1 - Math.abs(2 * lit - 1)) * sat, x = c * (1 - Math.abs(((hue / 60) % 2) - 1)), m = lit - c / 2;
  let r, g, b;
  if (hue < 60) [r, g, b] = [c, x, 0]; else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x]; else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function solidTGA([r, g, b], a = 255) {
  const w = 4, h = 4;
  // RIG QUIRK: the viewer's isTga sniffer requires the TRUEVISION-XFILE v2 footer —
  // a bare TGA header is rejected, so every synthesized TGA carries the footer.
  const footer = Buffer.concat([Buffer.alloc(8), Buffer.from('TRUEVISION-XFILE.\0', 'ascii')]);
  const buf = Buffer.alloc(18 + w * h * 4);
  buf[2] = 2; // uncompressed truecolor
  buf.writeUInt16LE(w, 12); buf.writeUInt16LE(h, 14);
  buf[16] = 32; buf[17] = 0x28; // 32bpp, top-left origin, 8 alpha bits
  for (let i = 0; i < w * h; i++) {
    const o = 18 + i * 4;
    buf[o] = b; buf[o + 1] = g; buf[o + 2] = r; buf[o + 3] = a; // BGRA
  }
  return Buffer.concat([buf, footer]);
}

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const send = (buf, type = 'application/octet-stream') => {
    res.writeHead(200, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*' });
    res.end(buf);
  };
  try {
    if (url === '/viewer.min.js') return send(fs.readFileSync(VIEWER), 'text/javascript');
    if (url === '/page.html') return send(fs.readFileSync(path.join(RIG_SRC, 'page.html')), 'text/html');
    if (url.startsWith('/models/')) {
      const p = path.join(STAGE, url.slice('/models/'.length));
      if (p.startsWith(STAGE) && fs.existsSync(p)) return send(fs.readFileSync(p));
      res.writeHead(404); return res.end('no model');
    }
    if (url.startsWith('/tex/')) {
      const rel = url.slice('/tex/'.length).replace(/\\/g, '/');
      const base = rel.split('/').pop().toLowerCase();
      const lower = rel.toLowerCase();
      // local pool by basename
      if (texIndex.has(base)) return send(fs.readFileSync(texIndex.get(base)));
      // ReplaceableId 1/2 (team color/glow): near-white fill so authored geoset
      // tints read as the art (in-game these multiply by the player's color)
      if (lower.includes('teamcolor')) return send(solidTGA([240, 240, 240]));
      if (lower.includes('teamglow')) return send(solidTGA([200, 200, 200]));
      // everything else (stock game textures we cannot ship): deterministic muted solid
      return send(solidTGA(hashColor(lower)));
    }
    res.writeHead(404); res.end('nope');
  } catch (e) {
    res.writeHead(500); res.end(String(e));
  }
});
server.listen(PORT, '127.0.0.1', () => console.log(`render rig on ${PORT} (stage: ${STAGE})`));
