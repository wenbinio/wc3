'use strict';
// Logic-sim acceptance for the bundled map sources: every map's PACKED
// war3map.lua (assembled through the real build pipeline, generated
// CreateAllUnits included) must load and RUN under lib/sim with only
// cosmetic natives falling through to the auto-stub tier. Deeper
// per-mechanic suites live in maps/<name>/tests/*.test.js (discovered by
// `npm test` and runnable standalone via tools/test-map-logic.js).

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { loadMap } = require('../lib/sim');

const MAPS = path.join(__dirname, '..', 'maps');

// Natives that map LOGIC depends on must never fall through to the stub
// tier — a stubbed one of these means the sim silently stopped simulating.
const MUST_BE_REAL = [
  'CreateTimer', 'TimerStart', 'CreateTrigger', 'TriggerAddAction',
  'CreateUnit', 'CreateItem', 'CreateGroup', 'Player', 'FourCC',
  'SetPlayerState', 'GetPlayerState', 'SetPlayerAlliance', 'GetPlayerAlliance',
];

function assertLogicTierReal(sim, mapName) {
  for (const name of MUST_BE_REAL) {
    assert.ok(!sim.stubbed.has(name), `${mapName}: logic native ${name} fell through to the auto-stub tier`);
  }
}

test('demo: loads, config+main run, timer payload fires', () => {
  const sim = loadMap(path.join(MAPS, 'demo'));
  assert.strictEqual(sim.mapName, 'Toolkit Demo Map');
  assert.ok(sim.unitsOf(0).length >= 1, 'preplaced units from CreateAllUnits');
  sim.advance(3);
  assert.deepStrictEqual(sim.prints, ['Hello from the wc3-map-toolkit demo map!']);
  assert.strictEqual(sim.unitsOf(0, 'hfoo').length, 2); // preplaced + spawned
  assertLogicTierReal(sim, 'demo');
});

test('tidewatch-arena: arena entry announcements and killing-blow victory', () => {
  const sim = loadMap(path.join(MAPS, 'tidewatch-arena'));
  const champion = sim.findUnit('H000');
  assert.ok(champion, 'Arena Champion preplaced');
  assert.strictEqual(champion.ownerIdx, 24, 'champion is neutral hostile');

  // a player-1 hero walks into the arena -> queued announcement drains
  const hero = sim.createUnit(1, 'Obla', 2200, 2200);
  sim.moveUnit(hero, 0, 0);
  sim.advance(2);
  assert.ok(sim.messagesMatching(/entered the arena/).length > 0);

  // killing blow decides the match
  sim.kill(champion, hero);
  sim.advance(5);
  assert.strictEqual(sim.player(1).result, 'victory');
  assert.strictEqual(sim.player(0).result, 'defeat');
  assertLogicTierReal(sim, 'tidewatch-arena');
});

test('tidewatch-arena: unowned champion death is a draw (both victors)', () => {
  const sim = loadMap(path.join(MAPS, 'tidewatch-arena'));
  sim.kill(sim.findUnit('H000')); // no killing unit
  sim.advance(5);
  assert.strictEqual(sim.player(0).result, 'victory');
  assert.strictEqual(sim.player(1).result, 'victory');
});

test('crossroads-siege: full 10-wave playthrough to victory', () => {
  const sim = loadMap(path.join(MAPS, 'crossroads-siege'));
  assert.deepStrictEqual(sim.users, [0, 1, 2, 3], 'info.json seats 4 humans');
  assert.ok(sim.findUnit('h001'), 'the Keep is preplaced');

  sim.advance(61); // first wave at 60s
  assert.ok(sim.messagesMatching(/Wave 1\/10/).length > 0, 'wave 1 announced');

  let waves = 0;
  for (let wave = 1; wave <= 10; wave++) {
    const legion = sim.unitsOf(4).filter((u) => u.alive);
    assert.ok(legion.length > 0, `wave ${wave} spawned units`);
    if (wave === 10) {
      // regression: the escalation bonus once applied to the boss entry
      // itself, spawning FIVE Colossi (and five loot drops) on wave 10
      assert.strictEqual(legion.filter((u) => u.typeStr === 'u000').length, 1,
        'exactly ONE Dreadflesh Colossus on the boss wave');
    }
    for (const u of legion) sim.kill(u);
    sim.advance(2.5); // clear-detection poll
    waves++;
    if (wave < 10) sim.advance(27); // downtime + next spawn poll
  }
  assert.strictEqual(waves, 10);
  // boss loot from objects-items.json dropped on the Colossus death trigger
  assert.strictEqual(sim.itemsByType('I000').length, 1);
  assert.strictEqual(sim.itemsByType('I001').length, 1);
  assert.ok(sim.messagesMatching(/The Crossroads hold/).length > 0);
  sim.advance(6);
  for (const pid of [0, 1, 2, 3]) {
    assert.strictEqual(sim.player(pid).result, 'victory', `defender ${pid} wins`);
  }
  assertLogicTierReal(sim, 'crossroads-siege');
});

test('crossroads-siege: Keep death defeats all defenders', () => {
  const sim = loadMap(path.join(MAPS, 'crossroads-siege'));
  sim.advance(61);
  sim.kill(sim.findUnit('h001'));
  sim.advance(6);
  for (const pid of [0, 1, 2, 3]) {
    assert.strictEqual(sim.player(pid).result, 'defeat');
  }
});

test('crossroads-siege: periodic income pays the declared stipend', () => {
  const sim = loadMap(path.join(MAPS, 'crossroads-siege'));
  const before = sim.player(0).gold;
  sim.advance(33); // INCOME_PERIOD = 32, base 40, wave 0
  assert.strictEqual(sim.player(0).gold, before + 40);
});

test('northreach: loads with all four founders and the market economy wired', () => {
  // per-mechanic assertions live in maps/northreach/tests/founders.test.js;
  // this is the pipeline-level smoke check alongside the other three maps
  const sim = loadMap(path.join(MAPS, 'northreach'));
  assert.strictEqual(sim.allUnits('H000').length, 4, 'four Founder heroes');
  assert.strictEqual(sim.player(0).gold, 320);
  assert.strictEqual(sim.player(0).lumber, 20);
  sim.advance(30);
  assertLogicTierReal(sim, 'northreach');
});
