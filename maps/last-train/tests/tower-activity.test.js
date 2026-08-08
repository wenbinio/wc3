'use strict';
// PHASE 2B — the ACTIVITY PASS (advisor audit of the "not enough to do"
// verdict, mandatory set): A1 darkness with teeth (dark floors, DB-box
// breakers, Watchfire as light), A2 brace-the-door (a barricade at a
// stair door absorbs the riser event), A3 the rubbish chute (instant
// bruising LOUD descent), A4 the 3F gas leak (live rounds/Molotov ignite
// it), A5 the noisemaker decoy (Battery's second life), A8 the door peek,
// and the NOISE REPAIR: graded, decaying, displayed stairwell loudness
// with the mandatory 3F blocker smashes exempt (and paying out planks).
// Every mechanic lands on an existing sim surface: presence scans, build
// casts, region teleports, DAMAGING events, ordered spawns.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { loadMap } = require('../../../lib/sim');

const MAP = path.join(__dirname, '..');

const TY = -5260;
const POCKETS = [-3400, -2400, -1400, -400, 600, 1600];
const doorOf = (i) => ({ x: POCKETS[i - 1] + 330, y: TY });

const carried = (sim, hero, t) => [...sim.items.values()]
  .find((i) => !i.removed && i.typeStr === t && i.ownerUnit === hero.handle);
const tags = (sim) => sim.callsOf('SetTextTagText').map((c) => String(c.args[1]));

function armed() {
  const sim = loadMap(MAP, { users: [0] });
  const hero = sim.findUnit('h000', 0);
  sim.chat(0, '-test');
  return { sim, hero };
}

// ---------------------------------------------------------- A1: darkness
test('A1: 4F/3F/2F start DARK — rummaging blind takes 5s instead of 3', () => {
  const { sim, hero } = armed();
  assert.strictEqual(sim.run('return PocketIsLit(3)')[0], false, '4F dark');
  assert.strictEqual(sim.run('return PocketIsLit(4)')[0], false, '3F dark');
  assert.strictEqual(sim.run('return PocketIsLit(5)')[0], false, '2F dark');
  assert.strictEqual(sim.run('return PocketIsLit(1)')[0], true, '6F lit');
  // the 4F locker in the dark: 3s is not enough
  sim.moveUnit(hero, -1660, -5350); // beside the 4F locker
  sim.advance(4);
  assert.strictEqual(sim.global('Searches'), 0, 'still fumbling at 4s');
  sim.advance(1);
  assert.strictEqual(sim.global('Searches'), 1, 'blind rummage lands at 5s');
});

test('A1: the DB box lights the floor by PRESENCE (5s), and the floor then hums', () => {
  const { sim, hero } = armed();
  sim.moveUnit(hero, -1750, -5100); // at the 4F breaker
  sim.advance(4);
  assert.strictEqual(sim.run('return PocketIsLit(3)')[0], false, 'not yet');
  sim.advance(1);
  assert.strictEqual(sim.run('return PocketIsLit(3)')[0], true, 'breaker flipped');
  assert.ok(/breaker\|4f\|pid=0/.test(sim.global('RUNLOG')));
  assert.ok(tags(sim).some((t) => /lights ON/.test(t)), 'floating text, no chat line');
  // lit floor rummages at full speed again
  sim.moveUnit(hero, -1660, -5350);
  sim.advance(3);
  assert.strictEqual(sim.global('Searches'), 1, 'lit rummage back to 3s');
  // the hum: +1 loudness per minute per lit floor (decay -1/20s nets to
  // +1 - 3 = floor 0 over a quiet minute; pin the tick itself instead)
  sim.run('TowerNoiseClock = 0 TowerNoise = 0');
  const t = sim.global('GameClock');
  sim.advance(60 - (t % 60) - 1); // land just before the next hum tick
  sim.run('TowerNoiseClock = 0'); // suppress decay interleaving for the pin
  const n0 = sim.global('TowerNoise');
  sim.advance(1);
  assert.strictEqual(sim.global('TowerNoise'), n0 + 1,
    'the lit floor hums +1 on the minute');
});

test('A1: a Watchfire lights a dark pocket while it burns (Kerosene tension)', () => {
  const { sim, hero } = armed();
  sim.moveUnit(hero, POCKETS[2], TY); // 4F, dark
  sim.chat(0, '-give kerosene');
  sim.cast(hero, 'A00A', { x: hero.x + 80, y: hero.y });
  assert.strictEqual(sim.run('return PocketIsLit(3)')[0], true, 'firelight counts');
  const fire = sim.findUnit('h01J', 0);
  sim.kill(fire, hero);
  assert.strictEqual(sim.run('return PocketIsLit(3)')[0], false, 'and dies with the fire');
});

