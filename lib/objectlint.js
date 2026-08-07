'use strict';
// Semantic lint of translated object data — WARNINGS only, never failures.
// Each rule encodes an in-game playtest lesson (CLAUDE.md gotchas 22/23/25/31);
// they are heuristics about game SEMANTICS, not format validity, so
// validate-map prints them as WARN lines and still exits 0.
//
//  a) gotcha 22 — object-data model fields (umdl/dfil/bfil/ifil) must use
//     the `.mdl` extension (the engine swaps to `.mdx` at load; a literal
//     `.mdx` value renders an invisible unit). Additionally, a
//     `war3mapImported\` model reference must resolve to an actual archive
//     member after `.mdl` <-> `.mdx` normalization — and (extension of the
//     same rule) a `war3mapImported\` ICON reference (uico/iico) must
//     resolve to a member too (textures get NO extension swap in-game, but
//     a `.blp`<->`.tga` near-miss is called out to speed diagnosis).
//  b) gotcha 23 — an item overriding `unam` without `ifil` (model) or
//     `iico` (icon) leaks the base item's art in-game ("deer drops
//     cheese"). Deliberately scoped to ITEMS: a renamed unit that keeps
//     its base art (e.g. a re-labelled hero) is common and intentional.
//  c) gotcha 25 — a unit with a build list (`ubui`) whose OVERRIDDEN
//     `uabi` contains no repair-family ability starts buildings that never
//     finish (human construction only progresses via Repair). Accepted
//     repair ids: Ahrp (human) / Arep (orc) / Aetr (night elf) / Awha
//     (undead). Limitation: only the human pair (AHbu+Ahrp) is
//     playtest-verified; the others are accepted as per-race equivalents.
//     Units that DON'T override uabi are skipped — the base unit's default
//     ability set is not visible in the map's object data.
//  d) gotcha 31 — stock art paths (model/icon fields that are neither
//     `war3mapImported\` nor an archive member) are unverifiable headlessly
//     UNLESS they appear in the curated facts table lib/data/stock-art.json:
//     listfile-verified or game-verified entries are silent; a path absent
//     from the table (or only community-doc) WARNs — a typo'd stock path
//     renders NOTHING in-game with no error. Playtests promote table
//     entries to game-verified (docs/ASSETS.md).
//  e) gotcha 31 — a CLONE CROWD: two or more custom units sharing a base
//     id, all overriding `unam`, with NONE of the group overriding `umdl`
//     or `uico`, are visually indistinguishable in-game (the coinstead
//     "five identical farms" wall). Deliberately NOT triggered by a single
//     renamed clone — that is common and intentional (rule b's unit-side
//     scoping); one art override anywhere in the group silences it, since
//     the group is then distinguishable-by-design.
//  f) icon-pipeline hygiene (lib/icon.js) — an imported BTN command-button
//     texture with no DISBTN twin gets the engine's green-checker disabled
//     state; the pipeline always writes both, so a lone BTN member means a
//     hand-import missed its twin.
//  g) imports provenance (lintImportsCredits, a SOURCE-dir lint consumed by
//     build-map and preflight, not validate-map): community-fetched assets
//     are only legal to ship with per-author credit (CLAUDE.md Legal,
//     docs/ASSETS.md), so every file under a map source's imports/ must be
//     covered by an entry in the map's imports-credits.json — exact path,
//     or a directory prefix entry ending in '/' (the generated-asset
//     convention). A file with no entry WARNs (unknown provenance); an
//     entry matching no file WARNs (stale — the asset was removed or
//     renamed but its credit line wasn't). A non-empty imports/ with no
//     credits file at all is a single WARN. First consumer:
//     maps/last-train (community models from Hive Workshop).

const fs = require('fs');
const path = require('path');
const STOCK_ART = require('./data/stock-art.json');

const MODEL_FIELD = { units: 'umdl', items: 'ifil', destructables: 'bfil', doodads: 'dfil' };
const ICON_FIELD = { units: 'uico', items: 'iico' };
const REPAIR_ABILITIES = new Set(['Ahrp', 'Arep', 'Aetr', 'Awha']);

function normPath(p) {
  return String(p).replace(/\\/g, '/').toLowerCase();
}

