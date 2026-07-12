'use strict';
// Coinstead phase-2 content tests (lib/sim, docs/PIPELINE.md §8): the
// Toolwright upgrade ladder (3 tiers paid in commodities, never gold),
// the seeded contract board (delivery consignments, the Trade Tariff, the
// Toll Concession; offer/accept/deliver/fulfilled/failed/resolved/lapsed
// beats), the Tollman Skimmer's purse-skimming leak, and the seeded boss
// affixes (ironclad/swift/greedy). Seeds used to pin specific draws:
// default 20260712 -> wave-10 affix "swift", wave-4 offer bread+tariff;
// seed 1 -> ironclad; seed 5 -> greedy and a wave-4 toll offer.

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

// ---------------------------------------------------------- the Toolwright

test('forge: tier 1 is paid in goods (never gold) and makes every harvester yield +1', () => {
  const sim = loadMap(MAP);
  sim.chat(0, '-forge');
  assert.ok(sim.messagesTo(0).some((m) => /your tier: 0\/3/.test(m.text)));
  assert.ok(sim.messagesTo(0).some((m) => /Toolwright's Bench.*next: '-forge buy' for 4 tools \+ 6 planks/.test(m.text)));

  sim.chat(0, '-test');
  sim.chat(0, '-build woodcamp');
  sim.chat(0, '-forge buy');
  assert.ok(sim.messagesTo(0).some((m) => /you are short of tools/.test(m.text)),
    'refused without the goods');
  assert.strictEqual(call(sim, 'ForgeTierOf', 0), 0);

  sim.chat(0, '-stock tools 4');
  sim.chat(0, '-stock planks 6');
  const goldBefore = sim.player(0).gold;
  sim.chat(0, '-forge buy');
  assert.strictEqual(call(sim, 'ForgeTierOf', 0), 1);
  assert.strictEqual(call(sim, 'StockOf', 0, 'tools'), 0, 'tools spent');
  assert.strictEqual(call(sim, 'StockOf', 0, 'planks'), 0, 'planks spent');
  assert.strictEqual(sim.player(0).gold, goldBefore, 'no gold changed hands');
  assert.ok(/forge\|pid=0\|tier=1/.test(sim.global('RUNLOG')));
  sim.advance(5);
  assert.strictEqual(call(sim, 'StockOf', 0, 'wood'), 5, 'Bench: 4+1 wood per tick');

  sim.chat(0, '-eco');
  assert.ok(sim.messagesTo(0).some((m) => /Toolwright:.*tier 1.*Bench/.test(m.text)));
});

test('forge: tier 2 makes every refiner batch yield +1; the ladder tops out at 3', () => {
  const sim = loadMap(MAP);
  sim.chat(1, '-test');
  sim.chat(1, '-build sawmill');
  sim.chat(1, '-stock tools 12');
  sim.chat(1, '-stock planks 6');
  sim.chat(1, '-stock ingots 4');
  sim.chat(1, '-forge buy'); // tier 1 (4 tools + 6 planks)
  sim.chat(1, '-forge buy'); // tier 2 (8 tools + 4 ingots)
  assert.strictEqual(call(sim, 'ForgeTierOf', 1), 2);
  sim.chat(1, '-stock sawmill1 wood 3'); // inputs live in the refiner's own slots
  sim.advance(5);
  assert.strictEqual(call(sim, 'StockAt', 1, 'sawmill1', 'planks'), 2, 'Works: 1+1 planks per batch');
  assert.strictEqual(call(sim, 'StockAt', 1, 'sawmill1', 'wood'), 0, 'inputs unchanged (3 wood in)');

  sim.chat(1, '-stock tools 12');
  sim.chat(1, '-stock ingots 8');
  sim.chat(1, '-forge buy'); // tier 3
  assert.strictEqual(call(sim, 'ForgeTierOf', 1), 3);
  sim.chat(1, '-forge buy');
  assert.ok(sim.messagesTo(1).some((m) => /nothing left to teach/.test(m.text)));
  assert.strictEqual(call(sim, 'ForgeTierOf', 1), 3, 'the ladder is bounded');
});

test("forge: tier 3 Charter burns ammo only every SECOND shot; a dry rack still goes inert", () => {
  const sim = loadMap(MAP);
  sim.chat(0, '-test');
  sim.chat(0, '-build watchtower');
  sim.chat(0, '-stock tools 24');
  sim.chat(0, '-stock planks 6');
  sim.chat(0, '-stock ingots 12');
  sim.chat(0, '-forge buy');
  sim.chat(0, '-forge buy');
  sim.chat(0, '-forge buy');
  assert.strictEqual(call(sim, 'ForgeTierOf', 0), 3);
  sim.chat(0, '-stock watchtower1 planks 2'); // ammo lives in the tower's own rack
  const tower = sim.findUnit('h009', 0);
  const raider = sim.createUnit(23, 'n001', 100, 100, 0);
  assert.strictEqual(sim.damage(tower, raider, 20), 20, 'shot 1 burns');
  assert.strictEqual(call(sim, 'StockAt', 0, 'watchtower1', 'planks'), 1);
  assert.strictEqual(sim.damage(tower, raider, 20), 20, 'shot 2 is the free one');
  assert.strictEqual(call(sim, 'StockAt', 0, 'watchtower1', 'planks'), 1, 'no plank drawn');
  assert.strictEqual(sim.damage(tower, raider, 20), 20, 'shot 3 burns');
  assert.strictEqual(call(sim, 'StockAt', 0, 'watchtower1', 'planks'), 0);
  assert.strictEqual(sim.damage(tower, raider, 20), 20, 'shot 4 free');
  assert.strictEqual(sim.damage(tower, raider, 20), 0, 'shot 5 wants a plank: dry, zeroed');
  assert.strictEqual(call(sim, 'TowerInertCount', 0), 1, 'inert still applies under the Charter');
});

test('forge: each forged tier scores 100 in the forge component', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-test');
  sim.chat(0, '-stock tools 4');
  sim.chat(0, '-stock planks 6');
  sim.chat(0, '-forge buy');
  const score = sim.call('ComputeScore');
  assert.strictEqual(score[6], 100, 'forge component');
  assert.strictEqual(score[7], 0, 'pact component untouched');
});

// ------------------------------------------------------- the Tollman Skimmer

test('skimmer: rides wave 11 and a leak skims 25g from EVERY founder (clamped at 0)', () => {
  const sim = loadMap(MAP);
  sim.chat(0, '-test');
  sim.chat(0, '-wavejump 11');
  sim.advance(2);
  const skimmers = raidersOf(sim, 'n005');
  assert.strictEqual(skimmers.length, 6, 'ceil(3 x 1.75) at 4 players, no jitter (not swarm)');
  sim.chat(1, '-test');
  sim.chat(1, '-gold 10');
  sim.moveUnit(skimmers[0], 0, 0); // into the Depot core
  assert.strictEqual(sim.global('Lives'), 19, 'a skimmer leak still costs 1 life');
  assert.strictEqual(sim.player(0).gold, 175, '200 - 25 skimmed');
  assert.strictEqual(sim.player(1).gold, 0, 'clamped at zero, never negative');
  assert.ok(/leak\|skimmer\|lives=19/.test(sim.global('RUNLOG')));
  assert.ok(/steal\|gold=25/.test(sim.global('RUNLOG')));
  assert.ok(sim.messagesMatching(/Skimmer makes off with 25g/).length > 0);
});

// ------------------------------------------------------------- boss affixes

test('boss affix (default seed, wave 10): swift — move speed pushed, hp untouched', () => {
  const sim = loadMap(MAP);
  sim.chat(0, '-test');
  sim.chat(0, '-wavejump 10');
  sim.advance(2);
  assert.ok(/wave\|bossaffix\|swift/.test(sim.global('RUNLOG')));
  assert.ok(sim.callsOf('SetUnitMoveSpeed').some((c) => c.args[1] === 340),
    'swift baron pushed to 340 move speed');
  assert.ok(sim.callsOf('BlzSetUnitMaxHP').some((c) => c.args[1] === 3850),
    'swift leaves the wave-10 hp at 2500 x 1.54');
  assert.ok(sim.messagesMatching(/swift TOLL BARON rides with wave 10/).length > 0);
});

test('boss affix (seed 1): ironclad — +35% hp on the baron', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-seed 1');
  sim.chat(0, '-test');
  sim.chat(0, '-wavejump 10');
  sim.advance(2);
  assert.ok(/wave\|bossaffix\|ironclad/.test(sim.global('RUNLOG')));
  assert.ok(sim.callsOf('BlzSetUnitMaxHP').some((c) => c.args[1] === 5197),
    '3850 x 1.35 (integer floor)');
});

