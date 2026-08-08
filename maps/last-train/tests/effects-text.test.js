'use strict';
// PHASE 2B — the ZCD-grade juice and the TEXT DIET (playtest-2: "There's a
// very rich wealth of triggers and custom effects out there ... You put
// too much work into the text"). Every game beat now lands as an effect /
// sound / floating text (paths mined from the Zombie Defense Custom
// decomposition, all listfile-verified into lib/data/stock-art.json), and
// the chatty per-action lines are DELETED — this suite pins both sides:
// the effects fire (and are destroyed — ZCD's dummy hygiene), and the
// deleted lines never come back.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { loadMap } = require('../../../lib/sim');

const MAP = path.join(__dirname, '..');

const fxPaths = (sim) => sim.callsOf('AddSpecialEffect')
  .concat(sim.callsOf('AddSpecialEffectTarget')).map((c) => String(c.args[0]));
const tags = (sim) => sim.callsOf('SetTextTagText').map((c) => String(c.args[1]));

test('every scripted zombie spawn wears the AnimateDead raise flash (ZCD grammar)', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-test');
  sim.chat(0, '-zspawn shambler 2');
  const raises = fxPaths(sim).filter((p) => /AnimateDeadTarget/.test(p));
  assert.strictEqual(raises.length, 2, 'one flash per spawn');
});

test('kills bleed: the blood effect lands on every put-down zombie', () => {
  const sim = loadMap(MAP, { users: [0] });
  const hero = sim.findUnit('h000', 0);
  sim.chat(0, '-test');
  sim.chat(0, '-zspawn shambler 1');
  const zomb = sim.unitsOf(24, 'u000').filter((u) => u.alive).pop();
  sim.kill(zomb, hero);
  assert.ok(fxPaths(sim).some((p) => /HumanBloodLarge0/.test(p)), 'ZCD-style blood');
});

test('the corpse-rise window is a VISIBLE marker: created, then destroyed on rise', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-test');
  sim.chat(0, '-zspawn shambler 1');
  const zomb = sim.unitsOf(24, 'u000').filter((u) => u.alive).pop();
  const civ = sim.allUnits('n000').find((u) => u.alive);
  sim.kill(civ, zomb);
  assert.ok(fxPaths(sim).some((p) => /RaiseSkeleton/.test(p)), 'the window marker stands');
  const destroyed0 = sim.callsOf('DestroyEffect').length;
  sim.advance(4); // the corpse rises
  assert.ok(sim.callsOf('DestroyEffect').length > destroyed0,
    'the marker is destroyed at resolution (no leak)');
  // and the rise itself is SILENT now (the effect carries it)
  assert.strictEqual(sim.messagesMatching(/stands back up/).length, 0,
    'the per-rise announce is DELETED (text diet)');
});

test('molotov fire, cure dispel and infection drip all land as effects', () => {
  const sim = loadMap(MAP, { users: [0] });
  const hero = sim.findUnit('h000', 0);
  sim.chat(0, '-test');
  sim.chat(0, '-infectme');
  sim.advance(2); // one DoT tick
  assert.ok(fxPaths(sim).some((p) => /UnholyFrenzyTarget/.test(p)), 'the green drip shows');
  sim.chat(0, '-give bandage');
  hero.life = 500;
  sim.useItem(hero, [...sim.items.values()].find((i) => !i.removed
    && i.typeStr === 'I010' && i.ownerUnit === hero.handle));
  assert.ok(fxPaths(sim).some((p) => /DispelMagicTarget/.test(p)), 'the cure flashes');
  sim.chat(0, '-give molotov');
  sim.useItem(hero, [...sim.items.values()].find((i) => !i.removed
    && i.typeStr === 'I014' && i.ownerUnit === hero.handle));
  assert.ok(fxPaths(sim).some((p) => /FlameStrike1/.test(p)), 'fire blooms');
  assert.strictEqual(sim.messagesMatching(/Fire blooms across the wet tarmac/).length, 0,
    'the molotov report line is DELETED — the fire IS the report');
});

test('level-ups are a burst + sting, not a paragraph', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-test');
  const sounds0 = sim.callsOf('StartSound').length;
  sim.chat(0, '-xp 90');
  assert.ok(fxPaths(sim).some((p) => /Levelupcaster/.test(p)), 'the stock levelup burst');
  assert.ok(sim.callsOf('StartSound').length > sounds0, 'the sting');
  assert.strictEqual(sim.messagesMatching(/Harder to kill, harder hitting/).length, 0,
    'the level-up line is DELETED');
});

test('rummage talks in floating text; the loot pop replaces the two log lines', () => {
  const sim = loadMap(MAP, { users: [0] });
  const hero = sim.findUnit('h000', 0);
  sim.moveUnit(hero, -300, -80); // the spawn void-deck bench
  sim.advance(3);
  assert.ok(tags(sim).some((t) => /rummaging/.test(t)), 'the channel reads at the prop');
  assert.ok(fxPaths(sim).some((p) => /AIemTarget/.test(p)), 'the loot pop (ZCD item flash)');
  const all = sim.messagesTo(0).map((m) => m.text).join('\n');
  assert.ok(!/You start going through/.test(all), 'DELETED');
  assert.ok(!/You turn out the/.test(all), 'DELETED');
});

