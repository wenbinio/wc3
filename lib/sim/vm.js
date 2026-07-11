'use strict';
// Thin fengari (pure-JS Lua 5.3 — the same Lua version WC3 runs) wrapper for
// the headless logic-test harness. Owns all JS<->Lua marshalling so
// lib/sim/natives.js can stay plain JavaScript:
//   * JS numbers/strings/booleans/functions/arrays <-> Lua values
//   * Lua functions crossing into JS become persistent callable wrappers
//     (registry refs) — how TriggerAddAction/TimerStart handlers survive
//   * a _G __index hook so unknown globals resolve through a JS factory
//     (the auto-stub native recorder)
// Handles (units, players, timers, ...) are plain Lua STRINGS ("unit:3").
// Strings compare by value, hash as table keys and are printable in call
// logs — none of lightuserdata's identity pitfalls.

const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require('fengari');

class LuaError extends Error {}

// Wrapper forcing a number to cross into Lua as a FLOAT even when integral —
// natives typed 'real' in common.j must behave like the game's
// (GetUnitX -> 50.0, so tostring/concat match real WC3 output).
class LuaFloat {
  constructor(v) { this.v = v; }
}
const real = (v) => new LuaFloat(v);

function createVM() {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);

  function pushValue(v) {
    switch (typeof v) {
      case 'undefined': lua.lua_pushnil(L); return;
      case 'boolean': lua.lua_pushboolean(L, v); return;
      case 'number':
        // integers must stay integers: Lua 5.3 '//', '%d' matching and
        // string concat ("50" not "50.0") all depend on the subtype
        if (Number.isInteger(v)) lua.lua_pushinteger(L, v);
        else lua.lua_pushnumber(L, v);
        return;
      case 'string': lua.lua_pushstring(L, to_luastring(v)); return;
      case 'function': pushJsFunction(v); return;
      case 'object':
        if (v === null) { lua.lua_pushnil(L); return; }
        if (v instanceof LuaFloat) { lua.lua_pushnumber(L, v.v); return; }
        if (v.__luaRef !== undefined) { // Lua function wrapper going back in
          lua.lua_rawgeti(L, lua.LUA_REGISTRYINDEX, v.__luaRef);
          return;
        }
        if (Array.isArray(v)) {
          lua.lua_createtable(L, v.length, 0);
          v.forEach((item, i) => { pushValue(item); lua.lua_rawseti(L, -2, i + 1); });
          return;
        }
        lua.lua_createtable(L, 0, Object.keys(v).length);
        for (const [k, item] of Object.entries(v)) {
          pushValue(item);
          lua.lua_setfield(L, -2, to_luastring(k));
        }
        return;
      default:
        throw new Error(`cannot push JS value of type ${typeof v} into Lua`);
    }
  }

  // Wrap a Lua function at stack idx into a persistent JS callable.
  function wrapLuaFunction(idx) {
    lua.lua_pushvalue(L, idx);
    const ref = lauxlib.luaL_ref(L, lua.LUA_REGISTRYINDEX);
    const fn = (...args) => {
      lua.lua_rawgeti(L, lua.LUA_REGISTRYINDEX, ref);
      return protectedCall(args.length, (n) => { args.forEach(pushValue); return n; });
    };
    fn.__luaRef = ref;
    return fn;
  }

  function toValue(idx) {
    switch (lua.lua_type(L, idx)) {
      case lua.LUA_TNIL: case lua.LUA_TNONE: return undefined;
      case lua.LUA_TBOOLEAN: return lua.lua_toboolean(L, idx);
      case lua.LUA_TNUMBER:
        return lua.lua_isinteger(L, idx) ? Number(lua.lua_tointeger(L, idx)) : lua.lua_tonumber(L, idx);
      case lua.LUA_TSTRING: return to_jsstring(lua.lua_tostring(L, idx));
      case lua.LUA_TFUNCTION: return wrapLuaFunction(idx);
      default:
        // tables/userdata crossing into natives is not part of the mocked
        // API surface; hand back an opaque marker so logs stay readable
        return { __luaType: lua.lua_typename(L, lua.lua_type(L, idx)) };
    }
  }

  function pushJsFunction(fn) {
    lua.lua_pushcfunction(L, function (Ls) {
      const n = lua.lua_gettop(Ls);
      const args = [];
      for (let i = 1; i <= n; i++) args.push(toValue(i));
      let results;
      try {
        results = fn(...args);
      } catch (e) {
        // surface JS errors as Lua errors (catchable by the pcall below,
        // with a traceback pointing at the map-script call site)
        lua.lua_pushstring(Ls, to_luastring(`[sim] ${e && e.message || e}`));
        lua.lua_error(Ls);
        return 0; // unreachable
      }
      if (results === undefined) return 0;
      if (Array.isArray(results) && results.__multi === true) {
        results.forEach(pushValue);
        return results.length;
      }
      pushValue(results);
      return 1;
    });
  }

  // pcall with a debug.traceback message handler; fn(nargs) must push the
  // arguments and return their count. The callee is expected just below.
  function protectedCall(nargs, pushArgs) {
    const base = lua.lua_gettop(L) - 1; // index of the function
    lua.lua_getglobal(L, to_luastring('debug'));
    lua.lua_getfield(L, -1, to_luastring('traceback'));
    lua.lua_remove(L, -2);
    lua.lua_insert(L, base + 1); // message handler below the function
    if (pushArgs) pushArgs(nargs); else nargs = 0;
    const status = lua.lua_pcall(L, nargs, lua.LUA_MULTRET, base + 1);
    lua.lua_remove(L, base + 1); // drop the handler
    if (status !== lua.LUA_OK) {
      const msg = to_jsstring(lua.lua_tostring(L, -1) || to_luastring('unknown Lua error'));
      lua.lua_settop(L, base);
      throw new LuaError(msg);
    }
    const nres = lua.lua_gettop(L) - base;
    const out = [];
    for (let i = 0; i < nres; i++) out.push(toValue(base + 1 + i));
    lua.lua_settop(L, base);
    return out;
  }

  const vm = {
    L,
    LuaError,

    // Run a chunk of Lua source. Throws LuaError with traceback on failure.
    run(code, chunkname) {
      const status = lauxlib.luaL_loadbuffer(
        L, to_luastring(code), null, to_luastring(chunkname || 'chunk'));
      if (status !== lua.LUA_OK) {
        const msg = to_jsstring(lua.lua_tostring(L, -1));
        lua.lua_pop(L, 1);
        throw new LuaError(msg);
      }
      return protectedCall(0, null);
    },

    setGlobal(name, value) {
      pushValue(value);
      lua.lua_setglobal(L, to_luastring(name));
    },

    getGlobal(name) {
      lua.lua_getglobal(L, to_luastring(name));
      const v = toValue(-1);
      lua.lua_pop(L, 1);
      return v;
    },

    hasGlobal(name) { // rawget: does not trip the __index auto-stub hook
      lua.lua_pushglobaltable(L);
      lua.lua_pushstring(L, to_luastring(name));
      lua.lua_rawget(L, -2);
      const present = lua.lua_type(L, -1) !== lua.LUA_TNIL;
      lua.lua_pop(L, 2);
      return present;
    },

    callGlobal(name, ...args) {
      lua.lua_getglobal(L, to_luastring(name));
      if (lua.lua_type(L, -1) !== lua.LUA_TFUNCTION) {
        lua.lua_pop(L, 1);
        throw new LuaError(`global '${name}' is not a function`);
      }
      return protectedCall(args.length, () => { args.forEach(pushValue); return args.length; });
    },

    // _G metatable __index -> factory(name). The produced value is rawset
    // into _G (memoized: same name === same value forever after), so the
    // factory runs at most once per unknown global.
    installIndexHook(factory) {
      this.setGlobal('__SIM_INDEX_FACTORY', (name) =>
        (typeof name === 'string' ? factory(name) : undefined));
      this.run(`
        setmetatable(_G, { __index = function(t, k)
          if type(k) ~= 'string' then return nil end
          local v = __SIM_INDEX_FACTORY(k)
          if v ~= nil then rawset(t, k, v) end
          return v
        end })
      `, '=simhook');
    },
  };

  return vm;
}

module.exports = { createVM, LuaError, LuaFloat, real };
