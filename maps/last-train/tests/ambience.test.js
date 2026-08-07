'use strict';
// Ambience is a first-class deliverable: one permanent night, monsoon rain
// (script-side RLlr — gotcha 11), low fog — and phase 2A's dread
// DISCIPLINE: the 35s metronome is CUT; dread lines fire only at the T+45
// scripted beat and inside surge warnings. The multiboard is reworked
// (Train/Power/Surge/Noise + player rows, residents row cut) and stays
// GetLocalPlayer-free.

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

test('the dread metronome is DEAD: one scripted beat at 45, then only pre-surge', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.advance(44);
  assert.strictEqual(sim.messagesMatching(/\|cff8888aa/).length, 0, 'quiet start');
  sim.advance(1);
  assert.strictEqual(sim.messagesMatching(/\|cff8888aa/).length, 1, 'the T+45 tone-setter');
  sim.advance(35); // T+80: the old metronome would have spoken again
  assert.strictEqual(sim.messagesMatching(/\|cff8888aa/).length, 1,
    'no 35s metronome any more');
  sim.advance(20); // T+100: the first siren carries a dread line
  assert.strictEqual(sim.messagesMatching(/\|cff8888aa/).length, 2,
    'dread rides the siren');
  assert.ok(sim.messagesMatching(/THE SIREN/).length === 1);
});

test('dread and sirens replay byte-identically per seed (they share the stream)', () => {
  const beats = (seed) => {
    const sim = loadMap(MAP, { users: [0] });
    sim.chat(0, '-seed ' + seed);
    sim.advance(130);
    return sim.messagesMatching(/\|cff8888aa/).map((m) => m.text).join('\n');
  };
  assert.strictEqual(beats(555), beats(555), 'same seed, same dread');
});

test('the reworked multiboard: Train/Power/Surge/Noise rows, player class·level·ammo rows', () => {
  const sim = loadMap(MAP, { users: [0, 1] });
  assert.ok(sim.callsOf('CreateMultiboard').length === 1, 'one shared board');
  const values = () => sim.callsOf('MultiboardSetItemValue').map((c) => String(c.args[1]));
  assert.ok(values().some((v) => /Last train/.test(v)));
  assert.ok(values().some((v) => /Surge/.test(v)), 'the surge row');
  assert.ok(values().some((v) => /Noise/.test(v)), 'the noise row');
  assert.ok(values().some((v) => /estate quiet/.test(v)), 'noise state legible');
  assert.ok(values().some((v) => /T-12:00/.test(v)), 'mm:ss train clock');
  assert.ok(values().some((v) => /Heartlander L1 -- 12rd 2cl -- alive/.test(v)),
    'class, level, rounds, clips, state on one row');
  assert.ok(!values().some((v) => /Residents/.test(v)), 'the residents row is CUT');

  sim.chat(0, '-test');
  sim.chat(0, '-infectme');
  sim.advance(1);
  assert.ok(values().some((v) => /INFECTED/.test(v)), 'infection surfaces on the board');
  assert.strictEqual(values().filter((v) => v === 'GetLocalPlayer').length, 0);
});

test('district noise surfaces on the board when a district is ROUSED', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-test');
  sim.chat(0, '-noise 80');
  sim.advance(5);
  const values = sim.callsOf('MultiboardSetItemValue').map((c) => String(c.args[1]));
  assert.ok(values.some((v) => /ROUSED \(\d+\)/.test(v)), 'ROUSED state shown');
});

test('no GetLocalPlayer anywhere (desync-safe presentation)', () => {
  const sim = loadMap(MAP, { users: [0, 1] });
  sim.advance(60);
  assert.strictEqual(sim.callsOf('GetLocalPlayer').length, 0);
});

test('the MRT announcement beats land on the train timeline', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-test');
  sim.chat(0, '-clock 299');
  sim.advance(1);
  assert.ok(sim.messagesMatching(/departed Tampines/).length > 0, 'the mid-run PA beat');
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
