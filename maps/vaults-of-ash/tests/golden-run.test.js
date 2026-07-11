'use strict';
// THE GOLDEN RUN — the flagship logic test for The Vaults of Ash.
//
// A complete scripted solo playthrough on the DEFAULT SEED (20260711)
// through the full phase-2 game: swear the Covenant of Stillness, take the
// floor-1 TRIAL door (Trial of the Gale on the Ember Creche — the vault
// breathes every 30s inside), survive it, descend through a survive room
// and a guarded reliquary, draft sigil-marked boons into an ASH 2pc set,
// ride Stillness-accelerated Wrath to 100%, meet the announced Ash
// Revenant ambush INSIDE THE BOSS ARENA, break it for its guaranteed rare
// boon, spend embers at the campfire before the Heart's ember feast, kill
// the Vault Heart through its seeded Shard Ring aspect, and earn the
// flawless-victory vow phrase — asserting the full beat sequence and every
// exact payout. Because every random draw flows through the map's own
// seeded PRNG (identical under the game's Lua and fengari), this whole
// transcript is pinned: if ANY beat drifts, this test names the beat.
//
// Runs with vaults.test.js / phase2.test.js via `npm test` or
// node tools/test-map-logic.js maps/vaults-of-ash

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { loadMap } = require('../../../lib/sim');

const MAP = path.join(__dirname, '..');
const DOOR = { B: [-448, -5504], C: [448, -5504], GATE: [1344, -5504], TRIAL: [-1600, -5888] };
const ALTAR = { stillness: [-1280, -7040] };
const PLATE = { A: [-576, -6208], C: [576, -6208] };
const SHRINE = { heal: [896, -7040], fortify: [1536, -7040] };
const HUB = [-128, -6592];

