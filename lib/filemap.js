'use strict';
// Mapping between war3map.* archive files, wc3maptranslator translators and
// the JSON file names used in a "map source" directory.
//
// wc3maptranslator@5 supports ONLY current Reforged formats
// (w3i v33 / v28+..., w3e v12, object data v3). Classic (pre-Reforged) maps
// throw "WC3MapTranslator cannot currently parse this version" — callers must
// catch that and fall back to copying the file through opaquely.

const Translators = require('wc3maptranslator');

// Translatable files. `objectType` entries go through ObjectsTranslator.
const TRANSLATABLE = [
  { war: 'war3map.w3i', json: 'info.json', translator: 'InfoTranslator' },
  { war: 'war3map.w3e', json: 'terrain.json', translator: 'TerrainTranslator' },
  { war: 'war3map.doo', json: 'doodads.json', translator: 'DoodadsTranslator' },
  { war: 'war3mapUnits.doo', json: 'units.json', translator: 'UnitsTranslator' },
  { war: 'war3map.w3r', json: 'regions.json', translator: 'RegionsTranslator' },
  { war: 'war3map.w3c', json: 'cameras.json', translator: 'CamerasTranslator' },
  { war: 'war3map.w3s', json: 'sounds.json', translator: 'SoundsTranslator' },
  { war: 'war3map.wts', json: 'strings.json', translator: 'StringsTranslator' },
  { war: 'war3map.imp', json: 'imports.json', translator: 'ImportsTranslator' },
  // Object data (all format v3). war3map.w3b pairs with war3mapSkin.w3b:
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
    return Translators.ObjectsTranslator.warToJson(entry.objectType, buffer, skinBuffer).json;
  }
  return Translators[entry.translator].warToJson(buffer).json;
}

// Returns { buffer, skinBuffer? }. skinBuffer is only ever set for
// destructables whose JSON contains skin-only fields (bnam, bfil, ...).
function jsonToWar(entry, json) {
  if (entry.objectType) {
    const r = Translators.ObjectsTranslator.jsonToWar(entry.objectType, json);
    return { buffer: r.buffer, skinBuffer: r.bufferSkin };
  }
  return { buffer: Translators[entry.translator].jsonToWar(json).buffer };
}

module.exports = { TRANSLATABLE, SCRIPT_FILES, byWar, byJson, CONSUMED_AS_SKIN, warToJson, jsonToWar, Translators };
