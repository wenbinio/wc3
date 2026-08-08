// map-server.mjs — tier-2 data server for the War3MapViewer oblique renders.
//
// Serves the mdx-m3-viewer-th UMD bundle, the map page, staged .w3x files,
// and — the actual work — SYNTHESIZED game data under /data/<war3path>:
//   - the 11 base SLK/TXT files War3MapViewer.loadBaseFiles demands, emitted
//     as INI text (MappedData accepts INI when the payload doesn't start
//     with 'ID;'; IniFile splits on CRLF — lines MUST be \r\n-joined);
//   - solid-fill TGAs for every texture (tile colors = tier-1 palette, so
//     the oblique and the top-down previews agree; TRUEVISION-XFILE footer
//     per the rig quirk);
//   - generated MDX for cliff pieces (sloped quads from the AAAB corner
//     tag — real cliff sculpts are Blizzard assets we never ship) and for
//     doodad stand-ins (tree/rock/prop boxes). A map's OWN imports load
//     from inside the archive via the viewer's map-first path solver, so
//     custom models render as their real geometry.
//
// Usage: node map-server.mjs   (MAP_RIG_PORT to move off 8932)
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = process.env.WC3_REPO || '/home/user/wc3';
const PORT = +(process.env.MAP_RIG_PORT || 8932);
const STAGE = path.join(HERE, 'stage-maps');
const requireRepo = createRequire(path.join(REPO, 'package.json'));
const { parseMDL, generateMDX } = requireRepo('war3-model');

const VIEWER = path.join(REPO, 'node_modules/mdx-m3-viewer-th/dist/umd/viewer.min.js');

// ---------------------------------------------------------------------------
// tile palette (same colors as preview-terrain.mjs tier 1)
const TILE_COLORS = {
  dirt: [114, 84, 55], drt: [114, 84, 55], dro: [126, 94, 60], drd: [88, 62, 42],
  drh: [122, 90, 58], drr: [125, 98, 70], dtr: [126, 94, 60], drg: [96, 104, 48],
  rok: [112, 112, 112], rck: [112, 112, 112], flr: [128, 116, 100],
  grs: [52, 110, 42], grd: [38, 88, 34], grr: [110, 120, 52], grt: [44, 96, 38],
  gsb: [60, 110, 45], hdg: [50, 95, 40], snw: [225, 230, 238], snr: [200, 205, 212],
  sng: [190, 205, 190], ice: [170, 205, 225], dki: [120, 160, 185],
  san: [205, 185, 130], dsr: [196, 168, 116], dsd: [160, 130, 88],
  sqd: [205, 185, 130], sqt: [130, 125, 120], dkt: [55, 50, 55],
  lvc: [60, 45, 45], lav: [180, 60, 20], vin: [70, 95, 45], lea: [70, 100, 45],
  lvd: [70, 100, 45], lvg: [70, 100, 45], pos: [90, 140, 60], crp: [150, 120, 60],
  cbp: [130, 125, 115], stp: [150, 145, 135], brk: [130, 105, 85],
  bks: [140, 120, 100], bkl: [150, 130, 110], smb: [120, 110, 100],
  lgb: [125, 115, 105], fst: [135, 125, 110], fsl: [150, 140, 125],
  blm: [45, 45, 50], wmb: [200, 200, 205], btl: [140, 110, 90],
  rtl: [155, 150, 140], til: [155, 150, 140], rds: [140, 80, 70],
  dkr: [70, 65, 60], bkb: [40, 40, 45], rbk: [90, 80, 110], tbk: [120, 110, 125],
  bsq: [50, 50, 55], aby: [25, 20, 35],
};
// WE default palettes (docs/FORMATS.md) -> every tile id we may be asked for
const DEFAULT_PALETTES = {
  A: 'Adrt Adrd Agrs Arck Agrd Avin Adrg Alvd', B: 'Bdrt Bdrh Bdrr Bdrg Bdsr Bdsd Bflr Bgrr',
  C: 'Cdrt Cdrd Cpos Crck Cvin Cgrs Clvg', D: 'Ddrt Dbrk Drds Dlvc Dlav Ddkr Dgrs Dsqd',
  F: 'Fdrt Fdro Fdrg Frok Fgrs Fgrd', G: 'Gdrt Gbrk Grds Glvc Glav Gdkr Ggrs Gsqd',
  I: 'Idrt Idtr Idki Ibkb Irbk Itbk Iice Ibsq Isnw', J: 'Jdrt Jdtr Jblm Jbtl Jsqd Jrtl Jgsb Jhdg Jwmb',
  K: 'Kdrt Kfsl Kdtr Kfst Ksmb Klgb Ksqt Kdkt', L: 'Ldrt Ldro Ldrg Lrok Lgrs Lgrd',
  N: 'Ndrt Ndrd Nrck Ngrs Nice Nsnw Nsnr', O: 'Odrt Odtr Osmb Ofst Olgb Orok Ofsl Oaby',
  Q: 'Qdrt Qdrr Qcrp Qcbp Qstp Qgrs Qrck Qgrt', V: 'Vdrt Vdrr Vcrp Vcbp Vstp Vgrs Vrck Vgrt',
  W: 'Wdrt Wdro Wsng Wrok Wgrs Wsnw', X: 'Xdrt Xdtr Xblm Xbtl Xsqd Xrtl Xgsb Xhdg Xwmb',
  Y: 'Ydrt Ydtr Yblm Ybtl Ysqd Yrtl Ygsb Yhdg Ywmb', Z: 'Zdrt Zdtr Zdrg Zbks Zsan Zbkl Ztil Zgrs Zvin',
};
const CLIFF_IDS = ('CAgr CAdi CBde CBgr CCgr CCdi CDdi CDsq CFdi CFgr CGdi CGsq CIsn CIrb ' +
  'CJdi CJsq CKdi CKdt CLdi CLgr CNdi CNsn COdi COrd CQdi CQgr CVdi CVgr CWgr CWsn ' +
  'CXdi CXsq CYdi CYsq CZdi CZlb ' +
  // indexed dialect (gotcha/FORMATS: CNc1/CNc2 game-verified) — all letters, indexes 1/2
  Object.keys(DEFAULT_PALETTES).map((l) => `C${l}c1 C${l}c2`).join(' ')).split(/\s+/);

