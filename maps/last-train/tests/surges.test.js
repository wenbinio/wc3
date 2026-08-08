'use strict';
// NEW in phase 2A: the surge heartbeat (ZCD's wave clock, adapted with
// credit) — telegraphed warnings 20s ahead, the ~120s cycle, sizing by
// escalation + living players + district Noise − nests down, the Last
// Mile trickle from T+600, the final oversized surge at the forecourt,
// the platform siege across the boarding window, and the ground spills
// surge kills seed.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { loadMap } = require('../../../lib/sim');

const MAP = path.join(__dirname, '..');

// 2B RE-TARGET (PIPELINE §8): the estate heartbeat is EstateClock-anchored
// (it waits for the tower exit). These suites open the estate with the
// '-deck' debug door at t=0 — EstateClock then equals the wall clock and
// every 2A schedule pin holds unchanged.
const opened = (users) => {
  const sim = loadMap(MAP, { users });
  sim.chat(0, '-test');
  sim.chat(0, '-deck');
  return sim;
};

test('the siren warns 20s ahead with a ping and a dread line; the surge lands on schedule', () => {
  const sim = opened([0]);
  sim.advance(99);
  assert.strictEqual(sim.messagesMatching(/THE SIREN/).length, 0, 'quiet at 99');
  sim.advance(1);
  assert.strictEqual(sim.messagesMatching(/THE SIREN/).length, 1, 'siren at exactly 100');
  assert.ok(sim.callsOf('PingMinimap').length >= 1, 'the target is pinged');
  assert.ok(sim.callsOf('StartSound').length >= 1, 'the siren sounds');
  assert.ok(/siren\|k=1\|/.test(sim.global('RUNLOG')));
  assert.ok(!/surge\|k=1/.test(sim.global('RUNLOG')), 'not yet broken');

  const horde0 = sim.global('HordeCount');
  sim.advance(20);
  assert.ok(/surge\|k=1\|\w+\|n=\d+\|heat=\d+/.test(sim.global('RUNLOG')), 'surge at 120');
  assert.ok(sim.global('HordeCount') > horde0, 'the surge is real units');
  assert.ok(sim.messagesMatching(/THE SURGE BREAKS/).length === 1);
});

test('the surge targets the district where the survivors STAND (converges on a survivor)', () => {
  const sim = opened([0]);
  const hero = sim.findUnit('h000', 0);
  sim.moveUnit(hero, 2200, -3400); // Cheng San
  sim.advance(120);
  const m = sim.global('RUNLOG').match(/surge\|k=1\|(\w+)\|/);
  assert.strictEqual(m[1], 'chengsan', 'the siren means YOU');
});

test('surge size scales with district Noise and shrinks per nest down', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-test');
  // baseline: solo, esc 1, quiet district -> 3 + 1 = 4
  sim.chat(0, '-surge');
  let m = [...sim.global('RUNLOG').matchAll(/surge\|k=\d+\|\w+\|n=(\d+)\|heat=(\d+)/g)].pop();
  assert.strictEqual(Number(m[1]), 4, 'baseline size 4');

  // heat 100 doubles it
  sim.chat(0, '-noise 100');
  sim.chat(0, '-surge');
  m = [...sim.global('RUNLOG').matchAll(/surge\|k=\d+\|\w+\|n=(\d+)\|heat=(\d+)/g)].pop();
  assert.strictEqual(Number(m[2]), 100, 'the heat was read');
  assert.strictEqual(Number(m[1]), 8, 'x(1 + heat/100): loud is fast, the siren counts');

  // burn two nests: two steps off the next surge
  const hero = sim.findUnit('h000', 0);
  const nests = sim.allUnits('h018').filter((u) => u.alive).slice(0, 2);
  for (const n of nests) sim.kill(n, hero);
  sim.chat(0, '-noise 100');
  sim.chat(0, '-surge');
  m = [...sim.global('RUNLOG').matchAll(/surge\|k=\d+\|\w+\|n=(\d+)\|heat=(\d+)/g)].pop();
  assert.strictEqual(Number(m[1]), 6, 'each nest down trims the surge one step');
});

