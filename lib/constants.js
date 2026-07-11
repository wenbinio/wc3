'use strict';
// Generated named Lua constants — no more hand-typed rawcodes in map scripts.
//
// WHY: every industrial WC3 pipeline (Wurst, vJASS libraries, WE's own
// gg_rct_*/gg_snd_* globals) generates named constants for map data; our
// peer-map study found hand-typed FourCC literals behind several real bugs
// (wrong-case rawcode, stale clone id, region coords duplicated out of sync
// with regions.json). This module derives, from a MAP SOURCE directory, one
// named Lua global per:
//   - object-data entry in objects-*.json — all seven types, custom AND
//     modified-original entries, skin twins included (a skin file often
//     carries the display name for an entry whose stats live in the main
//     file: the name is merged onto the same rawcode, never duplicated);
//   - distinct type actually placed/referenced in units.json (unit types,
//     inventory + customItemSets item types, preplaced ability ids) and
//     doodads.json (regular + special);
//   - region in regions.json and sound in sounds.json.
//
// NAMING RULE (stable + collision-safe, in order):
//   1. prefix by kind: UNIT_ ITEM_ DEST_ DOOD_ ABIL_ BUFF_ UPGR_ REGION_ SOUND_
//   2. + sanitized ASCII name from the entry's name field (unam/bnam/dnam/
//      anam/fnam/gnam, TRIGSTR_n resolved via strings.json, |c..|r color
//      codes stripped, CamelCase split, uppercased, non-alnum -> '_').
//      Entries with no name (types merely referenced from units/doodads.json)
//      use the RAWCODE verbatim instead (Lua identifiers are case-sensitive,
//      so UNIT_hfoo and a hero UNIT_Hpal never clash).
//   3. on collision (same constant name, different entries) EVERY collider
//      gets a '_<rawcode>' suffix (regions: '_<id>', sounds: '_<index>').
//      All-or-none keeps the rule order-independent — but note the trap:
//      introducing a second "Footman" RENAMES the existing UNIT_FOOTMAN to
//      UNIT_FOOTMAN_<code>. Grep constants.json after object-data edits.
//
// VALUES:
//   - object types: FourCC("xxxx") — ready for CreateUnit/CreateItem/etc.
//   - regions: an inert table { minX, minY, maxX, maxY, name } (war3map.w3r
//     is editor data — Lua maps create their own rects, and our reference
//     maps hand-duplicated the coordinates; the table keeps regions.json the
//     single source of truth: Rect(R.minX, R.minY, R.maxX, R.maxY)).
//   - sounds: an inert table with the CreateSound argument set
//     { path, looping, is3D, stopOutOfRange, fadeIn, fadeOut, effect, volume }.
//
// The Lua block is marker-delimited and PREPENDED above the user script
// (constants must exist before any top-level user code runs); it is stripped
// and regenerated on every build exactly like the CreateAllUnits block
// (lib/unitscript.js), so it never becomes part of the committed source.
// build-map also writes a machine-readable constants.json index into the map
// source dir for agents to grep.

const fs = require('fs');
const path = require('path');

const BEGIN_MARK = '-- ### BEGIN wc3-map-toolkit generated: constants (from map source JSON) — DO NOT EDIT ###';
const END_MARK = '-- ### END wc3-map-toolkit generated: constants ###';

const PREFIX = {
  unit: 'UNIT_',
  item: 'ITEM_',
  destructable: 'DEST_',
  doodad: 'DOOD_',
  ability: 'ABIL_',
  buff: 'BUFF_',
  upgrade: 'UPGR_',
  region: 'REGION_',
  sound: 'SOUND_',
};

// Presentation order of kinds in the generated block / index.
const KIND_ORDER = ['unit', 'item', 'destructable', 'doodad', 'ability', 'buff', 'upgrade', 'region', 'sound'];