// normalized path -> table entry (models indexed under both .mdl and .mdx,
// icons under both with-.blp and without)
const STOCK_INDEX = (() => {
  const idx = new Map();
  for (const e of STOCK_ART.entries || []) {
    const n = normPath(e.path);
    idx.set(n, e);
    if (e.kind === 'model') idx.set(n.replace(/\.mdl$/, '.mdx'), e);
    if (e.kind === 'icon') idx.set(n.replace(/\.blp$/, ''), e);
  }
  return idx;
})();

// Look up a field value in the stock-art table. Returns the entry or null.
function stockArtEntry(value) {
  const n = normPath(value);
  return STOCK_INDEX.get(n)
    || STOCK_INDEX.get(n.replace(/\.(mdl|mdx)$/, '.mdl'))
    || STOCK_INDEX.get(/\.[a-z0-9]{2,4}$/.test(n) ? n : n + '.blp')
    || null;
}

// Classify every non-imported art-field reference (umdl/uico/ifil/iico/
// dfil/bfil) in the object data against the stock-art table. Values that
// resolve to an archive member (assets imported AT a stock-like path, e.g.
// generated icons under ReplaceableTextures\CommandButtons\) are skipped —
// they are imports, not stock references. Returns
// [{ file, objectId, field, value, status }] where status is the table
// entry's status or null (not in the table). Shared by lint rule (d) and
// tools/preflight.js's stock-art count check.
function collectStockArtRefs(objectFiles, archiveMembers) {
  const members = new Set(Array.from(archiveMembers || [], normPath));
  const refs = [];
  forEachArtField(objectFiles, (of_, objectId, field, value) => {
    if (value === '') return;
    const n = normPath(value);
    if (n.startsWith('war3mapimported/')) return; // rule (a)'s territory
    const candidates = [n, n.replace(/\.mdl$/, '.mdx'), n.replace(/\.mdx$/, '.mdl'),
      n.replace(/\.blp$/, '.tga'), n.replace(/\.tga$/, '.blp')];
    if (candidates.some((c) => members.has(c))) return; // an import, not stock
    const entry = stockArtEntry(value);
    refs.push({ file: of_.war, objectId, field, value, status: entry ? entry.status : null });
  });
  return refs;
}

// Iterate every string value of every art field in the object data.
function forEachArtField(objectFiles, fn) {
  for (const of_ of objectFiles || []) {
    const fields = [MODEL_FIELD[of_.objectType], ICON_FIELD[of_.objectType]].filter(Boolean);
    for (const scope of ['original', 'custom']) {
      const objects = (of_.json && of_.json[scope]) || {};
      for (const objectId of Object.keys(objects)) {
        const mods = objects[objectId];
        if (!Array.isArray(mods)) continue;
        for (const m of mods) {
          if (m && fields.includes(m.id) && typeof m.value === 'string') {
            fn(of_, objectId, m.id, m.value);
          }
        }
      }
    }
  }
}

