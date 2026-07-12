'use strict';
// THE GOLDEN RUN — Coinstead's flagship logic test (CLAUDE.md gotcha 30,
// docs/PIPELINE.md §8; exemplar: maps/vaults-of-ash/tests/golden-run.test.js).
//
// A complete scripted solo playthrough on the DEFAULT SEED (20260712):
// found the wood+grain economy, watch a scout leak a life, lock the seed
// with the run's first trade, hold all twenty waves (killing every raider
// at the walls), run a watchtower dry and restock it, sign and RESOLVE the
// wave-4 Trade Tariff (its marauder squad rides wave 5), FULFILL the
// wave-8 Provisions Order (20 bread, 90g lump), let the wave-12 board
// lapse unsigned, ride the wave-16 Toll Concession through two halved
// bounties, forge all three Toolwright tiers out of the map's own goods,
// meet the greedy-affixed Toll Baron on waves 10 and 20, and retire on a
// pinned score of 23014.
//
// Because EVERY random draw (wave edges, swarm jitter, contract offers,
// boss affixes) flows through the map's one Park-Miller PRNG — identical
// under the game's 64-bit Lua and fengari's 32-bit integers — this whole
// 144-beat transcript is pinned with deepStrictEqual: if ANY beat drifts,
// this test names the beat. The wave-9 line (`marauder:6`, no pact squad)
// also documents the design rule that contract CHOICES never shift the
// PRNG stream — only offers draw, and they always draw.
//
// Sim honesty: builds go through the engine CONSTRUCT_FINISH path
// (sim.constructFinish); the sim does not charge build gold the way the
// game's build orders do, and raider kills are scripted (no pathing/attack
// AI) — the pinned economy is the SIM's, byte-stable across runs.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { loadMap } = require('../../../lib/sim');

const MAP = path.join(__dirname, '..');

