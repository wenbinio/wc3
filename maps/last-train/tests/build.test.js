'use strict';
// PHASE 2B — build & survive (the ZCD lesson applied fully: their
// barricade costs one kill's bounty, so building is CONSTANT). Four build
// verbs on every survivor (ANcl point casts, sim.cast-exercisable): Z
// Barricade (1 Plank), X Spike Wire (1 Pipe, claws back), V Watchfire
// (1 Kerosene, light+vision), B Field Sentry (plants a Sentry Kit; a
// second kit REARMS a dry gun). Repair is PRESENCE (stand beside damaged
// work; Technician 2x). The fort persists, feeds the horde XP when it
// falls, counts on the board, and scores at the verdict.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { loadMap } = require('../../../lib/sim');

const MAP = path.join(__dirname, '..');

function armed() {
  const sim = loadMap(MAP, { users: [0] });
  const hero = sim.findUnit('h000', 0);
  sim.chat(0, '-test');
  return { sim, hero };
}

const carried = (sim, hero, t) => [...sim.items.values()]
  .find((i) => !i.removed && i.typeStr === t && i.ownerUnit === hero.handle);

test('Build Barricade: 1 Plank at the target point, dust + placement sound, logged', () => {
  const { sim, hero } = armed();
  sim.chat(0, '-give plank');
  assert.ok(carried(sim, hero, 'I000'), 'a raw Plank in the pack');
  const sounds0 = sim.callsOf('StartSound').length;
  sim.cast(hero, 'A008', { x: hero.x + 120, y: hero.y });
  const wall = sim.findUnit('h016', 0);
  assert.ok(wall, 'the barricade stands');
  assert.ok(Math.abs(wall.x - (hero.x + 120)) < 1, 'AT the target point');
  assert.ok(!carried(sim, hero, 'I000'), 'the Plank is spent');
  assert.ok(/build\|pid=0\|barricade/.test(sim.global('RUNLOG')));
  assert.ok(sim.callsOf('AddSpecialEffect').some((c) => /ImpaleTargetDust/.test(String(c.args[0]))),
    'build dust');
  assert.ok(sim.callsOf('StartSound').length > sounds0, 'the placement sound');
});

test('no material = a refusal (one teach line, then floating text), nothing placed', () => {
  const { sim, hero } = armed();
  sim.cast(hero, 'A008', { x: hero.x + 100, y: hero.y });
  assert.strictEqual(sim.findUnit('h016', 0), null, 'nothing free');
  assert.ok(sim.messagesTo(0).some((m) => /wants a Plank/.test(m.text)), 'taught once');
  sim.cast(hero, 'A008', { x: hero.x + 100, y: hero.y });
  assert.ok(sim.callsOf('SetTextTagText').some((c) => /needs a plank/.test(String(c.args[1]))),
    'second refusal is floating text only');
});

test('a build cast beyond reach CLAMPS to arm\'s length instead of refusing', () => {
  const { sim, hero } = armed();
  sim.chat(0, '-give plank');
  sim.cast(hero, 'A008', { x: hero.x + 4000, y: hero.y });
  const wall = sim.findUnit('h016', 0);
  assert.ok(wall, 'placed anyway');
  const d = Math.hypot(wall.x - hero.x, wall.y - hero.y);
  assert.ok(d <= 500 + 1, `inside BUILD_RANGE (got ${Math.round(d)})`);
});

test('Spike Wire: 1 Pipe, and anything that claws it gets clawed back', () => {
  const { sim, hero } = armed();
  sim.chat(0, '-give pipe');
  sim.cast(hero, 'A009', { x: hero.x + 100, y: hero.y });
  const wire = sim.findUnit('h01I', 0);
  assert.ok(wire, 'the wire is laid');
  assert.strictEqual(wire.maxLife, 250, 'cheap area denial, not a wall');
  assert.ok(/build\|pid=0\|spikes/.test(sim.global('RUNLOG')));

  sim.chat(0, '-zspawn shambler 1');
  const zomb = sim.unitsOf(24, 'u000').filter((u) => u.alive).pop();
  const zhp = zomb.life;
  sim.damage(zomb, wire, 10);
  assert.strictEqual(zomb.life, zhp - 15, 'SPIKE_DMG claws back on the attacker');
  assert.strictEqual(wire.life, wire.maxLife - 10, 'the wire still takes the hit');
});

