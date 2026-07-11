'use strict';
// Logic tests for The Vaults of Ash, executed headlessly against the PACKED
// war3map.lua (generated constants + CreateAllUnits blocks included) by
// lib/sim — see docs/PIPELINE.md §8. Discovered by `npm test` and runnable
// alone via: node tools/test-map-logic.js maps/vaults-of-ash
//
// Covered mechanics (the map's README describes each):
//   seeded PRNG determinism (same seed = same dungeon, all randomness
//   through the map's own Park-Miller PRNG), late -seed refusal, door ->
//   teleport + room ACTIVE state machine, kill-all / survive / reliquary
//   objectives with exact ember payouts, boon draft 3-take-1, campfire
//   shrine purchases (trigger-owned embers), boon reroll, Vault's Breath
//   stacking, boss phase one-shot thresholds + slam swap, permadeath
//   defeat + summary, co-op spawn scaling.
//
// The flagship scripted full playthrough lives in golden-run.test.js.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { loadMap } = require('../../../lib/sim');

const MAP = path.join(__dirname, '..');

// hub geometry (mirrors regions.json / assets/generate-terrain.mjs)
const DOOR = { A: [-1344, -5504], B: [-448, -5504], C: [448, -5504], GATE: [1344, -5504] };
const BOON_PLATE = { A: [-576, -6208], B: [0, -6208], C: [576, -6208] };
const SHRINE = { heal: [896, -7040], reroll: [1216, -7040], fortify: [1536, -7040] };
const BOON_ITEM_TYPES = ['I000', 'I001', 'I002', 'I003', 'I004', 'I005', 'I006', 'I007'];

const hero = (sim, pid) => sim.findUnit('H000', pid || 0);
const creeps = (sim) => sim.unitsOf(24).filter((u) => u.alive);
const runlog = (sim) => sim.global('RUNLOG');
const draftItemCount = (sim) =>
  BOON_ITEM_TYPES.reduce((n, t) => n + sim.itemsByType(t).length, 0);

test('seed determinism: two sims on the same seed replay the identical dungeon', () => {
  const drive = () => {
    const sim = loadMap(MAP, { users: [0] });
    sim.moveUnit(hero(sim), ...DOOR.A);
    for (const u of creeps(sim)) sim.kill(u, hero(sim));
    sim.advance(3);
    return sim;
  };
  const a = drive();
  const b = drive();
  assert.ok(runlog(a).includes('deal|floor=1'), 'run log records the deal');
  assert.ok(/spawn\|.*\|x=-?\d+\|y=-?\d+/.test(runlog(a)), 'run log records exact spawn positions');
  assert.strictEqual(runlog(a), runlog(b),
    'same seed + same actions must replay the byte-identical run log (deal, spawns, clears)');
});

test('seed determinism: different -seed values deal different dungeons', () => {
  const withSeed = (n) => {
    const sim = loadMap(MAP, { users: [0] });
    if (n !== null) sim.chat(0, `-seed ${n}`);
    return runlog(sim);
  };
  const dflt = withSeed(null);
  const s5 = withSeed(5);
  const s9 = withSeed(9);
  assert.ok(s5.startsWith('seed=5\n'), '-seed 5 reseeds and logs it');
  assert.notStrictEqual(dflt, s5, 'default vs seed 5 deal differently');
  assert.notStrictEqual(s5, s9, 'seed 5 vs seed 9 deal differently');
});

test('-seed is refused after the first door (the run is locked in)', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.moveUnit(hero(sim), ...DOOR.A); // first door entered
  const before = sim.global('RunSeed');
  sim.chat(0, '-seed 123456');
  assert.ok(sim.messagesTo(0).some((m) => /-seed works only before the first door/.test(m.text)),
    'late reseed is refused with an explanation');
  assert.strictEqual(sim.global('RunSeed'), before, 'seed unchanged');
  assert.ok(!runlog(sim).includes('seed=123456'), 'run log never reseeded');
});

