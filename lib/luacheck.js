'use strict';
// Lua syntax check for map scripts. WC3 (patch 1.31+/Reforged) embeds
// Lua 5.3; luaparse is a pure-JS parser whose `luaVersion: '5.3'` mode
// covers the 5.3 grammar our maps use (integer division `//`, bitwise
// operators, goto/labels) — verified against all bundled map scripts
// including the generated CreateAllUnits() block.
//
// A script that doesn't parse ships fine in the MPQ but the game silently
// drops into a black/dead map at load, so build-map refuses to pack one and
// validate-map reports it as a failure.

const luaparse = require('luaparse');

// Returns null when luaText parses, else { message, line, column }.
// line/column are 1-based and refer to the text as given — for build-map
// that is the PACKED script (source war3map.lua + generated blocks).
function checkLuaSyntax(luaText) {
  try {
    luaparse.parse(luaText, { luaVersion: '5.3', comments: false });
    return null;
  } catch (e) {
    return {
      message: String(e.message || e),
      line: typeof e.line === 'number' ? e.line : undefined,
      column: typeof e.column === 'number' ? e.column : undefined,
    };
  }
}

module.exports = { checkLuaSyntax };
