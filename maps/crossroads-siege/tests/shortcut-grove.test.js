'use strict';
// Logic test for the wave-5 Shortcut Grove burn, executed headlessly against
// the PACKED war3map.lua by lib/sim — see docs/PIPELINE.md §8. Discovered by
// `npm test` and runnable alone via:
//   node tools/test-map-logic.js maps/crossroads-siege
//
// This mechanic was PROVABLY SIM-BLIND before the WP-B1 damage/destructable
// tier landed (docs/reference/headless-tooling-audit-2026-07.md, Tier 2
// item 1): EnumDestructablesInRect enumerated nothing and KillDestructable
// was a recorded no-op, so war3map.lua:334's grove burn silently did
// nothing in the sim while every structural gate passed. Now the trees are
// real records instantiated from doodads.json and the kill is observable.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { loadMap } = require('../../../lib/sim');

const MAP = path.join(__dirname, '..');

// gg_rct_ShortcutGrove in war3map.lua (== the ShortcutGrove entry in
// regions.json / the generated REGION_ constant)
const GROVE = { minX: 1280, minY: 1280, maxX: 1920, maxY: 1920 };
const inGrove = (d) =>
  d.x >= GROVE.minX && d.x <= GROVE.maxX && d.y >= GROVE.minY && d.y <= GROVE.maxY;

// drive the siege: waves spawn at 60s, then per cleared wave ~2.5s clear
// poll + 27s downtime (same cadence as test/maplogic.test.js's playthrough)
function playToWave(sim, lastWave) {
  sim.advance(61);
  for (let wave = 1; wave <= lastWave; wave++) {
    if (wave === lastWave) return; // wave just spawned — stop here
    for (const u of sim.unitsOf(4).filter((x) => x.alive)) sim.kill(u);
    sim.advance(2.5);
    sim.advance(27);
  }
}

test('wave 5 burns the Shortcut Grove: doodads.json trees actually die', () => {
  const sim = loadMap(MAP);

  // the grove exists at load: destructable records from the map's own
  // doodads.json (25 LTlt summer trees inside the rect)
  const grove = sim.dests('LTlt').filter(inGrove);
  assert.strictEqual(grove.length, 25, 'grove trees instantiated from doodads.json');
  assert.ok(grove.every((d) => d.alive), 'all grove trees alive at load');

  // a destructable death event registered on a grove tree fires on the burn
  sim.run(`
    grove_deaths = 0
    local t = CreateTrigger()
    TriggerRegisterDeathEvent(t, "${grove[0].handle}")
    TriggerAddAction(t, function() grove_deaths = grove_deaths + 1 end)
  `);

  playToWave(sim, 4); // wave 4 just spawned
  assert.ok(grove.every((d) => d.alive), 'grove still standing through wave 4');

  // clear wave 4; wave 5 spawns on the next downtime and SpawnWave(5)
  // burns the grove (war3map.lua:334)
  for (const u of sim.unitsOf(4).filter((x) => x.alive)) sim.kill(u);
  sim.advance(2.5);
  sim.advance(27);

  assert.ok(sim.messagesMatching(/burns the Shortcut Grove/).length > 0,
    'grove-burn announcement shown');
  assert.ok(grove.every((d) => !d.alive && d.life === 0),
    'every grove tree is dead after wave 5');
  assert.strictEqual(sim.global('grove_deaths'), 1, 'destructable death event fired');

  // the burn is scoped to the grove rect: trees elsewhere still stand
  const outside = sim.dests('LTlt').filter((d) => !inGrove(d));
  assert.ok(outside.length > 0, 'there are trees outside the grove');
  assert.ok(outside.every((d) => d.alive), 'no tree outside the grove was killed');
});
