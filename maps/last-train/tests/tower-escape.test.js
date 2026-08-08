'use strict';
// PHASE 2B — the tower-escape slice (playtest-2: "first you have to
// survive & fight your way out of a HDB, on the sixth floor, all lifts
// are down"). Block 6A's interior: six walled pockets linked by
// trigger-teleport stairwell doors (region enter -> SetUnitPosition —
// fully sim-exercisable), the class circles IN the 6F corridor, pressure
// from BOTH directions (risers behind, climbers below), the 3F furniture
// barricade, the 2F nest floor, the 5F rescue beat, and the void-deck
// exit as the slice's victory beat that STARTS the estate heartbeat
// (EstateClock). The estate loop itself is pinned by the phase-2A suites
// (re-targeted on '-deck'/'-clock', see their headers).

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { loadMap } = require('../../../lib/sim');

const MAP = path.join(__dirname, '..');

// generate-layout.mjs mirrors (TOWER table in war3map.lua)
const TY = -5260;
const POCKETS = [-3400, -2400, -1400, -400, 600, 1600];
const doorOf = (i) => ({ x: POCKETS[i - 1] + 330, y: TY });
const arriveOf = (i) => ({ x: POCKETS[i - 1] - 320, y: TY });

test('all survivors wake in the 6F corridor; the estate heartbeat is HELD', () => {
  const sim = loadMap(MAP, { users: [0, 1] });
  for (const pid of [0, 1]) {
    const hero = sim.findUnit('h000', pid);
    assert.ok(hero.x < -3500 && hero.y < -5000, `pid ${pid} wakes inside pocket 1`);
    assert.strictEqual(sim.run(`return TowerPocketOf[${pid}]`)[0], 1);
  }
  assert.strictEqual(sim.global('TowerPhase'), true);
  // the estate waits: no wanderers, no sirens, no drip while indoors
  sim.advance(130);
  assert.ok(!/wander\|/.test(sim.global('RUNLOG')), 'no wanderers indoors');
  assert.ok(!/siren\|/.test(sim.global('RUNLOG')), 'no sirens indoors');
  assert.strictEqual(sim.global('EstateClock'), 0, 'the estate clock has not started');
  assert.strictEqual(sim.global('HordeXP'), 0, 'no escalation drip indoors');
  // but the TRAIN timeline runs from frame one: time indoors is time lost
  assert.strictEqual(sim.global('GameClock'), 130);
});

test('the class circles live in the 6F corridor: walk on = transform, in place', () => {
  const sim = loadMap(MAP, { users: [0] });
  const hero = sim.findUnit('h000', 0);
  sim.moveUnit(hero, -3420, -5420); // the police circle (6F corridor south wall)
  const apo = sim.findUnit('h001', 0);
  assert.ok(apo, 'the APO stands in the corridor');
  assert.ok(/class\|pid=0\|police/.test(sim.global('RUNLOG')));
});

test('a stairwell door teleports DOWN one pocket, pans the camera, logs the floor', () => {
  const sim = loadMap(MAP, { users: [0] });
  const hero = sim.findUnit('h000', 0);
  const d = doorOf(1), a = arriveOf(2);
  sim.moveUnit(hero, d.x, d.y);
  assert.ok(Math.abs(hero.x - a.x) < 1 && Math.abs(hero.y - a.y) < 1,
    'delivered to the 5F arrival spot');
  assert.strictEqual(sim.run('return TowerPocketOf[0]')[0], 2);
  assert.ok(/tower\|door\|pid=0\|to=5f/.test(sim.global('RUNLOG')));
  assert.ok(sim.callsOf('PanCameraToTimedForPlayer').length >= 1, 'camera follows');
  assert.ok(sim.callsOf('StartSound').length >= 1, 'the door slams');
});

test('descending raises RISERS behind you (capped) — cleared floors do not stay clear', () => {
  const sim = loadMap(MAP, { users: [0] });
  const hero = sim.findUnit('h000', 0);
  const horde0 = sim.global('HordeCount');
  sim.moveUnit(hero, doorOf(1).x, doorOf(1).y);
  assert.ok(/riser\|6f\|n=1/.test(sim.global('RUNLOG')), 'one riser behind a solo runner');
  assert.strictEqual(sim.global('HordeCount'), horde0 + 1, 'the riser is a real unit');
  assert.ok(sim.callsOf('IssuePointOrder').some((c) =>
    Math.abs(c.args[2] - doorOf(1).x) < 1), 'ordered at the stair door: it follows');
  // the cap: two riser events per pocket, then the floor is spent
  sim.moveUnit(hero, arriveOf(1).x, arriveOf(1).y); // climb back up conceptually
  sim.moveUnit(hero, doorOf(1).x, doorOf(1).y);
  sim.moveUnit(hero, arriveOf(1).x, arriveOf(1).y);
  sim.moveUnit(hero, doorOf(1).x, doorOf(1).y);
  const risers = sim.global('RUNLOG').match(/riser\|6f\|/g);
  assert.strictEqual(risers.length, 2, 'RISER_CAP holds');
});

