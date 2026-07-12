'use strict';
// Coinstead economy logic tests, executed headlessly against the PACKED
// war3map.lua (generated constants + CreateAllUnits included) by lib/sim —
// docs/PIPELINE.md §8. Run alone: node tools/test-map-logic.js maps/coinstead
//
// Covered here: map shell (alliances, depot, stewards, start ledgers, the
// shared storage recs), PHYSICAL production (goods stored as item charges
// in the producing building's own 6-slot inventory, refiners eating inputs
// from their own slots, the full-building HALT overflow rule), dividends
// (25% of production UNDERWRITTEN by the Depot reserve, commitment bonus,
// bread eaten from the Depot, stake loss on building death, no idle
// income from cash OR parked goods), the deterministic market (stall-gated
// physical trading, spread math, elasticity, per-cycle move cap, price
// floor clamp, net-flow reset, trade guards), and tower ammo drawn from
// the tower's OWN rack (per-shot draw, inert on empty, rearm on arrival).

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { loadMap } = require('../../../lib/sim');

const MAP = path.join(__dirname, '..');
const USERS = [0, 1, 2, 3];

function scalar(v) { return Array.isArray(v) ? v[0] : v; }
function call(sim, fn, ...args) { return scalar(sim.call(fn, ...args)); }

test('shell: co-op alliances both directions, depot + stall storage recs, one steward per founder, start ledgers', () => {
  const sim = loadMap(MAP);
  for (const i of USERS) {
    for (const j of USERS) {
      if (i === j) continue;
      assert.strictEqual(sim.alliance(i, j, 'ALLIANCE_PASSIVE'), true,
        `Player(${i})->Player(${j}) allied`);
    }
  }
  assert.strictEqual(sim.allUnits('h00B').length, 1, 'one shared Depot');
  assert.strictEqual(sim.allUnits('h00C').length, 1, 'one Market Stall');
  assert.strictEqual(sim.allUnits('h000').length, 4, 'one Steward per founder');
  assert.ok(sim.global('DepotRec'), 'the Depot is a storage rec');
  assert.ok(sim.global('StallRec'), 'the Stall is a storage rec');
  for (const pid of USERS) {
    assert.strictEqual(sim.player(pid).gold, 200, 'start gold');
  }
  assert.strictEqual(sim.global('Lives'), 20, 'start lives');
  assert.strictEqual(sim.global('RunSeed'), 20260712, 'default seed');
});

test('production is PHYSICAL: harvesters store output in their OWN slots; a linked sawmill refines 3 wood -> 1 plank', () => {
  const sim = loadMap(MAP);
  sim.chat(0, '-test');
  sim.chat(0, '-build woodcamp');
  sim.chat(0, '-build sawmill');
  sim.advance(5); // first production tick
  assert.strictEqual(call(sim, 'StockAt', 0, 'woodcamp1', 'wood'), 4, 'output lives at the woodcamp');
  assert.strictEqual(call(sim, 'StockAt', 0, 'sawmill1', 'planks'), 0, 'an unsupplied refiner makes NOTHING');
  sim.chat(0, '-link woodcamp1 sawmill1');
  assert.ok(/link\|create\|pid=0\|woodcamp1>sawmill1/.test(sim.global('RUNLOG')));
  sim.advance(1); // one pump second moves the 4 wood
  assert.strictEqual(call(sim, 'StockAt', 0, 'woodcamp1', 'wood'), 0);
  assert.strictEqual(call(sim, 'StockAt', 0, 'sawmill1', 'wood'), 4);
  sim.advance(4); // t=10 tick: 3 of the 4 wood -> 1 plank (wood produced at t=10 pumps next second)
  assert.strictEqual(call(sim, 'StockAt', 0, 'sawmill1', 'planks'), 1);
  assert.strictEqual(call(sim, 'StockAt', 0, 'sawmill1', 'wood'), 1);
  sim.advance(25); // steady state: 4 wood/tick in, 3 burned per batch
  assert.strictEqual(call(sim, 'StockAt', 0, 'sawmill1', 'planks'), 6, 'a batch every tick from t=10');
  assert.strictEqual(call(sim, 'StockOf', 0, 'planks'), 6, 'StockOf totals all storages');
});

