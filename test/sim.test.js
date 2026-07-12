'use strict';
// Unit tests for the headless Lua logic-test harness (lib/sim/): the VM,
// the virtual clock, and the real-semantics native mocks. Map-level logic
// tests live in test/maplogic.test.js and maps/<name>/tests/.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadMap, fourCC } = require('../lib/sim');

// tiny inline "map": no config/main, just a scriptable sandbox
function sandbox(script) {
  return loadMap(null, { script: script || '', config: false, main: false });
}

test('VM is Lua 5.3: integer division, patterns, integer subtype', () => {
  const sim = sandbox(`
    result_div = 1000 // 20
    result_match = string.match("-gold 500", "^%-gold%s+(%d+)$")
    result_type = math.type(result_div)
  `);
  assert.strictEqual(sim.global('result_div'), 50);
  assert.strictEqual(sim.global('result_match'), '500');
  assert.strictEqual(sim.global('result_type'), 'integer');
});

test('FourCC is real math and round-trips', () => {
  const sim = sandbox('id = FourCC("hfoo")');
  assert.strictEqual(sim.global('id'), fourCC('hfoo'));
  assert.strictEqual(fourCC('hfoo'), 0x68666f6f);
});

test('Lua syntax/runtime errors surface as JS errors with tracebacks', () => {
  assert.throws(() => sandbox('this is not lua'), /LuaError|syntax|near/i);
  // real API name whose stub result reaches arithmetic -> loud failure
  assert.throws(() => sandbox('local x = 1 + GetUnitFlyHeight()'), /arithmetic/);
  // NOT an API name: normal Lua nil semantics -> "call a nil value"
  assert.throws(() => sandbox('SomeMadeUpGlobalFn()'), /nil value/);
});

test('non-API globals stay nil: map-author flags keep Lua truthiness', () => {
  const sim = sandbox(`
    was_nil = (myMapFlag == nil)
    ticks = (ticks or 0) + 1
  `);
  assert.strictEqual(sim.global('was_nil'), true);
  assert.strictEqual(sim.global('ticks'), 1);
});

test('one-shot and periodic timers fire deterministically in due order', () => {
  const sim = sandbox(`
    log = {}
    local a = CreateTimer()
    local b = CreateTimer()
    local p = CreateTimer()
    TimerStart(a, 5.0, false, function() log[#log+1] = "a" end)
    TimerStart(b, 5.0, false, function() log[#log+1] = "b" end)
    TimerStart(p, 2.0, true,  function() log[#log+1] = "p" end)
  `);
  sim.advance(6);
  // p at 2,4 then a,b tie at 5 in start order, p again at 6
  sim.run('flat = table.concat(log, ",")');
  assert.strictEqual(sim.global('flat'), 'p,p,a,b,p');
});

test('After idiom: timer destroyed inside its own handler still fires once', () => {
  const sim = sandbox(`
    fired = 0
    local t = CreateTimer()
    TimerStart(t, 1.0, false, function() DestroyTimer(t); fired = fired + 1 end)
  `);
  sim.advance(10);
  assert.strictEqual(sim.global('fired'), 1);
});

test('timers created inside handlers are scheduled within the same advance', () => {
  const sim = sandbox(`
    hits = {}
    local t = CreateTimer()
    TimerStart(t, 1.0, false, function()
      hits[#hits+1] = "outer"
      local n = CreateTimer()
      TimerStart(n, 1.0, false, function() hits[#hits+1] = "inner" end)
    end)
  `);
  sim.advance(3);
  sim.run('flat = table.concat(hits, ",")');
  assert.strictEqual(sim.global('flat'), 'outer,inner');
});

test('PauseTimer/ResumeTimer preserve remaining time; GetExpiredTimer works', () => {
  const sim = sandbox(`
    fired_at = -1
    t = CreateTimer()
    was_expired = false
    TimerStart(t, 10.0, false, function()
      was_expired = (GetExpiredTimer() == t)
      fired_at = 1
    end)
  `);
  sim.advance(4);
  sim.run('PauseTimer(t)');
  sim.advance(100); // paused: must not fire
  assert.strictEqual(sim.global('fired_at'), -1);
  sim.run('ResumeTimer(t)');
  sim.advance(5.9);
  assert.strictEqual(sim.global('fired_at'), -1);
  sim.advance(0.2);
  assert.strictEqual(sim.global('fired_at'), 1);
  assert.strictEqual(sim.global('was_expired'), true);
});

test('players: alliances are per-direction, per-type; resources readback', () => {
  const sim = sandbox(`
    SetPlayerAlliance(Player(0), Player(1), ALLIANCE_PASSIVE, true)
    SetPlayerAlliance(Player(1), Player(0), ALLIANCE_SHARED_VISION, true)
    SetPlayerState(Player(2), PLAYER_STATE_RESOURCE_GOLD, 777)
    readback = GetPlayerAlliance(Player(0), Player(1), ALLIANCE_PASSIVE)
    reverse = GetPlayerAlliance(Player(1), Player(0), ALLIANCE_PASSIVE)
    vision = GetPlayerAlliance(Player(1), Player(0), ALLIANCE_SHARED_VISION)
  `);
  assert.strictEqual(sim.global('readback'), true);
  assert.strictEqual(sim.global('reverse'), false); // one direction only
  assert.strictEqual(sim.global('vision'), true);
  assert.strictEqual(sim.player(2).gold, 777);
  assert.strictEqual(sim.alliance(0, 1, 'ALLIANCE_PASSIVE'), true);
  assert.strictEqual(sim.alliance(0, 1, 'ALLIANCE_SHARED_VISION'), false);
});

test('constants: converter-derived values are canonical; neutrals are real ints', () => {
  const sim = sandbox(`
    same = (PLAYER_STATE_RESOURCE_GOLD == ConvertPlayerState(1))
    diff = (PLAYER_STATE_RESOURCE_GOLD == PLAYER_STATE_RESOURCE_LUMBER)
    aggro = PLAYER_NEUTRAL_AGGRESSIVE
    passive = PLAYER_NEUTRAL_PASSIVE
    maxp = bj_MAX_PLAYERS
  `);
  assert.strictEqual(sim.global('same'), true);
  assert.strictEqual(sim.global('diff'), false);
  assert.strictEqual(sim.global('aggro'), 24);
  assert.strictEqual(sim.global('passive'), 27);
  assert.strictEqual(sim.global('maxp'), 24);
});