// objectFiles: [{ war, objectType, json }] where json is the
//   wc3maptranslator ObjectsTranslator shape: { original: {id: [mods]},
//   custom: {"newid:baseid": [mods]} } and each mod is
//   { id, type, level, column, value }.
// archiveMembers: iterable of archive member paths (either slash style).
// Returns [{ file, objectId, message }] — order follows the input.
function lintObjectData(objectFiles, archiveMembers) {
  const memberList = Array.from(archiveMembers || []);
  const members = new Set(memberList.map(normPath));
  const warnings = [];
  const warn = (file, objectId, message) => warnings.push({ file, objectId, message });

  for (const of_ of objectFiles || []) {
    const modelField = MODEL_FIELD[of_.objectType];
    const iconField = ICON_FIELD[of_.objectType];
    for (const scope of ['original', 'custom']) {
      const objects = (of_.json && of_.json[scope]) || {};
      for (const objectId of Object.keys(objects)) {
        const mods = objects[objectId];
        if (!Array.isArray(mods)) continue;
        const values = (fid) => mods
          .filter((m) => m && m.id === fid && typeof m.value === 'string')
          .map((m) => m.value);

        // (a) model-field extension + import resolution (gotcha 22)
        if (modelField) {
          for (const v of values(modelField)) {
            if (v === '') continue;
            const n = normPath(v);
            if (n.endsWith('.mdx')) {
              warn(of_.war, objectId,
                `${modelField} "${v}" ends in .mdx — model fields must use the .mdl extension `
                + '(the engine swaps to .mdx at load; a literal .mdx renders an invisible unit, gotcha 22)');
            }
            if (n.startsWith('war3mapimported/')) {
              const candidates = [n, n.replace(/\.mdl$/, '.mdx'), n.replace(/\.mdx$/, '.mdl')];
              if (!candidates.some((c) => members.has(c))) {
                warn(of_.war, objectId,
                  `${modelField} "${v}" matches no archive member (checked .mdl<->.mdx) — `
                  + 'the model will not render in-game');
              }
            }
          }
        }

        // (a, icon side) imported icon references must resolve too — the
        // engine does NOT extension-swap textures, so an exact member is
        // required; a .blp<->.tga near-miss is named to speed diagnosis.
        if (iconField) {
          for (const v of values(iconField)) {
            if (v === '') continue;
            const n = normPath(v);
            if (!n.startsWith('war3mapimported/')) continue;
            if (members.has(n)) continue;
            const swapped = n.endsWith('.blp') ? n.replace(/\.blp$/, '.tga')
              : n.endsWith('.tga') ? n.replace(/\.tga$/, '.blp') : null;
            if (swapped && members.has(swapped)) {
              warn(of_.war, objectId,
                `${iconField} "${v}" matches no archive member but its .blp<->.tga twin does — `
                + 'textures get NO extension swap in-game; reference the imported extension exactly');
            } else {
              warn(of_.war, objectId,
                `${iconField} "${v}" matches no archive member — the icon will show as a green square in-game`);
            }
          }
        }

        // (b) items renamed without re-arting (gotcha 23)
        if (of_.objectType === 'items'
            && values('unam').length > 0
            && values('ifil').length === 0 && values('iico').length === 0) {
          warn(of_.war, objectId,
            'overrides unam but neither ifil (model) nor iico (icon) — the base item\'s art '
            + 'leaks through in-game ("deer drops cheese", gotcha 23)');
        }

        // (c) builder with a build list but no repair ability (gotcha 25)
        if (of_.objectType === 'units') {
          const ubui = values('ubui').filter((v) => v.trim() !== '');
          const uabi = values('uabi');
          if (ubui.length > 0 && uabi.length > 0) {
            const abilities = uabi.flatMap((v) => v.split(',')).map((s) => s.trim());
            if (!abilities.some((a) => REPAIR_ABILITIES.has(a))) {
              warn(of_.war, objectId,
                `has a build list (ubui "${ubui[0]}") but its uabi override `
                + `("${uabi[0]}") has no repair ability (Ahrp/Arep/Aetr/Awha) — `
                + 'construction will start but never progress (gotcha 25; only the '
                + 'human AHbu+Ahrp pair is playtest-verified)');
            }
          }
        }
      }
    }
  }

  // (d) stock art paths not in the verified table (gotcha 31)
  for (const r of collectStockArtRefs(objectFiles, memberList)) {
    if (r.status === 'listfile-verified' || r.status === 'game-verified') continue;
    warn(r.file, r.objectId, r.status === 'community-doc'
      ? `${r.field} "${r.value}" is only community-doc status in lib/data/stock-art.json — `
        + 'existence in the game data is undocumented; verify against a listfile and promote (gotcha 31)'
      : `${r.field} "${r.value}" is a stock path not in the verified stock-art table `
        + '(lib/data/stock-art.json) — a typo\'d stock path renders NOTHING in-game with no error (gotcha 31)');
  }

  // (e) clone crowds: >= 2 custom units on one base, all renamed, none
  // re-arted (gotcha 31 — the coinstead "five identical farms" wall)
  for (const of_ of objectFiles || []) {
    if (of_.objectType !== 'units') continue;
    const groups = new Map(); // baseId -> [{objectId, renamed, rearted}]
    const objects = (of_.json && of_.json.custom) || {};
    for (const objectId of Object.keys(objects)) {
      const mods = objects[objectId];
      if (!Array.isArray(mods)) continue;
      const base = String(objectId).split(':')[1];
      if (!base) continue;
      const has = (fid) => mods.some((m) => m && m.id === fid
        && typeof m.value === 'string' && m.value !== '');
      if (!groups.has(base)) groups.set(base, []);
      groups.get(base).push({ objectId, renamed: has('unam'), rearted: has('umdl') || has('uico') });
    }
    for (const [base, group] of groups) {
      if (group.length >= 2 && group.every((g) => g.renamed) && group.every((g) => !g.rearted)) {
        warn(of_.war, group.map((g) => g.objectId).join(','),
          `${group.length} custom units share base ${base}, all override unam, none overrides `
          + 'umdl or uico — a visually indistinguishable clone crowd in-game; give each a '
          + 'distinct model and/or icon (gotcha 31, the coinstead five-farm wall)');
      }
    }
  }

  // (f) imported BTN command-button texture without its DISBTN twin
  const baseName = (p) => String(p).replace(/\\/g, '/').split('/').pop();
  const memberBase = new Set(memberList.map((m) => baseName(m).toLowerCase()));
  for (const m of memberList) {
    const b = baseName(m);
    const mm = /^btn(.+)\.(blp|tga|dds)$/i.exec(b);
    if (!mm) continue;
    if (!['blp', 'tga', 'dds'].some((ext) => memberBase.has(`disbtn${mm[1].toLowerCase()}.${ext}`))) {
      warn(m, '',
        `imported BTN icon has no DISBTN twin in the archive — its disabled state shows the `
        + 'engine\'s green checkerboard; import ReplaceableTextures\\CommandButtonsDisabled\\'
        + `DISBTN${mm[1]}.${mm[2]} too (lib/icon.js derives it automatically)`);
    }
  }

  return warnings;
}

