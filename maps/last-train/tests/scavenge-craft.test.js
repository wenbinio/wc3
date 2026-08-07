'use strict';
// Furniture scavenging + combine crafting (Zombination, credited; their
// discoverability flaw fixed with -recipes + tooltip hints): seeded
// one-time searches, the ten recipes, and the crafted-gear effects the
// other suites don't cover (kopi, flare, phone, barricade, blowtorch).

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { loadMap } = require('../../../lib/sim');

const MAP = path.join(__dirname, '..');

const itemOf = (sim, typeStr) =>
  [...sim.items.values()].find((i) => !i.removed && i.typeStr === typeStr);

test('-search: nearest unsearched prop in reach, one search each, seeded loot', () => {
  const sim = loadMap(MAP, { users: [0] });
  const hero = sim.findUnit('h000', 0);
  sim.chat(0, '-search');
  assert.ok(sim.messagesTo(0).some((m) => /Nothing searchable in reach/.test(m.text)),
    'out of range at the sloc');

  sim.moveUnit(hero, -300, -80); // the spawn void-deck bench
  sim.chat(0, '-search');
  assert.strictEqual(sim.global('Searches'), 1);
  assert.strictEqual(sim.global('SeedLocked'), true, 'first search commits the seed');
  assert.ok(/search\|pid=0\|bench\|/.test(sim.global('RUNLOG')));

  sim.chat(0, '-search'); // the bench is spent; next in reach is the TC desk
  assert.strictEqual(sim.global('Searches'), 2, 'each prop searches once');
  sim.chat(0, '-search'); // nothing else within reach of this spot
  assert.strictEqual(sim.global('Searches'), 2);
  assert.ok(sim.messagesTo(0).some((m) => /Nothing searchable in reach/.test(m.text)));
  sim.moveUnit(hero, -920, 0); // the void-deck payphone
  sim.chat(0, '-search');
  assert.strictEqual(sim.global('Searches'), 3);
  const kinds = sim.global('RUNLOG').match(/search\|pid=0\|(\w+)\|/g);
  assert.strictEqual(kinds.length, 3);
});

test('loot replays byte-identically on the same seed', () => {
  const run = () => {
    const sim = loadMap(MAP, { users: [0] });
    sim.chat(0, '-seed 777');
    const hero = sim.findUnit('h000', 0);
    sim.moveUnit(hero, -300, -80);
    for (let i = 0; i < 3; i++) sim.chat(0, '-search');
    return sim.global('RUNLOG');
  };
  assert.strictEqual(run(), run());
});

test('-recipes lists all ten combinations; material tooltips hint their uses', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-recipes');
  const t = sim.messagesTo(0).map((m) => m.text).join('\n');
  for (const key of ['bandage', 'parang', 'phone', 'barricade', 'molotov',
    'flare', 'sentry', 'kopi', 'part', 'torch']) {
    assert.ok(new RegExp('-craft ' + key).test(t), key + ' listed');
  }
  assert.ok(/Cloth \+ Bottled Water -> Wet Bandage/.test(t));
});

test('all ten recipes craft: materials consumed, product granted, beat logged', () => {
  const sim = loadMap(MAP, { users: [0] });
  const hero = sim.findUnit('h000', 0);
  sim.chat(0, '-test');
  // clear the starting Rations so the leftover check sees only craft inputs
  const startingRations = [...sim.items.values()].find((i) => !i.removed
    && i.typeStr === 'I008' && i.ownerUnit === hero.handle);
  sim.drop(hero, startingRations);
  const RECIPES = [
    ['bandage', ['cloth', 'bottledwater'], 'I010'],
    ['parang', ['plank', 'pipe'], 'I011'],
    ['phone', ['pipe', 'wire'], 'I012'],
    ['barricade', ['cloth', 'plank'], 'I013'],
    ['molotov', ['bottle', 'kerosene'], 'I014'],
    ['flare', ['cloth', 'kerosene'], 'I015'],
    ['sentry', ['pipe', 'battery'], 'I016'],
    ['kopi', ['rations', 'bottledwater'], 'I017'],
    ['part', ['wire', 'battery'], 'I018'],
    ['torch', ['pipe', 'kerosene'], 'I019'],
  ];
  for (const [key, mats, out] of RECIPES) {
    for (const m of mats) sim.chat(0, '-give ' + m);
    sim.chat(0, '-craft ' + key);
    const it = itemOf(sim, out);
    assert.ok(it, key + ' crafted');
    assert.strictEqual(it.ownerUnit, hero.handle, key + ' in the pack');
    assert.ok(new RegExp('craft\\|pid=0\\|' + key).test(sim.global('RUNLOG')));
    sim.drop(hero, it); // clear the slot for the next recipe
  }
  // nothing left over: every material was consumed
  const leftovers = [...sim.items.values()].filter((i) => !i.removed
    && i.ownerUnit === hero.handle && /^I00[0-8]$/.test(i.typeStr));
  assert.strictEqual(leftovers.length, 0, 'all materials consumed');
});

