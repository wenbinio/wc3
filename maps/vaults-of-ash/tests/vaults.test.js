'use strict';
// Core logic tests for The Vaults of Ash, executed headlessly against the
// PACKED war3map.lua (generated constants + CreateAllUnits blocks included)
// by lib/sim — see docs/PIPELINE.md §8. Discovered by `npm test` and
// runnable alone via: node tools/test-map-logic.js maps/vaults-of-ash
//
// Covered here (phase-1 core, re-pinned on the phase-2 content):
//   seeded PRNG determinism (same seed = same dungeon, all randomness
//   through the map's own Park-Miller PRNG), -seed lock, door ->
//   teleport + room ACTIVE state machine over the authored template deck,
//   kill-all / survive / reliquary objectives with exact ember payouts,
//   boon draft 3-take-1, campfire purchases (trigger-owned embers),
//   reroll, Vault's Breath stacking, boss phase one-shot thresholds +
//   slam swap, full-wipe defeat + summary, co-op spawn scaling.
//
// Phase-2 systems (sigils/wrath/trials/insight/covenants/death/feast/
// affixes) live in phase2.test.js; the flagship scripted playthrough in
// golden-run.test.js.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { loadMap } = require('../../../lib/sim');

const MAP = path.join(__dirname, '..');

// hub geometry (mirrors regions.json / assets/generate-terrain.mjs)
const DOOR = { A: [-1344, -5504], B: [-448, -5504], C: [448, -5504], GATE: [1344, -5504] };
const BOON_PLATE = { A: [-576, -6208], B: [0, -6208], C: [576, -6208] };
const SHRINE = { heal: [896, -7040], reroll: [1216, -7040], fortify: [1536, -7040] };
// all 30 boon item rawcodes (I000-I007 phase 1, I011-I032 phase 2)
const BOON_ITEM_TYPES = [];
for (let i = 0; i <= 7; i++) BOON_ITEM_TYPES.push('I00' + i);
for (let i = 11; i <= 32; i++) BOON_ITEM_TYPES.push('I0' + i);

const hero = (sim, pid) => sim.findUnit('H000', pid || 0);
const creeps = (sim) => sim.unitsOf(24).filter((u) => u.alive);
// the six Floor Guardian unit types (phase 3)
const GUARDIAN_TYPES = ['u030', 'u031', 'u032', 'u033', 'u034', 'u035'];
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
  assert.ok(sim.messagesTo(0).some((m) => /-seed works only before any covenant or door/.test(m.text)),
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
  // default seed: door A -> island F1D (x 4672..7232, y -3968..-1920), Bone Gallery template
  assert.ok(h.x > 4672 && h.x < 7232 && h.y > -3968 && h.y < -1920,
    `hero teleported into room F1D, got (${h.x}, ${h.y})`);
  assert.match(runlog(sim), /enter\|room=F1D\|tmpl=BONEGALLERY\|obj=killall\|danger=2\|reward=embers/);
  assert.ok(creeps(sim).length > 0, 'room is ACTIVE: creeps spawned');
  assert.ok(sim.callsOf('PanCameraToTimedForPlayer').length > pansBefore, 'entry camera beat');
  assert.ok(sim.messagesTo(0).some((m) => /the seal breaks/.test(m.text)), 'activation announced');
});

test('kill-all: clearing pays EXACTLY 20+20*danger embers, and only when the LAST hostile (incl. the Guardian) falls', () => {
  const sim = loadMap(MAP, { users: [0] });
  const h = hero(sim);
  sim.moveUnit(h, ...DOOR.A); // F1D Bone Gallery, kill-all danger 2 (pinned by the default seed)
  const all = creeps(sim);
  const pack = all.filter((u) => !GUARDIAN_TYPES.includes(u.typeStr));
  const guardian = all.find((u) => GUARDIAN_TYPES.includes(u.typeStr));
  assert.strictEqual(pack.length, 5, 'solo Bone Gallery d2: 3 Vaultbone Archers + 2 Vault Kobolds');
  assert.ok(guardian, 'plus the Floor Guardian (phase 3)');
  assert.strictEqual(pack.filter((u) => u.typeStr === 'u014').length, 3, '3 Vaultbone Archers');
  assert.strictEqual(pack.filter((u) => u.typeStr === 'u001').length, 2, '2 Vault Kobolds');
  for (const u of pack) sim.kill(u, h);
  assert.strictEqual(sim.player(0).gold, 0, 'no payout while the Guardian still stands');
  assert.ok(!runlog(sim).includes('clear|'), 'not cleared yet');
  sim.kill(guardian, h);
  assert.strictEqual(sim.player(0).gold, 100, 'danger 2 pays exactly 60 (+40 ember-cache reward)');
  assert.match(runlog(sim), /clear\|room=F1D\|t=\d+\|embers=60\|total=60/);
  sim.advance(3);
  assert.deepStrictEqual([h.x, h.y], [-128, -6592], 'party returned to the hub');
});

