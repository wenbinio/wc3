'use strict';
// Coinstead wave-machine logic tests (lib/sim, docs/PIPELINE.md §8):
// grace + scout raid, launch timing, exact per-wave composition (player
// scaling, seeded swarm jitter, unscaled bosses — the Toll Baron REALLY
// spawns), wave-hp bookkeeping, leaks + shared lives (boss leak 5),
// wave-clear bounties, victory at wave 20 with the score line, the
// -endless continuation, defeat paths (lives, Depot), steward respawn,
// and the seed-lock/determinism doctrine (gotchas 29/30).

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { loadMap } = require('../../../lib/sim');

const MAP = path.join(__dirname, '..');

function scalar(v) { return Array.isArray(v) ? v[0] : v; }
function call(sim, fn, ...args) { return scalar(sim.call(fn, ...args)); }
function raidersOf(sim, type) {
  return sim.allUnits(type).filter((u) => u.alive && u.ownerIdx === 24);
}

test('grace: scout raid at 45s (1+players cutpurses, no PRNG), wave 1 launches at 75s', () => {
  const sim = loadMap(MAP);
  sim.advance(44);
  assert.strictEqual(raidersOf(sim, 'n000').length, 0, 'quiet before the scouts');
  sim.advance(2);
  assert.strictEqual(raidersOf(sim, 'n000').length, 5, '1 + 4 players scouts');
  assert.ok(/raid\|scouts\|n=5/.test(sim.global('RUNLOG')));
  assert.strictEqual(sim.global('SeedLocked'), false, 'scouts draw no PRNG');
  sim.advance(30); // t=76
  assert.strictEqual(sim.global('WaveNumber'), 1);
  assert.strictEqual(sim.global('WavePhase'), 'active');
  assert.strictEqual(sim.global('SeedLocked'), true, 'first launch locks the seed');
  assert.ok(/seedlock\|wave/.test(sim.global('RUNLOG')));
});

test('scout leaks cost lives even in the grace period', () => {
  const sim = loadMap(MAP);
  sim.advance(46);
  const scout = raidersOf(sim, 'n000')[0];
  sim.moveUnit(scout, 0, 0); // into the Depot core
  assert.strictEqual(sim.global('Lives'), 19);
  assert.ok(/leak\|cutpurse\|lives=19/.test(sim.global('RUNLOG')));
  assert.ok(sim.messagesMatching(/reaches the Depot/).length > 0);
});

test('composition: non-boss counts scale x1.75 at 4 players (wave 4 = 6 marauders, no jitter)', () => {
  const sim = loadMap(MAP);
  sim.chat(0, '-test');
  sim.chat(0, '-wavejump 4');
  sim.advance(2);
  assert.strictEqual(sim.global('WaveNumber'), 4);
  assert.strictEqual(raidersOf(sim, 'n001').length, 6, 'ceil(3 x 1.75)');
  assert.ok(/wave\|start\|4\|edge=\w+\|marauder:6/.test(sim.global('RUNLOG')));
});

test('composition: solo counts are the authored base (wave 4 = 3 marauders)', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-test');
  sim.chat(0, '-wavejump 4');
  sim.advance(2);
  assert.strictEqual(raidersOf(sim, 'n001').length, 3);
});

test('composition: swarm jitter stays within +-1 of the scaled base and is seed-stable', () => {
  const counts = [];
  for (let i = 0; i < 2; i++) {
    const sim = loadMap(MAP, { users: [0] });
    sim.chat(0, '-test');
    sim.chat(0, '-wavejump 1');
    sim.advance(2);
    counts.push(raidersOf(sim, 'n000').length);
  }
  assert.strictEqual(counts[0], counts[1], 'same seed, same jitter');
  assert.ok(counts[0] >= 5 && counts[0] <= 7, 'wave 1 solo: 6 +- 1');
});

test('the boss ACTUALLY spawns: wave 10 fields 1 Toll Baron (unscaled) + announcement', () => {
  const sim = loadMap(MAP);
  sim.chat(0, '-test');
  sim.chat(0, '-wavejump 10');
  sim.advance(2);
  assert.strictEqual(raidersOf(sim, 'n004').length, 1, 'the Toll Baron is REAL');
  assert.strictEqual(raidersOf(sim, 'n001').length, 4, 'escort scales: ceil(2 x 1.75)');
  assert.ok(sim.messagesMatching(/TOLL BARON rides with wave 10/).length > 0);
  assert.ok(/wave\|start\|10\|edge=\w+\|baron:1,marauder:4/.test(sim.global('RUNLOG')));
});

