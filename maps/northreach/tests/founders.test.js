'use strict';
// Logic tests for Northreach Founders, executed headlessly against the
// PACKED war3map.lua (generated CreateAllUnits included) by lib/sim — see
// docs/PIPELINE.md ("Logic-test map mechanics"). Discovered by `npm test`
// and runnable alone via: node tools/test-map-logic.js maps/northreach
//
// Covered mechanics (the map's README describes each):
//   grace period (real alliance state), corruption tax, '-test' debug mode,
//   '-endgame' declaration + elimination purge + last-charter victory,
//   hunting drops + respawns, market currency return, founder revival.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { loadMap } = require('../../../lib/sim');

const MAP = path.join(__dirname, '..');
const USERS = [0, 1, 2, 3];

test('grace period: all user pairs mutually ALLIANCE_PASSIVE, torn down at 300s', () => {
  const sim = loadMap(MAP);
  // t=0: the truce is real alliance state, both directions of every pair
  for (const i of USERS) {
    for (const j of USERS) {
      if (i === j) continue;
      assert.strictEqual(sim.alliance(i, j, 'ALLIANCE_PASSIVE'), true,
        `at t=0 expected Player(${i})->Player(${j}) ALLIANCE_PASSIVE`);
    }
  }
  // wolves stay docile while the truce holds
  const wolves = sim.unitsOf(24).filter((u) => ['nwlt', 'nwlg'].includes(u.typeStr) && u.alive);
  assert.ok(wolves.length > 0 && wolves.every((u) => u.acquireRange === 200),
    'wolves at grace acquire range (200)');

  sim.advance(301); // GRACE_PERIOD = 300
  for (const i of USERS) {
    for (const j of USERS) {
      if (i === j) continue;
      assert.strictEqual(sim.alliance(i, j, 'ALLIANCE_PASSIVE'), false,
        `after grace expected Player(${i})->Player(${j}) back to enemies`);
    }
  }
  // the end is announced to every seated player
  for (const pid of USERS) {
    assert.ok(sim.messagesTo(pid).some((m) => /grace period has ended/i.test(m.text)),
      `grace-end announcement reached player ${pid}`);
  }
});

test('corruption tax: 5% of carried gold every 40s, only while a Town Hall stands', () => {
  const sim = loadMap(MAP);
  sim.chat(0, '-test');
  sim.chat(0, '-found');           // plants a finished Town Hall
  sim.chat(0, '-gold 1000');
  assert.strictEqual(sim.unitsOf(0, 'h003').filter((u) => u.alive).length, 1);
  assert.strictEqual(sim.player(0).gold, 1000);

  sim.advance(40);                 // TAX_PERIOD = 40, bite = gold // 20
  assert.strictEqual(sim.player(0).gold, 950, 'first tick: 1000 - 1000//20');
  assert.ok(sim.messagesTo(0).some((m) => /Corruption claims 50 gold/.test(m.text)));
  sim.advance(40);
  assert.strictEqual(sim.player(0).gold, 903, 'second tick: 950 - 950//20');

  // no Town Hall -> never taxed
  sim.chat(2, '-test');
  sim.chat(2, '-gold 1000');
  sim.advance(40);
  assert.strictEqual(sim.player(2).gold, 1000, 'hall-less founder keeps every coin');
});

test("'-test' debug mode gates the debug commands and '-gold N' sets gold", () => {
  const sim = loadMap(MAP);
  sim.chat(1, '-gold 777');        // not in -test mode yet
  assert.strictEqual(sim.player(1).gold, 320, 'refused: start gold untouched');
  assert.ok(sim.messagesTo(1).some((m) => /need -test mode/i.test(m.text)));

  sim.chat(1, '-test');
  assert.ok(sim.messagesTo(0).some((m) => /enabled -test debug mode/.test(m.text)),
    'toggle announced to everyone');
  sim.chat(1, '-gold 500');
  assert.strictEqual(sim.player(1).gold, 500);

  sim.chat(1, '-test');            // toggle back off
  sim.chat(1, '-gold 100');
  assert.strictEqual(sim.player(1).gold, 500, 'debug gate re-armed after toggle-off');
});

test('endgame: declaration needs a hall; purge defeats the hall-less dead; last charter wins', () => {
  const sim = loadMap(MAP);
  // a hall-less founder may not declare
  sim.chat(2, '-endgame');
  assert.ok(sim.messagesTo(2).some((m) => /Only a Founder who holds a Town Hall/.test(m.text)));

  sim.chat(0, '-test'); sim.chat(0, '-found');
  sim.chat(1, '-test'); sim.chat(1, '-found');
  sim.chat(0, '-endgame');
  assert.ok(sim.messagesMatching(/declared the ENDGAME/).length > 0);

  // raze player 1: hall first (its banner falls with it), then the Founder
  const hall1 = sim.findUnit('h003', 1);
  const banner1 = sim.findUnit('n000', 1);
  sim.kill(hall1);
  assert.ok(sim.messagesMatching(/has been razed/).length > 0);
  assert.strictEqual(banner1.alive, false, 'Founder Banner falls with its hall');
  sim.kill(sim.findUnit('H000', 1));
  sim.advance(3); // Defeat() delivers CustomDefeatBJ after 2s
  assert.strictEqual(sim.player(1).result, 'defeat', 'purged: no hall, no living Founder');

  // players 2 and 3 never founded: their Founders' deaths purge them,
  // leaving player 0 the last charter standing
  sim.kill(sim.findUnit('H000', 2));
  sim.kill(sim.findUnit('H000', 3));
  assert.ok(sim.messagesMatching(/lord of the North/).length > 0, 'victory announced');
  sim.advance(6); // Victory() delivers the verdicts after 5s
  assert.strictEqual(sim.player(0).result, 'victory');
  for (const pid of [1, 2, 3]) {
    assert.strictEqual(sim.player(pid).result, 'defeat', `player ${pid} defeated`);
  }
});

