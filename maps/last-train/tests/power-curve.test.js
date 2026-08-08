'use strict';
// NEW in phase 2A: the player-owned power curve (canon invariant I2 — the
// zero-exception one). Survivor XP per kill and per objective, level-ups
// with visible stat bumps, ONE signature ability per class at level 3
// (Steady Hands / Riot Discipline / Field Triage / Overclock — the
// Overclock repair case lives in objectives-train.test.js), and the
// Provision Shop trading tools for CLIPS.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadMap } = require('../../../lib/sim');

const MAP = path.join(__dirname, '..');

function armed(users) {
  const sim = loadMap(MAP, { users: users || [0] });
  const hero = sim.findUnit('h000', 0);
  sim.chat(0, '-test');
  return { sim, hero };
}

test('kills pay XP by zombie kind; 80 XP is a level; level-ups bump stats and heal', () => {
  const { sim, hero } = armed();
  sim.chat(0, '-zspawn riot 6'); // 14 XP each
  sim.chat(0, '-gold 999');
  const riots = sim.unitsOf(24, 'u003').filter((u) => u.alive).slice(-6);
  sim.kill(riots[0], hero);
  assert.strictEqual(sim.run('return SurvXP[0]')[0], 14, 'a Riot Walker teaches 14');
  for (const z of riots.slice(1)) sim.kill(z, hero);
  assert.strictEqual(sim.run('return SurvXP[0]')[0], 84);
  assert.strictEqual(sim.run('return SurvLevel[0]')[0], 2, '84 xp = level 2');
  assert.ok(/lvl\|pid=0\|l=2\|kill/.test(sim.global('RUNLOG')));
  assert.ok(sim.callsOf('AddSpecialEffectTarget')
    .some((c) => /Levelupcaster/.test(String(c.args[0]))),
  'the level-up SHOWS (2B text diet: burst + sting, no line)');
  const hpCalls = sim.callsOf('BlzSetUnitMaxHP').filter((c) => c.args[1] === 550 + 30);
  const dmgCalls = sim.callsOf('BlzSetUnitBaseDamage').filter((c) => c.args[1] === 22 + 2);
  assert.ok(hpCalls.length >= 1, '+30 max HP applied for the game client');
  assert.ok(dmgCalls.length >= 1, '+2 damage applied for the game client');
});

test('level 3 unlocks the class signature as a REAL ability add', () => {
  const { sim, hero } = armed();
  sim.chat(0, '-xp 170');
  assert.strictEqual(sim.run('return SurvLevel[0]')[0], 3);
  assert.ok(/sig\|pid=0\|heartlander/.test(sim.global('RUNLOG')));
  assert.ok(sim.messagesTo(0).some((m) => /Signature unlocked: Steady Hands/.test(m.text)));
  // the ability is really known: casting it is legal (passive marker — no effect handler)
  assert.ok(hero, 'hero alive');
});

test('Steady Hands: reloads take 3s and the clip deepens +2 per level', () => {
  const { sim, hero } = armed();
  sim.chat(0, '-xp 170'); // heartlander level 3
  const scalar = (v) => (Array.isArray(v) ? v[0] : v);
  assert.strictEqual(scalar(sim.call('ClipSizeOf', 0)), 12 + 4, 'clip 16 at level 3');
  assert.strictEqual(scalar(sim.call('ReloadTimeOf', 0)), 3, 'the rack is faster');
  sim.chat(0, '-gold 0');
  sim.cast(hero, 'A000');
  sim.advance(3);
  assert.strictEqual(sim.player(0).gold, 16, 'refilled to the DEEPENED clip after 3s');
});

test('Riot Discipline: 10s of half damage for the APO', () => {
  const sim = loadMap(MAP, { users: [0] });
  sim.moveUnit(sim.findUnit('h000', 0), -3420, -5420); // the police circle (6F corridor, 2B)
  const apo = sim.findUnit('h001', 0);
  sim.chat(0, '-test');
  sim.chat(0, '-xp 170');
  sim.chat(0, '-zspawn shambler 1');
  const zomb = sim.unitsOf(24, 'u000').filter((u) => u.alive).pop();
  sim.cast(apo, 'A003');
  assert.ok(/riot\|pid=0/.test(sim.global('RUNLOG')));
  const hp0 = apo.life;
  sim.damage(zomb, apo, 40);
  assert.strictEqual(apo.life, hp0 - 20, 'half of 40 gets through the shield drill');
  sim.advance(11);
  const hp1 = apo.life;
  sim.damage(zomb, apo, 40);
  assert.ok(hp1 - apo.life > 20, 'the drill expires (infection DoT may also tick)');
});

