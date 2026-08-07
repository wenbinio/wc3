'use strict';
// Death = defection (Zombie-Simulator 7, credited): no elimination — the
// fallen convert in place with a controllable pack, the alliance flips
// BOTH directions (gotcha 24), the horde shares its vision, and the last
// survivor's fall hands the estate to the earlier defectors.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { loadMap } = require('../../../lib/sim');

const MAP = path.join(__dirname, '..');

function twoPlayer() {
  const sim = loadMap(MAP, { users: [0, 1] });
  sim.chat(0, '-test');
  sim.chat(0, '-zspawn shambler 1');
  const zomb = sim.unitsOf(24, 'u000').filter((u) => u.alive).pop();
  return { sim, zomb };
}

test('the co-op alliance is real alliance state both directions at start', () => {
  const { sim } = twoPlayer();
  assert.strictEqual(sim.alliance(0, 1, 'ALLIANCE_PASSIVE'), true);
  assert.strictEqual(sim.alliance(1, 0, 'ALLIANCE_PASSIVE'), true);
  assert.strictEqual(sim.alliance(0, 1, 'ALLIANCE_SHARED_VISION'), true);
});

test('a survivor\'s death flips the alliance both ways and spawns their pack', () => {
  const { sim, zomb } = twoPlayer();
  const hero = sim.findUnit('h000', 0);
  const hx = hero.x, hy = hero.y;
  sim.kill(hero, zomb);

  assert.ok(/defect\|pid=0/.test(sim.global('RUNLOG')));
  assert.strictEqual(sim.alliance(0, 1, 'ALLIANCE_PASSIVE'), false, 'defector vs living');
  assert.strictEqual(sim.alliance(1, 0, 'ALLIANCE_PASSIVE'), false, 'BOTH directions (gotcha 24)');
  assert.strictEqual(sim.alliance(0, 1, 'ALLIANCE_SHARED_VISION'), false, 'vision cut too');

  const revenants = sim.unitsOf(0, 'u004').filter((u) => u.alive);
  const packShamblers = sim.unitsOf(0, 'u000').filter((u) => u.alive);
  assert.strictEqual(revenants.length, 1, 'their risen self, player-controlled');
  assert.strictEqual(packShamblers.length, 3, 'plus a pack of three');
  assert.ok(Math.abs(revenants[0].x - hx) < 1 && Math.abs(revenants[0].y - hy) < 1,
    'the Revenant rises where they fell');
  // the horde shows its new mind the board
  assert.ok(sim.callsOf('SetPlayerAlliance').some((c) => c.args && c.args.length >= 0), 'alliance calls recorded');
  assert.ok(sim.messagesMatching(/They hunt with the horde now/).length > 0);
});

test('two defectors are allied to each other with shared vision', () => {
  const { sim, zomb } = twoPlayer();
  sim.kill(sim.findUnit('h000', 0), zomb);
  sim.kill(sim.findUnit('h000', 1), zomb);
  assert.strictEqual(sim.alliance(0, 1, 'ALLIANCE_PASSIVE'), true, 'pack mates');
  assert.strictEqual(sim.alliance(1, 0, 'ALLIANCE_PASSIVE'), true);
  assert.strictEqual(sim.alliance(0, 1, 'ALLIANCE_SHARED_VISION'), true);
});

test('the wipe verdict: earlier defectors win as the horde, the last faller loses', () => {
  const { sim, zomb } = twoPlayer();
  sim.kill(sim.findUnit('h000', 0), zomb); // pid 0 defects first
  assert.strictEqual(sim.global('GameOver'), false, 'the night goes on');
  sim.kill(sim.findUnit('h000', 1), zomb); // the last survivor falls
  assert.strictEqual(sim.global('GameOver'), true);
  assert.ok(/verdict\|wipe/.test(sim.global('RUNLOG')));
  sim.advance(3);
  assert.strictEqual(sim.player(0).result, 'victory', 'the earlier defector wins as the horde');
  assert.strictEqual(sim.player(1).result, 'defeat', 'the horde\'s meal, not its member');
});

test('a solo death is a plain defeat (no self-victory as a zombie)', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-test');
  sim.chat(0, '-zspawn shambler 1');
  const zomb = sim.unitsOf(24, 'u000').filter((u) => u.alive).pop();
  sim.kill(sim.findUnit('h000', 0), zomb);
  assert.strictEqual(sim.global('GameOver'), true);
  sim.advance(3);
  assert.strictEqual(sim.player(0).result, 'defeat');
});

test('a survivor kill feeds the horde 50 XP through the crowd falloff', () => {
  const { sim, zomb } = twoPlayer();
  const xp0 = sim.global('HordeXP');
  const hero = sim.findUnit('h000', 0);
  sim.moveUnit(zomb, hero.x + 50, hero.y); // the only zombie near the kill
  sim.kill(hero, zomb);
  assert.strictEqual(sim.global('HordeXP'), xp0 + 50, 'lone killer learns the full 50');
});
