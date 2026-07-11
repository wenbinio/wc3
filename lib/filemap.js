'use strict';
// Mapping between war3map.* archive files, wc3maptranslator translators and
// the JSON file names used in a "map source" directory.
//
// wc3maptranslator@5 supports ONLY current Reforged formats
// (w3i v33 / v28+..., w3e v12, object data v3). Classic (pre-Reforged) maps
// throw "WC3MapTranslator cannot currently parse this version" — callers must
// catch that and fall back to copying the file through opaquely.

const Translators = require('wc3maptranslator');
const { applyW3BufferPatches, fixDoodadsLifeZero } = require('./translator-fixes');
const wts = require('./wts');
const w3e11 = require('./codecs/w3e11');
const w3i31 = require('./codecs/w3i31');
const objects2 = require('./codecs/objects2');

// Runtime-patch the translator's string reads before anything translates:
// UTF-8 decode (write side already emits UTF-8, so non-ASCII text in object
// data / info / sounds / ... now round-trips byte-exact) + a bounds check so
// truncated/booby-trapped files throw a catchable RangeError instead of
// hanging. See lib/translator-fixes.js.
applyW3BufferPatches();

// Translatable files. `objectType` entries go through ObjectsTranslator;
// a `module` entry uses our own translator (same {json}/{buffer} API).
const TRANSLATABLE = [
  { war: 'war3map.w3i', json: 'info.json', translator: 'InfoTranslator' },
  { war: 'war3map.w3e', json: 'terrain.json', translator: 'TerrainTranslator' },
  { war: 'war3map.doo', json: 'doodads.json', translator: 'DoodadsTranslator' },
  { war: 'war3mapUnits.doo', json: 'units.json', translator: 'UnitsTranslator' },
  { war: 'war3map.w3r', json: 'regions.json', translator: 'RegionsTranslator' },
  { war: 'war3map.w3c', json: 'cameras.json', translator: 'CamerasTranslator' },
  { war: 'war3map.w3s', json: 'sounds.json', translator: 'SoundsTranslator' },
  // wts goes through lib/wts.js in BOTH directions (same JSON dialect as
  // upstream StringsTranslator, which stays as reference only): upstream's
  // reader is O(file-size × blocks) with regex backtracking — an uncatchable
  // multi-GB heap death on real 1-2MB / ~10k-string files — and its writer
  // mangles non-ASCII (gotcha 16). lib/wts.js is linear and UTF-8 both ways.
  { war: 'war3map.wts', json: 'strings.json', module: wts },
  { war: 'war3map.imp', json: 'imports.json', translator: 'ImportsTranslator' },
  // Object data (format v3 via upstream; v1/v2 via lib/codecs/objects2.js,
  // routed by version dword / `version` marker). war3map.w3b pairs with war3mapSkin.w3b:
  // ObjectsTranslator merges/splits destructable "skin" fields automatically.
  { war: 'war3map.w3u', json: 'objects-units.json', objectType: 'units' },
  { war: 'war3map.w3t', json: 'objects-items.json', objectType: 'items' },
  { war: 'war3map.w3b', json: 'objects-destructables.json', objectType: 'destructables', skinWar: 'war3mapSkin.w3b' },
  { war: 'war3map.w3d', json: 'objects-doodads.json', objectType: 'doodads' },
  { war: 'war3map.w3a', json: 'objects-abilities.json', objectType: 'abilities' },
  { war: 'war3map.w3h', json: 'objects-buffs.json', objectType: 'buffs' },
  { war: 'war3map.w3q', json: 'objects-upgrades.json', objectType: 'upgrades' },
  // Reforged skin overrides for the other object types (same v3 format).
  { war: 'war3mapSkin.w3u', json: 'objects-units-skin.json', objectType: 'units' },
  { war: 'war3mapSkin.w3t', json: 'objects-items-skin.json', objectType: 'items' },
  { war: 'war3mapSkin.w3d', json: 'objects-doodads-skin.json', objectType: 'doodads' },
  { war: 'war3mapSkin.w3a', json: 'objects-abilities-skin.json', objectType: 'abilities' },
  { war: 'war3mapSkin.w3h', json: 'objects-buffs-skin.json', objectType: 'buffs' },
  { war: 'war3mapSkin.w3q', json: 'objects-upgrades-skin.json', objectType: 'upgrades' },
];