test('units + groups: enum of player / in rect / in range, FirstOfGroup drain', () => {
  const sim = sandbox(`
    u1 = CreateUnit(Player(0), FourCC("hfoo"), 0.0, 0.0, 270.0)
    u2 = CreateUnit(Player(0), FourCC("hkni"), 100.0, 0.0, 270.0)
    u3 = CreateUnit(Player(1), FourCC("hfoo"), 1000.0, 1000.0, 270.0)
    local g = CreateGroup()
    GroupEnumUnitsOfPlayer(g, Player(0), nil)
    count_p0 = CountUnitsInGroup(g)
    GroupEnumUnitsInRect(g, Rect(-50.0, -50.0, 150.0, 50.0), nil)
    count_rect = CountUnitsInGroup(g)
    GroupEnumUnitsInRange(g, 0.0, 0.0, 150.0, nil)
    count_range = CountUnitsInGroup(g)
    -- classic drain loop
    GroupEnumUnitsOfPlayer(g, Player(0), nil)
    drained = 0
    local u = FirstOfGroup(g)
    while u ~= nil do
      drained = drained + 1
      GroupRemoveUnit(g, u)
      u = FirstOfGroup(g)
    end
    DestroyGroup(g)
  `);
  assert.strictEqual(sim.global('count_p0'), 2);
  assert.strictEqual(sim.global('count_rect'), 2);
  assert.strictEqual(sim.global('count_range'), 2);
  assert.strictEqual(sim.global('drained'), 2);
  assert.strictEqual(sim.unitsOf(0).length, 2);
  assert.strictEqual(sim.unitsOf(0, 'hfoo').length, 1);
});

test('group enumeration honors Filter boolexprs', () => {
  const sim = sandbox(`
    CreateUnit(Player(0), FourCC("hfoo"), 0.0, 0.0, 0.0)
    CreateUnit(Player(0), FourCC("hkni"), 0.0, 0.0, 0.0)
    local g = CreateGroup()
    GroupEnumUnitsOfPlayer(g, Player(0), Filter(function()
      return GetUnitTypeId(GetFilterUnit()) == FourCC("hfoo")
    end))
    filtered = CountUnitsInGroup(g)
  `);
  assert.strictEqual(sim.global('filtered'), 1);
});

test('death events: any-unit BJ, per-unit, owner-filtered; killing unit', () => {
  const sim = sandbox(`
    deaths = {}
    victim = CreateUnit(Player(0), FourCC("hfoo"), 0.0, 0.0, 0.0)
    other  = CreateUnit(Player(1), FourCC("hfoo"), 0.0, 0.0, 0.0)
    killer = CreateUnit(Player(1), FourCC("hkni"), 0.0, 0.0, 0.0)
    local anyT = CreateTrigger()
    TriggerRegisterAnyUnitEventBJ(anyT, EVENT_PLAYER_UNIT_DEATH)
    TriggerAddAction(anyT, function()
      deaths[#deaths+1] = "any:" .. GetUnitTypeId(GetTriggerUnit())
      killer_seen = (GetKillingUnit() == killer)
    end)
    local unitT = CreateTrigger()
    TriggerRegisterUnitEvent(unitT, victim, EVENT_UNIT_DEATH)
    TriggerAddAction(unitT, function() deaths[#deaths+1] = "unit" end)
    local p1T = CreateTrigger()
    TriggerRegisterPlayerUnitEvent(p1T, Player(1), EVENT_PLAYER_UNIT_DEATH, nil)
    TriggerAddAction(p1T, function() deaths[#deaths+1] = "p1owned" end)
  `);
  const victim = sim.units.get(sim.global('victim'));
  const killer = sim.units.get(sim.global('killer'));
  sim.kill(victim, killer);
  assert.strictEqual(sim.global('killer_seen'), true);
  sim.run('flat = table.concat(deaths, ",")');
  assert.strictEqual(sim.global('flat'), `any:${fourCC('hfoo')},unit`);
  assert.strictEqual(victim.alive, false);
  // p1-owned unit death only fires the owner-filtered trigger for player 1
  sim.kill(sim.units.get(sim.global('other')));
  sim.run('flat = table.concat(deaths, ",")');
  assert.ok(sim.global('flat').endsWith('p1owned'));
});

test('chat events: substring vs exact matching, per player', () => {
  const sim = sandbox(`
    heard = {}
    local sub = CreateTrigger()
    TriggerRegisterPlayerChatEvent(sub, Player(0), "-", false)
    TriggerAddAction(sub, function()
      heard[#heard+1] = "sub:" .. GetEventPlayerChatString()
    end)
    local exact = CreateTrigger()
    TriggerRegisterPlayerChatEvent(exact, Player(0), "-go", true)
    TriggerAddAction(exact, function() heard[#heard+1] = "exact" end)
  `);
  sim.chat(0, '-help me');
  sim.chat(0, 'no dash here fires nothing');
  sim.chat(1, '-other player');
  sim.chat(0, '-go');
  sim.run('flat = table.concat(heard, "|")');
  assert.strictEqual(sim.global('flat'), 'sub:-help me|sub:-go|exact');
});

test('enter/leave region events fire on moveUnit and on create-inside', () => {
  const sim = sandbox(`
    log = {}
    local r = CreateRegion()
    RegionAddRect(r, Rect(-100.0, -100.0, 100.0, 100.0))
    local enter = CreateTrigger()
    TriggerRegisterEnterRegion(enter, r, nil)
    TriggerAddAction(enter, function()
      log[#log+1] = "enter:" .. GetUnitX(GetTriggerUnit())
    end)
    local leave = CreateTrigger()
    TriggerRegisterLeaveRegion(leave, r, nil)
    TriggerAddAction(leave, function() log[#log+1] = "leave" end)
    walker = CreateUnit(Player(0), FourCC("hfoo"), 500.0, 500.0, 0.0)
    inside = CreateUnit(Player(0), FourCC("hfoo"), 0.0, 0.0, 0.0)
  `);
  const walker = sim.units.get(sim.global('walker'));
  sim.moveUnit(walker, 50, 50);
  sim.moveUnit(walker, 60, 60); // still inside: no second enter
  sim.moveUnit(walker, 500, 500);
  sim.run('flat = table.concat(log, ",")');
  assert.strictEqual(sim.global('flat'), 'enter:0.0,enter:50.0,leave');
});

