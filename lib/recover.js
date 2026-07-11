'use strict';
// Archive member NAME RECOVERY for protected maps (stripped or fake
// listfiles). A protector can delete the name table, but the map still has
// to reference its own files to work — so the names survive inside the map's
// content. Harvest candidate path strings from everything already extracted
// (including the anonymous _unknown/ dump), hash-probe each candidate
// against the archive (exact-name MPQ lookup needs no listfile), extract
// hits under their real names, and repeat: each pass's recoveries (a .toc
// listing frame defs, an .mdx naming its textures, ...) feed the next
// harvest, until a fixpoint.
//
// Harvest sources:
//   - war3map.j / war3map.lua (also under scripts\): path-looking literals
//   - every wc3maptranslator-translatable file (object data art/model/icon
//     fields, war3map.imp import lists, sound paths, wts strings, ...):
//     translated to JSON via lib/filemap.js and scanned as text. NB: this
//     deliberately uses lib/filemap.js + wc3maptranslator directly, NOT
//     lib/source.js (recovery is read-only diagnostics on an extracted dir,
//     not source conversion). Classic-format files that throw fall back to
//     a raw byte scan (embedded ASCII paths are still harvestable).
//   - .toc files: every line is a frame-definition path
//   - .mdx files (chiefly anonymous ones under _unknown/): TEXS chunk
//     texture paths
//   - .txt/.fdf/.slk/.mdl text: generic path-literal scan
//   - derived variants of every candidate: .mdl<->.mdx swap, bare basename,
//     war3mapImported\ prefix, BTN<->DISBTN icon pairs under
//     ReplaceableTextures\CommandButtons[Disabled]\
//
// Candidates are untrusted strings — lib/mpq.js probeExtract sanitizes them
// (path traversal, absolute paths, control chars) before anything touches
// the filesystem, and only names verified on disk count as recovered.

const fs = require('fs');
const path = require('path');
const { probeExtract } = require('./mpq');
const { byWar, warToJson } = require('./filemap');
const { walk } = require('./source');