test('door enter: party teleports into the dealt room, room goes ACTIVE, camera beat plays', () => {
  const sim = loadMap(MAP, { users: [0] });
  const h = hero(sim);
  assert.deepStrictEqual([h.x, h.y], [-320, -6912], 'hero starts at the hub landing');
  assert.ok(sim.messagesTo(0).some((m) => /Omen -- Door A/.test(m.text)), 'omens announced');
  assert.ok(sim.callsOf('SetTextTagText').length >= 3, 'omen floating text on the obelisks');

  const pansBefore = sim.callsOf('PanCameraToTimedForPlayer').length;
  sim.moveUnit(h, ...DOOR.A);
  // default seed: door A -> room F1D (island x 4672..7232, y -3968..-1920)
  assert.ok(h.x > 4672 && h.x < 7232 && h.y > -3968 && h.y < -1920,
    `hero teleported into room F1D, got (${h.x}, ${h.y})`);
  assert.match(runlog(sim), /enter\|room=F1D\|obj=killall\|danger=1\|reward=boon/);
  assert.ok(creeps(sim).length > 0, 'room is ACTIVE: creeps spawned');
  assert.ok(sim.callsOf('PanCameraToTimedForPlayer').length > pansBefore, 'entry camera beat');
  assert.ok(sim.messagesTo(0).some((m) => /The seal breaks/.test(m.text)), 'activation announced');
});

test('kill-all: clearing pays EXACTLY 20+20*danger embers, and only when the last creep falls', () => {
  const sim = loadMap(MAP, { users: [0] });
  const h = hero(sim);
  sim.moveUnit(h, ...DOOR.A); // F1D killall danger 1 (pinned by the default seed)
  const pack = creeps(sim);
  assert.strictEqual(pack.length, 5, 'solo danger-1 kill-all spawns 3+2*1 = 5');
  for (const u of pack.slice(0, -1)) sim.kill(u, h);
  assert.strictEqual(sim.player(0).gold, 0, 'no payout while one creep still stands');
  assert.ok(!runlog(sim).includes('clear|'), 'not cleared yet');
  sim.kill(pack[pack.length - 1], h);
  assert.strictEqual(sim.player(0).gold, 40, 'danger 1 pays exactly 40 embers');
  assert.match(runlog(sim), /clear\|room=F1D\|embers=40\|total=40/);
  sim.advance(3);
  assert.deepStrictEqual([h.x, h.y], [-128, -6592], 'party returned to the hub');
});

test('survive: the room clears when the 60s countdown expires, not before, and trickles reinforcements', () => {
  const sim = loadMap(MAP, { users: [0] });
  const h = hero(sim);
  sim.chat(0, '-test');
  sim.chat(0, '-room survive 2');
  assert.match(runlog(sim), /debugroom\|floor=1\|obj=survive\|danger=2/);
  assert.strictEqual(creeps(sim).length, 4, 'solo danger-2 survive opens with 2+2 = 4');
  sim.advance(30);
  assert.ok(creeps(sim).length > 4, 'reinforcements trickle in while the clock runs');
  assert.ok(!runlog(sim).includes('clear|'), 'not cleared at 30s');
  assert.strictEqual(sim.player(0).gold, 0);
  sim.advance(31);
  assert.match(runlog(sim), /clear\|room=F1B\|embers=60/, 'cleared after 60s, danger 2 pays 60');
  assert.strictEqual(creeps(sim).length, 0, 'survivors crumble with the seal');
});

test('guarded reliquary: killing every guard breaks the seal and drops the relic', () => {
  const sim = loadMap(MAP, { users: [0] });
  const h = hero(sim);
  sim.chat(0, '-test');
  sim.chat(0, '-room reliquary 2');
  assert.strictEqual(sim.allUnits('n004').length, 1, 'the Sealed Reliquary stands in the room');
  const guards = creeps(sim);
  assert.strictEqual(guards.length, 4, 'solo danger-2 reliquary posts 2+2 = 4 guards');
  assert.strictEqual(sim.itemsByType('I008').length, 0);
  for (const u of guards) sim.kill(u, h);
  assert.strictEqual(sim.itemsByType('I008').length, 1, 'Monastic Relic tumbles free');
  assert.match(runlog(sim), /reliquary\|looted/);
  assert.match(runlog(sim), /clear\|room=F1C\|embers=60/);
});