test('timer-expire trigger events; TriggerRegisterTimerEvent periodic', () => {
  const sim = sandbox(`
    hits = 0
    local t = CreateTimer()
    local trig = CreateTrigger()
    TriggerRegisterTimerExpireEvent(trig, t)
    TriggerAddAction(trig, function() hits = hits + 1 end)
    TimerStart(t, 3.0, false, nil)

    local cond = CreateTrigger()
    TriggerAddCondition(cond, Condition(function() return hits > 0 end))
    eval_before = TriggerEvaluate(cond)

    local reg = CreateTrigger()
    TriggerRegisterTimerEvent(reg, 1.0, true)
    TriggerAddAction(reg, function() ticks = (ticks or 0) + 1 end)
  `);
  sim.advance(3.5);
  assert.strictEqual(sim.global('hits'), 1);
  assert.strictEqual(sim.global('eval_before'), false);
  assert.strictEqual(sim.global('ticks'), 3); // periodic trigger event at 1,2,3
});

test('TriggerEvaluate after state change + DisableTrigger stops dispatch', () => {
  const sim = sandbox(`
    hits = 0
    trig = CreateTrigger()
    TriggerRegisterPlayerChatEvent(trig, Player(0), "-x", true)
    TriggerAddAction(trig, function() hits = hits + 1 end)
  `);
  sim.chat(0, '-x');
  sim.run('DisableTrigger(trig)');
  sim.chat(0, '-x');
  sim.run('EnableTrigger(trig)');
  sim.chat(0, '-x');
  assert.strictEqual(sim.global('hits'), 2);
});

test('virtual time of day: starts 8.00, default 480s day, SetTimeOfDay', () => {
  const sim = sandbox('');
  assert.strictEqual(sim.natives.GetTimeOfDay(), 8);
  sim.advance(200); // 200s * 0.05 h/s = 10h -> 18.00 (nightfall)
  assert.ok(Math.abs(sim.natives.GetTimeOfDay() - 18) < 1e-9);
  sim.run('SetTimeOfDay(4.0)');
  assert.ok(Math.abs(sim.natives.GetTimeOfDay() - 4) < 1e-9);
});

test('auto-stub: unimplemented API natives record calls and return distinct handles', () => {
  const sim = sandbox(`
    local a = CreateFogModifierRect(Player(0), FOG_OF_WAR_VISIBLE, bj_mapInitialPlayableArea, true, false)
    local b = CreateFogModifierRect(Player(0), FOG_OF_WAR_VISIBLE, bj_mapInitialPlayableArea, true, false)
    distinct = (a ~= b)
    FogModifierStart(a)
  `);
  assert.strictEqual(sim.global('distinct'), true);
  assert.ok(sim.stubbed.has('CreateFogModifierRect'));
  assert.strictEqual(sim.stubbed.get('CreateFogModifierRect'), 2);
  assert.strictEqual(sim.callsOf('FogModifierStart').length, 1);
});

test('hero basics: level/attrs, ReviveHero restores life at new position', () => {
  const sim = sandbox(`
    h = CreateUnit(Player(0), FourCC("Hpal"), 0.0, 0.0, 0.0)
    SetHeroLevel(h, 5, false)
    SetHeroStr(h, 30, true)
    is_hero = IsUnitType(h, UNIT_TYPE_HERO)
    lvl = GetHeroLevel(h)
  `);
  assert.strictEqual(sim.global('is_hero'), true);
  assert.strictEqual(sim.global('lvl'), 5);
  const h = sim.units.get(sim.global('h'));
  sim.kill(h);
  assert.strictEqual(h.alive, false);
  sim.run('revived = ReviveHero(h, 300.0, 400.0, true)');
  assert.strictEqual(sim.global('revived'), true);
  assert.strictEqual(h.alive, true);
  assert.deepStrictEqual([h.x, h.y], [300, 400]);
  assert.strictEqual(h.life, h.maxLife);
});

test('deterministic RNG: same seed same sequence, different seed diverges', () => {
  const roll = (seed) => {
    const sim = loadMap(null, {
      script: 'r = {} for i = 1, 5 do r[i] = GetRandomInt(1, 1000) end flat = table.concat(r, ",")',
      config: false, main: false, seed,
    });
    return sim.global('flat');
  };
  assert.strictEqual(roll(7), roll(7));
  assert.notStrictEqual(roll(7), roll(8));
});

test('damage: UnitDamageTarget deducts life flat; widget-life readers agree', () => {
  const sim = sandbox(`
    src = CreateUnit(Player(0), FourCC("hfoo"), 0.0, 0.0, 0.0)
    tgt = CreateUnit(Player(1), FourCC("hfoo"), 0.0, 0.0, 0.0)
    ok = UnitDamageTarget(src, tgt, 30.0, true, false,
      ATTACK_TYPE_NORMAL, DAMAGE_TYPE_NORMAL, WEAPON_TYPE_WHOKNOWS)
    life_widget = GetWidgetLife(tgt)
    life_state = GetUnitState(tgt, UNIT_STATE_LIFE)
  `);
  assert.strictEqual(sim.global('ok'), true);
  assert.strictEqual(sim.global('life_widget'), 70); // 100 default max, no mitigation
  assert.strictEqual(sim.global('life_state'), 70);
  const tgt = sim.units.get(sim.global('tgt'));
  assert.strictEqual(tgt.life, 70);
  assert.strictEqual(tgt.alive, true);
  // sim.damage harness mirrors the native path and returns the applied amount
  assert.strictEqual(sim.damage(sim.units.get(sim.global('src')), tgt, 20), 20);
  assert.strictEqual(tgt.life, 50);
});

