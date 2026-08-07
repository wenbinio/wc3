'use strict';
// Ambience is a first-class deliverable: one permanent night (stopped
// clock at 22.00), monsoon rain via the game-verified RLlr weather code,
// low fog, the seeded NotD-style dread beats, and the multiboard that
// keeps the run legible. Presentation calls are asserted as recorded
// calls (the sim's honesty tier); the seeded beat cadence is asserted as
// real state.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { loadMap } = require('../../../lib/sim');

const MAP = path.join(__dirname, '..');

test('permanent night: time locked at 22.00, scale 0, fog and monsoon rain', () => {
  const sim = loadMap(MAP, { users: [0] });
  const tod = sim.callsOf('SetTimeOfDay');
  assert.ok(tod.length > 0 && tod[0].args[0] === 22, 'night set');
  const scale = sim.callsOf('SetTimeOfDayScale');
  assert.ok(scale.length > 0 && scale[0].args[0] === 0, 'the day cycle is stopped');
  assert.strictEqual(sim.callsOf('SetTerrainFogEx').length, 1, 'low night fog');
  assert.strictEqual(sim.callsOf('AddWeatherEffect').length, 1,
    'one map-wide weather effect (script-side, not the picky w3i field — gotcha 11)');
});

test('dread beats: first at 25s, then every 35s, drawn from the ONE seeded stream', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.advance(24);
  assert.strictEqual(sim.messagesMatching(/\|cff8888aa/).length, 0, 'quiet start');
  sim.advance(1);
  assert.strictEqual(sim.messagesMatching(/\|cff8888aa/).length, 1, 'first beat at 25');
  sim.advance(35);
  assert.strictEqual(sim.messagesMatching(/\|cff8888aa/).length, 2, '35s cadence');
});

test('dread beats replay byte-identically per seed (they share the stream)', () => {
  const beats = (seed) => {
    const sim = loadMap(MAP, { users: [0] });
    sim.chat(0, '-seed ' + seed);
    sim.advance(80);
    return sim.messagesMatching(/\|cff8888aa/).map((m) => m.text).join('\n');
  };
  assert.strictEqual(beats(555), beats(555), 'same seed, same dread');
});

test('the shared multiboard tracks train/power/horde and per-player status', () => {
  const sim = loadMap(MAP, { users: [0, 1] });
  assert.ok(sim.callsOf('CreateMultiboard').length === 1, 'one shared board');
  const values = () => sim.callsOf('MultiboardSetItemValue').map((c) => c.args[1]);
  assert.ok(values().some((v) => /Last train/.test(String(v))));
  assert.ok(values().some((v) => /Heartlander -- alive/.test(String(v))));

  sim.chat(0, '-test');
  sim.chat(0, '-infectme');
  sim.advance(1);
  assert.ok(values().some((v) => /Heartlander -- INFECTED/.test(String(v))),
    'infection surfaces on the board');
  assert.strictEqual(values().filter((v) => String(v) === 'GetLocalPlayer').length, 0);
});

test('no GetLocalPlayer anywhere (desync-safe presentation)', () => {
  const sim = loadMap(MAP, { users: [0, 1] });
  sim.advance(60);
  assert.strictEqual(sim.callsOf('GetLocalPlayer').length, 0);
});

test('the MRT announcement beats land on the train timeline', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-test');
  sim.chat(0, '-clock 659');
  sim.advance(1);
  assert.ok(sim.messagesMatching(/One minute to Yio Chu Kang/).length > 0);
  sim.chat(0, '-power');
  sim.chat(0, '-clock 719');
  sim.advance(1);
  assert.ok(sim.messagesMatching(/mind the platform gap/).length > 0);
  sim.chat(0, '-clock 869');
  sim.advance(1);
  assert.ok(sim.messagesMatching(/Doors closing in thirty seconds/).length > 0);
});
