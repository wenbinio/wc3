'use strict';
// The generator objectives (SWAT-style anti-camping, credited) and the
// evacuation window (Zombination, credited) — phase 2A repair is
// PRESENCE, not typing (gotcha 33): stand in the yard and progress
// accrues; it PERSISTS per substation; damage knocks 3s off (never a
// reset); the Technician accrues 2x; a fixed substation RELIGHTS its
// district (the map is the progress bar). Then the train timeline,
// boarding, and all three endings.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { loadMap } = require('../../../lib/sim');

const MAP = path.join(__dirname, '..');

const GEN = { x: -4400, y: 2500 }; // Kebun Baru Substation
const GEN2 = { x: 3400, y: 2500 }; // Seletar Substation
const PLATFORM = { x: 4550, y: 0 };

test('standing in the yard accrues; leaving PERSISTS; damage knocks 3s; done at 10', () => {
  const sim = loadMap(MAP, { users: [0] });
  const hero = sim.findUnit('h000', 0);
  sim.moveUnit(hero, GEN.x + 100, GEN.y);
  sim.advance(6);
  assert.ok(sim.messagesTo(0).some((m) => /You crack the cabinet/.test(m.text)));
  assert.strictEqual(sim.run('return GenList[1].progress')[0], 6, 'a second a second');
  assert.strictEqual(sim.global('GensFixed'), 0);

  // walk away: the work KEEPS (phase 1's channel reset is gone)
  sim.moveUnit(hero, 0, 0);
  sim.advance(5);
  assert.strictEqual(sim.run('return GenList[1].progress')[0], 6, 'progress persists');

  // a bite while working knocks 3s off — a setback, not a reset
  sim.moveUnit(hero, GEN.x + 100, GEN.y);
  sim.chat(0, '-test');
  sim.chat(0, '-zspawn shambler 1');
  const zomb = sim.unitsOf(24, 'u000').filter((u) => u.alive).pop();
  sim.advance(1); // 7 held
  sim.damage(zomb, hero, 5);
  assert.strictEqual(sim.run('return GenList[1].progress')[0], 4, '7 - 3 = 4');
  assert.ok(sim.messagesTo(0).some((m) => /costs you 3s of repair work/.test(m.text)));

  sim.advance(6);
  assert.strictEqual(sim.global('GensFixed'), 1, '4 + 6 = 10: the cabinet hums');
  assert.ok(/gen\|fixed=1\/3\|pid=0/.test(sim.global('RUNLOG')));
});

test('a fixed substation RELIGHTS its district with street lamps and pays 40 XP', () => {
  const sim = loadMap(MAP, { users: [0] });
  const hero = sim.findUnit('h000', 0);
  const lamps0 = sim.allUnits('n028').length;
  sim.moveUnit(hero, GEN.x + 100, GEN.y);
  sim.advance(10);
  assert.strictEqual(sim.global('GensFixed'), 1);
  assert.strictEqual(sim.allUnits('n028').length, lamps0 + 4, 'four lamps flare on');
  assert.ok(/relight\|lamps=4/.test(sim.global('RUNLOG')));
  assert.ok(sim.messagesMatching(/street lamps flicker on/).length > 0);
  assert.strictEqual(sim.run('return SurvXP[0]')[0], 40, 'the objective pays');
});

test('the Technician accrues 2x; Overclock (signature) completes the next one instantly', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.moveUnit(sim.findUnit('h000', 0), -320, -680); // the tech circle
  const tech = sim.findUnit('h003', 0);
  sim.moveUnit(tech, GEN.x + 100, GEN.y);
  sim.advance(5);
  assert.strictEqual(sim.global('GensFixed'), 1, '2x rate: done in 5s');

  // level 3 unlocks Overclock; armed, the NEXT yard completes instantly
  sim.chat(0, '-test');
  sim.chat(0, '-xp 170');
  sim.cast(sim.findUnit('h003', 0), 'A005');
  assert.ok(/overclock\|pid=0/.test(sim.global('RUNLOG')));
  sim.moveUnit(sim.findUnit('h003', 0), GEN2.x + 100, GEN2.y);
  sim.advance(1);
  assert.strictEqual(sim.global('GensFixed'), 2, 'the overclocked rig slams it home');
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

test('the countdown window runs from frame one and flips at arrival', () => {
  const sim = loadMap(MAP, { users: [0] });
  assert.ok(sim.callsOf('CreateTimerDialog').length === 1, 'one countdown window');
  const titles = () => sim.callsOf('TimerDialogSetTitle').map((c) => String(c.args[1]));
  assert.ok(titles().some((t) => /Last train/.test(t)));
  assert.ok(sim.callsOf('TimerDialogDisplay').some((c) => c.args[1] === true), 'shown');
  sim.chat(0, '-test');
  sim.chat(0, '-clock 719');
  sim.advance(1);
  assert.ok(titles().some((t) => /Doors close/.test(t)), 'flips to the boarding clock');
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
  assert.ok(sim.messagesTo(0).some((m) => /station is DARK/.test(m.text)));
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

test('the score is OUTCOMES only: aboard/brood/power/defenses standing', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-test');
  sim.chat(0, '-power');
  sim.chat(0, '-give barricade');
  const hero = sim.findUnit('h000', 0);
  const kit = [...sim.items.values()].find((i) => !i.removed && i.typeStr === 'I013');
  sim.useItem(hero, kit);
  sim.chat(0, '-clock 719');
  sim.advance(1);
  sim.moveUnit(sim.findUnit('h000', 0), PLATFORM.x, PLATFORM.y);
  sim.chat(0, '-clock 899');
  sim.advance(1);
  // 1 aboard (400) + power 3x100 + 1 barricade standing (25) = 725
  assert.strictEqual(sim.global('ScoreFinal'), 725);
  const line = sim.messagesMatching(/LAST TRAIN -- VICTORY/)[0].text;
  assert.ok(/defenses standing 1x25/.test(line));
  assert.ok(!/searches/.test(line), 'the Searches x5 term is CUT');
  assert.ok(!/residents/i.test(line), 'outcomes only');
});