test('boss affix (seed 5): greedy — leak costs 7 lives but the kill pays 250', () => {
  let sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-seed 5');
  sim.chat(0, '-test');
  sim.chat(0, '-wavejump 10');
  sim.advance(2);
  assert.ok(/wave\|bossaffix\|greedy/.test(sim.global('RUNLOG')));
  const baron = raidersOf(sim, 'n004')[0];
  sim.moveUnit(baron, 0, 0);
  assert.strictEqual(sim.global('Lives'), 13, '20 - 7 (greedy leak)');

  sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-seed 5');
  sim.chat(0, '-test');
  sim.chat(0, '-wavejump 10');
  sim.advance(2);
  const steward = sim.findUnit('h000', 0);
  const gold = sim.player(0).gold;
  sim.kill(raidersOf(sim, 'n004')[0], steward);
  assert.strictEqual(sim.player(0).gold, gold + 250, 'greedy bounty');
});

// ---------------------------------------------------------------- contracts

test('contracts: a seeded pair is posted after every 4th wave; the board lapses at the next launch', () => {
  const sim = loadMap(MAP);
  sim.chat(0, '-test');
  sim.chat(0, '-contract');
  assert.ok(sim.messagesTo(0).some((m) => /No contracts on the board/.test(m.text)));
  sim.chat(0, '-wavejump 3');
  sim.advance(2);
  sim.chat(0, '-clearwave');
  assert.ok(!/contract\|offer/.test(sim.global('RUNLOG')), 'wave 3 posts nothing');
  sim.chat(0, '-wavejump 4');
  sim.advance(2);
  sim.chat(0, '-clearwave');
  const offer = sim.global('RUNLOG').match(/contract\|offer\|wave=4\|a=(\w+)\|b=(\w+)/);
  assert.ok(offer, 'wave 4 posts the board');
  assert.notStrictEqual(offer[1], offer[2], 'the two seeded templates are distinct');
  sim.chat(0, '-contract');
  assert.ok(sim.messagesTo(0).some((m) => /-contract a: /.test(m.text)), 'the board reads back');
  sim.advance(46); // wave 5 launches, unsigned board clears
  assert.ok(/contract\|lapsed\|wave=4/.test(sim.global('RUNLOG')));
  sim.chat(0, '-contract');
  assert.ok(sim.messagesTo(0).some((m) => /No contracts on the board/.test(m.text)));
});

