'use strict';
// The class picker (genre furniture, Singapore-flavored): four classes,
// a 40s pick window at spawn, class-specific clips/kit, and the window
// closing for good.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { loadMap } = require('../../../lib/sim');

const MAP = path.join(__dirname, '..');

test('everyone walks out as a Heartlander with the class clip and rations', () => {
  const sim = loadMap(MAP, { users: [0, 1] });
  for (const pid of [0, 1]) {
    const hero = sim.findUnit('h000', pid);
    assert.ok(hero, `pid ${pid} hero`);
    assert.strictEqual(sim.player(pid).gold, 12, 'clip of 12 rounds');
    assert.strictEqual(sim.player(pid).lumber, 2, 'two spare clips');
    const rations = [...sim.items.values()].filter((i) => !i.removed
      && i.typeStr === 'I008' && i.ownerUnit === hero.handle);
    assert.strictEqual(rations.length, 1, 'kopitiam rations in the pack');
  }
});

test('-class swaps the hero in place with class stats and starting kit', () => {
  const sim = loadMap(MAP, { users: [0] });
  const before = sim.findUnit('h000', 0);
  const bx = before.x, by = before.y;
  sim.chat(0, '-class police');
  assert.strictEqual(sim.findUnit('h000', 0), null, 'the Heartlander is gone');
  const apo = sim.findUnit('h001', 0);
  assert.ok(apo, 'the APO stands in their place');
  assert.ok(Math.abs(apo.x - bx) < 1 && Math.abs(apo.y - by) < 1, 'same spot');
  assert.strictEqual(sim.player(0).gold, 24, 'the big clip');
  assert.strictEqual(sim.player(0).lumber, 3, 'spare clips on the belt');
  assert.ok(/class\|pid=0\|police/.test(sim.global('RUNLOG')));
  assert.ok(sim.messagesMatching(/steps up as the Auxiliary Police Officer/).length > 0);
});

test('the Technician starts with a Generator Part and a Barricade Kit', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-class tech');
  const tech = sim.findUnit('h003', 0);
  const kit = [...sim.items.values()].filter((i) => !i.removed && i.ownerUnit === tech.handle)
    .map((i) => i.typeStr).sort();
  assert.deepStrictEqual(kit, ['I013', 'I018'], 'barricade kit + generator part');
  assert.strictEqual(sim.player(0).gold, 10);
});

test('an unknown class names the four; the window closes at 40s for good', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-class durian');
  assert.ok(sim.messagesTo(0).some((m) => /heartlander, police, paramedic, tech/.test(m.text)));

  sim.advance(41);
  assert.ok(sim.messagesMatching(/second thoughts is over/).length > 0);
  sim.chat(0, '-class police');
  assert.ok(sim.messagesTo(0).some((m) => /pick window is closed/.test(m.text)));
  assert.ok(sim.findUnit('h000', 0), 'still the Heartlander');
});

test('-sprint bursts the legs and cools down 20s', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-sprint');
  const calls = sim.callsOf('SetUnitMoveSpeed');
  assert.ok(calls.length > 0, 'speed set');
  sim.chat(0, '-sprint');
  assert.ok(sim.messagesTo(0).some((m) => /Legs are jelly/.test(m.text)), 'cooldown holds');
  sim.advance(21);
  sim.chat(0, '-sprint');
  assert.ok(sim.messagesMatching(/You RUN/).length >= 2, 'ready again after 20s');
});