test('boon draft is 3-take-1: taking one applies its effect and consumes the other two', () => {
  const sim = loadMap(MAP, { users: [0] });
  const h = hero(sim);
  sim.chat(0, '-test');
  sim.chat(0, '-boon');
  assert.strictEqual(draftItemCount(sim), 3, 'three boons materialize on the pedestals');
  // fresh-state -boon draft offer (pinned by the default seed):
  // plate A = Ashbreaker, plate B = Ember Sinew, plate C = Emberedge
  assert.match(runlog(sim), /boonoffer\|Ashbreaker\|Ember Sinew\|Emberedge/);
  const strBefore = h.str;
  sim.moveUnit(h, ...BOON_PLATE.B); // plate B = Ember Sinew (+6 Strength)
  assert.strictEqual(h.str, strBefore + 6, 'SetHeroStr applied the +6 boon');
  assert.strictEqual(draftItemCount(sim), 0, 'the unclaimed boons are consumed');
  assert.match(runlog(sim), /boontake\|pid=0\|Ember Sinew/);
  assert.ok(sim.messagesTo(0).some((m) => /claims Ember Sinew/.test(m.text)));
  // the draft is spent: stepping another plate does nothing
  sim.moveUnit(h, ...BOON_PLATE.A);
  assert.strictEqual(h.str, strBefore + 6, 'no double-dipping after the draft resolves');
});

test('ability boons go through UnitAddAbility with the generated ABIL_ constant', () => {
  const sim = loadMap(MAP, { users: [0] });
  const h = hero(sim);
  sim.chat(0, '-test');
  sim.chat(0, '-boon');
  // fresh-state -boon offer (pinned): plate A = Ashbreaker (bash ability grant)
  const addsBefore = sim.callsOf('UnitAddAbility').length;
  sim.moveUnit(h, ...BOON_PLATE.A);
  const adds = sim.callsOf('UnitAddAbility');
  assert.strictEqual(adds.length, addsBefore + 1, 'exactly one ability grant recorded');
  assert.strictEqual(adds[adds.length - 1].args[0], h.handle, 'granted to the taking hero');
  assert.match(runlog(sim), /boontake\|pid=0\|Ashbreaker/);
});

test('campfire: purchases deduct exact embers and apply; refusals leave the pool alone', () => {
  const sim = loadMap(MAP, { users: [0] });
  const h = hero(sim);
  sim.chat(0, '-test');
  // shrine is cold before any lighting
  sim.moveUnit(h, ...SHRINE.heal);
  assert.ok(sim.messagesTo(0).some((m) => /The shrine is cold/.test(m.text)));
  // clear a 3rd room to light it (debug: jump to floor 3, force a room, clear it)
  sim.chat(0, '-floor 3');
  sim.chat(0, '-room killall 1');
  for (const u of creeps(sim)) sim.kill(u, hero(sim));
  sim.advance(3);
  assert.match(runlog(sim), /campfire\|lit/, 'shrine lights after the 3rd cleared room');

  // insufficient embers refuse without deducting
  sim.chat(0, '-embers 10');
  sim.moveUnit(h, 0, -6592); // step off, then onto the plate again
  sim.moveUnit(h, ...SHRINE.heal);
  assert.ok(sim.messagesTo(0).some((m) => /Not enough Embers \(60 needed, 10 held\)/.test(m.text)));
  assert.strictEqual(sim.player(0).gold, 10, 'refused purchase deducts nothing');

  // heal: -60, restores half of max life
  sim.chat(0, '-embers 200');
  h.life = 100; // wound the hero so the heal is observable
  sim.moveUnit(h, 0, -6592);
  sim.moveUnit(h, ...SHRINE.heal);
  assert.strictEqual(sim.player(0).gold, 140, 'heal costs exactly 60');
  assert.strictEqual(h.life, 100 + h.maxLife * 0.5, 'heal restores 50% of maximum life');

  // fortify: -75, +100 max life (and current life)
  const maxBefore = h.maxLife;
  sim.moveUnit(h, ...SHRINE.fortify);
  assert.strictEqual(sim.player(0).gold, 65, 'fortify costs exactly 75');
  assert.strictEqual(h.maxLife, maxBefore + 100, 'fortify grants +100 maximum life');

  // each plate is single-use per lighting
  sim.moveUnit(h, 0, -6592);
  sim.moveUnit(h, ...SHRINE.fortify);
  assert.ok(sim.messagesTo(0).some((m) => /already been spent/.test(m.text)));
  assert.strictEqual(sim.player(0).gold, 65, 'spent plate deducts nothing');
});