// (g) imports provenance lint — see the header. mapDir is a MAP SOURCE dir.
// Returns [{ file, message }] (file is imports-relative, '' for dir-level
// findings). No imports/ (or an empty one) => no findings, credits file or
// not — nothing to credit.
function lintImportsCredits(mapDir) {
  const importsDir = path.join(mapDir, 'imports');
  const files = [];
  (function walkDir(dir, rel) {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir).sort()) {
      const p = path.join(dir, name);
      const r = rel ? `${rel}/${name}` : name;
      if (fs.statSync(p).isDirectory()) walkDir(p, r);
      else files.push(r);
    }
  })(importsDir, '');
  if (files.length === 0) return [];

  const creditsPath = path.join(mapDir, 'imports-credits.json');
  if (!fs.existsSync(creditsPath)) {
    return [{
      file: '',
      message: `imports/ has ${files.length} file(s) but the map source has no imports-credits.json — `
        + 'record each asset\'s provenance (author/resource/source/license; docs/ASSETS.md, lint rule g)',
    }];
  }
  let credits;
  try {
    credits = JSON.parse(fs.readFileSync(creditsPath, 'utf8'));
  } catch (e) {
    return [{ file: 'imports-credits.json', message: `unparseable: ${String(e.message || e).split('\n')[0]}` }];
  }
  const entries = credits.entries || {};
  const keys = Object.keys(entries);
  const warnings = [];
  const norm = (s) => String(s).replace(/\\/g, '/');
  const covered = (f) => keys.some((k) => (k.endsWith('/') ? f.startsWith(norm(k)) : norm(k) === f));
  for (const f of files) {
    if (!covered(f)) {
      warnings.push({
        file: f,
        message: 'no imports-credits.json entry covers this import — unknown provenance '
          + '(add an exact-path entry, or a directory-prefix entry ending in "/"; lint rule g)',
      });
    }
  }
  for (const k of keys) {
    const n = norm(k);
    const live = k.endsWith('/') ? files.some((f) => f.startsWith(n)) : files.includes(n);
    if (!live) {
      warnings.push({
        file: k,
        message: 'stale imports-credits.json entry — no file under imports/ matches it '
          + '(the asset was removed or renamed but its credit line was not; lint rule g)',
      });
    }
  }
  return warnings;
}

module.exports = {
  lintObjectData, collectStockArtRefs, stockArtEntry, lintImportsCredits,
  MODEL_FIELD, ICON_FIELD, REPAIR_ABILITIES,
};
