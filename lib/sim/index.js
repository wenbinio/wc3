'use strict';
// Headless WC3 map logic-test harness: EXECUTES a map's PACKED war3map.lua
// (source script + the generated blocks build-map ships) inside a real Lua
// 5.3 VM (fengari) against mocked natives (lib/sim/natives.js), so map
// logic — grace periods, victory conditions, tax math, spawn wiring, chat
// commands — can be exercised and asserted on without a game client.
//
//   const { loadMap } = require('./lib/sim');
//   const sim = loadMap('maps/northreach');          // runs config() + main()
//   sim.chat(0, '-test'); sim.chat(0, '-gold 500');
//   sim.advance(40);                                  // virtual seconds
//   assert.equal(sim.player(0).gold, 475);
//
// loadMap accepts a MAP SOURCE DIR (the packed script is assembled through
// the real build pipeline — lib/source.js sourceToExtracted — so tests
// exercise exactly what build-map ships, generated CreateAllUnits and all)
// or a path to an already-packed .lua file. JASS maps are not supported.
//
// Determinism: virtual clock starts at 0 (time of day 8.00), timers fire in
// (dueTime, startOrder) order, RNG is seeded (opts.seed, default 42).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createVM, LuaError } = require('./vm');
const { installNatives, fourCC, fourCCToStr, convSentinel } = require('./natives');
const CONSTANTS = require('./data/jass-constants.json').constants;

function readJsonIf(p) {
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}

// TRIGSTR_012 -> strings.json entry (build-source dialect: {"12": {value}})
function resolveTrigstr(value, strings) {
  if (typeof value !== 'string' || !strings) return value;
  const m = value.match(/^TRIGSTR_(\d+)$/);
  if (!m) return value;
  const entry = strings[String(Number(m[1]))];
  return entry && typeof entry.value === 'string' ? entry.value : value;
}

// Pull the object-data facts the mocks consume (item gold cost, unit max HP,
// unit display names) out of the map source's objects-*.json.
function readObjectData(mapDir) {
  const od = { itemGold: new Map(), unitMaxLife: new Map(), unitName: new Map() };
  const strings = readJsonIf(path.join(mapDir, 'strings.json'));
  const scan = (file, handler) => {
    const json = readJsonIf(path.join(mapDir, file));
    if (!json) return;
    for (const table of [json.original || {}, json.custom || {}]) {
      for (const [key, mods] of Object.entries(table)) {
        const id = key.split(':')[0]; // "I000:ches" -> I000 ; original keys are bare
        if (id.length !== 4 || !Array.isArray(mods)) continue;
        handler(fourCC(id), mods);
      }
    }
  };
  scan('objects-items.json', (typeId, mods) => {
    for (const m of mods) if (m.id === 'igol') od.itemGold.set(typeId, m.value);
  });
  scan('objects-units.json', (typeId, mods) => {
    for (const m of mods) {
      if (m.id === 'uhpm') od.unitMaxLife.set(typeId, m.value);
      if (m.id === 'unam') od.unitName.set(typeId, resolveTrigstr(m.value, strings));
    }
  });
  return od;
}

