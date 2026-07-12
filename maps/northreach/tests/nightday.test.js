'use strict';
// Night/day and wolf-phase logic tests for Northreach Founders (2026-07
// preflight program, docs/reference/preflight-2026-07.md): line coverage
// showed NO test walked the night->day transition (DayBreaks: wolf-phase
// reset + dawn announcement) or the NightBegins -> WolfSurge call path —
// the map's core pressure loop. Also pins the wolf respawn path and
// DeclareEndgame's already-declared refusal.
//
// Sim clock: the default WC3 day is 480 real seconds starting at 8:00, so
// night (18:00) falls at t=200s, dawn (6:00) at t=440s, and the second
// night at t=680s. GRACE_PERIOD = 300s sits between the first nightfall
// and the first dawn.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { loadMap } = require('../../../lib/sim');

const MAP = path.join(__dirname, '..');

const wolves = (sim) =>
  sim.unitsOf(24).filter((u) => ['nwlt', 'nwlg'].includes(u.typeStr) && u.alive);

test('night/day cycle: docile grace night -> hunting surge -> dawn reset -> second-night dire surge', () => {
  const sim = loadMap(MAP);
  // per-type default move speeds, captured while every wolf is untouched
  const defaultMs = {};
  for (const u of wolves(sim)) defaultMs[u.typeStr] = u.moveSpeed;

  // t=200: night falls DURING the grace period — wolves stay docile
  sim.advance(202);
  assert.ok(sim.messagesTo(0).some((m) => /Night falls, but the grace period keeps the wolves docile/.test(m.text)),
    'grace-night announcement');
  assert.ok(wolves(sim).every((u) => u.acquireRange === 200),
    'grace acquire range (200) holds through nightfall');

  // t=300: the grace ends at night -> WolfSurge #1 (night stats + fresh packs)
  const beforeSurge1 = wolves(sim).length;
  sim.advance(100); // t=302
  assert.ok(sim.messagesTo(0).some((m) => /wolves of Northreach are hunting/.test(m.text)),
    'the surge is announced');
  assert.strictEqual(wolves(sim).length, beforeSurge1 + 4,
    'surge level 1: 2 timber wolves per den (2 dens)');
  assert.ok(wolves(sim).every((u) => u.acquireRange === 900 && u.moveSpeed === 400),
    'every wolf at night acquire range (900) and night speed (400)');

  // t=440: DAWN — DayBreaks resets the pack: day range, default speed
  sim.advance(140); // t=442
  assert.ok(sim.messagesTo(0).some((m) => /Dawn\. The wolves slink back to their dens and slow down/.test(m.text)),
    'the dawn transition is announced (grace is over)');
  assert.ok(wolves(sim).every((u) => u.acquireRange === 500),
    'day acquire range (500) after dawn');
  assert.ok(wolves(sim).every((u) => u.moveSpeed === defaultMs[u.typeStr]),
    'night speed reset to each type\'s default at dawn');

  // t=680: the second night routes NightBegins -> WolfSurge; surge level 2
  // adds a dire wolf per den on top of the timber pair
  const beforeSurge2 = wolves(sim).length;
  const direBefore = wolves(sim).filter((u) => u.typeStr === 'nwlg').length;
  sim.advance(240); // t=682
  assert.strictEqual(wolves(sim).length, beforeSurge2 + 6,
    'surge level 2: 2 timber + 1 dire per den (2 dens)');
  assert.strictEqual(wolves(sim).filter((u) => u.typeStr === 'nwlg').length, direBefore + 2,
    'the dire wolves join at surge level 2');
  assert.ok(wolves(sim).every((u) => u.acquireRange === 900 && u.moveSpeed === 400),
    'the pack is back at night stats');
});

test('hunted wolves drop a pelt and respawn after 45s, honoring the CURRENT phase (docile in grace)', () => {
  const sim = loadMap(MAP);
  const founder = sim.findUnit('H000', 0);
  const before = wolves(sim).length;
  sim.kill(wolves(sim).find((u) => u.typeStr === 'nwlt'), founder);
  assert.strictEqual(sim.itemsByType('I001').length, 1, 'one Wolf Pelt dropped');
  assert.strictEqual(wolves(sim).length, before - 1);
  sim.advance(46); // HUNT_RESPAWN = 45
  assert.strictEqual(wolves(sim).length, before, 'the wolf respawned at a den-side spawn');
  assert.ok(wolves(sim).every((u) => u.acquireRange === 200),
    'the respawn takes the grace acquire range while the truce holds');
});

test('endgame: a second declaration is refused before any other check', () => {
  const sim = loadMap(MAP);
  sim.chat(0, '-test');
  sim.chat(0, '-found');
  sim.chat(0, '-endgame');
  assert.ok(sim.messagesMatching(/declared the ENDGAME/).length > 0, 'first declaration lands');
  sim.chat(0, '-endgame');
  assert.ok(sim.messagesTo(0).some((m) => /The endgame has already been declared/.test(m.text)),
    'the repeat declaration is refused');
});