test('A1: dark floors spawn an extra body per climber/riser event', () => {
  const sim = loadMap(MAP, { users: [0] });
  const hero = sim.findUnit('h000', 0);
  // stand the survivor on the DARK 4F and wait out a climber wave
  sim.moveUnit(hero, POCKETS[2], TY);
  sim.run('TowerPocketOf[0] = 3');
  sim.advance(70);
  const m = sim.global('RUNLOG').match(/climb\|4f\|n=(\d)/);
  assert.ok(m, 'the wave came to the dark floor');
  assert.strictEqual(Number(m[1]), 2, '1 base + 1 for the dark');
});

// ------------------------------------------------------------- A2: brace
test('A2: a barricade braced at the stair door absorbs the riser event', () => {
  const { sim, hero } = armed();
  sim.chat(0, '-give plank');
  const d = doorOf(1);
  sim.moveUnit(hero, d.x - 100, d.y);
  sim.cast(hero, 'A008', { x: d.x - 40, y: d.y }); // brace the door behind
  const wall = sim.findUnit('h016', 0);
  const hp0 = wall.life;
  const horde0 = sim.global('HordeCount');
  sim.moveUnit(hero, d.x, d.y); // transit fires the riser event
  assert.ok(/riser\|6f\|braced/.test(sim.global('RUNLOG')), 'the event is ABSORBED');
  assert.strictEqual(sim.global('HordeCount'), horde0, 'no riser spawned');
  assert.strictEqual(wall.life, hp0 - 60, 'the door takes the thuds instead');
});

// ------------------------------------------------------------- A3: chute
test('A3: the rubbish chute drops you to the 2F bin alcove — hurt, LOUD, no loot', () => {
  const { sim, hero } = armed();
  const hp0 = hero.life;
  const n0 = sim.global('TowerNoise');
  sim.moveUnit(hero, -3660, -5080); // the 6F chute mouth
  assert.ok(Math.abs(hero.x - 340) < 1 && Math.abs(hero.y - (-5080)) < 1,
    'delivered to the bin alcove');
  assert.strictEqual(sim.run('return TowerPocketOf[0]')[0], 5, 'on the 2F now');
  assert.strictEqual(hero.life, hp0 - 60, 'the chute is not a slide');
  assert.strictEqual(sim.global('TowerNoise'), n0 + 2, 'the whole block heard the THUMP');
  assert.ok(/chute\|pid=0\|from=6f/.test(sim.global('RUNLOG')));
  assert.ok(!/tower\|door/.test(sim.global('RUNLOG')), 'no doors used: floors SKIPPED');
});

test('A3: the rescued neighbour will NOT follow you down the chute', () => {
  const { sim, hero } = armed();
  const uncle = sim.allUnits('n000').find((u) => u.alive && u.y < -4900);
  sim.moveUnit(hero, uncle.x + 60, uncle.y);
  sim.advance(2); // rescue
  assert.ok(/rescue\|pid=0/.test(sim.global('RUNLOG')));
  sim.moveUnit(hero, -2100, -5050); // the 5F chute mouth
  assert.strictEqual(sim.run('return TowerPocketOf[0]')[0], 5, 'you took the chute');
  assert.ok(uncle.y > -5200 && uncle.x < -2000, 'the uncle stays on 5F, waiting');
});

// --------------------------------------------------------------- A4: gas
test('A4: a live round fired on the 3F landing IGNITES the leak', () => {
  const { sim, hero } = armed();
  sim.moveUnit(hero, POCKETS[3] - 200, TY); // inside the 3F pocket
  sim.chat(0, '-zspawn shambler 1');
  const zomb = sim.unitsOf(24, 'u000').filter((u) => u.alive).pop();
  const blockers0 = sim.run('return TowerBlockersAlive()')[0];
  assert.strictEqual(blockers0, 3);
  const hp0 = hero.life;
  sim.damage(hero, zomb, 20); // a gunshot in the gas
  assert.ok(/gas\|boom\|pid=0/.test(sim.global('RUNLOG')), 'the landing goes up');
  assert.strictEqual(sim.run('return TowerBlockersAlive()')[0], 0,
    'the blast blows the furniture barricade open');
  assert.ok(hero.life <= hp0 - 60, 'the shooter is singed (60 + the fire)');
  assert.strictEqual(sim.global('GasLive'), false, 'one-shot');
  // scorched earth: the blown props were marked searched — no loot beat
  assert.ok(!/smash\|/.test(sim.global('RUNLOG')), 'undrawn draws destroyed');
  assert.ok(![...sim.items.values()].some((i) => !i.removed && i.typeStr === 'I000'
    && !i.ownerUnit && Math.abs(i.y - TY) < 400 && i.x > -900 && i.x < 100),
  'no blocker planks either: the gas route pays nothing');
  const n = sim.global('TowerNoise');
  assert.ok(n >= 4, 'the boom is LOUD (+4)');
});