test('surge size scales with the LIVING player count', () => {
  const sim = loadMap(MAP, { users: [0, 1, 2] });
  sim.chat(0, '-test');
  sim.chat(0, '-surge');
  const m = [...sim.global('RUNLOG').matchAll(/surge\|k=\d+\|\w+\|n=(\d+)\|/g)].pop();
  assert.strictEqual(Number(m[1]), 3 + 1 + 2 * 2, '3 + esc + 2 per extra living survivor');
});

test('an active repair yard pulls the surge (anti-camping stays honest)', () => {
  const sim = opened([0, 1]);
  const hero1 = sim.findUnit('h000', 1);
  sim.moveUnit(hero1, -800, -3200); // pid 1 idles in Teck Ghee
  sim.advance(94);
  const hero0 = sim.findUnit('h000', 0);
  sim.moveUnit(hero0, -4400 + 100, 2500); // pid 0 works the Kebun Baru substation
  sim.advance(6); // the warning fires at 100 while the repair is ACTIVE
  assert.ok(/siren\|k=1\|kebunbaru/.test(sim.global('RUNLOG')),
    'the siren names the yard being worked');
});

test('the Last Mile: trickle every 20s after T+600, station-ward, logged', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-test');
  sim.chat(0, '-clock 599');
  sim.advance(1);
  assert.ok(/lastmile/.test(sim.global('RUNLOG')));
  assert.ok(sim.messagesMatching(/only walks ONE way/).length > 0);
  const horde0 = sim.global('HordeCount');
  sim.advance(40);
  const trickles = sim.global('RUNLOG').match(/trickle\|n=\d/g);
  assert.strictEqual(trickles.length, 2, 'two trickles in 40s');
  assert.ok(sim.global('HordeCount') > horde0, 'the trickle is real units');
});

test('the platform siege: at arrival the whole wild horde converges on the forecourt', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-test');
  sim.chat(0, '-zspawn shambler 3');
  sim.chat(0, '-clock 719');
  const orders0 = sim.callsOf('IssuePointOrder').length;
  sim.advance(1);
  assert.ok(/siege/.test(sim.global('RUNLOG')));
  assert.ok(sim.messagesMatching(/HOLD THE FORECOURT/).length > 0);
  const orders = sim.callsOf('IssuePointOrder').slice(orders0);
  assert.ok(orders.length >= 3, 'every wild zombie got the order');
  assert.ok(orders.every((c) => Math.abs(c.args[2] - 4050) < 1 && Math.abs(c.args[3]) < 1),
    'ordered to the fare-gate forecourt');
});

test('surge kills seed ground spills through the ONE stream (clip packs + materials)', () => {
  const sim = loadMap(MAP, { users: [0] });
  const hero = sim.findUnit('h000', 0);
  sim.chat(0, '-test');
  sim.chat(0, '-zspawn shambler 24');
  sim.chat(0, '-gold 999');
  const zombs = sim.unitsOf(24, 'u000').filter((u) => u.alive).slice(-24);
  for (const z of zombs) sim.kill(z, hero);
  const spills = sim.global('RUNLOG').match(/spill\|\w+/g) || [];
  assert.ok(spills.length >= 1, '24 kills at 20% seed at least one spill (deterministic seed)');
  const ground = [...sim.items.values()].filter((i) => !i.removed && !i.ownerUnit
    && i.typeStr !== 'I011' && i.typeStr !== 'I014'); // minus the authored tower drops (2B)
  assert.strictEqual(ground.length, spills.length, 'every spill is a VISIBLE ground item');
});

test('the same seed surges, trickles and spills byte-identically (the re-pinned prefix)', () => {
  const run = () => {
    const sim = loadMap(MAP, { users: [0] });
    const hero = sim.findUnit('h000', 0);
    sim.chat(0, '-test');
    sim.chat(0, '-zspawn shambler 4');
    for (const z of sim.unitsOf(24, 'u000').filter((u) => u.alive).slice(-4)) {
      sim.kill(z, hero);
    }
    sim.advance(130);
    return sim.global('RUNLOG');
  };
  assert.strictEqual(run(), run());
});