test('hunting: deer drop hides where they fall and respawn after 45s', () => {
  const sim = loadMap(MAP);
  const deerBefore = sim.allUnits('nder').filter((u) => u.alive).length;
  assert.strictEqual(deerBefore, 6, 'units.json places six deer');

  const deer = sim.findUnit('nder');
  const founder = sim.findUnit('H000', 0);
  const [dx, dy] = [deer.x, deer.y];
  sim.kill(deer, founder);

  const hides = sim.itemsByType('I000');
  assert.strictEqual(hides.length, 1, 'one Deer Hide dropped');
  assert.deepStrictEqual([hides[0].x, hides[0].y], [dx, dy], 'dropped where the deer fell');

  assert.strictEqual(sim.allUnits('nder').filter((u) => u.alive).length, 5);
  sim.advance(46); // HUNT_RESPAWN = 45
  assert.strictEqual(sim.allUnits('nder').filter((u) => u.alive).length, 6, 'deer respawned');
});

test('hunting: shoals drop the catch at the paired shore landing, never in the water', () => {
  const sim = loadMap(MAP);
  const shoal = sim.findUnit('n003');
  const founder = sim.findUnit('H000', 0);
  const [sx, sy] = [shoal.x, shoal.y];
  sim.kill(shoal, founder);

  const catches = sim.itemsByType('I002');
  assert.strictEqual(catches.length, 2, 'Coastal Catch drops in pairs');
  for (const it of catches) {
    assert.notDeepStrictEqual([it.x, it.y], [sx, sy], 'catch is NOT at the shoal (open water)');
  }
  assert.ok(sim.messagesTo(0).some((m) => /washes ashore/.test(m.text)), 'killer is told where');
});

test('market currency return: goods and coins pawn at FULL value', () => {
  const sim = loadMap(MAP);
  const founder = sim.findUnit('H000', 0);

  // Deer Hide: igol 25 -> engine pays 12, trigger tops up 13
  const hide = sim.createItem('I000', founder.x, founder.y);
  const before = sim.player(0).gold;
  const { enginePaid } = sim.pawn(founder, hide);
  assert.strictEqual(enginePaid, 12, 'engine pays igol // 2');
  assert.strictEqual(sim.player(0).gold, before + 25, 'currency return tops up to full value');
  assert.ok(sim.messagesTo(0).some((m) => /Sold for 25 gold/.test(m.text)));

  // Trade Coin (100): the corruption-proof store of value round-trips whole
  const coin = sim.createItem('I003', founder.x, founder.y);
  const beforeCoin = sim.player(0).gold;
  sim.pawn(founder, coin);
  assert.strictEqual(sim.player(0).gold, beforeCoin + 100, 'coin pawns at full face value');
});

test('fallen founders revive after 30s at the landing (or their hall)', () => {
  const sim = loadMap(MAP);
  const founder = sim.findUnit('H000', 3);
  sim.kill(founder);
  assert.ok(sim.messagesMatching(/Founder of .* has fallen/).length > 0);
  sim.advance(29);
  assert.strictEqual(founder.alive, false, 'still down before REVIVE_DELAY');
  sim.advance(2);
  assert.strictEqual(founder.alive, true, 'revived after 30s');
  assert.deepStrictEqual([founder.x, founder.y], [-2688, -2496], 'back at the communal landing');
});

test("'-ff' scales the tax clock: one 40s bite lands in 10 wall seconds at 4x", () => {
  const sim = loadMap(MAP);
  sim.chat(0, '-test');
  sim.chat(0, '-found');
  sim.chat(0, '-gold 1000');
  sim.chat(0, '-ff');
  sim.advance(10); // 10 ticks x clockScale 4 = 40 tax-units
  assert.strictEqual(sim.player(0).gold, 950);
});

test('leavers: retiring charters are announced; the last one standing wins', () => {
  const sim = loadMap(MAP);
  sim.leave(1);
  sim.leave(2);
  assert.ok(sim.messagesMatching(/retired from life in the North/).length >= 2);
  assert.strictEqual(sim.results[3] || null, null, 'two remain: no verdict yet');
  sim.leave(3);
  sim.advance(6);
  assert.strictEqual(sim.player(0).result, 'victory', 'last charter standing');
});