// Map script files: already human/agent editable text, kept verbatim at the
// top level of a map source directory.
const SCRIPT_FILES = ['war3map.lua', 'war3map.j', 'war3map.wct', 'war3map.wtg'];

const byWar = new Map(TRANSLATABLE.map((e) => [e.war, e]));
const byJson = new Map(TRANSLATABLE.map((e) => [e.json, e]));
// war3mapSkin.w3b is consumed by the war3map.w3b entry, never on its own.
const CONSUMED_AS_SKIN = new Set(TRANSLATABLE.filter((e) => e.skinWar).map((e) => e.skinWar));

function warToJson(entry, buffer, skinBuffer) {
  if (entry.objectType) {
    // Version routing: upstream ObjectsTranslator hardcodes object-data v3
    // (Reforged 1.33+), but real maps still ship v2 (current Wurst output,
    // DracoL1ch DotA, classic WE saves) and occasionally v1. The codec emits
    // the SAME JSON dialect plus a `version` marker (gotcha 2).
    if (objects2.isSupported(buffer)) {
      return objects2.warToJson(entry.objectType, buffer, skinBuffer).json;
    }
    return Translators.ObjectsTranslator.warToJson(entry.objectType, buffer, skinBuffer).json;
  }
  if (entry.module) return entry.module.warToJson(buffer).json;
  // Version-aware codecs (lib/codecs/): upstream wc3maptranslator hardcodes
  // w3e v12 / w3i v33, but real published maps ship w3e v11 and w3i v25/v31.
  // Route by the file's version dword — the codecs emit the SAME JSON dialect
  // plus a `version` marker, so the output lands in the normal editable
  // terrain.json/info.json (not the read-only _viewer/ fallback). Unsupported
  // versions still go to upstream for its informative version error.
  if (entry.war === 'war3map.w3e' && w3e11.isV11(buffer)) return w3e11.warToJson(buffer).json;
  if (entry.war === 'war3map.w3i' && w3i31.isSupported(buffer)) return w3i31.warToJson(buffer).json;
  return Translators[entry.translator].warToJson(buffer).json;
}

// Returns { buffer, skinBuffer? }. skinBuffer is only ever set for
// destructables whose JSON contains skin-only fields (bnam, bfil, ...).
function jsonToWar(entry, json) {
  if (entry.objectType) {
    // `"version": 1|2` marker -> objects2 codec; 3/absent -> upstream (v3)
    if (json && objects2.SUPPORTED_VERSIONS.includes(json.version)) {
      const r = objects2.jsonToWar(entry.objectType, json);
      return { buffer: r.buffer, skinBuffer: r.bufferSkin };
    }
    const r = Translators.ObjectsTranslator.jsonToWar(entry.objectType, json);
    return { buffer: r.buffer, skinBuffer: r.bufferSkin };
  }
  if (entry.module) return { buffer: entry.module.jsonToWar(json).buffer };
  // Version routing (see warToJson): an explicit `version` marker in the
  // source JSON picks the codec; 12/33/absent means upstream (which writes
  // the current Reforged formats and ignores the extra key).
  if (entry.json === 'terrain.json' && json && json.version === 11) {
    return { buffer: w3e11.jsonToWar(json).buffer };
  }
  if (entry.json === 'info.json' && json && w3i31.SUPPORTED_VERSIONS.includes(json.version)) {
    return { buffer: w3i31.jsonToWar(json).buffer };
  }
  if (entry.json === 'doodads.json') {
    // upstream can't write a doodad life byte of 0 (`life || 100` — the GWZ
    // false-FAIL); substitute the 256 write-through on a copy. FIX C in
    // lib/translator-fixes.js has the full story.
    json = fixDoodadsLifeZero(json);
  }
  return { buffer: Translators[entry.translator].jsonToWar(json).buffer };
}

module.exports = { TRANSLATABLE, SCRIPT_FILES, byWar, byJson, CONSUMED_AS_SKIN, warToJson, jsonToWar, Translators };
