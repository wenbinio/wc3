'use strict';
// Scavenging de-chatted (gotcha 33): RUMMAGE = stand ~3s beside an
// unsearched prop (quiet; loot pops on the ground), SMASH = kill the
// ~30 HP prop unit (instant loot, +10 district Noise). Crafting is
// AUTO-COMBINE on pickup with the cut-to-4 recipe set (each material in
// exactly ONE recipe), clip packs bank a clip on pickup, and the seeded
// loot draw replays byte-identically.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { loadMap } = require('../../../lib/sim');

const MAP = path.join(__dirname, '..');

const itemOf = (sim, typeStr) =>
  [...sim.items.values()].find((i) => !i.removed && i.typeStr === typeStr);
const groundItems = (sim) =>
  [...sim.items.values()].filter((i) => !i.removed && !i.ownerUnit);

test('rummage: stand ~3s beside the nearest unsearched prop; loot pops as a ground item', () => {
  const sim = loadMap(MAP, { users: [0] });
  const hero = sim.findUnit('h000', 0);
  sim.advance(4);
  assert.strictEqual(sim.global('Searches'), 0, 'nothing in reach at the sloc');

  sim.moveUnit(hero, -300, -80); // the spawn void-deck bench
  sim.advance(2);
  assert.strictEqual(sim.global('Searches'), 0, 'not done at 2s — rummage takes ~3');
  assert.ok(sim.messagesTo(0).some((m) => /You start going through the/.test(m.text)));
  sim.advance(1);
  assert.strictEqual(sim.global('Searches'), 1, 'the ~3s stand turns the prop out');
  assert.strictEqual(sim.global('SeedLocked'), true, 'the rummage draw commits the seed');
  assert.ok(/rummage\|pid=0\|bench\|/.test(sim.global('RUNLOG')));
  assert.ok(groundItems(sim).length >= 1, 'the loot lands ON THE GROUND at the prop');

  // rummage is QUIET: no district noise
  assert.strictEqual(sim.run("return NoiseHeat[DistrictAt(-300,-80).key] or 0")[0], 0);

  // the prop is spent; standing on keeps working the next prop in reach
  sim.advance(3);
  assert.strictEqual(sim.global('Searches'), 1, 'nothing else within 250 of the bench spot');
});

test('smash: the prop is a ~30 HP unit — instant loot, +10 district Noise', () => {
  const sim = loadMap(MAP, { users: [0] });
  const hero = sim.findUnit('h000', 0);
  const bench = sim.allUnits('n020').find((u) => u.alive
    && Math.abs(u.x - (-300)) < 1 && Math.abs(u.y - (-80)) < 1);
  assert.ok(bench, 'the spawn bench exists');
  assert.strictEqual(bench.maxLife, 30, 'props are smashable, not walls');

  sim.kill(bench, hero);
  assert.ok(/smash\|bench\|/.test(sim.global('RUNLOG')));
  assert.strictEqual(sim.global('Searches'), 1);
  assert.ok(groundItems(sim).length >= 1, 'instant loot on the ground');
  assert.strictEqual(sim.run("return NoiseHeat[DistrictAt(-300,-80).key] or 0")[0], 10,
    'smashing is LOUD: +10 noise');
  assert.ok(sim.messagesTo(0).some((m) => /\+noise/.test(m.text)), 'the cost is stated');
});

test('shooting a prop open costs rounds (the smash price is ammo or noise, never typing)', () => {
  const sim = loadMap(MAP, { users: [0] });
  const hero = sim.findUnit('h000', 0);
  const bench = sim.allUnits('n020').find((u) => u.alive
    && Math.abs(u.x - (-300)) < 1 && Math.abs(u.y - (-80)) < 1);
  const rounds0 = sim.player(0).gold;
  sim.damage(hero, bench, 22);
  sim.damage(hero, bench, 22); // 30 HP: two rifle shots
  assert.ok(!bench.alive, 'two shots break it open');
  assert.strictEqual(sim.player(0).gold, rounds0 - 2, 'each shot drew a round');
});

test('auto-combine on pickup: all four recipes snap together, chimed and logged', () => {
  const sim = loadMap(MAP, { users: [0] });
  const hero = sim.findUnit('h000', 0);
  sim.chat(0, '-test');
  // clear the starting Rations so slots stay predictable
  const startingRations = [...sim.items.values()].find((i) => !i.removed
    && i.typeStr === 'I008' && i.ownerUnit === hero.handle);
  sim.drop(hero, startingRations);
  const FOUR = [
    ['bandage', ['I002', 'I007'], 'I010'],  // Cloth + Water
    ['parang', ['I000', 'I001'], 'I011'],   // Plank + Pipe
    ['molotov', ['I004', 'I005'], 'I014'],  // Bottle + Kerosene
    ['sentry', ['I003', 'I006'], 'I016'],   // Wire + Battery
  ];
  for (const [key, mats, out] of FOUR) {
    const a = sim.createItem(mats[0], hero.x, hero.y);
    const b = sim.createItem(mats[1], hero.x, hero.y);
    sim.pickup(hero, a);
    assert.ok(!itemOf(sim, out), key + ': one half combines nothing');
    sim.pickup(hero, b);
    const it = itemOf(sim, out);
    assert.ok(it, key + ' snapped together on pickup');
    assert.strictEqual(it.ownerUnit, hero.handle, key + ' in the pack');
    assert.ok(new RegExp('craft\\|pid=0\\|' + key).test(sim.global('RUNLOG')));
    assert.ok(!itemOf(sim, mats[0]) && !itemOf(sim, mats[1]), key + ' consumed both halves');
    sim.drop(hero, it);
  }
  assert.ok(sim.callsOf('StartSound').length >= 4, 'the combine chime fired');
});

