'use strict';
// Death = defection (Zombie-Simulator 7, credited): no elimination — the
// fallen convert in place with a controllable pack, the alliance flips
// BOTH directions (gotcha 24).
// 2B RE-TARGET (PIPELINE §8): defection is now the ESTATE death rule only
// — indoors the tower respawn rule applies (tower-escape suite). These
// tests open the estate with '-deck' first; the defection SEMANTICS
// pinned here are unchanged. Phase 2A makes the traitor a CONDUCTOR
// (canon I6 — the map's crown mechanic): Feast raises un-burnt corpses
// into the pack, Shriek converges the next surge, the board row flips to
// "HUNT: no one boards", and the Revenant's claws ride the horde level.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { loadMap } = require('../../../lib/sim');

const MAP = path.join(__dirname, '..');

function twoPlayer() {
  const sim = loadMap(MAP, { users: [0, 1] });
  sim.chat(0, '-test');
  sim.chat(0, '-deck');
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
  assert.ok(sim.messagesMatching(/They hunt with the horde now/).length > 0);
  assert.ok(sim.messagesTo(0).some((m) => /FEASTS a corpse/.test(m.text)),
    'the conductor kit is explained to the defector');
});

test('the defector\'s board row flips to HUNT: no one boards', () => {
  const { sim, zomb } = twoPlayer();
  sim.kill(sim.findUnit('h000', 0), zomb);
  sim.advance(5);
  const values = sim.callsOf('MultiboardSetItemValue').map((c) => String(c.args[1]));
  assert.ok(values.some((v) => /HUNT: no one boards/.test(v)), 'the hunt row');
});

test('Feast raises an un-burnt corpse into the defector\'s pack immediately', () => {
  const { sim, zomb } = twoPlayer();
  sim.kill(sim.findUnit('h000', 0), zomb);
  const rev = sim.unitsOf(0, 'u004')[0];
  // a civilian falls near the revenant: a fresh corpse inside the window
  const civ = sim.allUnits('n000').find((u) => u.alive);
  sim.kill(civ, zomb);
  const packBefore = sim.unitsOf(0, 'u000').filter((u) => u.alive).length;
  sim.cast(rev, 'A006', { x: civ.x, y: civ.y });
  assert.ok(/feast\|pid=0/.test(sim.global('RUNLOG')));
  const pack = sim.unitsOf(0, 'u000').filter((u) => u.alive);
  assert.strictEqual(pack.length, packBefore + 1, 'the corpse rises for the DEFECTOR');
  assert.ok(pack.some((u) => Math.abs(u.x - civ.x) < 1 && Math.abs(u.y - civ.y) < 1));
  sim.advance(4);
  assert.ok(!/rise\|x=/.test(sim.global('RUNLOG')), 'no second natural rise of the claimed corpse');
});

test('a burned corpse is DENIED to Feast (Molotov as direct PvP denial)', () => {
  const { sim, zomb } = twoPlayer();
  const hero1 = sim.findUnit('h000', 1);
  sim.kill(sim.findUnit('h000', 0), zomb);
  const rev = sim.unitsOf(0, 'u004')[0];
  const civ = sim.allUnits('n000').find((u) => u.alive);
  sim.kill(civ, zomb);
  // the living burn the corpse first
  sim.chat(1, '-test');
  sim.chat(1, '-give molotov');
  sim.moveUnit(hero1, civ.x + 50, civ.y);
  const molotov = [...sim.items.values()].find((i) => !i.removed
    && i.typeStr === 'I014' && i.ownerUnit === hero1.handle); // not the 4F ground drop
  sim.useItem(hero1, molotov);
  const packBefore = sim.unitsOf(0, 'u000').filter((u) => u.alive).length;
  sim.cast(rev, 'A006', { x: civ.x, y: civ.y });
  assert.strictEqual(sim.unitsOf(0, 'u000').filter((u) => u.alive).length, packBefore,
    'nothing rises from ash');
  assert.ok(sim.messagesTo(0).some((m) => /the living burn what they cannot carry/.test(m.text)));
});

test('Shriek converges the next surge on the target point', () => {
  const { sim, zomb } = twoPlayer();
  sim.kill(sim.findUnit('h000', 0), zomb);
  const rev = sim.unitsOf(0, 'u004')[0];
  sim.cast(rev, 'A007', { x: 2200, y: -3400 }); // Cheng San, far from the living
  assert.ok(/shriek\|pid=0/.test(sim.global('RUNLOG')));
  sim.chat(1, '-test');
  sim.chat(1, '-surge');
  const m = sim.global('RUNLOG').match(/surge\|k=\d+\|(\w+)\|/);
  assert.ok(m, 'a surge fired');
  assert.strictEqual(m[1], 'chengsan', 'the surge broke where the Shriek called it');
  // consumed: a second surge falls back to the survivors' district
  sim.chat(1, '-surge');
  const all = [...sim.global('RUNLOG').matchAll(/surge\|k=\d+\|(\w+)\|/g)];
  assert.notStrictEqual(all[all.length - 1][1], 'chengsan', 'the Shriek is spent on use');
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
  sim.chat(0, '-deck');
  sim.chat(0, '-zspawn shambler 1');
  const zomb = sim.unitsOf(24, 'u000').filter((u) => u.alive).pop();
  sim.kill(sim.findUnit('h000', 0), zomb);
  assert.strictEqual(sim.global('GameOver'), true);
  sim.advance(3);
  assert.strictEqual(sim.player(0).result, 'defeat');
});

test('a survivor kill feeds the horde 50 XP; the Revenant\'s claws ride the horde level', () => {
  const { sim, zomb } = twoPlayer();
  sim.chat(0, '-esc 5');
  const xp0 = sim.global('HordeXP');
  const hero = sim.findUnit('h000', 0);
  sim.moveUnit(hero, 0, 0); // clear of the 2B tower's seeded zombies (crowd falloff)
  sim.moveUnit(zomb, hero.x + 50, hero.y); // the only zombie near the kill
  sim.kill(hero, zomb);
  assert.strictEqual(sim.global('HordeXP'), xp0 + 50, 'lone killer learns the full 50');
  const dmgCalls = sim.callsOf('BlzSetUnitBaseDamage');
  assert.ok(dmgCalls.some((c) => c.args[1] === 30 + 4 * 4),
    'revenant damage scaled by EscLevel 5');
});