test('a zombie entering the door rect takes the stairs too (pressure follows)', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-test');
  sim.chat(0, '-zspawn shambler 1');
  const zomb = sim.unitsOf(24, 'u000').filter((u) => u.alive).pop();
  sim.moveUnit(zomb, doorOf(1).x, doorOf(1).y);
  const a = arriveOf(2);
  assert.ok(Math.abs(zomb.x - a.x) < 1 && Math.abs(zomb.y - a.y) < 1,
    'the zombie is delivered one floor down');
});

test('CLIMBERS come up on a cadence; graded LOUDNESS adds bodies (+1 per 3, capped)', () => {
  // RE-PIN (activity pass): TowerSmashes/TowerLoudness became the graded,
  // decaying, displayed TowerNoise — +2 per non-blocker smash, +1 per 8
  // rounds, climbers 1 + min(2, noise//3); dark unlit floors add one more
  const sim = loadMap(MAP, { users: [0] });
  sim.advance(70); // CLIMB_FROM 40 + CLIMB_PERIOD 30
  const first = sim.global('RUNLOG').match(/climb\|6f\|n=(\d)/);
  assert.ok(first, 'the stairwell breathes');
  assert.strictEqual(Number(first[1]), 1, 'quiet party on a LIT floor: one climber');

  // two smashes just before the wave = loudness 4 (decays 1 at t=60):
  // the t=70 climb reads 3 -> 1 + (3//3) = 2 climbers
  const sim2 = loadMap(MAP, { users: [0] });
  const hero2 = sim2.findUnit('h000', 0);
  sim2.advance(55);
  for (const p of sim2.allUnits('n020').filter((u) => u.alive
    && u.y < -4900 && Math.abs(u.x - (-140)) > 1).slice(0, 2)) sim2.kill(p, hero2);
  assert.strictEqual(sim2.global('TowerNoise'), 4, 'two smashes, +2 each');
  sim2.advance(15);
  const loud = sim2.global('RUNLOG').match(/climb\|6f\|n=(\d)/);
  assert.strictEqual(Number(loud[1]), 2, 'the stairwell heard you');
});

test('the 3F landing is furniture-BLOCKED: the door refuses until you smash through', () => {
  const sim = loadMap(MAP, { users: [0] });
  const hero = sim.findUnit('h000', 0);
  assert.strictEqual(sim.run('return TowerBlockersAlive()')[0], 3, 'three blockers registered');
  // jump straight to the 3F pocket (the sim teleports; walls are game-side)
  sim.moveUnit(hero, POCKETS[3], TY);
  sim.moveUnit(hero, doorOf(4).x, doorOf(4).y);
  assert.ok(hero.x < doorOf(4).x - 100, 'bounced off the blocked door');
  assert.ok(sim.callsOf('SetTextTagText').some((c) => /BLOCKED/.test(String(c.args[1]))),
    'the refusal is floating text, not chat');
  // smash the barricade: the door works, and the smash pays loot + noise
  for (const b of sim.allUnits('n021').concat(sim.allUnits('n020'))
    .filter((u) => u.alive && Math.abs(u.x - (-140)) < 1)) {
    sim.kill(b, hero);
  }
  assert.strictEqual(sim.run('return TowerBlockersAlive()')[0], 0);
  sim.moveUnit(hero, doorOf(4).x, doorOf(4).y);
  assert.strictEqual(sim.run('return TowerPocketOf[0]')[0], 5, 'through to 2F');
});

