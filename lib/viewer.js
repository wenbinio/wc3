'use strict';
// Second-opinion parsing via mdx-m3-viewer-th. READ-ONLY DIAGNOSTICS ONLY.
//
// CRITICAL rules (violations are silent corruption or process death):
// - ALWAYS hand the viewer a fresh copy: `new Uint8Array(fs.readFileSync(p))`,
//   NEVER a Node Buffer. Its MPQ code decrypts/mutates the input in place —
//   a Buffer (a view over Node's shared pool) gets corrupted and misparses.
// - NEVER use the viewer's MPQ save/write path (War3Map.save / archive.set):
//   it has a known locale/platform field swap that emits broken archives.
//   Maps are always loaded with readonly=true here.
//
// The viewer covers formats wc3maptranslator@5 has no translator for
// (wpm/shd/mmp/wct/w3f) and parses classic (pre-Reforged) format versions,
// so it serves as: (a) a cross-validator in tools/validate-map.js and (b) a
// fallback READER in map-to-json for files wc3maptranslator rejects with a
// version error (output goes under _viewer/ — an alternate, read-only schema
// that is NOT the build-source dialect and cannot be fed back to build-map).

const War3Map = require('mdx-m3-viewer-th/dist/cjs/parsers/w3x/map.js').default;
const w3x = require('mdx-m3-viewer-th/dist/cjs/parsers/w3x/index.js').default;
const MdlxModel = require('mdx-m3-viewer-th/dist/cjs/parsers/mdlx/model.js').default;
const mdlxSanityTest = require('mdx-m3-viewer-th/dist/cjs/utils/mdlx/sanitytest/sanitytest.js').default;

// Open a whole .w3x/.mpq with the viewer's MPQ parser, readonly.
// `buffer` is a Node Buffer; a fresh Uint8Array copy is made here.
function openMapReadonly(buffer) {
  const map = new War3Map();
  map.load(new Uint8Array(buffer), true); // readonly: never use its save path
  return map;
}

// Archive member base name -> viewer parser. `ctx` carries values some
// parsers need: { buildVersion, shdWidth, shdHeight } (see contextFor).
const PARSERS = new Map([
  ['war3map.w3i', (u8) => load(new w3x.w3i.File(), u8)],
  ['war3map.w3e', (u8) => load(new w3x.w3e.File(), u8)],
  ['war3map.wpm', (u8) => load(new w3x.wpm.File(), u8)],
  ['war3map.mmp', (u8) => load(new w3x.mmp.File(), u8)],
  ['war3map.shd', (u8, ctx) => {
    if (!ctx.shdWidth || !ctx.shdHeight) throw new Error('war3map.shd needs terrain dimensions (war3map.w3e unparseable?)');
    const f = new w3x.shd.File();
    f.load(u8, ctx.shdWidth, ctx.shdHeight);
    if (f.shadows.length !== ctx.shdWidth * ctx.shdHeight * 16) {
      throw new Error(`shadow map is ${f.shadows.length} bytes, terrain implies ${ctx.shdWidth * ctx.shdHeight * 16}`);
    }
    return f;
  }],
  ['war3map.doo', (u8, ctx) => { const f = new w3x.doo.File(); f.load(u8, ctx.buildVersion); return f; }],
  ['war3mapUnits.doo', (u8, ctx) => { const f = new w3x.unitsdoo.File(); f.load(u8, ctx.buildVersion); return f; }],
  ['war3map.w3r', (u8) => load(new w3x.w3r.File(), u8)],
  // war3map.w3c is deliberately absent: for game version 1.32+ the viewer
  // reads the camera name BEFORE localPitch/localYaw/localRoll, while
  // wc3maptranslator and War3Net both write it AFTER them — the viewer
  // either throws on valid w3c or silently misparses it, so it is useless
  // as a second opinion for that file.
  ['war3map.w3s', (u8) => load(new w3x.w3s.File(), u8)],
  ['war3map.wts', (u8) => { const f = new w3x.wts.File(); f.load(Buffer.from(u8).toString('utf8')); return f; }],
  ['war3map.imp', (u8) => load(new w3x.imp.File(), u8)],
  ['war3map.wct', (u8) => load(new w3x.wct.File(), u8)],
  ['war3map.w3f', (u8) => load(new w3x.w3f.File(), u8)],
  // object data: w3u-family (units/items/destructables/buffs) vs
  // w3d-family (doodads/abilities/upgrades, which carry per-level data)
  ...['war3map.w3u', 'war3map.w3t', 'war3map.w3b', 'war3map.w3h',
    'war3mapSkin.w3u', 'war3mapSkin.w3t', 'war3mapSkin.w3b', 'war3mapSkin.w3h']
    .map((n) => [n, (u8) => load(new w3x.w3u.File(), u8)]),
  ...['war3map.w3d', 'war3map.w3a', 'war3map.w3q',
    'war3mapSkin.w3d', 'war3mapSkin.w3a', 'war3mapSkin.w3q']
    .map((n) => [n, (u8) => load(new w3x.w3d.File(), u8)]),
]);
// war3map.wtg is deliberately absent: its parser needs the game's
// TriggerData.txt, which is not shipped here.