test('GOLDEN RUN: full 20-wave solo victory on seed 20260712 hits every pinned beat', () => {
  const sim = loadMap(MAP, { users: [0] });
  const steward = () => sim.findUnit('h000', 0);
  const raiders = () => sim.unitsOf(24).filter((u) => u.alive);
  const build = (type, x, y) => {
    const u = sim.createUnit(0, type, x, y, 270);
    sim.constructFinish(u);
    return u;
  };
  const killAll = () => { for (const u of raiders()) sim.kill(u, steward()); };
  const call = (fn, ...args) => {
    const v = sim.call(fn, ...args);
    return Array.isArray(v) ? v[0] : v;
  };

  // ---- founding: the wood+grain economy before the scouts -----------------
  assert.ok(sim.global('RUNLOG').startsWith('seed=20260712\n'), 'default seed logged');
  build('h001', -640, -320); // woodcamp
  build('h003', -384, -320); // grainfield
  build('h005', -640, -64);  // sawmill
  build('h006', -384, -64);  // bakery
  assert.strictEqual(call('InvestedOf', 0), 620, 'the founding stake');

  // ---- the scout raid: one killed, one leaks --------------------------------
  sim.advance(46);
  const scouts = raiders();
  assert.strictEqual(scouts.length, 2, '1 + players scouts');
  sim.kill(scouts[0], steward());
  sim.moveUnit(scouts[1], 0, 0);
  assert.strictEqual(sim.global('Lives'), 19, 'the leak is real even in the grace period');
  assert.strictEqual(sim.global('SeedLocked'), false, 'scouts draw no PRNG');

  // ---- first commitment: a trade locks the seed -----------------------------
  sim.advance(4);
  sim.chat(0, '-sell planks 8');
  assert.strictEqual(sim.global('SeedLocked'), true, 'the ledger is open');

  // ---- waves 1-3: hold the walls; run the watchtower dry and restock it -----
  sim.advance(26); // wave 1 launches at 75s
  assert.strictEqual(sim.global('WaveNumber'), 1);
  killAll();
  build('h009', -256, -448); // watchtower
  sim.advance(46); killAll(); // wave 2
  sim.advance(46);            // wave 3 in the field
  const tower = sim.findUnit('h009', 0);
  const w3 = raiders();
  sim.chat(0, `-sell planks ${call('StockOf', 0, 'planks')}`); // empty the rack
  assert.strictEqual(sim.damage(tower, w3[0], 25), 0, 'dry rack: the shot is zeroed');
  sim.advance(5); // the sawmill's next batch rearms it
  assert.strictEqual(sim.damage(tower, w3[0], 25), 25, 'restocked and firing');
  killAll();

  // ---- wave 4: the first contract board — sign the Trade Tariff -------------
  sim.advance(46); killAll();
  sim.chat(0, '-contract a');
  // ---- wave 5: the pact squad rides in; the ore chain goes up ---------------
  build('h004', -128, -448); // orepit
  build('h007', -768, -448); // smelter
  sim.advance(46); killAll();
  // ---- waves 6-7: the stone chain, then the first Toolwright tier -----------
  build('h002', -768, -192); // quarry
  build('h008', -896, -320); // toolworks
  sim.advance(46); killAll(); // wave 6
  sim.advance(46); killAll(); // wave 7
  sim.chat(0, '-forge buy');
  assert.strictEqual(call('ForgeTierOf', 0), 1, "Toolwright's Bench, paid in goods");

  // ---- wave 8: fulfill the Provisions Order on the spot ---------------------
  sim.advance(46); killAll();
  sim.chat(0, '-contract a'); // 20 bread, lump 90
  sim.chat(0, '-deliver 20');
  assert.strictEqual(sim.global('ContractsDone'), 2, 'tariff resolved + order fulfilled');

  // ---- waves 9-13: the greedy Baron falls, tiers 2 and 3, a lapsed board ----
  sim.advance(46); killAll(); // wave 9 (no pact squad: choices never shift the PRNG)
  sim.advance(46); killAll(); // wave 10 — the greedy-affixed Toll Baron
  sim.chat(0, '-forge buy');
  sim.advance(46); killAll(); // wave 11 (skimmers die at the walls)
  sim.advance(46); killAll(); // wave 12 — its board is left to lapse
  sim.advance(46); killAll(); // wave 13
  sim.chat(0, '-forge buy');
  assert.strictEqual(call('ForgeTierOf', 0), 3, 'the ladder is complete');

  // ---- waves 14-16: sign the Toll Concession --------------------------------
  sim.advance(46); killAll(); // wave 14
  sim.advance(46); killAll(); // wave 15
  sim.advance(46); killAll(); // wave 16
  sim.chat(0, '-contract a'); // the Toll Concession

  // ---- waves 17-20: two halved bounties, then the final toll ----------------
  sim.advance(46); killAll(); // wave 17 (bounty halved)
  sim.advance(46); killAll(); // wave 18 (bounty halved, pact resolves)
  sim.advance(46); killAll(); // wave 19
  sim.advance(46); killAll(); // wave 20 — two greedy Toll Barons
  assert.strictEqual(sim.global('VictoryPending'), true, 'the twentieth wave breaks');
  sim.advance(65); // the -endless window closes on a retirement
  assert.strictEqual(sim.player(0).result, 'victory');
  assert.strictEqual(sim.global('ScoreFinal'), 23014, 'the pinned score');
  assert.strictEqual(sim.global('Lives'), 19, 'only the scout ever got through');
  assert.strictEqual(sim.global('ContractsDone'), 3);
  assert.strictEqual(sim.global('ContractsFailed'), 0);

  // ---- the whole beat sequence, byte-exact ----------------------------------
  const beats = sim.global('RUNLOG').trim().split('\n');
  const expected = [
    'seed=20260712',
    'build|pid=0|woodcamp',
    'build|pid=0|grainfield',
    'build|pid=0|sawmill',
    'build|pid=0|bakery',
    'eat|pid=0|n=3',
    'div|pid=0|gold=55|bonus=27',
    'raid|scouts|n=2',
    'leak|cutpurse|lives=19',
    'seedlock|trade',
    'trade|pid=0|sell|planks|q=8|gold=57',
    'eat|pid=0|n=3',
    'div|pid=0|gold=55|bonus=27',
    'market|planks|-1%|price=792',
    'wave|start|1|edge=south|cutpurse:6',
    'wave|clear|1|bounty=20',
    'build|pid=0|watchtower',
    'eat|pid=0|n=3',
    'div|pid=0|gold=55|bonus=27',
    'eat|pid=0|n=3',
    'div|pid=0|gold=55|bonus=27',
    'wave|start|2|edge=south|cutpurse:9',
    'wave|clear|2|bounty=25',
    'eat|pid=0|n=3',
    'div|pid=0|gold=55|bonus=27',
    'wave|start|3|edge=north|cutpurse:5,runner:2',
    'trade|pid=0|sell|planks|q=25|gold=178',
    'tower|inert|pid=0|watchtower',
    'tower|rearmed|pid=0|watchtower',
    'wave|clear|3|bounty=30',
    'eat|pid=0|n=3',
    'div|pid=0|gold=55|bonus=27',
    'market|planks|-3%|price=769',
    'eat|pid=0|n=3',
    'div|pid=0|gold=54|bonus=27',
    'wave|start|4|edge=north|marauder:3',
    'wave|clear|4|bounty=35',
    'contract|offer|wave=4|a=tariff|b=bread',
    'contract|accept|pid=0|tariff',
    'build|pid=0|orepit',
    'build|pid=0|smelter',
    'eat|pid=0|n=3',
    'div|pid=0|gold=89|bonus=30',
    'wave|start|5|edge=south|cutpurse:9,runner:3,pact:marauder:3',
    'wave|clear|5|bounty=40',
    'build|pid=0|quarry',
    'build|pid=0|toolworks',
    'eat|pid=0|n=3',
    'div|pid=0|gold=108|bonus=32',
    'contract|resolved|tariff',
    'eat|pid=0|n=3',
    'div|pid=0|gold=147|bonus=32',
    'wave|start|6|edge=south|marauder:4,cutpurse:5',
    'wave|clear|6|bounty=45',
    'eat|pid=0|n=3',
    'div|pid=0|gold=147|bonus=32',
    'wave|start|7|edge=south|runner:7',
    'wave|clear|7|bounty=50',
    'forge|pid=0|tier=1',
    'eat|pid=0|n=3',
    'div|pid=0|gold=151|bonus=32',
    'eat|pid=0|n=3',
    'div|pid=0|gold=181|bonus=32',
    'wave|start|8|edge=south|sapper:3,cutpurse:6',
    'wave|clear|8|bounty=55',
    'contract|offer|wave=8|a=bread|b=tariff',
    'contract|accept|pid=0|bread',
    'contract|deliver|pid=0|bread|n=20|total=20/20',
    'contract|fulfilled|bread|lump=90',
    'eat|pid=0|n=3',
    'div|pid=0|gold=181|bonus=32',
    'wave|start|9|edge=west|marauder:6',
    'wave|clear|9|bounty=60',
    'eat|pid=0|n=3',
    'div|pid=0|gold=181|bonus=32',
    'eat|pid=0|n=3',
    'div|pid=0|gold=181|bonus=32',
    'wave|bossaffix|greedy',
    'wave|start|10|edge=south|baron:1,marauder:2',
    'wave|clear|10|bounty=65',
    'forge|pid=0|tier=2',
    'eat|pid=0|n=3',
    'div|pid=0|gold=225|bonus=32',
    'eat|pid=0|n=3',
    'div|pid=0|gold=270|bonus=32',
    'wave|start|11|edge=south|cutpurse:13,runner:3,skimmer:3',
    'wave|clear|11|bounty=70',
    'eat|pid=0|n=3',
    'div|pid=0|gold=270|bonus=32',
    'wave|start|12|edge=east|sapper:5,marauder:3',
    'wave|clear|12|bounty=75',
    'contract|offer|wave=12|a=tariff|b=bread',
    'eat|pid=0|n=3',
    'div|pid=0|gold=270|bonus=32',
    'eat|pid=0|n=3',
    'div|pid=0|gold=270|bonus=32',
    'contract|lapsed|wave=12',
    'wave|start|13|edge=north|runner:13',
    'wave|clear|13|bounty=80',
    'forge|pid=0|tier=3',
    'eat|pid=0|n=3',
    'div|pid=0|gold=270|bonus=32',
    'wave|start|14|edge=west|marauder:8,sapper:2',
    'wave|clear|14|bounty=85',
    'eat|pid=0|n=3',
    'div|pid=0|gold=270|bonus=32',
    'eat|pid=0|n=3',
    'div|pid=0|gold=270|bonus=32',
    'wave|start|15|edge=west|cutpurse:17,marauder:4,skimmer:3',
    'wave|clear|15|bounty=90',
    'eat|pid=0|n=3',
    'div|pid=0|gold=270|bonus=32',
    'wave|start|16|edge=east|sapper:6,runner:6',
    'wave|clear|16|bounty=95',
    'contract|offer|wave=16|a=toll|b=planks',
    'contract|accept|pid=0|toll',
    'eat|pid=0|n=3',
    'div|pid=0|gold=270|bonus=32',
    'eat|pid=0|n=3',
    'div|pid=0|gold=270|bonus=32',
    'wave|start|17|edge=west|marauder:10',
    'wave|clear|17|bounty=50',
    'eat|pid=0|n=3',
    'div|pid=0|gold=270|bonus=32',
    'wave|start|18|edge=west|runner:10,sapper:4,skimmer:4',
    'wave|clear|18|bounty=52',
    'contract|resolved|toll',
    'eat|pid=0|n=3',
    'div|pid=0|gold=270|bonus=32',
    'eat|pid=0|n=3',
    'div|pid=0|gold=270|bonus=32',
    'wave|start|19|edge=west|marauder:8,cutpurse:12,sapper:3',
    'wave|clear|19|bounty=110',
    'eat|pid=0|n=3',
    'div|pid=0|gold=270|bonus=32',
    'wave|bossaffix|greedy',
    'wave|start|20|edge=west|baron:2,marauder:6',
    'wave|clear|20|bounty=115',
    'verdict|victory|wave=20|score=23014',
    'eat|pid=0|n=3',
    'div|pid=0|gold=270|bonus=32',
    'eat|pid=0|n=3',
    'div|pid=0|gold=270|bonus=32',
    'gameover|victory',
  ];
  assert.deepStrictEqual(beats, expected, 'the golden run beat sequence is byte-exact');
});
