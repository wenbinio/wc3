'use strict';
// The curable slow-burn infection (Zombination, credited; rebuilt as
// per-unit state): zombie damage infects, the DoT runs 1.5 dps on the
// virtual clock, Wet Bandage cures above the threshold (Paramedic: any),
// the polyclinic cures in 5s, and an untreated survivor dies into
// defection. Phase 2A: a cure pays +10 survivor XP.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { loadMap } = require('../../../lib/sim');

const MAP = path.join(__dirname, '..');

function infected(users) {
  const sim = loadMap(MAP, { users: users || [0] });
  const hero = sim.findUnit('h000', 0);
  sim.chat(0, '-test');
  sim.chat(0, '-zspawn shambler 1');
  const zomb = sim.unitsOf(24, 'u000').filter((u) => u.alive).pop();
  sim.damage(zomb, hero, 10);
  return { sim, hero, zomb };
}

test('zombie damage applies the infection STATE and the 1.5 dps DoT', () => {
  const { sim, hero } = infected();
  assert.ok(/infect\|pid=0/.test(sim.global('RUNLOG')));
  assert.ok(sim.messagesTo(0).some((m) => /INFECTED/.test(m.text)),
    'the state-change line is KEPT (short) in the 2B text diet');
  const hp0 = hero.life;
  sim.advance(10); // 5 DoT ticks of 3 = 15 damage (1.5 dps)
  assert.strictEqual(hero.life, hp0 - 15, 'the slow burn runs at 1.5 dps');
});

test('a second bite does not stack a second DoT', () => {
  const { sim, hero, zomb } = infected();
  sim.damage(zomb, hero, 5);
  const logged = sim.global('RUNLOG').match(/infect\|pid=0/g);
  assert.strictEqual(logged.length, 1, 'one infect beat, one state');
});

test('Wet Bandage cures above 40% health, refuses below (and is kept); +10 XP on cure', () => {
  const { sim, hero } = infected();
  sim.chat(0, '-give bandage');
  const bandage = () => [...sim.items.values()].find((i) => !i.removed && i.typeStr === 'I010');

  hero.life = 100; // 550 max: well below the 40% line
  sim.useItem(hero, bandage());
  assert.ok(sim.messagesTo(0).some((m) => /Too far gone to self-treat/.test(m.text)));
  assert.ok(bandage() != null, 'the bandage is NOT consumed on a refused cure');
  assert.strictEqual(hero.life, 100, 'no heal on refusal either');

  hero.life = 400; // above 40%
  const xp0 = sim.run('return SurvXP[0]')[0];
  sim.useItem(hero, bandage());
  assert.ok(/cure\|pid=0\|bandage/.test(sim.global('RUNLOG')));
  assert.strictEqual(hero.life, 550, 'heals 150, capped at max');
  assert.strictEqual(bandage(), undefined, 'consumed on success');
  assert.strictEqual(sim.run('return SurvXP[0]')[0], xp0 + 10, 'the cure pays XP');

  sim.advance(10);
  assert.strictEqual(hero.life, 550, 'no DoT after the cure');
});

test('the Paramedic cures at ANY health and starts with two bandages', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.moveUnit(sim.findUnit('h000', 0), -3280, -5420); // the paramedic circle (6F corridor, 2B)
  const hero = sim.findUnit('h002', 0);
  assert.ok(hero, 'paramedic hero swapped in');
  const bandages = [...sim.items.values()].filter((i) => !i.removed && i.typeStr === 'I010'
    && i.ownerUnit === hero.handle);
  assert.strictEqual(bandages.length, 2, 'two starting Wet Bandages');

  sim.chat(0, '-test');
  sim.chat(0, '-infectme');
  hero.life = 50; // far below the civilian threshold
  sim.useItem(hero, bandages[0]);
  assert.ok(/cure\|pid=0\|bandage/.test(sim.global('RUNLOG')), 'cureAnyHp');
});

test('standing in the polyclinic grounds 5 seconds flushes the infection', () => {
  const { sim, hero } = infected();
  sim.moveUnit(hero, -2900, -1600); // Teck Ghee Polyclinic
  sim.advance(6);
  assert.ok(/cure\|pid=0\|clinic/.test(sim.global('RUNLOG')));
  sim.chat(0, '-status');
  assert.ok(!sim.messagesTo(0).slice(-3).some((m) => /INFECTED/.test(m.text)));
});

test('leaving the clinic resets the cure timer', () => {
  const { sim, hero } = infected();
  sim.moveUnit(hero, -2900, -1600);
  sim.advance(3); // not enough
  sim.moveUnit(hero, 0, 0);
  sim.advance(3);
  assert.ok(!/cure\|/.test(sim.global('RUNLOG')), 'timer reset on leaving');
  sim.moveUnit(hero, -2900, -1600);
  sim.advance(6);
  assert.ok(/cure\|pid=0\|clinic/.test(sim.global('RUNLOG')));
});

test('an untreated infection kills into defection (the rise IS the Revenant)', () => {
  const { sim, hero } = infected([0, 1]);
  sim.chat(0, '-deck'); // estate rules: defection is the OUTDOOR death (2B)
  hero.life = 4; // two DoT ticks from the end
  sim.advance(5);
  assert.ok(!hero.alive, 'the slow burn took them');
  assert.ok(/defect\|pid=0/.test(sim.global('RUNLOG')));
  assert.strictEqual(sim.unitsOf(0, 'u004').length, 1, 'their Revenant rises');
});