function load(file, u8) { file.load(u8); return file; }

function hasParser(baseName) {
  return PARSERS.has(baseName);
}

// Derive the context values PARSERS need from sibling files in `readFile`,
// a (name) => Buffer|null accessor over the same archive/directory.
function contextFor(readFile) {
  const ctx = { buildVersion: 0, shdWidth: 0, shdHeight: 0 };
  try {
    const w3iBuf = readFile('war3map.w3i');
    if (w3iBuf) {
      const w3i = new w3x.w3i.File();
      w3i.load(new Uint8Array(w3iBuf));
      ctx.buildVersion = w3i.getBuildVersion(); // e.g. 132 for Reforged 1.32
    }
  } catch { /* classic/corrupt w3i: keep 0 => pre-1.31 parse paths */ }
  try {
    const w3eBuf = readFile('war3map.w3e');
    if (w3eBuf) {
      const w3e = new w3x.w3e.File();
      w3e.load(new Uint8Array(w3eBuf));
      // mapSize is in vertices; shd cells are (tiles*4) x (tiles*4)
      ctx.shdWidth = Math.max(0, w3e.mapSize[0] - 1);
      ctx.shdHeight = Math.max(0, w3e.mapSize[1] - 1);
    }
  } catch { /* no terrain: shd check will report it */ }
  return ctx;
}

// Parse one archive member with the viewer. Returns the parsed object or
// throws. `buffer` is a Node Buffer (copied to Uint8Array here).
function parseMember(baseName, buffer, ctx) {
  const parse = PARSERS.get(baseName);
  if (!parse) throw new Error(`no mdx-m3-viewer-th parser for ${baseName}`);
  return parse(new Uint8Array(buffer), ctx || { buildVersion: 0, shdWidth: 0, shdHeight: 0 });
}

// Run mdx-m3-viewer's MDX/MDL sanity test. `data` is a Node Buffer for .mdx
// or a string/Buffer for .mdl. Returns { errors, severe, warnings, unused }.
function sanityCheckModel(data, isMdl) {
  const model = new MdlxModel();
  // NB: fresh Uint8Array, never a Node Buffer (the parser slices .buffer)
  model.load(isMdl ? data.toString('utf8') : new Uint8Array(data));
  return mdlxSanityTest(model);
}

// JSON-serializable snapshot of a viewer parser object: typed arrays become
// plain arrays, BigInts become strings. For diagnostics output only.
function toPlainJson(value, depth) {
  depth = depth || 0;
  if (depth > 32) return '[max depth]';
  if (value === null || value === undefined) return value ?? null;
  const t = typeof value;
  if (t === 'bigint') return value.toString();
  if (t === 'number' || t === 'string' || t === 'boolean') return value;
  if (ArrayBuffer.isView(value)) return Array.from(value, (v) => (typeof v === 'bigint' ? v.toString() : v));
  if (Array.isArray(value)) return value.map((v) => toPlainJson(v, depth + 1));
  if (t === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === 'function') continue;
      out[k] = toPlainJson(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

module.exports = { openMapReadonly, hasParser, contextFor, parseMember, sanityCheckModel, toPlainJson };
