'use strict';
// THE GOLDEN RUN — the flagship logic test for The Vaults of Ash.
//
// A complete scripted solo playthrough on the DEFAULT SEED (20260711)
// through the full phase-3 game: take up the ASHBLADE at the hero pedestals
// (the innate Cinder Step blink granted by trigger), swear the Covenant of
// Stillness, take the floor-1 TRIAL door (Trial of the Gale on the Ember
// Creche — the vault breathes every 30s inside), survive it into the
// GUARDIAN STANDOFF against the Vampiric Hollow King (its mantle signature
// fires at half life), break it and DESCEND THROUGH THE DOOR AT ITS CORPSE
// (Ulfsire's exit-from-corpse beat, credited), fight two more affixed Floor
// Guardians on the way down, draft a boon, loot the Ashen Codex from a
// sealed reliquary, ride Stillness-accelerated Wrath to 100%, meet the
// announced Ash Revenant ambush INSIDE THE BOSS ARENA, break it for its
// guaranteed rare-or-better boon, spend embers at the campfire before the
// Heart's ember feast, kill the Vault Heart through its seeded Spark Swarm
// aspect, and earn the flawless-victory vow phrase — asserting the full
// beat sequence and every exact payout. Because every random draw flows
// through the map's own seeded PRNG (identical under the game's Lua and
// fengari), this whole transcript is pinned: if ANY beat drifts, this test
// names the beat.
//
// Runs with vaults.test.js / phase2.test.js / phase3.test.js via `npm test`
// or node tools/test-map-logic.js maps/vaults-of-ash

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { loadMap, fourCC } = require('../../../lib/sim');

const MAP = path.join(__dirname, '..');
const DOOR = { A: [-1344, -5504], B: [-448, -5504], GATE: [1344, -5504], TRIAL: [-1600, -5888] };
const PEDESTAL = { ashblade: [-1280, -6496] };
const ALTAR = { stillness: [-1280, -7040] };
const PLATE = { B: [0, -6208] };
const SHRINE = { heal: [896, -7040], fortify: [1536, -7040] };
const HUB = [-128, -6592];
const GUARDIAN_TYPES = ['u030', 'u031', 'u032', 'u033', 'u034', 'u035'];

