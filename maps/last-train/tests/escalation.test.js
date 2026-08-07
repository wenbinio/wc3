'use strict';
// The anti-snowball pair (Zombination, credited): kill-XP falloff PLUS a
// state-keyed passive drip — and phase 2A's nest trim (each rat-king nest
// down slows the drip one step). Ambient wanderers keep phase 1's t=90
// seed-lock and 45s cadence, demoted from primary pressure to texture.
//
// RE-PIN NOTE (PIPELINE §8): the phase-1 seeded-replay prefix pinned a
// patrol/dread beat grammar (patrol| every 45s, dread every 35s). Phase 2A
// deliberately changes the loop — patrols became 1-2 zombie wanderers,
// the dread metronome died, the surge heartbeat (siren|/surge|), nests|,
// spill| and rummage| beats joined the stream, and every draw still flows
// through the ONE Park-Miller stream. The replay property being pinned is
// unchanged (same seed => byte-identical RUNLOG; different seed =>
// different night); the beat VOCABULARY is re-pinned to the new grammar.
// Reviewed beat-by-beat against the phase-1 log before re-pinning: every
// removed beat (patrol|, craft-by-chat, search|) maps to a designed
// replacement (wander|, craft| on pickup, rummage|/smash|), no beat
// vanished silently.

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

test('the passive drip is state-keyed: dead residents raise it, dead nests lower it', () => {
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

  // burn three nests: the drip is trimmed one step each (min 1)
  const hero = sim.findUnit('h000', 0);
  const nests = sim.allUnits('h018').filter((u) => u.alive).slice(0, 3);
  assert.ok(nests.length === 3, 'preplaced lair nests exist');
  for (const n of nests) sim.kill(n, hero);
  assert.strictEqual(sim.global('NestsDown'), 3);
  const xp2 = sim.global('HordeXP');
  sim.advance(20);
  const trimmed = sim.global('HordeXP') - xp2;
  assert.strictEqual(trimmed, loud - 3, 'each nest down trims the drip one step');
});

test('horde levels gate zombie hp and announce themselves', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-test');
  sim.chat(0, '-esc 3');
  assert.ok(sim.messagesMatching(/horde grows bolder \(level 3\)/).length > 0);
  sim.chat(0, '-zspawn shambler 1');
  assert.strictEqual(scalar(sim.call('EscHpOf', 220)), Math.floor((220 * 120) / 100),
    '+10% hp per level past 1');
  const calls = sim.callsOf('BlzSetUnitMaxHP');
  assert.strictEqual(calls[calls.length - 1].args[1], 264,
    'the spawn applied the scaled hp for the game client');
});

test('wanderers: first at t=90 (a seed-lock commitment), 1-2 zombies, then every 45s', () => {
  const sim = loadMap(MAP, { users: [0] });
  const horde0 = sim.global('HordeCount');
  sim.advance(89);
  assert.ok(!/wander\|/.test(sim.global('RUNLOG')), 'quiet before 90');
  assert.strictEqual(sim.global('SeedLocked'), false);
  sim.advance(1);
  const m = sim.global('RUNLOG').match(/wander\|\w+>\w+\|n=(\d)/);
  assert.ok(m, 'first wanderers at 90');
  assert.ok(Number(m[1]) >= 1 && Number(m[1]) <= 2, 'texture, not pressure: 1-2 zombies');
  assert.strictEqual(sim.global('SeedLocked'), true, 'the wander draw locks the seed');
  assert.ok(sim.global('HordeCount') > horde0, 'the wanderers are real units');
  assert.ok(sim.callsOf('IssuePointOrder').length > 0, 'ordered toward another district');

  const beats1 = sim.global('RUNLOG').match(/wander\|/g).length;
  sim.advance(45);
  assert.strictEqual(sim.global('RUNLOG').match(/wander\|/g).length, beats1 + 1, '45s cadence');
});

test('same seed, same night: the whole 200s beat log replays byte-identically', () => {
  const run = () => {
    const sim = loadMap(MAP, { users: [0] });
    const hero = sim.findUnit('h000', 0);
    sim.moveUnit(hero, -300, -80);   // rummage the spawn bench (a seed lock)
    sim.advance(200);                 // through nests, wanderers, siren 1, surge 1
    return sim.global('RUNLOG');
  };
  const log = run();
  assert.strictEqual(log, run(), 'the whole beat log replays');
  // the phase-2A beat grammar is present in the pinned prefix
  for (const beat of ['seedlock|rummage', 'nests|n=', 'rummage|pid=0|',
    'wander|', 'siren|k=1|', 'surge|k=1|']) {
    assert.ok(log.includes(beat), `beat ${beat} in the 200s prefix`);
  }
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
