'use strict';
// Coinstead phase-3 PHYSICAL LOGISTICS tests (lib/sim, docs/PIPELINE.md §8):
// transfer links (pump rate, creation-order service, filters, the
// refiner-input export rule, every creation guard, -unlink, links dying
// with their endpoints), 6-slot x 200-charge storage arithmetic, the
// stall-gated market flow, spill-on-death + Steward recovery (including
// the vault-full loss), the stall-death market closure, and the live
// price multiboard (a real shared multiboard, asserted through the sim's
// recorded native calls — presentation tier; the price STATE stays the
// tested thing).

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { loadMap } = require('../../../lib/sim');

const MAP = path.join(__dirname, '..');

function scalar(v) { return Array.isArray(v) ? v[0] : v; }
function call(sim, fn, ...args) { return scalar(sim.call(fn, ...args)); }

test('links pump up to 5 charges per second, source slots in order, and stop at the target cap', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-test');
  sim.chat(0, '-build woodcamp');
  sim.chat(0, '-build sawmill');
  sim.chat(0, '-stock woodcamp1 wood 23');
  sim.chat(0, '-link woodcamp1 sawmill1');
  sim.advance(1);
  assert.strictEqual(call(sim, 'StockAt', 0, 'sawmill1', 'wood'), 5, '5/s');
  sim.advance(3);
  assert.strictEqual(call(sim, 'StockAt', 0, 'sawmill1', 'wood'), 20, '15 more over 3s');
  sim.advance(1); // t=5: the pump moves the last 3 BEFORE the production tick refines
  assert.strictEqual(call(sim, 'StockAt', 0, 'sawmill1', 'wood'), 20, '23 arrived - 3 refined at the tick');
  assert.strictEqual(call(sim, 'StockAt', 0, 'sawmill1', 'planks'), 1, 'the tick converted a batch');
  assert.strictEqual(call(sim, 'StockAt', 0, 'woodcamp1', 'wood'), 4, 'drained, then t=5 produced 4 fresh');
});

test('links from one building are served in CREATION ORDER: a hungry first route starves the second', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-test');
  sim.chat(0, '-build sawmill');
  sim.chat(0, '-build watchtower');
  sim.chat(0, '-link sawmill1 depot');            // first: takes everything
  sim.chat(0, '-link sawmill1 watchtower1 planks'); // second: starved
  sim.chat(0, '-stock sawmill1 planks 5');
  sim.advance(1);
  assert.strictEqual(call(sim, 'StockAt', 0, 'depot', 'planks'), 5, 'the first route took all 5');
  assert.strictEqual(call(sim, 'StockAt', 0, 'watchtower1', 'planks'), 0, 'the second got nothing');
  // steering: cut the first route and the second is served
  sim.chat(0, '-unlink sawmill1 depot');
  assert.ok(/link\|cut\|pid=0\|sawmill1>depot/.test(sim.global('RUNLOG')));
  sim.chat(0, '-stock sawmill1 planks 5');
  sim.advance(1);
  assert.strictEqual(call(sim, 'StockAt', 0, 'watchtower1', 'planks'), 5, 'now the rack fills');
});

test('a [good] filter restricts the route; a refiner never exports its own INPUTS', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-test');
  sim.chat(0, '-build sawmill');
  sim.chat(0, '-stock sawmill1 wood 50');   // the sawmill's own input
  sim.chat(0, '-stock sawmill1 planks 10'); // its output
  sim.chat(0, '-stock sawmill1 grain 10');  // a bystander good parked there
  sim.chat(0, '-link sawmill1 depot planks');
  sim.advance(2);
  assert.strictEqual(call(sim, 'StockAt', 0, 'depot', 'planks'), 10, 'filtered good moves');
  assert.strictEqual(call(sim, 'StockAt', 0, 'depot', 'grain'), 0, 'filter blocks the rest');
  sim.chat(0, '-unlink sawmill1 depot');
  sim.chat(0, '-link sawmill1 depot'); // unfiltered
  sim.advance(2); // t=4: no production tick yet — pure pump arithmetic
  assert.strictEqual(call(sim, 'StockAt', 0, 'depot', 'grain'), 10, 'bystander goods ship');
  assert.strictEqual(call(sim, 'StockAt', 0, 'sawmill1', 'wood'), 50,
    'the refiner NEVER exports its own inputs');
});