test('GOLDEN RUN: full phase-3 playthrough on seed 20260711 hits every pinned beat', () => {
  const sim = loadMap(MAP, { users: [0] });
  const hero = () => sim.findUnit('H001', 0) || sim.findUnit('H000', 0);
  const creeps = () => sim.unitsOf(24).filter((u) => u.alive);
  const theGuardian = () => creeps().find((u) => GUARDIAN_TYPES.includes(u.typeStr));
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
  assert.strictEqual(hero().typeStr, 'H000', 'the default hero is the Torchbearer');
  assert.strictEqual(hero().maxLife, 650, 'Torchbearer max life from object data');

  // ---- the hero pedestals: take up the Ashblade (phase 3) ----------------
  sim.moveUnit(hero(), ...PEDESTAL.ashblade);
  assert.match(log(), /hero\|pid=0\|ashblade/);
  assert.strictEqual(hero().typeStr, 'H001', 'the Ashblade replaces the Torchbearer');
  assert.strictEqual(hero().maxLife, 520, 'Ashblade: the glass cannon carries only 520 life');
  assert.strictEqual(hero().moveSpeed, 350, 'Ashblade: 350 base move speed');
  assert.ok(sim.callsOf('UnitAddAbility').some((c) =>
    c.args[0] === hero().handle && c.args[1] === fourCC('A007')),
    'the innate Cinder Step blink (A007) granted via UnitAddAbility');
  assert.ok(msgs().some((t) => /takes up the Ashblade: the glass cannon .* CINDER STEP/.test(t)),
    'the kit (incl. the innate) is announced in words');

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
  assert.strictEqual(creeps().length, 7,
    '5 Kindling Whelps + 1 affixed elite (danger 3) + the Floor Guardian');
  assert.match(log(), /elite\|Ashveiled Kindled Overseer/, 'the elite affix is seeded and pinned');
  assert.match(log(), /variant\|EMBERCRECHE\|v3\|cairns/,
    'the seeded interior variant is pinned (twin rubble cairns)');
  assert.match(log(), /guardian\|Vampiric Hollow King\|floor=1\|sig=mantle/,
    'the Floor Guardian draw and its affix are seeded and pinned');
  assert.ok(msgs().some((t) => /FLOOR GUARDIAN -- Vampiric Hollow King .* The way down opens at its corpse\./.test(t)),
    'the Guardian and the exit-from-corpse rule are announced on entry');
  sim.advance(61);
  assert.strictEqual(sim.global('VaultBreathStacks'), 2,
    'the Gale is real: two breaths inside one 60s room');
  assert.match(log(), /standoff\|guardian/,
    'the trash crumbles at 60s but the Guardian holds the descent');
  assert.ok(!log().includes('clear|'), 'no clear while the Guardian stands');

  // the Hollow King's signature: the wrathfire mantle at half life, once
  const hk = theGuardian();
  assert.ok(hk && hk.typeStr === 'u035', 'only the Hollow King remains');
  sim.natives.SetWidgetLife(hk.handle, hk.maxLife * 0.49);
  const addsBeforeMantle = sim.callsOf('UnitAddAbility').length;
  sim.advance(2);
  assert.match(log(), /guardiansig\|mantle/, 'the mantle signature fires at half life');
  assert.strictEqual(sim.callsOf('UnitAddAbility').length, addsBeforeMantle + 1,
    'the Wrathfire Slam is granted to the Guardian');
  assert.ok(Math.abs(hk.life - hk.maxLife * (0.49 + 0.25)) < 0.001,
    'the mantle knits exactly a quarter of its wounds');
  sim.advance(5);
  assert.strictEqual((log().match(/guardiansig\|mantle/g) || []).length, 1,
    'the mantle fires exactly once');

  sim.kill(hk, hero());
  assert.match(log(), /guardian\|slain\|Vampiric Hollow King\|x=1984\|y=-2624/,
    'the corpse position is pinned');
  assert.ok(msgs().some((t) => /the descent door TEARS OPEN AT ITS CORPSE/.test(t)),
    'exit-from-corpse announced (Ulfsire beat, credited)');
  sim.advance(4);
  assert.match(log(), /clear\|room=F1C\|t=68\|embers=80\|total=80/, 'danger 3 pays exactly 80');
  assert.match(log(), /descend\|corpse\|x=1984\|y=-2624/,
    'the party descends through the corpse door');
  assert.match(log(), /trial\|clear\|gale/);
  assert.strictEqual(sim.global('InsightLevel'), 1, 'trial payout: +1 Insight');
  assert.strictEqual(hero().moveSpeed, 370, 'trial payout: +20 move speed over the 350 base');
  assert.match(log(), /wrath\|=22\|clear 68s/, 'survive wrath 15 x1.5 (Stillness) = 22');

  // ---- floor 2 deal (pinned): Insight 1 now counts the vault-born --------
  assert.match(log(),
    /deal\|floor=2\|A=F2A:TOLLROAD:killall:d2:embers\|B=F2D:GEOMANCY:killall:d2:boon\|C=F2B:SMUGGLERS:reliquary:d2:embers/,
    'floor 2 deal is the pinned seeded deal');
  assert.ok(msgs().some((t) => /Omen -- Door B: danger !! \/ reward: a Boon draft \/ \d+ vault-born/.test(t)),
    'Insight 1: omens now include exact creep counts (Guardian included)');

  // ---- room 2: door B -> Geomancer Circle (kill-all, boon reward) --------
  sim.moveUnit(hero(), ...DOOR.B);
  assert.match(log(), /enter\|room=F2D\|tmpl=GEOMANCY\|obj=killall\|danger=2\|reward=boon/);
  assert.match(log(), /variant\|GEOMANCY\|v3\|braziers/, 'interior variant pinned');
  assert.match(log(), /guardian\|Shielded Gale Matriarch\|floor=2\|sig=pulse/,
    'floor 2 draws a DIFFERENT Guardian (the 6-pool deals without replacement)');
  for (let i = 0; i < 25 && creeps().length > 0; i++) {
    for (const u of creeps()) sim.kill(u, hero());
  }
  assert.match(log(), /guardian\|slain\|Shielded Gale Matriarch\|x=5952\|y=576/);
  sim.advance(4);
  assert.match(log(), /clear\|room=F2D\|t=0\|embers=60\|total=140/, 'danger 2 pays exactly 60');
  assert.match(log(), /descend\|corpse\|x=5952\|y=576/);
  assert.match(log(), /wrath\|=82\|clear 0s/, '22 + fast 40x1.5=60 -> 82');

  // ---- boon draft (pinned, pre-dealt at the floor deal) -------------------
  assert.match(log(),
    /boonoffer\|Void Tithe \[COMMON\/Void\]\|Red Vigil \[COMMON\/Blood\]\|Quiet Step \[COMMON\/Void\]/,
    'draft offer pinned, every boon labeled with rarity and sigil');
  const strBefore = hero().str;
  sim.moveUnit(hero(), ...PLATE.B); // Red Vigil: +5 Strength, heal 50%
  assert.match(log(), /boontake\|pid=0\|Red Vigil/);
  assert.strictEqual(hero().str, strBefore + 5, 'Red Vigil: +5 Strength applied');

  // ---- floor 3 deal (pinned), decline its trial, door A -> reliquary ------
  assert.match(log(),
    /deal\|floor=3\|A=F3C:SEALVAULT:reliquary:d2:embers\|B=F3A:HEXGALLERY:killall:d1:boon\|C=F3D:OGREDEPTHS:killall:d3:embers/,
    'floor 3 deal is the pinned seeded deal');
  assert.match(log(), /trial\|offer\|floor=3\|cinders\|F3B:LASTHUNT/,
    'a second trial is offered on floor 3');
  sim.moveUnit(hero(), ...DOOR.A);
  assert.match(log(), /trial\|declined/, 'taking a normal door declines the trial');
  assert.match(log(), /enter\|room=F3C\|tmpl=SEALVAULT\|obj=reliquary\|danger=2\|reward=embers/);
  assert.match(log(), /variant\|SEALVAULT\|v3\|braziers/);
  assert.match(log(), /guardian\|Volatile Blood Provost\|floor=3\|sig=drain/,
    'floor 3: a THIRD distinct Guardian, Volatile-affixed');
  for (let i = 0; i < 25 && creeps().length > 0; i++) {
    for (const u of creeps()) sim.kill(u, hero());
  }
  assert.match(log(), /volatile\|burst/, 'the Volatile Guardian corpse bursts into fodder');
  assert.match(log(), /reliquary\|looted/);
  assert.match(log(), /relic\|Ashen Codex/, 'the relic deck draw is pinned');
  assert.strictEqual(sim.global('InsightLevel'), 2, 'the Ashen Codex: +1 Insight (now 2)');
  sim.advance(4);
  assert.match(log(), /clear\|room=F3C\|t=0\|embers=60\|total=200/, 'danger 2 pays exactly 60');
  assert.match(log(), /wrath\|=100\|clear 0s/, '82 + fast 60 caps the meter');
  assert.match(log(), /wrath\|full/);
  assert.ok(msgs().some((t) => /WRATH 100% .* ASH REVENANT.* will ambush the party at the NEXT room/.test(t)),
    'the ambush is announced one room ahead — embrace it or slow down');

  // ---- the campfire lights, the Vault Gate unseals ------------------------
  assert.match(log(), /campfire\|lit/, 'shrine lit after the 3rd cleared room');
  assert.match(log(), /gate\|unsealed/, 'Vault Gate unsealed after three rooms');
  const h = hero();
  h.life = 200; // wounded from the descent
  sim.moveUnit(h, ...SHRINE.heal);
  assert.strictEqual(sim.player(0).gold, 180, 'heal: -60 embers');
  assert.strictEqual(h.life, 200 + h.maxLife * 0.5, 'heal restored half of max life');
  sim.moveUnit(h, ...SHRINE.fortify);
  assert.strictEqual(sim.player(0).gold, 105, 'fortify: -75 embers');
  assert.strictEqual(h.maxLife, 620, 'fortify: +100 max life over the Ashblade 520');

  // ---- the Vault Heart: Spark Swarm aspect, the Revenant finds you here ---
  sim.moveUnit(hero(), ...DOOR.GATE);
  assert.match(log(), /boss\|enter/);
  assert.match(log(), /boss\|pattern=Spark Swarm/, 'the seeded add-pattern is Spark Swarm');
  assert.ok(msgs().some((t) => /wakes in its SPARK SWARM aspect .* FEED ON HOARDED EMBERS/.test(t)),
    'aspect and ember feast are both telegraphed at the gate');
  assert.match(log(), /revenant\|ambush\|Shielded Ash Revenant/,
    'the armed Wrath ambush lands even in the boss arena');
  const boss = sim.findUnit('u008');
  assert.ok(boss && boss.maxLife === 3200, 'the Vault Heart beats in the arena');
  assert.ok(hero().y > 4224, 'party teleported to the summit');

  sim.natives.SetWidgetLife(boss.handle, 3200 * 0.79);
  sim.advance(2);
  assert.match(log(), /boss\|phase=2\|adds=3/, 'Spark Swarm phase 2: 3 Heart Sparks');
  sim.natives.SetWidgetLife(boss.handle, 3200 * 0.39);
  sim.advance(2);
  assert.match(log(), /boss\|phase=3\|adds=2\|feast=10/,
    'Spark Swarm phase 3: 2 Molten Shards, and the Heart feeds: 105 embers -> +10 damage');
  assert.strictEqual(sim.callsOf('UnitRemoveAbility').length, 1, 'Vault Slam removed');
  assert.ok(sim.callsOf('UnitAddAbility').some((c) => c.args[0] === boss.handle),
    'Heartshatter Slam granted');

  // break the Revenant for its guaranteed rare-or-better boon, then the Heart
  const rev = sim.findUnit('u029');
  assert.ok(rev && rev.alive, 'the Shielded Ash Revenant still stalks the arena');
  sim.kill(rev, hero());
  assert.match(log(), /revenant\|slain/);
  assert.match(log(), /revenant\|boon\|Stormheart Core/, 'the bounty draw is pinned (epic, Storm)');

  sim.kill(boss, hero());
  sim.advance(6);
  assert.strictEqual(sim.player(0).result, 'victory', 'the Heart is broken');
  assert.match(log(), /vow\|earned/, 'a flawless (0-death) victory earns the vow');
  assert.ok(msgs().some((t) => /speak '-vow \w+' before the first door of any future descent/.test(t)),
    'the knowledge-code phrase is whispered to the victors');
  const summary = msgs().find((t) => /VAULTS OF ASH -- VICTORY/.test(t));
  assert.ok(summary, 'victory summary shown');
  assert.match(summary, /Torchbearers: Player 1: Ashblade/, 'the hero kind is in the summary');
  assert.match(summary, /Floor reached: 4\/4/);
  assert.match(summary, /Rooms cleared: 3/);
  assert.match(summary, /Guardians slain: 3/);
  assert.match(summary, /Embers earned: 240/);
  assert.match(summary, /Boons: Red Vigil, Stormheart Core/);
  assert.match(summary, /Sigils: Storm x1, Blood x1/);
  assert.match(summary, /Wrath peak: 100%/);
  assert.match(summary, /Trials cleared: 1/);
  assert.match(summary, /Insight: 2/);
  assert.match(summary, /Deaths: 0/);
  assert.match(summary, /Covenants: .*Covenant of Stillness/);
  assert.match(summary, /Seed: 20260711/);

  // ---- the whole beat sequence, in order ----------------------------------
  const beats = log().trim().split('\n').filter((l) =>
    /^(seed|deal|trial|hero|covenant|door|enter|elite|variant|guardian|standoff|guardiansig|descend|clear|insight|reward|boonoffer|boontake|sigil|campfire|gate|relic|reliquary|wrath|revenant|boss|vow|summary|victory)/.test(l));
  const expected = [
    'seed=20260711',
    'deal|floor=1|A=F1D:BONEGALLERY:killall:d2:embers|B=F1B:PROCESSION:killall:d2:boon|C=F1A:RELICNICHE:reliquary:d2:boon',
    'trial|offer|floor=1|gale|F1C:EMBERCRECHE',
    'hero|pid=0|ashblade',
    'covenant|pid=0|stillness',
    'door|TRIAL|floor=1',
    'enter|room=F1C|tmpl=EMBERCRECHE|obj=survive|danger=3|reward=trial:gale',
    'elite|Ashveiled Kindled Overseer|x=2120|y=-3288',
    'variant|EMBERCRECHE|v3|cairns',
    'guardian|Vampiric Hollow King|floor=1|sig=mantle',
    'standoff|guardian',
    'guardiansig|mantle',
    'guardian|slain|Vampiric Hollow King|x=1984|y=-2624',
    'clear|room=F1C|t=68|embers=80|total=80',
    'descend|corpse|x=1984|y=-2624',
    'insight|=1|Trial of the Gale',
    'trial|clear|gale',
    'wrath|=22|clear 68s',
    'deal|floor=2|A=F2A:TOLLROAD:killall:d2:embers|B=F2D:GEOMANCY:killall:d2:boon|C=F2B:SMUGGLERS:reliquary:d2:embers',
    'door|B|floor=2',
    'enter|room=F2D|tmpl=GEOMANCY|obj=killall|danger=2|reward=boon',
    'variant|GEOMANCY|v3|braziers',
    'guardian|Shielded Gale Matriarch|floor=2|sig=pulse',
    'guardian|slain|Shielded Gale Matriarch|x=5952|y=576',
    'clear|room=F2D|t=0|embers=60|total=140',
    'descend|corpse|x=5952|y=576',
    'reward|boon',
    'wrath|=82|clear 0s',
    'boonoffer|Void Tithe [COMMON/Void]|Red Vigil [COMMON/Blood]|Quiet Step [COMMON/Void]',
    'boontake|pid=0|Red Vigil',
    'deal|floor=3|A=F3C:SEALVAULT:reliquary:d2:embers|B=F3A:HEXGALLERY:killall:d1:boon|C=F3D:OGREDEPTHS:killall:d3:embers',
    'trial|offer|floor=3|cinders|F3B:LASTHUNT',
    'trial|declined',
    'door|A|floor=3',
    'enter|room=F3C|tmpl=SEALVAULT|obj=reliquary|danger=2|reward=embers',
    'variant|SEALVAULT|v3|braziers',
    'guardian|Volatile Blood Provost|floor=3|sig=drain',
    'guardian|slain|Volatile Blood Provost|x=1984|y=3776',
    'reliquary|looted',
    'insight|=2|Ashen Codex',
    'relic|Ashen Codex',
    'clear|room=F3C|t=0|embers=60|total=200',
    'descend|corpse|x=1984|y=3776',
    'reward|embers|+40',
    'wrath|=100|clear 0s',
    'wrath|full',
    'campfire|lit',
    'gate|unsealed',
    'campfire|heal|-60',
    'campfire|fortify|-75',
    'boss|enter',
    'boss|pattern=Spark Swarm',
    'revenant|ambush|Shielded Ash Revenant',
    'boss|phase=2|adds=3',
    'boss|phase=3|adds=2|feast=10',
    'revenant|slain',
    'revenant|boon|Stormheart Core',
    'boss|dead',
    'vow|earned',
    'summary|VICTORY',
    'victory',
  ];
  assert.deepStrictEqual(beats, expected, 'the golden run beat sequence is byte-exact');
});