// Assemble the PACKED script the way build-map does (generated blocks
// included) by running the map source through the real pipeline step.
function assemblePackedLua(mapDir) {
  const { sourceToExtracted } = require('../source');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'w3xsim-'));
  try {
    sourceToExtracted(mapDir, tmp);
    const luaPath = path.join(tmp, 'war3map.lua');
    if (!fs.existsSync(luaPath)) {
      throw new Error(`${mapDir}: pipeline produced no war3map.lua — JASS maps are not supported by the logic sim`);
    }
    return fs.readFileSync(luaPath, 'utf8');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function resolveConstant(name) {
  const spec = CONSTANTS[name];
  if (!spec) throw new Error(`unknown JASS constant: ${name}`);
  if (spec.conv !== undefined) return convSentinel(spec.conv, spec.arg);
  if (spec.call !== undefined) return { GetPlayerNeutralAggressive: 24, GetBJPlayerNeutralVictim: 25, GetBJPlayerNeutralExtra: 26, GetPlayerNeutralPassive: 27, GetBJMaxPlayers: 24, GetBJMaxPlayerSlots: 28 }[spec.call];
  return spec.value;
}

// opts:
//   users        number n (players 0..n-1) or array of player ids to seat as
//                PLAYING human slots; default = info.json players with
//                type 1 (human), fallback [0,1,2,3]
//   config/main  set false to skip calling the entry point
//   seed         RNG seed (default 42)
//   script       raw Lua text (overrides target entirely; for harness tests)
function loadMap(target, opts) {
  opts = opts || {};
  let script, mapDir = null, chunkname = '@war3map.lua';

  if (opts.script !== undefined) {
    script = opts.script;
    chunkname = '@<inline>';
  } else if (fs.statSync(target).isDirectory()) {
    mapDir = target;
    const info = readJsonIf(path.join(mapDir, 'info.json'));
    if (info && info.scriptLanguage === 0) {
      throw new Error(`${mapDir}: scriptLanguage 0 (JASS) — the logic sim only executes Lua maps`);
    }
    script = assemblePackedLua(mapDir);
  } else {
    if (!/\.lua$/i.test(target)) throw new Error(`loadMap: expected a map source dir or .lua file, got ${target}`);
    script = fs.readFileSync(target, 'utf8');
    chunkname = '@' + path.basename(target);
  }

  const vm = createVM();
  const sim = {
    seed: opts.seed,
    objectData: mapDir ? readObjectData(mapDir) : undefined,
    mapDir,
  };
  installNatives(vm, sim);
  sim.vm = vm;

  // ---- seat the lobby -----------------------------------------------------
  let users = opts.users;
  let computers = [];
  if (users === undefined && mapDir) {
    const info = readJsonIf(path.join(mapDir, 'info.json'));
    if (info && Array.isArray(info.players) && info.players.length) {
      users = info.players.filter((p) => p.type === 1).map((p) => p.playerNum);
      computers = info.players.filter((p) => p.type === 2).map((p) => p.playerNum);
    }
  }
  if (users === undefined) users = [0, 1, 2, 3];
  if (typeof users === 'number') users = Array.from({ length: users }, (_, i) => i);
  const S = sim.sentinels;
  for (const pid of users) {
    sim.players[pid].slotState = S.SLOT_PLAYING;
    sim.players[pid].controller = S.CONTROL_USER;
  }
  for (const pid of computers) {
    sim.players[pid].slotState = S.SLOT_PLAYING;
    sim.players[pid].controller = S.CONTROL_COMPUTER;
  }
  sim.users = users;

  // ---- run the script + entry points (the game's load order) --------------
  vm.run(script, chunkname);
  if (opts.config !== false && vm.hasGlobal('config')) vm.callGlobal('config');
  if (opts.main !== false && vm.hasGlobal('main')) vm.callGlobal('main');

  // ---- harness readers ------------------------------------------------------
  sim.player = function player(i) {
    const p = sim.players[i];
    if (!p) throw new Error(`sim.player(${i}): no such slot`);
    return {
      idx: p.idx,
      handle: p.handle,
      get name() { return p.name; },
      get gold() { return p.states.get(S.STATE_GOLD) || 0; },
      get lumber() { return p.states.get(S.STATE_LUMBER) || 0; },
      get slotState() { return p.slotState; },
      get controller() { return p.controller; },
      get team() { return p.team; },
      state(constName) { return p.states.get(resolveConstant(constName)) || 0; },
      setGold(v) { p.states.set(S.STATE_GOLD, v); },
      setLumber(v) { p.states.set(S.STATE_LUMBER, v); },
      allianceTo(j, typeName) {
        return p.alliances.get(`${j}|${resolveConstant(typeName || 'ALLIANCE_PASSIVE')}`) || false;
      },
      get result() { return sim.results[p.idx] || null; },
    };
  };

  sim.alliance = (i, j, typeName) => sim.player(i).allianceTo(j, typeName);

  sim.unitsOf = function unitsOf(pid, typeStr) {
    const idx = typeof pid === 'number' ? pid : Number(String(pid).split(':')[1]);
    const out = [];
    for (const u of sim.units.values()) {
      if (u.removed || u.ownerIdx !== idx) continue;
      if (typeStr && u.typeStr !== typeStr) continue;
      out.push(u);
    }
    return out;
  };

  sim.allUnits = function allUnits(typeStr) {
    const out = [];
    for (const u of sim.units.values()) {
      if (u.removed) continue;
      if (typeStr && u.typeStr !== typeStr) continue;
      out.push(u);
    }
    return out;
  };

  sim.findUnit = function findUnit(typeStr, pid) {
    const pool = pid === undefined ? sim.allUnits(typeStr) : sim.unitsOf(pid, typeStr);
    return pool.find((u) => u.alive) || pool[0] || null;
  };

  sim.itemsByType = function itemsByType(typeStr) {
    const out = [];
    for (const it of sim.items.values()) {
      if (!it.removed && it.typeStr === typeStr) out.push(it);
    }
    return out;
  };

  sim.callsOf = (name) => sim.calls.filter((c) => c.name === name);
  sim.messagesTo = (pid) => sim.messages.filter((m) => m.pid === pid);
  sim.messagesMatching = (re) => sim.messages.filter((m) => re.test(m.text));
  sim.constant = resolveConstant;
  sim.global = (name) => vm.getGlobal(name);
  sim.call = (name, ...args) => vm.callGlobal(name, ...args);
  sim.run = (code) => vm.run(code, '@<test>');

  // convenience spawners that go through the native path (triggers fire)
  sim.createUnit = (pid, typeStr, x, y, facing) =>
    sim.units.get(sim.natives.CreateUnit(`player:${pid}`, fourCC(typeStr), x, y, facing || 0));
  sim.createItem = (typeStr, x, y) =>
    sim.items.get(sim.natives.CreateItem(fourCC(typeStr), x, y));

  // coverage report: which natives ran for real vs through the auto-stub
  sim.coverage = function coverage() {
    const implemented = new Set();
    for (const c of sim.calls) if (!sim.stubbed.has(c.name)) implemented.add(c.name);
    return {
      implemented: [...implemented].sort(),
      stubbed: [...sim.stubbed.keys()].sort(),
    };
  };

  return sim;
}

module.exports = { loadMap, LuaError, fourCC, fourCCToStr };
