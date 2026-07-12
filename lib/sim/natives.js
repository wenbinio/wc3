'use strict';
// Mocked WC3 natives for the headless logic-test harness (lib/sim/).
//
// Three tiers, all recorded into sim.calls:
//   1. REAL semantics — the subsystems map logic actually branches on:
//      virtual clock + timers, players (alliances/resources/slots), units,
//      unit groups, items, triggers + events (chat, deaths, enter-region,
//      construct/upgrade/pawn), rects/regions, FourCC, deterministic RNG.
//   2. Real-but-trivial — natives whose RETURN VALUE feeds arithmetic or
//      predicates (GetCameraMargin -> 0, GetTimeOfDay -> virtual clock).
//   3. Auto-stub — every OTHER name in the real JASS API surface (the
//      native + BJ function list in data/jass-constants.json) resolves
//      through a _G __index hook to a memoized recording function returning
//      a unique opaque handle string. Stub RESULTS are strings, so a stub
//      reaching arithmetic fails loudly with the native's name instead of
//      silently corrupting the sim. Names OUTSIDE the API surface stay nil
//      (normal Lua semantics) — a map-author global read before first
//      assignment must not come back truthy.
//
// Constants come from lib/sim/data/jass-constants.json (regenerate with
// scripts/gen-jass-constants.js): handle constants are canonical sentinel
// strings derived from their common.j converter call ("playerstate:1"), so
// a map (or generated header) that re-derives PLAYER_STATE_RESOURCE_GOLD =
// ConvertPlayerState(1) gets a value identical to ours.
//
// Known limits (documented, throw-or-warn rather than mislead):
//   * TriggerSleepAction/PolledWait are recorded no-ops (no coroutine
//     threads) — none of the bundled maps use them.
//   * No pathing/combat AI: orders are recorded, units never move or fight
//     on their own — drive outcomes with sim.kill()/sim.moveUnit()/
//     sim.damage().
//
// Damage policy (UnitDamageTarget — real semantics, community-documented):
//   * FLAT application: no armor/resistance mitigation, no crit/miss/
//     evasion. Deliberately NO internal randomness — engine randomness
//     would consume or fork a map's seeded PRNG stream (gotcha 30).
//   * Event order matches the real engine: EVENT_PLAYER_UNIT_DAMAGING
//     (1.31 pre-mitigation event) fires first, then EVENT_PLAYER_UNIT_DAMAGED,
//     BOTH before hit points are deducted. Since the sim has no mitigation
//     the two see the same pending amount. Inside either handler
//     GetTriggerUnit = damaged unit, GetEventDamage = pending amount,
//     BlzSetEventDamage(x) REPLACES the pending amount (the value applied
//     afterwards; a negative pending amount heals, clamped to max life).
//   * If life reaches 0 the existing death path runs with kill credit to
//     the damage source (same machinery as sim.kill: death events fire with
//     GetKillingUnit = source). Kill threshold is life <= 0, matching
//     SetWidgetLife/SetUnitState — not the engine's 0.405 fuzz.
//   * Recursion: a DAMAGING/DAMAGED handler may itself deal damage, nested
//     up to MAX_DAMAGE_DEPTH (8). Deeper nesting hard-errors naming the
//     running trigger — an infinite damage loop must fail loudly, never
//     hang the sim.
//
// Destructables (real semantics, instantiated by lib/sim/index.js from the
// map source's OWN doodads.json — never from Blizzard base data):
//   * war3map.doo mixes doodads and destructables with no class bit. The
//     sim classifies by the map's own object data: a type present in
//     objects-doodads.json is decorative (not instantiated); everything
//     else becomes a destructable record. NOTE this default is the INVERSE
//     of lib/constants.js's naming default (DOOD_): for the sim,
//     under-modeling (tree kills invisible) is the worse failure, and all
//     bundled maps' doodads.json entries are in fact destructable trees.
//     Max life/name come from objects-destructables.json (bhps/bnam) when
//     overridden, neutral default 100/typeStr otherwise; the placement's
//     own life percent applies on top.
//   * EnumDestructablesInRect enumerates dead (not removed) destructables
//     too, like the game — filter on GetDestructableLife if you need
//     the living. The `special` doodads list is not modeled.
//   * Death event surface: TriggerRegisterDeathEvent(trig, widget) — on a
//     destructable fires with GetTriggerDestructable/GetDyingDestructable/
//     GetTriggerWidget; on a unit it is the plain unit-death event.
//     TriggerRegisterDestDeathInRegionEvent registers the first 64
//     destructables in the rect (the real BJ's bj_MAX_DEST_IN_REGION_EVENTS
//     cap).
//
// Map-delta object-data stats seeded at unit spawn (read by
// lib/sim/index.js readObjectData; un-overridden field = the documented
// NEUTRAL default in parentheses, never a fabricated Blizzard value):
//   uhpm max life (100) · ua1b base damage (0; BlzGet/SetUnitBaseDamage —
//   bookkeeping only, UnitDamageTarget stays FLAT and never reads it) ·
//   udef armor (0; BlzGet/SetUnitArmor — bookkeeping only, no mitigation) ·
//   umvs move speed (270; Get/SetUnitMoveSpeed, GetUnitDefaultMoveSpeed) ·
//   ulev level (1; GetUnitLevel — heroes share the same field with
//   Get/SetHeroLevel, so generated CreateAllUnits SetHeroLevel calls
//   (gotcha 21) override the object-data default, and a placement that
//   omits them keeps it) · ustr/uagi/uini hero stats (0; same override
//   interplay) · uabi spawn abilities (EMPTY set — see below) · ubui build
//   list (unit record .builds + sim.objectData.unitBuilds; queryable only,
//   NO construction semantics) · ugol/ulum unit costs
//   (sim.objectData.unitGoldCost/.unitLumberCost; no JASS readback natives
//   exist, so queryable from JS tests only). Items: igol pawn value (0) ·
//   unam name (typeStr; GetItemName) · iuse charges (0; Get/SetItemCharges).
//
// Abilities & spell EVENTS (bookkeeping, NOT an ability engine):
//   * A unit's ability set is real state (Map abilityId -> level) seeded at
//     spawn from the map's OWN uabi delta. Map-delta doctrine: a stock unit
//     with no uabi override has an EMPTY known-ability set — the sim never
//     fabricates Blizzard base kits (a stock Paladin does NOT know Holy
//     Light here); sim.cast's {force:true} option exists for exactly that
//     case. UnitAdd/RemoveAbility return real booleans (add: false when
//     already known; remove: false when absent); GetUnitAbilityLevel is 0
//     when absent; Set/Inc/DecUnitAbilityLevel return the new level (0 and
//     no-op when absent; levels clamp at >= 1). SelectHeroSkill learns or
//     levels the skill (no skill-point pool) and fires the HERO_SKILL event
//     (GetLearnedSkill/GetLearnedSkillLevel/GetLearningUnit).
//   * No cooldowns, mana costs, targeting rules or spell EFFECTS — the
//     modern map pattern is "dummy ability + trigger does the work", and
//     the TRIGGER is what these events let you test.
//   * sim.cast(unit, abil, target?, opts?) models a COMPLETED cast: the
//     five spell events fire in the engine's documented order
//       CHANNEL -> CAST -> EFFECT -> FINISH -> ENDCAST
//     (community jassdoc/Hive-documented sequence: CHANNEL when the cast is
//     committed, CAST when the cast point commits, EFFECT when the spell
//     actually happens — where most "on cast" triggers belong — FINISH only
//     on natural completion, ENDCAST always when casting ends; the sim has
//     no interrupt path, so all five always fire). target = unit/
//     destructable/item record-or-handle, {x, y} point, or omitted
//     (no-target). Getters inside any of the five: GetSpellAbilityId,
//     GetSpellAbilityUnit = GetTriggerUnit = caster, GetSpellTargetUnit/
//     -Destructable/-Item (nil unless that kind was targeted),
//     GetSpellTargetX/Y (the target point; the widget's position for widget
//     targets; the CASTER's own position for no-target casts). Casting an
//     ability the unit does not know hard-errors (test-authoring bug)
//     unless {force: true}.
//
// Items & 6-slot inventories (real semantics):
//   * Every unit record carries a 6-slot inventory (slot indices 0..5 like
//     the natives). UnitInventorySize returns a flat 6 — the real size
//     derives from the unit's inventory ABILITY (Blizzard data we never
//     read); all bundled carriers use the stock 6-slot AInv.
//   * UnitAddItem (first free slot; false when full or the item is removed)
//     / UnitAddItemById (created at the unit; a full inventory leaves it on
//     the ground, like the game — the item handle returns either way) /
//     UnitAddItemToSlotById (exact slot; false when occupied/out of range)
//     fire EVENT_PLAYER_UNIT_PICKUP_ITEM + the EVENT_UNIT_PICKUP_ITEM twin
//     on success. UnitRemoveItem/UnitRemoveItemFromSlot drop at the unit's
//     feet and fire ..._DROP_ITEM. UnitUseItem (and sim.useItem) fires
//     ..._USE_ITEM with NO consumption or charge decrement — whether an
//     item is perishable/charged is Blizzard data; drive charges explicitly
//     with SetItemCharges. Getters: GetManipulatedItem +
//     GetManipulatingUnit (= GetTriggerUnit).
//   * sim.sell(shop, buyer, itemOrType) models a shop purchase: fires
//     ..._SELL_ITEM dispatched to the SHOP owner's triggers (GetSoldItem,
//     GetSellingUnit = shop = GetTriggerUnit, GetBuyingUnit = buyer), then
//     the normal pickup path into the buyer's inventory (PICKUP fires on
//     purchase, like the game; a full buyer leaves the item at its feet,
//     no PICKUP). sim.pawn (the reverse flow) is unchanged from WP-B1 —
//     pays floor(igol/2), removes the item (now also vacating its carrier's
//     slot), fires ..._PAWN_ITEM.
//   * Death does NOT drop inventory (hero-vs-unit drop rules are Blizzard
//     data); a dead unit's items stay attached until removed explicitly.

const { real } = require('./vm');
const DATA = require('./data/jass-constants.json');
const CONSTANTS = DATA.constants;
const API_FUNCTIONS = new Set(DATA.functions);

// Reforged slot layout (matches lib/unitscript.js: 0..23 players,
// 24 = neutral aggressive, 27 = neutral passive).
const NUM_SLOTS = 28;
const CALLS = {
  GetPlayerNeutralAggressive: 24,
  GetBJPlayerNeutralVictim: 25,
  GetBJPlayerNeutralExtra: 26,
  GetPlayerNeutralPassive: 27,
  GetBJMaxPlayers: 24,
  GetBJMaxPlayerSlots: 28,
};
const DAY_RATE = 24 / 480; // default WC3 clock: full day = 480 real seconds
const MAX_CALL_LOG = 500000;
// Damage handlers may deal damage (nested); deeper than this hard-errors
// (recursion policy in the header comment above).
const MAX_DAMAGE_DEPTH = 8;
// TriggerRegisterDestDeathInRegionEvent registers at most this many, like
// the real BJ's bj_MAX_DEST_IN_REGION_EVENTS.
const MAX_DEST_DEATH_EVENTS_IN_REGION = 64;

