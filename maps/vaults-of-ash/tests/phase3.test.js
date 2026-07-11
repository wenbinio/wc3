'use strict';
// Phase-3 systems tests for The Vaults of Ash, executed headlessly against
// the PACKED war3map.lua by lib/sim (docs/PIPELINE.md §8). Covers the three
// capstone systems that flipped the conceded comparison-matrix rows
// (docs/reference/roguelike-comparison.md):
//   * THREE PLAYABLE HEROES — Torchbearer / Ashblade / Chorister, picked at
//     the hub pedestals before the first door (covenant-altar pattern),
//     distinct object-data kits, trigger-granted innates (Cinder Step
//     blink; Kindled Chorus heal with real math in co-op), identity math
//     3 heroes x 4 covenants x 5 sigil paths = 60.
//   * FLOOR GUARDIANS — a seeded 6-pool of affixed mid-bosses (Ulfsire's
//     Guardian promotion, credited), one per real-door room, drawn without
//     replacement across the run's floors, each with one scripted signature
//     behavior; the descent door SPAWNS AT THE GUARDIAN'S CORPSE
//     (Ulfsire's exit-from-corpse, credited).
//   * SEEDED INTERIOR VARIANTS — each of the 20 room templates carries 3
//     authored obstacle arrangements (6-key library, seeded jitter):
//     two runs on different seeds provably differ in room interiors.
//
// Deterministic seeds: every scenario that depends on a specific seeded
// outcome (a guardian, a variant) pins the seed that produces it — the
// map's Park-Miller PRNG replays identically here and in game.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { loadMap, fourCC } = require('../../../lib/sim');

const MAP = path.join(__dirname, '..');

// hub geometry (regions.json via assets/generate-terrain.mjs)
const DOOR = { A: [-1344, -5504] };
const PEDESTAL = { torch: [-1600, -6496], ashblade: [-1280, -6496], chorister: [-960, -6496] };
const BOON_PLATE_A = [-576, -6208];
const HUB = [-128, -6592];

const GUARDIAN_TYPES = ['u030', 'u031', 'u032', 'u033', 'u034', 'u035'];
const HERO_TYPES = ['H000', 'H001', 'H002'];
const ARRANGEMENT_KEYS = ['colonnade', 'cairns', 'braziers', 'rubble', 'walls', 'ossuary'];

const fresh = (opts) => loadMap(MAP, Object.assign({ users: [0] }, opts));
const heroOf = (sim, pid) => {
  for (const t of HERO_TYPES) {
    const u = sim.findUnit(t, pid || 0);
    if (u && u.alive) return u;
  }
  return null;
};
const creeps = (sim) => sim.unitsOf(24).filter((u) => u.alive);
const theGuardian = (sim) => creeps(sim).find((u) => GUARDIAN_TYPES.includes(u.typeStr));
const runlog = (sim) => sim.global('RUNLOG');
const plainMsgs = (sim, pid) => sim.messagesTo(pid || 0).map((m) => m.text.replace(/\|c[0-9a-fA-F]{8}|\|r/g, ''));
const killRoom = (sim) => {
  for (let g = 0; g < 25 && creeps(sim).length > 0; g++) {
    for (const u of creeps(sim)) sim.kill(u, heroOf(sim));
  }
};

// ---------------------------------------------------------------- heroes ---

