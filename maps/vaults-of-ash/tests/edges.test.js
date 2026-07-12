'use strict';
// Preflight edge-branch tests (2026-07 preflight program, docs/reference/
// preflight-2026-07.md): closes the consequential line-coverage gaps the
// pre-playtest audit found — the -seed integer-width guard (gotcha 29
// corollary: 64-bit game Lua vs 32-bit sim Lua must accept the SAME seed
// strings), plus the HandleDeath / SpawnBossAdds / ClearRoom arms no other
// test walked. The defeat condition is "only a FULL party wipe ends the
// run", so untested death-handling arms are exactly where a run could be
// decided wrongly.
//
// Deterministic seeds: scenarios that need a specific seeded outcome (a
// Vampiric guardian, the Shard Ring boss aspect, a relic-reward door) pin
// the seed that produces it — the map's Park-Miller PRNG replays
// identically here and in game.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { loadMap } = require('../../../lib/sim');

const MAP = path.join(__dirname, '..');

// hub geometry (regions.json via assets/generate-terrain.mjs)
const DOOR = { A: [-1344, -5504], B: [-448, -5504], C: [448, -5504] };
// the six Floor Guardian unit types (phase 3)
const GUARDIAN_TYPES = ['u030', 'u031', 'u032', 'u033', 'u034', 'u035'];
// floor-1 elite types (they carry their OWN seeded affix — keep them out of
// "pick any pack creep" selections)
const F1_ELITE_TYPES = ['u006', 'u025'];
// every rare and epic boon key (BOON_TABLE): granting all of these empties
// the Revenant's rare+ bounty pool
const RARE_PLUS_KEYS = [
  'evasion', 'bash', 'crit', 'tempest', 'butcher', 'vein',
  'deepsight', 'nullward', 'allstats', 'radiant',
  'ashbrand', 'embercov', 'stormcore', 'bloodpact', 'diadem', 'lightoath',
];

const fresh = (opts) => loadMap(MAP, Object.assign({ users: [0] }, opts));
const hero = (sim, pid) => sim.findUnit('H000', pid || 0);
const creeps = (sim) => sim.unitsOf(24).filter((u) => u.alive);
const runlog = (sim) => sim.global('RUNLOG');
const plainMsgs = (sim, pid) => sim.messagesTo(pid || 0).map((m) => m.text.replace(/\|c[0-9a-fA-F]{8}|\|r/g, ''));
const killRoom = (sim) => {
  for (let g = 0; g < 25 && creeps(sim).length > 0; g++) {
    for (const u of creeps(sim)) sim.kill(u, hero(sim));
  }
};

// ------------------------------------------------- -seed integer-width guard

test('-seed width guard: seeds over 9 digits are rejected identically under 32- and 64-bit Lua; 9 digits work', () => {
  const sim = fresh();
  const before = sim.global('RunSeed');
  // 5000000000 >= 2^31: the game's 64-bit Lua used to accept it (mod into
  // range) while the 32-bit sim silently fell back to DEFAULT_SEED — a run
  // started with it could never be replayed headlessly. The digit COUNT is
  // now checked BEFORE tonumber, so both widths refuse the same strings.
  sim.chat(0, '-seed 5000000000');
  assert.ok(plainMsgs(sim).some((t) => /Seeds run 1 to 9 digits -- the vault refuses 5000000000/.test(t)),
    'over-wide seed rejected with feedback, not silently defaulted');
  assert.strictEqual(sim.global('RunSeed'), before, 'seed unchanged (no DEFAULT_SEED fallback)');
  assert.ok(!/seed=5000000000/.test(runlog(sim)), 'run log never reseeded');
  // 999999999 is the largest accepted value: 9 digits, < 2^31 in both widths
  sim.chat(0, '-seed 999999999');
  assert.strictEqual(sim.global('RunSeed'), 999999999, 'a 9-digit seed is accepted');
  assert.ok(/seed=999999999/.test(runlog(sim)), 'reseed logged');
});

test('debug numeric args share the width guard: an over-wide value defaults the same way in both widths', () => {
  const sim = fresh();
  sim.chat(0, '-test');
  sim.chat(0, '-embers 50');
  assert.strictEqual(sim.player(0).gold, 50);
  sim.chat(0, '-embers 5000000000'); // ParseNumArg -> nil -> the command's own default (0), everywhere
  assert.strictEqual(sim.player(0).gold, 0,
    'over-wide -embers arg falls to the documented default in BOTH widths, never to a width-dependent value');
});

// ------------------------------------------------------- HandleDeath arms ---