function fourCC(s) {
  if (typeof s !== 'string' || s.length !== 4) {
    throw new Error(`FourCC expects a 4-char string, got ${JSON.stringify(s)}`);
  }
  let v = 0;
  for (const ch of s) v = v * 256 + (ch.charCodeAt(0) & 0xff);
  return v;
}

function fourCCToStr(v) {
  return String.fromCharCode((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
}

// "ConvertPlayerState" + 1 -> "playerstate:1" — the canonical handle-constant
// sentinel. Distinct, hashable, printable, stable across runs.
function convSentinel(convName, arg) {
  return convName.replace(/^Convert/, '').toLowerCase() + ':' + arg;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Sentinels the natives themselves branch on.
const S = {
  PU_DEATH: convSentinel('ConvertPlayerUnitEvent', 20),
  PU_DAMAGED: convSentinel('ConvertPlayerUnitEvent', 308),
  PU_DAMAGING: convSentinel('ConvertPlayerUnitEvent', 315),
  UE_DAMAGED: convSentinel('ConvertUnitEvent', 52),
  UE_DAMAGING: convSentinel('ConvertUnitEvent', 314),
  PU_CONSTRUCT_FINISH: convSentinel('ConvertPlayerUnitEvent', 28),
  PU_UPGRADE_FINISH: convSentinel('ConvertPlayerUnitEvent', 31),
  PU_PAWN_ITEM: convSentinel('ConvertPlayerUnitEvent', 277),
  PU_HERO_SKILL: convSentinel('ConvertPlayerUnitEvent', 42),
  UE_HERO_SKILL: convSentinel('ConvertUnitEvent', 79),
  PU_SPELL_CHANNEL: convSentinel('ConvertPlayerUnitEvent', 272),
  PU_SPELL_CAST: convSentinel('ConvertPlayerUnitEvent', 273),
  PU_SPELL_EFFECT: convSentinel('ConvertPlayerUnitEvent', 274),
  PU_SPELL_FINISH: convSentinel('ConvertPlayerUnitEvent', 275),
  PU_SPELL_ENDCAST: convSentinel('ConvertPlayerUnitEvent', 276),
  UE_SPELL_CHANNEL: convSentinel('ConvertUnitEvent', 289),
  UE_SPELL_CAST: convSentinel('ConvertUnitEvent', 290),
  UE_SPELL_EFFECT: convSentinel('ConvertUnitEvent', 291),
  UE_SPELL_FINISH: convSentinel('ConvertUnitEvent', 292),
  UE_SPELL_ENDCAST: convSentinel('ConvertUnitEvent', 293),
  PU_PICKUP_ITEM: convSentinel('ConvertPlayerUnitEvent', 49),
  PU_DROP_ITEM: convSentinel('ConvertPlayerUnitEvent', 48),
  PU_USE_ITEM: convSentinel('ConvertPlayerUnitEvent', 50),
  PU_SELL_ITEM: convSentinel('ConvertPlayerUnitEvent', 271),
  UE_PICKUP_ITEM: convSentinel('ConvertUnitEvent', 86),
  UE_DROP_ITEM: convSentinel('ConvertUnitEvent', 85),
  UE_USE_ITEM: convSentinel('ConvertUnitEvent', 87),
  UE_SELL_ITEM: convSentinel('ConvertUnitEvent', 288),
  UE_DEATH: convSentinel('ConvertUnitEvent', 53),
  PE_LEAVE: convSentinel('ConvertPlayerEvent', 15),
  PE_CHAT: convSentinel('ConvertPlayerEvent', 16),
  SLOT_EMPTY: convSentinel('ConvertPlayerSlotState', 0),
  SLOT_PLAYING: convSentinel('ConvertPlayerSlotState', 1),
  SLOT_LEFT: convSentinel('ConvertPlayerSlotState', 2),
  CONTROL_USER: convSentinel('ConvertMapControl', 0),
  CONTROL_COMPUTER: convSentinel('ConvertMapControl', 1),
  CONTROL_NONE: convSentinel('ConvertMapControl', 5),
  STATE_GOLD: convSentinel('ConvertPlayerState', 1),
  STATE_LUMBER: convSentinel('ConvertPlayerState', 2),
  UNIT_STATE_LIFE: convSentinel('ConvertUnitState', 0),
  UNIT_STATE_MAX_LIFE: convSentinel('ConvertUnitState', 1),
  UNIT_STATE_MANA: convSentinel('ConvertUnitState', 2),
  UNIT_STATE_MAX_MANA: convSentinel('ConvertUnitState', 3),
  UNIT_TYPE_HERO: convSentinel('ConvertUnitType', 0),
  UNIT_TYPE_DEAD: convSentinel('ConvertUnitType', 1),
  UNIT_TYPE_STRUCTURE: convSentinel('ConvertUnitType', 2),
};

// Natives whose common.j return type is 'real' — their results cross into
// Lua as floats even when integral (see the install loop below).
const REAL_RETURNS = new Set([
  'GetTimeOfDay', 'GetTimeOfDayScale', 'GetRandomReal',
  'GetUnitX', 'GetUnitY', 'GetUnitFacing',
  'GetWidgetLife', 'GetUnitState', 'GetEventDamage',
  'GetDestructableLife', 'GetDestructableMaxLife',
  'GetDestructableX', 'GetDestructableY',
  'GetUnitAcquireRange', 'GetUnitMoveSpeed', 'GetUnitDefaultMoveSpeed',
  'TimerGetElapsed', 'TimerGetRemaining', 'TimerGetTimeout',
  'GetRectMinX', 'GetRectMinY', 'GetRectMaxX', 'GetRectMaxY',
  'GetRectCenterX', 'GetRectCenterY',
  'GetStartLocationX', 'GetStartLocationY',
  'GetItemX', 'GetItemY',
  'GetSpellTargetX', 'GetSpellTargetY', 'BlzGetUnitArmor',
  'GetCameraMargin', 'GetCameraTargetPositionX', 'GetCameraTargetPositionY',
]);

function installNatives(vm, sim) {
  // ------------------------------------------------------------- sim state
  sim.now = 0;
  sim.calls = [];
  sim.callsDropped = 0;
  sim.messages = [];
  sim.prints = [];
  sim.orders = [];
  sim.results = {};          // pid -> 'victory' | 'defeat'
  sim.stubbed = new Map();   // name -> call count (auto-stub tier)
  sim.units = new Map();
  sim.items = new Map();
  sim.destructables = new Map();
  sim.destSeq = 0; // own sequence: load-time placement must not shift unit handles
  sim.timers = new Map();
  sim.triggers = new Map();
  sim.groups = new Map();
  sim.rects = new Map();
  sim.regions = new Map();
  sim.boolexprs = new Map();
  sim.eventCtx = [];
  sim.startLocations = [];
  sim.handleSeq = 0;
  sim.timerSeq = 0;
  sim.rand = mulberry32(sim.seed !== undefined ? sim.seed : 42);
  sim.tod = { base: 8.0, baseTime: 0, scale: 1.0 };
  sim.mapName = null;
  // objectData (from lib/sim/index.js readObjectData for map sources) —
  // script-only sandboxes get all-empty maps: every field then reads its
  // documented neutral default (map-delta doctrine).
  sim.objectData = sim.objectData || {};
  for (const k of ['itemGold', 'itemName', 'itemCharges', 'unitMaxLife', 'unitName',
    'unitBaseDamage', 'unitDefense', 'unitMoveSpeed', 'unitGoldCost', 'unitLumberCost',
    'unitAbilities', 'unitBuilds', 'unitStr', 'unitAgi', 'unitInt', 'unitLevel',
    'destMaxLife', 'destName']) {
    sim.objectData[k] = sim.objectData[k] || new Map();
  }
  sim.objectData.doodadOnly = sim.objectData.doodadOnly || new Set();

  sim.players = [];
  for (let i = 0; i < NUM_SLOTS; i++) {
    sim.players.push({
      idx: i,
      handle: 'player:' + i,
      name: i === 24 ? 'Neutral Hostile' : i === 27 ? 'Neutral Passive' : 'Player ' + (i + 1),
      controller: S.CONTROL_NONE,
      slotState: S.SLOT_EMPTY,
      team: i,
      color: convSentinel('ConvertPlayerColor', i),
      racePref: null,
      states: new Map(),
      alliances: new Map(), // `${otherIdx}|${allianceSentinel}` -> bool
      startLocation: null,
    });
  }
  sim.localPlayer = sim.players[0].handle;

  const handle = (prefix) => `${prefix}:${++sim.handleSeq}`;
  const ctx = () => (sim.eventCtx.length ? sim.eventCtx[sim.eventCtx.length - 1] : {});
  const record = (name, args) => {
    if (sim.calls.length < MAX_CALL_LOG) sim.calls.push({ t: sim.now, name, args });
    else sim.callsDropped++;
  };

  // ------------------------------------------------------------ accessors
  function playerOf(h, what) {
    if (typeof h === 'string' && h.startsWith('player:')) {
      const p = sim.players[Number(h.slice(7))];
      if (p) return p;
    }
    throw new Error(`${what || 'native'}: not a player handle: ${JSON.stringify(h)}`);
  }
  function unitOf(h, what) {
    const u = typeof h === 'string' ? sim.units.get(h) : undefined;
    if (!u) throw new Error(`${what || 'native'}: not a unit handle: ${JSON.stringify(h)}`);
    return u;
  }
  function maybeUnit(h) {
    return typeof h === 'string' ? sim.units.get(h) : undefined;
  }
  function itemOf(h, what) {
    const it = typeof h === 'string' ? sim.items.get(h) : undefined;
    if (!it) throw new Error(`${what || 'native'}: not an item handle: ${JSON.stringify(h)}`);
    return it;
  }
  function destOf(h, what) {
    const d = typeof h === 'string' ? sim.destructables.get(h) : undefined;
    if (!d) throw new Error(`${what || 'native'}: not a destructable handle: ${JSON.stringify(h)}`);
    return d;
  }
  function maybeDest(h) {
    return typeof h === 'string' ? sim.destructables.get(h) : undefined;
  }
  function timerOf(h, what) {
    const t = typeof h === 'string' ? sim.timers.get(h) : undefined;
    if (!t) throw new Error(`${what || 'native'}: not a timer handle: ${JSON.stringify(h)}`);
    return t;
  }
  function triggerOf(h, what) {
    const t = typeof h === 'string' ? sim.triggers.get(h) : undefined;
    if (!t) throw new Error(`${what || 'native'}: not a trigger handle: ${JSON.stringify(h)}`);
    return t;
  }
  function groupOf(h, what) {
    const g = typeof h === 'string' ? sim.groups.get(h) : undefined;
    if (!g) throw new Error(`${what || 'native'}: not a group handle: ${JSON.stringify(h)}`);
    return g;
  }
  function rectOf(h, what) {
    const r = typeof h === 'string' ? sim.rects.get(h) : undefined;
    if (!r) throw new Error(`${what || 'native'}: not a rect handle: ${JSON.stringify(h)}`);
    return r;
  }
  function regionOf(h, what) {
    const r = typeof h === 'string' ? sim.regions.get(h) : undefined;
    if (!r) throw new Error(`${what || 'native'}: not a region handle: ${JSON.stringify(h)}`);
    return r;
  }

  // -------------------------------------------------------------- filters
  // Accept nil, a boolexpr handle (from Filter/Condition) or a bare Lua
  // function; evaluate with the candidate unit as GetFilterUnit().
  function passesFilter(filter, u) {
    if (filter === undefined || filter === null) return true;
    let fn = filter;
    if (typeof filter === 'string' && sim.boolexprs.has(filter)) fn = sim.boolexprs.get(filter).fn;
    if (typeof fn !== 'function') return true;
    sim.eventCtx.push({ filterUnit: u.handle });
    try {
      return !!fn()[0];
    } finally {
      sim.eventCtx.pop();
    }
  }

  // Same, for destructable enumeration: candidate is GetFilterDestructable().
  function passesDestFilter(filter, d) {
    if (filter === undefined || filter === null) return true;
    let fn = filter;
    if (typeof filter === 'string' && sim.boolexprs.has(filter)) fn = sim.boolexprs.get(filter).fn;
    if (typeof fn !== 'function') return true;
    sim.eventCtx.push({ filterDestructable: d.handle });
    try {
      return !!fn()[0];
    } finally {
      sim.eventCtx.pop();
    }
  }

  // ------------------------------------------------------ trigger dispatch
  function executeTrigger(trig, ctxFrame) {
    if (trig.destroyed || !trig.enabled) return;
    sim.eventCtx.push({ ...ctxFrame, triggeringTrigger: trig.handle });
    try {
      for (const cond of trig.conditions) {
        let fn = cond;
        if (typeof cond === 'string' && sim.boolexprs.has(cond)) fn = sim.boolexprs.get(cond).fn;
        if (typeof fn === 'function' && !fn()[0]) return;
      }
      for (const action of trig.actions.slice()) action();
    } finally {
      sim.eventCtx.pop();
    }
  }

  function fireTriggers(match, ctxFrame) {
    // snapshot: handlers may create new triggers mid-dispatch
    const trigs = Array.from(sim.triggers.values());
    for (const trig of trigs) {
      if (trig.destroyed || !trig.enabled) continue;
      if (trig.events.some(match)) executeTrigger(trig, ctxFrame);
    }
  }

  // The standard player-unit/unit event pair: an EVENT_PLAYER_UNIT_* is
  // matched against the subject unit's OWNER (pid null = any-unit BJ), an
  // EVENT_UNIT_* against the subject unit itself.
  const unitEventMatch = (pueSent, ueSent, u) => (ev) =>
    (ev.kind === 'pue' && ev.ev === pueSent && (ev.pid === null || ev.pid === u.ownerIdx)) ||
    (ev.kind === 'ue' && ev.ev === ueSent && ev.unit === u.handle);

  // -------------------------------------------------------------- regions
  function rectContains(r, x, y) {
    return x >= r.minx && x <= r.maxx && y >= r.miny && y <= r.maxy;
  }
  function regionContains(region, x, y) {
    return region.rects.some((rh) => {
      const r = sim.rects.get(rh);
      return r && rectContains(r, x, y);
    });
  }
  function updateRegionMembership(u, fire) {
    for (const region of sim.regions.values()) {
      const inside = !u.removed && u.alive !== false && regionContains(region, u.x, u.y);
      const was = u.regions.has(region.handle);
      if (inside && !was) {
        u.regions.add(region.handle);
        if (fire) {
          fireTriggers((ev) => ev.kind === 'enter' && ev.region === region.handle,
            { triggerUnit: u.handle, enteringUnit: u.handle, triggeringRegion: region.handle });
        }
      } else if (!inside && was) {
        u.regions.delete(region.handle);
        if (fire) {
          fireTriggers((ev) => ev.kind === 'leave' && ev.region === region.handle,
            { triggerUnit: u.handle, leavingUnit: u.handle, triggeringRegion: region.handle });
        }
      }
    }
  }

  // ---------------------------------------------------------------- units
  function createUnitInternal(pidx, typeId, x, y, facing) {
    const typeStr = fourCCToStr(typeId);
    const od = sim.objectData;
    // map-delta stat seeding; the neutral defaults are documented in the
    // header ("Map-delta object-data stats") — never Blizzard base values
    const maxLife = od.unitMaxLife.get(typeId) || 100;
    const moveSpeed = od.unitMoveSpeed.has(typeId) ? od.unitMoveSpeed.get(typeId) : 270;
    const u = {
      handle: handle('unit'),
      typeId, typeStr,
      ownerIdx: pidx,
      x, y, facing: facing || 0,
      life: maxLife, maxLife,
      mana: 0, maxMana: 0,
      alive: true, removed: false,
      acquireRange: 500, moveSpeed, defaultMoveSpeed: moveSpeed,
      baseDamage: od.unitBaseDamage.get(typeId) || 0,
      armor: od.unitDefense.get(typeId) || 0,
      level: od.unitLevel.get(typeId) || 1,
      str: od.unitStr.get(typeId) || 0,
      agi: od.unitAgi.get(typeId) || 0,
      int: od.unitInt.get(typeId) || 0,
      xp: 0,
      // uabi grant list at level 1; no uabi delta = EMPTY known-ability set
      abilities: new Map((od.unitAbilities.get(typeId) || []).map((aid) => [aid, 1])),
      builds: od.unitBuilds.get(typeId) || [], // ubui — queryable only
      inventory: [null, null, null, null, null, null], // slots 0..5
      resources: 0,
      regions: new Set(),
      lastOrder: null,
      createdAt: sim.now,
    };
    sim.units.set(u.handle, u);
    updateRegionMembership(u, true);
    return u;
  }

  function killUnitInternal(u, killerHandle) {
    if (!u.alive || u.removed) return;
    u.life = 0;
    u.alive = false;
    const frame = {
      triggerUnit: u.handle,
      triggerWidget: u.handle,
      dyingUnit: u.handle,
      killingUnit: killerHandle || undefined,
    };
    fireTriggers((ev) =>
      (ev.kind === 'pue' && ev.ev === S.PU_DEATH && (ev.pid === null || ev.pid === u.ownerIdx)) ||
      (ev.kind === 'ue' && ev.ev === S.UE_DEATH && ev.unit === u.handle), frame);
  }

  // ---- damage (policy: header comment — flat, events fire BEFORE application,
  // BlzSetEventDamage replaces the pending amount, kill credit to the source)
  let damageDepth = 0;
  function damageUnitInternal(sourceHandle, target, amount) {
    if (damageDepth >= MAX_DAMAGE_DEPTH) {
      const trig = ctx().triggeringTrigger;
      throw new Error(`UnitDamageTarget: damage recursion deeper than ${MAX_DAMAGE_DEPTH}` +
        (trig ? ` while running trigger ${trig}` : '') +
        ' — a DAMAGING/DAMAGED handler is dealing damage recursively; break the cycle or gate it on a flag');
    }
    damageDepth++;
    try {
      if (target.removed || !target.alive) return 0;
      // one shared frame: BlzSetEventDamage in the DAMAGING handler carries
      // into DAMAGED and into what is finally applied
      const frame = {
        triggerUnit: target.handle,
        damageTarget: target.handle,
        damageSource: sourceHandle || undefined,
        damage: { amount },
      };
      fireTriggers(unitEventMatch(S.PU_DAMAGING, S.UE_DAMAGING, target), frame);
      fireTriggers(unitEventMatch(S.PU_DAMAGED, S.UE_DAMAGED, target), frame);
      const applied = frame.damage.amount;
      target.life = Math.max(0, Math.min(target.maxLife, target.life - applied));
      if (target.life <= 0 && target.alive) killUnitInternal(target, sourceHandle || null);
      return applied;
    } finally {
      damageDepth--;
    }
  }

  // ---------------------------------------------------------- destructables
  function createDestructableInternal(typeId, x, y) {
    const typeStr = fourCCToStr(typeId);
    const maxLife = sim.objectData.destMaxLife.get(typeId) || 100;
    const d = {
      handle: `dest:${++sim.destSeq}`,
      typeId, typeStr,
      x, y,
      life: maxLife, maxLife,
      alive: true, removed: false,
      createdAt: sim.now,
    };
    sim.destructables.set(d.handle, d);
    return d;
  }

  function killDestructableInternal(d) {
    if (!d.alive || d.removed) return;
    d.life = 0;
    d.alive = false;
    fireTriggers((ev) => ev.kind === 'wdeath' && ev.widget === d.handle, {
      triggerDestructable: d.handle,
      dyingDestructable: d.handle,
      triggerWidget: d.handle,
    });
  }

  function setDestructableLifeInternal(d, v) {
    if (d.removed) return;
    d.life = Math.max(0, Math.min(d.maxLife, v));
    if (d.life <= 0 && d.alive) killDestructableInternal(d);
  }

  function setUnitPositionInternal(u, x, y) {
    u.x = x; u.y = y;
    updateRegionMembership(u, true);
  }

  // ---- spell events (policy: header comment — bookkeeping + events only,
  // no cooldowns/mana/effects; the five events fire in the documented
  // completed-cast order CHANNEL -> CAST -> EFFECT -> FINISH -> ENDCAST)
  function castInternal(caster, abilId, target) {
    // one shared frame for all five events (like the game: the spell getters
    // answer identically inside each of them)
    const frame = {
      triggerUnit: caster.handle,
      spellAbilityId: abilId,
      spellAbilityUnit: caster.handle,
      // no-target casts report the caster's own position
      spellTargetX: caster.x, spellTargetY: caster.y,
    };
    if (target) {
      if (target.kind === 'unit') {
        frame.spellTargetUnit = target.unit.handle;
        frame.spellTargetX = target.unit.x; frame.spellTargetY = target.unit.y;
      } else if (target.kind === 'dest') {
        frame.spellTargetDestructable = target.dest.handle;
        frame.spellTargetX = target.dest.x; frame.spellTargetY = target.dest.y;
      } else if (target.kind === 'item') {
        frame.spellTargetItem = target.item.handle;
        frame.spellTargetX = target.item.x; frame.spellTargetY = target.item.y;
      } else { // point
        frame.spellTargetX = target.x; frame.spellTargetY = target.y;
      }
    }
    for (const [pue, ue] of [
      [S.PU_SPELL_CHANNEL, S.UE_SPELL_CHANNEL],
      [S.PU_SPELL_CAST, S.UE_SPELL_CAST],
      [S.PU_SPELL_EFFECT, S.UE_SPELL_EFFECT],
      [S.PU_SPELL_FINISH, S.UE_SPELL_FINISH],
      [S.PU_SPELL_ENDCAST, S.UE_SPELL_ENDCAST],
    ]) {
      fireTriggers(unitEventMatch(pue, ue, caster), frame);
    }
  }

  // ---- inventories (policy: header comment — 6 slots, indices 0..5)
  function firstFreeSlot(u) {
    for (let i = 0; i < 6; i++) if (!u.inventory[i]) return i;
    return -1;
  }
  // vacate the item's current carrier slot with NO event (RemoveItem, pawn,
  // and carrier-to-carrier transfer use this)
  function detachItem(it) {
    if (!it.ownerUnit) return;
    const carrier = maybeUnit(it.ownerUnit);
    if (carrier) {
      const i = carrier.inventory.indexOf(it.handle);
      if (i !== -1) carrier.inventory[i] = null;
    }
    it.ownerUnit = null;
  }
  function giveItemInternal(u, it, slot) {
    detachItem(it);
    u.inventory[slot] = it.handle;
    it.ownerUnit = u.handle;
    it.x = u.x; it.y = u.y; // carried items sit at the carrier (not re-synced on move)
    fireTriggers(unitEventMatch(S.PU_PICKUP_ITEM, S.UE_PICKUP_ITEM, u),
      { triggerUnit: u.handle, manipulatingUnit: u.handle, manipulatedItem: it.handle });
  }
  function dropItemInternal(u, slot) {
    const it = sim.items.get(u.inventory[slot]);
    u.inventory[slot] = null;
    it.ownerUnit = null;
    it.x = u.x; it.y = u.y;
    fireTriggers(unitEventMatch(S.PU_DROP_ITEM, S.UE_DROP_ITEM, u),
      { triggerUnit: u.handle, manipulatingUnit: u.handle, manipulatedItem: it.handle });
    return it;
  }
  function useItemInternal(u, it) {
    // event only: NO consumption/charge decrement (header policy)
    fireTriggers(unitEventMatch(S.PU_USE_ITEM, S.UE_USE_ITEM, u),
      { triggerUnit: u.handle, manipulatingUnit: u.handle, manipulatedItem: it.handle });
  }

  // ------------------------------------------------------- virtual clock
  sim.advance = function advance(seconds) {
    if (!(seconds >= 0)) throw new Error(`sim.advance: bad seconds ${seconds}`);
    const target = sim.now + seconds;
    let guard = 0;
    for (;;) {
      let best = null;
      for (const t of sim.timers.values()) {
        if (t.destroyed || !t.running || t.nextFire > target + 1e-9) continue;
        if (!best || t.nextFire < best.nextFire - 1e-9 ||
            (Math.abs(t.nextFire - best.nextFire) <= 1e-9 && t.startSeq < best.startSeq)) {
          best = t;
        }
      }
      if (!best) break;
      if (++guard > 1000000) {
        throw new Error('sim.advance: over 1e6 timer firings in one advance — runaway periodic timer?');
      }
      sim.now = Math.max(sim.now, best.nextFire);
      best.lastFire = sim.now;
      if (best.periodic) best.nextFire = sim.now + Math.max(best.timeout, 0.001);
      else best.running = false;
      sim.eventCtx.push({ expiredTimer: best.handle });
      try {
        if (best.handler) best.handler();
        for (const th of best.expireTriggers) {
          const trig = sim.triggers.get(th);
          if (trig) executeTrigger(trig, { expiredTimer: best.handle });
        }
      } finally {
        sim.eventCtx.pop();
      }
    }
    sim.now = target;
  };

  // ------------------------------------------- harness event entry points
  sim.chat = function chat(pid, msg) {
    const p = typeof pid === 'number' ? sim.players[pid] : playerOf(pid, 'sim.chat');
    fireTriggers((ev) => ev.kind === 'chat' && ev.pid === p.idx &&
      (ev.exact ? msg === ev.text : msg.indexOf(ev.text) !== -1),
      { triggerPlayer: p.handle, chatString: msg });
  };

  sim.kill = function kill(unit, killer) {
    const u = unitOf(unit && unit.handle ? unit.handle : unit, 'sim.kill');
    const k = killer ? unitOf(killer.handle ? killer.handle : killer, 'sim.kill killer') : null;
    killUnitInternal(u, k ? k.handle : null);
  };

  // Damage through the real UnitDamageTarget path (DAMAGING/DAMAGED events,
  // BlzSetEventDamage, death with kill credit). source may be null (unowned
  // damage, like sim.kill with no killer). Returns the APPLIED amount.
  sim.damage = function damage(source, target, amount) {
    const s = source ? unitOf(source.handle ? source.handle : source, 'sim.damage source') : null;
    const th = target && target.handle ? target.handle : target;
    const d = maybeDest(th);
    if (d) {
      setDestructableLifeInternal(d, d.life - amount);
      return amount;
    }
    return damageUnitInternal(s ? s.handle : null, unitOf(th, 'sim.damage target'), amount);
  };

  sim.moveUnit = function moveUnit(unit, x, y) {
    const u = unitOf(unit && unit.handle ? unit.handle : unit, 'sim.moveUnit');
    setUnitPositionInternal(u, x, y);
  };

  sim.leave = function leave(pid) {
    const p = typeof pid === 'number' ? sim.players[pid] : playerOf(pid, 'sim.leave');
    p.slotState = S.SLOT_LEFT;
    fireTriggers((ev) => ev.kind === 'pe' && ev.ev === S.PE_LEAVE && ev.pid === p.idx,
      { triggerPlayer: p.handle });
  };

  sim.constructFinish = function constructFinish(unit) {
    const u = unitOf(unit && unit.handle ? unit.handle : unit, 'sim.constructFinish');
    fireTriggers((ev) => ev.kind === 'pue' && ev.ev === S.PU_CONSTRUCT_FINISH &&
      (ev.pid === null || ev.pid === u.ownerIdx),
      { triggerUnit: u.handle, constructedStructure: u.handle });
  };

  sim.upgradeFinish = function upgradeFinish(unit, newType) {
    const u = unitOf(unit && unit.handle ? unit.handle : unit, 'sim.upgradeFinish');
    if (newType) {
      u.typeId = fourCC(newType);
      u.typeStr = newType;
      const ml = sim.objectData.unitMaxLife.get(u.typeId);
      if (ml) { u.maxLife = ml; u.life = Math.min(u.life, ml) || ml; }
    }
    fireTriggers((ev) => ev.kind === 'pue' && ev.ev === S.PU_UPGRADE_FINISH &&
      (ev.pid === null || ev.pid === u.ownerIdx),
      { triggerUnit: u.handle });
  };

  // Engine pawn semantics: pays floor(goldCost/2) to the seller's owner,
  // removes the item (vacating its carrier slot), then fires
  // EVENT_PLAYER_UNIT_PAWN_ITEM. Gold cost comes from the map source's
  // objects-items.json ('igol').
  sim.pawn = function pawn(seller, item, shop) {
    const u = unitOf(seller && seller.handle ? seller.handle : seller, 'sim.pawn seller');
    const it = itemOf(item && item.handle ? item.handle : item, 'sim.pawn item');
    const gold = sim.objectData.itemGold.get(it.typeId) || 0;
    const enginePaid = Math.floor(gold / 2);
    const owner = sim.players[u.ownerIdx];
    owner.states.set(S.STATE_GOLD, (owner.states.get(S.STATE_GOLD) || 0) + enginePaid);
    detachItem(it);
    it.removed = true;
    fireTriggers((ev) => ev.kind === 'pue' && ev.ev === S.PU_PAWN_ITEM &&
      (ev.pid === null || ev.pid === u.ownerIdx),
      {
        triggerUnit: u.handle,
        soldItem: it.handle,
        sellingUnit: u.handle,
        buyingUnit: shop ? (shop.handle || shop) : undefined,
      });
    return { enginePaid };
  };

  // Ability argument: a FourCC integer or a 4-char rawcode string.
  function abilArg(a, what) {
    if (typeof a === 'number') return a;
    if (typeof a === 'string' && a.length === 4) return fourCC(a);
    throw new Error(`${what}: expected an ability rawcode string or FourCC integer, got ${JSON.stringify(a)}`);
  }

  // Completed spell cast (event order + getters: header comment). target =
  // unit/destructable/item record-or-handle, {x, y} point, or omitted
  // (no-target). Casting an ability the unit does not KNOW is a
  // test-authoring hard-error — a stock unit's known set is EMPTY unless
  // the map's own uabi delta or a UnitAddAbility call granted it; pass
  // {force: true} to cast anyway (exactly the stock-kit case).
  sim.cast = function cast(unit, abil, target, opts) {
    const u = unitOf(unit && unit.handle ? unit.handle : unit, 'sim.cast');
    const abilId = abilArg(abil, 'sim.cast');
    if (!u.abilities.has(abilId) && !(opts && opts.force)) {
      throw new Error(`sim.cast: unit ${u.handle} (${u.typeStr}) does not know ability ` +
        `${fourCCToStr(abilId)} — the sim never fabricates stock kits (map-delta doctrine); ` +
        'grant it via uabi/UnitAddAbility or pass {force: true}');
    }
    let t = null;
    if (target !== undefined && target !== null) {
      const th = target.handle ? target.handle : target;
      if (typeof th === 'string') {
        const tu = maybeUnit(th);
        const td = maybeDest(th);
        const ti = sim.items.get(th);
        if (tu) t = { kind: 'unit', unit: tu };
        else if (td) t = { kind: 'dest', dest: td };
        else if (ti) t = { kind: 'item', item: ti };
        else throw new Error(`sim.cast: unknown target handle ${JSON.stringify(th)}`);
      } else if (typeof target === 'object' && typeof target.x === 'number' && typeof target.y === 'number') {
        t = { kind: 'point', x: target.x, y: target.y };
      } else {
        throw new Error(`sim.cast: bad target ${JSON.stringify(target)} — pass a unit/destructable/item, {x, y}, or omit`);
      }
    }
    castInternal(u, abilId, t);
  };

  // Item manipulation entry points (policies: header comment).
  sim.pickup = function pickup(unit, item) {
    const u = unitOf(unit && unit.handle ? unit.handle : unit, 'sim.pickup');
    const it = itemOf(item && item.handle ? item.handle : item, 'sim.pickup item');
    if (it.removed) throw new Error('sim.pickup: item already removed');
    const slot = firstFreeSlot(u);
    if (slot === -1) return false; // full inventory refuses, like UnitAddItem
    giveItemInternal(u, it, slot);
    return true;
  };
  sim.drop = function drop(unit, item) {
    const u = unitOf(unit && unit.handle ? unit.handle : unit, 'sim.drop');
    const it = itemOf(item && item.handle ? item.handle : item, 'sim.drop item');
    const slot = u.inventory.indexOf(it.handle);
    if (slot === -1) throw new Error(`sim.drop: unit ${u.handle} does not carry item ${it.handle}`);
    dropItemInternal(u, slot);
  };
  sim.useItem = function useItem(unit, item) {
    const u = unitOf(unit && unit.handle ? unit.handle : unit, 'sim.useItem');
    const it = itemOf(item && item.handle ? item.handle : item, 'sim.useItem item');
    if (it.ownerUnit !== u.handle) {
      throw new Error(`sim.useItem: unit ${u.handle} does not carry item ${it.handle} — sim.pickup it first`);
    }
    useItemInternal(u, it);
  };
  // Shop purchase: SELL_ITEM (to the shop owner's triggers), then the
  // pickup path into the buyer's inventory. itemOrType = an existing item
  // record/handle, or a type (rawcode string / FourCC int) to create at the
  // buyer. Returns the item record.
  sim.sell = function sell(shop, buyer, itemOrType) {
    const s = unitOf(shop && shop.handle ? shop.handle : shop, 'sim.sell shop');
    const b = unitOf(buyer && buyer.handle ? buyer.handle : buyer, 'sim.sell buyer');
    let it;
    if (typeof itemOrType === 'number') {
      it = sim.items.get(natives.CreateItem(itemOrType, b.x, b.y));
    } else if (typeof itemOrType === 'string' && itemOrType.length === 4) {
      it = sim.items.get(natives.CreateItem(fourCC(itemOrType), b.x, b.y));
    } else {
      it = itemOf(itemOrType && itemOrType.handle ? itemOrType.handle : itemOrType, 'sim.sell item');
    }
    fireTriggers(unitEventMatch(S.PU_SELL_ITEM, S.UE_SELL_ITEM, s), {
      triggerUnit: s.handle,
      sellingUnit: s.handle,
      buyingUnit: b.handle,
      soldItem: it.handle,
      manipulatedItem: it.handle,
    });
    const slot = firstFreeSlot(b);
    if (slot !== -1) giveItemInternal(b, it, slot); // PICKUP fires on purchase
    return it;
  };

  // ------------------------------------------------------- registrations
  const natives = {};
  function reg(name, fn) { natives[name] = fn; }

  // --- handle converters (memoized canonical sentinels) ------------------
  const convNames = new Set();
  for (const spec of Object.values(CONSTANTS)) if (spec.conv) convNames.add(spec.conv);
  for (const conv of convNames) {
    reg(conv, (n) => convSentinel(conv, n));
  }
  for (const [callName, value] of Object.entries(CALLS)) reg(callName, () => value);

  // --- fundamentals -------------------------------------------------------
  reg('FourCC', fourCC);
  reg('GetRandomInt', (lo, hi) => lo + Math.floor(sim.rand() * (hi - lo + 1)));
  reg('GetRandomReal', (lo, hi) => lo + sim.rand() * (hi - lo));
  reg('SetRandomSeed', (seed) => { sim.rand = mulberry32(seed); });
  reg('GetTimeOfDay', () =>
    ((sim.tod.base + (sim.now - sim.tod.baseTime) * DAY_RATE * sim.tod.scale) % 24 + 24) % 24);
  reg('SetTimeOfDay', (v) => { sim.tod.base = v; sim.tod.baseTime = sim.now; });
  reg('SetTimeOfDayScale', (s) => {
    sim.tod.base = natives.GetTimeOfDay();
    sim.tod.baseTime = sim.now;
    sim.tod.scale = s;
  });
  reg('GetTimeOfDayScale', () => sim.tod.scale);
  reg('ExecuteFunc', (name) => { vm.callGlobal(name); });

  // --- players ------------------------------------------------------------
  reg('Player', (i) => {
    if (typeof i !== 'number' || i < 0 || i >= NUM_SLOTS) {
      throw new Error(`Player(${i}): index out of range 0..${NUM_SLOTS - 1}`);
    }
    return sim.players[i].handle;
  });
  reg('GetPlayerId', (p) => playerOf(p, 'GetPlayerId').idx);
  reg('GetLocalPlayer', () => sim.localPlayer);
  reg('GetPlayerName', (p) => playerOf(p, 'GetPlayerName').name);
  reg('SetPlayerName', (p, name) => { playerOf(p, 'SetPlayerName').name = name; });
  reg('GetPlayerController', (p) => playerOf(p, 'GetPlayerController').controller);
  reg('SetPlayerController', (p, c) => { playerOf(p, 'SetPlayerController').controller = c; });
  reg('GetPlayerSlotState', (p) => playerOf(p, 'GetPlayerSlotState').slotState);
  reg('GetPlayerTeam', (p) => playerOf(p, 'GetPlayerTeam').team);
  reg('SetPlayerTeam', (p, t) => { playerOf(p, 'SetPlayerTeam').team = t; });
  reg('SetPlayerColor', (p, c) => { playerOf(p, 'SetPlayerColor').color = c; });
  reg('GetPlayerColor', (p) => playerOf(p, 'GetPlayerColor').color);
  reg('SetPlayerRacePreference', (p, r) => { playerOf(p, 'SetPlayerRacePreference').racePref = r; });
  reg('SetPlayerRaceSelectable', () => {});
  reg('GetPlayerState', (p, state) => playerOf(p, 'GetPlayerState').states.get(state) || 0);
  reg('SetPlayerState', (p, state, value) => {
    playerOf(p, 'SetPlayerState').states.set(state, value);
  });
  reg('SetPlayerAlliance', (p, other, allianceType, flag) => {
    const src = playerOf(p, 'SetPlayerAlliance');
    const dst = playerOf(other, 'SetPlayerAlliance');
    src.alliances.set(`${dst.idx}|${allianceType}`, !!flag);
  });
  reg('GetPlayerAlliance', (p, other, allianceType) => {
    const src = playerOf(p, 'GetPlayerAlliance');
    const dst = playerOf(other, 'GetPlayerAlliance');
    return src.alliances.get(`${dst.idx}|${allianceType}`) || false;
  });
  reg('SetPlayerStartLocation', (p, idx) => { playerOf(p, 'SetPlayerStartLocation').startLocation = idx; });
  reg('ForcePlayerStartLocation', (p, idx) => { playerOf(p, 'ForcePlayerStartLocation').startLocation = idx; });
  reg('GetPlayerStartLocation', (p) => playerOf(p, 'GetPlayerStartLocation').startLocation || 0);
  reg('DefineStartLocation', (idx, x, y) => { sim.startLocations[idx] = { x, y }; });
  reg('GetStartLocationX', (idx) => (sim.startLocations[idx] || { x: 0 }).x);
  reg('GetStartLocationY', (idx) => (sim.startLocations[idx] || { y: 0 }).y);

  // --- config-time map settings -------------------------------------------
  reg('SetMapName', (n) => { sim.mapName = n; });
  reg('SetMapDescription', () => {});
  reg('SetPlayers', (n) => { sim.declaredPlayers = n; });
  reg('SetTeams', (n) => { sim.declaredTeams = n; });
  reg('SetGamePlacement', () => {});

  // --- timers ---------------------------------------------------------------
  reg('CreateTimer', () => {
    const t = {
      handle: handle('timer'),
      timeout: 0, periodic: false, handler: null,
      running: false, destroyed: false,
      nextFire: Infinity, startSeq: 0, startedAt: 0, lastFire: null,
      pausedRemaining: null, expireTriggers: [],
    };
    sim.timers.set(t.handle, t);
    return t.handle;
  });
  reg('TimerStart', (th, timeout, periodic, handler) => {
    const t = timerOf(th, 'TimerStart');
    if (t.destroyed) throw new Error('TimerStart on destroyed timer');
    t.timeout = Math.max(0, timeout || 0);
    t.periodic = !!periodic;
    t.handler = typeof handler === 'function' ? handler : null;
    t.running = true;
    t.startedAt = sim.now;
    t.lastFire = null;
    t.nextFire = sim.now + t.timeout;
    t.startSeq = ++sim.timerSeq;
    t.pausedRemaining = null;
  });
  reg('PauseTimer', (th) => {
    const t = timerOf(th, 'PauseTimer');
    if (t.running) {
      t.pausedRemaining = Math.max(0, t.nextFire - sim.now);
      t.running = false;
    }
  });
  reg('ResumeTimer', (th) => {
    const t = timerOf(th, 'ResumeTimer');
    if (!t.running && !t.destroyed && t.pausedRemaining !== null) {
      t.nextFire = sim.now + t.pausedRemaining;
      t.pausedRemaining = null;
      t.running = true;
      t.startSeq = ++sim.timerSeq;
    }
  });
  reg('DestroyTimer', (th) => {
    const t = timerOf(th, 'DestroyTimer');
    t.destroyed = true;
    t.running = false;
  });
  reg('TimerGetElapsed', (th) => {
    const t = timerOf(th, 'TimerGetElapsed');
    if (!t.running && t.pausedRemaining === null) return 0;
    return sim.now - (t.lastFire !== null ? t.lastFire : t.startedAt);
  });
  reg('TimerGetRemaining', (th) => {
    const t = timerOf(th, 'TimerGetRemaining');
    if (t.pausedRemaining !== null) return t.pausedRemaining;
    return t.running ? Math.max(0, t.nextFire - sim.now) : 0;
  });
  reg('TimerGetTimeout', (th) => timerOf(th, 'TimerGetTimeout').timeout);
  reg('GetExpiredTimer', () => ctx().expiredTimer);

  // --- units ------------------------------------------------------------------
  reg('CreateUnit', (p, typeId, x, y, facing) =>
    createUnitInternal(playerOf(p, 'CreateUnit').idx, typeId, x, y, facing).handle);
  reg('BlzCreateUnitWithSkin', (p, typeId, x, y, facing) =>
    createUnitInternal(playerOf(p, 'BlzCreateUnitWithSkin').idx, typeId, x, y, facing).handle);
  reg('KillUnit', (uh) => killUnitInternal(unitOf(uh, 'KillUnit'), null));
  reg('RemoveUnit', (uh) => {
    const u = unitOf(uh, 'RemoveUnit');
    u.removed = true;
    u.alive = false;
    for (const g of sim.groups.values()) {
      const i = g.units.indexOf(u.handle);
      if (i !== -1) g.units.splice(i, 1);
    }
  });
  reg('GetUnitTypeId', (uh) => unitOf(uh, 'GetUnitTypeId').typeId);
  reg('GetOwningPlayer', (uh) => sim.players[unitOf(uh, 'GetOwningPlayer').ownerIdx].handle);
  reg('SetUnitOwner', (uh, p) => { unitOf(uh, 'SetUnitOwner').ownerIdx = playerOf(p, 'SetUnitOwner').idx; });
  reg('GetUnitX', (uh) => unitOf(uh, 'GetUnitX').x);
  reg('GetUnitY', (uh) => unitOf(uh, 'GetUnitY').y);
  reg('SetUnitX', (uh, x) => { const u = unitOf(uh, 'SetUnitX'); setUnitPositionInternal(u, x, u.y); });
  reg('SetUnitY', (uh, y) => { const u = unitOf(uh, 'SetUnitY'); setUnitPositionInternal(u, u.x, y); });
  reg('SetUnitPosition', (uh, x, y) => setUnitPositionInternal(unitOf(uh, 'SetUnitPosition'), x, y));
  reg('GetUnitFacing', (uh) => unitOf(uh, 'GetUnitFacing').facing);
  reg('SetUnitFacing', (uh, f) => { unitOf(uh, 'SetUnitFacing').facing = f; });
  reg('GetUnitName', (uh) => {
    const u = unitOf(uh, 'GetUnitName');
    return sim.objectData.unitName.get(u.typeId) || u.typeStr;
  });
  reg('GetWidgetLife', (wh) => {
    const u = maybeUnit(wh);
    if (u) return u.removed ? 0 : u.life;
    const d = maybeDest(wh);
    if (d) return d.removed ? 0 : d.life;
    const it = sim.items.get(wh);
    if (it) return it.removed ? 0 : 1;
    throw new Error(`GetWidgetLife: unknown widget ${JSON.stringify(wh)}`);
  });
  reg('SetWidgetLife', (wh, v) => {
    const d = maybeDest(wh);
    if (d) { setDestructableLifeInternal(d, v); return; }
    const u = unitOf(wh, 'SetWidgetLife');
    u.life = Math.max(0, v);
    if (u.life <= 0 && u.alive) killUnitInternal(u, null);
  });
  // UnitDamageTarget(source, target, amount, attack, ranged, attackType,
  // damageType, weaponType) -> boolean. Target is a WIDGET: unit or
  // destructable. Full policy in the header comment.
  reg('UnitDamageTarget', (uh, wh, amount) => {
    const source = unitOf(uh, 'UnitDamageTarget');
    if (typeof amount !== 'number') {
      throw new Error(`UnitDamageTarget: amount is not a number: ${JSON.stringify(amount)}`);
    }
    const d = maybeDest(wh);
    if (d) { setDestructableLifeInternal(d, d.life - amount); return true; }
    const target = maybeUnit(wh);
    if (!target) throw new Error(`UnitDamageTarget: unknown widget ${JSON.stringify(wh)}`);
    damageUnitInternal(source.handle, target, amount);
    return true;
  });
  reg('GetUnitState', (uh, state) => {
    const u = unitOf(uh, 'GetUnitState');
    if (state === S.UNIT_STATE_LIFE) return u.removed ? 0 : u.life;
    if (state === S.UNIT_STATE_MAX_LIFE) return u.maxLife;
    if (state === S.UNIT_STATE_MANA) return u.mana;
    if (state === S.UNIT_STATE_MAX_MANA) return u.maxMana;
    return 0;
  });
  reg('SetUnitState', (uh, state, v) => {
    const u = unitOf(uh, 'SetUnitState');
    if (state === S.UNIT_STATE_LIFE) {
      u.life = Math.max(0, Math.min(v, u.maxLife));
      if (u.life <= 0 && u.alive) killUnitInternal(u, null);
    } else if (state === S.UNIT_STATE_MAX_LIFE) u.maxLife = v;
    else if (state === S.UNIT_STATE_MANA) u.mana = v;
    else if (state === S.UNIT_STATE_MAX_MANA) u.maxMana = v;
  });
  reg('IsUnitAliveBJ', (uh) => {
    const u = unitOf(uh, 'IsUnitAliveBJ');
    return u.alive && !u.removed && u.life > 0.405;
  });
  reg('IsUnitDeadBJ', (uh) => !natives.IsUnitAliveBJ(uh));
  reg('IsUnitType', (uh, unitType) => {
    const u = unitOf(uh, 'IsUnitType');
    if (unitType === S.UNIT_TYPE_HERO) return /^[A-Z]/.test(u.typeStr);
    if (unitType === S.UNIT_TYPE_DEAD) return !u.alive || u.life <= 0.405;
    return false;
  });
  reg('SetUnitAcquireRange', (uh, r) => { unitOf(uh, 'SetUnitAcquireRange').acquireRange = r; });
  reg('GetUnitAcquireRange', (uh) => unitOf(uh, 'GetUnitAcquireRange').acquireRange);
  reg('SetUnitMoveSpeed', (uh, s) => { unitOf(uh, 'SetUnitMoveSpeed').moveSpeed = s; });
  reg('GetUnitMoveSpeed', (uh) => unitOf(uh, 'GetUnitMoveSpeed').moveSpeed);
  reg('GetUnitDefaultMoveSpeed', (uh) => unitOf(uh, 'GetUnitDefaultMoveSpeed').defaultMoveSpeed);
  reg('SetResourceAmount', (uh, n) => { unitOf(uh, 'SetResourceAmount').resources = n; });
  reg('AddResourceAmount', (uh, n) => { unitOf(uh, 'AddResourceAmount').resources += n; });
  reg('GetResourceAmount', (uh) => unitOf(uh, 'GetResourceAmount').resources);

  // heroes
  reg('SetHeroLevel', (uh, lvl) => { unitOf(uh, 'SetHeroLevel').level = lvl; });
  reg('GetHeroLevel', (uh) => unitOf(uh, 'GetHeroLevel').level);
  reg('SetHeroStr', (uh, v) => { unitOf(uh, 'SetHeroStr').str = v; });
  reg('SetHeroAgi', (uh, v) => { unitOf(uh, 'SetHeroAgi').agi = v; });
  reg('SetHeroInt', (uh, v) => { unitOf(uh, 'SetHeroInt').int = v; });
  reg('GetHeroStr', (uh) => unitOf(uh, 'GetHeroStr').str);
  reg('GetHeroAgi', (uh) => unitOf(uh, 'GetHeroAgi').agi);
  reg('GetHeroInt', (uh) => unitOf(uh, 'GetHeroInt').int);
  reg('SetHeroXP', (uh, xp) => { unitOf(uh, 'SetHeroXP').xp = xp; });
  reg('AddHeroXP', (uh, xp) => { unitOf(uh, 'AddHeroXP').xp += xp; });
  reg('GetHeroXP', (uh) => unitOf(uh, 'GetHeroXP').xp);
  reg('ReviveHero', (uh, x, y) => {
    const u = unitOf(uh, 'ReviveHero');
    if (u.alive || u.removed) return false;
    u.alive = true;
    u.life = u.maxLife;
    setUnitPositionInternal(u, x, y);
    return true;
  });
  reg('GetUnitLevel', (uh) => unitOf(uh, 'GetUnitLevel').level);

  // map-delta stat bookkeeping (ua1b/udef; damage stays FLAT — header policy)
  reg('BlzGetUnitBaseDamage', (uh) => unitOf(uh, 'BlzGetUnitBaseDamage').baseDamage);
  reg('BlzSetUnitBaseDamage', (uh, v) => { unitOf(uh, 'BlzSetUnitBaseDamage').baseDamage = v; });
  reg('BlzGetUnitArmor', (uh) => unitOf(uh, 'BlzGetUnitArmor').armor);
  reg('BlzSetUnitArmor', (uh, v) => { unitOf(uh, 'BlzSetUnitArmor').armor = v; });

  // --- abilities (bookkeeping tier — policies in the header comment) --------
  reg('UnitAddAbility', (uh, aid) => {
    const u = unitOf(uh, 'UnitAddAbility');
    if (u.abilities.has(aid)) return false;
    u.abilities.set(aid, 1);
    return true;
  });
  reg('UnitRemoveAbility', (uh, aid) => unitOf(uh, 'UnitRemoveAbility').abilities.delete(aid));
  reg('GetUnitAbilityLevel', (uh, aid) => unitOf(uh, 'GetUnitAbilityLevel').abilities.get(aid) || 0);
  reg('SetUnitAbilityLevel', (uh, aid, lvl) => {
    const u = unitOf(uh, 'SetUnitAbilityLevel');
    if (!u.abilities.has(aid)) return 0; // absent: no-op, like the game
    const v = Math.max(1, Math.floor(lvl));
    u.abilities.set(aid, v);
    return v;
  });
  reg('IncUnitAbilityLevel', (uh, aid) => {
    const u = unitOf(uh, 'IncUnitAbilityLevel');
    if (!u.abilities.has(aid)) return 0;
    const v = u.abilities.get(aid) + 1;
    u.abilities.set(aid, v);
    return v;
  });
  reg('DecUnitAbilityLevel', (uh, aid) => {
    const u = unitOf(uh, 'DecUnitAbilityLevel');
    if (!u.abilities.has(aid)) return 0;
    const v = Math.max(1, u.abilities.get(aid) - 1);
    u.abilities.set(aid, v);
    return v;
  });
  // learns at 1 / levels by 1 and fires the HERO_SKILL event; no
  // skill-point pool or level requirements (bookkeeping tier)
  reg('SelectHeroSkill', (uh, aid) => {
    const u = unitOf(uh, 'SelectHeroSkill');
    const lvl = (u.abilities.get(aid) || 0) + 1;
    u.abilities.set(aid, lvl);
    fireTriggers(unitEventMatch(S.PU_HERO_SKILL, S.UE_HERO_SKILL, u),
      { triggerUnit: u.handle, learningUnit: u.handle, learnedSkill: aid, learnedSkillLevel: lvl });
  });

  // orders (recorded, no movement simulation)
  const orderNative = (name) => (uh, order, a, b) => {
    const u = unitOf(uh, name);
    u.lastOrder = { order, x: a, y: b };
    sim.orders.push({ t: sim.now, unit: u.handle, name, order, args: [a, b] });
    return true;
  };
  reg('IssuePointOrder', orderNative('IssuePointOrder'));
  reg('IssuePointOrderById', orderNative('IssuePointOrderById'));
  reg('IssueTargetOrder', orderNative('IssueTargetOrder'));
  reg('IssueImmediateOrder', orderNative('IssueImmediateOrder'));

  // --- unit groups -----------------------------------------------------------
  reg('CreateGroup', () => {
    const g = { handle: handle('group'), units: [] };
    sim.groups.set(g.handle, g);
    return g.handle;
  });
  reg('DestroyGroup', (gh) => { sim.groups.delete(gh); });
  reg('GroupClear', (gh) => { groupOf(gh, 'GroupClear').units.length = 0; });
  reg('GroupAddUnit', (gh, uh) => {
    const g = groupOf(gh, 'GroupAddUnit');
    unitOf(uh, 'GroupAddUnit');
    if (!g.units.includes(uh)) { g.units.push(uh); return true; }
    return false;
  });
  reg('GroupRemoveUnit', (gh, uh) => {
    const g = groupOf(gh, 'GroupRemoveUnit');
    const i = g.units.indexOf(uh);
    if (i !== -1) { g.units.splice(i, 1); return true; }
    return false;
  });
  reg('FirstOfGroup', (gh) => {
    const g = groupOf(gh, 'FirstOfGroup');
    return g.units.length ? g.units[0] : undefined;
  });
  reg('CountUnitsInGroup', (gh) => groupOf(gh, 'CountUnitsInGroup').units.length);
  reg('ForGroup', (gh, callback) => {
    const g = groupOf(gh, 'ForGroup');
    for (const uh of g.units.slice()) {
      sim.eventCtx.push({ enumUnit: uh });
      try { if (typeof callback === 'function') callback(); } finally { sim.eventCtx.pop(); }
    }
  });
  function enumInto(gh, what, pred, filter) {
    const g = groupOf(gh, what);
    g.units.length = 0;
    for (const u of sim.units.values()) {
      if (u.removed) continue;
      if (pred(u) && passesFilter(filter, u)) g.units.push(u.handle);
    }
  }
  reg('GroupEnumUnitsOfPlayer', (gh, p, filter) => {
    const idx = playerOf(p, 'GroupEnumUnitsOfPlayer').idx;
    enumInto(gh, 'GroupEnumUnitsOfPlayer', (u) => u.ownerIdx === idx, filter);
  });
  reg('GroupEnumUnitsInRect', (gh, rh, filter) => {
    const r = rectOf(rh, 'GroupEnumUnitsInRect');
    enumInto(gh, 'GroupEnumUnitsInRect', (u) => rectContains(r, u.x, u.y), filter);
  });
  reg('GroupEnumUnitsInRange', (gh, x, y, radius, filter) => {
    const r2 = radius * radius;
    enumInto(gh, 'GroupEnumUnitsInRange',
      (u) => (u.x - x) * (u.x - x) + (u.y - y) * (u.y - y) <= r2, filter);
  });
  reg('GetEnumUnit', () => ctx().enumUnit);
  reg('GetFilterUnit', () => ctx().filterUnit);

  // --- items & inventories (policies: header comment) -----------------------
  reg('CreateItem', (typeId, x, y) => {
    const it = {
      handle: handle('item'),
      typeId, typeStr: fourCCToStr(typeId),
      x, y, removed: false, ownerUnit: null,
      charges: sim.objectData.itemCharges.get(typeId) || 0, // iuse delta, neutral 0
      createdAt: sim.now,
    };
    sim.items.set(it.handle, it);
    return it.handle;
  });
  reg('RemoveItem', (ih) => {
    const it = itemOf(ih, 'RemoveItem');
    detachItem(it);
    it.removed = true;
  });
  reg('GetItemTypeId', (ih) => itemOf(ih, 'GetItemTypeId').typeId);
  reg('GetItemX', (ih) => itemOf(ih, 'GetItemX').x);
  reg('GetItemY', (ih) => itemOf(ih, 'GetItemY').y);
  reg('SetItemPosition', (ih, x, y) => { const it = itemOf(ih, 'SetItemPosition'); it.x = x; it.y = y; });
  reg('GetItemName', (ih) => {
    const it = itemOf(ih, 'GetItemName');
    return sim.objectData.itemName.get(it.typeId) || it.typeStr;
  });
  reg('GetItemCharges', (ih) => itemOf(ih, 'GetItemCharges').charges);
  reg('SetItemCharges', (ih, n) => { itemOf(ih, 'SetItemCharges').charges = n; });
  reg('UnitAddItem', (uh, ih) => {
    const u = unitOf(uh, 'UnitAddItem');
    const it = itemOf(ih, 'UnitAddItem');
    if (it.removed || it.ownerUnit === u.handle) return false;
    const slot = firstFreeSlot(u);
    if (slot === -1) return false; // full inventory refuses
    giveItemInternal(u, it, slot);
    return true;
  });
  reg('UnitAddItemById', (uh, typeId) => {
    const u = unitOf(uh, 'UnitAddItemById');
    const ih = natives.CreateItem(typeId, u.x, u.y);
    const slot = firstFreeSlot(u);
    // full inventory: the created item stays on the ground, like the game
    if (slot !== -1) giveItemInternal(u, sim.items.get(ih), slot);
    return ih;
  });
  reg('UnitAddItemToSlotById', (uh, typeId, slot) => {
    const u = unitOf(uh, 'UnitAddItemToSlotById');
    if (typeof slot !== 'number' || slot < 0 || slot > 5 || u.inventory[slot]) return false;
    const ih = natives.CreateItem(typeId, u.x, u.y);
    giveItemInternal(u, sim.items.get(ih), slot);
    return true;
  });
  reg('UnitRemoveItem', (uh, ih) => {
    const u = unitOf(uh, 'UnitRemoveItem');
    const it = itemOf(ih, 'UnitRemoveItem');
    const slot = u.inventory.indexOf(it.handle);
    if (slot !== -1) dropItemInternal(u, slot);
  });
  reg('UnitRemoveItemFromSlot', (uh, slot) => {
    const u = unitOf(uh, 'UnitRemoveItemFromSlot');
    if (typeof slot !== 'number' || slot < 0 || slot > 5 || !u.inventory[slot]) return undefined;
    return dropItemInternal(u, slot).handle;
  });
  reg('UnitItemInSlot', (uh, slot) => unitOf(uh, 'UnitItemInSlot').inventory[slot] || undefined);
  reg('UnitItemInSlotBJ', (uh, slot) => natives.UnitItemInSlot(uh, slot - 1)); // BJ is 1-based
  // flat 6: the real size derives from the inventory ABILITY (Blizzard
  // data the sim never reads) — header policy
  reg('UnitInventorySize', (uh) => { unitOf(uh, 'UnitInventorySize'); return 6; });
  reg('UnitInventoryCount', (uh) =>
    unitOf(uh, 'UnitInventoryCount').inventory.filter(Boolean).length);
  reg('UnitHasItem', (uh, ih) =>
    itemOf(ih, 'UnitHasItem').ownerUnit === unitOf(uh, 'UnitHasItem').handle);
  reg('UnitHasItemOfTypeBJ', (uh, typeId) =>
    unitOf(uh, 'UnitHasItemOfTypeBJ').inventory.some(
      (ih) => ih && sim.items.get(ih).typeId === typeId));
  reg('UnitUseItem', (uh, ih) => {
    const u = unitOf(uh, 'UnitUseItem');
    const it = itemOf(ih, 'UnitUseItem');
    if (it.removed || it.ownerUnit !== u.handle) return false;
    useItemInternal(u, it);
    return true;
  });

  // --- rects & regions -----------------------------------------------------------
  reg('Rect', (minx, miny, maxx, maxy) => {
    const r = { handle: handle('rect'), minx, miny, maxx, maxy };
    sim.rects.set(r.handle, r);
    return r.handle;
  });
  reg('RemoveRect', (rh) => { sim.rects.delete(rh); });
  reg('GetRectMinX', (rh) => rectOf(rh, 'GetRectMinX').minx);
  reg('GetRectMinY', (rh) => rectOf(rh, 'GetRectMinY').miny);
  reg('GetRectMaxX', (rh) => rectOf(rh, 'GetRectMaxX').maxx);
  reg('GetRectMaxY', (rh) => rectOf(rh, 'GetRectMaxY').maxy);
  reg('GetRectCenterX', (rh) => { const r = rectOf(rh, 'GetRectCenterX'); return (r.minx + r.maxx) / 2; });
  reg('GetRectCenterY', (rh) => { const r = rectOf(rh, 'GetRectCenterY'); return (r.miny + r.maxy) / 2; });
  reg('CreateRegion', () => {
    const region = { handle: handle('region'), rects: [] };
    sim.regions.set(region.handle, region);
    return region.handle;
  });
  reg('RemoveRegion', (rh) => { sim.regions.delete(rh); });
  reg('RegionAddRect', (regionH, rectH) => {
    const region = regionOf(regionH, 'RegionAddRect');
    rectOf(rectH, 'RegionAddRect');
    if (!region.rects.includes(rectH)) region.rects.push(rectH);
    // pick up units already inside (parity with unit-position updates)
    for (const u of sim.units.values()) updateRegionMembership(u, false);
  });
  reg('RegionClearRect', (regionH, rectH) => {
    const region = regionOf(regionH, 'RegionClearRect');
    const i = region.rects.indexOf(rectH);
    if (i !== -1) region.rects.splice(i, 1);
  });
  reg('IsUnitInRegion', (regionH, uh) =>
    regionOf(regionH, 'IsUnitInRegion') && unitOf(uh, 'IsUnitInRegion').regions.has(regionH));

  // --- triggers & events ------------------------------------------------------
  reg('CreateTrigger', () => {
    const t = {
      handle: handle('trigger'),
      actions: [], conditions: [], events: [],
      enabled: true, destroyed: false,
    };
    sim.triggers.set(t.handle, t);
    return t.handle;
  });
  reg('DestroyTrigger', (th) => { triggerOf(th, 'DestroyTrigger').destroyed = true; });
  reg('EnableTrigger', (th) => { triggerOf(th, 'EnableTrigger').enabled = true; });
  reg('DisableTrigger', (th) => { triggerOf(th, 'DisableTrigger').enabled = false; });
  reg('IsTriggerEnabled', (th) => triggerOf(th, 'IsTriggerEnabled').enabled);
  reg('TriggerAddAction', (th, action) => {
    if (typeof action !== 'function') throw new Error('TriggerAddAction: action is not a function');
    triggerOf(th, 'TriggerAddAction').actions.push(action);
    return handle('triggeraction');
  });
  reg('TriggerAddCondition', (th, cond) => {
    triggerOf(th, 'TriggerAddCondition').conditions.push(cond);
    return handle('triggercondition');
  });
  reg('TriggerEvaluate', (th) => {
    const t = triggerOf(th, 'TriggerEvaluate');
    for (const cond of t.conditions) {
      let fn = cond;
      if (typeof cond === 'string' && sim.boolexprs.has(cond)) fn = sim.boolexprs.get(cond).fn;
      if (typeof fn === 'function' && !fn()[0]) return false;
    }
    return true;
  });
  reg('TriggerExecute', (th) => {
    const t = triggerOf(th, 'TriggerExecute');
    sim.eventCtx.push({ triggeringTrigger: t.handle });
    try { for (const action of t.actions.slice()) action(); } finally { sim.eventCtx.pop(); }
  });
  reg('GetTriggeringTrigger', () => ctx().triggeringTrigger);
  reg('TriggerSleepAction', () => { /* recorded no-op: no coroutine threads in the sim */ });
  reg('PolledWait', () => { /* recorded no-op */ });

  const filterMaker = (fn) => {
    const b = { handle: handle('boolexpr'), fn: typeof fn === 'function' ? fn : null };
    sim.boolexprs.set(b.handle, b);
    return b.handle;
  };
  reg('Filter', filterMaker);
  reg('Condition', filterMaker);
  reg('DestroyBoolExpr', (bh) => { sim.boolexprs.delete(bh); });

  // event registration
  reg('TriggerRegisterPlayerChatEvent', (th, p, text, exact) => {
    triggerOf(th, 'TriggerRegisterPlayerChatEvent').events.push({
      kind: 'chat', pid: playerOf(p, 'TriggerRegisterPlayerChatEvent').idx,
      text: String(text), exact: !!exact,
    });
    return handle('event');
  });
  reg('TriggerRegisterPlayerUnitEvent', (th, p, ev) => {
    triggerOf(th, 'TriggerRegisterPlayerUnitEvent').events.push({
      kind: 'pue', pid: playerOf(p, 'TriggerRegisterPlayerUnitEvent').idx, ev,
    });
    return handle('event');
  });
  reg('TriggerRegisterAnyUnitEventBJ', (th, ev) => {
    triggerOf(th, 'TriggerRegisterAnyUnitEventBJ').events.push({ kind: 'pue', pid: null, ev });
    return handle('event');
  });
  reg('TriggerRegisterUnitEvent', (th, uh, ev) => {
    unitOf(uh, 'TriggerRegisterUnitEvent');
    triggerOf(th, 'TriggerRegisterUnitEvent').events.push({ kind: 'ue', unit: uh, ev });
    return handle('event');
  });
  reg('TriggerRegisterPlayerEvent', (th, p, ev) => {
    triggerOf(th, 'TriggerRegisterPlayerEvent').events.push({
      kind: 'pe', pid: playerOf(p, 'TriggerRegisterPlayerEvent').idx, ev,
    });
    return handle('event');
  });
  // widget death: on a destructable this is THE destructable death event;
  // on a unit it is equivalent to the plain unit-death event
  reg('TriggerRegisterDeathEvent', (th, wh) => {
    const trig = triggerOf(th, 'TriggerRegisterDeathEvent');
    if (maybeDest(wh)) trig.events.push({ kind: 'wdeath', widget: wh });
    else trig.events.push({ kind: 'ue', unit: unitOf(wh, 'TriggerRegisterDeathEvent').handle, ev: S.UE_DEATH });
    return handle('event');
  });
  // BJ: death events for destructables currently in the rect (first 64 —
  // the real BJ's bj_MAX_DEST_IN_REGION_EVENTS cap)
  reg('TriggerRegisterDestDeathInRegionEvent', (th, rh) => {
    const trig = triggerOf(th, 'TriggerRegisterDestDeathInRegionEvent');
    const r = rectOf(rh, 'TriggerRegisterDestDeathInRegionEvent');
    let n = 0;
    for (const d of sim.destructables.values()) {
      if (d.removed || !rectContains(r, d.x, d.y)) continue;
      if (++n > MAX_DEST_DEATH_EVENTS_IN_REGION) break;
      trig.events.push({ kind: 'wdeath', widget: d.handle });
    }
    return handle('event');
  });
  reg('TriggerRegisterEnterRegion', (th, regionH, filter) => {
    regionOf(regionH, 'TriggerRegisterEnterRegion');
    triggerOf(th, 'TriggerRegisterEnterRegion').events.push({ kind: 'enter', region: regionH, filter });
    return handle('event');
  });
  reg('TriggerRegisterLeaveRegion', (th, regionH, filter) => {
    regionOf(regionH, 'TriggerRegisterLeaveRegion');
    triggerOf(th, 'TriggerRegisterLeaveRegion').events.push({ kind: 'leave', region: regionH, filter });
    return handle('event');
  });
  reg('TriggerRegisterTimerEvent', (th, timeout, periodic) => {
    // internal timer that fires the trigger
    const trig = triggerOf(th, 'TriggerRegisterTimerEvent');
    const tH = natives.CreateTimer();
    natives.TimerStart(tH, timeout, periodic, () => executeTrigger(trig, { expiredTimer: tH }));
    return handle('event');
  });
  reg('TriggerRegisterTimerExpireEvent', (th, timerH) => {
    triggerOf(th, 'TriggerRegisterTimerExpireEvent');
    timerOf(timerH, 'TriggerRegisterTimerExpireEvent').expireTriggers.push(th);
    return handle('event');
  });

  // event-response getters
  reg('GetTriggerUnit', () => ctx().triggerUnit);
  reg('GetKillingUnit', () => ctx().killingUnit);
  reg('GetDyingUnit', () => ctx().dyingUnit);
  reg('GetConstructedStructure', () => ctx().constructedStructure);
  reg('GetSoldItem', () => ctx().soldItem);
  reg('GetSellingUnit', () => ctx().sellingUnit);
  reg('GetBuyingUnit', () => ctx().buyingUnit);
  reg('GetSoldUnit', () => ctx().soldUnit);
  reg('GetTriggerPlayer', () => ctx().triggerPlayer);
  reg('GetEventPlayerChatString', () => ctx().chatString);
  reg('GetEventPlayerChatStringMatched', () => ctx().chatString);
  reg('GetTriggeringRegion', () => ctx().triggeringRegion);
  reg('GetEnteringUnit', () => ctx().enteringUnit);
  reg('GetLeavingUnit', () => ctx().leavingUnit);
  reg('GetLevelingUnit', () => ctx().triggerUnit);
  // spell-event getters (valid inside the five SPELL_* events — header order)
  reg('GetSpellAbilityId', () => ctx().spellAbilityId || 0);
  reg('GetSpellAbilityUnit', () => ctx().spellAbilityUnit);
  reg('GetSpellTargetUnit', () => ctx().spellTargetUnit);
  reg('GetSpellTargetDestructable', () => ctx().spellTargetDestructable);
  reg('GetSpellTargetItem', () => ctx().spellTargetItem);
  reg('GetSpellTargetX', () => ctx().spellTargetX || 0);
  reg('GetSpellTargetY', () => ctx().spellTargetY || 0);
  // hero-skill event getters (SelectHeroSkill)
  reg('GetLearnedSkill', () => ctx().learnedSkill || 0);
  reg('GetLearnedSkillLevel', () => ctx().learnedSkillLevel || 0);
  reg('GetLearningUnit', () => ctx().learningUnit);
  // item-manipulation getters (PICKUP/DROP/USE/SELL_ITEM events)
  reg('GetManipulatedItem', () => ctx().manipulatedItem);
  reg('GetManipulatingUnit', () => ctx().manipulatingUnit);
  reg('GetEnumDestructable', () => ctx().enumDestructable);
  reg('GetFilterDestructable', () => ctx().filterDestructable);
  reg('GetTriggerDestructable', () => ctx().triggerDestructable);
  reg('GetDyingDestructable', () => ctx().dyingDestructable);
  reg('GetTriggerWidget', () => ctx().triggerWidget);
  // damage-event getters (valid only inside a DAMAGING/DAMAGED handler)
  reg('GetEventDamage', () => (ctx().damage ? ctx().damage.amount : 0));
  reg('GetEventDamageSource', () => ctx().damageSource);
  reg('BlzGetEventDamageTarget', () => ctx().damageTarget);
  reg('BlzSetEventDamage', (v) => {
    const frame = ctx();
    if (!frame.damage) throw new Error('BlzSetEventDamage: not inside a DAMAGING/DAMAGED event handler');
    if (typeof v !== 'number') throw new Error(`BlzSetEventDamage: not a number: ${JSON.stringify(v)}`);
    frame.damage.amount = v;
  });

  // --- destructables (instantiated from doodads.json by lib/sim/index.js;
  //     classification + honesty notes in the header comment) ------------------
  reg('CreateDestructable', (typeId, x, y) => createDestructableInternal(typeId, x, y).handle);
  reg('CreateDestructableZ', (typeId, x, y) => createDestructableInternal(typeId, x, y).handle);
  reg('KillDestructable', (dh) => killDestructableInternal(destOf(dh, 'KillDestructable')));
  reg('RemoveDestructable', (dh) => {
    const d = destOf(dh, 'RemoveDestructable');
    d.removed = true;
    d.alive = false;
  });
  reg('GetDestructableLife', (dh) => {
    const d = destOf(dh, 'GetDestructableLife');
    return d.removed ? 0 : d.life;
  });
  reg('SetDestructableLife', (dh, v) => setDestructableLifeInternal(destOf(dh, 'SetDestructableLife'), v));
  reg('GetDestructableMaxLife', (dh) => destOf(dh, 'GetDestructableMaxLife').maxLife);
  reg('SetDestructableMaxLife', (dh, v) => { destOf(dh, 'SetDestructableMaxLife').maxLife = v; });
  reg('DestructableRestoreLife', (dh, life) => {
    const d = destOf(dh, 'DestructableRestoreLife');
    if (d.removed) return;
    d.life = Math.max(0, Math.min(d.maxLife, life));
    d.alive = d.life > 0;
  });
  reg('GetDestructableX', (dh) => destOf(dh, 'GetDestructableX').x);
  reg('GetDestructableY', (dh) => destOf(dh, 'GetDestructableY').y);
  reg('GetDestructableTypeId', (dh) => destOf(dh, 'GetDestructableTypeId').typeId);
  reg('GetDestructableName', (dh) => {
    const d = destOf(dh, 'GetDestructableName');
    return sim.objectData.destName.get(d.typeId) || d.typeStr;
  });
  reg('IsDestructableAliveBJ', (dh) => {
    const d = destOf(dh, 'IsDestructableAliveBJ');
    return d.alive && !d.removed && d.life > 0.405;
  });
  reg('IsDestructableDeadBJ', (dh) => !natives.IsDestructableAliveBJ(dh));
  reg('IsDestructableInvulnerable', () => false);
  // enumerates DEAD (not removed) destructables too, like the game
  reg('EnumDestructablesInRect', (rh, filter, action) => {
    const r = rectOf(rh, 'EnumDestructablesInRect');
    for (const d of Array.from(sim.destructables.values())) {
      if (d.removed || !rectContains(r, d.x, d.y)) continue;
      if (!passesDestFilter(filter, d)) continue;
      sim.eventCtx.push({ enumDestructable: d.handle });
      try { if (typeof action === 'function') action(); } finally { sim.eventCtx.pop(); }
    }
  });

  // --- display / results ---------------------------------------------------------
  reg('DisplayTextToPlayer', (p, x, y, text) => {
    sim.messages.push({ t: sim.now, pid: playerOf(p, 'DisplayTextToPlayer').idx, text: String(text) });
  });
  reg('DisplayTimedTextToPlayer', (p, x, y, duration, text) => {
    sim.messages.push({
      t: sim.now, pid: playerOf(p, 'DisplayTimedTextToPlayer').idx,
      duration, text: String(text),
    });
  });
  reg('CustomVictoryBJ', (p) => { sim.results[playerOf(p, 'CustomVictoryBJ').idx] = 'victory'; });
  reg('CustomDefeatBJ', (p) => { sim.results[playerOf(p, 'CustomDefeatBJ').idx] = 'defeat'; });
  reg('print', (...args) => { sim.prints.push(args.map(String).join('\t')); });

  // --- numeric-returning trivials (stub strings would break arithmetic) ---------
  reg('GetCameraMargin', () => 0);
  reg('GetCameraTargetPositionX', () => 0);
  reg('GetCameraTargetPositionY', () => 0);

  // --- Blizzard.j plumbing --------------------------------------------------------
  reg('InitBlizzard', () => {
    if (!vm.hasGlobal('bj_mapInitialPlayableArea')) {
      vm.setGlobal('bj_mapInitialPlayableArea', natives.Rect(-32768, -32768, 32768, 32768));
    }
  });

  // ------------------------------------------------- install into the VM
  // constants first (eager), then natives with the recording wrapper, then
  // the auto-stub __index hook for everything else.
  for (const [name, spec] of Object.entries(CONSTANTS)) {
    let value;
    if (spec.conv !== undefined) value = convSentinel(spec.conv, spec.arg);
    else if (spec.call !== undefined) value = CALLS[spec.call];
    else value = spec.value;
    if (value !== undefined) vm.setGlobal(name, value);
  }

  for (const [name, fn] of Object.entries(natives)) {
    const wrapReal = REAL_RETURNS.has(name);
    vm.setGlobal(name, (...args) => {
      record(name, args);
      const result = fn(...args);
      // 'real'-typed natives must reach Lua as floats (GetUnitX -> 50.0),
      // matching the game's tostring/concat behavior
      return wrapReal && typeof result === 'number' ? real(result) : result;
    });
  }

  vm.installIndexHook((name) => {
    if (!API_FUNCTIONS.has(name)) return undefined; // plain nil: not API surface
    sim.stubbed.set(name, sim.stubbed.get(name) || 0);
    return (...args) => {
      sim.stubbed.set(name, (sim.stubbed.get(name) || 0) + 1);
      record(name, args);
      return `stub:${name}#${++sim.handleSeq}`;
    };
  });

  sim.natives = natives; // JS-side access for the harness (unwrapped, unrecorded)
  sim.sentinels = S;
  return natives;
}

module.exports = { installNatives, fourCC, fourCCToStr, convSentinel, NUM_SLOTS };