test('survive: the room clears when the 60s countdown expires, not before, and trickles reinforcements', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-test');
  sim.chat(0, '-room survive 2');
  assert.match(runlog(sim), /debugroom\|floor=1\|tmpl=HOWLPIT\|obj=survive\|danger=2/);
  assert.strictEqual(creeps(sim).length, 3, 'solo Howlpit d2 opens with 3 Sootfang Pups');
  sim.advance(30);
  assert.ok(creeps(sim).length > 3, 'reinforcements trickle in while the clock runs');
  assert.ok(!runlog(sim).includes('clear|'), 'not cleared at 30s');
  assert.strictEqual(sim.player(0).gold, 0);
  sim.advance(31);
  assert.match(runlog(sim), /clear\|room=F1A\|t=6\d\|embers=60/, 'cleared after 60s, danger 2 pays 60');
  assert.strictEqual(creeps(sim).length, 0, 'survivors crumble with the seal');
});

test('guarded reliquary: killing every guard breaks the seal and draws a relic from the six-deep deck', () => {
  const sim = loadMap(MAP, { users: [0] });
  const h = hero(sim);
  sim.chat(0, '-test');
  sim.chat(0, '-room reliquary 2');
  assert.strictEqual(sim.allUnits('n004').length, 1, 'the Sealed Reliquary stands in the room');
  const guards = creeps(sim);
  assert.strictEqual(guards.length, 5, 'solo Reliquary Niche d2 posts 3 Acolytes + 2 Cinder Zealots');
  const RELIC_ITEMS = ['I008', 'I033', 'I034', 'I035', 'I036', 'I037'];
  assert.strictEqual(RELIC_ITEMS.reduce((n, t) => n + sim.itemsByType(t).length, 0), 0);
  for (const u of guards) sim.kill(u, h);
  assert.match(runlog(sim), /reliquary\|looted/);
  assert.match(runlog(sim), /relic\|Lantern of the Order/, 'the drawn relic is seeded and pinned');
  assert.strictEqual(RELIC_ITEMS.reduce((n, t) => n + sim.itemsByType(t).length, 0), 1,
    'exactly one relic item drops');
  assert.match(runlog(sim), /clear\|room=F1A\|t=\d+\|embers=60/);
});