test('A4: a dry-clip Parang chop makes no spark — the quiet way through', () => {
  const { sim, hero } = armed();
  sim.chat(0, '-give parang');
  sim.chat(0, '-gold 0'); // empty the gun BEFORE the landing
  sim.moveUnit(hero, POCKETS[3] - 100, TY);
  const blockers = sim.allUnits('n021').concat(sim.allUnits('n020'))
    .filter((u) => u.alive && Math.abs(u.x - (-140)) < 1);
  for (const b of blockers) {
    for (let i = 0; i < 8 && b.alive; i++) sim.damage(hero, b, 11); // half-damage chops (5.5 each)
  }
  assert.strictEqual(sim.global('GasLive'), true, 'no spark, no boom');
  assert.strictEqual(sim.run('return TowerBlockersAlive()')[0], 0, 'chopped through');
  // the mandatory beat PAYS: every blocker drops a Plank, and it is EXEMPT
  const planks = [...sim.items.values()].filter((i) => !i.removed
    && i.typeStr === 'I000' && !i.ownerUnit);
  assert.ok(planks.length >= 3,
    'the barricade pays out its planks (plus whatever the seeded draws add)');
  assert.strictEqual(sim.global('RUNLOG').match(/blocker\|plank/g).length, 3,
    'one guaranteed Plank per blocker');
  assert.strictEqual(sim.global('TowerNoise'), 0,
    'blocker smashes are EXEMPT from loudness (the forced beat is never punished)');
});

test('A4: a Molotov thrown into the landing detonates it too', () => {
  const { sim, hero } = armed();
  sim.chat(0, '-give molotov');
  sim.moveUnit(hero, POCKETS[3] - 250, TY);
  sim.useItem(hero, carried(sim, hero, 'I014'));
  assert.ok(/gas\|boom/.test(sim.global('RUNLOG')));
  assert.strictEqual(sim.run('return TowerBlockersAlive()')[0], 0);
});

// ------------------------------------------------------------- A5: decoy
test('A5: the noisemaker spends a Battery, pulls every nearby walker, dies LOUD', () => {
  const { sim, hero } = armed();
  sim.chat(0, '-give battery');
  sim.chat(0, '-zspawn shambler 2');
  const orders0 = sim.callsOf('IssuePointOrder').length;
  sim.cast(hero, 'A00C', { x: hero.x + 200, y: hero.y });
  const radio = sim.findUnit('h01L', 0);
  assert.ok(radio, 'the radio blares');
  assert.ok(!carried(sim, hero, 'I006'), 'the Battery is spent (decoy vs sentry)');
  assert.ok(/decoy\|pid=0\|pulled=\d+/.test(sim.global('RUNLOG')));
  const orders = sim.callsOf('IssuePointOrder').slice(orders0);
  assert.ok(orders.length >= 2, 'the walkers turn to it');
  assert.ok(orders.every((c) => Math.abs(c.args[2] - radio.x) < 1), 'onto the RADIO');
  // it dies loud
  const n0 = sim.global('TowerNoise');
  const zomb = sim.unitsOf(24, 'u000').filter((u) => u.alive).pop();
  sim.kill(radio, zomb);
  assert.strictEqual(sim.global('TowerNoise'), n0 + 2, '+2 on death');
  assert.ok(/decoy\|dead/.test(sim.global('RUNLOG')));
});

test('A5: an unmolested radio runs its batteries out and goes quietly', () => {
  const { sim, hero } = armed();
  sim.chat(0, '-give battery');
  sim.cast(hero, 'A00C', { x: hero.x + 150, y: hero.y });
  const radio = sim.findUnit('h01L', 0);
  sim.advance(16);
  assert.ok(!sim.findUnit('h01L', 0) || !radio.alive, 'expired after 15s');
  assert.ok(/decoy\|out/.test(sim.global('RUNLOG')));
});

// -------------------------------------------------------------- A8: peek
test('A8: a beat at the stair door reads the next floor (once, floating text)', () => {
  const { sim, hero } = armed();
  const d = doorOf(1);
  sim.moveUnit(hero, d.x - 120, d.y);
  sim.advance(1);
  assert.ok(/peek\|pid=0\|5f\|n=2/.test(sim.global('RUNLOG')), 'two walkers below');
  assert.ok(tags(sim).some((t) => /below: the fifth-floor flats -- 2 walking/.test(t)));
  const peeks0 = sim.global('RUNLOG').match(/peek\|/g).length;
  sim.advance(3);
  assert.strictEqual(sim.global('RUNLOG').match(/peek\|/g).length, peeks0,
    'one free read per floor per player');
});

// ------------------------------------------------- noise repair: display
test('noise repair: loudness DISPLAYS on the board and DECAYS over time', () => {
  const { sim, hero } = armed();
  const bench = sim.allUnits('n020').find((u) => u.alive && u.y < -4900
    && Math.abs(u.x - (-140)) > 1);
  sim.kill(bench, hero); // +2
  sim.advance(5);
  const values = sim.callsOf('MultiboardSetItemValue').map((c) => String(c.args[1]));
  assert.ok(values.some((v) => /stairwell/.test(v)), 'the stairwell state is public');
  assert.strictEqual(sim.global('TowerNoise'), 2);
  sim.advance(40); // two decay ticks
  assert.strictEqual(sim.global('TowerNoise'), 0, 'quiet play buys it back');
});