test('wave hp scales +6% per wave index (bookkept in WaveHpOf, applied via BlzSetUnitMaxHP)', () => {
  const sim = loadMap(MAP);
  assert.strictEqual(call(sim, 'WaveHpOf', 'cutpurse', 1), 90);
  assert.strictEqual(call(sim, 'WaveHpOf', 'cutpurse', 11), 144, '90 x 1.60');
  assert.strictEqual(call(sim, 'WaveHpOf', 'baron', 20), 5350, '2500 x 2.14');
  sim.chat(0, '-test');
  sim.chat(0, '-wavejump 10');
  sim.advance(2);
  assert.ok(sim.callsOf('BlzSetUnitMaxHP').some((c) => c.args[1] === 3850),
    'baron wave-10 hp (2500 x 1.54) pushed to the engine');
});

test('leaks: -1 life each, boss -5; lives to zero = defeat with a score line', () => {
  const sim = loadMap(MAP);
  sim.chat(0, '-test');
  sim.chat(0, '-setlives 7');
  sim.chat(0, '-wavejump 10');
  sim.advance(2);
  const baron = raidersOf(sim, 'n004')[0];
  sim.moveUnit(baron, 0, 0);
  assert.strictEqual(sim.global('Lives'), 2, 'boss leak costs 5');
  assert.ok(/leak\|baron\|lives=2/.test(sim.global('RUNLOG')));
  const escorts = raidersOf(sim, 'n001');
  sim.moveUnit(escorts[0], 0, 0);
  sim.moveUnit(escorts[1], 0, 0);
  assert.strictEqual(sim.global('Lives'), 0);
  assert.ok(sim.messagesMatching(/COINSTEAD -- DEFEAT\. Score/).length > 0);
  assert.ok(/verdict\|defeat\|wave=10\|score=/.test(sim.global('RUNLOG')));
  sim.advance(3);
  for (const pid of [0, 1, 2, 3]) {
    assert.strictEqual(sim.player(pid).result, 'defeat');
  }
});

test('wave clear: bounty to killers, wave bounty to every founder, gap then next wave', () => {
  const sim = loadMap(MAP);
  sim.chat(0, '-test');
  sim.chat(0, '-wavejump 4');
  sim.advance(2);
  const steward = sim.findUnit('h000', 0);
  const marauders = raidersOf(sim, 'n001');
  assert.strictEqual(marauders.length, 6);
  for (const m of marauders) sim.kill(m, steward);
  assert.strictEqual(sim.global('WavePhase'), 'gap');
  // p0: 200 + 6 x 12 kill bounty + (15 + 5x4) wave bounty = 307
  assert.strictEqual(sim.player(0).gold, 307);
  assert.strictEqual(sim.player(1).gold, 235, 'non-killers still get the wave bounty');
  assert.ok(/wave\|clear\|4\|bounty=35/.test(sim.global('RUNLOG')));
  sim.advance(46); // WAVE_GAP = 45
  assert.strictEqual(sim.global('WaveNumber'), 5, 'the road moves on');
});

test('victory at wave 20: score line + verdict beat; the win screen lands after the -endless window', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-test');
  sim.chat(0, '-wavejump 20');
  sim.advance(2);
  assert.strictEqual(raidersOf(sim, 'n004').length, 2, 'the final toll: two barons');
  for (const u of raidersOf(sim, 'n004')) sim.kill(u);
  for (const u of raidersOf(sim, 'n001')) sim.kill(u);
  assert.strictEqual(sim.global('VictoryPending'), true);
  assert.ok(sim.messagesMatching(/COINSTEAD -- VICTORY\. Score \d+ \(coin .* \+ goods .* \+ stakes .* \+ lives .* \+ market/).length > 0);
  assert.ok(/verdict\|victory\|wave=20\|score=\d+/.test(sim.global('RUNLOG')));
  assert.strictEqual(sim.player(0).result, null, 'the -endless window holds the screen');
  sim.advance(65); // 60s window + the 2s victory-screen delay
  assert.strictEqual(sim.player(0).result, 'victory');
  assert.ok(/gameover\|victory/.test(sim.global('RUNLOG')));
});

test('score arithmetic: coin + goods (at sell prices) + stakes + lives + market profit', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-test');
  sim.chat(0, '-gold 300');
  sim.chat(0, '-stock wood 10');   // sell value 18g
  sim.chat(0, '-build woodcamp');  // stake 120
  const [total, gold, stockV, invested, livesV, profit] = sim.call('ComputeScore');
  assert.strictEqual(gold, 300);
  assert.strictEqual(stockV, 18);
  assert.strictEqual(invested, 120);
  assert.strictEqual(livesV, 20 * 50);
  assert.strictEqual(profit, 0);
  assert.strictEqual(total, 300 + 18 + 120 + 1000);
});

