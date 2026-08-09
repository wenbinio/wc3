'use strict';
// scriptfiles.js — locate a map's script members and decide which one the
// GAME actually runs (gotcha 7).
//
// Two facts drive this module, both measured on live hosted maps (2026-08):
//
//   1. MPQ member names are CASE-INSENSITIVE and use backslashes. Tower
//      Survivors v1.90 ships its only script as `Scripts\war3map.j` with a
//      capital S; it runs fine. Hardcoding the lowercase `scripts/war3map.j`
//      made us report "no war3map.lua or war3map.j in archive" on a map with
//      hundreds of live games a month. Always match case-insensitively and
//      accept either slash.
//
//   2. A map can carry scripts of BOTH languages. Only the one selected by
//      the w3i's `scriptLanguage` field runs; the other is a leftover or a
//      deliberate decoy (Hero Strife TD v3.1.9 is a Lua map that also ships
//      a 26-byte garbage `scripts\war3map.j` — a JASSHelper/anti-tamper
//      stub). Syntax-gating the secondary script fails a map that is not
//      broken, which violates the WARN doctrine (FAIL is reserved for things
//      that break the map for players).
//
// resolvePrimary() therefore returns the language the game runs plus the
// secondary scripts, which callers may WARN about but must never FAIL on.

// Canonical member paths, lowercase, in report order (root before scripts/).
const SCRIPT_MEMBERS = [
  'war3map.lua', 'war3map.j', 'scripts/war3map.lua', 'scripts/war3map.j',
];

function normMember(rel) {
  return String(rel).replace(/\\/g, '/').toLowerCase();
}

function isScriptMember(rel) {
  return SCRIPT_MEMBERS.includes(normMember(rel));
}

// members: archive-relative names in any case, either slash.
// -> { all, lua, jass } with the ORIGINAL (on-disk) spellings preserved.
function findScriptMembers(members) {
  const all = [...members]
    .filter(isScriptMember)
    .sort((a, b) => SCRIPT_MEMBERS.indexOf(normMember(a)) - SCRIPT_MEMBERS.indexOf(normMember(b)));
  return {
    all,
    lua: all.filter((s) => normMember(s).endsWith('.lua')),
    jass: all.filter((s) => normMember(s).endsWith('.j')),
  };
}

// Which language the game runs, and which scripts are therefore secondary.
//   scriptLanguage: the w3i field (1 = Lua, 0 = JASS) or null when unknown
//                   (unreadable/protected w3i — never a reason to fail).
//   scripts:        a findScriptMembers() result
//   luaParses:      optional (rel -> boolean); a declared-Lua map whose
//                   war3map.lua does NOT parse keeps Lua as primary, so the
//                   broken script still fails the map.
// -> { language: 'lua'|'j'|null, primary: [rel], secondary: [rel], reason }
function resolvePrimary(scriptLanguage, scripts, luaParses) {
  const parses = (s) => (luaParses ? luaParses(s) !== false : true);
  const usableLua = scripts.lua.filter(parses);
  let language = null;
  let reason;
  if (scriptLanguage === 1 && scripts.lua.length > 0) {
    language = 'lua';
    reason = 'w3i scriptLanguage=1 (Lua)';
  } else if (scriptLanguage === 0 && scripts.jass.length > 0) {
    language = 'j';
    reason = 'w3i scriptLanguage=0 (JASS)';
  } else if (usableLua.length > 0) {
    // Unknown/mismatched declaration: a war3map.lua that parses is the best
    // evidence of the running script (an unparseable one is not).
    language = 'lua';
    reason = scriptLanguage == null ? 'w3i scriptLanguage unreadable; war3map.lua parses' : `w3i scriptLanguage=${scriptLanguage} but only Lua is packed`;
  } else if (scripts.jass.length > 0) {
    language = 'j';
    reason = scriptLanguage == null ? 'w3i scriptLanguage unreadable; only JASS is packed' : `w3i scriptLanguage=${scriptLanguage} but only JASS is packed`;
  } else if (scripts.lua.length > 0) {
    language = 'lua';
    reason = 'only Lua is packed';
  } else {
    return { language: null, primary: [], secondary: [], reason: 'no script members' };
  }
  const isPrimary = (s) => (language === 'lua' ? normMember(s).endsWith('.lua') : normMember(s).endsWith('.j'));
  return {
    language,
    primary: scripts.all.filter(isPrimary),
    secondary: scripts.all.filter((s) => !isPrimary(s)),
    reason,
  };
}

// Why a secondary script is not gated — used verbatim in WARN lines.
function secondaryNote(rel, language) {
  return `secondary ${rel} present in a ${language === 'lua' ? 'Lua' : 'JASS'} map — not the map script, unchecked`;
}

module.exports = {
  SCRIPT_MEMBERS, normMember, isScriptMember, findScriptMembers,
  resolvePrimary, secondaryNote,
};