test('damage: DAMAGED event fires BEFORE application with correct getters', () => {
  const sim = sandbox(`
    src = CreateUnit(Player(0), FourCC("hfoo"), 0.0, 0.0, 0.0)
    tgt = CreateUnit(Player(1), FourCC("hfoo"), 0.0, 0.0, 0.0)
    local t = CreateTrigger()
    TriggerRegisterAnyUnitEventBJ(t, EVENT_PLAYER_UNIT_DAMAGED)
    TriggerAddAction(t, function()
      seen_amount = GetEventDamage()
      seen_source = (GetEventDamageSource() == src)
      seen_target = (BlzGetEventDamageTarget() == tgt)
      seen_trigger_unit = (GetTriggerUnit() == tgt)
      life_inside = GetWidgetLife(tgt)  -- damage NOT applied yet
    end)
    UnitDamageTarget(src, tgt, 25.0, true, false,
      ATTACK_TYPE_NORMAL, DAMAGE_TYPE_NORMAL, WEAPON_TYPE_WHOKNOWS)
  `);
  assert.strictEqual(sim.global('seen_amount'), 25);
  assert.strictEqual(sim.global('seen_source'), true);
  assert.strictEqual(sim.global('seen_target'), true);
  assert.strictEqual(sim.global('seen_trigger_unit'), true);
  assert.strictEqual(sim.global('life_inside'), 100); // pre-application
  assert.strictEqual(sim.units.get(sim.global('tgt')).life, 75);
});

test('damage: DAMAGING fires first; BlzSetEventDamage changes the applied amount', () => {
  const sim = sandbox(`
    order = {}
    src = CreateUnit(Player(0), FourCC("hfoo"), 0.0, 0.0, 0.0)
    tgt = CreateUnit(Player(1), FourCC("hfoo"), 0.0, 0.0, 0.0)
    local pre = CreateTrigger()
    TriggerRegisterAnyUnitEventBJ(pre, EVENT_PLAYER_UNIT_DAMAGING)
    TriggerAddAction(pre, function()
      order[#order+1] = "damaging:" .. GetEventDamage()
      BlzSetEventDamage(GetEventDamage() * 2.0)  -- carries into DAMAGED
    end)
    local post = CreateTrigger()
    TriggerRegisterAnyUnitEventBJ(post, EVENT_PLAYER_UNIT_DAMAGED)
    TriggerAddAction(post, function()
      order[#order+1] = "damaged:" .. GetEventDamage()
      BlzSetEventDamage(GetEventDamage() + 10.0)
    end)
    UnitDamageTarget(src, tgt, 10.0, true, false,
      ATTACK_TYPE_NORMAL, DAMAGE_TYPE_NORMAL, WEAPON_TYPE_WHOKNOWS)
    flat = table.concat(order, "|")
  `);
  assert.strictEqual(sim.global('flat'), 'damaging:10.0|damaged:20.0');
  assert.strictEqual(sim.units.get(sim.global('tgt')).life, 70); // 100 - (10*2+10)
  // BlzSetEventDamage outside a damage handler fails loudly
  assert.throws(() => sim.run('BlzSetEventDamage(5.0)'), /not inside a DAMAGING\/DAMAGED/);
});

test('damage to zero routes through the death path with killer credit', () => {
  const sim = sandbox(`
    src = CreateUnit(Player(0), FourCC("hkni"), 0.0, 0.0, 0.0)
    tgt = CreateUnit(Player(1), FourCC("hfoo"), 0.0, 0.0, 0.0)
    local t = CreateTrigger()
    TriggerRegisterAnyUnitEventBJ(t, EVENT_PLAYER_UNIT_DEATH)
    TriggerAddAction(t, function()
      died = (GetTriggerUnit() == tgt)
      credited = (GetKillingUnit() == src)
    end)
    UnitDamageTarget(src, tgt, 250.0, true, false,
      ATTACK_TYPE_NORMAL, DAMAGE_TYPE_NORMAL, WEAPON_TYPE_WHOKNOWS)
  `);
  assert.strictEqual(sim.global('died'), true);
  assert.strictEqual(sim.global('credited'), true);
  const tgt = sim.units.get(sim.global('tgt'));
  assert.strictEqual(tgt.alive, false);
  assert.strictEqual(tgt.life, 0);
});

test('damage: recursive damage handlers hard-error at the depth cap', () => {
  const sim = sandbox(`
    src = CreateUnit(Player(0), FourCC("hfoo"), 0.0, 0.0, 0.0)
    tgt = CreateUnit(Player(1), FourCC("hfoo"), 0.0, 0.0, 0.0)
    SetUnitState(tgt, UNIT_STATE_MAX_LIFE, 1000000.0)
    SetWidgetLife(tgt, 1000000.0)
    local t = CreateTrigger()
    TriggerRegisterAnyUnitEventBJ(t, EVENT_PLAYER_UNIT_DAMAGED)
    TriggerAddAction(t, function()
      -- classic infinite damage loop: re-damage the damaged unit
      UnitDamageTarget(src, BlzGetEventDamageTarget(), 1.0, true, false,
        ATTACK_TYPE_NORMAL, DAMAGE_TYPE_NORMAL, WEAPON_TYPE_WHOKNOWS)
    end)
  `);
  assert.throws(
    () => sim.run('UnitDamageTarget(src, tgt, 1.0, true, false, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_NORMAL, WEAPON_TYPE_WHOKNOWS)'),
    /damage recursion deeper than 8.*trigger/s);
});

test('destructables: create/enum/filter/kill/death-event round-trip', () => {
  const sim = sandbox(`
    log = {}
    d1 = CreateDestructable(FourCC("LTlt"), 100.0, 100.0, 0.0, 1.0, 0)
    d2 = CreateDestructable(FourCC("LTlt"), 200.0, 200.0, 0.0, 1.0, 0)
    far = CreateDestructable(FourCC("LTlt"), 9000.0, 9000.0, 0.0, 1.0, 0)
    max_life = GetDestructableMaxLife(d1)
    name = GetDestructableName(d1)
    -- death event on d1 (TriggerRegisterDeathEvent takes a widget)
    local t = CreateTrigger()
    TriggerRegisterDeathEvent(t, d1)
    TriggerAddAction(t, function()
      log[#log+1] = "death:" .. GetDestructableName(GetTriggerDestructable())
      dying_matches = (GetDyingDestructable() == d1) and (GetTriggerWidget() == d1)
    end)
    -- enum with a filter: everything in the rect except d2
    local r = Rect(0.0, 0.0, 500.0, 500.0)
    EnumDestructablesInRect(r, Filter(function()
      return GetFilterDestructable() ~= d2
    end), function()
      log[#log+1] = "enum:" .. GetDestructableX(GetEnumDestructable())
      KillDestructable(GetEnumDestructable())
    end)
    alive_after = IsDestructableAliveBJ(d1)
    life_after = GetDestructableLife(d1)
    -- dead destructables still enumerate (like the game); removed ones do not
    count2 = 0
    EnumDestructablesInRect(r, nil, function() count2 = count2 + 1 end)
    RemoveDestructable(d1)
    count3 = 0
    EnumDestructablesInRect(r, nil, function() count3 = count3 + 1 end)
    -- restore brings d2 back to life
    SetDestructableLife(d2, 0.0)
    DestructableRestoreLife(d2, 40.0, true)
    d2_alive = IsDestructableAliveBJ(d2)
    d2_life = GetDestructableLife(d2)
  `);
  assert.strictEqual(sim.global('max_life'), 100); // neutral default, no map delta
  assert.strictEqual(sim.global('name'), 'LTlt');  // typeStr fallback
  sim.run('flat = table.concat(log, "|")');
  assert.strictEqual(sim.global('flat'), 'enum:100.0|death:LTlt');
  assert.strictEqual(sim.global('dying_matches'), true);
  assert.strictEqual(sim.global('alive_after'), false);
  assert.strictEqual(sim.global('life_after'), 0);
  assert.strictEqual(sim.global('count2'), 2); // dead d1 + filtered-last-time d2
  assert.strictEqual(sim.global('count3'), 1); // d1 removed
  assert.strictEqual(sim.global('d2_alive'), true);
  assert.strictEqual(sim.global('d2_life'), 40);
  assert.strictEqual(sim.dests().length, 2);   // far + d2 (d1 removed)
});