function tileColor(id) {
  const c = TILE_COLORS[id.slice(1).toLowerCase()];
  return c || [110, 82, 54];
}

// ---------------------------------------------------------------------------
// scan staged map sources for every object id the viewer may look up
const SOURCES = [];
for (const m of ['demo', 'crossroads-siege', 'tidewatch-arena', 'northreach', 'vaults-of-ash', 'coinstead']) {
  SOURCES.push(path.join(REPO, 'maps', m));
}
SOURCES.push(path.join(HERE, 'snap/last-train')); // committed HEAD snapshot

const doodadIds = new Map(); // id -> class (tree/rock/prop)
const unitIds = new Set();
const KNOWN_ROCKS = new Set(['LTrc', 'ATrc', 'BTrc', 'KTrc', 'NTrc', 'YTrc', 'ZTrc']);
const classify = (t) => (KNOWN_ROCKS.has(t) || /^.Tr[ck]/.test(t)) ? 'rock' : (t[1] === 'T' ? 'tree' : 'prop');
for (const src of SOURCES) {
  const read = (f) => {
    try { return JSON.parse(fs.readFileSync(path.join(src, f), 'utf8')); } catch (e) { return null; }
  };
  const doo = read('doodads.json');
  if (doo) for (const d of doo.regular || []) doodadIds.set(d.type, classify(d.type));
  const units = read('units.json');
  if (units) for (const u of units) if (u.type !== 'sloc') unitIds.add(u.type);
  for (const f of ['objects-doodads.json', 'objects-destructables.json']) {
    const o = read(f);
    if (o) for (const table of ['original', 'custom']) {
      for (const k of Object.keys(o[table] || {})) {
        for (const id of k.split(':')) if (!doodadIds.has(id)) doodadIds.set(id, classify(id));
      }
    }
  }
  for (const f of ['objects-units.json', 'objects-items.json']) {
    const o = read(f);
    if (o) for (const table of ['original', 'custom']) {
      for (const k of Object.keys(o[table] || {})) for (const id of k.split(':')) unitIds.add(id);
    }
  }
}
console.log(`scanned: ${doodadIds.size} doodad/destructable ids, ${unitIds.size} unit/item ids`);

// ---------------------------------------------------------------------------
// INI base-file synthesis (CRLF!)
const CRLF = (lines) => lines.join('\r\n') + '\r\n';

