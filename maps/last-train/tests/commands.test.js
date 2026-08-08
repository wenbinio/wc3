'use strict';
// Chat is META ONLY (gotcha 33 — the phase-2A doctrine): the reference
// commands, the -test debug gate, the -seed guard — and the pinned SILENCE
// of every deleted phase-1 gameplay verb. A chat row at combat tempo is a
// design FAIL; these tests keep the deleted verbs deleted.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { loadMap } = require('../../../lib/sim');

const MAP = path.join(__dirname, '..');

test('the 7 deleted gameplay chat verbs do NOT respond (no message, no state change)', () => {
  const sim = loadMap(MAP, { users: [0] });
  const msgs0 = sim.messages.length;
  for (const cmd of ['-class police', '-search', '-craft molotov', '-reload',
    '-sprint', '-fix', '-board']) {
    sim.chat(0, cmd);
  }
  assert.strictEqual(sim.messages.length, msgs0, 'total silence — the verbs are gone');
  assert.strictEqual(sim.global('Searches'), 0);
  assert.ok(sim.findUnit('h000', 0), 'still the Heartlander — chat -class is dead');
  assert.strictEqual(sim.player(0).lumber, 2, 'no reload spend');
});

test("'-test' gates every debug command; toggling is announced to all", () => {
  const sim = loadMap(MAP, { users: [0, 1] });
  sim.chat(1, '-gold 999');
  assert.strictEqual(sim.player(1).gold, 12, 'refused outside -test (heartlander clip stays)');
  assert.ok(sim.messagesTo(1).some((m) => /need -test mode/i.test(m.text)));

  sim.chat(1, '-test');
  assert.ok(sim.messagesTo(0).some((m) => /enabled -test debug mode/.test(m.text)),
    'announced to everyone');
  sim.chat(1, '-gold 999');
  assert.strictEqual(sim.player(1).gold, 999);
  sim.chat(1, '-clips 7');
  assert.strictEqual(sim.player(1).lumber, 7);

  sim.chat(1, '-test'); // gate re-arms
  sim.chat(1, '-gold 5');
  assert.strictEqual(sim.player(1).gold, 999, 'debug gate re-armed after toggle-off');
});

test('-help states the mouse-first loop, the ammo rule and the design credits', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-help');
  const texts = sim.messagesTo(0).map((m) => m.text).join('\n');
  assert.ok(/LAST TRAIN FROM YIO CHU KANG/.test(texts));
  assert.ok(/verbs are your MOUSE/.test(texts), 'the doctrine is stated');
  assert.ok(/Bullets are GOLD, clips are LUMBER/.test(texts));
  assert.ok(/The SIREN/.test(texts), 'the surge heartbeat is explained');
  assert.ok(/Chat is reference only/.test(texts));
  assert.ok(/A map by Serendipity/.test(texts), 'authorship line');
  assert.ok(/Zombie Defense Custom \(Lions_Blood\)/.test(texts), 'the ZCD credit');
  assert.ok(/Zombination v11 \(Trinin\)/.test(texts));
  assert.ok(/Zombie-Simulator 7 \(SpirulinaN\)/.test(texts));
  assert.ok(/Dawn of the Dead \(PreViO\)/.test(texts));
  assert.ok(/NotD: Special Ops/.test(texts));
  assert.ok(/SWAT: Aftermath/.test(texts));
  assert.ok(/nothing copied/i.test(texts));
});

