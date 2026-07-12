'use strict';
// Coinstead chat-command surface tests (lib/sim): the -test debug gate
// (northreach convention), the info commands (-help/-price/-eco/-lives),
// and the debug commands themselves (-gold, -stock, -build, -wave,
// -clearwave, -ff, -runlog).

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { loadMap } = require('../../../lib/sim');

const MAP = path.join(__dirname, '..');

function scalar(v) { return Array.isArray(v) ? v[0] : v; }
function call(sim, fn, ...args) { return scalar(sim.call(fn, ...args)); }

test("'-test' gates every debug command; toggling is announced to all", () => {
  const sim = loadMap(MAP);
  sim.chat(1, '-gold 999');
  assert.strictEqual(sim.player(1).gold, 200, 'refused outside -test');
  assert.ok(sim.messagesTo(1).some((m) => /need -test mode/i.test(m.text)));

  sim.chat(1, '-test');
  assert.ok(sim.messagesTo(0).some((m) => /enabled -test debug mode/.test(m.text)),
    'announced to everyone');
  sim.chat(1, '-gold 999');
  assert.strictEqual(sim.player(1).gold, 999);
  sim.chat(1, '-stock tools 7'); // 2-arg form: the Depot
  assert.strictEqual(call(sim, 'StockOf', 1, 'tools'), 7);
  assert.strictEqual(call(sim, 'StockAt', 1, 'depot', 'tools'), 7);
  sim.chat(1, '-stock mithril 7');
  assert.ok(sim.messagesTo(1).some((m) => /No such good/.test(m.text)));

  sim.chat(1, '-test'); // gate re-arms
  sim.chat(1, '-gold 5');
  assert.strictEqual(sim.player(1).gold, 999, 'debug gate re-armed after toggle-off');
});

test('-help prints the loop, the seed rule and the design credits', () => {
  const sim = loadMap(MAP);
  sim.chat(0, '-help');
  const texts = sim.messagesTo(0).map((m) => m.text).join('\n');
  assert.ok(/COINSTEAD/.test(texts));
  assert.ok(/3 wood->1 plank/.test(texts));
  assert.ok(/Idle cash and parked goods alone earn nothing/.test(texts));
  assert.ok(/Goods are PHYSICAL/.test(texts), 'the logistics rules are in -help');
  assert.ok(/-link <from> <to> \[good\]/.test(texts));
  assert.ok(/Economy TD \(anonymous, EpicWar\)/.test(texts));
  assert.ok(/Gold TD \(EpicWar\)/.test(texts));
  assert.ok(/Legion TD \(AutoAttackGames\)/.test(texts));
  assert.ok(/Line Tower Wars \(Hive Workshop\)/.test(texts));
  assert.ok(/nothing copied/i.test(texts));
});

test('-price lists every commodity with spread; -eco and -lives summarize the ledger', () => {
  const sim = loadMap(MAP);
  sim.chat(0, '-price');
  const priceText = sim.messagesTo(0).map((m) => m.text).join('\n');
  for (const name of ['Wood', 'Stone', 'Grain', 'Ore', 'Planks', 'Bread', 'Tools', 'Ingots']) {
    assert.ok(new RegExp(name).test(priceText), `${name} listed`);
  }
  assert.ok(/2\.00g \(buy 2\.20 \/ sell 1\.80\)/.test(priceText), 'wood spread shown');

  sim.chat(0, '-test');
  sim.chat(0, '-build woodcamp');
  sim.chat(0, '-stock ingots 4');
  sim.chat(0, '-eco');
  const ecoText = sim.messagesTo(0).map((m) => m.text).join('\n');
  assert.ok(/stake 120g/.test(ecoText));
  assert.ok(/woodcamp1:/.test(ecoText), 'per-building line with its -link name');
  assert.ok(/depot:.*ingots x4/.test(ecoText));

  sim.chat(0, '-lives');
  assert.ok(sim.messagesTo(0).some((m) => /Lives:.*20.*wave 1 in \d+s/.test(m.text)));
});

test('-eco flags inert towers; -lives tracks the wave phases', () => {
  const sim = loadMap(MAP);
  sim.chat(0, '-test');
  sim.chat(0, '-build watchtower');
  const tower = sim.findUnit('h009', 0);
  const dummy = sim.createUnit(23, 'n001', 50, 50, 0);
  sim.damage(tower, dummy, 10); // an empty rack: instantly inert
  sim.chat(0, '-eco');
  assert.ok(sim.messagesTo(0).some((m) => /1 of your towers stand INERT/.test(m.text)));

  sim.chat(0, '-wavejump 3');
  sim.advance(2);
  sim.chat(0, '-lives');
  assert.ok(sim.messagesTo(0).some((m) => /wave 3 in the field \(\d+ raiders left\)/.test(m.text)));
});

test('-clearwave sweeps the field and settles the wave; -ff scales the clock', () => {
  const sim = loadMap(MAP);
  sim.chat(0, '-test');
  sim.chat(0, '-wavejump 2');
  sim.advance(2);
  assert.strictEqual(sim.global('WavePhase'), 'active');
  sim.chat(0, '-clearwave');
  assert.strictEqual(sim.global('WavePhase'), 'gap', 'swept wave counts as cleared');
  assert.ok(/debug\|clearwave\|\d+/.test(sim.global('RUNLOG')));

  // -ff: 4x clock — a production tick lands in 2 wall-seconds
  sim.chat(0, '-build woodcamp');
  sim.chat(0, '-ff');
  assert.strictEqual(sim.global('ClockScale'), 4);
  sim.advance(2);
  assert.ok(call(sim, 'StockOf', 0, 'wood') >= 4, 'ticks run 4x fast');
  sim.chat(0, '-ff');
  assert.strictEqual(sim.global('ClockScale'), 1);
});

test('-runlog prints the beats; -wave refuses once the road is decided', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-test');
  sim.chat(0, '-runlog');
  assert.ok(sim.messagesTo(0).some((m) => /seed=20260712/.test(m.text)));

  sim.chat(0, '-wavejump 20');
  sim.advance(2);
  for (const u of sim.allUnits().filter((x) => x.alive && x.ownerIdx === 24)) sim.kill(u);
  assert.strictEqual(sim.global('VictoryPending'), true);
  sim.chat(0, '-wave');
  assert.ok(sim.messagesTo(0).some((m) => /road is decided -- use -endless/.test(m.text)));
});

test('edge branches: -build with a bad key, -lives in the gap and after the win, double -endless', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-test');
  sim.chat(0, '-build castle');
  assert.ok(sim.messagesTo(0).some((m) => /-build wants one of: woodcamp/.test(m.text)));

  sim.chat(0, '-wavejump 20');
  sim.advance(2);
  for (const u of sim.allUnits().filter((x) => x.alive && x.ownerIdx === 24)) sim.kill(u);
  sim.chat(0, '-lives');
  assert.ok(sim.messagesTo(0).some((m) => /the road is quiet/.test(m.text)),
    'phase done reads quiet');
  sim.chat(0, '-endless');
  sim.chat(0, '-endless');
  assert.ok(sim.messagesTo(0).some((m) => /already open/.test(m.text)));
  sim.chat(0, '-lives');
  assert.ok(sim.messagesTo(0).some((m) => /wave 21 in \d+s/.test(m.text)),
    'gap phase names the next wave');
});

test('unknown dash-chatter is ignored silently (no debug gate leak)', () => {
  const sim = loadMap(MAP);
  const before = sim.messagesTo(0).length;
  sim.chat(0, '-gg wp');
  assert.strictEqual(sim.messagesTo(0).length, before, 'no reaction at all');
});
