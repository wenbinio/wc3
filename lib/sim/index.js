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

// Pull the object-data facts the mocks consume out of the map source's
// objects-*.json. Map-delta ONLY: an un-overridden field gets a documented
// neutral default in natives.js, never a fabricated Blizzard value — a
// custom clone inherits from the STOCK base (WE semantics), so its
// un-overridden fields are neutral too, never the modified original's.
// Skin twins (objects-*-skin.json, Reforged moves display fields there)
// merge onto the same rawcode without overriding main-file values, matching
// lib/constants.js. `uabi`/`ubui` are comma-separated rawcode lists; an
// explicit empty string means an explicitly EMPTY set (same effective value
// as no override, since stock kits are never fabricated).
function readObjectData(mapDir) {
  const od = {
    itemGold: new Map(), itemName: new Map(), itemCharges: new Map(),
    unitMaxLife: new Map(), unitName: new Map(),
    unitBaseDamage: new Map(), unitDefense: new Map(), unitMoveSpeed: new Map(),
    unitGoldCost: new Map(), unitLumberCost: new Map(),
    unitAbilities: new Map(), // typeId -> [abilityId] granted at spawn (uabi)
    unitBuilds: new Map(),    // typeId -> [typeStr] build list (ubui) — queryable only
    unitStr: new Map(), unitAgi: new Map(), unitInt: new Map(), unitLevel: new Map(),
    destMaxLife: new Map(), destName: new Map(),
    doodadOnly: new Set(), // types the map's own data classifies as decorative
  };
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
  // main file: last write wins (as before); skin file: never override main
  const set = (map, k, v) => { map.set(k, v); };
  const setIfAbsent = (map, k, v) => { if (!map.has(k)) map.set(k, v); };
  const rawcodeList = (v) => (typeof v === 'string'
    ? v.split(',').map((s) => s.trim()).filter((s) => s.length === 4) : []);

  const unitHandler = (put) => (typeId, mods) => {
    for (const m of mods) {
      switch (m.id) {
        case 'uhpm': put(od.unitMaxLife, typeId, m.value); break;
        case 'unam': put(od.unitName, typeId, resolveTrigstr(m.value, strings)); break;
        case 'ua1b': put(od.unitBaseDamage, typeId, m.value); break;
        case 'udef': put(od.unitDefense, typeId, m.value); break;
        case 'umvs': put(od.unitMoveSpeed, typeId, m.value); break;
        case 'ugol': put(od.unitGoldCost, typeId, m.value); break;
        case 'ulum': put(od.unitLumberCost, typeId, m.value); break;
        case 'ulev': put(od.unitLevel, typeId, m.value); break;
        case 'ustr': put(od.unitStr, typeId, m.value); break;
        case 'uagi': put(od.unitAgi, typeId, m.value); break;
        case 'uini': put(od.unitInt, typeId, m.value); break;
        case 'uabi': put(od.unitAbilities, typeId, rawcodeList(m.value).map(fourCC)); break;
        case 'ubui': put(od.unitBuilds, typeId, rawcodeList(m.value)); break;
        default: break;
      }
    }
  };
  scan('objects-units.json', unitHandler(set));
  scan('objects-units-skin.json', unitHandler(setIfAbsent));

  const itemHandler = (put) => (typeId, mods) => {
    for (const m of mods) {
      if (m.id === 'igol') put(od.itemGold, typeId, m.value);
      if (m.id === 'unam') put(od.itemName, typeId, resolveTrigstr(m.value, strings));
      if (m.id === 'iuse') put(od.itemCharges, typeId, m.value);
    }
  };
  scan('objects-items.json', itemHandler(set));
  scan('objects-items-skin.json', itemHandler(setIfAbsent));

  scan('objects-destructables.json', (typeId, mods) => {
    for (const m of mods) {
      if (m.id === 'bhps') od.destMaxLife.set(typeId, m.value);
      if (m.id === 'bnam') od.destName.set(typeId, resolveTrigstr(m.value, strings));
    }
  });
  scan('objects-doodads.json', (typeId) => { od.doodadOnly.add(typeId); });
  return od;
}

// Instantiate destructable records from the map source's OWN doodads.json
// (war3map.doo carries doodads AND destructables with no class bit; the
// classification policy + honesty notes live in lib/sim/natives.js's header:
// types the map's object data marks as doodads are decorative and skipped,
// everything else is modeled as a destructable). Placement `life` is the
// .doo percent field (absent = 100%). Uses the unrecorded natives — like
// the game, load-time placement is engine work, not script calls.
function placeDestructables(sim, mapDir) {
  const doo = readJsonIf(path.join(mapDir, 'doodads.json'));
  if (!doo || !Array.isArray(doo.regular)) return;
  for (const d of doo.regular) {
    if (!d || typeof d.type !== 'string' || d.type.length !== 4 || !Array.isArray(d.position)) continue;
    const typeId = fourCC(d.type);
    if (sim.objectData.doodadOnly.has(typeId)) continue;
    const h = sim.natives.CreateDestructable(typeId, d.position[0], d.position[1], 0, 1, 0);
    const rec = sim.destructables.get(h);
    const pct = typeof d.life === 'number' ? d.life : 100;
    rec.life = rec.maxLife * (pct / 100);
    rec.alive = rec.life > 0;
    rec.placementId = d.id;
  }
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

  // destructables exist before the script runs (the game places them from
  // war3map.doo at load, before main() — an enum in main() must see them)
  if (mapDir) placeDestructables(sim, mapDir);

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

  sim.dests = function dests(typeStr) {
    const out = [];
    for (const d of sim.destructables.values()) {
      if (d.removed) continue;
      if (typeStr && d.typeStr !== typeStr) continue;
      out.push(d);
    }
    return out;
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