test('a clip pack banks +1 clip the moment it is picked up', () => {
  const sim = loadMap(MAP, { users: [0] });
  const hero = sim.findUnit('h000', 0);
  sim.chat(0, '-test');
  sim.chat(0, '-clips 0');
  const pack = sim.createItem('I01A', hero.x, hero.y);
  sim.pickup(hero, pack);
  assert.strictEqual(sim.player(0).lumber, 1, '+1 clip banked');
  assert.ok(pack.removed, 'the pack is consumed, not carried');
  assert.ok(/clip\|pid=0/.test(sim.global('RUNLOG')));
});

test('-recipes is a REFERENCE card: the four combines and the shop wares', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-recipes');
  const t = sim.messagesTo(0).map((m) => m.text).join('\n');
  assert.ok(/Combining is AUTOMATIC/.test(t));
  assert.ok(/Cloth \+ Bottled Water/.test(t) && /Wet Bandage/.test(t));
  assert.ok(/Plank \+ Pipe/.test(t) && /Parang/.test(t));
  assert.ok(/Bottle \+ Kerosene/.test(t) && /Molotov/.test(t));
  assert.ok(/Wire \+ Battery/.test(t) && /Sentry Kit/.test(t));
  assert.ok(/Provision Shop/.test(t), 'the shop is the other source of tools');
  assert.ok(!/-craft/.test(t), 'no chat verb is taught');
});

test('the cut recipes stay cut: no Kopi Set, Generator Part or Blowtorch anywhere', () => {
  const fs = require('fs');
  const items = JSON.parse(fs.readFileSync(path.join(MAP, 'objects-items.json'), 'utf8'));
  const keys = Object.keys(items.custom);
  assert.ok(!keys.some((k) => k.startsWith('I017:')), 'Kopi Set item deleted');
  assert.ok(!keys.some((k) => k.startsWith('I018:')), 'Generator Part item deleted');
  assert.ok(!keys.some((k) => k.startsWith('I019:')), 'Blowtorch item deleted');
  const sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-test');
  sim.chat(0, '-give kopi');
  assert.ok(sim.messagesTo(0).some((m) => /-give wants/.test(m.text)), 'no debug backdoor either');
});

test('Rations are eaten (+100), flare lights the estate, phone shares horde vision', () => {
  const sim = loadMap(MAP, { users: [0] });
  const hero = sim.findUnit('h000', 0);
  sim.chat(0, '-test');

  hero.life = 300;
  const rations = [...sim.items.values()].find((i) => !i.removed
    && i.typeStr === 'I008' && i.ownerUnit === hero.handle);
  sim.useItem(hero, rations);
  assert.strictEqual(hero.life, 400, '+100 from the kaya tin');

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

test('barricade kit raises a wall; its death feeds the horde a little', () => {
  const sim = loadMap(MAP, { users: [0] });
  const hero = sim.findUnit('h000', 0);
  sim.chat(0, '-test');
  sim.chat(0, '-give barricade');
  sim.useItem(hero, itemOf(sim, 'I013'));
  const wall = sim.findUnit('h016', 0);
  assert.ok(wall, 'barricade raised at the feet');
  assert.strictEqual(wall.maxLife, 800);
  assert.ok(/barricade\|pid=0/.test(sim.global('RUNLOG')));

  sim.chat(0, '-zspawn shambler 1');
  const zomb = sim.unitsOf(24, 'u000').filter((u) => u.alive).pop();
  sim.moveUnit(zomb, wall.x + 50, wall.y);
  const xp0 = sim.global('HordeXP');
  sim.kill(wall, zomb);
  assert.strictEqual(sim.global('HordeXP'), xp0 + 4, 'barricades are worth 4');
});

test('loot replays byte-identically on the same seed', () => {
  const run = () => {
    const sim = loadMap(MAP, { users: [0] });
    sim.chat(0, '-seed 777');
    const hero = sim.findUnit('h000', 0);
    sim.moveUnit(hero, -300, -80);
    sim.advance(10); // rummage the bench, then idle
    return sim.global('RUNLOG');
  };
  assert.strictEqual(run(), run());
});

test('a full pack drops the loot at your feet instead of losing it', () => {
  const sim = loadMap(MAP, { users: [0] });
  const hero = sim.findUnit('h000', 0);
  sim.chat(0, '-test');
  for (let i = 0; i < 5; i++) sim.chat(0, '-give plank');
  // heartlander starts with 1 Rations: the pack is now 6/6
  sim.chat(0, '-give kerosene');
  assert.ok(sim.messagesTo(0).some((m) => /hands are full/.test(m.text)));
  const ground = [...sim.items.values()].filter((i) => !i.removed && i.typeStr === 'I005'
    && !i.ownerUnit);
  assert.strictEqual(ground.length, 1, 'the kerosene lands at the feet');
});