test('link guards: names, self-link, tower source, bad filter, duplicates, the 2-out cap, range', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-test');
  sim.chat(0, '-build woodcamp');
  sim.chat(0, '-build sawmill');
  sim.chat(0, '-build bakery');
  sim.chat(0, '-build watchtower');
  sim.chat(0, '-link nowhere depot');
  assert.ok(sim.messagesTo(0).some((m) => /-link wants two of YOUR buildings/.test(m.text)));
  sim.chat(0, '-link woodcamp1 woodcamp1');
  assert.ok(sim.messagesTo(0).some((m) => /cannot ship to itself/.test(m.text)));
  sim.chat(0, '-link watchtower1 depot');
  assert.ok(sim.messagesTo(0).some((m) => /Towers do not ship/.test(m.text)));
  sim.chat(0, '-link woodcamp1 depot mithril');
  assert.ok(sim.messagesTo(0).some((m) => /No such good/.test(m.text)));
  sim.chat(0, '-link woodcamp1 sawmill1');
  sim.chat(0, '-link woodcamp1 sawmill1');
  assert.ok(sim.messagesTo(0).some((m) => /already ships to sawmill1/.test(m.text)));
  sim.chat(0, '-link woodcamp1 depot');
  sim.chat(0, '-link woodcamp1 bakery1');
  assert.ok(sim.messagesTo(0).some((m) => /already runs 2 outgoing routes/.test(m.text)),
    'LINKS_OUT_MAX = 2 per building');
  // range: a camp at the map's west edge is out of carting range of the depot
  const far = sim.createUnit(0, 'h001', -3000, 0, 270);
  sim.constructFinish(far);
  sim.chat(0, '-link woodcamp2 depot');
  assert.ok(sim.messagesTo(0).some((m) => /out of carting range of woodcamp2/.test(m.text)));
  // -unlink on nothing
  sim.chat(0, '-unlink bakery1 depot');
  assert.ok(sim.messagesTo(0).some((m) => /No such route of yours/.test(m.text)));
  // -links lists the live routes
  sim.chat(0, '-links');
  assert.ok(sim.messagesTo(0).some((m) => /woodcamp1 -> sawmill1 \(all goods\)/.test(m.text)));
});

test('-links with no routes points at the syntax; a link dies with its endpoint (link|cut beat)', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-links');
  assert.ok(sim.messagesTo(0).some((m) => /No routes\. '-link <from> <to> \[good\]'/.test(m.text)));
  sim.chat(0, '-test');
  sim.chat(0, '-build woodcamp');
  sim.chat(0, '-build sawmill');
  sim.chat(0, '-link woodcamp1 sawmill1');
  sim.kill(sim.findUnit('h005', 0)); // the sawmill dies
  assert.ok(/link\|cut\|pid=0\|woodcamp1>sawmill1/.test(sim.global('RUNLOG')),
    'the route died with the target');
  sim.chat(0, '-links');
  assert.ok(sim.messagesTo(0).some((m) => /No routes/.test(m.text)));
});

test('shared-building stacks are tagged per founder: your routes move only YOUR goods', () => {
  const sim = loadMap(MAP);
  sim.chat(0, '-test');
  sim.chat(1, '-test');
  sim.chat(0, '-stock depot planks 40');
  sim.chat(1, '-stock depot planks 30');
  sim.chat(0, '-build watchtower'); // p0's tower near p0's start
  sim.chat(0, '-link depot watchtower1 planks');
  sim.advance(2);
  assert.strictEqual(call(sim, 'StockAt', 0, 'watchtower1', 'planks'), 10, 'p0 goods moved');
  assert.strictEqual(call(sim, 'StockAt', 1, 'depot', 'planks'), 30, "p1's stack untouched");
  // and StockAt/-eco see only your own stacks at shared buildings
  assert.strictEqual(call(sim, 'StockAt', 0, 'depot', 'planks'), 30, '40 - 10 pumped');
});