test('delivery contract: -deliver draws from YOUR stock, fulfillment pays the lump to every founder', () => {
  const sim = loadMap(MAP);
  sim.chat(0, '-test');
  sim.chat(0, '-deliver 5');
  assert.ok(sim.messagesTo(0).some((m) => /No delivery contract is open/.test(m.text)));
  sim.chat(0, '-wavejump 4');
  sim.advance(2);
  sim.chat(0, '-clearwave');
  sim.chat(0, '-contract a'); // Provisions Order: 20 bread by wave 7, lump 90
  assert.ok(/contract\|accept\|pid=0\|bread/.test(sim.global('RUNLOG')));
  sim.chat(0, '-contract b');
  assert.ok(sim.messagesTo(0).some((m) => /Nothing is on the board/.test(m.text)),
    'accepting clears the board for everyone');

  sim.chat(0, '-deliver 0');
  assert.ok(sim.messagesTo(0).some((m) => /Quantity must be 1-999/.test(m.text)));
  sim.chat(0, '-deliver 5');
  assert.ok(sim.messagesTo(0).some((m) => /You hold no bread/.test(m.text)));
  sim.chat(0, '-stock bread 12');
  sim.chat(0, '-deliver 12');
  assert.ok(/contract\|deliver\|pid=0\|bread\|n=12\|total=12\/20/.test(sim.global('RUNLOG')));
  assert.strictEqual(call(sim, 'StockOf', 0, 'bread'), 0, 'delivered goods leave the stock');
  sim.chat(0, '-contract');
  assert.ok(sim.messagesTo(0).some((m) => /12\/20 bread delivered/.test(m.text)));

  const g0 = sim.player(0).gold, g3 = sim.player(3).gold;
  sim.chat(0, '-stock bread 99');
  sim.chat(0, '-deliver 999'); // clamped to the 8 remaining
  assert.ok(/contract\|deliver\|pid=0\|bread\|n=8\|total=20\/20/.test(sim.global('RUNLOG')));
  assert.ok(/contract\|fulfilled\|bread\|lump=90/.test(sim.global('RUNLOG')));
  assert.strictEqual(sim.player(0).gold, g0 + 90);
  assert.strictEqual(sim.player(3).gold, g3 + 90, 'every founder gets the lump');
  assert.strictEqual(call(sim, 'StockOf', 0, 'bread'), 91, 'only the 8 needed were taken');
  const score = sim.call('ComputeScore');
  assert.strictEqual(score[7], 75, 'a fulfilled contract scores +75 in pacts');
});