// objects-*.json sources: kind + the WE meta field id that holds the display
// name. Skin files (Reforged moves display fields there) merge into the same
// rawcode. Destructables have no separate skin JSON (filemap merges it).
const OBJECT_SOURCES = [
  { json: 'objects-units.json', kind: 'unit', nameId: 'unam' },
  { json: 'objects-units-skin.json', kind: 'unit', nameId: 'unam', skin: true },
  { json: 'objects-items.json', kind: 'item', nameId: 'unam' },
  { json: 'objects-items-skin.json', kind: 'item', nameId: 'unam', skin: true },
  { json: 'objects-destructables.json', kind: 'destructable', nameId: 'bnam' },
  { json: 'objects-doodads.json', kind: 'doodad', nameId: 'dnam' },
  { json: 'objects-doodads-skin.json', kind: 'doodad', nameId: 'dnam', skin: true },
  { json: 'objects-abilities.json', kind: 'ability', nameId: 'anam' },
  { json: 'objects-abilities-skin.json', kind: 'ability', nameId: 'anam', skin: true },
  { json: 'objects-buffs.json', kind: 'buff', nameId: 'fnam' },
  { json: 'objects-buffs-skin.json', kind: 'buff', nameId: 'fnam', skin: true },
  { json: 'objects-upgrades.json', kind: 'upgrade', nameId: 'gnam' },
  { json: 'objects-upgrades-skin.json', kind: 'upgrade', nameId: 'gnam', skin: true },
];

// ---- naming ---------------------------------------------------------------

// 'TRIGSTR_015' -> strings.json entry "15" (leading zeros stripped, like the
// game). Non-TRIGSTR values pass through; a dangling reference returns null.
function resolveTrigstr(value, strings) {
  if (typeof value !== 'string') return value;
  const m = /^TRIGSTR_(\d+)$/.exec(value.trim());
  if (!m) return value;
  const entry = strings && strings[String(parseInt(m[1], 10))];
  return entry && typeof entry.value === 'string' ? entry.value : null;
}

// WC3 display-name markup: |cAARRGGBB color start, |r reset, |n newline.
function stripColorCodes(s) {
  return String(s)
    .replace(/\|c[0-9a-fA-F]{8}/g, '')
    .replace(/\|[rn]/gi, ' ');
}

// Display name -> ASCII identifier chunk: color codes stripped, CamelCase
// split ('SpawnNorth' -> 'SPAWN_NORTH'), accents decomposed, non-alnum -> _.
// Returns '' when nothing sanitizable is left (caller falls back to rawcode).
function sanitizeName(s) {
  return stripColorCodes(s)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .normalize('NFKD')
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x00-\x7F]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// A rawcode as a Lua-identifier chunk, case preserved (Lua ids are
// case-sensitive, and so are rawcodes: hpal != Hpal). Non-alnum chars (rare,
// generated ids can contain them) become xHH hex escapes — injective, so
// distinct rawcodes always yield distinct chunks.
function rawcodeChunk(code) {
  return String(code).split('').map((c) =>
    /[A-Za-z0-9]/.test(c) ? c : 'x' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')
  ).join('');
}

// ---- collection -----------------------------------------------------------