test('Watchfire: 1 Kerosene buys a pool of light with real night vision data', () => {
  const { sim, hero } = armed();
  sim.chat(0, '-give kerosene');
  sim.cast(hero, 'A00A', { x: hero.x + 100, y: hero.y });
  const fire = sim.findUnit('h01J', 0);
  assert.ok(fire, 'the watchfire burns');
  assert.ok(/build\|pid=0\|watchfire/.test(sim.global('RUNLOG')));
  // the light is object data (usin night sight 900) — pinned here
  const fs = require('fs');
  const units = JSON.parse(fs.readFileSync(path.join(MAP, 'objects-units.json'), 'utf8'));
  const usin = units.custom['h01J:hhou'].find((f) => f.id === 'usin').value;
  assert.strictEqual(usin, 900, 'night sight radius');
  // art pin RE-TARGETED 2026-08-08 (Sol round 4): the stock brazier
  // stand-in gave way to the commissioned SolWatchfire model (.mdl field
  // dialect per gotcha 22; the archive member is the .mdx)
  const umdl = units.custom['h01J:hhou'].find((f) => f.id === 'umdl').value;
  assert.strictEqual(umdl, 'war3mapImported\\SolWatchfire.mdl',
    'the round-4 commissioned watchfire art (gotcha 22 .mdl dialect)');
});

test('Field Sentry: plants a carried kit at the point; a second kit REARMS a dry gun', () => {
  const { sim, hero } = armed();
  sim.chat(0, '-give sentry'); // a Sentry Kit (I016)
  sim.cast(hero, 'A00B', { x: hero.x + 150, y: hero.y });
  const sentry = sim.findUnit('h017', 0);
  assert.ok(sentry, 'planted by the build verb');
  assert.strictEqual(sim.run('return SentryAmmoOf[' +
    '(function() for u,_ in pairs(SentryAmmoOf) do return u end end)()]')[0], 40,
  'the belt is loaded');
  assert.ok(!carried(sim, hero, 'I016'), 'the kit is consumed');

  // run the belt dry, then a second kit used NEARBY rearms in place
  sim.chat(0, '-zspawn shambler 1');
  const zomb = sim.unitsOf(24, 'u000').filter((u) => u.alive).pop();
  for (let i = 0; i < 40; i++) sim.damage(sentry, zomb, 1);
  sim.damage(sentry, zomb, 1); // the 41st pull clicks empty
  assert.ok(/sentry\|dry/.test(sim.global('RUNLOG')));
  sim.chat(0, '-give sentry');
  sim.moveUnit(hero, sentry.x + 50, sentry.y);
  sim.useItem(hero, carried(sim, hero, 'I016'));
  assert.ok(/sentry\|rearm\|pid=0/.test(sim.global('RUNLOG')));
  const zhp = zomb.life;
  sim.damage(sentry, zomb, 5);
  assert.strictEqual(zomb.life, zhp - 5, 'the belt feeds again');
});

test('raw materials feed the fort ONLY until their recipe partner shows up', () => {
  const { sim, hero } = armed();
  sim.chat(0, '-give plank');
  sim.chat(0, '-give pipe'); // auto-combine: Plank + Pipe -> Parang
  assert.ok(carried(sim, hero, 'I011'), 'the pair snapped into a Parang');
  sim.cast(hero, 'A008', { x: hero.x + 100, y: hero.y });
  assert.strictEqual(sim.findUnit('h016', 0), null,
    'no Plank left to build with — one economy, two mouths, real trade-off');
});

test('repair is PRESENCE: stand beside damaged work; the Technician doubles it', () => {
  const { sim, hero } = armed();
  sim.chat(0, '-give plank');
  sim.cast(hero, 'A008', { x: hero.x + 100, y: hero.y });
  const wall = sim.findUnit('h016', 0);
  wall.life = wall.maxLife - 100;
  sim.moveUnit(hero, wall.x + 80, wall.y);
  sim.advance(2);
  assert.strictEqual(wall.life, wall.maxLife - 100 + 40, '20 hp per standing second');
  sim.moveUnit(hero, wall.x + 2000, wall.y);
  sim.advance(2);
  assert.strictEqual(wall.life, wall.maxLife - 60, 'no reach, no repair');

  // Technician: 40/s (same presence, better hands)
  const sim2 = loadMap(MAP, { users: [0] });
  sim2.chat(0, '-test');
  sim2.moveUnit(sim2.findUnit('h000', 0), -3140, -5420); // the tech circle (6F)
  const tech = sim2.findUnit('h003', 0);
  sim2.chat(0, '-give plank');
  sim2.cast(tech, 'A008', { x: tech.x + 100, y: tech.y });
  const wall2 = sim2.findUnit('h016', 0);
  wall2.life = wall2.maxLife - 100;
  sim2.moveUnit(tech, wall2.x + 80, wall2.y);
  sim2.advance(1);
  assert.strictEqual(wall2.life, wall2.maxLife - 60, 'the Technician repairs at 2x');
});

