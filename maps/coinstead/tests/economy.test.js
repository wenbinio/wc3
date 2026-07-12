'use strict';
// Coinstead economy logic tests, executed headlessly against the PACKED
// war3map.lua (generated constants + CreateAllUnits included) by lib/sim —
// docs/PIPELINE.md §8. Run alone: node tools/test-map-logic.js maps/coinstead
//
// Covered here: map shell (alliances, depot, stewards, start ledgers),
// production tick math, refiner conversion ratios (all four), dividends
// (25% of production, commitment bonus, bread auto-eat cap, stake loss on
// building death, no idle interest), the deterministic market (spread math,
// elasticity, per-cycle move cap, price floor clamp, net-flow reset,
// trade guards), and tower ammo (per-shot draw, inert on empty, rearm).

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { loadMap } = require('../../../lib/sim');

const MAP = path.join(__dirname, '..');
const USERS = [0, 1, 2, 3];

function scalar(v) { return Array.isArray(v) ? v[0] : v; }
function call(sim, fn, ...args) { return scalar(sim.call(fn, ...args)); }

test('shell: co-op alliances both directions, depot + one steward per founder, start ledgers', () => {
  const sim = loadMap(MAP);
  for (const i of USERS) {
    for (const j of USERS) {
      if (i === j) continue;
      assert.strictEqual(sim.alliance(i, j, 'ALLIANCE_PASSIVE'), true,
        `Player(${i})->Player(${j}) allied`);
    }
  }
  assert.strictEqual(sim.allUnits('h00B').length, 1, 'one shared Depot');
  assert.strictEqual(sim.allUnits('h000').length, 4, 'one Steward per founder');
  for (const pid of USERS) {
    assert.strictEqual(sim.player(pid).gold, 200, 'start gold');
  }
  assert.strictEqual(sim.global('Lives'), 20, 'start lives');
  assert.strictEqual(sim.global('RunSeed'), 20260712, 'default seed');
});

test('production: harvester rates and the sawmill 3 wood -> 1 plank ratio', () => {
  const sim = loadMap(MAP);
  sim.chat(0, '-test');
  sim.chat(0, '-build woodcamp');
  sim.chat(0, '-build sawmill');
  sim.advance(5); // one production tick
  // tick: +4 wood, sawmill takes 3 -> 1 plank
  assert.strictEqual(call(sim, 'StockOf', 0, 'wood'), 1);
  assert.strictEqual(call(sim, 'StockOf', 0, 'planks'), 1);
  sim.advance(25); // six ticks total (t=30)
  assert.strictEqual(call(sim, 'StockOf', 0, 'wood'), 6);
  assert.strictEqual(call(sim, 'StockOf', 0, 'planks'), 6);
});

test('production: every refiner ratio (4 grain->2 bread, 3 ore->1 ingot, 2 stone+1 plank->1 tool)', () => {
  const sim = loadMap(MAP);
  sim.chat(1, '-test');
  sim.chat(1, '-build grainfield');
  sim.chat(1, '-build bakery');
  sim.chat(1, '-build orepit');
  sim.chat(1, '-build smelter');
  sim.chat(1, '-build quarry');
  sim.chat(1, '-build toolworks');
  sim.chat(1, '-stock planks 10'); // feed the toolworks its plank input
  sim.advance(5);
  assert.strictEqual(call(sim, 'StockOf', 1, 'grain'), 1, '5 grain - 4 eaten by bakery');
  assert.strictEqual(call(sim, 'StockOf', 1, 'bread'), 2);
  assert.strictEqual(call(sim, 'StockOf', 1, 'ore'), 2, '+2 ore, smelter needs 3 (starved)');
  assert.strictEqual(call(sim, 'StockOf', 1, 'ingots'), 0);
  assert.strictEqual(call(sim, 'StockOf', 1, 'stone'), 1, '3 stone - 2 to toolworks');
  assert.strictEqual(call(sim, 'StockOf', 1, 'tools'), 1);
  assert.strictEqual(call(sim, 'StockOf', 1, 'planks'), 9, 'toolworks burned 1 plank');
  sim.advance(5); // second tick: ore hits 4 -> smelter fires
  assert.strictEqual(call(sim, 'StockOf', 1, 'ore'), 1, '4 ore - 3 smelted');
  assert.strictEqual(call(sim, 'StockOf', 1, 'ingots'), 1);
});

test('refiner starves untouched when inputs are short (no partial conversion)', () => {
  const sim = loadMap(MAP);
  sim.chat(2, '-test');
  sim.chat(2, '-build toolworks');
  sim.chat(2, '-stock stone 2'); // has stone, lacks the plank
  sim.advance(5);
  assert.strictEqual(call(sim, 'StockOf', 2, 'stone'), 2, 'inputs untouched');
  assert.strictEqual(call(sim, 'StockOf', 2, 'tools'), 0);
});

