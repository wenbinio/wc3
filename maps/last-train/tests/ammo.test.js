'use strict';
// Gold-as-bullets, lumber-as-clips (Dawn of the Dead, credited): the shot
// draw on the DAMAGING event, the dry-clip zero, the Parang half-damage
// fallback, the 4s reload lockout, and the every-5th-kill clip strip.

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

test('every shot burns one round; the dry clip zeroes the damage', () => {
  const { sim, hero, zomb } = setup();
  assert.strictEqual(sim.player(0).gold, 12, 'heartlander clip');
  const hp0 = zomb.life;
  sim.damage(hero, zomb, 20);
  assert.strictEqual(sim.player(0).gold, 11, 'one round per shot');
  assert.strictEqual(zomb.life, hp0 - 20, 'full damage lands');

  sim.chat(0, '-gold 0');
  sim.damage(hero, zomb, 20);
  assert.strictEqual(zomb.life, hp0 - 20, 'dry clip: the shot is zeroed');
  assert.ok(sim.messagesTo(0).some((m) => /Click\. Clip's dry/.test(m.text)));
});

test('a carried Parang keeps you fighting at half damage on a dry clip', () => {
  const { sim, hero, zomb } = setup();
  sim.chat(0, '-gold 0');
  sim.chat(0, '-give parang');
  const hp0 = zomb.life;
  sim.damage(hero, zomb, 20);
  assert.strictEqual(zomb.life, hp0 - 10, 'half damage with the Parang');
});

test('-reload burns one clip, locks 4s, then refills to the class clip', () => {
  const { sim } = setup();
  sim.chat(0, '-gold 3');
  assert.strictEqual(sim.player(0).lumber, 2);
  sim.chat(0, '-reload');
  assert.strictEqual(sim.player(0).lumber, 1, 'clip consumed up front');
  assert.strictEqual(sim.player(0).gold, 3, 'rounds not yet refilled');
  assert.ok(sim.callsOf('PauseUnit').length > 0, 'the shooter is locked');

  sim.chat(0, '-reload');
  assert.ok(sim.messagesTo(0).some((m) => /Already reloading/.test(m.text)));
  assert.strictEqual(sim.player(0).lumber, 1, 'no double spend');

  sim.advance(5);
  assert.strictEqual(sim.player(0).gold, 12, 'clip seated after the lockout');
  assert.ok(/reload\|pid=0/.test(sim.global('RUNLOG')));
});

test('-reload refuses on a full clip and with no spare clips', () => {
  const { sim } = setup();
  sim.chat(0, '-reload');
  assert.ok(sim.messagesTo(0).some((m) => /already full/.test(m.text)));
  assert.strictEqual(sim.player(0).lumber, 2);

  sim.chat(0, '-gold 1');
  sim.chat(0, '-clips 0');
  sim.chat(0, '-reload');
  assert.ok(sim.messagesTo(0).some((m) => /No spare clips/.test(m.text)));
});

test('every 5th zombie killed by a survivor strips a spare clip', () => {
  const { sim, hero } = setup();
  sim.chat(0, '-zspawn shambler 5');
  sim.chat(0, '-clips 0');
  const zombs = sim.unitsOf(24, 'u000').filter((u) => u.alive);
  assert.ok(zombs.length >= 5);
  for (let i = 0; i < 4; i++) sim.kill(zombs[i], hero);
  assert.strictEqual(sim.player(0).lumber, 0, 'no drop before the 5th');
  sim.kill(zombs[4], hero);
  assert.strictEqual(sim.player(0).lumber, 1, 'the 5th kill drops a clip');
  assert.strictEqual(sim.global('ZombiesKilled'), 5);
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
  assert.ok(sim.messagesMatching(/runs its belt dry/).length > 0);
  assert.ok(/sentry\|dry/.test(sim.global('RUNLOG')));
});