test('hero pedestals: the Ashblade swap — glass-cannon kit from object data, innate Cinder Step granted by trigger', () => {
  const sim = fresh();
  const torch = sim.findUnit('H000', 0);
  assert.strictEqual(torch.maxLife, 650, 'default Torchbearer before any pick');
  sim.moveUnit(torch, ...PEDESTAL.ashblade);
  assert.match(runlog(sim), /hero\|pid=0\|ashblade/);
  const ash = sim.findUnit('H001', 0);
  assert.ok(ash && ash.alive, 'the Ashblade hero replaces the Torchbearer');
  assert.strictEqual(torch.removed, true, 'the old torch is gone, not orphaned');
  assert.strictEqual(ash.maxLife, 520, 'Ashblade uhpm: 520 (glass cannon)');
  assert.strictEqual(ash.moveSpeed, 350, 'Ashblade umvs: 350 (faster than the 320 base)');
  assert.deepStrictEqual([ash.str, ash.agi, ash.int], [14, 22, 12], 'agility-heavy statline');
  assert.ok(sim.callsOf('UnitAddAbility').some((c) =>
    c.args[0] === ash.handle && c.args[1] === fourCC('A007')),
    'the innate Cinder Step blink (ABIL_CINDER_STEP = A007) is granted via UnitAddAbility — the recorded ability call the sim can assert');
  assert.ok(plainMsgs(sim).some((t) => /takes up the Ashblade: the glass cannon .* CINDER STEP \(a 600-range blink, 9s cooldown\)/.test(t)),
    'the kit and the innate are announced in words');
});

test('hero pedestals: the Chorister swap — support kit from object data, no blink, chorus announced in the kit text', () => {
  const sim = fresh();
  sim.moveUnit(sim.findUnit('H000', 0), ...PEDESTAL.chorister);
  assert.match(runlog(sim), /hero\|pid=0\|chorister/);
  const ch = sim.findUnit('H002', 0);
  assert.ok(ch && ch.alive, 'the Chorister hero replaces the Torchbearer');
  assert.strictEqual(ch.maxLife, 780, 'Chorister uhpm: 780 (tough)');
  assert.strictEqual(ch.moveSpeed, 300, 'Chorister umvs: 300 (slow)');
  assert.deepStrictEqual([ch.str, ch.agi, ch.int], [16, 10, 22], 'intelligence-heavy statline');
  assert.ok(!sim.callsOf('UnitAddAbility').some((c) =>
    c.args[0] === ch.handle && c.args[1] === fourCC('A007')),
    'no blink for the Chorister — the kits are distinct');
  assert.ok(plainMsgs(sim).some((t) => /takes up the Chorister: .*KINDLED CHORUS \(mends every torchbearer within 700 range for 20 life every 10s, announced\)/.test(t)));
});