test('boon draft is 3-take-1: taking one applies its effect and consumes the others', () => {
  const sim = loadMap(MAP, { users: [0] });
  const h = hero(sim);
  sim.chat(0, '-test');
  sim.chat(0, '-boon');
  assert.strictEqual(draftItemCount(sim), 3, 'three boons materialize on the pedestals');
  // fresh-state -boon draft offer (pinned by the default seed):
  assert.match(runlog(sim),
    /boonoffer\|Quiet Step \[COMMON\/Void\]\|Lightwarden's Oath \[EPIC\/Light\]\|Ashbreaker \[RARE\/Ash\]/);
  const agiBefore = h.agi;
  sim.moveUnit(h, ...BOON_PLATE.A); // plate A = Quiet Step (+3 Agility, +15 ms)
  assert.strictEqual(h.agi, agiBefore + 3, 'Quiet Step: +3 Agility applied');
  assert.strictEqual(h.moveSpeed, 320 + 15, 'Quiet Step: +15 move speed applied');
  assert.strictEqual(draftItemCount(sim), 0, 'the unclaimed boons are consumed');
  assert.match(runlog(sim), /boontake\|pid=0\|Quiet Step/);
  assert.ok(sim.messagesTo(0).some((m) => /claims Quiet Step/.test(m.text)));
  // the draft is spent: stepping another plate does nothing
  sim.moveUnit(h, ...BOON_PLATE.B);
  assert.strictEqual(h.agi, agiBefore + 3, 'no double-dipping after the draft resolves');
});

test('ability boons go through UnitAddAbility with the generated ABIL_ constant', () => {
  const sim = loadMap(MAP, { users: [0] });
  const h = hero(sim);
  sim.chat(0, '-test');
  const addsBefore = sim.callsOf('UnitAddAbility').length;
  sim.chat(0, '-grant bash'); // Ashbreaker: ability grant
  const adds = sim.callsOf('UnitAddAbility');
  assert.strictEqual(adds.length, addsBefore + 1, 'exactly one ability grant recorded');
  assert.strictEqual(adds[adds.length - 1].args[0], h.handle, 'granted to the taking hero');
  assert.match(runlog(sim), /debuggrant\|Ashbreaker/);
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
  assert.match(runlog(sim), /boss\|pattern=Spark Swarm/, 'the add-pattern is seeded and announced');

  // phase 2 at 80%: adds once, no slam swap yet
  sim.natives.SetWidgetLife(boss.handle, 3200 * 0.79);
  sim.advance(2);
  assert.strictEqual(sim.allUnits('u009').filter((u) => u.alive).length, 3,
    'Spark Swarm phase 2 sheds 3 Heart Sparks (solo)');
  assert.strictEqual(sim.callsOf('UnitRemoveAbility').length, 0, 'slam not swapped in phase 2');
  sim.advance(5); // still below 80%: must not re-trigger
  assert.strictEqual(sim.allUnits('u009').filter((u) => u.alive).length, 3, 'phase 2 fires exactly once');
  assert.strictEqual((runlog(sim).match(/boss\|phase=2/g) || []).length, 1);

  // phase 3 at 40%: adds + Vault Slam -> Heartshatter Slam
  sim.natives.SetWidgetLife(boss.handle, 3200 * 0.39);
  sim.advance(2);
  assert.strictEqual(sim.allUnits('u010').filter((u) => u.alive).length, 2,
    'Spark Swarm phase 3 sheds 2 Molten Shards (solo)');
  const removes = sim.callsOf('UnitRemoveAbility');
  const adds = sim.callsOf('UnitAddAbility');
  assert.strictEqual(removes.length, 1, 'old slam removed exactly once');
  assert.strictEqual(removes[0].args[0], boss.handle);
  assert.ok(adds.some((c) => c.args[0] === boss.handle), 'Heartshatter Slam granted to the boss');
  sim.advance(5);
  assert.strictEqual((runlog(sim).match(/boss\|phase=3/g) || []).length, 1, 'phase 3 fires exactly once');
});

test('permadeath is the FULL WIPE: one fallen torch pends a rekindle, the last one ends the run with a summary', () => {
  const sim = loadMap(MAP, { users: [0, 1] });
  sim.kill(sim.findUnit('H000', 0));
  sim.advance(3);
  assert.strictEqual(sim.player(0).result, null, 'one living torch keeps the run alive');
  assert.ok(sim.messagesTo(1).some((m) => /torch of .* gutters out/.test(m.text)));
  assert.ok(sim.messagesTo(1).some((m) => /Clear the next landing/.test(m.text)),
    'the rekindle path is announced (death choreography, not silent loss)');
  sim.kill(sim.findUnit('H000', 1));
  sim.advance(3);
  assert.strictEqual(sim.player(0).result, 'defeat');
  assert.strictEqual(sim.player(1).result, 'defeat');
  const summary = sim.messagesTo(0).map((m) => m.text).find((t) => /VAULTS OF ASH -- DEFEAT/.test(t));
  assert.ok(summary, 'defeat summary shown');
  assert.match(summary, /Rooms cleared: 0/);
  assert.match(summary, /Deaths: 2/);
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
  assert.match(summary, /Sigils: /);
  assert.match(summary, /Wrath peak: /);
  assert.match(summary, /Trials cleared: /);
  assert.match(summary, /Insight: /);
  assert.match(summary, /Covenants: /);
  assert.match(summary, /Seed: 20260711/);
  assert.match(runlog(sim), /boss\|dead/);
});

test('co-op scaling: spawn counts multiply by 1.6 per extra player, rounded up per pack (plus ONE unscaled Guardian)', () => {
  const counts = {};
  for (const users of [[0], [0, 1], [0, 1, 2]]) {
    const sim = loadMap(MAP, { users });
    assert.strictEqual(sim.allUnits('H000').length, users.length,
      'one Torchbearer per seated player');
    sim.moveUnit(sim.findUnit('H000', 0), ...DOOR.A); // same seed -> same door/room
    const all = creeps(sim);
    assert.strictEqual(all.filter((u) => GUARDIAN_TYPES.includes(u.typeStr)).length, 1,
      `${users.length}p: exactly one Floor Guardian (count never scales, only its stats)`);
    counts[users.length] = all.filter((u) => !GUARDIAN_TYPES.includes(u.typeStr)).length;
  }
  // Bone Gallery d2 = packs of 3 archers + 2 kobolds, scaled per pack
  assert.strictEqual(counts[1], 5, 'solo baseline: 3 + 2 = 5');
  assert.strictEqual(counts[2], Math.ceil(3 * 1.6) + Math.ceil(2 * 1.6), 'two players: 5 + 4 = 9');
  assert.strictEqual(counts[3], Math.ceil(3 * 2.56) + Math.ceil(2 * 2.56), 'three players: 8 + 6 = 14');
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