test('every refiner ratio (4 grain->2 bread, 3 ore->1 ingot, 2 stone+1 plank->1 tool), inputs from OWN slots', () => {
  const sim = loadMap(MAP);
  sim.chat(1, '-test');
  sim.chat(1, '-build grainfield');
  sim.chat(1, '-build bakery');
  sim.chat(1, '-build orepit');
  sim.chat(1, '-build smelter');
  sim.chat(1, '-build quarry');
  sim.chat(1, '-build toolworks');
  sim.chat(1, '-link grainfield1 bakery1');
  sim.chat(1, '-link orepit1 smelter1');
  sim.chat(1, '-link quarry1 toolworks1');
  sim.chat(1, '-stock toolworks1 planks 10'); // feed the toolworks its plank input
  sim.advance(6); // tick at t=5 (stores at harvesters), pump at t=6
  assert.strictEqual(call(sim, 'StockAt', 1, 'bakery1', 'grain'), 5, 'grain arrived');
  sim.advance(4); // t=10 tick: refiners convert from their own slots
  assert.strictEqual(call(sim, 'StockAt', 1, 'bakery1', 'bread'), 2, '4 grain -> 2 bread');
  assert.strictEqual(call(sim, 'StockAt', 1, 'bakery1', 'grain'), 1);
  assert.strictEqual(call(sim, 'StockAt', 1, 'smelter1', 'ingots'), 0, '2 ore in, needs 3 (starved)');
  assert.strictEqual(call(sim, 'StockAt', 1, 'toolworks1', 'tools'), 1, '2 stone + 1 plank -> 1 tool');
  assert.strictEqual(call(sim, 'StockAt', 1, 'toolworks1', 'planks'), 9);
  assert.strictEqual(call(sim, 'StockAt', 1, 'toolworks1', 'stone'), 1, '3 stone - 2 fitted');
  sim.advance(5); // t=15: smelter now holds 4 ore -> 1 ingot
  assert.strictEqual(call(sim, 'StockAt', 1, 'smelter1', 'ingots'), 1);
  assert.strictEqual(call(sim, 'StockAt', 1, 'smelter1', 'ore'), 1, '4 ore - 3 smelted');
});

test('refiner starves untouched when inputs are short (no partial conversion)', () => {
  const sim = loadMap(MAP);
  sim.chat(2, '-test');
  sim.chat(2, '-build toolworks');
  sim.chat(2, '-stock toolworks1 stone 2'); // has stone, lacks the plank
  sim.advance(5);
  assert.strictEqual(call(sim, 'StockAt', 2, 'toolworks1', 'stone'), 2, 'inputs untouched');
  assert.strictEqual(call(sim, 'StockAt', 2, 'toolworks1', 'tools'), 0);
});

test('overflow rule: a FULL building HALTS whole batches (no waste), and resumes when a route frees space', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-test');
  sim.chat(0, '-build woodcamp');
  sim.chat(0, '-stock woodcamp1 wood 1200'); // 6 slots x 200: the cap
  assert.strictEqual(call(sim, 'StockAt', 0, 'woodcamp1', 'wood'), 1200, 'capacity is 6 x 200');
  sim.chat(0, '-stock woodcamp1 wood 1300');
  assert.strictEqual(call(sim, 'StockAt', 0, 'woodcamp1', 'wood'), 1200, 'nothing fits past the cap');
  const producedBefore = call(sim, 'StockOf', 0, 'wood');
  sim.advance(10); // two ticks: both batches halt
  assert.strictEqual(call(sim, 'StockOf', 0, 'wood'), producedBefore, 'halted: no output, no waste');
  assert.ok(sim.messagesTo(0).some((m) => /woodcamp1 is FULL -- it halts/.test(m.text)));
  sim.chat(0, '-build sawmill');
  sim.chat(0, '-link woodcamp1 sawmill1'); // the route drains it
  sim.advance(5); // pumps free 5/s; the next tick fits again
  assert.ok(sim.messagesTo(0).some((m) => /woodcamp1 has room again and resumes/.test(m.text)));
  assert.ok(call(sim, 'StockOf', 0, 'wood') > producedBefore, 'production resumed');
});