test('the fort persists, counts on the board, and its fall feeds the horde', () => {
  const { sim, hero } = armed();
  sim.chat(0, '-give plank');
  sim.chat(0, '-give pipe');
  // hold the pair apart: build the plank FIRST, then give the pipe
  // (order matters — give both raw and they combine)
  const sim2 = loadMap(MAP, { users: [0] });
  const hero2 = sim2.findUnit('h000', 0);
  sim2.chat(0, '-test');
  sim2.moveUnit(hero2, 0, 0); // open estate: clear of the tower's seeded crowd (XP falloff)
  sim2.chat(0, '-give plank');
  sim2.cast(hero2, 'A008', { x: hero2.x + 100, y: hero2.y });
  sim2.chat(0, '-give pipe');
  sim2.cast(hero2, 'A009', { x: hero2.x + 200, y: hero2.y });
  sim2.chat(0, '-give kerosene');
  sim2.cast(hero2, 'A00A', { x: hero2.x + 300, y: hero2.y });
  assert.strictEqual(sim2.run('return DefensesStanding()')[0], 3, 'three works standing');
  sim2.advance(120);
  assert.strictEqual(sim2.run('return DefensesStanding()')[0], 3,
    'structures persist all night (no decay)');
  sim2.advance(1);
  const values = sim2.callsOf('MultiboardSetItemValue').map((c) => String(c.args[1]));
  assert.ok(values.some((v) => /3 standing/.test(v)), 'the Fort row shows the count');

  // a zombie chewing through the wire pays the horde its bounty
  sim2.chat(0, '-zspawn shambler 1');
  const zomb = sim2.unitsOf(24, 'u000').filter((u) => u.alive).pop();
  const wire = sim2.findUnit('h01I', 0);
  const xp0 = sim2.global('HordeXP');
  sim2.kill(wire, zomb);
  assert.strictEqual(sim2.global('HordeXP'), xp0 + 4, 'the fort feeds the horde when it falls');
  assert.strictEqual(sim2.run('return DefensesStanding()')[0], 2);
  assert.ok(sim, hero); // keep the first fixture referenced
});

test('surge-vs-fort: a surge zombie will chew a barricade (engine handles the path)', () => {
  const { sim, hero } = armed();
  sim.chat(0, '-give plank');
  sim.cast(hero, 'A008', { x: hero.x + 100, y: hero.y });
  const wall = sim.findUnit('h016', 0);
  sim.chat(0, '-zspawn withered 1');
  const zomb = sim.unitsOf(24, 'u001').filter((u) => u.alive).pop();
  // the sim has no combat AI (honesty rules): the chew is exercised as a
  // real DAMAGING event against the structure
  sim.damage(zomb, wall, 100);
  assert.strictEqual(wall.life, wall.maxLife - 100, 'structures take real damage');
  // and the knock is repairable back up by presence
  sim.moveUnit(hero, wall.x + 60, wall.y);
  sim.advance(2);
  assert.strictEqual(wall.life, wall.maxLife - 100 + 40, 'the fort is maintainable');
});

test('build verbs are DATA on every class (uabi) — the game shows the buttons', () => {
  const fs = require('fs');
  const units = JSON.parse(fs.readFileSync(path.join(MAP, 'objects-units.json'), 'utf8'));
  for (const k of ['h000:hrif', 'h001:hrif', 'h002:hrif', 'h003:hrif']) {
    const uabi = units.custom[k].find((f) => f.id === 'uabi').value;
    for (const a of ['A008', 'A009', 'A00A', 'A00B']) {
      assert.ok(uabi.includes(a), `${k} carries ${a}`);
    }
  }
  const abils = JSON.parse(fs.readFileSync(path.join(MAP, 'objects-abilities.json'), 'utf8'));
  for (const k of ['A008:ANcl', 'A009:ANcl', 'A00A:ANcl', 'A00B:ANcl']) {
    const ncl2 = abils.custom[k].find((f) => f.id === 'Ncl2').value;
    assert.strictEqual(ncl2, 2, `${k} is a POINT-target cast`);
  }
});
