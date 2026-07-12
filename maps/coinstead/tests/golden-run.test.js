'use strict';
// THE GOLDEN RUN — Coinstead's flagship logic test (CLAUDE.md gotcha 30,
// docs/PIPELINE.md §8; exemplar: maps/vaults-of-ash/tests/golden-run.test.js).
// RE-PINNED for phase 3 (physical logistics) per PIPELINE §8's re-pin
// doctrine: the old 144-beat transcript was diffed beat-by-beat against
// this 159-beat one and every change class reviewed — see the phase-3
// notes in the map README. The PRNG-derived beats (all 21 wave|start
// compositions + edges, both greedy boss affixes, all four contract
// offers, the scout raid) are BYTE-IDENTICAL to phase 2, proving the
// physical-logistics rework never touched the seeded stream.
//
// A complete scripted solo playthrough on the DEFAULT SEED (20260712):
// found the wood+grain economy and ROUTE it (woodcamp->sawmill,
// grainfield->bakery, both refiners -> depot), watch a scout leak a life,
// lock the seed by selling stall-routed planks, hold all twenty waves,
// meet the phase-3 physics head-on — the never-routed watchtower rack is
// born dry (INERT on its first shot) and rearms only when the routes are
// STEERED to feed it (the creation-order starvation rule, -unlink and a
// planks filter on display) — sign and RESOLVE the wave-4 Trade Tariff,
// FULFILL the wave-8 Provisions Order out of the Depot's physical bread,
// pool planks at the vault to pay the Toolwright (all three tiers, goods
// only), let the wave-12 board lapse, ride the wave-16 Toll Concession
// through two halved bounties, meet the greedy-affixed Toll Baron on
// waves 10 and 20, and retire on a pinned score of 22636.
//
// Because EVERY random draw flows through the map's one Park-Miller PRNG
// — and links/pumps/storage draw NOTHING — this whole 159-beat transcript
// is pinned with deepStrictEqual: if ANY beat drifts, this test names it.
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

  // ---- founding: the wood+grain economy, ROUTED to the vault --------------
  assert.ok(sim.global('RUNLOG').startsWith('seed=20260712\n'), 'default seed logged');
  build('h001', -640, -320); // woodcamp
  build('h003', -384, -320); // grainfield
  build('h005', -640, -64);  // sawmill
  build('h006', -384, -64);  // bakery
  sim.chat(0, '-link woodcamp1 sawmill1');
  sim.chat(0, '-link grainfield1 bakery1');
  sim.chat(0, '-link sawmill1 depot');
  sim.chat(0, '-link bakery1 depot');
  assert.strictEqual(call('InvestedOf', 0), 620, 'the founding stake');

  // ---- the scout raid: one killed, one leaks ------------------------------
  sim.advance(46);
  const scouts = raiders();
  assert.strictEqual(scouts.length, 2, '1 + players scouts');
  sim.kill(scouts[0], steward());
  sim.moveUnit(scouts[1], 0, 0);
  assert.strictEqual(sim.global('Lives'), 19, 'the leak is real even in the grace period');
  assert.strictEqual(sim.global('SeedLocked'), false, 'scouts draw no PRNG');

  // ---- first commitment: stall-routed planks lock the seed ----------------
  sim.chat(0, '-link depot stall planks');
  sim.advance(4); // the pumps carry the vault planks to the stall
  assert.strictEqual(call('StockAt', 0, 'stall', 'planks'), 8, 'physically AT the stall');
  sim.chat(0, '-sell planks 8');
  assert.strictEqual(sim.global('SeedLocked'), true, 'the ledger is open');
  sim.chat(0, '-unlink depot stall');

  // ---- waves 1-2: hold the walls; raise a watchtower (rack unrouted) ------
  sim.advance(25); // wave 1 launches at 75s
  assert.strictEqual(sim.global('WaveNumber'), 1);
  killAll();
  build('h009', -256, -448); // watchtower — nothing routes to its rack yet
  sim.advance(46); killAll(); // wave 2

  // ---- wave 3: the dry rack, and STEERING the routes to feed it -----------
  sim.advance(46); // wave 3 in the field
  const tower = sim.findUnit('h009', 0);
  const w3 = raiders();
  assert.strictEqual(sim.damage(tower, w3[0], 25), 0, 'the unrouted rack is born dry');
  sim.chat(0, '-unlink sawmill1 depot');            // the depot route starves the rack
  sim.chat(0, '-link sawmill1 watchtower1 planks'); // the ammo route
  sim.advance(7); // a production tick + one pump second refill it
  assert.strictEqual(call('TowerInertCount', 0), 0, 'the delivery rearmed it');
  assert.strictEqual(sim.damage(tower, w3[0], 25), 25, 'restocked and firing');
  sim.chat(0, '-unlink sawmill1 watchtower1');
  sim.chat(0, '-link sawmill1 depot'); // restore the vault route
  killAll();

  // ---- wave 4: the first contract board — sign the Trade Tariff -----------
  sim.advance(46); killAll();
  sim.chat(0, '-contract a');
  // ---- wave 5: the pact squad rides in; the ore chain goes up -------------
  build('h004', -128, -448); // orepit
  build('h007', -768, -448); // smelter
  sim.chat(0, '-link orepit1 smelter1');
  sim.chat(0, '-link smelter1 depot');
  sim.advance(46); killAll();
  // ---- wave 6: the stone chain (planks input routed FROM the vault) -------
  build('h002', -768, -192); // quarry
  build('h008', -896, -320); // toolworks
  sim.chat(0, '-link quarry1 toolworks1');
  sim.chat(0, '-link toolworks1 depot');
  sim.chat(0, '-link depot toolworks1 planks');
  sim.advance(46); killAll(); // wave 6
  // ---- wave 7, then Toolwright tier 1 (pool planks at the vault first) ----
  sim.advance(46); killAll(); // wave 7
  sim.chat(0, '-unlink depot toolworks1');
  sim.advance(35); // planks pool at the depot through the gap
  sim.chat(0, '-forge buy');
  assert.strictEqual(call('ForgeTierOf', 0), 1, "Toolwright's Bench, paid from the vault");
  sim.chat(0, '-link depot toolworks1 planks');
  sim.advance(11); killAll(); // wave 8

  // ---- wave 8: fulfill the Provisions Order out of the Depot's bread ------
  sim.chat(0, '-contract a'); // 20 bread, lump 90
  assert.ok(call('StockAt', 0, 'depot', 'bread') >= 20, 'the vault holds the consignment');
  sim.chat(0, '-deliver 20');
  assert.strictEqual(sim.global('ContractsDone'), 2, 'tariff resolved + order fulfilled');

  // ---- waves 9-13: the greedy Baron falls, tiers 2 and 3, a lapsed board --
  sim.advance(46); killAll(); // wave 9 (no pact squad: choices never shift the PRNG)
  sim.advance(46); killAll(); // wave 10 — the greedy-affixed Toll Baron
  sim.chat(0, '-forge buy');
  sim.advance(46); killAll(); // wave 11 (skimmers die at the walls)
  sim.advance(46); killAll(); // wave 12 — its board is left to lapse
  sim.advance(46); killAll(); // wave 13
  sim.chat(0, '-forge buy');
  assert.strictEqual(call('ForgeTierOf', 0), 3, 'the ladder is complete');

  // ---- waves 14-16: sign the Toll Concession ------------------------------
  sim.advance(46); killAll(); // wave 14
  sim.advance(46); killAll(); // wave 15
  sim.advance(46); killAll(); // wave 16
  sim.chat(0, '-contract a'); // the Toll Concession

  // ---- waves 17-20: two halved bounties, then the final toll --------------
  sim.advance(46); killAll(); // wave 17 (bounty halved)
  sim.advance(46); killAll(); // wave 18 (bounty halved, pact resolves)
  sim.advance(46); killAll(); // wave 19
  sim.advance(46); killAll(); // wave 20 — two greedy Toll Barons
  assert.strictEqual(sim.global('VictoryPending'), true, 'the twentieth wave breaks');
  sim.advance(65); // the -endless window closes on a retirement
  assert.strictEqual(sim.player(0).result, 'victory');
  assert.strictEqual(sim.global('ScoreFinal'), 22636, 'the pinned score');
  assert.strictEqual(sim.global('Lives'), 19, 'only the scout ever got through');
  assert.strictEqual(sim.global('ContractsDone'), 3);
  assert.strictEqual(sim.global('ContractsFailed'), 0);

  // ---- the whole beat sequence, byte-exact --------------------------------
  const beats = sim.global('RUNLOG').trim().split('\n');
  const expected = [
    'seed=20260712',
    'build|pid=0|woodcamp1',
    'build|pid=0|grainfield1',
    'build|pid=0|sawmill1',
    'build|pid=0|bakery1',
    'link|create|pid=0|woodcamp1>sawmill1',
    'link|create|pid=0|grainfield1>bakery1',
    'link|create|pid=0|sawmill1>depot',
    'link|create|pid=0|bakery1>depot',
    'eat|pid=0|n=3',
    'div|pid=0|gold=16|bonus=27',
    'raid|scouts|n=2',
    'leak|cutpurse|lives=19',
    'link|create|pid=0|depot>stall|planks',
    'seedlock|trade',
    'trade|pid=0|sell|planks|q=8|gold=57',
    'link|cut|pid=0|depot>stall',
    'eat|pid=0|n=3',
    'div|pid=0|gold=22|bonus=27',
    'market|planks|-1%|price=792',
    'wave|start|1|edge=south|cutpurse:6',
    'wave|clear|1|bounty=20',
    'build|pid=0|watchtower1',
    'eat|pid=0|n=3',
    'div|pid=0|gold=49|bonus=27',
    'eat|pid=0|n=3',
    'div|pid=0|gold=55|bonus=27',
    'wave|start|2|edge=south|cutpurse:9',
    'wave|clear|2|bounty=25',
    'eat|pid=0|n=3',
    'div|pid=0|gold=55|bonus=27',
    'wave|start|3|edge=north|cutpurse:5,runner:2',
    'tower|inert|pid=0|watchtower1',
    'link|cut|pid=0|sawmill1>depot',
    'link|create|pid=0|sawmill1>watchtower1|planks',
    'tower|rearmed|pid=0|watchtower1',
    'link|cut|pid=0|sawmill1>watchtower1',
    'link|create|pid=0|sawmill1>depot',
    'wave|clear|3|bounty=30',
    'eat|pid=0|n=3',
    'div|pid=0|gold=55|bonus=27',
    'eat|pid=0|n=3',
    'div|pid=0|gold=55|bonus=27',
    'wave|start|4|edge=north|marauder:3',
    'wave|clear|4|bounty=35',
    'contract|offer|wave=4|a=tariff|b=bread',
    'contract|accept|pid=0|tariff',
    'build|pid=0|orepit1',
    'build|pid=0|smelter1',
    'link|create|pid=0|orepit1>smelter1',
    'link|create|pid=0|smelter1>depot',
    'eat|pid=0|n=3',
    'div|pid=0|gold=81|bonus=30',
    'wave|start|5|edge=south|cutpurse:9,runner:3,pact:marauder:3',
    'wave|clear|5|bounty=40',
    'build|pid=0|quarry1',
    'build|pid=0|toolworks1',
    'link|create|pid=0|quarry1>toolworks1',
    'link|create|pid=0|toolworks1>depot',
    'link|create|pid=0|depot>toolworks1|planks',
    'eat|pid=0|n=3',
    'div|pid=0|gold=103|bonus=32',
    'contract|resolved|tariff',
    'eat|pid=0|n=3',
    'div|pid=0|gold=148|bonus=32',
    'wave|start|6|edge=south|marauder:4,cutpurse:5',
    'wave|clear|6|bounty=45',
    'eat|pid=0|n=3',
    'div|pid=0|gold=148|bonus=32',
    'wave|start|7|edge=south|runner:7',
    'wave|clear|7|bounty=50',
    'link|cut|pid=0|depot>toolworks1',
    'eat|pid=0|n=3',
    'div|pid=0|gold=148|bonus=32',
    'eat|pid=0|n=3',
    'div|pid=0|gold=148|bonus=32',
    'forge|pid=0|tier=1',
    'link|create|pid=0|depot>toolworks1|planks',
    'wave|start|8|edge=south|sapper:3,cutpurse:6',
    'wave|clear|8|bounty=55',
    'contract|offer|wave=8|a=bread|b=tariff',
    'contract|accept|pid=0|bread',
    'contract|deliver|pid=0|bread|n=20|total=20/20',
    'contract|fulfilled|bread|lump=90',
    'eat|pid=0|n=3',
    'div|pid=0|gold=176|bonus=32',
    'wave|start|9|edge=west|marauder:6',
    'eat|pid=0|n=3',
    'div|pid=0|gold=182|bonus=32',
    'wave|clear|9|bounty=60',
    'eat|pid=0|n=3',
    'div|pid=0|gold=182|bonus=32',
    'wave|bossaffix|greedy',
    'wave|start|10|edge=south|baron:1,marauder:2',
    'wave|clear|10|bounty=65',
    'forge|pid=0|tier=2',
    'eat|pid=0|n=3',
    'div|pid=0|gold=226|bonus=32',
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
    'verdict|victory|wave=20|score=22636',
    'eat|pid=0|n=3',
    'div|pid=0|gold=270|bonus=32',
    'eat|pid=0|n=3',
    'div|pid=0|gold=270|bonus=32',
    'gameover|victory',
  ];
  assert.deepStrictEqual(beats, expected, 'the golden run beat sequence is byte-exact');
});