test('dividends: 25% of produced value, +1%/200g standing stake; stake and income die with the building', () => {
  const sim = loadMap(MAP);
  sim.chat(0, '-test');
  sim.chat(0, '-build quarry'); // 140g stake -> 0% commitment bonus
  assert.strictEqual(call(sim, 'InvestedOf', 0), 140);
  sim.advance(30);
  // 6 ticks x 3 stone x 300c = 5400c produced; 25% = 1350c -> 13g
  assert.strictEqual(call(sim, 'DividendOf', 0), 13);
  assert.strictEqual(sim.player(0).gold, 213);
  assert.ok(sim.messagesTo(0).some((m) => /Dividend: \+13g/.test(m.text)));

  // raise the stake over 400g -> +2% commitment bonus
  sim.chat(0, '-build orepit');   // +170
  sim.chat(0, '-build smelter');  // +260 -> 570 invested -> 2%
  assert.strictEqual(call(sim, 'InvestedOf', 0), 570);
  sim.advance(30);
  // quarry 5400c + orepit 6 x 2 x 500c = 6000c; the smelter fires whenever
  // ore >= 3 (ticks 2,3,5,6 of the cycle) = 4 x 1800c = 7200c; total 18600c
  // 25% = 4650c; +2% = 4743c -> 47g
  assert.strictEqual(call(sim, 'DividendOf', 0), 47);

  // the quarry dies: its 140g stake leaves the ledger with it
  const quarry = sim.findUnit('h002', 0);
  assert.ok(quarry, 'quarry stands');
  sim.kill(quarry);
  assert.strictEqual(call(sim, 'InvestedOf', 0), 430, 'stake lost on death');
  assert.ok(sim.messagesTo(0).some((m) => /quarry is rubble/.test(m.text)));
  assert.ok(/building\|lost\|pid=0\|quarry\|stake=430/.test(sim.global('RUNLOG')));
  sim.advance(30);
  // orepit 6000c + smelter ticks... ore continues; without quarry no stone value
  assert.ok(call(sim, 'DividendOf', 0) < 47, 'income falls with the dead building');
});

test('idle cash earns NOTHING: a founder with no production sees no income over cycles', () => {
  const sim = loadMap(MAP);
  sim.advance(60); // two full cycles inside the grace period
  assert.strictEqual(sim.player(3).gold, 200, 'no interest, no dividend');
  assert.strictEqual(call(sim, 'DividendOf', 3), 0);
});

test('bread: auto-eaten at cycle end, capped at 3, each worth +8% dividend', () => {
  const sim = loadMap(MAP);
  sim.chat(0, '-test');
  sim.chat(0, '-build grainfield'); // 100g
  sim.chat(0, '-build bakery');     // 180g -> 280 invested -> 1% commit
  sim.advance(30);
  // per tick: 5 grain x 100c + 2 bread x 400c = 1300c; x6 = 7800c
  // 25% = 1950c; bonus = 1% commit + 24% bread = 25% -> 2437c -> 24g
  assert.strictEqual(call(sim, 'StockOf', 0, 'bread'), 9, '12 baked - 3 eaten');
  assert.strictEqual(call(sim, 'DividendOf', 0), 24);
  assert.ok(/eat\|pid=0\|n=3/.test(sim.global('RUNLOG')));
});

test('market: 10% spread both ways, integer gold rounding against the trader', () => {
  const sim = loadMap(MAP);
  // wood 2.00g base: buy at 2.20, sell at 1.80
  assert.strictEqual(call(sim, 'PriceOf', 'wood'), 200);
  assert.strictEqual(call(sim, 'BuyGoldFor', 'wood', 10), 22);
  assert.strictEqual(call(sim, 'SellGoldFor', 'wood', 10), 18);
  sim.chat(0, '-buy wood 10');
  assert.strictEqual(sim.player(0).gold, 178);
  assert.strictEqual(call(sim, 'StockOf', 0, 'wood'), 10);
  sim.chat(0, '-sell wood 10');
  assert.strictEqual(sim.player(0).gold, 196, 'the spread costs 4g round-trip');
  assert.strictEqual(sim.global('MarketProfit'), -4);
});

test('market: elasticity 1% per (8 x players) net units, hard-capped at 5% per cycle', () => {
  const sim = loadMap(MAP); // 4 players -> denominator 32
  sim.chat(0, '-test');
  sim.chat(0, '-stock wood 999');
  sim.chat(0, '-sell wood 64'); // net -64 -> exactly 2 steps
  sim.advance(30);
  assert.strictEqual(call(sim, 'PriceOf', 'wood'), 196, '200 - 2% (integer floor)');
  // a dump attempt: net -800 would be 25 steps -> capped at 5%
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
    sim.chat(0, '-stock grain 999');
    sim.chat(0, '-sell grain 200'); // 25 steps -> capped 5% every cycle
    sim.advance(30);
  }
  assert.strictEqual(call(sim, 'PriceOf', 'grain'), 25, 'floor = 25% of 100c base');
});