function terrainIni() {
  const lines = ['// synthesized Terrain data (solid-color stand-ins)'];
  for (const [, pal] of Object.entries(DEFAULT_PALETTES)) {
    for (const id of pal.split(' ')) {
      lines.push(`[${id}]`, `tileID=${id}`, 'dir=TerrainArt\\Synth', `file=${id}`, 'comment=synth');
    }
  }
  return CRLF(lines);
}
function cliffIni() {
  const lines = ['// synthesized CliffTypes data'];
  for (const id of CLIFF_IDS) {
    lines.push(`[${id}]`, 'texDir=TerrainArt\\Synth', `texFile=${id}cliff`, 'cliffModelDir=Cliffs', `groundTile=${id[1]}drt`);
  }
  return CRLF(lines);
}
function waterIni() {
  const lines = ['// synthesized Water data'];
  for (const l of Object.keys(DEFAULT_PALETTES)) {
    // NOTE: water.frag multiplies texture * color — the water TEXTURE is
    // served near-white so these colors are what shows on screen.
    lines.push(`[${l}Sha]`, 'height=0', 'texRate=0', 'numTex=1', 'texFile=TerrainArt\\Synth\\Water',
      'Dmin_R=30', 'Dmin_G=90', 'Dmin_B=200', 'Dmin_A=215',
      'Dmax_R=15', 'Dmax_G=55', 'Dmax_B=160', 'Dmax_A=235',
      'Smin_R=70', 'Smin_G=150', 'Smin_B=230', 'Smin_A=160',
      'Smax_R=40', 'Smax_G=110', 'Smax_B=210', 'Smax_A=195');
  }
  return CRLF(lines);
}
function doodadsIni() {
  const lines = ['// synthesized Doodads/Destructables data'];
  for (const [id, cls] of doodadIds) {
    lines.push(`[${id}]`, `file=Synth\\${cls === 'tree' ? 'Tree' : cls === 'rock' ? 'Rock' : 'Prop'}`, 'numVar=1');
  }
  return CRLF(lines);
}
function doodadMetaIni() {
  return CRLF(['[dfil]', 'field=file', '[dvar]', 'field=numVar']);
}
function destructableMetaIni() {
  return CRLF(['[bfil]', 'field=file', '[bvar]', 'field=numVar']);
}
function unitsIni() {
  // rows exist so w3u/w3t clone-lookups succeed, but carry NO 'file' key:
  // loadUnitsAndItems then skips the unit cleanly (path stays undefined).
  const lines = ['// synthesized unit rows (no models on purpose)'];
  for (const id of unitIds) lines.push(`[${id}]`, 'comment=synth');
  return CRLF(lines);
}
const EMPTY_INI = CRLF(['// intentionally empty']);

// ---------------------------------------------------------------------------
// TGA + MDX synthesis
function solidTGA([r, g, b], a = 255) {
  const w = 4, h = 4;
  const footer = Buffer.concat([Buffer.alloc(8), Buffer.from('TRUEVISION-XFILE.\0', 'ascii')]);
  const buf = Buffer.alloc(18 + w * h * 4);
  buf[2] = 2; buf.writeUInt16LE(w, 12); buf.writeUInt16LE(h, 14);
  buf[16] = 32; buf[17] = 0x28;
  for (let i = 0; i < w * h; i++) {
    const o = 18 + i * 4;
    buf[o] = b; buf[o + 1] = g; buf[o + 2] = r; buf[o + 3] = a;
  }
  return Buffer.concat([buf, footer]);
}
function hashColor(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  h >>>= 0;
  const hue = h % 360, sat = 0.25, lit = 0.55 + ((h >>> 9) % 20) / 100;
  const c = (1 - Math.abs(2 * lit - 1)) * sat, x = c * (1 - Math.abs(((hue / 60) % 2) - 1)), m = lit - c / 2;
  let r, g, b;
  if (hue < 60) [r, g, b] = [c, x, 0]; else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x]; else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