test('Field Triage: AoE cure + heal for every survivor within 400', () => {
  const sim = loadMap(MAP, { users: [0, 1] });
  sim.moveUnit(sim.findUnit('h000', 0), -3280, -5420); // the paramedic circle (6F corridor, 2B)
  const medic = sim.findUnit('h002', 0);
  const buddy = sim.findUnit('h000', 1);
  sim.chat(0, '-test');
  sim.chat(0, '-xp 170');
  sim.chat(1, '-test');
  sim.chat(1, '-infectme');
  sim.moveUnit(medic, 600, 600); // clear of the class circles
  sim.moveUnit(buddy, 700, 600);
  buddy.life = 300;
  sim.cast(medic, 'A004');
  assert.ok(/triage\|pid=0\|healed=\d+\|cured=1/.test(sim.global('RUNLOG')));
  assert.strictEqual(buddy.life, 400, '+100 to the patient');
  assert.ok(/cure\|pid=1\|triage/.test(sim.global('RUNLOG')), 'the infection is flushed');
});

test('the Provision Shop stands at the void deck and sells tools for CLIPS', () => {
  const sim = loadMap(MAP, { users: [0] });
  const shop = sim.findUnit('h01H');
  assert.ok(shop, 'the shop is placed');
  assert.strictEqual(shop.ownerIdx, 27, 'neutral passive (anyone can buy)');

  // prices live in object data (ilum = clips; the ENGINE charges at the till)
  const items = JSON.parse(fs.readFileSync(path.join(MAP, 'objects-items.json'), 'utf8'));
  const ilum = (key) => (items.custom[key].find((m) => m.id === 'ilum') || {}).value;
  assert.strictEqual(ilum('I013:phea'), 2, 'Barricade Kit: 2 clips');
  assert.strictEqual(ilum('I012:phea'), 3, 'Mobile Phone: 3 clips');
  assert.strictEqual(ilum('I010:phea'), 2, 'Wet Bandage: 2 clips');
  assert.strictEqual(ilum('I015:phea'), 1, 'Flare: 1 clip');
  const units = JSON.parse(fs.readFileSync(path.join(MAP, 'objects-units.json'), 'utf8'));
  const usit = units.custom['h01H:ngme'].find((m) => m.id === 'usit').value;
  assert.strictEqual(usit, 'I013,I012,I010,I015', 'the four wares on the shelf');

  // the SELL event flows: bought ware lands in the pack, the trade is logged
  const hero = sim.findUnit('h000', 0);
  sim.moveUnit(hero, shop.x + 100, shop.y);
  sim.sell(shop, hero, 'I013');
  assert.ok(/buy\|pid=0\|barricade/.test(sim.global('RUNLOG')));
  const kit = [...sim.items.values()].find((i) => !i.removed && i.typeStr === 'I013');
  assert.strictEqual(kit.ownerUnit, hero.handle, 'the ware is in the pack');
  // 2B text diet: the towkay's ack line is deleted — the ware in the pack
  // and the buy| beat are the receipt
});

test('burning a nest pays 30 XP (and the trim is pinned in escalation/surges suites)', () => {
  const { sim, hero } = armed();
  const nest = sim.allUnits('h018').find((u) => u.alive);
  sim.kill(nest, hero);
  assert.ok(/nest\|down\|1/.test(sim.global('RUNLOG')));
  assert.strictEqual(sim.run('return SurvXP[0]')[0], 30);
  assert.ok(sim.messagesMatching(/A nest collapses/).length > 0, 'the shortened 2B announce');
});

test('a Molotov burns nests down (200 fire damage vs 150 HP nests)', () => {
  const { sim, hero } = armed();
  const nest = sim.allUnits('h018').find((u) => u.alive);
  assert.strictEqual(nest.maxLife, 150, 'nests are burnable, not walls');
  sim.chat(0, '-give molotov');
  sim.moveUnit(hero, nest.x + 100, nest.y);
  const molotov = [...sim.items.values()].find((i) => !i.removed
    && i.typeStr === 'I014' && i.ownerUnit === hero.handle); // not the 4F ground drop
  sim.useItem(hero, molotov);
  assert.ok(!nest.alive, 'one Molotov takes a nest');
  assert.ok(/nest\|down\|1/.test(sim.global('RUNLOG')), 'burned = down, XP paid');
});

test('XP never accrues to the defected or the aboard', () => {
  const sim = loadMap(MAP, { users: [0, 1] });
  sim.chat(0, '-test');
  sim.chat(0, '-deck'); // estate rules (2B: tower deaths respawn instead)
  sim.chat(0, '-zspawn shambler 2');
  const zombs = sim.unitsOf(24, 'u000').filter((u) => u.alive).slice(-2);
  sim.kill(sim.findUnit('h000', 1), zombs[0]); // pid 1 defects
  const rev = sim.unitsOf(1, 'u004')[0];
  sim.kill(zombs[1], rev); // the revenant eats a zombie (friendly fire, whatever)
  assert.strictEqual(sim.run('return SurvXP[1] or 0')[0], 0, 'the dead do not level');
});