test('-endless: waves resume past 20, growing +15% per wave; no victory screen', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-test');
  sim.chat(0, '-wavejump 20');
  sim.advance(2);
  for (const u of [...raidersOf(sim, 'n004'), ...raidersOf(sim, 'n001')]) sim.kill(u);
  assert.strictEqual(sim.global('VictoryPending'), true);
  sim.chat(0, '-endless');
  assert.strictEqual(sim.global('EndlessMode'), true);
  assert.ok(/endless\|on/.test(sim.global('RUNLOG')));
  sim.advance(46);
  assert.strictEqual(sim.global('WaveNumber'), 21);
  assert.strictEqual(sim.player(0).result, null, 'no win screen in endless');
  // wave 22 grows the marauder line: (6 x 130)//100 = 7 solo
  for (const u of [...raidersOf(sim, 'n004'), ...raidersOf(sim, 'n001')]) sim.kill(u);
  sim.advance(46);
  assert.strictEqual(sim.global('WaveNumber'), 22);
  assert.ok(/wave\|start\|22\|edge=\w+\|baron:2,marauder:7/.test(sim.global('RUNLOG')));
  // -endless before victory is refused
  const sim2 = loadMap(MAP);
  sim2.chat(0, '-endless');
  assert.ok(sim2.messagesTo(0).some((m) => /only after the twentieth wave/.test(m.text)));
});

test('the Depot razed = instant defeat, whatever the lives count', () => {
  const sim = loadMap(MAP);
  sim.kill(sim.findUnit('h00B'));
  assert.ok(sim.messagesMatching(/The Depot burns/).length > 0);
  assert.ok(/verdict\|defeat/.test(sim.global('RUNLOG')));
  sim.advance(3);
  assert.strictEqual(sim.player(0).result, 'defeat');
});

test('a fallen Steward respawns at the start location after 15s', () => {
  const sim = loadMap(MAP);
  const steward = sim.findUnit('h000', 2);
  sim.kill(steward);
  assert.ok(/steward\|down\|pid=2/.test(sim.global('RUNLOG')));
  assert.strictEqual(sim.unitsOf(2, 'h000').filter((u) => u.alive).length, 0);
  sim.advance(16);
  assert.strictEqual(sim.unitsOf(2, 'h000').filter((u) => u.alive).length, 1);
  assert.ok(/steward\|back\|pid=2/.test(sim.global('RUNLOG')));
});

test('sappers order an attack on the nearest production building', () => {
  const sim = loadMap(MAP);
  sim.chat(0, '-test');
  sim.chat(0, '-build woodcamp');
  sim.chat(0, '-wavejump 8'); // sappers ride wave 8
  sim.advance(2);
  assert.ok(raidersOf(sim, 'n003').length >= 3, 'sappers in the field');
  assert.ok(sim.callsOf('IssueTargetOrder').some((c) => c.args[1] === 'attack'),
    'siege raiders target buildings, not the road');
});

test('seed determinism: same seed = byte-identical run logs; -seed refused once locked; 9-digit guard', () => {
  const run = (seed) => {
    const sim = loadMap(MAP);
    if (seed) sim.chat(0, `-seed ${seed}`);
    sim.chat(0, '-test');
    sim.chat(0, '-wavejump 1');
    sim.advance(3);
    sim.chat(0, '-wave');
    sim.advance(1);
    return sim.global('RUNLOG');
  };
  assert.strictEqual(run(555), run(555), 'replayable to the byte');
  assert.notStrictEqual(run(555), run(556), 'a different seed deals a different road');

  const sim = loadMap(MAP);
  sim.chat(0, '-seed 1234567890'); // 10 digits: refused identically on both int widths
  assert.ok(sim.messagesTo(0).some((m) => /refuses 1234567890/.test(m.text)));
  assert.strictEqual(sim.global('RunSeed'), 20260712, 'seed unchanged');
  sim.chat(0, '-seed 999999999'); // max accepted
  assert.strictEqual(sim.global('RunSeed'), 999999999);
  assert.ok(/seed=999999999/.test(sim.global('RUNLOG')), 'reseed resets the log');

  sim.chat(0, '-buy wood 1'); // first trade locks
  assert.ok(/seedlock\|trade/.test(sim.global('RUNLOG')));
  sim.chat(0, '-seed 42');
  assert.ok(sim.messagesTo(0).some((m) => /ledger is already open/.test(m.text)));
  assert.strictEqual(sim.global('RunSeed'), 999999999);
});
