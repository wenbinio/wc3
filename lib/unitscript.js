'use strict';
// Generated unit-creation Lua. war3mapUnits.doo is EDITOR-ONLY data: the
// game itself never reads it — World Editor compiles unit placements into a
// CreateAllUnits() function inside the map script (which is why map
// protectors delete war3mapUnits.doo without breaking anything). A map built
// from JSON alone would therefore never spawn its preplaced units.
//
// build-map keeps units.json as the single source of truth: on every build
// it (re)generates a marker-delimited Lua block from units.json and appends
// it to the packed war3map.lua. The block defines CreateAllUnits() ('sloc'
// start locations are skipped — those belong in config()'s
// DefineStartLocation calls). If the map script itself never mentions
// CreateAllUnits, the block also wraps main() so the units are created right
// after the user's main() returns; scripts that want control over the timing
// (e.g. to enumerate the units during init) simply call CreateAllUnits()
// from their own main() and no wrapper is emitted.
//
// The block is stripped and regenerated on each build, so packing an
// extracted map source round-trips cleanly.

const BEGIN_MARK = '-- ### BEGIN wc3-map-toolkit generated: CreateAllUnits (from units.json) — DO NOT EDIT ###';
const END_MARK = '-- ### END wc3-map-toolkit generated: CreateAllUnits ###';

// Neutral player slots (Reforged: 0..23 players, 24 = neutral aggressive,
// 27 = neutral passive). Player(n) accepts the raw index directly.

function luaNum(n) {
  // stable, lua-parseable float formatting
  const v = Number(n);
  if (Number.isInteger(v)) return v.toFixed(1);
  return String(v);
}

// units.json -> the body lines of CreateAllUnits().
function unitCreationLines(units) {
  const lines = [];
  for (const u of units || []) {
    if (!u || u.type === 'sloc') continue; // start locations live in config()
    if (typeof u.type !== 'string' || u.type.length !== 4) continue;
    const [x, y] = u.position;
    lines.push(`    u = CreateUnit(Player(${u.player}), FourCC("${u.type}"), ${luaNum(x)}, ${luaNum(y)}, ${luaNum(u.rotation)})`);
    if (typeof u.gold === 'number') {
      lines.push(`    SetResourceAmount(u, ${u.gold})`);
    }
    if (u.hero && u.hero.level > 1) {
      lines.push(`    SetHeroLevel(u, ${u.hero.level}, false)`);
    }
    if (u.hero && u.hero.str > 0) lines.push(`    SetHeroStr(u, ${u.hero.str}, true)`);
    if (u.hero && u.hero.agi > 0) lines.push(`    SetHeroAgi(u, ${u.hero.agi}, true)`);
    if (u.hero && u.hero.int > 0) lines.push(`    SetHeroInt(u, ${u.hero.int}, true)`);
    if (u.targetAcquisition === -2) {
      lines.push('    SetUnitAcquireRange(u, 200.0)'); // WE "camp" acquisition
    } else if (typeof u.targetAcquisition === 'number' && u.targetAcquisition > 0) {
      lines.push(`    SetUnitAcquireRange(u, ${luaNum(u.targetAcquisition)})`);
    }
  }
  return lines;
}

// Full generated block. `userCallsIt` = the user script references
// CreateAllUnits itself (then no main() wrapper is added).
function generateUnitsBlock(units, userCallsIt) {
  const out = [BEGIN_MARK];
  out.push('function CreateAllUnits()');
  out.push('    local u');
  out.push(...unitCreationLines(units));
  out.push('end');
  if (!userCallsIt) {
    out.push('-- map script does not call CreateAllUnits(); run it after user main()');
    out.push('do');
    out.push('    local __wc3tk_user_main = main');
    out.push('    function main()');
    out.push('        __wc3tk_user_main()');
    out.push('        CreateAllUnits()');
    out.push('    end');
    out.push('end');
  }
  out.push(END_MARK);
  return out.join('\n') + '\n';
}

// Remove a previously generated block (idempotent rebuilds).
function stripUnitsBlock(luaText) {
  const begin = luaText.indexOf(BEGIN_MARK);
  if (begin === -1) return luaText;
  const end = luaText.indexOf(END_MARK, begin);
  if (end === -1) return luaText;
  let tail = luaText.slice(end + END_MARK.length);
  if (tail.startsWith('\n')) tail = tail.slice(1);
  return luaText.slice(0, begin).replace(/\n+$/, '\n') + tail;
}

// Strip any old generated block, then append a fresh one from units.json.
function injectUnitsIntoLua(luaText, units) {
  const user = stripUnitsBlock(luaText);
  const userCallsIt = user.includes('CreateAllUnits');
  const sep = user.endsWith('\n') ? '\n' : '\n\n';
  return user + sep + generateUnitsBlock(units, userCallsIt);
}

module.exports = { BEGIN_MARK, END_MARK, generateUnitsBlock, stripUnitsBlock, injectUnitsIntoLua };