test('dividends: 25% of produced value UNDERWRITTEN by the Depot reserve; stake and income die with the building', () => {
  const sim = loadMap(MAP);
  sim.chat(0, '-test');
  sim.chat(0, '-build quarry'); // 140g stake -> 0% commitment bonus
  assert.strictEqual(call(sim, 'InvestedOf', 0), 140);
  sim.advance(30);
  // 6 ticks x 3 stone x 300c = 5400c produced — but NOTHING is banked at
  // the Depot, so the underwritten base is min(5400, 0) = 0
  assert.strictEqual(call(sim, 'DividendOf', 0), 0, 'no vault reserve, no dividend');
  assert.strictEqual(sim.player(0).gold, 200);

  // bank 3 ingots (3 x 1800c = 5400c): the reserve now underwrites the full cycle
  sim.chat(0, '-stock ingots 3'); // -stock defaults to the Depot
  sim.advance(30);
  // produced 5400c, reserve 5400c -> base 5400c; 25% = 1350c -> 13g
  assert.strictEqual(call(sim, 'DividendOf', 0), 13);
  assert.strictEqual(sim.player(0).gold, 213);
  assert.ok(sim.messagesTo(0).some((m) => /Dividend: \+13g/.test(m.text)));

  // raise the stake over 400g -> +2% commitment bonus (reserve still caps at 5400c)
  sim.chat(0, '-build orepit');   // +170
  sim.chat(0, '-build smelter');  // +260 -> 570 invested -> 2%
  assert.strictEqual(call(sim, 'InvestedOf', 0), 570);
  sim.advance(30);
  // produced (quarry 5400 + orepit 6000 = 11400c) but reserve 5400c -> base 5400c
  // 25% = 1350c; +2% = 1377c -> 13g
  assert.strictEqual(call(sim, 'DividendOf', 0), 13, 'the reserve CAPS the base');

  // the quarry dies: its 140g stake leaves the ledger with it
  const quarry = sim.findUnit('h002', 0);
  assert.ok(quarry, 'quarry stands');
  sim.kill(quarry);
  assert.strictEqual(call(sim, 'InvestedOf', 0), 430, 'stake lost on death');
  assert.ok(sim.messagesTo(0).some((m) => /quarry1 is rubble/.test(m.text)));
  assert.ok(/building\|lost\|pid=0\|quarry\|stake=430/.test(sim.global('RUNLOG')));
});

test('idle cash AND parked goods earn NOTHING: no production means no dividend, whatever the vault holds', () => {
  const sim = loadMap(MAP);
  sim.chat(3, '-test');
  sim.chat(3, '-stock ingots 100'); // a fat reserve, zero production
  sim.advance(60); // two full cycles inside the grace period
  assert.strictEqual(sim.player(3).gold, 200, 'no interest, no dividend');
  assert.strictEqual(call(sim, 'DividendOf', 3), 0, 'the reserve is a CAP, never a source');
  assert.strictEqual(call(sim, 'StockAt', 3, 'depot', 'ingots'), 100, 'the goods just sit there');
});

test('bread: auto-eaten from the DEPOT at cycle end, capped at 3, each worth +8% dividend', () => {
  const sim = loadMap(MAP);
  sim.chat(0, '-test');
  sim.chat(0, '-build grainfield'); // 100g
  sim.chat(0, '-build bakery');     // 180g -> 280 invested -> 1% commit
  sim.chat(0, '-link grainfield1 bakery1');
  sim.chat(0, '-link bakery1 depot'); // bread must reach the vault to be eaten
  sim.advance(30);
  // production: grain 6 ticks x 5 x 100c = 3000c; bread from t=10 (grain
  // arrives t=6): ticks 10..30 = 5 batches x 2 x 400c = 4000c; total 7000c.
  // At the Depot: bread from batches at t=10..25 arrived (8), t=30's batch
  // pumps next second -> reserve 8 x 400 = 3200c; eat 3 -> reserve 2000c.
  // base = min(7000, 2000) = 2000c; 25% = 500c; bonus = 1% + 24% = 25%
  // -> 625c -> 6g
  assert.strictEqual(call(sim, 'StockAt', 0, 'depot', 'bread'), 5, '8 banked - 3 eaten');
  assert.strictEqual(call(sim, 'DividendOf', 0), 6);
  assert.ok(/eat\|pid=0\|n=3/.test(sim.global('RUNLOG')));
});

test('market: 10% spread both ways, integer gold rounding, goods physically at the stall', () => {
  const sim = loadMap(MAP);
  // wood 2.00g base: buy at 2.20, sell at 1.80
  assert.strictEqual(call(sim, 'PriceOf', 'wood'), 200);
  assert.strictEqual(call(sim, 'BuyGoldFor', 'wood', 10), 22);
  assert.strictEqual(call(sim, 'SellGoldFor', 'wood', 10), 18);
  sim.chat(0, '-buy wood 10');
  assert.strictEqual(sim.player(0).gold, 178);
  assert.strictEqual(call(sim, 'StockAt', 0, 'stall', 'wood'), 10, 'bought goods land AT the stall');
  sim.chat(0, '-sell wood 10');
  assert.strictEqual(sim.player(0).gold, 196, 'the spread costs 4g round-trip');
  assert.strictEqual(call(sim, 'StockAt', 0, 'stall', 'wood'), 0);
  assert.strictEqual(sim.global('MarketProfit'), -4);
});