test('-credits opens with the Serendipity byline; ZCD joins the design roll', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-credits');
  const msgs = sim.messagesTo(0).map((m) => m.text);
  assert.ok(/a map by Serendipity/.test(msgs[0]), 'byline first');
  const roll = msgs.join('\n');
  assert.ok(/HerrDave -- T-Virus Zombies, Police Officer, Urban Prop Pack/.test(roll));
  assert.ok(/Ilya Alaric \(after Ujimasa Hojo's Villager\) -- Citizen Pack/.test(roll));
  assert.ok(/bakr -- Assorted City Buildings/.test(roll));
  assert.ok(/Wayshan\/purparisien -- Modern Cars Pack/.test(roll));
  const iCommunity = msgs.findIndex((m) => /HerrDave/.test(m));
  const iSol = msgs.findIndex((m) => /Sol \(GPT 5\.6 Codex fleet\)/.test(m));
  assert.ok(iSol > iCommunity && iCommunity >= 0, 'Sol line after the human community roll');
  assert.ok(/Zombie Defense Custom \(Lions_Blood\)/.test(roll), 'ZCD credited');
  assert.ok(/Trinin/.test(roll) && /SpirulinaN/.test(roll) && /PreViO/.test(roll));
});

test('-status tracks the timeline, power, the surge clock and the player line', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-status');
  const t = sim.messagesTo(0).map((m) => m.text).join('\n');
  assert.ok(/arrives in 720s/.test(t));
  assert.ok(/0\/3 substations/.test(t));
  assert.ok(/surge in 120s/.test(t), 'the surge countdown is public state');
  assert.ok(/level 1, 12 rounds, 2 clips/.test(t));
});

test('-seed reseeds until the first commitment, refuses after, guards 10 digits', () => {
  const sim = loadMap(MAP, { users: [0] });
  assert.ok(sim.global('RUNLOG').startsWith('seed=20260807\n'), 'default seed logged');
  sim.chat(0, '-seed 123');
  assert.strictEqual(sim.global('RUNLOG'), 'seed=123\n', 'RUNLOG reset on reseed');
  assert.strictEqual(sim.global('RunSeed'), 123);

  sim.chat(0, '-seed 1234567890'); // 10 digits: refused on BOTH integer widths
  assert.ok(sim.messagesTo(0).some((m) => /refuses 1234567890/.test(m.text)));
  assert.strictEqual(sim.global('RunSeed'), 123);

  // the first rummage draw commits the night (and deals the nests)
  const hero = sim.findUnit('h000', 0);
  sim.moveUnit(hero, -300, -80); // the spawn void-deck bench
  sim.advance(3);
  assert.strictEqual(sim.global('SeedLocked'), true);
  assert.ok(/nests\|n=\d+/.test(sim.global('RUNLOG')), 'the nests are dealt at lock');
  sim.chat(0, '-seed 42');
  assert.ok(sim.messagesTo(0).some((m) => /already committed/.test(m.text)));
  assert.strictEqual(sim.global('RunSeed'), 123);
});

test('debug: -zspawn/-esc/-clearhorde/-clock/-ff/-runlog/-xp/-noise/-surge', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-test');
  const before = sim.global('HordeCount');
  sim.chat(0, '-zspawn sprinter 3');
  assert.strictEqual(sim.global('HordeCount'), before + 3);
  // 3 spawned + the preplaced 2F stairwell sprinter (phase 2B tower seed)
  assert.strictEqual(sim.unitsOf(24, 'u002').length, 4);

  sim.chat(0, '-esc 4');
  assert.strictEqual(sim.global('EscLevel'), 4);

  sim.chat(0, '-clearhorde');
  assert.strictEqual(sim.global('HordeCount'), 1, 'only the Broodmother remains');

  sim.chat(0, '-xp 170');
  assert.strictEqual(sim.run('return SurvLevel[0]')[0], 3, '170 xp at 80/level = level 3');

  sim.chat(0, '-noise 90');
  sim.chat(0, '-surge');
  assert.ok(/surge\|k=\d+\|\w+\|n=\d+\|heat=90/.test(sim.global('RUNLOG')),
    'forced surge reads the set noise');

  sim.chat(0, '-clock 705');
  assert.strictEqual(sim.global('GameClock'), 705);

  sim.chat(0, '-ff');
  assert.strictEqual(sim.global('ClockScale'), 4);
  sim.advance(2);
  assert.ok(sim.global('GameClock') >= 712, 'clock runs 4x');
  sim.chat(0, '-ff');
  assert.strictEqual(sim.global('ClockScale'), 1);

  sim.chat(0, '-runlog');
  assert.ok(sim.messagesTo(0).some((m) => /seed=20260807/.test(m.text)));
});