test('GOLDEN RUN: full phase-2 playthrough on seed 20260711 hits every pinned beat', () => {
  const sim = loadMap(MAP, { users: [0] });
  const hero = () => sim.findUnit('H000', 0);
  const creeps = () => sim.unitsOf(24).filter((u) => u.alive);
  const log = () => sim.global('RUNLOG');
  const msgs = () => sim.messagesTo(0).map((m) => m.text.replace(/\|c[0-9a-fA-F]{8}|\|r/g, ''));

  // ---- the hub: seed, floor-1 deal and trial offer are pinned ------------
  assert.ok(log().startsWith('seed=20260711\n'), 'default seed logged');
  assert.match(log(),
    /deal\|floor=1\|A=F1D:BONEGALLERY:killall:d2:embers\|B=F1B:PROCESSION:killall:d2:boon\|C=F1A:RELICNICHE:reliquary:d2:boon/,
    'floor 1 deal is the pinned seeded deal (template keys included)');
  assert.match(log(), /trial\|offer\|floor=1\|gale\|F1C:EMBERCRECHE/,
    'the fourth door offers the Trial of the Gale on the leftover island');
  assert.strictEqual(sim.player(0).gold, 0, 'the party starts with no embers');
  assert.strictEqual(hero().maxLife, 650, 'Torchbearer max life from object data');

  // ---- swear the Covenant of Stillness (explicit terms announced) --------
  sim.moveUnit(hero(), ...ALTAR.stillness);
  assert.match(log(), /covenant\|pid=0\|stillness/);
  assert.ok(msgs().some((t) => /swears the Covenant of Stillness\. Reward: .*\+1 Insight\. Price: Wrath builds half again as fast\./.test(t)),
    'reward AND price printed at the altar');
  sim.moveUnit(hero(), ...HUB);

  // ---- room 1: THE TRIAL — Ember Creche, survive 60s under the Gale ------
  sim.moveUnit(hero(), ...DOOR.TRIAL);
  assert.match(log(), /door\|TRIAL\|floor=1/);
  assert.match(log(), /enter\|room=F1C\|tmpl=EMBERCRECHE\|obj=survive\|danger=3\|reward=trial:gale/);
  assert.strictEqual(creeps().length, 6, '5 Kindling Whelps + 1 affixed elite (danger 3)');
  assert.match(log(), /elite\|Ashveiled Kindled Overseer/, 'the elite affix is seeded and pinned');
  sim.advance(61);
  assert.strictEqual(sim.global('VaultBreathStacks'), 2,
    'the Gale is real: two breaths inside one 60s room');
  sim.advance(4);
  assert.match(log(), /clear\|room=F1C\|t=60\|embers=80\|total=80/, 'danger 3 pays exactly 80');
  assert.match(log(), /trial\|clear\|gale/);
  assert.strictEqual(sim.global('InsightLevel'), 1, 'trial payout: +1 Insight');
  assert.strictEqual(hero().moveSpeed, 340, 'trial payout: +20 move speed over the 320 base');
  assert.match(log(), /wrath\|=22\|clear 60s/, 'survive wrath 15 x1.5 (Stillness) = 22');

  // ---- floor 2 deal (pinned): Insight 1 now counts the vault-born --------
  assert.match(log(),
    /deal\|floor=2\|A=F2B:GRAVEWATCH:reliquary:d1:relic\|B=F2C:HOWLINGDARK:survive:d2:boon\|C=F2D:BRUTEHALL:killall:d2:embers/,
    'floor 2 deal is the pinned seeded deal');
  assert.ok(msgs().some((t) => /Omen -- Door B: danger !! \/ reward: a Boon draft \/ \d+ vault-born/.test(t)),
    'Insight 1: omens now include exact creep counts');

  // ---- room 2: door B -> the Howling Dark (survive, boon reward) ---------
  sim.moveUnit(hero(), ...DOOR.B);
  assert.match(log(), /enter\|room=F2C\|tmpl=HOWLINGDARK\|obj=survive\|danger=2\|reward=boon/);
  assert.strictEqual(creeps().length, 3, 'opens with 3 Chained Howlers (solo, danger 2)');
  sim.advance(30);
  assert.ok(creeps().length > 3, 'the onslaught trickles reinforcements');
  sim.advance(31);
  assert.match(log(), /clear\|room=F2C\|t=6\d\|embers=60\|total=140/, 'danger 2 pays exactly 60');
  assert.match(log(), /wrath\|=44\|clear 6\ds/, '22 + 22 = 44');
  sim.advance(3);

  // ---- boon draft 1 (pinned, pre-dealt at the floor deal) -----------------
  assert.match(log(),
    /boonoffer\|Cinderguard \[RARE\/Ash\]\|Dawnward Flame \[COMMON\/Light\]\|Tempest Brand \[RARE\/Storm\]/,
    'draft 1 offer pinned, every boon labeled with rarity and sigil');
  sim.moveUnit(hero(), ...PLATE.A); // Cinderguard: Ash rare, evasion ability
  assert.match(log(), /boontake\|pid=0\|Cinderguard/);
  assert.ok(sim.callsOf('UnitAddAbility').some((c) => c.args[0] === hero().handle),
    'Cinderguard Evasion granted via UnitAddAbility');

  // ---- floor 3 deal (pinned), door C -> the Sealed Vault reliquary --------
  assert.match(log(),
    /deal\|floor=3\|A=F3B:CINDERSTORM:survive:d1:embers\|B=F3D:LASTHUNT:survive:d2:embers\|C=F3A:SEALVAULT:reliquary:d1:boon/,
    'floor 3 deal is the pinned seeded deal');
  sim.moveUnit(hero(), ...DOOR.C);
  assert.match(log(), /enter\|room=F3A\|tmpl=SEALVAULT\|obj=reliquary\|danger=1\|reward=boon/);
  const guards = creeps();
  assert.strictEqual(guards.length, 3, '2 Twice-Burned Zealots + 1 Vaultbound Ogre');
  const strBefore = hero().str;
  for (const u of guards) sim.kill(u, hero());
  assert.match(log(), /reliquary\|looted/);
  assert.match(log(), /relic\|Bloodward Icon/, 'the relic deck draw is pinned');
  assert.strictEqual(hero().str, strBefore + 3, 'Bloodward Icon: +3 Strength to the party');
  assert.match(log(), /clear\|room=F3A\|t=0\|embers=40\|total=180/, 'danger 1 pays exactly 40');
  assert.match(log(), /wrath\|=100\|clear 0s/, '44 + fast 40x1.5=60 caps the meter');
  assert.match(log(), /wrath\|full/);
  assert.ok(msgs().some((t) => /WRATH 100% .* ASH REVENANT.* will ambush the party at the NEXT room/.test(t)),
    'the ambush is announced one room ahead — embrace it or slow down');
  sim.advance(3);

  // ---- the campfire lights, draft 2, the Vault Gate unseals ---------------
  assert.match(log(), /campfire\|lit/, 'shrine lit after the 3rd cleared room');
  assert.match(log(),
    /boonoffer\|Ashen Grace \[COMMON\/Storm\]\|Red Vigil \[COMMON\/Blood\]\|Ashbreaker \[RARE\/Ash\]/,
    'draft 2 offer pinned (the pre-dealt door offer)');
  assert.match(log(), /gate\|unsealed/, 'Vault Gate unsealed after three rooms');
  const strBeforeAsh = hero().str;
  sim.moveUnit(hero(), ...PLATE.C); // Ashbreaker: second Ash boon
  assert.match(log(), /boontake\|pid=0\|Ashbreaker/);
  assert.match(log(), /sigil\|ash\|2/, 'ASH 2pc set completes');
  assert.strictEqual(hero().str, strBeforeAsh + 4, 'Ash 2pc: party +4 Strength');
  assert.ok(msgs().some((t) => /SIGIL SET -- ASH x2 active: party \+4 Strength/.test(t)),
    'the set bonus is announced in words');

  const h = hero();
  h.life = 200; // wounded from the descent
  sim.moveUnit(h, ...SHRINE.heal);
  assert.strictEqual(sim.player(0).gold, 120, 'heal: -60 embers');
  assert.strictEqual(h.life, 200 + h.maxLife * 0.5, 'heal restored half of max life');
  sim.moveUnit(h, ...SHRINE.fortify);
  assert.strictEqual(sim.player(0).gold, 45, 'fortify: -75 embers');
  assert.strictEqual(h.maxLife, 750, 'fortify: +100 max life');

  // ---- the Vault Heart: Shard Ring aspect, the Revenant finds you here ----
  sim.moveUnit(hero(), ...DOOR.GATE);
  assert.match(log(), /boss\|enter/);
  assert.match(log(), /boss\|pattern=Shard Ring/, 'the seeded add-pattern is Shard Ring');
  assert.ok(msgs().some((t) => /wakes in its SHARD RING aspect .* FEED ON HOARDED EMBERS/.test(t)),
    'aspect and ember feast are both telegraphed at the gate');
  assert.match(log(), /revenant\|ambush\|Volatile Ash Revenant/,
    'the armed Wrath ambush lands even in the boss arena');
  const boss = sim.findUnit('u008');
  assert.ok(boss && boss.maxLife === 3200, 'the Vault Heart beats in the arena');
  assert.ok(hero().y > 4224, 'party teleported to the summit');

  sim.natives.SetWidgetLife(boss.handle, 3200 * 0.79);
  sim.advance(2);
  assert.match(log(), /boss\|phase=2\|adds=2/, 'Shard Ring phase 2: 2 Heart Sparks');
  sim.natives.SetWidgetLife(boss.handle, 3200 * 0.39);
  sim.advance(2);
  assert.match(log(), /boss\|phase=3\|adds=4\|feast=4/,
    'Shard Ring phase 3: 4 Molten Shards, and the Heart feeds: 45 embers -> +4 damage');
  assert.strictEqual(sim.callsOf('UnitRemoveAbility').length, 1, 'Vault Slam removed');
  assert.ok(sim.callsOf('UnitAddAbility').some((c) => c.args[0] === boss.handle),
    'Heartshatter Slam granted');

  // break the Revenant for its guaranteed rare boon, then the Heart
  const rev = sim.findUnit('u029');
  assert.ok(rev && rev.alive, 'the Volatile Ash Revenant still stalks the arena');
  const agiBefore = hero().agi;
  sim.kill(rev, hero());
  assert.match(log(), /revenant\|slain/);
  assert.match(log(), /revenant\|boon\|Tempest Brand/, 'the bounty draw is pinned (rare, Storm)');
  assert.strictEqual(hero().agi, agiBefore + 8, 'Tempest Brand: +8 Agility applied at once');

  sim.kill(boss, hero());
  sim.advance(6);
  assert.strictEqual(sim.player(0).result, 'victory', 'the Heart is broken');
  assert.match(log(), /vow\|earned/, 'a flawless (0-death) victory earns the vow');
  assert.ok(msgs().some((t) => /speak '-vow \w+' before the first door of any future descent/.test(t)),
    'the knowledge-code phrase is whispered to the victors');
  const summary = msgs().find((t) => /VAULTS OF ASH -- VICTORY/.test(t));
  assert.ok(summary, 'victory summary shown');
  assert.match(summary, /Floor reached: 4\/4/);
  assert.match(summary, /Rooms cleared: 3/);
  assert.match(summary, /Embers earned: 180/);
  assert.match(summary, /Boons: Cinderguard, Ashbreaker, Tempest Brand/);
  assert.match(summary, /Sigils: Ash x2 \(2pc\), Storm x1/);
  assert.match(summary, /Wrath peak: 100%/);
  assert.match(summary, /Trials cleared: 1/);
  assert.match(summary, /Insight: 1/);
  assert.match(summary, /Deaths: 0/);
  assert.match(summary, /Covenants: .*Covenant of Stillness/);
  assert.match(summary, /Seed: 20260711/);

  // ---- the whole beat sequence, in order ----------------------------------
  const beats = log().trim().split('\n').filter((l) =>
    /^(seed|deal|trial|covenant|door|enter|elite|clear|insight|reward|boonoffer|boontake|sigil|campfire|gate|relic|reliquary|wrath|revenant|boss|vow|summary|victory)/.test(l));
  const expected = [
    'seed=20260711',
    'deal|floor=1|A=F1D:BONEGALLERY:killall:d2:embers|B=F1B:PROCESSION:killall:d2:boon|C=F1A:RELICNICHE:reliquary:d2:boon',
    'trial|offer|floor=1|gale|F1C:EMBERCRECHE',
    'covenant|pid=0|stillness',
    'door|TRIAL|floor=1',
    'enter|room=F1C|tmpl=EMBERCRECHE|obj=survive|danger=3|reward=trial:gale',
    'elite|Ashveiled Kindled Overseer|x=2120|y=-3288',
    'clear|room=F1C|t=60|embers=80|total=80',
    'insight|=1|Trial of the Gale',
    'trial|clear|gale',
    'wrath|=22|clear 60s',
    'deal|floor=2|A=F2B:GRAVEWATCH:reliquary:d1:relic|B=F2C:HOWLINGDARK:survive:d2:boon|C=F2D:BRUTEHALL:killall:d2:embers',
    'door|B|floor=2',
    'enter|room=F2C|tmpl=HOWLINGDARK|obj=survive|danger=2|reward=boon',
    'clear|room=F2C|t=60|embers=60|total=140',
    'reward|boon',
    'wrath|=44|clear 60s',
    'boonoffer|Cinderguard [RARE/Ash]|Dawnward Flame [COMMON/Light]|Tempest Brand [RARE/Storm]',
    'boontake|pid=0|Cinderguard',
    'deal|floor=3|A=F3B:CINDERSTORM:survive:d1:embers|B=F3D:LASTHUNT:survive:d2:embers|C=F3A:SEALVAULT:reliquary:d1:boon',
    'door|C|floor=3',
    'enter|room=F3A|tmpl=SEALVAULT|obj=reliquary|danger=1|reward=boon',
    'reliquary|looted',
    'relic|Bloodward Icon',
    'clear|room=F3A|t=0|embers=40|total=180',
    'reward|boon',
    'wrath|=100|clear 0s',
    'wrath|full',
    'campfire|lit',
    'boonoffer|Ashen Grace [COMMON/Storm]|Red Vigil [COMMON/Blood]|Ashbreaker [RARE/Ash]',
    'gate|unsealed',
    'boontake|pid=0|Ashbreaker',
    'sigil|ash|2',
    'campfire|heal|-60',
    'campfire|fortify|-75',
    'boss|enter',
    'boss|pattern=Shard Ring',
    'revenant|ambush|Volatile Ash Revenant',
    'boss|phase=2|adds=2',
    'boss|phase=3|adds=4|feast=4',
    'revenant|slain',
    'revenant|boon|Tempest Brand',
    'boss|dead',
    'vow|earned',
    'summary|VICTORY',
    'victory',
  ];
  assert.deepStrictEqual(beats, expected, 'the golden run beat sequence is byte-exact');
});