test('delivery contract: missing the deadline fails it (and costs score)', () => {
  const sim = loadMap(MAP);
  sim.chat(0, '-test');
  sim.chat(0, '-wavejump 4');
  sim.advance(2);
  sim.chat(0, '-clearwave');
  sim.chat(0, '-contract a'); // 20 bread due before wave 7 clears
  sim.chat(0, '-stock bread 3');
  sim.chat(0, '-deliver 3');
  sim.chat(0, '-wavejump 7');
  sim.advance(2);
  sim.chat(0, '-clearwave');
  assert.ok(/contract\|failed\|bread\|got=3\/20/.test(sim.global('RUNLOG')));
  assert.ok(sim.messagesMatching(/Provisions Order FAILS/).length > 0);
  const score = sim.call('ComputeScore');
  assert.strictEqual(score[7], -25, 'a failed contract scores -25');
  sim.chat(0, '-deliver 1');
  assert.ok(sim.messagesTo(0).some((m) => /No delivery contract is open/.test(m.text)),
    'the failed contract is gone');
});

test('Trade Tariff: +20% sell prices while its cycles run, the owed marauder squad rides the next wave, then it resolves', () => {
  const sim = loadMap(MAP);
  assert.strictEqual(call(sim, 'SellGoldFor', 'wood', 10), 18, 'baseline sell');
  sim.chat(0, '-test');
  sim.chat(0, '-wavejump 4');
  sim.advance(2);
  sim.chat(0, '-clearwave');
  sim.chat(0, '-contract b'); // the Trade Tariff
  assert.ok(/contract\|accept\|pid=0\|tariff/.test(sim.global('RUNLOG')));
  sim.chat(0, '-contract');
  assert.ok(sim.messagesTo(0).some((m) =>
    /Active contract:.*Trade Tariff -- 2 market cycles left, the marauder squad is still owed/.test(m.text)),
    'the pact status reads back its open clauses');
  assert.strictEqual(call(sim, 'SellUnitC', 'wood'), 216, '180 x 1.20');
  assert.strictEqual(call(sim, 'SellGoldFor', 'wood', 10), 21, 'boosted sell (floor)');
  assert.strictEqual(call(sim, 'BuyGoldFor', 'wood', 10), 22, 'buy side untouched');

  sim.advance(46); // wave 5 launches with the pact squad
  const log = sim.global('RUNLOG');
  assert.ok(/wave\|start\|5\|edge=\w+\|.*pact:marauder:3/.test(log),
    'the squad is part of the wave-start beat');
  const marauders = raidersOf(sim, 'n001');
  assert.strictEqual(marauders.length, 3, 'wave 5 fields no marauders of its own — all 3 are the pact');
  sim.chat(0, '-clearwave');
  sim.advance(61); // two market cycles burn the tariff down
  assert.ok(/contract\|resolved\|tariff/.test(sim.global('RUNLOG')));
  assert.strictEqual(call(sim, 'SellUnitC', 'wood'), 180, 'sell prices back to normal');
  const score = sim.call('ComputeScore');
  assert.strictEqual(score[7], 75, 'a resolved pact counts like a fulfilled one');
});