test('-craft refuses without the materials, names them, and rejects unknowns', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-craft molotov');
  assert.ok(sim.messagesTo(0).some((m) => /Molotov needs Bottle \+ Kerosene/.test(m.text)));
  sim.chat(0, '-craft laksa');
  assert.ok(sim.messagesTo(0).some((m) => /No such recipe/.test(m.text)));
});

test('kopi heals 200 capped at max; flare lights the estate; phone shares horde vision', () => {
  const sim = loadMap(MAP, { users: [0] });
  const hero = sim.findUnit('h000', 0);
  sim.chat(0, '-test');

  sim.chat(0, '-give kopi');
  hero.life = 300;
  sim.useItem(hero, itemOf(sim, 'I017'));
  assert.strictEqual(hero.life, 500, '+200');

  sim.chat(0, '-give flare');
  sim.useItem(hero, itemOf(sim, 'I015'));
  assert.ok(/flare\|pid=0/.test(sim.global('RUNLOG')));
  assert.ok(sim.messagesMatching(/red daylight/).length > 0);

  sim.chat(0, '-give phone');
  sim.useItem(hero, itemOf(sim, 'I012'));
  assert.ok(/phone\|pid=0/.test(sim.global('RUNLOG')));
  assert.strictEqual(sim.alliance(24, 0, 'ALLIANCE_SHARED_VISION'), true,
    'the horde player shares vision for 30s');
  sim.advance(31);
  assert.strictEqual(sim.alliance(24, 0, 'ALLIANCE_SHARED_VISION'), false,
    'the signal dies');
});

test('barricade kit raises a wall; blowtorch welds it back up', () => {
  const sim = loadMap(MAP, { users: [0] });
  const hero = sim.findUnit('h000', 0);
  sim.chat(0, '-test');
  sim.chat(0, '-give barricade');
  sim.useItem(hero, itemOf(sim, 'I013'));
  const wall = sim.findUnit('h016', 0);
  assert.ok(wall, 'barricade raised at the feet');
  assert.strictEqual(wall.maxLife, 800);
  assert.ok(/barricade\|pid=0/.test(sim.global('RUNLOG')));

  wall.life = 300;
  sim.chat(0, '-give torch');
  sim.useItem(hero, itemOf(sim, 'I019'));
  assert.strictEqual(wall.life, 600, '+300 weld');
  assert.ok(/weld\|pid=0/.test(sim.global('RUNLOG')));

  // a barricade death feeds the horde a little XP
  sim.chat(0, '-zspawn shambler 1');
  const zomb = sim.unitsOf(24, 'u000').filter((u) => u.alive).pop();
  sim.moveUnit(zomb, wall.x + 50, wall.y);
  const xp0 = sim.global('HordeXP');
  sim.kill(wall, zomb);
  assert.strictEqual(sim.global('HordeXP'), xp0 + 4, 'barricades are worth 4');
});

test('a full pack drops the loot at your feet instead of losing it', () => {
  const sim = loadMap(MAP, { users: [0] });
  const hero = sim.findUnit('h000', 0);
  sim.chat(0, '-test');
  for (const m of ['plank', 'plank', 'plank', 'plank', 'plank']) sim.chat(0, '-give ' + m);
  // heartlander starts with 1 Rations: the pack is now 6/6
  sim.chat(0, '-give pipe');
  assert.ok(sim.messagesTo(0).some((m) => /hands are full/.test(m.text)));
  const ground = [...sim.items.values()].filter((i) => !i.removed && i.typeStr === 'I001'
    && !i.ownerUnit);
  assert.strictEqual(ground.length, 1, 'the pipe lands at the feet');
});