test('campfire reroll: re-deals a pending draft for 40 embers; refuses with no draft', () => {
  const sim = loadMap(MAP, { users: [0] });
  const h = hero(sim);
  sim.chat(0, '-test');
  sim.chat(0, '-floor 3');
  sim.chat(0, '-room killall 1');
  for (const u of creeps(sim)) sim.kill(u, hero(sim));
  sim.advance(3); // lights the shrine (3rd room)
  sim.chat(0, '-embers 100');

  // no draft pending -> refused, nothing deducted
  sim.moveUnit(h, ...SHRINE.reroll);
  assert.ok(sim.messagesTo(0).some((m) => /No boon draft is pending/.test(m.text)));
  assert.strictEqual(sim.player(0).gold, 100);

  sim.chat(0, '-boon');
  const offer1 = runlog(sim).split('\n').filter((l) => l.startsWith('boonoffer')).pop();
  assert.strictEqual(draftItemCount(sim), 3);
  sim.moveUnit(h, 0, -6592);
  sim.moveUnit(h, ...SHRINE.reroll);
  assert.strictEqual(sim.player(0).gold, 60, 'reroll costs exactly 40');
  assert.match(runlog(sim), /reroll/);
  const offer2 = runlog(sim).split('\n').filter((l) => l.startsWith('boonoffer')).pop();
  assert.notStrictEqual(offer1, offer2, 'the draft was re-dealt (seeded, so pinned to differ)');
  assert.strictEqual(draftItemCount(sim), 3, 'three fresh boons on the pedestals');
});

test("Vault's Breath: +2% stacks land exactly every 90s, announced with sound", () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.advance(89);
  assert.strictEqual(sim.global('VaultBreathStacks'), 0, 'no stack before 90s');
  sim.advance(1);
  assert.strictEqual(sim.global('VaultBreathStacks'), 1, 'first stack at exactly 90s');
  assert.ok(sim.messagesTo(0).some((m) => /The Vault breathes.*2% harder/.test(m.text)));
  assert.ok(sim.callsOf('StartSound').length > 0, 'breath announced with sound');
  sim.advance(90);
  assert.strictEqual(sim.global('VaultBreathStacks'), 2, 'second stack at 180s');
  assert.ok(sim.messagesTo(0).some((m) => /4% harder/.test(m.text)), 'stacking percentage announced');
  assert.match(runlog(sim), /breath\|stacks=2/);
});

test("Vault's Breath rescales live hostiles, and '-ff' compresses the clock", () => {
  const sim = loadMap(MAP, { users: [0] });
  const h = hero(sim);
  sim.moveUnit(h, ...DOOR.A); // spawn a room so the breath has targets
  const spawnCalls = sim.callsOf('BlzSetUnitBaseDamage').length;
  assert.ok(spawnCalls >= 5, 'every spawn gets a base-damage assignment');
  sim.chat(0, '-test');
  sim.chat(0, '-ff'); // 4x clock
  sim.advance(23); // 23 ticks * 4 = 92 breath-units
  assert.strictEqual(sim.global('VaultBreathStacks'), 1, "-ff scales the breath clock");
  assert.ok(sim.callsOf('BlzSetUnitBaseDamage').length > spawnCalls,
    'live room creeps were rescaled by the breath');
});

test('boss: phase thresholds fire exactly once each, and phase 3 swaps the slam', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-test');
  sim.chat(0, '-boss');
  const boss = sim.findUnit('u008');
  assert.ok(boss, 'the Vault Heart stands in the arena');
  assert.strictEqual(boss.maxLife, 3200, 'boss max life from object data (uhpm)');
  assert.match(runlog(sim), /boss\|enter/);

  // phase 2 at 80%: adds once, no slam swap yet
  sim.natives.SetWidgetLife(boss.handle, 3200 * 0.79);
  sim.advance(2);
  assert.strictEqual(sim.allUnits('u009').filter((u) => u.alive).length, 2, 'phase 2 sheds 2 Heart Sparks (solo)');
  assert.strictEqual(sim.callsOf('UnitRemoveAbility').length, 0, 'slam not swapped in phase 2');
  sim.advance(5); // still below 80%: must not re-trigger
  assert.strictEqual(sim.allUnits('u009').filter((u) => u.alive).length, 2, 'phase 2 fires exactly once');
  assert.strictEqual((runlog(sim).match(/boss\|phase=2/g) || []).length, 1);

  // phase 3 at 40%: adds + Vault Slam -> Heartshatter Slam
  sim.natives.SetWidgetLife(boss.handle, 3200 * 0.39);
  sim.advance(2);
  assert.strictEqual(sim.allUnits('u010').filter((u) => u.alive).length, 2, 'phase 3 sheds 2 Molten Shards (solo)');
  const removes = sim.callsOf('UnitRemoveAbility');
  const adds = sim.callsOf('UnitAddAbility');
  assert.strictEqual(removes.length, 1, 'old slam removed exactly once');
  assert.strictEqual(removes[0].args[0], boss.handle);
  assert.ok(adds.some((c) => c.args[0] === boss.handle), 'Heartshatter Slam granted to the boss');
  sim.advance(5);
  assert.strictEqual((runlog(sim).match(/boss\|phase=3/g) || []).length, 1, 'phase 3 fires exactly once');
});

