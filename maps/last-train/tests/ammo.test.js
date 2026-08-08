'use strict';
// Gold-as-bullets, lumber-as-clips (Dawn of the Dead, credited) — phase 2A
// de-chatted (gotcha 33): the shot draw on the DAMAGING event, the
// dry-clip zero, the Parang half-damage fallback, RELOAD AS ABILITY R
// (gun-down 4s, NO PauseUnit — the legs still work), gunshot Noise, and
// the sentry belt.
// RE-TARGET NOTE (phase 2B text diet, PIPELINE §8): the reload/gun-down/
// full-clip/sentry-dry CHAT lines were deliberately deleted — the state
// now reads as floating text at the unit (SetTextTagText). The asserts
// moved from sim.messages to the text-tag call record; the MECHANICS
// pinned here (draw, zero, refund, belt) are unchanged.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { loadMap } = require('../../../lib/sim');

const MAP = path.join(__dirname, '..');

function setup(users) {
  const sim = loadMap(MAP, { users: users || [0] });
  const hero = sim.findUnit('h000', 0);
  sim.chat(0, '-test');
  sim.chat(0, '-zspawn shambler 1');
  const zomb = sim.unitsOf(24, 'u000').filter((u) => u.alive).pop();
  return { sim, hero, zomb };
}

test('every shot burns one round and makes one Noise; a dry clip zeroes the damage', () => {
  const { sim, hero, zomb } = setup();
  assert.strictEqual(sim.player(0).gold, 12, 'heartlander clip');
  const hp0 = zomb.life;
  sim.damage(hero, zomb, 20);
  assert.strictEqual(sim.player(0).gold, 11, 'one round per shot');
  assert.strictEqual(zomb.life, hp0 - 20, 'full damage lands');
  const heat = sim.global('NoiseHeat');
  assert.ok(heat, 'noise table exists');

  sim.chat(0, '-gold 0');
  sim.damage(hero, zomb, 20);
  assert.strictEqual(zomb.life, hp0 - 20, 'dry clip: the shot is zeroed');
  assert.ok(sim.messagesTo(0).some((m) => /Click -- dry/.test(m.text)));
  assert.ok(sim.messagesTo(0).some((m) => /\|cffffcc00R\|r reloads/.test(m.text)),
    'the dry-clip hint points at the R ability, not a chat command');
});

test('a carried Parang keeps you fighting at half damage on a dry clip', () => {
  const { sim, hero, zomb } = setup();
  sim.chat(0, '-gold 0');
  sim.chat(0, '-give parang');
  const hp0 = zomb.life;
  sim.damage(hero, zomb, 20);
  assert.strictEqual(zomb.life, hp0 - 10, 'half damage with the Parang');
});

test('Reload (ability R): burns one clip, gun down 4s but NOT paused, then refills', () => {
  const { sim, hero, zomb } = setup();
  sim.chat(0, '-gold 3');
  assert.strictEqual(sim.player(0).lumber, 2);
  sim.cast(hero, 'A000');
  assert.strictEqual(sim.player(0).lumber, 1, 'clip consumed up front');
  assert.strictEqual(sim.player(0).gold, 3, 'rounds not yet refilled');
  assert.strictEqual(sim.callsOf('PauseUnit').length, 0,
    'NO PauseUnit -- reload-while-fleeing is the tension moment');

  // the gun is down: outgoing shots are zeroed, movement is free
  const hp0 = zomb.life;
  sim.damage(hero, zomb, 20);
  assert.strictEqual(zomb.life, hp0, 'mid-reload shots land nothing');
  assert.ok(sim.callsOf('SetTextTagText').some((c) => /gun down/.test(String(c.args[1]))),
    'the gun-down state reads as floating text (text diet)');

  sim.cast(hero, 'A000'); // double-cast mid-rack is silently ignored
  assert.strictEqual(sim.player(0).lumber, 1, 'no double spend');

  sim.advance(5);
  assert.strictEqual(sim.player(0).gold, 12, 'clip seated after the lockout');
  assert.ok(/reload\|pid=0/.test(sim.global('RUNLOG')));
  const hp1 = zomb.life;
  sim.damage(hero, zomb, 20);
  assert.strictEqual(zomb.life, hp1 - 20, 'shots land again after the rack');
});

test('Reload refuses on a full clip and with no spare clips', () => {
  const { sim, hero } = setup();
  sim.cast(hero, 'A000');
  assert.ok(sim.callsOf('SetTextTagText').some((c) => /clip full/.test(String(c.args[1]))),
    'full-clip refusal is floating text');
  assert.strictEqual(sim.player(0).lumber, 2);

  sim.chat(0, '-gold 1');
  sim.chat(0, '-clips 0');
  sim.cast(hero, 'A000');
  assert.ok(sim.messagesTo(0).some((m) => /No spare clips/.test(m.text)));
});

test('a deployed sentry draws its own 40-round belt and goes inert dry', () => {
  const { sim, hero, zomb } = setup();
  sim.chat(0, '-give sentry');
  const kit = [...sim.items.values()].find((i) => !i.removed && i.typeStr === 'I016');
  sim.useItem(hero, kit);
  const sentry = sim.findUnit('h017', 0);
  assert.ok(sentry, 'sentry deployed at the survivor\'s feet');

  // burn the whole belt
  for (let i = 0; i < 40; i++) sim.damage(sentry, zomb, 1);
  const hp = zomb.life;
  sim.damage(sentry, zomb, 5);
  assert.strictEqual(zomb.life, hp, 'dry belt: shots are zeroed');
  assert.ok(sim.callsOf('SetTextTagText').some((c) => /belt dry/.test(String(c.args[1]))),
    'the dry belt reads at the gun, not in chat');
  assert.ok(/sentry\|dry/.test(sim.global('RUNLOG')));
});