test('Kindled Chorus: real heal math in 2-player co-op — 20 life per 10s tick, range-gated, capped at max, announced', () => {
  const sim = loadMap(MAP, { users: [0, 1] });
  sim.moveUnit(sim.findUnit('H000', 0), ...PEDESTAL.chorister);
  const ch = sim.findUnit('H002', 0);
  const ally = sim.findUnit('H000', 1);
  sim.moveUnit(ch, ...HUB); // (=~344 range from the ally's spawn: in chorus range)
  ch.life = 700;   // wounded chorister (max 780)
  ally.life = 300; // wounded ally (max 650)
  sim.advance(9);
  assert.strictEqual(ally.life, 300, 'no tick before the 10s cadence');
  sim.advance(1);
  assert.strictEqual(ch.life, 720, 'the chorus mends its own singer (+20)');
  assert.strictEqual(ally.life, 320, 'and the nearby ally (+20) — exact math, not a stub');
  assert.match(runlog(sim), /chorus\|healed=2/);
  assert.ok(plainMsgs(sim, 1).some((t) => /Kindled Chorus: the Chorister's song mends 2 torchbearers \(\+20 life\)/.test(t)),
    'every tick is announced to the party');
  // range gate: a far ally is not mended
  sim.moveUnit(ally, 5952, -2944); // a floor-1 island, far beyond 700 range
  sim.advance(10);
  assert.strictEqual(ally.life, 320, 'out-of-range ally untouched by the next tick');
  assert.strictEqual(ch.life, 740, 'the singer still mends itself');
  assert.match(runlog(sim), /chorus\|healed=1/);
  // cap: never above max life
  ch.life = ch.maxLife - 5;
  sim.advance(10);
  assert.strictEqual(ch.life, ch.maxLife, 'heal capped at maximum life');
});

test('hero picks: Torchbearer by default, re-pickable before the first door, locked after it; -hero debug is gated', () => {
  const sim = fresh();
  // re-pick freely before the first door: ashblade -> chorister -> torch
  sim.moveUnit(heroOf(sim), ...PEDESTAL.ashblade);
  sim.moveUnit(heroOf(sim), ...PEDESTAL.chorister);
  assert.ok(sim.findUnit('H002', 0).alive, 're-picked to Chorister');
  sim.moveUnit(heroOf(sim), ...PEDESTAL.torch);
  const back = sim.findUnit('H000', 0);
  assert.ok(back && back.alive && back.maxLife === 650, 'and back to the Torchbearer');
  assert.match(runlog(sim), /hero\|pid=0\|ashblade[\s\S]*hero\|pid=0\|chorister[\s\S]*hero\|pid=0\|torch/);
  // no pick = torch: enter a door as the default hero
  sim.moveUnit(heroOf(sim), ...DOOR.A);
  assert.strictEqual(heroOf(sim).typeStr, 'H000', 'the default Torchbearer descends');
  killRoom(sim);
  sim.advance(4);
  // after the first door the pedestals refuse
  sim.moveUnit(heroOf(sim), ...PEDESTAL.ashblade);
  assert.ok(plainMsgs(sim).some((t) => /The pedestals answer only before the first door/.test(t)));
  assert.strictEqual(heroOf(sim).typeStr, 'H000', 'no late swap');
  // -hero is a debug command, gated behind -test
  sim.chat(0, '-hero ashblade');
  assert.ok(plainMsgs(sim).some((t) => /need -test mode/i.test(t)));
  sim.chat(0, '-test');
  sim.chat(0, '-hero ashblade');
  assert.strictEqual(heroOf(sim).typeStr, 'H001', 'debug -hero swaps even mid-run');
});

test('run-identity math: 3 hero kinds x 4 covenants x 5 sigil paths = 60 (computed from the live data tables)', () => {
  const sim = fresh();
  assert.strictEqual(sim.global('IdentityCount'), 60,
    'IdentityCount is derived at load from HERO_KINDS x COVENANTS x SIGIL_ORDER');
  // the three kinds are real, distinct object-data units
  const fs = require('fs');
  const units = JSON.parse(fs.readFileSync(path.join(MAP, 'objects-units.json'), 'utf8')).custom;
  const heroKeys = Object.keys(units).filter((k) => /^H00[0-2]:/.test(k));
  assert.strictEqual(heroKeys.length, 3, 'H000/H001/H002 all ship in object data');
  const names = heroKeys.map((k) => units[k].find((m) => m.id === 'unam').value);
  assert.deepStrictEqual(names.sort(), ['Ashblade', 'Chorister', 'Torchbearer']);
  for (const k of heroKeys) {
    const mods = units[k];
    for (const field of ['unam', 'utip', 'utub', 'uhpm', 'umvs']) {
      assert.ok(mods.some((m) => m.id === field), `${k}: full identity kit incl. ${field} (gotcha 23)`);
    }
  }
});

test('the hero kind is a named line in the run summary', () => {
  const sim = fresh();
  sim.moveUnit(heroOf(sim), ...PEDESTAL.chorister);
  sim.chat(0, '-test');
  sim.chat(0, '-boss');
  sim.kill(sim.findUnit('u008'), heroOf(sim));
  sim.advance(6);
  const summary = plainMsgs(sim).find((t) => /VAULTS OF ASH -- VICTORY/.test(t));
  assert.ok(summary, 'victory summary shown');
  assert.match(summary, /Torchbearers: Player 1: Chorister/);
  assert.match(summary, /Guardians slain: 0/);
});

// -------------------------------------------------------- floor guardians ---

test('every real-door room is warded by exactly one affixed Floor Guardian, announced with its signature and the corpse-door rule', () => {
  const sim = fresh(); // default seed, door A -> F1D Bone Gallery
  sim.moveUnit(heroOf(sim), ...DOOR.A);
  const g = creeps(sim).filter((u) => GUARDIAN_TYPES.includes(u.typeStr));
  assert.strictEqual(g.length, 1, 'exactly one Guardian in the room');
  assert.match(runlog(sim),
    /guardian\|(Burning|Shielded|Swift|Volatile|Vampiric|Ashveiled) (Bone Warden|Gale Matriarch|Blood Provost|Void Curator|Pyre Sentinel|Hollow King)\|floor=1\|sig=\w+/,
    'the Guardian carries a seeded affix in its name');
  assert.ok(sim.callsOf('BlzSetUnitName').length >= 1, 'the affixed name is applied to the unit');
  assert.ok(plainMsgs(sim).some((t) => /FLOOR GUARDIAN -- \w+ [\w ]+ \(.+\) wards this floor's final room: .+\. The way down opens at its corpse\./.test(t)),
    'affix effect, signature and the exit-from-corpse rule announced in words');
});

test('the Guardian pool ROTATES across seeds (4+ distinct floor-1 guardians on seeds 1/3/4/7/35)', () => {
  const seen = new Set();
  for (const s of [1, 3, 4, 7, 35]) {
    const sim = fresh();
    sim.chat(0, `-seed ${s}`);
    sim.moveUnit(heroOf(sim), ...DOOR.A);
    const m = /guardian\|\w+ ([\w ]+)\|floor=1\|sig=(\w+)/.exec(runlog(sim));
    assert.ok(m, `seed ${s}: a Guardian spawns`);
    seen.add(m[1]);
  }
  assert.ok(seen.size >= 4, `rotation is real: ${seen.size} distinct guardians across 5 seeds (${[...seen].join(', ')})`);
});

test('within one run the 6-pool deals WITHOUT replacement: three floors, three distinct guardians', () => {
  const sim = fresh();
  sim.chat(0, '-seed 1');
  sim.chat(0, '-test');
  const keys = [];
  for (const f of [1, 2, 3]) {
    if (f > 1) sim.chat(0, `-floor ${f}`);
    sim.moveUnit(heroOf(sim), ...DOOR.A);
    const lines = runlog(sim).split('\n').filter((l) => /^guardian\|[\w ]+\|floor=/.test(l));
    keys.push(/sig=(\w+)/.exec(lines[lines.length - 1])[1]);
    sim.chat(0, '-clear');
    sim.advance(3);
  }
  assert.strictEqual(new Set(keys).size, 3,
    `three floors draw three DISTINCT guardians (${keys.join(', ')})`);
});

test('exit-from-corpse: the descent door unit rises exactly where the Guardian fell, and the party descends through it', () => {
  const sim = fresh(); // default seed, door A
  sim.moveUnit(heroOf(sim), ...DOOR.A);
  const g = theGuardian(sim);
  assert.ok(g, 'the Guardian stands');
  const doorsBefore = sim.allUnits('n000').filter((u) => u.alive).length;
  // drag the fight across the room so the corpse position is non-trivial
  sim.moveUnit(g, 5210, -3111);
  sim.kill(g, heroOf(sim));
  assert.match(runlog(sim), /guardian\|slain\|[\w ]+\|x=5210\|y=-3111/, 'corpse position logged');
  const doors = sim.allUnits('n000').filter((u) => u.alive);
  assert.strictEqual(doors.length, doorsBefore + 1, 'a new Sealstone Door unit rises');
  assert.ok(doors.some((u) => u.x === 5210 && u.y === -3111), 'EXACTLY at the corpse');
  assert.ok(plainMsgs(sim).some((t) => /The Guardian falls -- the descent door TEARS OPEN AT ITS CORPSE/.test(t)),
    'the Ulfsire exit-from-corpse beat is announced');
  // finishing the room descends through it
  killRoom(sim);
  assert.match(runlog(sim), /descend\|corpse\|x=5210\|y=-3111/);
  sim.advance(4);
  assert.deepStrictEqual([heroOf(sim).x, heroOf(sim).y], [-128, -6592], 'party back at the hub');
});

test('signature SUMMON (Bone Warden, seed 4): calls 2 vault-born at half life, exactly once', () => {
  const sim = fresh();
  sim.chat(0, '-seed 4');
  sim.moveUnit(heroOf(sim), ...DOOR.A);
  assert.match(runlog(sim), /guardian\|Swift Bone Warden\|floor=1\|sig=summon/);
  const g = theGuardian(sim);
  const before = creeps(sim).length;
  sim.natives.SetWidgetLife(g.handle, g.maxLife * 0.49);
  sim.advance(2);
  assert.match(runlog(sim), /guardiansig\|summon/);
  assert.strictEqual(creeps(sim).length, before + 2, '2 vault-born claw free at 50%');
  assert.ok(plainMsgs(sim).some((t) => /calls the ossuary: 2 vault-born claw free/.test(t)));
  sim.advance(10);
  assert.strictEqual((runlog(sim).match(/guardiansig\|summon/g) || []).length, 1,
    'the summon fires exactly once');
  assert.strictEqual(creeps(sim).length, before + 2, 'no re-summon below the threshold');
});

test('signature ENRAGE (Pyre Sentinel, seed 35): +60% damage below a quarter life, exactly once', () => {
  const sim = fresh();
  sim.chat(0, '-seed 35');
  sim.moveUnit(heroOf(sim), ...DOOR.A);
  assert.match(runlog(sim), /guardian\|Vampiric Pyre Sentinel\|floor=1\|sig=enrage/);
  const g = theGuardian(sim);
  const dmgCallsBefore = sim.callsOf('BlzSetUnitBaseDamage').filter((c) => c.args[0] === g.handle).length;
  sim.natives.SetWidgetLife(g.handle, g.maxLife * 0.24);
  sim.advance(2);
  assert.match(runlog(sim), /guardiansig\|enrage/);
  const dmgCalls = sim.callsOf('BlzSetUnitBaseDamage').filter((c) => c.args[0] === g.handle);
  assert.strictEqual(dmgCalls.length, dmgCallsBefore + 1, 'base damage reassigned on ignition');
  assert.ok(plainMsgs(sim).some((t) => /IGNITES: \+60% damage/.test(t)));
  sim.advance(10);
  assert.strictEqual((runlog(sim).match(/guardiansig\|enrage/g) || []).length, 1,
    'the enrage fires exactly once');
});

test('signature PULSE (Gale Matriarch, seed 7): 25 life torn from every torchbearer every 15s, never below 1', () => {
  const sim = fresh();
  sim.chat(0, '-seed 7');
  sim.moveUnit(heroOf(sim), ...DOOR.A);
  assert.match(runlog(sim), /guardian\|Ashveiled Gale Matriarch\|floor=1\|sig=pulse/);
  const h = heroOf(sim);
  assert.strictEqual(h.life, 650);
  sim.advance(15);
  assert.strictEqual(h.life, 625, 'the shriek tears exactly 25 life');
  assert.match(runlog(sim), /guardiansig\|pulse\|1/);
  h.life = 10; // at the brink
  sim.advance(15);
  assert.strictEqual(h.life, 1, 'the pulse never snuffs a torch (floor at 1 life)');
});

test('signature DRAIN (Blood Provost, seed 3): tithes 20 life per hero every 20s and drinks the sum', () => {
  const sim = fresh();
  sim.chat(0, '-seed 3');
  sim.moveUnit(heroOf(sim), ...DOOR.A);
  assert.match(runlog(sim), /guardian\|Volatile Blood Provost\|floor=1\|sig=drain/);
  const g = theGuardian(sim);
  const h = heroOf(sim);
  sim.natives.SetWidgetLife(g.handle, g.maxLife - 500); // wounded, so the drink shows
  const gBefore = g.life;
  sim.advance(20);
  assert.strictEqual(h.life, 630, 'exactly 20 life tithed from the hero');
  assert.strictEqual(g.life, gBefore + 20, 'and drunk by the Provost');
  assert.match(runlog(sim), /guardiansig\|drain\|20/);
});

test('signature SIPHON (Void Curator, seed 1): curates 15 embers out of the party pool every 20s', () => {
  const sim = fresh();
  sim.chat(0, '-seed 1');
  sim.chat(0, '-test');
  sim.chat(0, '-embers 100');
  sim.moveUnit(heroOf(sim), ...DOOR.A);
  assert.match(runlog(sim), /guardian\|Swift Void Curator\|floor=1\|sig=siphon/);
  sim.advance(20);
  assert.strictEqual(sim.player(0).gold, 85, '15 embers curated away');
  sim.advance(20);
  assert.strictEqual(sim.player(0).gold, 70, 'and again on the next pulse');
  assert.strictEqual((runlog(sim).match(/guardiansig\|siphon\|-15/g) || []).length, 2);
  assert.ok(plainMsgs(sim).some((t) => /curates 15 Embers out of the party's pool/.test(t)));
});

// ------------------------------------------------------- interior variants ---

test('interior variants: 20 templates x 3 authored variants, every key from the 6-arrangement library', () => {
  const idx = fresh().global('VariantIndex');
  const entries = idx.split(';');
  assert.strictEqual(entries.length, 20, 'all 20 templates carry variants');
  for (const e of entries) {
    const [tmpl, list] = e.split('=');
    const keys = list.split(',');
    assert.strictEqual(keys.length, 3, `${tmpl}: exactly 3 variants`);
    assert.strictEqual(new Set(keys).size, 3, `${tmpl}: variants are distinct`);
    for (const k of keys) {
      assert.ok(ARRANGEMENT_KEYS.includes(k), `${tmpl}: ${k} is a library arrangement`);
    }
  }
});

test('variants are SEEDED: same seed = same interior, different seeds provably differ on the SAME template (Bone Gallery: seeds 1 vs 14)', () => {
  const variantLine = (seed) => {
    const sim = fresh();
    if (seed !== null) sim.chat(0, `-seed ${seed}`);
    sim.moveUnit(heroOf(sim), ...DOOR.A);
    return runlog(sim).split('\n').find((l) => l.startsWith('variant|'));
  };
  // replay determinism: the identical seed deals the identical interior
  assert.strictEqual(variantLine(1), variantLine(1), 'same seed replays the same variant');
  // divergence on the same template: both seeds deal BONEGALLERY behind
  // door A, with different interiors
  const v1 = variantLine(1);
  const v14 = variantLine(14);
  assert.match(v1, /variant\|BONEGALLERY\|v2\|colonnade/);
  assert.match(v14, /variant\|BONEGALLERY\|v1\|ossuary/);
  assert.notStrictEqual(v1, v14,
    'two runs on different seeds provably differ inside the SAME room template');
});

test('variant obstacles are real in-room props, announced, and swept when the room clears', () => {
  const sim = fresh(); // default seed door A: BONEGALLERY v3 = twin cairns (2x Vault Rubble)
  sim.moveUnit(heroOf(sim), ...DOOR.A);
  assert.match(runlog(sim), /variant\|BONEGALLERY\|v3\|cairns/);
  const rubble = sim.allUnits('n007').filter((u) => u.alive);
  assert.strictEqual(rubble.length, 2, 'the cairns arrangement spawns 2 Vault Rubble props');
  for (const o of rubble) {
    assert.ok(o.x > 4672 && o.x < 7232 && o.y > -3968 && o.y < -1920,
      `obstacle inside room F1D, got (${o.x}, ${o.y})`);
    assert.strictEqual(o.ownerIdx, 27, 'props are neutral passive — never omen-counted');
  }
  assert.ok(plainMsgs(sim).some((t) => /Twin rubble cairns split the floor/.test(t)),
    'the arrangement is announced on entry');
  killRoom(sim);
  sim.advance(4);
  assert.strictEqual(sim.allUnits('n007').filter((u) => u.alive).length, 0,
    'obstacles swept with the room clear');
});
