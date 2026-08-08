'use strict';
// The class CIRCLES (phase 2A, gotcha 33; phase 2B moved them INTO the 6F
// corridor of Block 6A — you pick your neighbour identity as you flee
// your flat) — walk a survivor in, walk a class out. The 40s window
// keeps its semantics but the policing announcements are cut (it closes
// silently). Sprint is ability E. Chat -class no longer exists
// (commands.test.js pins the deleted-verb silence).

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { loadMap } = require('../../../lib/sim');

const MAP = path.join(__dirname, '..');

// circle centers (assets/generate-layout.mjs CLASS_CIRCLES — 6F corridor)
const CIRCLE = {
  heartlander: [-3560, -5420], police: [-3420, -5420],
  paramedic: [-3280, -5420], tech: [-3140, -5420],
};

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

test('walking onto a circle swaps the hero in place with class stats and kit', () => {
  const sim = loadMap(MAP, { users: [0] });
  const before = sim.findUnit('h000', 0);
  sim.moveUnit(before, CIRCLE.police[0], CIRCLE.police[1]);
  assert.strictEqual(sim.findUnit('h000', 0), null, 'the Heartlander is gone');
  const apo = sim.findUnit('h001', 0);
  assert.ok(apo, 'the APO stands in their place');
  assert.ok(Math.abs(apo.x - CIRCLE.police[0]) < 1 && Math.abs(apo.y - CIRCLE.police[1]) < 1,
    'transformed on the circle');
  assert.strictEqual(sim.player(0).gold, 24, 'the big clip');
  assert.strictEqual(sim.player(0).lumber, 3, 'spare clips on the belt');
  assert.ok(/class\|pid=0\|police/.test(sim.global('RUNLOG')));
  assert.ok(sim.messagesMatching(/steps up as the Auxiliary Police Officer/).length > 0);
});

test('circle statues are invulnerable scenery, one per class', () => {
  const sim = loadMap(MAP, { users: [0] });
  for (const t of ['h000', 'h001', 'h002', 'h003']) {
    assert.strictEqual(sim.unitsOf(27, t).length, 1, t + ' statue placed');
  }
  assert.ok(sim.callsOf('SetUnitInvulnerable').length >= 4, 'statues made invulnerable');
});

test('the Technician steps off their circle with a Barricade Kit (no Generator Part — it is GONE)', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.moveUnit(sim.findUnit('h000', 0), CIRCLE.tech[0], CIRCLE.tech[1]);
  const tech = sim.findUnit('h003', 0);
  const kit = [...sim.items.values()].filter((i) => !i.removed && i.ownerUnit === tech.handle)
    .map((i) => i.typeStr).sort();
  assert.deepStrictEqual(kit, ['I013'], 'barricade kit only — the instant-fix item was cut');
  assert.strictEqual(sim.player(0).gold, 10);
});

test('re-picking inside the window works; after 40s the circles go dark SILENTLY', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.moveUnit(sim.findUnit('h000', 0), CIRCLE.police[0], CIRCLE.police[1]);
  assert.ok(sim.findUnit('h001', 0), 'first pick');
  sim.moveUnit(sim.findUnit('h001', 0), CIRCLE.paramedic[0], CIRCLE.paramedic[1]);
  assert.ok(sim.findUnit('h002', 0), 'second thoughts are free inside the window');

  sim.advance(41);
  assert.strictEqual(sim.messagesMatching(/second thoughts is over/).length, 0,
    'the old policing announcement is cut');
  assert.ok(/pick\|closed/.test(sim.global('RUNLOG')), 'window close is logged, not nagged');
  sim.moveUnit(sim.findUnit('h002', 0), CIRCLE.tech[0], CIRCLE.tech[1]);
  assert.ok(sim.findUnit('h002', 0), 'still the Paramedic — circle inert, no scolding');
  assert.strictEqual(sim.findUnit('h003', 0), null);
});

test('Sprint (ability E) bursts the legs and cools down 20s', () => {
  const sim = loadMap(MAP, { users: [0] });
  const hero = sim.findUnit('h000', 0);
  sim.cast(hero, 'A001');
  const speedCalls = () => sim.callsOf('SetUnitMoveSpeed')
    .filter((c) => c.args[1] === 290 + 120);
  assert.strictEqual(speedCalls().length, 1, 'burst speed set');
  sim.cast(hero, 'A001');
  assert.strictEqual(speedCalls().length, 1, 'cooldown holds (no second burst)');
  assert.ok(sim.callsOf('SetTextTagText').some((c) => /legs are jelly/.test(String(c.args[1]))),
    'the refusal is floating text (2B text diet — the You RUN line is deleted)');
  sim.advance(21);
  sim.cast(hero, 'A001');
  assert.strictEqual(speedCalls().length, 2, 'ready again after 20s');
});
