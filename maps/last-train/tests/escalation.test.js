'use strict';
// The anti-snowball pair (Zombination, credited): kill-XP shared with a
// 0.75^(n-1) crowd falloff PLUS a passive drip so a quiet horde still
// scales — and escalation keyed to STATE (the infected-population ratio),
// not wall-clock alone (the Zombie-Simulator fix). Patrols wander between
// seeded districts, sized by the horde level.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { loadMap } = require('../../../lib/sim');

const MAP = path.join(__dirname, '..');

function scalar(v) { return Array.isArray(v) ? v[0] : v; }

test('SharedXPFor: the 0.75-per-extra-zombie falloff, capped at a crowd of 8', () => {
  const sim = loadMap(MAP, { users: [0] });
  const f = (base, n) => scalar(sim.call('SharedXPFor', base, n));
  assert.strictEqual(f(20, 0), 20);
  assert.strictEqual(f(20, 1), 20, 'a lone zombie learns everything');
  assert.strictEqual(f(20, 2), 15, '20 * 0.75');
  assert.strictEqual(f(20, 3), 11, 'integer floor each step');
  assert.strictEqual(f(20, 4), 8);
  assert.strictEqual(f(20, 8), 2);
  assert.strictEqual(f(20, 99), 2, 'crowds beyond 8 count as 8');
});

test('a crowded kill teaches the horde less than a lone kill', () => {
  const sim = loadMap(MAP, { users: [0, 1] });
  sim.chat(0, '-test');
  sim.chat(0, '-zspawn shambler 5');
  const zombs = sim.unitsOf(24, 'u000').filter((u) => u.alive).slice(-5);
  const civ = sim.allUnits('n000').find((u) => u.alive);
  for (const z of zombs) sim.moveUnit(z, civ.x + 100, civ.y); // a crowd of 5
  const xp0 = sim.global('HordeXP');
  sim.kill(civ, zombs[0]);
  assert.strictEqual(sim.global('HordeXP'), xp0 + 2, 'civilian 10 XP -> 2 through a crowd of 5');
});

test('the passive drip is state-keyed: dead residents raise it', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-test');
  const xp0 = sim.global('HordeXP');
  sim.advance(20); // one drip tick, nobody dead: 2 + 0
  const quiet = sim.global('HordeXP') - xp0;
  assert.strictEqual(quiet, 2, 'baseline drip');

  // kill 9 of 18 residents (by zombie teeth, so the ratio moves)
  sim.chat(0, '-zspawn shambler 1');
  const zomb = sim.unitsOf(24, 'u000').filter((u) => u.alive).pop();
  const civs = [...sim.allUnits('n000'), ...sim.allUnits('n001'), ...sim.allUnits('n002')]
    .filter((u) => u.alive).slice(0, 9);
  for (const c of civs) sim.kill(c, zomb);
  const xp1 = sim.global('HordeXP');
  sim.advance(20);
  const loud = sim.global('HordeXP') - xp1;
  assert.strictEqual(loud, 2 + Math.floor((8 * 9) / 18), 'drip scales with the dead ratio');
});

test('horde levels gate zombie hp and announce themselves', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-test');
  sim.chat(0, '-esc 3');
  assert.ok(sim.messagesMatching(/horde grows bolder \(level 3\)/).length > 0);
  sim.chat(0, '-zspawn shambler 1');
  const scalar = (v) => (Array.isArray(v) ? v[0] : v);
  assert.strictEqual(scalar(sim.call('EscHpOf', 220)), Math.floor((220 * 120) / 100),
    '+10% hp per level past 1');
  const calls = sim.callsOf('BlzSetUnitMaxHP');
  assert.strictEqual(calls[calls.length - 1].args[1], 264,
    'the spawn applied the scaled hp for the game client');
});

test('patrols: first at t=90 (a seed-lock commitment), then every 45s, seeded routes', () => {
  const sim = loadMap(MAP, { users: [0] });
  const horde0 = sim.global('HordeCount');
  sim.advance(89);
  assert.ok(!/patrol\|/.test(sim.global('RUNLOG')), 'quiet before 90');
  assert.strictEqual(sim.global('SeedLocked'), false);
  sim.advance(1);
  assert.ok(/patrol\|\w+>\w+\|n=\d/.test(sim.global('RUNLOG')), 'first patrol at 90');
  assert.strictEqual(sim.global('SeedLocked'), true, 'the patrol draw locks the seed');
  assert.ok(sim.global('HordeCount') > horde0, 'the patrol is real units');
  assert.ok(sim.callsOf('IssuePointOrder').length > 0, 'ordered toward another district');

  const beats1 = sim.global('RUNLOG').match(/patrol\|/g).length;
  sim.advance(45);
  assert.strictEqual(sim.global('RUNLOG').match(/patrol\|/g).length, beats1 + 1, '45s cadence');
});

test('same seed, same night: patrol routes and loot replay byte-identically', () => {
  const run = () => {
    const sim = loadMap(MAP, { users: [0] });
    const hero = sim.findUnit('h000', 0);
    sim.moveUnit(hero, -300, -80);
    sim.chat(0, '-search');
    sim.advance(200);
    return sim.global('RUNLOG');
  };
  assert.strictEqual(run(), run(), 'the whole beat log replays');
});

test('a different seed is a different night', () => {
  const night = (seed) => {
    const sim = loadMap(MAP, { users: [0] });
    sim.chat(0, '-seed ' + seed);
    sim.advance(200);
    return sim.global('RUNLOG');
  };
  assert.notStrictEqual(night(111111), night(222222));
});