test('the deleted line families stay deleted across a full scripted run', () => {
  const sim = loadMap(MAP, { users: [0] });
  const hero = sim.findUnit('h000', 0);
  sim.chat(0, '-test');
  // exercise: rummage, smash, craft, clip pack, reload, sprint, buy, level
  sim.moveUnit(hero, -300, -80);
  sim.advance(4);
  const bench2 = sim.allUnits('n020').find((u) => u.alive && Math.abs(u.x - 260 - (-600)) < 400);
  if (bench2) sim.kill(bench2, hero);
  sim.chat(0, '-give cloth');
  sim.chat(0, '-give bottledwater');
  sim.chat(0, '-give clippack');
  const pack = [...sim.items.values()].find((i) => !i.removed && i.typeStr === 'I01A');
  if (pack) sim.pickup(hero, pack);
  sim.cast(hero, 'A000');
  sim.cast(hero, 'A001');
  sim.chat(0, '-xp 90');
  const shop = sim.findUnit('h01H');
  sim.moveUnit(hero, shop.x + 100, shop.y);
  sim.sell(shop, hero, 'I015');
  sim.advance(10);
  const all = sim.messagesTo(0).map((m) => m.text).join('\n');
  for (const dead of [
    /You start going through/, /You turn out the/, /Your hands know this one/,
    /banked \(\+1 clip\)/, /Racking a fresh clip/, /Fresh clip seated/,
    /You RUN/, /The towkay nods/, /Harder to kill/, /stands back up/,
    /Planks up, sandbags down/, /It helps more than it should/,
  ]) {
    assert.ok(!dead.test(all), `deleted line stays deleted: ${dead}`);
  }
});

test('the kept spine still speaks: siren, PA beats, verdicts, defection', () => {
  const sim = loadMap(MAP, { users: [0, 1] });
  sim.chat(0, '-test');
  sim.chat(0, '-deck');
  sim.advance(100);
  assert.ok(sim.messagesMatching(/THE SIREN/).length >= 1,
    'the siren line is KEPT (AnnounceAll = one per seat)');
  sim.chat(0, '-clock 299');
  sim.advance(1);
  assert.ok(sim.messagesMatching(/departed Tampines/).length > 0, 'the PA spine is KEPT');
  sim.chat(0, '-zspawn shambler 1');
  const zomb = sim.unitsOf(24, 'u000').filter((u) => u.alive).pop();
  sim.kill(sim.findUnit('h000', 1), zomb);
  assert.ok(sim.messagesMatching(/They hunt with the horde now/).length > 0,
    'defection announces are KEPT');
});

test('fire-and-forget hygiene: every one-shot effect is destroyed (ZCD dummy rule)', () => {
  const sim = loadMap(MAP, { users: [0] });
  const hero = sim.findUnit('h000', 0);
  sim.chat(0, '-test');
  sim.chat(0, '-zspawn shambler 3');
  for (const z of sim.unitsOf(24, 'u000').filter((u) => u.alive).slice(-3)) {
    sim.kill(z, hero);
  }
  sim.chat(0, '-xp 90');
  const created = sim.callsOf('AddSpecialEffect').length
    + sim.callsOf('AddSpecialEffectTarget').length;
  const destroyed = sim.callsOf('DestroyEffect').length;
  // the only live handles allowed are un-resolved corpse markers
  const liveMarkers = sim.run(
    'local n = 0 for _, r in ipairs(CorpseList) do'
    + ' if not r.risen and not r.burned then n = n + 1 end end return n')[0];
  assert.strictEqual(destroyed, created - liveMarkers,
    'created == destroyed + live corpse markers (nothing leaks)');
});

test('screen shake is SPARING: train arrival and brood death only (plus siege)', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.chat(0, '-test');
  sim.advance(30);
  assert.strictEqual(sim.callsOf('CameraSetTargetNoiseForPlayer').length, 0,
    'no shake in ordinary play');
  sim.chat(0, '-clock 719');
  sim.advance(1);
  assert.ok(sim.callsOf('CameraSetTargetNoiseForPlayer').length > 0,
    'the train arrival rumbles');
  assert.ok(sim.callsOf('CinematicFadeBJ').length > 0, 'and breathes a fade');
  sim.advance(4);
  assert.ok(sim.callsOf('CameraClearNoiseForPlayer').length > 0, 'the shake CLEARS');
});

test('game text volume: a full 200s estate run speaks under 3 lines a minute', () => {
  // the diet target pinned as behavior: phase 2A's chatter (rummage x2,
  // craft, clip, reload x2, level...) is gone; what remains is the spine
  const sim = loadMap(MAP, { users: [0] });
  const hero = sim.findUnit('h000', 0);
  sim.chat(0, '-test');
  sim.chat(0, '-deck');
  const baseline = sim.messagesTo(0).length; // intro + debug acks so far
  sim.moveUnit(hero, -300, -80);
  sim.advance(200); // rummage + wanderers + nests + siren 1 + surge 1
  const spoken = sim.messagesTo(0).length - baseline;
  assert.ok(spoken <= 10, `estate spine only: ${spoken} lines in 200s`);
});