// Path-looking literal: separator-friendly charset ending in a known WC3
// asset/script extension. Kept in sync with what real maps reference.
const PATH_RE = /[A-Za-z0-9_\-\\/. !']+\.(?:mdx|mdl|blp|tga|dds|fdf|toc|wav|mp3|flac|txt|slk|ttf|otf|ai|wai|j|lua)\b/gi;

function harvestText(text, sink) {
  for (const m of text.matchAll(PATH_RE)) {
    let s = m[0].replace(/\//g, '\\');
    // Lua/JASS string literals escape '\' as '\\' — collapse runs
    while (s.includes('\\\\')) s = s.replaceAll('\\\\', '\\');
    s = s.replace(/^[^A-Za-z0-9_!']+/, '').trim();
    if (s.length >= 5) sink.add(s);
  }
}

// .toc: each nonempty line is a path (usually to an .fdf), often without
// anything PATH_RE would anchor on — take the raw lines too.
function harvestTocLines(text, sink) {
  for (const line of text.split(/\r?\n/)) {
    const s = line.trim().replace(/\//g, '\\');
    if (s.length >= 5 && /^[\w\-\\. ']+$/.test(s)) {
      sink.add(s);
      if (!/\.[A-Za-z0-9]{1,4}$/.test(s)) sink.add(s + '.fdf'); // extensionless toc entries
    }
  }
}

// MDX TEXS chunk: after the 4-byte 'MDLX' magic the file is a chunk stream
// of [tag u32][size u32][data]; TEXS data is 268-byte entries of
// { u32 replaceableId, char[260] fileName, u32 flags }.
function harvestMdxTexs(buf, sink) {
  if (buf.length < 8 || buf.toString('latin1', 0, 4) !== 'MDLX') return;
  let o = 4;
  while (o + 8 <= buf.length) {
    const tag = buf.toString('latin1', o, o + 4);
    const size = buf.readUInt32LE(o + 4);
    o += 8;
    if (size > buf.length - o) break; // truncated/corrupt chunk
    if (tag === 'TEXS') {
      for (let e = o; e + 268 <= o + size; e += 268) {
        const end = e + 4 + 260;
        let z = e + 4;
        while (z < end && buf[z] !== 0) z++;
        const name = buf.toString('latin1', e + 4, z).trim();
        if (name.length >= 5) sink.add(name.replace(/\//g, '\\'));
      }
    }
    o += size;
  }
}

// Derived spellings worth probing for one harvested candidate.
function expandVariants(name) {
  const out = new Set([name]);
  if (/\.mdx$/i.test(name)) out.add(name.replace(/\.mdx$/i, '.mdl'));
  else if (/\.mdl$/i.test(name)) out.add(name.replace(/\.mdl$/i, '.mdx'));
  // image formats are interchangeable at the reference site (a path spelled
  // .blp may be stored .tga/.dds and vice-versa)
  const img = name.match(/\.(blp|tga|dds)$/i);
  if (img) for (const e of ['blp', 'tga', 'dds']) if (e !== img[1].toLowerCase()) out.add(name.slice(0, -3) + e);
  const cut = name.lastIndexOf('\\');
  const dir = cut >= 0 ? name.slice(0, cut + 1) : '';
  const base = name.slice(dir.length);
  if (!base) return out;
  if (dir) out.add(base);
  out.add('war3mapImported\\' + base);
  if (/\.(blp|tga|dds)$/i.test(base)) {
    let btn = null;
    let dis = null;
    if (/^DISBTN/i.test(base)) { dis = base; btn = base.replace(/^DIS/i, ''); }
    else if (/^BTN/i.test(base)) { btn = base; dis = 'DIS' + base; }
    if (btn) for (const b of [dir + btn, 'ReplaceableTextures\\CommandButtons\\' + btn, 'war3mapImported\\' + btn]) out.add(b);
    if (dis) for (const d of [dir + dis, 'ReplaceableTextures\\CommandButtonsDisabled\\' + dis, 'war3mapImported\\' + dis]) out.add(d);
  }
  return out;
}

// Pure-binary media whose bytes never contain map-side path references worth
// harvesting (a raw scan would only turn up noise) — skipped from the raw
// byte scan. MDX is excluded here because it IS scanned, via its TEXS chunk.
const OPAQUE_MEDIA = new Set(['blp', 'tga', 'dds', 'wav', 'mp3', 'ogg', 'flac', 'png', 'jpg', 'jpeg']);

// Harvest one on-disk file (routing on extension / translator availability).
function harvestFile(absPath, rel, sink) {
  const base = path.basename(rel);
  const ext = base.includes('.') ? base.split('.').pop().toLowerCase() : '';
  if (ext === 'mdx') {
    harvestMdxTexs(fs.readFileSync(absPath), sink);
    return;
  }
  const entry = byWar.get(base);
  if (entry && !rel.startsWith('_unknown/')) {
    // Translator JSON surfaces path fields cleanly (object-data art/model/
    // icon fields, imports, sound paths, wts strings). Best effort — classic
    // formats throw; either way the raw byte scan below is a safety net that
    // also catches skin files (war3mapSkin.*, consumed as skins so absent
    // from byWar) and any field the translator doesn't stringify.
    try { harvestText(JSON.stringify(warToJson(entry, fs.readFileSync(absPath))), sink); } catch { /* classic/corrupt */ }
  }
  if (OPAQUE_MEDIA.has(ext)) return;
  // Raw latin1 scan: embedded ASCII path literals live directly in scripts,
  // object data (incl. skins), txt/fdf/slk, imp import lists, etc.
  const text = fs.readFileSync(absPath).toString('latin1');
  if (ext === 'toc') harvestTocLines(text, sink);
  harvestText(text, sink);
}

const NON_HARVEST = new Set(['_header.json', 'manifest.json']);
const nameKey = (n) => n.replace(/\//g, '\\').toUpperCase();

// Run the recovery loop against `archivePath`, reading harvest inputs from
// (and extracting recoveries into) `outDir` — an extraction dir as produced
// by w3x-extract, ideally with the _unknown/ dump present (anonymous MDX/TOC
// members are prime harvest material). Returns
//   { passes, candidates, probed, recovered: [relpaths], pruned }
// where `pruned` counts _unknown/ dump files deleted because a recovery
// turned out to be the same content under its real name.
function recoverNames(archivePath, outDir, opts) {
  opts = opts || {};
  const maxPasses = opts.maxPasses || 5;
  const stats = { passes: 0, candidates: 0, probed: 0, recovered: [], pruned: 0 };

  const tried = new Set(); // candidate nameKeys already probed (or on disk)
  let toScan = walk(outDir).filter((r) => !NON_HARVEST.has(r));
  for (const rel of toScan) if (!rel.startsWith('_unknown/')) tried.add(nameKey(rel));

  while (stats.passes < maxPasses && toScan.length > 0) {
    const sink = new Set();
    for (const rel of toScan) {
      try { harvestFile(path.join(outDir, rel), rel, sink); } catch { /* unreadable: skip */ }
    }
    const candidates = new Set();
    for (const cand of sink) for (const v of expandVariants(cand)) candidates.add(v);
    const fresh = [...candidates].filter((c) => !tried.has(nameKey(c)));
    for (const c of fresh) tried.add(nameKey(c));
    stats.candidates += fresh.length;
    if (fresh.length === 0) break;

    const { probed, recovered } = probeExtract(archivePath, outDir, fresh);
    stats.probed += probed;
    stats.recovered.push(...recovered);
    stats.passes++;
    if (recovered.length === 0) break;
    toScan = recovered; // next pass harvests only what this pass won
  }

  // A recovery under its real name supersedes its anonymous _unknown/ twin —
  // prune exact-content duplicates so the dump is only the true remainder.
  if (stats.recovered.length > 0) {
    const bySize = new Map();
    for (const rel of stats.recovered) {
      const p = path.join(outDir, rel);
      const size = fs.statSync(p).size;
      if (!bySize.has(size)) bySize.set(size, []);
      bySize.get(size).push(p);
    }
    for (const rel of walk(outDir).filter((r) => r.startsWith('_unknown/'))) {
      const p = path.join(outDir, rel);
      const buf = fs.readFileSync(p);
      if ((bySize.get(buf.length) || []).some((q) => fs.readFileSync(q).equals(buf))) {
        fs.rmSync(p, { force: true });
        stats.pruned++;
      }
    }
  }
  return stats;
}

module.exports = { recoverNames, harvestText, harvestTocLines, harvestMdxTexs, expandVariants };