// MDL text -> MDX (war3-model), minimal viewer-parsable model.
function meshMDL(name, verts, faces, texPath) {
  const min = [0, 1, 2].map((k) => Math.min(...verts.map((v) => v[k])));
  const max = [0, 1, 2].map((k) => Math.max(...verts.map((v) => v[k])));
  const radius = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2 || 1;
  const ext = (t) => `${t}MinimumExtent { ${min.join(', ')} },\n${t}MaximumExtent { ${max.join(', ')} },\n${t}BoundsRadius ${radius},`;
  const rows = (rs) => rs.map((r) => `\t\t{ ${r.join(', ')} },`).join('\n');
  const cx = (min[0] + max[0]) / 2, cy = (min[1] + max[1]) / 2, cz = (min[2] + max[2]) / 2;
  const normals = verts.map(([x, y, z]) => {
    const d = [x - cx, y - cy, z - cz]; const l = Math.hypot(...d) || 1;
    return d.map((v) => +(v / l).toFixed(4));
  });
  const tv = verts.map(([x, y]) => [+(((x - min[0]) / (max[0] - min[0] || 1))).toFixed(3), +(((y - min[1]) / (max[1] - min[1] || 1))).toFixed(3)]);
  const mdl = `Version {
\tFormatVersion 800,
}
Model "${name}" {
\tBlendTime 150,
${ext('\t')}
}
Sequences 2 {
\tAnim "Stand" {
\t\tInterval { 0, 1000 },
${ext('\t\t')}
\t}
\tAnim "Death" {
\t\tInterval { 1100, 2000 },
\t\tNonLooping,
${ext('\t\t')}
\t}
}
Textures 1 {
\tBitmap {
\t\tImage "${texPath}",
\t}
}
Materials 1 {
\tMaterial {
\t\tLayer {
\t\t\tFilterMode None,
\t\t\tUnshaded,
\t\t\tTwoSided,
\t\t\tstatic TextureID 0,
\t\t}
\t}
}
Geoset {
\tVertices ${verts.length} {
${rows(verts)}
\t}
\tNormals ${normals.length} {
${rows(normals)}
\t}
\tTVertices ${tv.length} {
${rows(tv)}
\t}
\tVertexGroup {
${verts.map(() => '\t\t0,').join('\n')}
\t}
\tFaces 1 ${faces.length * 3} {
\t\tTriangles {
\t\t\t{ ${faces.flat().join(', ')} },
\t\t}
\t}
\tGroups 1 1 {
\t\tMatrices { 0 },
\t}
${ext('\t')}
\tAnim {
${ext('\t\t')}
\t}
\tAnim {
${ext('\t\t')}
\t}
\tMaterialID 0,
\tSelectionGroup 0,
}
GeosetAnim {
\tAlpha 3 {
\t\tLinear,
\t\t0: 1,
\t\t1100: 1,
\t\t2000: 0,
\t}
\tGeosetId 0,
}
Bone "root" {
\tObjectId 0,
\tGeosetId 0,
\tGeosetAnimId 0,
}
Attachment "Origin Ref" {
\tObjectId 1,
\tAttachmentID 0,
}
PivotPoints 2 {
\t{ 0, 0, 0 },
\t{ 0, 0, 0 },
}
`;
  return Buffer.from(generateMDX(parseMDL(mdl)));
}

function boxMesh(x0, x1, y0, y1, z0, z1) {
  const verts = [
    [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
  ];
  const faces = [
    [0, 1, 2], [0, 2, 3], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4],
    [3, 2, 6], [3, 6, 7], [0, 3, 7], [0, 7, 4], [1, 2, 6], [1, 6, 5],
  ];
  return { verts, faces };
}

const mdxCache = new Map();
function stubMDX(kind) {
  if (mdxCache.has(kind)) return mdxCache.get(kind);
  let buf;
  if (kind === 'tree') {
    const m = boxMesh(-28, 28, -28, 28, 0, 190);
    buf = meshMDL('SynthTree', m.verts, m.faces, 'Synth\\TreeTex.blp');
  } else if (kind === 'rock') {
    const m = boxMesh(-40, 40, -40, 40, 0, 55);
    buf = meshMDL('SynthRock', m.verts, m.faces, 'Synth\\RockTex.blp');
  } else if (kind === 'sloc') {
    const m = boxMesh(-60, 60, -60, 60, 0, 24);
    buf = meshMDL('SynthStart', m.verts, m.faces, 'Synth\\StartTex.blp');
  } else {
    const m = boxMesh(-45, 45, -45, 45, 0, 110);
    buf = meshMDL('SynthProp', m.verts, m.faces, 'Synth\\PropTex.blp');
  }
  mdxCache.set(kind, buf);
  return buf;
}
// Cliff piece from its 4-letter corner tag (order BL,TL,TR,BR; A=base):
// a sloped quad spanning local x -128..0, y 0..128, z (letter-A)*128 —
// stands in for Blizzard's sculpted cliff meshes (never shipped).
function cliffMDX(tag) {
  const key = `cliff${tag}`;
  if (mdxCache.has(key)) return mdxCache.get(key);
  const z = [...tag].map((c) => (c.charCodeAt(0) - 65) * 128);
  const verts = [
    [-128, 0, z[0]],   // bottom left
    [-128, 128, z[1]], // top left
    [0, 128, z[2]],    // top right
    [0, 0, z[3]],      // bottom right
  ];
  const faces = [[0, 1, 2], [0, 2, 3], [2, 1, 0], [3, 2, 0]]; // both windings
  const buf = meshMDL(`Cliff${tag}`, verts, faces, 'Synth\\CliffTex.blp');
  mdxCache.set(key, buf);
  return buf;
}