test('Toll Concession (seed 5): -15% buy prices, wave bounties halved for 2 waves, then it resolves', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-seed 5');
  assert.strictEqual(call(sim, 'BuyGoldFor', 'wood', 10), 22, 'baseline buy');
  sim.chat(0, '-test');
  sim.chat(0, '-wavejump 4');
  sim.advance(2);
  sim.chat(0, '-clearwave');
  assert.ok(/contract\|offer\|wave=4\|a=toll\|b=bread/.test(sim.global('RUNLOG')),
    'seed 5 posts the Toll Concession in slot a');
  sim.chat(0, '-contract a');
  assert.strictEqual(call(sim, 'BuyUnitC', 'wood'), 187, '220 x 0.85 (ceil)');
  assert.strictEqual(call(sim, 'BuyGoldFor', 'wood', 10), 19, 'discounted buy');
  assert.strictEqual(call(sim, 'SellGoldFor', 'wood', 10), 18, 'sell side untouched');

  sim.chat(0, '-wave'); // wave 5
  sim.advance(1);
  sim.chat(0, '-clearwave');
  assert.ok(/wave\|clear\|5\|bounty=20/.test(sim.global('RUNLOG')), '(15+25)//2');
  sim.chat(0, '-wave'); // wave 6
  sim.advance(1);
  sim.chat(0, '-clearwave');
  assert.ok(/wave\|clear\|6\|bounty=22/.test(sim.global('RUNLOG')), '(15+30)//2');
  sim.advance(61); // the discount cycles burn down (wave 7 auto-launches at gap end)
  assert.ok(/contract\|resolved\|toll/.test(sim.global('RUNLOG')));
  assert.strictEqual(call(sim, 'BuyGoldFor', 'wood', 10), 22, 'buy prices back to normal');
  sim.chat(0, '-clearwave');
  assert.ok(/wave\|clear\|7\|bounty=50/.test(sim.global('RUNLOG')), 'full bounty again');
});

test('contracts: the board still posts (and draws) while one is active — acceptance is what is refused', () => {
  const sim = loadMap(MAP);
  sim.chat(0, '-test');
  sim.chat(0, '-wavejump 4');
  sim.advance(2);
  sim.chat(0, '-clearwave');
  sim.chat(0, '-contract a'); // bread consignment, due wave 7
  sim.chat(0, '-wavejump 8');
  sim.advance(2);            // wave 8 launches; the bread contract fails at its clear
  sim.chat(0, '-clearwave');
  assert.ok(/contract\|failed\|bread/.test(sim.global('RUNLOG')), 'deadline passed at wave 8 clear');
  assert.ok(/contract\|offer\|wave=8\|/.test(sim.global('RUNLOG')),
    'the wave-8 board is posted regardless (PRNG stream never depends on player state)');
});

test('Trade Tariff (seed 1): the owed squad fans out on an east/west approach too', () => {
  const sim = loadMap(MAP);
  sim.chat(0, '-seed 1');
  sim.chat(0, '-test');
  sim.chat(0, '-wavejump 4');
  sim.advance(2);
  sim.chat(0, '-clearwave');
  sim.chat(0, '-contract b'); // seed 1 posts the tariff in slot b on this path
  assert.ok(/contract\|accept\|pid=0\|tariff/.test(sim.global('RUNLOG')));
  sim.advance(46);
  assert.ok(/wave\|start\|5\|edge=west\|.*pact:marauder:3/.test(sim.global('RUNLOG')),
    'the squad rides a west-edge wave');
  assert.strictEqual(raidersOf(sim, 'n001').length, 3, 'all three pact marauders spawned');
});

test('contracts: one active max — a long-running pact blocks acceptance from a later board', () => {
  const sim = loadMap(MAP);
  sim.chat(0, '-test');
  sim.chat(0, '-wavejump 4');
  sim.advance(2);
  sim.chat(0, '-clearwave');
  sim.chat(0, '-contract b'); // the Trade Tariff (default wave-4 slot b via this path)
  assert.ok(/contract\|accept\|pid=0\|tariff/.test(sim.global('RUNLOG')));
  sim.chat(0, '-wavejump 8'); // the squad rides this launch; cycles still owed
  sim.advance(2);
  sim.chat(0, '-clearwave');
  assert.ok(/contract\|offer\|wave=8\|/.test(sim.global('RUNLOG')));
  assert.ok(sim.messagesTo(0).some((m) => /hands are full/.test(m.text)),
    'the board itself says the company cannot sign');
  sim.chat(0, '-contract a');
  assert.ok(sim.messagesTo(0).some((m) => /One contract at a time/.test(m.text)));
});
