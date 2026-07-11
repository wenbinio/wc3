'use strict';
// THE GOLDEN RUN — the flagship logic test for The Vaults of Ash.
//
// A complete scripted solo playthrough on the DEFAULT SEED (20260711):
// read the omens, pick doors, clear a kill-all room, a guarded reliquary
// and a survive room, draft two boons, spend embers at the campfire, break
// the Vault Gate and kill the Vault Heart through all three phases —
// asserting the full beat sequence and the exact seeded deal at every
// step. Because every random draw flows through the map's own seeded PRNG
// (identical under the game's Lua and fengari), this whole transcript is
// pinned: if ANY beat drifts (a deal, a payout, a spawn count, a phase),
// this test names the beat that moved.
//
// Runs with maps/vaults-of-ash/tests/vaults.test.js via `npm test` or
// node tools/test-map-logic.js maps/vaults-of-ash

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { loadMap } = require('../../../lib/sim');

const MAP = path.join(__dirname, '..');
const DOOR = { A: [-1344, -5504], B: [-448, -5504], GATE: [1344, -5504] };
const BOON_PLATE = { A: [-576, -6208], B: [0, -6208] };
const SHRINE = { heal: [896, -7040], fortify: [1536, -7040] };

test('GOLDEN RUN: full playthrough on seed 20260711 hits every pinned beat', () => {
  const sim = loadMap(MAP, { users: [0] });
  const hero = () => sim.findUnit('H000', 0);
  const creeps = () => sim.unitsOf(24).filter((u) => u.alive);
  const log = () => sim.global('RUNLOG');

  // ---- the hub: seed + floor 1 deal are pinned -------------------------
  assert.ok(log().startsWith('seed=20260711\n'), 'default seed logged');
  assert.match(log(),
    /deal\|floor=1\|A=F1D:killall:d1:boon\|B=F1B:survive:d1:boon\|C=F1A:killall:d2:relic/,
    'floor 1 deal is the pinned seeded deal');
  assert.strictEqual(sim.player(0).gold, 0, 'the party starts with no embers');
  assert.strictEqual(hero().maxLife, 650, 'Torchbearer max life from object data');

  // ---- room 1: door A -> F1D kill-all, danger 1, boon reward ------------
  sim.moveUnit(hero(), ...DOOR.A);
  assert.match(log(), /door\|A\|floor=1/);
  assert.match(log(), /enter\|room=F1D\|obj=killall\|danger=1\|reward=boon/);
  const pack1 = creeps();
  assert.strictEqual(pack1.length, 5, 'room 1: 5 vault-born (solo, danger 1)');
  assert.strictEqual(pack1.filter((u) => u.typeStr === 'u001').length, 3, '3 Vault Kobolds');
  assert.strictEqual(pack1.filter((u) => u.typeStr === 'u000').length, 2, '2 Ashspawn Acolytes');
  for (const u of pack1) sim.kill(u, hero());
  assert.match(log(), /clear\|room=F1D\|embers=40\|total=40/, 'danger 1 pays exactly 40');
  assert.strictEqual(sim.player(0).gold, 40);
  sim.advance(3); // return to hub + draft deals

  // ---- boon draft 1 (pinned offer), take Ashen Grace --------------------
  assert.match(log(), /boonoffer\|Ashen Grace\|Cinderguard\|Pyre Ward/, 'draft 1 offer pinned');
  assert.strictEqual(sim.itemsByType('I001').length, 1, 'Ashen Grace on pedestal A');
  assert.strictEqual(sim.itemsByType('I004').length, 1, 'Cinderguard on pedestal B');
  assert.strictEqual(sim.itemsByType('I007').length, 1, 'Pyre Ward on pedestal C');
  sim.moveUnit(hero(), ...BOON_PLATE.A);
  assert.strictEqual(hero().agi, 14 + 6, 'Ashen Grace: +6 Agility applied');
  assert.strictEqual(sim.itemsByType('I004').length, 0, 'unclaimed boons crumble');
  assert.strictEqual(sim.itemsByType('I007').length, 0, 'unclaimed boons crumble');

  // ---- floor 2 deal (pinned), door B -> F2D guarded reliquary -----------
  assert.match(log(),
    /deal\|floor=2\|A=F2B:killall:d3:embers\|B=F2D:reliquary:d3:boon\|C=F2C:killall:d3:embers/,
    'floor 2 deal is the pinned seeded deal');
  sim.moveUnit(hero(), ...DOOR.B);
  assert.match(log(), /enter\|room=F2D\|obj=reliquary\|danger=3\|reward=boon/);
  assert.strictEqual(sim.allUnits('n004').length, 1, 'the Sealed Reliquary stands on the dais');
  const guards = creeps();
  assert.strictEqual(guards.length, 6, '5 guards + 1 elite (danger 3)');
  assert.strictEqual(guards.filter((u) => u.typeStr === 'u007').length, 1,
    'the elite is the pinned Ashen Champion');
  for (const u of guards) sim.kill(u, hero());
  assert.match(log(), /elitedrop\|Ashen Champion/, 'the elite dropped a consumable');
  assert.strictEqual(sim.itemsByType('I009').length + sim.itemsByType('I010').length, 1);
  assert.match(log(), /reliquary\|looted/, 'relic loosed when the last guard fell');
  assert.strictEqual(sim.itemsByType('I008').length, 1, 'Monastic Relic dropped');
  assert.match(log(), /clear\|room=F2D\|embers=80\|total=120/, 'danger 3 pays exactly 80');
  sim.advance(3);

  // ---- boon draft 2 (pinned offer), take Torchbearer Vigor --------------
  assert.match(log(), /boonoffer\|Emberedge\|Torchbearer Vigor\|Ember Sinew/, 'draft 2 offer pinned');
  sim.moveUnit(hero(), ...BOON_PLATE.B);
  assert.strictEqual(hero().maxLife, 650 + 150, 'Torchbearer Vigor: +150 max life');
  assert.match(log(), /boontake\|pid=0\|Torchbearer Vigor/);

  // ---- floor 3 deal (pinned), door A -> F3C survive ---------------------
  assert.match(log(),
    /deal\|floor=3\|A=F3C:survive:d2:embers\|B=F3A:reliquary:d3:embers\|C=F3D:killall:d3:boon/,
    'floor 3 deal is the pinned seeded deal');
  sim.moveUnit(hero(), ...DOOR.A);
  assert.match(log(), /enter\|room=F3C\|obj=survive\|danger=2\|reward=embers/);
  assert.strictEqual(creeps().length, 4, 'survive opens with 4 (solo, danger 2)');
  sim.advance(30);
  assert.ok(creeps().length > 4, 'the onslaught trickles reinforcements');
  assert.ok(!/clear\|room=F3C/.test(log()), 'holding out: not cleared at 30s');
  sim.advance(31);
  assert.match(log(), /clear\|room=F3C\|embers=60\|total=180/, 'survived: danger 2 pays exactly 60');
  assert.match(log(), /reward\|embers\|\+40/, 'ember cache bonus');
  assert.strictEqual(sim.player(0).gold, 220, '40 + 80 + 60 + 40 = 220 embers');
  sim.advance(3);

  // ---- the campfire lights, the Vault Gate unseals ----------------------
  assert.match(log(), /campfire\|lit/, 'shrine lit after the 3rd cleared room');
  assert.match(log(), /gate\|unsealed/, 'Vault Gate unsealed after three rooms');
  const h = hero();
  h.life = 200; // wounded from the descent
  sim.moveUnit(h, ...SHRINE.heal);
  assert.strictEqual(sim.player(0).gold, 160, 'heal: -60 embers');
  assert.strictEqual(h.life, 200 + h.maxLife * 0.5, 'heal restored half of max life');
  sim.moveUnit(h, ...SHRINE.fortify);
  assert.strictEqual(sim.player(0).gold, 85, 'fortify: -75 embers');
  assert.strictEqual(h.maxLife, 800 + 100, 'fortify: +100 max life on top of the boon');

  // ---- the Vault Heart: three phases, then victory ----------------------
  sim.moveUnit(hero(), ...DOOR.GATE);
  assert.match(log(), /boss\|enter/);
  const boss = sim.findUnit('u008');
  assert.ok(boss && boss.maxLife === 3200, 'the Vault Heart beats in the arena');
  assert.ok(hero().y > 4224, 'party teleported to the summit');

  sim.natives.SetWidgetLife(boss.handle, 3200 * 0.79);
  sim.advance(2);
  assert.match(log(), /boss\|phase=2\|adds=2/, 'phase 2 at 80%: 2 Heart Sparks');
  sim.natives.SetWidgetLife(boss.handle, 3200 * 0.39);
  sim.advance(2);
  assert.match(log(), /boss\|phase=3\|adds=2/, 'phase 3 at 40%: 2 Molten Shards');
  assert.strictEqual(sim.callsOf('UnitRemoveAbility').length, 1, 'Vault Slam removed');
  assert.ok(sim.callsOf('UnitAddAbility').some((c) => c.args[0] === boss.handle),
    'Heartshatter Slam granted');

  sim.kill(boss, hero());
  sim.advance(6);
  assert.strictEqual(sim.player(0).result, 'victory', 'the Heart is broken');
  const summary = sim.messagesTo(0).map((m) => m.text)
    .find((t) => /VAULTS OF ASH -- VICTORY/.test(t));
  assert.ok(summary, 'victory summary shown');
  assert.match(summary, /Floor reached: 4\/4/);
  assert.match(summary, /Rooms cleared: 3/);
  assert.match(summary, /Embers earned: 220/);
  assert.match(summary, /Boons: Ashen Grace, Torchbearer Vigor/);
  assert.match(summary, /Seed: 20260711/);

  // ---- the whole beat sequence, in order --------------------------------
  const beats = log().trim().split('\n').filter((l) =>
    /^(seed|deal|door|enter|clear|reward|boonoffer|boontake|campfire|gate|boss|summary|victory)/.test(l));
  const expected = [
    'seed=20260711',
    'deal|floor=1|A=F1D:killall:d1:boon|B=F1B:survive:d1:boon|C=F1A:killall:d2:relic',
    'door|A|floor=1',
    'enter|room=F1D|obj=killall|danger=1|reward=boon',
    'clear|room=F1D|embers=40|total=40',
    'reward|boon',
    'boonoffer|Ashen Grace|Cinderguard|Pyre Ward',
    'boontake|pid=0|Ashen Grace',
    'deal|floor=2|A=F2B:killall:d3:embers|B=F2D:reliquary:d3:boon|C=F2C:killall:d3:embers',
    'door|B|floor=2',
    'enter|room=F2D|obj=reliquary|danger=3|reward=boon',
    'clear|room=F2D|embers=80|total=120',
    'reward|boon',
    'boonoffer|Emberedge|Torchbearer Vigor|Ember Sinew',
    'boontake|pid=0|Torchbearer Vigor',
    'deal|floor=3|A=F3C:survive:d2:embers|B=F3A:reliquary:d3:embers|C=F3D:killall:d3:boon',
    'door|A|floor=3',
    'enter|room=F3C|obj=survive|danger=2|reward=embers',
    'clear|room=F3C|embers=60|total=180',
    'reward|embers|+40',
    'campfire|lit',
    'gate|unsealed',
    'campfire|heal|-60',
    'campfire|fortify|-75',
    'boss|enter',
    'boss|phase=2|adds=2',
    'boss|phase=3|adds=2',
    'boss|dead',
    'summary|VICTORY',
    'victory',
  ];
  assert.deepStrictEqual(beats, expected, 'the golden run beat sequence is byte-exact');
});