function readJsonIfExists(p) {
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function nameFromMods(mods, nameId, strings) {
  if (!Array.isArray(mods)) return null;
  for (const m of mods) {
    if (m && m.id === nameId && typeof m.value === 'string') {
      const resolved = resolveTrigstr(m.value, strings);
      if (resolved) return resolved;
    }
  }
  return null;
}

// Collect every derivable constant from a map source dir. Returns an array of
// entries: { constName, kind, source, rawcode?, base?, displayName?,
// luaValue, index: {...} } sorted by kind order then constant name.
function collectConstants(sourceDir) {
  const strings = readJsonIfExists(path.join(sourceDir, 'strings.json'));
  // key `${kind}:${rawcode}` -> pending entry (dedupe + skin name merge)
  const byKey = new Map();

  const addRaw = (kind, rawcode, base, displayName, source) => {
    if (typeof rawcode !== 'string' || rawcode.length !== 4) return;
    const key = `${kind}:${rawcode}`;
    const existing = byKey.get(key);
    if (existing) {
      // Reforged skin files carry the display name for entries whose stats
      // live in the main file — adopt a name onto an unnamed entry.
      if (!existing.displayName && displayName) {
        existing.displayName = displayName;
        existing.source = source;
      }
      return;
    }
    byKey.set(key, { kind, rawcode, base: base || undefined, displayName: displayName || undefined, source });
  };

  // 1. Object data (custom entries + modified originals), skins merged.
  for (const spec of OBJECT_SOURCES) {
    const data = readJsonIfExists(path.join(sourceDir, spec.json));
    if (!data || typeof data !== 'object') continue;
    for (const section of ['custom', 'original']) {
      const table = data[section];
      if (!table || typeof table !== 'object') continue;
      for (const idKey of Object.keys(table)) {
        if (idKey.startsWith('_')) continue; // codec markers, never entries
        const [rawcode, base] = section === 'custom' ? idKey.split(':') : [idKey, null];
        addRaw(spec.kind, rawcode, base, nameFromMods(table[idKey], spec.nameId, strings), spec.json);
      }
    }
  }

  // 2. Types referenced by placements. Custom entries already present keep
  // their named constant; everything else gets a rawcode-named fallback.
  const units = readJsonIfExists(path.join(sourceDir, 'units.json'));
  if (Array.isArray(units)) {
    for (const u of units) {
      if (!u || u.type === 'sloc') continue;
      addRaw('unit', u.type, null, null, 'units.json');
      for (const inv of u.inventory || []) addRaw('item', inv && inv.type, null, null, 'units.json');
      for (const set of u.customItemSets || []) {
        for (const code of Object.keys(set || {})) addRaw('item', code, null, null, 'units.json');
      }
      for (const ab of u.abilities || []) addRaw('ability', ab && ab.ability, null, null, 'units.json');
    }
  }
  const doodads = readJsonIfExists(path.join(sourceDir, 'doodads.json'));
  if (doodads && typeof doodads === 'object') {
    for (const list of [doodads.regular, doodads.special]) {
      for (const d of list || []) {
        if (!d || typeof d.type !== 'string') continue;
        // war3map.doo mixes doodads and destructables and carries no class
        // bit; without the game SLKs we classify by the map's own object
        // data (DEST_ if the code is a custom/modified destructable, DOOD_
        // if a custom/modified doodad) and default the rest to DOOD_.
        if (byKey.has(`destructable:${d.type}`) || byKey.has(`doodad:${d.type}`)) continue;
        addRaw('doodad', d.type, null, null, 'doodads.json');
      }
    }
  }

  // 3. Regions and sounds (no rawcode: table-valued constants).
  const extra = [];
  const regions = readJsonIfExists(path.join(sourceDir, 'regions.json'));
  if (Array.isArray(regions)) {
    for (const r of regions) {
      if (!r || typeof r.name !== 'string' || !r.position) continue;
      extra.push({
        kind: 'region',
        displayName: r.name,
        suffix: String(r.id),
        source: 'regions.json',
        luaValue: `{ minX = ${luaNum(r.position.left)}, minY = ${luaNum(r.position.bottom)}, `
          + `maxX = ${luaNum(r.position.right)}, maxY = ${luaNum(r.position.top)}, name = ${luaStr(r.name)} }`,
        index: { kind: 'region', name: r.name, source: 'regions.json' },
      });
    }
  }
  const sounds = readJsonIfExists(path.join(sourceDir, 'sounds.json'));
  if (Array.isArray(sounds)) {
    sounds.forEach((s, i) => {
      if (!s || typeof s.path !== 'string') return;
      const varName = typeof s.variableName === 'string' && s.variableName
        ? s.variableName.replace(/^gg_snd_/, '')
        : path.posix.basename(s.path.replace(/\\/g, '/')).replace(/\.[^.]*$/, '');
      const flags = s.flags || {};
      const fade = s.fadeRate || {};
      extra.push({
        kind: 'sound',
        displayName: varName,
        suffix: String(i),
        source: 'sounds.json',
        luaValue: `{ path = ${luaStr(s.path)}, looping = ${!!flags.looping}, is3D = ${!!flags['3dSound']}, `
          + `stopOutOfRange = ${!!flags.stopOutOfRange}, fadeIn = ${fade.in ?? 10}, fadeOut = ${fade.out ?? 10}, `
          + `effect = ${luaStr(s.effect || '')}, volume = ${s.volume ?? 127} }`,
        index: { kind: 'sound', name: varName, path: s.path, source: 'sounds.json' },
      });
    });
  }

  // 4. Assemble in deterministic order, then resolve names.
  const pending = [];
  for (const e of byKey.values()) {
    pending.push({
      ...e,
      suffix: rawcodeChunk(e.rawcode),
      luaValue: `FourCC(${luaStr(e.rawcode)})`,
      index: {
        kind: e.kind,
        rawcode: e.rawcode,
        ...(e.base ? { base: e.base } : {}),
        ...(e.displayName ? { name: e.displayName } : {}),
        source: e.source,
      },
    });
  }
  pending.push(...extra);

  // Desired base name: PREFIX + sanitized display name, or PREFIX + rawcode.
  for (const e of pending) {
    const sanitized = e.displayName ? sanitizeName(e.displayName) : '';
    e.baseName = PREFIX[e.kind] + (sanitized || (e.rawcode ? rawcodeChunk(e.rawcode) : e.suffix));
  }
  // Collision resolution: any base name claimed by >1 entries suffixes ALL
  // of them (order-independent; see naming rule 3 in the header).
  const groups = new Map();
  for (const e of pending) {
    if (!groups.has(e.baseName)) groups.set(e.baseName, []);
    groups.get(e.baseName).push(e);
  }
  const used = new Set();
  for (const [name, group] of groups) {
    for (const e of group) {
      let n = group.length === 1 && !used.has(name) ? name : `${name}_${e.suffix}`;
      while (used.has(n)) n += '_'; // pathological double-collision guard
      used.add(n);
      e.constName = n;
    }
  }

  pending.sort((a, b) =>
    KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)
    || (a.constName < b.constName ? -1 : a.constName > b.constName ? 1 : 0));
  return pending;
}

