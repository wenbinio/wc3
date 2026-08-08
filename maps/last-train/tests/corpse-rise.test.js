'use strict';
// Corpse-rise (Zombination, credited): the horde's kills stand back up
// after a visible 3.5s window at the death spot — and a Molotov burns
// corpses before they rise. Phase 2A: burning also DENIES the defectors'
// Feast (defection.test.js), and a Molotov is a LOUD verb (+15 Noise).

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { loadMap } = require('../../../lib/sim');

const MAP = path.join(__dirname, '..');

function setup() {
  const sim = loadMap(MAP, { users: [0] });
  const hero = sim.findUnit('h000', 0);
  sim.chat(0, '-test');
  sim.chat(0, '-zspawn shambler 1');
  const zomb = sim.unitsOf(24, 'u000').filter((u) => u.alive).pop();
  const civ = sim.allUnits('n000').find((u) => u.alive);
  return { sim, hero, zomb, civ };
}

test('a civilian killed by a zombie rises as a shambler at the spot after 3.5s', () => {
  const { sim, zomb, civ } = setup();
  const cx = civ.x, cy = civ.y;
  const horde0 = sim.global('HordeCount');
  sim.kill(civ, zomb);
  assert.strictEqual(sim.global('CivDead'), 1);
  assert.ok(/civdead\|1\/19/.test(sim.global('RUNLOG'))); // 19: the 2B tower neighbour joined the census

  sim.advance(3); // inside the window: nothing yet
  assert.strictEqual(sim.global('HordeCount'), horde0, 'still down at 3s');
  sim.advance(1); // 3.5s passes
  assert.strictEqual(sim.global('HordeCount'), horde0 + 1, 'risen');
  const risen = sim.unitsOf(24, 'u000').filter((u) => u.alive
    && Math.abs(u.x - cx) < 1 && Math.abs(u.y - cy) < 1);
  assert.strictEqual(risen.length, 1, 'rises AT the death spot, horde-owned');
  assert.ok(/rise\|x=/.test(sim.global('RUNLOG')));
});

test('a Molotov burns corpses inside the window: no rise, zombies scorched, +Noise', () => {
  const { sim, hero, zomb, civ } = setup();
  sim.chat(0, '-give molotov');
  sim.kill(civ, zomb);
  sim.moveUnit(hero, civ.x + 50, civ.y);
  sim.moveUnit(zomb, civ.x + 100, civ.y);
  const zhp = zomb.life;
  const horde0 = sim.global('HordeCount');
  const heat0 = sim.run('return NoiseHeat[DistrictAt(' + civ.x + ',' + civ.y + ').key] or 0')[0];

  const molotov = [...sim.items.values()].find((i) => !i.removed
    && i.typeStr === 'I014' && i.ownerUnit === hero.handle); // NOT the authored 4F ground drop
  sim.useItem(hero, molotov);
  assert.ok(/molotov\|pid=0\|burned=1\|hit=1/.test(sim.global('RUNLOG')));
  assert.strictEqual(zomb.life, zhp - 60, 'zombies in the fire take 60');
  const heat1 = sim.run('return NoiseHeat[DistrictAt(' + civ.x + ',' + civ.y + ').key] or 0')[0];
  assert.strictEqual(heat1, heat0 + 15, 'fire is LOUD: +15 district noise');

  sim.advance(5);
  assert.strictEqual(sim.global('HordeCount'), horde0, 'the burned corpse never rises');
});

test('molotov damage never draws the thrower\'s ammo (scripted, not a shot)', () => {
  const { sim, hero, zomb } = setup();
  sim.chat(0, '-give molotov');
  sim.moveUnit(zomb, hero.x + 100, hero.y);
  const rounds = sim.player(0).gold;
  const molotov = [...sim.items.values()].find((i) => !i.removed
    && i.typeStr === 'I014' && i.ownerUnit === hero.handle);
  sim.useItem(hero, molotov);
  assert.strictEqual(sim.player(0).gold, rounds, 'no round drawn by the burst');
});

test('risen zombies scale with the horde level at rise time', () => {
  const { sim, zomb, civ } = setup();
  sim.chat(0, '-esc 5'); // +40% hp on new spawns
  sim.kill(civ, zomb);
  const calls0 = sim.callsOf('BlzSetUnitMaxHP').length;
  sim.advance(4);
  const scalar = (v) => (Array.isArray(v) ? v[0] : v);
  assert.strictEqual(scalar(sim.call('EscHpOf', 220)), Math.floor((220 * 140) / 100));
  const calls = sim.callsOf('BlzSetUnitMaxHP');
  assert.ok(calls.length > calls0, 'max-hp applied for the game client');
  assert.strictEqual(calls[calls.length - 1].args[1], 308, 'the scaled hp is what was applied');
});
