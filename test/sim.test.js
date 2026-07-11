'use strict';
// Unit tests for the headless Lua logic-test harness (lib/sim/): the VM,
// the virtual clock, and the real-semantics native mocks. Map-level logic
// tests live in test/maplogic.test.js and maps/<name>/tests/.

const test = require('node:test');
const assert = require('node:assert');
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