test('the 2F nest floor: the nest is real, burnable, and trims the estate drip', () => {
  const sim = loadMap(MAP, { users: [0] });
  const hero = sim.findUnit('h000', 0);
  const nest = sim.allUnits('h018').find((u) => u.alive && u.y < -4900);
  assert.ok(nest, 'a rat-king nest squats on the second floor');
  // the authored Molotov lies in the 4F dark (ground item, seed-independent)
  const molotov = [...sim.items.values()].find((i) => !i.removed
    && i.typeStr === 'I014' && !i.ownerUnit);
  assert.ok(molotov && molotov.y < -4900, 'the counterplay is found en route');
  sim.moveUnit(hero, nest.x + 80, nest.y);
  sim.pickup(hero, molotov);
  sim.useItem(hero, [...sim.items.values()].find((i) => !i.removed
    && i.typeStr === 'I014' && i.ownerUnit === hero.handle));
  assert.ok(!nest.alive, 'one Molotov takes the nest');
  assert.strictEqual(sim.global('NestsDown'), 1, 'the trim carries into the estate night');
});

test('the 6F corridor holds the guaranteed Parang: the escape needs no bullets', () => {
  const sim = loadMap(MAP, { users: [0] });
  const parang = [...sim.items.values()].find((i) => !i.removed
    && i.typeStr === 'I011' && !i.ownerUnit);
  assert.ok(parang, 'the dead neighbour left a Parang');
  assert.ok(parang.x < -3400 && parang.y < -5000, 'in the 6F flat');
  const hero = sim.findUnit('h000', 0);
  sim.chat(0, '-test');
  sim.chat(0, '-gold 0'); // dry from the start
  sim.moveUnit(hero, parang.x, parang.y);
  sim.pickup(hero, parang);
  sim.chat(0, '-zspawn shambler 1');
  const zomb = sim.unitsOf(24, 'u000').filter((u) => u.alive).pop();
  const hp0 = zomb.life;
  sim.damage(hero, zomb, 22);
  assert.strictEqual(zomb.life, hp0 - 11, 'the Parang swings on an empty clip');
});

test('the 5F rescue beat: stand with the trapped neighbour and they join you', () => {
  const sim = loadMap(MAP, { users: [0] });
  const hero = sim.findUnit('h000', 0);
  const uncle = sim.allUnits('n000').find((u) => u.alive && u.y < -4900);
  assert.ok(uncle, 'a neighbour is trapped on 5F');
  const xp0 = sim.run('return SurvXP[0]')[0];
  sim.moveUnit(hero, uncle.x + 60, uncle.y);
  sim.advance(2);
  assert.ok(/rescue\|pid=0/.test(sim.global('RUNLOG')), 'presence frees them');
  assert.strictEqual(sim.run('return SurvXP[0]')[0], xp0 + 25, 'the rescue pays');
  assert.ok(sim.callsOf('SetUnitOwner').length >= 1, 'they answer to their rescuer');
  // they take the stairs with you
  sim.moveUnit(hero, doorOf(2).x, doorOf(2).y);
  const a = arriveOf(3);
  assert.ok(Math.abs(uncle.x - (a.x + 60)) < 1, 'the neighbour follows through the door');
  // and stepping outside with them alive pays the bonus
  sim.moveUnit(hero, doorOf(6).x, doorOf(6).y);
  assert.ok(/rescue\|out\|pid=0/.test(sim.global('RUNLOG')));
});

test('the void-deck exit IS the slice victory: rain line, XP, and the estate STARTS', () => {
  const sim = loadMap(MAP, { users: [0, 1] });
  const hero = sim.findUnit('h000', 0);
  sim.advance(30);
  sim.moveUnit(hero, doorOf(6).x, doorOf(6).y);
  assert.ok(Math.abs(hero.x - (-620)) < 1 && Math.abs(hero.y - (-240)) < 1,
    'delivered to the void deck');
  assert.strictEqual(sim.global('TowerPhase'), false, 'the first exit opens the estate');
  assert.ok(/tower\|out\|pid=0\|t=30/.test(sim.global('RUNLOG')));
  assert.ok(/tower\|open\|t=30/.test(sim.global('RUNLOG')));
  assert.ok(sim.messagesMatching(/rain hits you like applause/).length >= 1,
    'the relief beat (a KEPT line: flavor spine; AnnounceAll = one per seat)');
  assert.strictEqual(sim.run('return SurvXP[0]')[0], 40, 'escape pays 40');

  // the estate heartbeat is anchored to the EXIT, not the wall clock:
  // first wanderers 90s later, first siren 100s later — 2A pacing preserved
  sim.advance(89);
  assert.ok(!/wander\|/.test(sim.global('RUNLOG')));
  sim.advance(1);
  assert.ok(/wander\|/.test(sim.global('RUNLOG')), 'wanderers at EstateClock 90');
  sim.advance(10);
  assert.ok(/siren\|k=1\|/.test(sim.global('RUNLOG')), 'first siren at EstateClock 100');

  // the second player is still inside; their own exit is quieter
  const hero1 = sim.findUnit('h000', 1);
  sim.moveUnit(hero1, doorOf(6).x, doorOf(6).y);
  assert.ok(/tower\|out\|pid=1/.test(sim.global('RUNLOG')));
  assert.strictEqual(sim.global('RUNLOG').match(/tower\|open/g).length, 1,
    'the open beat fires once');
});