test('market: elasticity 1% per (8 x players) net units, hard-capped at 5% per cycle', () => {
  const sim = loadMap(MAP); // 4 players -> denominator 32
  sim.chat(0, '-test');
  sim.chat(0, '-stock stall wood 999');
  sim.chat(0, '-sell wood 64'); // net -64 -> exactly 2 steps
  sim.advance(30);
  assert.strictEqual(call(sim, 'PriceOf', 'wood'), 196, '200 - 2% (integer floor)');
  // a dump attempt: net -800 would be 25 steps -> capped at 5%
  sim.chat(0, '-stock stall wood 999');
  sim.chat(0, '-sell wood 800');
  sim.advance(30);
  assert.strictEqual(call(sim, 'PriceOf', 'wood'), 187, '196 - 5% (cap), not -25%');
  assert.ok(/market\|wood\|-5%\|price=187/.test(sim.global('RUNLOG')));
  // quiet cycle: net flow was reset, price holds
  sim.advance(30);
  assert.strictEqual(call(sim, 'PriceOf', 'wood'), 187, 'no flow, no move');
  // buying pressure pushes UP
  sim.chat(1, '-test');
  sim.chat(1, '-gold 5000');
  sim.chat(1, '-buy grain 64'); // +64 -> +2%
  sim.advance(30);
  assert.strictEqual(call(sim, 'PriceOf', 'grain'), 102);
});

test('market: price clamps at the 25%-of-base floor under sustained dumping', () => {
  const sim = loadMap(MAP, { users: [0] }); // solo: denominator 8
  sim.chat(0, '-test');
  for (let i = 0; i < 40; i++) {
    sim.chat(0, '-stock stall grain 999');
    sim.chat(0, '-sell grain 200'); // 25 steps -> capped 5% every cycle
    sim.advance(30);
  }
  assert.strictEqual(call(sim, 'PriceOf', 'grain'), 25, 'floor = 25% of 100c base');
});

test('market: zero randomness — identical trades give identical prices across runs', () => {
  const run = () => {
    const sim = loadMap(MAP);
    sim.chat(0, '-test');
    sim.chat(0, '-stock stall ore 500');
    sim.chat(0, '-sell ore 100');
    sim.chat(1, '-test');
    sim.chat(1, '-gold 9000');
    sim.chat(1, '-buy planks 80');
    sim.advance(30);
    return ['wood', 'ore', 'planks', 'ingots'].map((k) => call(sim, 'PriceOf', k)).join(',');
  };
  assert.strictEqual(run(), run());
});

test('trade guards: unknown good, zero qty, no stock at the stall, underfunded buy, no stall space', () => {
  const sim = loadMap(MAP);
  sim.chat(0, '-buy mithril 5');
  assert.ok(sim.messagesTo(0).some((m) => /No such good/.test(m.text)));
  sim.chat(0, '-buy wood 0');
  assert.ok(sim.messagesTo(0).some((m) => /Quantity must be 1-999/.test(m.text)));
  sim.chat(0, '-sell wood 5');
  assert.ok(sim.messagesTo(0).some((m) => /You hold 0 Wood AT THE STALL/.test(m.text)),
    'selling needs goods physically at the stall');
  sim.chat(0, '-buy ingots 999');
  assert.ok(sim.messagesTo(0).some((m) => /you are short/.test(m.text)));
  assert.strictEqual(sim.player(0).gold, 200, 'nothing charged on refused trades');
  assert.strictEqual(sim.global('SeedLocked'), false, 'refused trades do not lock the seed');

  // fill all 6 stall slots with other goods: a buy with no room is refused
  sim.chat(0, '-test');
  for (const good of ['wood', 'stone', 'ore', 'planks', 'bread', 'tools']) {
    sim.chat(0, `-stock stall ${good} 200`);
  }
  sim.chat(0, '-gold 500');
  sim.chat(0, '-buy grain 10');
  assert.ok(sim.messagesTo(0).some((m) => /room for only 0 more Grain/.test(m.text)),
    'bought goods must fit at the stall');
  assert.strictEqual(sim.player(0).gold, 500, 'refused buy charges nothing');
});