test("HandleDeath: Lightwarden's Oath rallies the SURVIVORS on a partial wipe (+4 all stats, full heal)", () => {
  const sim = loadMap(MAP, { users: [0, 1] });
  sim.chat(0, '-test');
  sim.chat(0, '-grant lightoath');
  const h0 = hero(sim, 0);
  const h1 = hero(sim, 1);
  const [str, agi, int_] = [h0.str, h0.agi, h0.int];
  h0.life = 100; // wounded, so the rally's full heal is observable
  sim.kill(h1);
  assert.strictEqual(sim.player(0).result, null, 'partial wipe: the run continues');
  assert.strictEqual(h0.str, str + 4, 'survivor +4 Strength');
  assert.strictEqual(h0.agi, agi + 4, 'survivor +4 Agility');
  assert.strictEqual(h0.int, int_ + 4, 'survivor +4 Intelligence');
  assert.strictEqual(h0.life, h0.maxLife, 'survivor fully healed');
  assert.ok(plainMsgs(sim).some((t) => /Lightwarden's Oath: the survivors carry the flame/.test(t)),
    'the rally is announced');
  assert.match(runlog(sim), /lightoath\|rally/);
});

test('HandleDeath: a Revenant felled by a NON-hero still pays its bounty to a living torchbearer', () => {
  const sim = fresh();
  sim.chat(0, '-test');
  sim.chat(0, '-wrath 100');
  sim.chat(0, '-room killall 1');
  const rev = sim.findUnit('u029');
  assert.ok(rev && rev.alive, 'the armed Revenant ambushes the room');
  const killer = creeps(sim).find((u) => u.typeStr !== 'u029' && !GUARDIAN_TYPES.includes(u.typeStr));
  assert.ok(killer, 'a vault-born stands to land the last hit');
  sim.kill(rev, killer); // killed by a vault-born, not a hero: kpid falls back
  assert.match(runlog(sim), /revenant\|slain/);
  assert.match(runlog(sim), /revenant\|boon\|/, 'the bounty falls back to the first living hero');
  assert.ok(plainMsgs(sim).some((t) => /The Revenant's hoard: .* claims /.test(t)), 'bounty announced');
});

test('HandleDeath: with no rare+ boon left untaken, the Revenant bounty refills from the whole pool (a COMMON)', () => {
  const sim = fresh();
  sim.chat(0, '-test');
  for (const k of RARE_PLUS_KEYS) sim.chat(0, `-grant ${k}`); // all 10 rares + all 6 epics held
  sim.chat(0, '-wrath 100');
  sim.chat(0, '-room killall 1');
  const rev = sim.findUnit('u029');
  assert.ok(rev && rev.alive);
  sim.kill(rev, hero(sim));
  assert.ok(plainMsgs(sim).some((t) => /The Revenant's hoard: .* claims .*\[COMMON\//.test(t)),
    'rarity floor relaxed to the full untaken pool — only commons remain');
  // Bloodtithe Pact (granted above) also pays on the revenant kill
  assert.match(runlog(sim), /bloodpact\|elite/);
});

test('HandleDeath: Bloodtithe Pact pays on the GUARDIAN kill (+2 Strength, 25% heal), then the room clears', () => {
  const sim = fresh();
  sim.chat(0, '-test');
  sim.chat(0, '-grant bloodpact');
  const h = hero(sim);
  sim.moveUnit(h, ...DOOR.A); // default seed: F1D Bone Gallery + Floor Guardian
  const guardianU = creeps(sim).find((u) => GUARDIAN_TYPES.includes(u.typeStr));
  const pack = creeps(sim).filter((u) => !GUARDIAN_TYPES.includes(u.typeStr));
  assert.ok(guardianU, 'the Floor Guardian wards the room');
  for (const u of pack) sim.kill(u, h);
  const strBefore = h.str;
  h.life = 100;
  sim.kill(guardianU, h);
  assert.strictEqual(h.str, strBefore + 2, 'Bloodtithe: +2 Strength on the guardian kill');
  assert.strictEqual(h.life, 100 + h.maxLife * 0.25, 'Bloodtithe: 25% of maximum life restored');
  assert.match(runlog(sim), /bloodpact\|elite/);
  assert.ok(plainMsgs(sim).some((t) => /Bloodtithe Pact: the kill pays/.test(t)), 'the pact payout is announced');
  assert.match(runlog(sim), /clear\|room=F1D\|/, 'the guardian was the last hostile: the room clears');
});

test('HandleDeath: a Vampiric guardian drinks exactly 8% of its maximum life when another vault-born dies (seed 18)', () => {
  const sim = fresh();
  sim.chat(0, '-seed 18');
  const h = hero(sim);
  sim.moveUnit(h, ...DOOR.A); // seed 18: F1C Bone Gallery d3, warded by a Vampiric Void Curator
  assert.match(runlog(sim), /guardian\|Vampiric Void Curator\|floor=1/, 'the pinned vampiric guardian');
  const g = creeps(sim).find((u) => GUARDIAN_TYPES.includes(u.typeStr));
  const prey = creeps(sim).find((u) =>
    !GUARDIAN_TYPES.includes(u.typeStr) && !F1_ELITE_TYPES.includes(u.typeStr));
  assert.ok(g && prey, 'guardian and a plain pack creep stand in the room');
  g.life = 100; // wounded, so the drink is observable
  sim.kill(prey, h);
  assert.strictEqual(g.life, 100 + g.maxLife * 0.08, 'the vampiric drink is exactly 8% of maximum life');
});

// --------------------------------------------------------- SpawnBossAdds ---

test('SpawnBossAdds: the Shard Ring aspect places its phase-3 adds on an exact 384 ring (seed 7)', () => {
  const sim = fresh();
  sim.chat(0, '-seed 7');
  sim.chat(0, '-test');
  sim.chat(0, '-boss');
  assert.match(runlog(sim), /boss\|pattern=Shard Ring/, 'seed 7 wakes the Shard Ring aspect');
  const boss = sim.findUnit('u008');
  sim.natives.SetWidgetLife(boss.handle, boss.maxLife * 0.79);
  sim.advance(2); // phase 2: 2 Heart Sparks, scatter pattern
  assert.match(runlog(sim), /boss\|phase=2\|adds=2/);
  sim.natives.SetWidgetLife(boss.handle, boss.maxLife * 0.39);
  sim.advance(2); // phase 3: 4 Molten Shards, RING pattern
  assert.match(runlog(sim), /boss\|phase=3\|adds=4/);
  const shards = sim.allUnits('u010').filter((u) => u.alive);
  assert.strictEqual(shards.length, 4, 'solo Shard Ring phase 3 sheds 4 Molten Shards');
  for (const s of shards) {
    const d = Math.hypot(s.x - boss.x, s.y - boss.y);
    assert.ok(Math.abs(d - 384) < 1, `every shard sits on the 384 ring (got ${d})`);
  }
  const angles = shards
    .map((s) => Math.round(Math.atan2(s.y - boss.y, s.x - boss.x) * 180 / Math.PI))
    .sort((a, b) => a - b);
  assert.deepStrictEqual(angles, [-90, 0, 90, 180], 'shards spaced evenly around the ring');
});

// ------------------------------------------------------------- ClearRoom ---

test('ClearRoom: a relic-reward door pays a relic at the hub pedestal (seed 12)', () => {
  const sim = fresh();
  sim.chat(0, '-seed 12');
  const h = hero(sim);
  sim.moveUnit(h, ...DOOR.A); // seed 12: F1D The Kiln, kill-all d1, reward=relic
  assert.match(runlog(sim), /enter\|room=F1D\|tmpl=KILN\|obj=killall\|danger=1\|reward=relic/);
  killRoom(sim);
  assert.match(runlog(sim), /relic\|[\w' ]+/, 'the relic reward is granted on the clear');
  const RELIC_ITEMS = ['I008', 'I033', 'I034', 'I035', 'I036', 'I037'];
  const dropped = RELIC_ITEMS.flatMap((t) => sim.itemsByType(t));
  assert.strictEqual(dropped.length, 1, 'exactly one relic item drops');
  assert.deepStrictEqual([dropped[0].x, dropped[0].y], [256, -6592],
    'the relic lands beside the hub-return point (the default GrantRelic drop spot)');
});

test('ClearRoom: Blood 3pc heals 25% on the clear and Stormheart Core stacks +15 party move speed', () => {
  const sim = fresh();
  sim.chat(0, '-test');
  for (const k of ['hp', 'bloodwarmth', 'redvigil']) sim.chat(0, `-grant ${k}`); // Blood x3
  sim.chat(0, '-grant stormcore');
  const h = hero(sim);
  const msBefore = h.moveSpeed;
  sim.chat(0, '-room killall 1');
  h.life = 200; // wounded, so the 3pc clear-heal is observable
  killRoom(sim);
  assert.ok(plainMsgs(sim).some((t) => /Blood 3pc: the clear feeds the party/.test(t)), '3pc heal announced');
  assert.strictEqual(h.life, 200 + h.maxLife * 0.25, 'Blood 3pc: exactly 25% of maximum life restored');
  assert.match(runlog(sim), /stormcore\|\+15/);
  assert.strictEqual(h.moveSpeed, msBefore + 15, 'Stormheart Core: +15 party move speed on the clear');
});

test('ClearRoom: mid and slow clears pay the lower wrath tiers, and Stillness converts slow clears to Insight', () => {
  // mid tier: 45 < t <= 75 seconds -> +20 wrath
  const sim = fresh();
  sim.chat(0, '-test');
  sim.chat(0, '-room killall 1');
  sim.advance(50);
  killRoom(sim);
  assert.match(runlog(sim), /wrath\|=20\|clear 5\ds/, 'mid-tier clear: +20 wrath');

  // slow tier (> 75s) under the Covenant of Stillness: +1 Insight, and the
  // slow wrath tier (5) lands through the covenant's own x1.5 -> floor(7.5)
  const sim2 = fresh();
  sim2.chat(0, '-test');
  sim2.chat(0, '-covenant stillness');
  sim2.chat(0, '-room killall 1');
  sim2.advance(80);
  killRoom(sim2);
  assert.match(runlog(sim2), /insight\|=1\|Covenant of Stillness/, 'slow clear pays the covenant Insight');
  assert.match(runlog(sim2), /wrath\|=7\|clear 8\ds/, 'slow tier: floor(5 x 1.5) = 7 wrath');
});
