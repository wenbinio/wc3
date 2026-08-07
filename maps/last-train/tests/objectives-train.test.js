'use strict';
// The generator objectives (SWAT-style anti-camping, credited) and the
// evacuation window (Zombination, credited): -fix channels, the Technician
// halving, the Generator Part instant fix, power gating the doors, the
// train timeline, boarding, and all three endings the train can write.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { loadMap } = require('../../../lib/sim');

const MAP = path.join(__dirname, '..');

const GEN = { x: -4400, y: 2500 }; // Kebun Baru Substation
const PLATFORM = { x: 4550, y: 0 };

test('-fix: a 10s channel beside the cabinet; damage interrupts; leaving lapses', () => {
  const sim = loadMap(MAP, { users: [0] });
  const hero = sim.findUnit('h000', 0);
  sim.chat(0, '-fix');
  assert.ok(sim.messagesTo(0).some((m) => /No dead substation in reach/.test(m.text)));

  sim.moveUnit(hero, GEN.x + 100, GEN.y);
  sim.chat(0, '-fix');
  assert.ok(sim.messagesTo(0).some((m) => /10s of standing still/.test(m.text)));
  sim.advance(9);
  assert.strictEqual(sim.global('GensFixed'), 0, 'not done at 9s');

  // a zombie bite knocks the spanner loose
  sim.chat(0, '-test');
  sim.chat(0, '-zspawn shambler 1');
  const zomb = sim.unitsOf(24, 'u000').filter((u) => u.alive).pop();
  sim.damage(zomb, hero, 5);
  assert.ok(sim.messagesTo(0).some((m) => /the fix is interrupted/.test(m.text)));
  sim.advance(2);
  assert.strictEqual(sim.global('GensFixed'), 0, 'interrupted channel never lands');

  sim.chat(0, '-fix');
  sim.advance(10);
  assert.strictEqual(sim.global('GensFixed'), 1, 'a clean channel fixes it');
  assert.ok(/gen\|fixed=1\/3\|pid=0/.test(sim.global('RUNLOG')));

  // walking away lapses the channel
  sim.moveUnit(hero, 2400, -4500 + 100);
  sim.moveUnit(hero, 2400, -4500);
  sim.chat(0, '-fix');
  sim.advance(3);
  sim.moveUnit(hero, 0, 0);
  sim.advance(2);
  assert.ok(sim.messagesTo(0).some((m) => /The fix lapses/.test(m.text)));
  assert.strictEqual(sim.global('GensFixed'), 1);
});

test('the Technician channels in half the time; a Generator Part is instant', () => {
  const sim = loadMap(MAP, { users: [0, 1] });
  sim.chat(0, '-class tech');
  const tech = sim.findUnit('h003', 0);
  // the technician STARTS with a Generator Part: the first fix is instant
  sim.moveUnit(tech, GEN.x + 100, GEN.y);
  sim.chat(0, '-fix');
  assert.strictEqual(sim.global('GensFixed'), 1, 'starting part = instant fix');
  assert.ok(sim.messagesTo(0).some((m) => /slots straight in/.test(m.text)));

  // without a part, the tech channels 5s (half of 10)
  sim.moveUnit(tech, 3400, 2500 - 100);
  sim.chat(0, '-fix');
  assert.ok(sim.messagesTo(0).some((m) => /5s of standing still/.test(m.text)));
  sim.advance(5);
  assert.strictEqual(sim.global('GensFixed'), 2);
});

test('all three substations live = station power, announced and logged', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-test');
  sim.chat(0, '-power');
  assert.strictEqual(sim.global('GensFixed'), 3);
  assert.strictEqual(sim.global('StationPowered'), true);
  assert.ok(/power\|on/.test(sim.global('RUNLOG')));
  assert.ok(sim.messagesMatching(/STATION POWER RESTORED/).length > 0);
});

test('the timeline: warnings, arrival at 720 with the platform-gap line, dark doors', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-test');
  sim.chat(0, '-clock 539');
  sim.advance(1);
  assert.ok(sim.messagesMatching(/last train departs Yishun/).length > 0, 'T-180 warning');
  sim.chat(0, '-clock 699');
  sim.advance(1);
  assert.ok(sim.messagesMatching(/The rails begin to sing/).length > 0, 'T-20 rumble');
  sim.chat(0, '-clock 719');
  sim.advance(1);
  assert.strictEqual(sim.global('TrainAtStation'), true);
  assert.ok(sim.allUnits('h01A').some((u) => u.alive), 'the train unit exists');
  assert.ok(sim.messagesMatching(/mind the platform gap/).length > 0, 'the announcement');
  assert.ok(sim.messagesMatching(/platform is DARK/).length > 0, 'no power = sealed doors');
  assert.ok(/train\|arrive/.test(sim.global('RUNLOG')));

  // stepping onto the platform without power is refused
  const hero = sim.findUnit('h000', 0);
  sim.moveUnit(hero, PLATFORM.x, PLATFORM.y);
  assert.ok(!sim.global('Aboard') || sim.messagesTo(0).some((m) => /station is DARK/.test(m.text)));
  assert.ok(/train\|board/.test(sim.global('RUNLOG')) === false, 'nobody boards a dark train');
});