test('market: zero randomness — identical trades give identical prices across runs', () => {
  const run = () => {
    const sim = loadMap(MAP);
    sim.chat(0, '-test');
    sim.chat(0, '-stock ore 500');
    sim.chat(0, '-sell ore 100');
    sim.chat(1, '-test');
    sim.chat(1, '-gold 9000');
    sim.chat(1, '-buy planks 80');
    sim.advance(30);
    return ['wood', 'ore', 'planks', 'ingots'].map((k) => call(sim, 'PriceOf', k)).join(',');
  };
  assert.strictEqual(run(), run());
});

test('trade guards: unknown good, zero qty, overdrawn sell, underfunded buy', () => {
  const sim = loadMap(MAP);
  sim.chat(0, '-buy mithril 5');
  assert.ok(sim.messagesTo(0).some((m) => /No such good/.test(m.text)));
  sim.chat(0, '-buy wood 0');
  assert.ok(sim.messagesTo(0).some((m) => /Quantity must be 1-999/.test(m.text)));
  sim.chat(0, '-sell wood 5');
  assert.ok(sim.messagesTo(0).some((m) => /cannot sell 5/.test(m.text)));
  sim.chat(0, '-buy ingots 999');
  assert.ok(sim.messagesTo(0).some((m) => /you are short/.test(m.text)));
  assert.strictEqual(sim.player(0).gold, 200, 'nothing charged on refused trades');
  assert.strictEqual(sim.global('SeedLocked'), false, 'refused trades do not lock the seed');
});

test('ammo: each tower shot burns 1 unit; empty rack zeroes the shot and the tower goes INERT; restock rearms', () => {
  const sim = loadMap(MAP);
  sim.chat(0, '-test');
  sim.chat(0, '-build watchtower');
  sim.chat(0, '-stock planks 2');
  const tower = sim.findUnit('h009', 0);
  assert.ok(tower, 'watchtower stands');
  const raider = sim.createUnit(23, 'n001', 100, 100, 0); // sturdy target
  const before = raider.life;

  assert.strictEqual(sim.damage(tower, raider, 30), 30, 'shot 1 lands');
  assert.strictEqual(call(sim, 'StockOf', 0, 'planks'), 1);
  assert.strictEqual(sim.damage(tower, raider, 30), 30, 'shot 2 lands');
  assert.strictEqual(call(sim, 'StockOf', 0, 'planks'), 0);
  assert.strictEqual(raider.life, before - 60);

  // dry: the shot is zeroed and the tower pauses
  assert.strictEqual(sim.damage(tower, raider, 30), 0, 'dry shot zeroed');
  assert.strictEqual(raider.life, before - 60, 'no damage applied');
  assert.strictEqual(call(sim, 'TowerInertCount', 0), 1);
  assert.ok(sim.messagesTo(0).some((m) => /run dry of planks.*INERT/.test(m.text)));
  assert.ok(/tower\|inert\|pid=0\|watchtower/.test(sim.global('RUNLOG')));
  assert.ok(sim.callsOf('PauseUnit').some((c) => c.args[1] === true), 'tower paused');

  // restock -> rearm (and the cannon tower draws ingots, not planks)
  sim.chat(0, '-stock planks 5');
  assert.strictEqual(call(sim, 'TowerInertCount', 0), 0);
  assert.ok(/tower\|rearmed\|pid=0\|watchtower/.test(sim.global('RUNLOG')));
  assert.strictEqual(sim.damage(tower, raider, 30), 30, 'firing again');

  sim.chat(0, '-build cannontower');
  sim.chat(0, '-stock ingots 1');
  const cannon = sim.findUnit('h00A', 0);
  assert.strictEqual(sim.damage(cannon, raider, 40), 40);
  assert.strictEqual(call(sim, 'StockOf', 0, 'ingots'), 0, 'cannon burned the ingot');
  assert.strictEqual(call(sim, 'StockOf', 0, 'planks'), 4, 'planks untouched by the cannon (4 left after the rearmed shot)');
});

test('non-tower damage never draws ammo (raiders hitting buildings pass through the same event)', () => {
  const sim = loadMap(MAP);
  sim.chat(0, '-test');
  sim.chat(0, '-build woodcamp');
  sim.chat(0, '-stock planks 3');
  const camp = sim.findUnit('h001', 0);
  const raider = sim.createUnit(23, 'n000', 200, 200, 0);
  assert.strictEqual(sim.damage(raider, camp, 25), 25, 'raider damage lands in full');
  assert.strictEqual(call(sim, 'StockOf', 0, 'planks'), 3, 'no ammo drawn');
});

test('construct-finish registers a building through the engine path (stake + production)', () => {
  const sim = loadMap(MAP);
  const camp = sim.createUnit(2, 'h001', 600, 600, 0);
  sim.constructFinish(camp);
  assert.strictEqual(call(sim, 'InvestedOf', 2), 120);
  assert.ok(/build\|pid=2\|woodcamp/.test(sim.global('RUNLOG')));
  sim.advance(5);
  assert.strictEqual(call(sim, 'StockOf', 2, 'wood'), 4);
});