test('destructables: instantiated from a synthetic map source, map-delta only', () => {
  // copy the demo source, then: LTlt gets destructable object data (bhps max
  // life + bnam name), a new LTrc placement is classified DECORATIVE via
  // objects-doodads.json, and one LTlt placement carries a .doo life percent
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'w3xsimdest-'));
  try {
    fs.cpSync(path.join(__dirname, '..', 'maps', 'demo'), tmp, { recursive: true });
    const dooPath = path.join(tmp, 'doodads.json');
    const doo = JSON.parse(fs.readFileSync(dooPath, 'utf8'));
    doo.regular[1].life = 50; // half-life placement
    doo.regular.push({
      type: 'LTrc', position: [0, 0, 0], angle: 0, scale: [1, 1, 1],
      flags: { visible: true, solid: true, fixedZ: false }, id: 102, variation: 0,
    });
    fs.writeFileSync(dooPath, JSON.stringify(doo));
    const mod = (id, type, value) => ({ id, type, level: 0, column: 0, value });
    fs.writeFileSync(path.join(tmp, 'objects-destructables.json'), JSON.stringify({
      original: { LTlt: [mod('bhps', 'int', 80), mod('bnam', 'string', 'Test Tree')] },
      custom: {},
    }));
    fs.writeFileSync(path.join(tmp, 'objects-doodads.json'), JSON.stringify({
      original: { LTrc: [mod('dnam', 'string', 'Decorative Rocks')] },
      custom: {},
    }));

    const sim = loadMap(tmp);
    const trees = sim.dests('LTlt');
    assert.strictEqual(trees.length, 2, 'both LTlt placements instantiated');
    assert.strictEqual(sim.dests('LTrc').length, 0, 'objects-doodads.json type is decorative');
    assert.deepStrictEqual(trees.map((d) => d.maxLife), [80, 80], 'bhps map delta');
    assert.deepStrictEqual(trees.map((d) => d.life), [80, 40], 'placement life percent');
    sim.run(`n = GetDestructableName("${trees[0].handle}")`);
    assert.strictEqual(sim.global('n'), 'Test Tree'); // bnam map delta
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('abilities: add/remove/level bookkeeping with real booleans', () => {
  const sim = sandbox(`
    u = CreateUnit(Player(0), FourCC("hfoo"), 0.0, 0.0, 0.0)
    lvl_absent = GetUnitAbilityLevel(u, FourCC("A000"))
    add1 = UnitAddAbility(u, FourCC("A000"))
    add2 = UnitAddAbility(u, FourCC("A000"))   -- already known -> false
    lvl_added = GetUnitAbilityLevel(u, FourCC("A000"))
    set3 = SetUnitAbilityLevel(u, FourCC("A000"), 3)
    inc4 = IncUnitAbilityLevel(u, FourCC("A000"))
    dec3 = DecUnitAbilityLevel(u, FourCC("A000"))
    set_absent = SetUnitAbilityLevel(u, FourCC("A999"), 5)  -- absent -> 0, no-op
    inc_absent = IncUnitAbilityLevel(u, FourCC("A999"))
    rem1 = UnitRemoveAbility(u, FourCC("A000"))
    rem2 = UnitRemoveAbility(u, FourCC("A000"))  -- already gone -> false
    lvl_after = GetUnitAbilityLevel(u, FourCC("A000"))
  `);
  assert.strictEqual(sim.global('lvl_absent'), 0);
  assert.strictEqual(sim.global('add1'), true);
  assert.strictEqual(sim.global('add2'), false);
  assert.strictEqual(sim.global('lvl_added'), 1);
  assert.strictEqual(sim.global('set3'), 3);
  assert.strictEqual(sim.global('inc4'), 4);
  assert.strictEqual(sim.global('dec3'), 3);
  assert.strictEqual(sim.global('set_absent'), 0);
  assert.strictEqual(sim.global('inc_absent'), 0);
  assert.strictEqual(sim.global('rem1'), true);
  assert.strictEqual(sim.global('rem2'), false);
  assert.strictEqual(sim.global('lvl_after'), 0);
  assert.strictEqual(sim.global('set_absent'), 0);
  assert.strictEqual(sim.units.get(sim.global('u')).abilities.has(fourCC('A999')), false,
    'Set on an absent ability must not implicitly grant it');
});

test('spell cast: CHANNEL->CAST->EFFECT->FINISH->ENDCAST with getters, unit target', () => {
  const sim = sandbox(`
    order = {}
    caster = CreateUnit(Player(0), FourCC("Hpal"), 10.0, 20.0, 0.0)
    victim = CreateUnit(Player(1), FourCC("hfoo"), 300.0, 400.0, 0.0)
    UnitAddAbility(caster, FourCC("A001"))
    local function watch(ev, tag)
      local t = CreateTrigger()
      TriggerRegisterAnyUnitEventBJ(t, ev)
      TriggerAddAction(t, function()
        order[#order+1] = tag
        ability_ok = (GetSpellAbilityId() == FourCC("A001"))
        caster_ok = (GetSpellAbilityUnit() == caster) and (GetTriggerUnit() == caster)
        target_ok = (GetSpellTargetUnit() == victim)
        tx, ty = GetSpellTargetX(), GetSpellTargetY()
      end)
    end
    watch(EVENT_PLAYER_UNIT_SPELL_CHANNEL, "channel")
    watch(EVENT_PLAYER_UNIT_SPELL_CAST, "cast")
    watch(EVENT_PLAYER_UNIT_SPELL_EFFECT, "effect")
    watch(EVENT_PLAYER_UNIT_SPELL_FINISH, "finish")
    watch(EVENT_PLAYER_UNIT_SPELL_ENDCAST, "endcast")
    -- the EVENT_UNIT_* twin fires for the caster unit itself
    local ut = CreateTrigger()
    TriggerRegisterUnitEvent(ut, caster, EVENT_UNIT_SPELL_EFFECT)
    TriggerAddAction(ut, function() unit_twin = true end)
  `);
  const caster = sim.units.get(sim.global('caster'));
  const victim = sim.units.get(sim.global('victim'));
  sim.cast(caster, 'A001', victim);
  sim.run('flat = table.concat(order, ",")');
  assert.strictEqual(sim.global('flat'), 'channel,cast,effect,finish,endcast');
  assert.strictEqual(sim.global('ability_ok'), true);
  assert.strictEqual(sim.global('caster_ok'), true);
  assert.strictEqual(sim.global('target_ok'), true);
  assert.strictEqual(sim.global('tx'), 300);
  assert.strictEqual(sim.global('ty'), 400);
  assert.strictEqual(sim.global('unit_twin'), true);
});

test('spell cast: point target and no-target coordinate semantics', () => {
  const sim = sandbox(`
    caster = CreateUnit(Player(0), FourCC("Hpal"), 50.0, 60.0, 0.0)
    UnitAddAbility(caster, FourCC("A002"))
    local t = CreateTrigger()
    TriggerRegisterAnyUnitEventBJ(t, EVENT_PLAYER_UNIT_SPELL_EFFECT)
    TriggerAddAction(t, function()
      hits = (hits or 0) + 1
      no_unit = (GetSpellTargetUnit() == nil)
      tx, ty = GetSpellTargetX(), GetSpellTargetY()
    end)
  `);
  const caster = sim.units.get(sim.global('caster'));
  sim.cast(caster, 'A002', { x: -500, y: 750 });
  assert.strictEqual(sim.global('no_unit'), true);
  assert.deepStrictEqual([sim.global('tx'), sim.global('ty')], [-500, 750]);
  sim.cast(caster, 'A002'); // no target: caster's own position
  assert.deepStrictEqual([sim.global('tx'), sim.global('ty')], [50, 60]);
  assert.strictEqual(sim.global('hits'), 2);
});

test('sim.cast hard-errors on an unknown ability; {force} overrides (stock-kit case)', () => {
  const sim = sandbox(`
    u = CreateUnit(Player(0), FourCC("Hpal"), 0.0, 0.0, 0.0)
    local t = CreateTrigger()
    TriggerRegisterAnyUnitEventBJ(t, EVENT_PLAYER_UNIT_SPELL_EFFECT)
    TriggerAddAction(t, function() fired = true end)
  `);
  const u = sim.units.get(sim.global('u'));
  // a stock unit's known set is EMPTY (map-delta doctrine: no fabricated kits)
  assert.strictEqual(u.abilities.size, 0);
  assert.throws(() => sim.cast(u, 'AHhb'), /does not know ability AHhb.*force/s);
  assert.notStrictEqual(sim.global('fired'), true);
  sim.cast(u, 'AHhb', undefined, { force: true });
  assert.strictEqual(sim.global('fired'), true);
});

test('SelectHeroSkill learns then levels; HERO_SKILL event getters', () => {
  const sim = sandbox(`
    log = {}
    h = CreateUnit(Player(0), FourCC("Hpal"), 0.0, 0.0, 0.0)
    local t = CreateTrigger()
    TriggerRegisterAnyUnitEventBJ(t, EVENT_PLAYER_HERO_SKILL)
    TriggerAddAction(t, function()
      log[#log+1] = GetLearnedSkillLevel()
      skill_ok = (GetLearnedSkill() == FourCC("A005"))
      learner_ok = (GetLearningUnit() == h) and (GetTriggerUnit() == h)
    end)
    SelectHeroSkill(h, FourCC("A005"))
    SelectHeroSkill(h, FourCC("A005"))
    lvl = GetUnitAbilityLevel(h, FourCC("A005"))
  `);
  sim.run('flat = table.concat(log, ",")');
  assert.strictEqual(sim.global('flat'), '1,2');
  assert.strictEqual(sim.global('skill_ok'), true);
  assert.strictEqual(sim.global('learner_ok'), true);
  assert.strictEqual(sim.global('lvl'), 2);
});

// build a throwaway map source on top of the demo template with the given
// objects-*.json tables (shared by the map-delta stat tests below)
function withSyntheticSource(files, fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'w3xsimod-'));
  try {
    fs.cpSync(path.join(__dirname, '..', 'maps', 'demo'), tmp, { recursive: true });
    for (const [name, json] of Object.entries(files)) {
      fs.writeFileSync(path.join(tmp, name), JSON.stringify(json));
    }
    return fn(loadMap(tmp), tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
const mod = (id, type, value) => ({ id, type, level: 0, column: 0, value });

test('map-delta stats seed at spawn; un-overridden fields read neutral defaults', () => {
  withSyntheticSource({
    'objects-units.json': {
      original: {},
      custom: {
        'h00A:hfoo': [
          mod('uhpm', 'int', 350), mod('ua1b', 'int', 22), mod('udef', 'int', 4),
          mod('umvs', 'int', 310), mod('ulev', 'int', 6),
          mod('ustr', 'int', 33), mod('uagi', 'int', 21), mod('uini', 'int', 17),
          mod('uabi', 'string', 'A001,A002'), mod('ubui', 'string', 'h004,h006'),
          mod('ugol', 'int', 425), mod('ulum', 'int', 30),
        ],
      },
    },
    // skin twin carries the display name for the same rawcode (merged, like
    // lib/constants.js)
    'objects-units-skin.json': {
      original: {}, custom: { 'h00A:hfoo': [mod('unam', 'string', 'Skinned Raider')] },
    },
    'objects-items.json': {
      original: {},
      custom: { 'I00A:ches': [mod('unam', 'string', 'Wax Seal'), mod('iuse', 'int', 3), mod('igol', 'int', 90)] },
    },
  }, (sim) => {
    const u = sim.createUnit(0, 'h00A', 0, 0);
    sim.run(`
      u = "${u.handle}"
      dmg = BlzGetUnitBaseDamage(u, 0)
      armor = BlzGetUnitArmor(u)
      ms = GetUnitMoveSpeed(u)
      dms = GetUnitDefaultMoveSpeed(u)
      lvl = GetUnitLevel(u)
      s, a, i = GetHeroStr(u, false), GetHeroAgi(u, false), GetHeroInt(u, false)
      ab1 = GetUnitAbilityLevel(u, FourCC("A001"))
      ab2 = GetUnitAbilityLevel(u, FourCC("A002"))
      name = GetUnitName(u)
      it = CreateItem(FourCC("I00A"), 0.0, 0.0)
      iname = GetItemName(it)
      icharges = GetItemCharges(it)
    `);
    assert.strictEqual(u.maxLife, 350);
    assert.strictEqual(sim.global('dmg'), 22);
    assert.strictEqual(sim.global('armor'), 4);
    assert.strictEqual(sim.global('ms'), 310);
    assert.strictEqual(sim.global('dms'), 310);
    assert.strictEqual(sim.global('lvl'), 6);
    assert.deepStrictEqual([sim.global('s'), sim.global('a'), sim.global('i')], [33, 21, 17]);
    assert.deepStrictEqual([sim.global('ab1'), sim.global('ab2')], [1, 1], 'uabi grants at level 1');
    assert.strictEqual(sim.global('name'), 'Skinned Raider', 'skin-twin unam merged');
    assert.deepStrictEqual(u.builds, ['h004', 'h006'], 'ubui queryable, no construction semantics');
    assert.strictEqual(sim.objectData.unitGoldCost.get(fourCC('h00A')), 425);
    assert.strictEqual(sim.objectData.unitLumberCost.get(fourCC('h00A')), 30);
    assert.strictEqual(sim.global('iname'), 'Wax Seal');
    assert.strictEqual(sim.global('icharges'), 3, 'iuse seeds item charges');

    // a STOCK type with no deltas: documented neutral defaults, never
    // fabricated Blizzard values
    const stock = sim.createUnit(0, 'hkni', 0, 0);
    sim.run(`
      k = "${stock.handle}"
      kdmg = BlzGetUnitBaseDamage(k, 0)
      karmor = BlzGetUnitArmor(k)
      kms = GetUnitDefaultMoveSpeed(k)
      klvl = GetUnitLevel(k)
    `);
    assert.strictEqual(stock.maxLife, 100);
    assert.strictEqual(sim.global('kdmg'), 0);
    assert.strictEqual(sim.global('karmor'), 0);
    assert.strictEqual(sim.global('kms'), 270);
    assert.strictEqual(sim.global('klvl'), 1);
    assert.strictEqual(stock.abilities.size, 0, 'no uabi delta = empty known-ability set');
    assert.deepStrictEqual(stock.builds, []);
  });
});

test('gotcha 23 is assertable: a clone overriding only unam is stat-identical to its base', () => {
  withSyntheticSource({
    'objects-units.json': {
      original: {},
      custom: {
        // the "deer drops cheese" bug shape: a clone that ONLY renames.
        // Custom entries inherit from the STOCK base (WE semantics), so in
        // the sim both spawn with pure neutral defaults — measurably
        // identical in everything but the name.
        'h00B:hfoo': [mod('unam', 'string', 'Totally New Hero')],
      },
    },
  }, (sim) => {
    const base = sim.createUnit(0, 'hfoo', 0, 0);
    const clone = sim.createUnit(0, 'h00B', 0, 0);
    const identity = (u) => ({
      maxLife: u.maxLife, baseDamage: u.baseDamage, armor: u.armor,
      moveSpeed: u.moveSpeed, level: u.level,
      str: u.str, agi: u.agi, int: u.int,
      abilities: [...u.abilities.keys()], builds: u.builds,
    });
    assert.deepStrictEqual(identity(clone), identity(base),
      'everything measurable about the clone IS the base — only unam changed');
    sim.run(`bn = GetUnitName("${base.handle}") cn = GetUnitName("${clone.handle}")`);
    assert.strictEqual(sim.global('cn'), 'Totally New Hero');
    assert.notStrictEqual(sim.global('bn'), sim.global('cn'));
  });
});

test('inventory: 6 slots, first-free and exact-slot placement, full refusal', () => {
  const sim = sandbox(`
    u = CreateUnit(Player(0), FourCC("Hpal"), 0.0, 0.0, 0.0)
    size = UnitInventorySize(u)
    items = {}
    for i = 1, 6 do items[i] = UnitAddItemById(u, FourCC("I000")) end
    count_full = UnitInventoryCount(u)
    -- 7th by-id: created but stays on the ground
    overflow = UnitAddItemById(u, FourCC("I000"))
    overflow_carried = UnitHasItem(u, overflow)
    -- UnitAddItem on a full inventory refuses
    ground = CreateItem(FourCC("I001"), 5.0, 5.0)
    add_full = UnitAddItem(u, ground)
    -- exact-slot add on an occupied slot refuses
    slot_occupied = UnitAddItemToSlotById(u, FourCC("I001"), 2)
    -- free slot 2, then exact-slot add succeeds there
    dropped = UnitRemoveItemFromSlot(u, 2)
    slot_free = UnitAddItemToSlotById(u, FourCC("I001"), 2)
    in_slot2 = GetItemTypeId(UnitItemInSlot(u, 2))
    in_slot2_bj = GetItemTypeId(UnitItemInSlotBJ(u, 3))  -- BJ is 1-based
    has_type = UnitHasItemOfTypeBJ(u, FourCC("I001"))
    empty_slot_read = UnitItemInSlot(u, 9)
  `);
  assert.strictEqual(sim.global('size'), 6);
  assert.strictEqual(sim.global('count_full'), 6);
  assert.strictEqual(sim.global('overflow_carried'), false, 'full: by-id item stays on the ground');
  assert.strictEqual(sim.global('add_full'), false, 'full: UnitAddItem returns false');
  assert.strictEqual(sim.global('slot_occupied'), false);
  assert.ok(sim.global('dropped'));
  assert.strictEqual(sim.global('slot_free'), true);
  assert.strictEqual(sim.global('in_slot2'), fourCC('I001'));
  assert.strictEqual(sim.global('in_slot2_bj'), fourCC('I001'));
  assert.strictEqual(sim.global('has_type'), true);
  assert.strictEqual(sim.global('empty_slot_read'), undefined);
});

test('item events: PICKUP/DROP/USE/SELL fire with manipulation getters', () => {
  const sim = sandbox(`
    log = {}
    hero = CreateUnit(Player(0), FourCC("Hpal"), 0.0, 0.0, 0.0)
    shop = CreateUnit(Player(27), FourCC("ngme"), 100.0, 0.0, 0.0)
    loot = CreateItem(FourCC("I000"), 10.0, 10.0)
    local function watch(ev, tag)
      local t = CreateTrigger()
      TriggerRegisterAnyUnitEventBJ(t, ev)
      TriggerAddAction(t, function()
        log[#log+1] = tag .. ":" .. GetItemTypeId(GetManipulatedItem())
        manip_ok = (GetManipulatingUnit() == GetTriggerUnit())
      end)
    end
    watch(EVENT_PLAYER_UNIT_PICKUP_ITEM, "pickup")
    watch(EVENT_PLAYER_UNIT_DROP_ITEM, "drop")
    watch(EVENT_PLAYER_UNIT_USE_ITEM, "use")
    -- SELL_ITEM dispatches to the SHOP owner's triggers with the sale getters
    local sell = CreateTrigger()
    TriggerRegisterPlayerUnitEvent(sell, Player(27), EVENT_PLAYER_UNIT_SELL_ITEM, nil)
    TriggerAddAction(sell, function()
      log[#log+1] = "sell:" .. GetItemTypeId(GetSoldItem())
      sale_ok = (GetSellingUnit() == shop) and (GetBuyingUnit() == hero)
        and (GetTriggerUnit() == shop)
    end)
    -- EVENT_UNIT_* twin on the hero
    local twin = CreateTrigger()
    TriggerRegisterUnitEvent(twin, hero, EVENT_UNIT_PICKUP_ITEM)
    TriggerAddAction(twin, function() twin_hits = (twin_hits or 0) + 1 end)
  `);
  const hero = sim.units.get(sim.global('hero'));
  const shop = sim.units.get(sim.global('shop'));
  const loot = sim.items.get(sim.global('loot'));
  assert.strictEqual(sim.pickup(hero, loot), true);
  sim.useItem(hero, loot);
  sim.drop(hero, loot);
  assert.strictEqual(loot.ownerUnit, null);
  assert.deepStrictEqual([loot.x, loot.y], [0, 0], 'dropped at the carrier');
  // purchase: SELL_ITEM first, then the pickup path into the buyer
  const bought = sim.sell(shop, hero, 'I001');
  assert.strictEqual(bought.ownerUnit, hero.handle);
  sim.run('flat = table.concat(log, "|")');
  assert.strictEqual(sim.global('flat'),
    `pickup:${fourCC('I000')}|use:${fourCC('I000')}|drop:${fourCC('I000')}|` +
    `sell:${fourCC('I001')}|pickup:${fourCC('I001')}`);
  assert.strictEqual(sim.global('manip_ok'), true);
  assert.strictEqual(sim.global('sale_ok'), true);
  assert.strictEqual(sim.global('twin_hits'), 2, 'unit twin: ground pickup + purchase');
  // harness misuse hard-errors (test-authoring bugs)
  assert.throws(() => sim.drop(hero, loot), /does not carry/);
  assert.throws(() => sim.useItem(hero, loot), /does not carry/);
});

test('pawn path unregressed: pays floor(igol/2), fires PAWN_ITEM, vacates the slot', () => {
  withSyntheticSource({
    'objects-items.json': {
      original: {}, custom: { 'I00P:ches': [mod('igol', 'int', 90)] },
    },
  }, (sim) => {
    sim.run(`
      hero = CreateUnit(Player(0), FourCC("Hpal"), 0.0, 0.0, 0.0)
      local t = CreateTrigger()
      TriggerRegisterAnyUnitEventBJ(t, EVENT_PLAYER_UNIT_PAWN_ITEM)
      TriggerAddAction(t, function()
        pawned = GetItemTypeId(GetSoldItem())
        pawn_seller = (GetSellingUnit() == hero)
      end)
    `);
    const hero = sim.units.get(sim.global('hero'));
    const it = sim.createItem('I00P', 0, 0);
    assert.strictEqual(sim.pickup(hero, it), true);
    const before = sim.player(0).gold;
    const { enginePaid } = sim.pawn(hero, it);
    assert.strictEqual(enginePaid, 45);
    assert.strictEqual(sim.player(0).gold, before + 45);
    assert.strictEqual(sim.global('pawned'), fourCC('I00P'));
    assert.strictEqual(sim.global('pawn_seller'), true);
    assert.strictEqual(it.removed, true);
    assert.strictEqual(hero.inventory.filter(Boolean).length, 0, 'pawn vacated the slot');
  });
});

test('RemoveItem vacates its carrier slot; charges default 0 and are settable', () => {
  const sim = sandbox(`
    u = CreateUnit(Player(0), FourCC("Hpal"), 0.0, 0.0, 0.0)
    it = UnitAddItemById(u, FourCC("I000"))
    c0 = GetItemCharges(it)
    SetItemCharges(it, 7)
    c7 = GetItemCharges(it)
    RemoveItem(it)
    slot0 = UnitItemInSlot(u, 0)
  `);
  assert.strictEqual(sim.global('c0'), 0, 'neutral default: no iuse delta');
  assert.strictEqual(sim.global('c7'), 7);
  assert.strictEqual(sim.global('slot0'), undefined);
});

test('sim.calls records every native call with virtual timestamps', () => {
  const sim = sandbox(`
    local t = CreateTimer()
    TimerStart(t, 2.0, false, function()
      CreateUnit(Player(0), FourCC("hfoo"), 1.0, 2.0, 3.0)
    end)
  `);
  sim.advance(5);
  const cu = sim.callsOf('CreateUnit');
  assert.strictEqual(cu.length, 1);
  assert.strictEqual(cu[0].t, 2);
  assert.strictEqual(cu[0].args[1], fourCC('hfoo'));
});