test('with power, walking onto the platform boards; departure is a victory', () => {
  const sim = loadMap(MAP, { users: [0, 1] });
  sim.chat(0, '-test');
  sim.chat(0, '-power');
  sim.chat(0, '-clock 719');
  sim.advance(1);
  const hero = sim.findUnit('h000', 0);
  sim.moveUnit(hero, PLATFORM.x, PLATFORM.y);
  assert.ok(/train\|board\|pid=0/.test(sim.global('RUNLOG')), 'region entry boards');
  assert.ok(sim.messagesMatching(/ABOARD/).length > 0);

  sim.chat(1, '-board'); // pid 1 is nowhere near the platform
  assert.ok(sim.messagesTo(1).some((m) => /not on the platform/.test(m.text)));

  sim.chat(0, '-clock 899');
  sim.advance(1);
  assert.strictEqual(sim.global('GameOver'), true);
  assert.ok(/train\|depart\|aboard=1/.test(sim.global('RUNLOG')));
  assert.ok(/verdict\|train/.test(sim.global('RUNLOG')));
  sim.advance(3);
  assert.strictEqual(sim.player(0).result, 'victory', 'aboard = out');
  assert.strictEqual(sim.player(1).result, 'defeat', 'left on the platform');
});

test('waiting ON the platform when the train arrives boards you on arrival', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-test');
  sim.chat(0, '-power');
  const hero = sim.findUnit('h000', 0);
  sim.moveUnit(hero, PLATFORM.x, PLATFORM.y - 100);
  sim.chat(0, '-clock 719');
  sim.advance(1);
  assert.ok(/train\|board\|pid=0/.test(sim.global('RUNLOG')), 'the arrival sweep');
});

test('the empty departure: the night goes on, only the Broodmother ends it', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-test');
  sim.chat(0, '-clock 719');
  sim.advance(1);
  sim.chat(0, '-clock 899');
  sim.advance(1);
  assert.strictEqual(sim.global('GameOver'), false, 'no verdict on an empty train');
  assert.ok(/train\|empty/.test(sim.global('RUNLOG')));
  assert.ok(sim.messagesMatching(/only one way out/).length > 0);
  assert.strictEqual(sim.global('TrainGone'), true);
  sim.chat(0, '-board');
  assert.ok(sim.messagesTo(0).some((m) => /it is gone/.test(m.text)));

  // the alternative victory still works after the miss
  const hero = sim.findUnit('h000', 0);
  const brood = sim.allUnits('u005').find((u) => u.alive);
  sim.kill(brood, hero);
  assert.strictEqual(sim.global('GameOver'), true);
  assert.ok(/brood\|slain/.test(sim.global('RUNLOG')));
  sim.advance(3);
  assert.strictEqual(sim.player(0).result, 'victory');
});

test('killing the Broodmother early is a victory in its own right; defectors lose', () => {
  const sim = loadMap(MAP, { users: [0, 1] });
  sim.chat(0, '-test');
  sim.chat(0, '-zspawn shambler 1');
  const zomb = sim.unitsOf(24, 'u000').filter((u) => u.alive).pop();
  sim.kill(sim.findUnit('h000', 1), zomb); // pid 1 defects
  const hero = sim.findUnit('h000', 0);
  const brood = sim.allUnits('u005').find((u) => u.alive);
  sim.kill(brood, hero);
  assert.ok(/verdict\|brood/.test(sim.global('RUNLOG')));
  sim.advance(3);
  assert.strictEqual(sim.player(0).result, 'victory');
  assert.strictEqual(sim.player(1).result, 'defeat', 'the horde dies with its brain');
});

test('nests are attackable flavor: the kill is logged and scored', () => {
  const sim = loadMap(MAP, { users: [0] });
  const hero = sim.findUnit('h000', 0);
  const nest = sim.allUnits('h018').find((u) => u.alive);
  sim.kill(nest, hero);
  assert.ok(/nest\|down\|1/.test(sim.global('RUNLOG')));
});