test('spill on death: HALF of each stored commodity (floor) hits the ground; a Steward couriers it to the Depot', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-test');
  sim.chat(0, '-build sawmill');
  sim.chat(0, '-stock sawmill1 planks 25');
  sim.chat(0, '-stock sawmill1 wood 7');
  sim.kill(sim.findUnit('h005', 0));
  assert.ok(/spill\|pid=0\|sawmill1\|wood\|n=3/.test(sim.global('RUNLOG')), '7 // 2 = 3');
  assert.ok(/spill\|pid=0\|sawmill1\|planks\|n=12/.test(sim.global('RUNLOG')), '25 // 2 = 12');
  const spiltPlanks = sim.itemsByType('I004').filter((i) => !i.removed && !i.ownerUnit);
  assert.strictEqual(spiltPlanks.length, 1, 'one ground stack per commodity');
  assert.strictEqual(spiltPlanks[0].charges, 12);
  const steward = sim.findUnit('h000', 0);
  sim.pickup(steward, spiltPlanks[0]);
  assert.strictEqual(call(sim, 'StockAt', 0, 'depot', 'planks'), 12, 'couriered to the vault');
  assert.ok(/recover\|pid=0\|planks\|n=12/.test(sim.global('RUNLOG')));
  assert.strictEqual(sim.itemsByType('I004').filter((i) => !i.removed && !i.ownerUnit).length, 0,
    'no ground stack remains — the depot slot item is the only I004 left');
});

test('recovery beyond the vault space is LOST (logged), and a stack under 2 charges spills nothing', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-test');
  // fill the depot completely: 6 slots x 200
  for (const good of ['wood', 'stone', 'grain', 'ore', 'planks', 'bread']) {
    sim.chat(0, `-stock depot ${good} 200`);
  }
  sim.chat(0, '-build smelter');
  sim.chat(0, '-stock smelter1 ingots 9');
  sim.chat(0, '-stock smelter1 tools 1'); // 1 // 2 = 0: burns entirely
  sim.kill(sim.findUnit('h007', 0));
  assert.ok(/spill\|pid=0\|smelter1\|ingots\|n=4/.test(sim.global('RUNLOG')));
  assert.ok(!/spill\|pid=0\|smelter1\|tools/.test(sim.global('RUNLOG')), 'no zero-charge spills');
  const stack = sim.itemsByType('I007').filter((i) => !i.removed && !i.ownerUnit)[0];
  const steward = sim.findUnit('h000', 0);
  sim.pickup(steward, stack);
  assert.ok(/recover\|pid=0\|ingots\|n=0\|lost=4/.test(sim.global('RUNLOG')),
    'a full vault loses the courier load');
  assert.ok(sim.messagesTo(0).some((m) => /4 lost -- the vault is full/.test(m.text)));
});

test('the Market Stall razed: its stock spills, the market CLOSES, trades are refused', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-test');
  sim.chat(0, '-stock stall planks 20');
  sim.kill(sim.findUnit('h00C'));
  assert.ok(/spill\|stall\|planks\|n=10/.test(sim.global('RUNLOG')), 'shared-building spill beat');
  assert.ok(/building\|lost\|stall/.test(sim.global('RUNLOG')));
  assert.ok(sim.messagesMatching(/Market Stall is rubble -- the market is CLOSED/).length > 0);
  sim.chat(0, '-buy wood 5');
  assert.ok(sim.messagesTo(0).some((m) => /no market to trade on/.test(m.text)));
  assert.strictEqual(sim.player(0).gold, 200);
});