test('permadeath: when the last torch gutters out the party is defeated with a run summary', () => {
  const sim = loadMap(MAP, { users: [0, 1] });
  sim.kill(sim.findUnit('H000', 0));
  sim.advance(3);
  assert.strictEqual(sim.player(0).result, null, 'one living torch keeps the run alive');
  assert.ok(sim.messagesTo(1).some((m) => /torch of .* gutters out/.test(m.text)));
  sim.kill(sim.findUnit('H000', 1));
  sim.advance(3);
  assert.strictEqual(sim.player(0).result, 'defeat');
  assert.strictEqual(sim.player(1).result, 'defeat');
  const summary = sim.messagesTo(0).map((m) => m.text).find((t) => /VAULTS OF ASH -- DEFEAT/.test(t));
  assert.ok(summary, 'defeat summary shown');
  assert.match(summary, /Rooms cleared: 0/);
  assert.match(summary, /Seed: 20260711/);
  assert.ok(sim.callsOf('CreateQuest').length > 0, 'summary also lands in the quest log');
});

test('boss death is victory, with the full run summary', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-test');
  sim.chat(0, '-boss');
  sim.kill(sim.findUnit('u008'), hero(sim));
  sim.advance(6);
  assert.strictEqual(sim.player(0).result, 'victory');
  const summary = sim.messagesTo(0).map((m) => m.text).find((t) => /VAULTS OF ASH -- VICTORY/.test(t));
  assert.ok(summary, 'victory summary shown');
  assert.match(summary, /Floor reached: 4\/4/);
  assert.match(summary, /Seed: 20260711/);
  assert.match(runlog(sim), /boss\|dead/);
});

test('co-op scaling: spawn counts multiply by 1.6 per extra player, rounded up', () => {
  const counts = {};
  for (const users of [[0], [0, 1], [0, 1, 2]]) {
    const sim = loadMap(MAP, { users });
    assert.strictEqual(sim.allUnits('H000').length, users.length,
      'one Torchbearer per seated player');
    sim.moveUnit(sim.findUnit('H000', 0), ...DOOR.A); // same seed -> same door/room
    counts[users.length] = creeps(sim).length;
  }
  assert.strictEqual(counts[1], 5, 'solo baseline: 5');
  assert.strictEqual(counts[2], Math.ceil(5 * 1.6), 'two players: ceil(5*1.6) = 8');
  assert.strictEqual(counts[3], Math.ceil(5 * 1.6 * 1.6), 'three players: ceil(5*2.56) = 13');
});

test('debug commands are gated behind -test', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-embers 500');
  assert.ok(sim.messagesTo(0).some((m) => /need -test mode/i.test(m.text)));
  assert.strictEqual(sim.player(0).gold, 0, 'gated command did nothing');
  sim.chat(0, '-test');
  sim.chat(0, '-embers 500');
  assert.strictEqual(sim.player(0).gold, 500, 'after -test the command works');
  sim.chat(0, '-test'); // toggle off re-arms the gate
  sim.chat(0, '-embers 7');
  assert.strictEqual(sim.player(0).gold, 500, 'gate re-armed after toggle-off');
});

test('co-op alliances: every seated pair is mutually passive with shared vision', () => {
  const sim = loadMap(MAP, { users: [0, 1, 2] });
  for (const i of [0, 1, 2]) {
    for (const j of [0, 1, 2]) {
      if (i === j) continue;
      assert.strictEqual(sim.alliance(i, j, 'ALLIANCE_PASSIVE'), true, `P${i}->P${j} passive`);
      assert.strictEqual(sim.alliance(i, j, 'ALLIANCE_SHARED_VISION'), true, `P${i}->P${j} vision`);
    }
  }
});