// ---- lua emission ---------------------------------------------------------

function luaStr(s) {
  return '"' + String(s)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n') + '"';
}

function luaNum(n) {
  const v = Number(n);
  return Number.isInteger(v) ? v.toFixed(1) : String(v);
}

// The marker-delimited Lua block. Empty entry list -> '' (no block emitted).
function generateConstantsBlock(entries) {
  if (!entries || entries.length === 0) return '';
  const out = [BEGIN_MARK];
  out.push('-- Named constants derived from this map source (objects-*.json names,');
  out.push('-- placed types, regions.json, sounds.json). Regenerated every build;');
  out.push('-- index: constants.json in the map source dir. Use these instead of raw');
  out.push('-- FourCC literals. Regions/sounds are inert data tables:');
  out.push('--   Rect(R.minX, R.minY, R.maxX, R.maxY)');
  out.push('--   CreateSound(S.path, S.looping, S.is3D, S.stopOutOfRange, S.fadeIn, S.fadeOut, S.effect)');
  for (const e of entries) {
    const note = [];
    if (e.displayName && e.rawcode) note.push(oneLine(e.displayName));
    if (e.base) note.push(`base ${e.base}`);
    note.push(e.source);
    out.push(`${e.constName} = ${e.luaValue} -- ${note.join(', ')}`);
  }
  out.push(END_MARK);
  return out.join('\n') + '\n';
}

function oneLine(s) {
  return String(s).replace(/\s+/g, ' ').trim();
}

// Remove a previously generated block (idempotent rebuilds).
function stripConstantsBlock(luaText) {
  const begin = luaText.indexOf(BEGIN_MARK);
  if (begin === -1) return luaText;
  const end = luaText.indexOf(END_MARK, begin);
  if (end === -1) return luaText;
  let tail = luaText.slice(end + END_MARK.length);
  if (tail.startsWith('\n')) tail = tail.slice(1);
  if (tail.startsWith('\n')) tail = tail.slice(1); // the blank separator line
  return luaText.slice(0, begin) + tail;
}

// Strip any old generated block, then PREPEND a fresh one above the user
// script (constants must be defined before top-level user code runs).
function injectConstantsIntoLua(luaText, entries) {
  const user = stripConstantsBlock(luaText);
  const block = generateConstantsBlock(entries);
  if (!block) return user; // nothing derivable — also removes a stale block
  return block + '\n' + user;
}

// Machine-readable index (written by build-map as <map-source>/constants.json).
function constantsIndex(entries) {
  const constants = {};
  for (const e of entries) constants[e.constName] = e.index;
  return {
    _generated: 'wc3-map-toolkit: derived from the map source JSON by build-map — regenerated every build, do not hand-edit',
    constants,
  };
}

module.exports = {
  BEGIN_MARK,
  END_MARK,
  PREFIX,
  collectConstants,
  generateConstantsBlock,
  stripConstantsBlock,
  injectConstantsIntoLua,
  constantsIndex,
  // exported for tests
  sanitizeName,
  rawcodeChunk,
  resolveTrigstr,
};