test('the live price board: one shared multiboard, refreshed on trades, cycles and stall arrivals', () => {
  const sim = loadMap(MAP, { users: [0] });
  assert.strictEqual(sim.callsOf('CreateMultiboard').length, 1, 'ONE shared board (desync-safe)');
  assert.ok(sim.callsOf('MultiboardDisplay').some((c) => c.args[1] === true));
  assert.strictEqual(sim.callsOf('GetLocalPlayer').length, 0, 'no GetLocalPlayer tricks');
  const cellTexts = () => sim.callsOf('MultiboardSetItemValue').map((c) => c.args[1]);
  assert.ok(cellTexts().includes('Ingots'), 'every commodity has a row');
  assert.ok(cellTexts().includes('18.00g'), 'prices are cells');
  assert.ok(cellTexts().includes('Stall'), 'the stall-stock column header');

  // a trade refreshes the board immediately with the new stall stock
  let before = sim.callsOf('MultiboardSetItemValue').length;
  sim.chat(0, '-buy wood 10');
  assert.ok(sim.callsOf('MultiboardSetItemValue').length > before, 'trade refresh');
  assert.ok(cellTexts().slice(before).includes('10'), 'stall stock column shows the arrival');

  // a market cycle refreshes with the trend column
  sim.chat(0, '-test');
  sim.chat(0, '-stock stall wood 999');
  sim.chat(0, '-sell wood 800'); // -5% capped move at the cycle
  before = sim.callsOf('MultiboardSetItemValue').length;
  sim.advance(30);
  const afterCycle = cellTexts().slice(before);
  assert.ok(afterCycle.includes('-5%'), 'the trend cell tracks the move vs base');
  assert.ok(afterCycle.includes('1.90g'), 'the price cell tracks the new price');

  // a link arrival at the stall refreshes through the BoardDirty flush (once/s)
  sim.chat(0, '-stock depot ore 9');
  sim.chat(0, '-link depot stall ore');
  before = sim.callsOf('MultiboardSetItemValue').length;
  sim.advance(1);
  assert.ok(cellTexts().slice(before).includes('5'), 'stall ore after one pump second');
});

test('board trend goes positive too, and -price mirrors the stall column in chat', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-test');
  sim.chat(0, '-gold 9999');
  sim.chat(0, '-buy grain 40'); // +5% capped
  sim.advance(30);
  const texts = sim.callsOf('MultiboardSetItemValue').map((c) => c.args[1]);
  assert.ok(texts.includes('+5%'), 'positive trend rendered');
  sim.chat(0, '-price');
  assert.ok(sim.messagesTo(0).some((m) => /Grain.*stall 40/.test(m.text)),
    'the chat readout keeps the stall stock (sim/tests surface)');
});

test('-eco reads the physical ledger: per-building stores, depot reserve, routes, halted/inert flags', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-eco');
  assert.ok(sim.messagesTo(0).some((m) => /Buildings:.*none/.test(m.text)));
  sim.chat(0, '-test');
  sim.chat(0, '-build woodcamp');
  sim.chat(0, '-build watchtower');
  sim.chat(0, '-stock woodcamp1 wood 1200'); // full -> halts on the next tick
  sim.chat(0, '-stock depot ingots 4');
  sim.chat(0, '-link woodcamp1 depot wood');
  sim.chat(0, '-unlink woodcamp1 depot');
  sim.chat(0, '-link woodcamp1 depot');
  const raider = sim.createUnit(23, 'n001', 60, 60, 0);
  sim.damage(sim.findUnit('h009', 0), raider, 10); // dry tower -> inert
  sim.advance(5);
  sim.chat(0, '-eco');
  const eco = sim.messagesTo(0).map((m) => m.text).join('\n');
  assert.ok(/woodcamp1:.*wood x\d+/.test(eco), 'per-building store line');
  assert.ok(/depot:.*ingots x4.*reserve \d+g underwrites/.test(eco), 'the vault reserve line');
  assert.ok(/stall:.*empty/.test(eco));
  assert.ok(/Routes:.*1/.test(eco), 'route count');
  assert.ok(/watchtower1:.*\[INERT\]/.test(eco), 'inert flag');
});

test('debug -stock guards: bad building name, bad good, and the depot default', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-test');
  sim.chat(0, '-stock nowhere wood 5');
  assert.ok(sim.messagesTo(0).some((m) => /No storage of yours named 'nowhere'/.test(m.text)));
  sim.chat(0, '-stock mithril 5');
  assert.ok(sim.messagesTo(0).some((m) => /No such good/.test(m.text)));
  sim.chat(0, '-stock tools 7');
  assert.strictEqual(call(sim, 'StockAt', 0, 'depot', 'tools'), 7, '2-arg form fills the depot');
  sim.chat(0, '-stock tools 2');
  assert.strictEqual(call(sim, 'StockAt', 0, 'depot', 'tools'), 2, '-stock SETS (take then store)');
});