// ---------------------------------------------------------------------------
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const send = (buf, type = 'application/octet-stream') => {
    res.writeHead(200, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*' });
    res.end(buf);
  };
  try {
    if (url === '/viewer.min.js') return send(fs.readFileSync(VIEWER), 'text/javascript');
    if (url === '/map-page.html') return send(fs.readFileSync(path.join(HERE, 'map-page.html')), 'text/html');
    if (url.startsWith('/maps/')) {
      const p = path.join(STAGE, url.slice('/maps/'.length));
      if (p.startsWith(STAGE) && fs.existsSync(p)) return send(fs.readFileSync(p));
      res.writeHead(404); return res.end('no map');
    }
    if (url.startsWith('/data/')) {
      const rel = url.slice('/data/'.length).replace(/\\/g, '/');
      const lower = rel.toLowerCase();
      const base = lower.split('/').pop();
      // --- base data files (all served as INI text) ---
      if (base === 'terrain.slk') return send(terrainIni(), 'text/plain');
      if (base === 'clifftypes.slk') return send(cliffIni(), 'text/plain');
      if (base === 'water.slk') return send(waterIni(), 'text/plain');
      if (base === 'doodads.slk' || base === 'destructabledata.slk') return send(doodadsIni(), 'text/plain');
      if (base === 'doodadmetadata.slk') return send(doodadMetaIni(), 'text/plain');
      if (base === 'destructablemetadata.slk') return send(destructableMetaIni(), 'text/plain');
      if (base === 'unitdata.slk' || base === 'unitui.slk' || base === 'itemdata.slk') return send(unitsIni(), 'text/plain');
      if (base === 'unitmetadata.slk') return send(EMPTY_INI, 'text/plain');
      if (base.endsWith('.slk') || base.endsWith('.txt')) return send(EMPTY_INI, 'text/plain');
      // --- models ---
      if (base.endsWith('.mdx')) {
        const cliffMatch = /^(?:cliffs|citycliffs)([a-c]{4})/.exec(base);
        if (cliffMatch) return send(cliffMDX(cliffMatch[1].toUpperCase()));
        if (base.includes('tree')) return send(stubMDX('tree'));
        if (base.includes('rock')) return send(stubMDX('rock'));
        if (base.includes('startlocation')) return send(stubMDX('sloc'));
        return send(stubMDX('prop'));
      }
      // --- textures (TGA bytes regardless of requested extension; the
      // viewer sniffs content, rig-proven) ---
      if (/\.(blp|dds|tga)$/.test(base)) {
        const m = /^([a-z][a-z0-9]{3})\.(blp|dds|tga)$/.exec(base);
        if (lower.includes('terrainart/synth')) {
          if (base.includes('cliff')) {
            const id = base.slice(0, 4);
            const c = tileColor(id[0] + 'drt'); // cliff face = tileset dirt, darker
            return send(solidTGA([c[0] * 0.75 | 0, c[1] * 0.75 | 0, c[2] * 0.75 | 0]));
          }
          if (base.includes('water')) return send(solidTGA([240, 246, 255], 255)); // near-white: frag = tex * SLK color
          if (m) return send(solidTGA(tileColor(m[1][0].toUpperCase() + m[1].slice(1))));
        }
        if (lower.includes('blight')) return send(solidTGA([86, 62, 74]));
        if (base.includes('treetex')) return send(solidTGA([30, 92, 30]));
        if (base.includes('rocktex')) return send(solidTGA([150, 150, 150]));
        if (base.includes('proptex')) return send(solidTGA([235, 140, 40]));
        if (base.includes('starttex')) return send(solidTGA([255, 235, 90]));
        if (base.includes('clifftex')) return send(solidTGA([120, 95, 70]));
        if (lower.includes('teamcolor')) return send(solidTGA([240, 240, 240]));
        if (lower.includes('teamglow')) return send(solidTGA([200, 200, 200]));
        return send(solidTGA(hashColor(lower)));
      }
      // anything else: empty text keeps loadGeneric happy
      return send(EMPTY_INI, 'text/plain');
    }
    res.writeHead(404); res.end('nope');
  } catch (e) {
    console.error('ERR', url, e.message);
    res.writeHead(500); res.end(String(e));
  }
});
server.listen(PORT, '127.0.0.1', () => console.log(`map rig on ${PORT} (stage: ${STAGE})`));