test('a full descent through every floor reaches the rain (the spine walk)', () => {
  const sim = loadMap(MAP, { users: [0] });
  const hero = sim.findUnit('h000', 0);
  // smash the 3F barricade first (the only gate on the spine)
  for (const b of sim.allUnits('n021').concat(sim.allUnits('n020'))
    .filter((u) => u.alive && Math.abs(u.x - (-140)) < 1)) {
    sim.kill(b, hero);
  }
  for (let i = 1; i <= 6; i++) {
    sim.moveUnit(hero, doorOf(i).x, doorOf(i).y);
  }
  assert.strictEqual(sim.global('TowerPhase'), false, 'six doors, then the rain');
  const log = sim.global('RUNLOG');
  for (const k of ['to=5f', 'to=4f', 'to=3f', 'to=2f', 'to=1f', 'tower|out']) {
    assert.ok(log.includes(k), `spine beat ${k}`);
  }
});

test('-status inside the tower names your floor and the doors left', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-status');
  const t = sim.messagesTo(0).map((m) => m.text).join('\n');
  assert.ok(/sixth-floor corridor/.test(t));
  assert.ok(/5 door\(s\) between you and the rain/.test(t));
});

test('tower death is a SETBACK, not the traitor system: respawn at the landing', () => {
  const sim = loadMap(MAP, { users: [0, 1] });
  sim.chat(0, '-test');
  sim.chat(0, '-zspawn shambler 1');
  const zomb = sim.unitsOf(24, 'u000').filter((u) => u.alive).pop();
  const hero = sim.findUnit('h000', 0);
  const hx = hero.x, hy = hero.y;
  sim.kill(hero, zomb);
  assert.ok(/towerdeath\|pid=0/.test(sim.global('RUNLOG')));
  assert.ok(!/defect\|pid=0/.test(sim.global('RUNLOG')), 'NO defection indoors (2B rule)');
  assert.strictEqual(sim.global('GameOver'), false, 'the night goes on');
  // their corpse gets the standard rise window where they fell
  sim.advance(4);
  const risen = sim.unitsOf(24, 'u000').filter((u) => u.alive
    && Math.abs(u.x - hx) < 1 && Math.abs(u.y - hy) < 1);
  assert.strictEqual(risen.length, 1, 'the corpse stands back up at the spot');
  // ~18s later they stagger back to their floor's landing, one clip poorer
  sim.advance(15); // 19 total > TOWER_RESPAWN
  const back = sim.findUnit('h000', 0);
  assert.ok(back && back.alive, 'respawned');
  assert.ok(Math.abs(back.x - (-3720)) < 1, 'at the 6F landing');
  assert.strictEqual(sim.player(0).lumber, 1, 'one clip poorer (had 2)');
  assert.strictEqual(sim.player(0).gold, 6, 'the gun comes back half-seated (12 // 2)');
  assert.ok(/respawn\|pid=0\|6f/.test(sim.global('RUNLOG')));
});

test('the LAST living survivor down indoors ends the night (solo death = defeat)', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-test');
  sim.chat(0, '-zspawn shambler 1');
  const zomb = sim.unitsOf(24, 'u000').filter((u) => u.alive).pop();
  sim.kill(sim.findUnit('h000', 0), zomb);
  assert.strictEqual(sim.global('GameOver'), true, 'nobody waits out a wipe in a stairwell');
  assert.ok(/verdict\|wipe/.test(sim.global('RUNLOG')));
  sim.advance(3);
  assert.strictEqual(sim.player(0).result, 'defeat', 'a plain defeat, no self-victory');
});

test('-deck (debug) skips the slice: everyone on the void deck, estate open', () => {
  const sim = loadMap(MAP, { users: [0, 1] });
  sim.chat(0, '-test');
  sim.chat(0, '-deck');
  assert.strictEqual(sim.global('TowerPhase'), false);
  const hero = sim.findUnit('h000', 0);
  assert.ok(Math.abs(hero.y - (-240)) < 1, 'teleported out');
  assert.ok(/debug\|deck/.test(sim.global('RUNLOG')));
});