test('ammo: each shot burns 1 unit from the TOWER\'S OWN rack; empty rack zeroes the shot and the tower goes INERT; arrivals rearm', () => {
  const sim = loadMap(MAP);
  sim.chat(0, '-test');
  sim.chat(0, '-build watchtower');
  sim.chat(0, '-stock watchtower1 planks 2');
  const tower = sim.findUnit('h009', 0);
  assert.ok(tower, 'watchtower stands');
  const raider = sim.createUnit(23, 'n001', 100, 100, 0); // sturdy target
  const before = raider.life;

  assert.strictEqual(sim.damage(tower, raider, 30), 30, 'shot 1 lands');
  assert.strictEqual(call(sim, 'StockAt', 0, 'watchtower1', 'planks'), 1);
  assert.strictEqual(sim.damage(tower, raider, 30), 30, 'shot 2 lands');
  assert.strictEqual(call(sim, 'StockAt', 0, 'watchtower1', 'planks'), 0);
  assert.strictEqual(raider.life, before - 60);

  // dry: the shot is zeroed and the tower pauses
  assert.strictEqual(sim.damage(tower, raider, 30), 0, 'dry shot zeroed');
  assert.strictEqual(raider.life, before - 60, 'no damage applied');
  assert.strictEqual(call(sim, 'TowerInertCount', 0), 1);
  assert.ok(sim.messagesTo(0).some((m) => /run dry of planks.*INERT/.test(m.text)));
  assert.ok(/tower\|inert\|pid=0\|watchtower1/.test(sim.global('RUNLOG')));
  assert.ok(sim.callsOf('PauseUnit').some((c) => c.args[1] === true), 'tower paused');

  // charges arriving in the rack rearm it (and the cannon draws ingots, not planks)
  sim.chat(0, '-stock watchtower1 planks 5');
  assert.strictEqual(call(sim, 'TowerInertCount', 0), 0);
  assert.ok(/tower\|rearmed\|pid=0\|watchtower1/.test(sim.global('RUNLOG')));
  assert.strictEqual(sim.damage(tower, raider, 30), 30, 'firing again');

  sim.chat(0, '-build cannontower');
  sim.chat(0, '-stock cannontower1 ingots 1');
  const cannon = sim.findUnit('h00A', 0);
  assert.strictEqual(sim.damage(cannon, raider, 40), 40);
  assert.strictEqual(call(sim, 'StockAt', 0, 'cannontower1', 'ingots'), 0, 'cannon burned the ingot');
  assert.strictEqual(call(sim, 'StockAt', 0, 'watchtower1', 'planks'), 4, 'the watchtower rack untouched by the cannon');
});

test('a dry tower rearms when a ROUTE pumps ammo into its rack', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-test');
  sim.chat(0, '-build watchtower');
  sim.chat(0, '-build sawmill');
  const tower = sim.findUnit('h009', 0);
  const raider = sim.createUnit(23, 'n001', 100, 100, 0);
  assert.strictEqual(sim.damage(tower, raider, 25), 0, 'born dry');
  assert.strictEqual(call(sim, 'TowerInertCount', 0), 1);
  sim.chat(0, '-stock sawmill1 planks 6');
  sim.chat(0, '-link sawmill1 watchtower1 planks');
  sim.advance(1); // one pump second delivers 5 planks
  assert.strictEqual(call(sim, 'TowerInertCount', 0), 0, 'the delivery rearmed it');
  assert.strictEqual(call(sim, 'StockAt', 0, 'watchtower1', 'planks'), 5);
  assert.strictEqual(sim.damage(tower, raider, 25), 25, 'firing again');
});

test('non-tower damage never draws ammo (raiders hitting buildings pass through the same event)', () => {
  const sim = loadMap(MAP);
  sim.chat(0, '-test');
  sim.chat(0, '-build woodcamp');
  sim.chat(0, '-stock woodcamp1 planks 3');
  const camp = sim.findUnit('h001', 0);
  const raider = sim.createUnit(23, 'n000', 200, 200, 0);
  assert.strictEqual(sim.damage(raider, camp, 25), 25, 'raider damage lands in full');
  assert.strictEqual(call(sim, 'StockAt', 0, 'woodcamp1', 'planks'), 3, 'no ammo drawn');
});

test('construct-finish registers a building through the engine path (stake + named store + production)', () => {
  const sim = loadMap(MAP);
  const camp = sim.createUnit(2, 'h001', 600, 600, 0);
  sim.constructFinish(camp);
  assert.strictEqual(call(sim, 'InvestedOf', 2), 120);
  assert.ok(/build\|pid=2\|woodcamp1/.test(sim.global('RUNLOG')), 'the beat carries the building name');
  sim.advance(5);
  assert.strictEqual(call(sim, 'StockAt', 2, 'woodcamp1', 'wood'), 4);
});
