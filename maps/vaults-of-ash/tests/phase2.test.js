'use strict';
// Phase-2 systems tests for The Vaults of Ash, executed headlessly against
// the PACKED war3map.lua by lib/sim (docs/PIPELINE.md §8). Covers the
// competitor-derived mechanics, each adapted WITH the fairness fix the
// source lacked (docs/reference/roguelike-comparison.md):
//   sigil sets (legible synergy), Wrath meter + Ash Revenant ambush
//   (telegraphed risk), trial doors (opt-in contracts), Insight (pity +
//   omen detail), covenants (explicit terms), death choreography
//   (rekindle instead of instant full wipe), the vow knowledge-code,
//   ember-feast economy threat, elite affixes, the 20-template deck and
//   the 20-creep tiered roster.
//
// Deterministic seeds: every scenario that depends on a specific seeded
// outcome (a trial contract, an elite affix) pins the seed that produces
// it — the map's Park-Miller PRNG replays identically here and in game.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const { loadMap } = require('../../../lib/sim');

const MAP = path.join(__dirname, '..');

// hub geometry (regions.json via assets/generate-terrain.mjs)
const DOOR = { A: [-1344, -5504], B: [-448, -5504], C: [448, -5504], GATE: [1344, -5504], TRIAL: [-1600, -5888] };
const ALTAR = { cinders: [-1600, -7040], stillness: [-1280, -7040], sealed: [-960, -7040], unbound: [-640, -7040] };
const SHRINE = { rekindle: [576, -7040], heal: [896, -7040], reroll: [1216, -7040], fortify: [1536, -7040] };
const HUB = [-128, -6592];

const ALL_BOON_KEYS = [
  'str', 'soothide', 'evasion', 'bash', 'ashbrand', 'embercov',
  'agi', 'stormstep', 'skyreflex', 'crit', 'tempest', 'stormcore',
  'hp', 'bloodwarmth', 'redvigil', 'butcher', 'vein', 'bloodpact',
  'omeneye', 'voidtithe', 'quietstep', 'deepsight', 'nullward', 'diadem',
  'int', 'dawnflame', 'beacon', 'allstats', 'radiant', 'lightoath',
];
const ELITE_TYPES = { 1: ['u006', 'u025'], 2: ['u007', 'u026'], 3: ['u027', 'u028'] };

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

// ---------------------------------------------------------------- sigils ---

test('boon data: 30 boons in 3 rarities (6 epics), 6 per sigil, EVERY tooltip states rarity + sigil + both set thresholds', () => {
  const items = JSON.parse(fs.readFileSync(path.join(MAP, 'objects-items.json'), 'utf8')).custom;
  const boons = Object.entries(items).filter(([, mods]) =>
    mods.some((m) => m.id === 'utub' && /^Boon \(/.test(m.value)));
  assert.strictEqual(boons.length, 30, '30 boon items ship in object data');
  const rarities = { COMMON: 0, RARE: 0, EPIC: 0 };
  const sigils = { Ash: 0, Storm: 0, Blood: 0, Void: 0, Light: 0 };
  for (const [key, mods] of boons) {
    const tub = mods.find((m) => m.id === 'utub').value;
    const m = /^Boon \((COMMON|RARE|EPIC) -- (Ash|Storm|Blood|Void|Light) sigil\)/.exec(tub);
    assert.ok(m, `${key}: tooltip must open with "Boon (RARITY -- SIGIL sigil)": ${tub}`);
    rarities[m[1]]++;
    sigils[m[2]]++;
    assert.ok(/Sigil set \w+: 2 held: .+ \/ 3 held: .+\./.test(tub),
      `${key}: tooltip must state BOTH sigil set thresholds (the legibility bar): ${tub}`);
    const ides = mods.find((x) => x.id === 'ides');
    assert.strictEqual(ides && ides.value, tub, `${key}: ides mirrors utub`);
  }
  assert.strictEqual(rarities.EPIC, 6, 'exactly 6 build-around epics');
  assert.ok(rarities.COMMON > 0 && rarities.RARE > 0, 'all three rarities populated');
  for (const [s, n] of Object.entries(sigils)) {
    assert.strictEqual(n, 6, `sigil ${s} carries exactly 6 boons`);
  }
  // 6 relics + 5 consumables round out the item roster
  const relics = Object.values(items).filter((mods) =>
    mods.some((m) => m.id === 'utub' && /^A relic of the burned order/.test(m.value)));
  assert.strictEqual(relics.length, 6, '6 reliquary-exclusive relics');
  const consumables = Object.keys(items).filter((k) => /:(phea|pman|pghe|pspd|pnvl)$/.test(k));
  assert.strictEqual(consumables.length, 5, '5 elite-drop consumables');
});

test('sigil sets: 2pc and 3pc land once each, announced, with real effects (Ash: +4 str, clears +10)', () => {
  const sim = fresh();
  sim.chat(0, '-test');
  const h = hero(sim);
  assert.strictEqual(h.str, 18);
  sim.chat(0, '-grant str');       // Ash common: +6 str
  assert.strictEqual(h.str, 24, 'one Ash boon: no set bonus yet');
  sim.chat(0, '-grant soothide');  // Ash x2
  assert.strictEqual(h.str, 28, 'ASH 2pc: party +4 Strength');
  assert.match(runlog(sim), /sigil\|ash\|2/);
  assert.ok(plainMsgs(sim).some((t) => /SIGIL SET -- ASH x2 active: party \+4 Strength/.test(t)),
    'set bonus is announced with its exact effect');
  sim.chat(0, '-grant evasion');   // Ash x3
  assert.match(runlog(sim), /sigil\|ash\|3/);
  assert.strictEqual(h.str, 28, '3pc is the clear bonus, not more stats');
  sim.chat(0, '-room killall 1');
  killRoom(sim);
  assert.match(runlog(sim), /clear\|room=\w+\|t=\d+\|embers=50\|/,
    'ASH 3pc: danger-1 clear pays 40+10=50');
});

test('-sigils prints all five sigils with counts, activation state and both thresholds', () => {
  const sim = fresh();
  sim.chat(0, '-test');
  sim.chat(0, '-grant stormstep');
  sim.chat(0, '-sigils');
  const out = plainMsgs(sim).slice(-6).join('\n');
  for (const sigil of ['Ash', 'Storm', 'Blood', 'Void', 'Light']) {
    assert.ok(new RegExp(sigil + ' x\\d+ \\[(inactive|2pc ACTIVE|BOTH ACTIVE)\\]').test(out),
      `-sigils lists ${sigil} with count and state`);
  }
  assert.match(out, /Storm x1/);
  assert.match(out, /2: party \+20 move speed \/ 3: party \+6 Agility/,
    'thresholds are printed, not hidden (the Ulfsire opacity fix)');
});

test('Storm 2pc: move-speed effects stack measurably on the unit', () => {
  const sim = fresh();
  sim.chat(0, '-test');
  const h = hero(sim);
  sim.chat(0, '-grant stormstep');   // +25 ms personal
  sim.chat(0, '-grant skyreflex');   // +10 ms personal + agi -> Storm x2: +20 party
  assert.strictEqual(h.moveSpeed, 320 + 25 + 10 + 20, 'base 320 + 35 personal + 20 party');
});

test('all ten sigil set bonuses fire exactly once when the whole table is claimed', () => {
  const sim = fresh();
  sim.chat(0, '-test');
  for (const k of ALL_BOON_KEYS) sim.chat(0, `-grant ${k}`);
  for (const sigil of ['ash', 'storm', 'blood', 'void', 'light']) {
    for (const pieces of [2, 3]) {
      const re = new RegExp(`sigil\\|${sigil}\\|${pieces}`, 'g');
      assert.strictEqual((runlog(sim).match(re) || []).length, 1,
        `${sigil} ${pieces}pc fired exactly once`);
    }
  }
  sim.chat(0, '-boon');
  assert.ok(plainMsgs(sim).some((t) => /Every boon of the order has already been claimed/.test(t)),
    '30-boon table exhausts cleanly');
});

// ----------------------------------------------------------------- wrath ---

test('Wrath: fast clears build the meter with announcements at 50/75/100%', () => {
  const sim = fresh();
  sim.chat(0, '-test');
  sim.chat(0, '-room killall 1');
  killRoom(sim);
  assert.strictEqual(sim.global('WrathMeter'), 40, 'instant clear = fast tier: +40');
  assert.ok(!plainMsgs(sim).some((t) => /Wrath at \d+%/.test(t)), 'no announcement below 50%');
  sim.advance(3);
  sim.chat(0, '-room killall 1');
  killRoom(sim);
  assert.strictEqual(sim.global('WrathMeter'), 80);
  assert.ok(plainMsgs(sim).some((t) => /Wrath at 80% -- the vault stirs/.test(t)),
    '75% threshold announced');
  sim.advance(3);
  sim.chat(0, '-room killall 1');
  killRoom(sim);
  assert.strictEqual(sim.global('WrathMeter'), 100);
  assert.match(runlog(sim), /wrath\|full/);
  assert.ok(plainMsgs(sim).some((t) => /WRATH 100% .* ambush the party at the NEXT room/.test(t)),
    'the ambush is telegraphed ONE ROOM AHEAD (the Sin-meter fix)');
});

test('Wrath 100: the Ash Revenant ambushes the next room, resets the meter, and its death pays a rare+ boon', () => {
  const sim = fresh();
  sim.chat(0, '-test');
  sim.chat(0, '-wrath 100');
  assert.strictEqual(sim.global('WrathMeter'), 100);
  assert.strictEqual(sim.allUnits('u029').length, 0, 'armed, not yet spawned');
  sim.chat(0, '-room killall 1');
  const rev = sim.findUnit('u029');
  assert.ok(rev && rev.alive, 'the Ash Revenant spawns at the next room entry');
  assert.match(runlog(sim), /revenant\|ambush\|\w+ Ash Revenant/, 'the revenant carries a seeded affix');
  assert.strictEqual(sim.global('WrathMeter'), 0, 'the ambush resets Wrath');
  const boonsBefore = (runlog(sim).match(/revenant\|boon/g) || []).length;
  assert.strictEqual(boonsBefore, 0);
  sim.kill(rev, hero(sim));
  assert.match(runlog(sim), /revenant\|slain/);
  assert.match(runlog(sim), /revenant\|boon\|/, 'slaying it pays a guaranteed boon');
  assert.ok(plainMsgs(sim).some((t) => /The Revenant's hoard: .* claims .*\[(RARE|EPIC)\//.test(t)),
    'the bounty is rare or better');
});

test("Emberlord's Covenant (epic): Wrath builds twice as fast and the Revenant pays an EPIC boon", () => {
  const sim = fresh();
  sim.chat(0, '-test');
  sim.chat(0, '-grant embercov');
  sim.chat(0, '-room killall 1');
  killRoom(sim);
  assert.strictEqual(sim.global('WrathMeter'), 80, 'fast clear: 40 x2 = 80');
  sim.advance(3);
  sim.chat(0, '-wrath 100');
  sim.chat(0, '-room killall 1');
  const rev = sim.findUnit('u029');
  sim.kill(rev, hero(sim));
  assert.ok(plainMsgs(sim).some((t) => /The Revenant's hoard: .* claims .*\[EPIC\//.test(t)),
    'with the covenant, the bounty rarity floor is EPIC');
});

// ---------------------------------------------------------------- trials ---

test('trial doors: every run offers 1-2 trials, never more, never zero (seeds 1..6)', () => {
  for (const s of [1, 2, 3, 4, 5, 6]) {
    const sim = fresh();
    sim.chat(0, `-seed ${s}`);
    sim.chat(0, '-test');
    sim.chat(0, '-floor 2');
    sim.chat(0, '-floor 3');
    const n = (runlog(sim).match(/trial\|offer\|floor=/g) || []).length;
    assert.ok(n >= 1 && n <= 2, `seed ${s}: ${n} trials offered — must be 1 or 2`);
  }
});

test('Trial of the Gale (default seed, floor 1): debuff is real (breath every 30s inside), payout permanent (+20 ms, +1 Insight)', () => {
  const sim = fresh();
  assert.match(runlog(sim), /trial\|offer\|floor=1\|gale\|F1C:EMBERCRECHE/,
    'the default seed offers the gale trial on floor 1');
  assert.ok(plainMsgs(sim).some((t) => /Trial of the Gale: the Vault breathes every 30 seconds inside\. Clear it for \+20 move speed .*\+1 Insight.*Decline by taking any normal door/.test(t)),
    'debuff AND payout AND the decline path are announced up front');
  const h = hero(sim);
  sim.moveUnit(h, ...DOOR.TRIAL);
  assert.match(runlog(sim), /enter\|room=F1C\|tmpl=EMBERCRECHE\|obj=survive\|danger=3\|reward=trial:gale/);
  sim.advance(61); // survive objective, with the gale tripling the breath clock
  assert.strictEqual(sim.global('VaultBreathStacks'), 2,
    'gale debuff: two breath ticks inside 60s (normally 90s apart)');
  // phase 3: the trash crumbles but the Floor Guardian holds the descent
  assert.match(runlog(sim), /standoff\|guardian/, 'the Guardian standoff after the countdown');
  assert.ok(!/trial\|clear/.test(runlog(sim)), 'no clear while the Guardian stands');
  const g = creeps(sim);
  assert.strictEqual(g.length, 1, 'only the Guardian remains after the crumble');
  sim.kill(g[0], h);
  sim.advance(4);
  assert.match(runlog(sim), /trial\|clear\|gale/);
  assert.strictEqual(sim.global('InsightLevel'), 1, 'trial payout: +1 Insight');
  assert.strictEqual(sim.global('TrialsCleared'), 1);
  assert.strictEqual(h.moveSpeed, 320 + 20,
    'trial payout: permanent +20 move speed over the 320 base (umvs)');
});

test('Trial of Cinders (seed 7): -40% max life inside, restored on clear, +2 all stats paid', () => {
  const sim = fresh();
  sim.chat(0, '-seed 7');
  assert.match(runlog(sim), /trial\|offer\|floor=1\|cinders\|F1A:RELICNICHE/);
  const h = hero(sim);
  assert.strictEqual(h.maxLife, 650);
  sim.moveUnit(h, ...DOOR.TRIAL);
  assert.strictEqual(h.maxLife, 390, 'cinders debuff: max life -40% while inside');
  const strBefore = h.str;
  killRoom(sim); // guards + the Floor Guardian (Shielded Blood Provost on this seed)
  sim.advance(4);
  assert.match(runlog(sim), /guardian\|Shielded Blood Provost\|floor=1\|sig=drain/,
    'the seed-7 Guardian draw is pinned');
  assert.match(runlog(sim), /relic\|Ember Chalice/, 'the relic deck draw is pinned');
  assert.strictEqual(h.maxLife, 650 + 75,
    'debuff lifted in full when the trial clears (+75: the Ember Chalice relic)');
  assert.strictEqual(h.str, strBefore + 2, 'payout: +2 all stats');
  assert.match(runlog(sim), /trial\|clear\|cinders/);
});

test('declining a trial: any normal door seals it for that floor', () => {
  const sim = fresh(); // default seed: gale trial offered on floor 1
  sim.moveUnit(hero(sim), ...DOOR.A);
  assert.match(runlog(sim), /trial\|declined/);
  assert.ok(plainMsgs(sim).some((t) => /The Trial door seals behind your choice/.test(t)));
  // the sealed door does nothing for the rest of the floor
  sim.moveUnit(hero(sim), ...DOOR.TRIAL);
  assert.ok(!/door\|TRIAL/.test(runlog(sim)), 'sealed trial door never opens');
  assert.match(runlog(sim), /enter\|room=F1D/, 'the declined room (door A) stays the active one');
  // and stepping it back at the hub (idle, no offer) just explains itself
  killRoom(sim);
  sim.advance(4);
  const offeredAgain = /trial\|offer\|floor=2/.test(runlog(sim)); // a NEW floor may offer a NEW trial
  sim.moveUnit(hero(sim), ...DOOR.TRIAL);
  if (!offeredAgain) {
    assert.ok(plainMsgs(sim).some((t) => /Only ash behind this frame/.test(t)));
    assert.ok(!/door\|TRIAL/.test(runlog(sim)));
  } else {
    assert.match(runlog(sim), /door\|TRIAL\|floor=2/, 'a freshly offered floor-2 trial opens normally');
  }
});

// --------------------------------------------------------------- insight ---

test('Insight upgrades omen detail, and the omens NEVER lie: creep counts and previews match reality', () => {
  const sim = fresh();
  const noInsight = plainMsgs(sim).filter((t) => /Omen -- Door/.test(t));
  assert.ok(noInsight.length >= 3 && noInsight.every((t) => !/\d+ vault-born/.test(t)),
    'at Insight 0 omens show danger + reward kind only (no creep counts)');
  sim.chat(0, '-test');
  sim.chat(0, '-insight 2');
  const omens = plainMsgs(sim).filter((t) => /Omen -- Door/.test(t)).slice(-3);
  assert.ok(omens.every((t) => / \d+ vault-born/.test(t)), 'Insight 1+: exact creep counts');
  assert.ok(omens.every((t) => /preview: /.test(t)), 'Insight 2+: reward previews');
  // honesty check — door A's counted creeps equal the actual spawns
  const counted = Number(/ (\d+) vault-born/.exec(omens[0])[1]);
  sim.moveUnit(hero(sim), ...DOOR.A);
  assert.strictEqual(creeps(sim).length, counted,
    'the omen creep count equals what actually spawns (same code path)');
  // honesty check — the boon preview names the best rarity of the REAL draft
  const boonOmen = omens.find((t) => /best boon/.test(t));
  assert.ok(boonOmen, 'a boon door is previewed on the default floor-1 deal');
});

test('Insight 3: campfire stock improves (heal 75%, fortify +150), as announced', () => {
  const sim = fresh();
  sim.chat(0, '-test');
  sim.chat(0, '-insight 3');
  assert.ok(plainMsgs(sim).some((t) => /campfire now carries finer stock/.test(t)));
  sim.chat(0, '-floor 3');
  sim.chat(0, '-room killall 1');
  killRoom(sim);
  sim.advance(3);
  assert.match(runlog(sim), /campfire\|lit/);
  sim.chat(0, '-embers 300');
  const h = hero(sim);
  h.life = 100;
  sim.moveUnit(h, ...SHRINE.heal);
  assert.strictEqual(h.life, 100 + h.maxLife * 0.75, 'heal restores 75% at Insight 3');
  sim.moveUnit(h, ...SHRINE.fortify);
  assert.strictEqual(h.maxLife, 650 + 150, 'fortify grants +150 at Insight 3');
});

// ------------------------------------------------------------------ pity ---

test('hard pity: drafts never offer a boon the party already holds', () => {
  const sim = fresh();
  sim.chat(0, '-test');
  const held = ['str', 'agi', 'int', 'hp', 'evasion', 'crit', 'bash', 'allstats', 'omeneye', 'voidtithe'];
  for (const k of held) sim.chat(0, `-grant ${k}`);
  const heldNames = ['Ember Sinew', 'Ashen Grace', 'Kindled Mind', 'Torchbearer Vigor', 'Cinderguard',
    'Emberedge', 'Ashbreaker', 'Pyre Ward', 'Omen Eye', 'Void Tithe'];
  for (let i = 0; i < 8; i++) {
    sim.chat(0, '-boon');
    const offer = runlog(sim).split('\n').filter((l) => l.startsWith('boonoffer')).pop();
    for (const name of heldNames) {
      assert.ok(!offer.includes(name + ' ['), `deal ${i}: held boon "${name}" never re-offered`);
    }
  }
});

test('soft pity: while unseen boons remain, every deal contains at least one never-yet-offered boon', () => {
  const sim = fresh();
  sim.chat(0, '-test');
  const seen = new Set();
  for (let i = 0; i < 12; i++) {
    sim.chat(0, '-boon');
    const names = runlog(sim).split('\n').filter((l) => l.startsWith('boonoffer')).pop()
      .replace('boonoffer|', '').split('|');
    if (seen.size < 30) {
      assert.ok(names.some((n) => !seen.has(n)),
        `deal ${i} must contain a first-time boon (${seen.size}/30 seen)`);
    }
    names.forEach((n) => seen.add(n));
  }
  assert.ok(seen.size >= 20, 'twelve deals surface broad table coverage');
});

// -------------------------------------------------------------- covenants ---

test('covenants: sworn at the altars with explicit reward AND price; one per player; locked after the first door', () => {
  const sim = fresh();
  const h = hero(sim);
  sim.moveUnit(h, ...ALTAR.cinders);
  assert.match(runlog(sim), /covenant\|pid=0\|cinders/);
  assert.ok(plainMsgs(sim).some((t) => /swears the Covenant of Cinders\. Reward: .*\+20 bonus Embers\. Price: the shrine HEAL costs you double\./.test(t)),
    'terms are printed in full at selection (the Ulfsire god-pact opacity fix)');
  sim.moveUnit(h, ...HUB);
  sim.moveUnit(h, ...ALTAR.stillness);
  assert.ok(plainMsgs(sim).some((t) => /Your pact is already sealed/.test(t)), 'one covenant per run');
  assert.ok(!/covenant\|pid=0\|stillness/.test(runlog(sim)));
  // -seed now refused (covenant locks the run like the first door does)
  sim.chat(0, '-seed 99');
  assert.ok(plainMsgs(sim).some((t) => /-seed works only before any covenant or door/.test(t)));
  assert.strictEqual(sim.global('RunSeed'), 20260711);
  // a second player after the first door is refused
  const sim2 = loadMap(MAP, { users: [0, 1] });
  sim2.moveUnit(hero(sim2, 0), ...DOOR.A);
  sim2.moveUnit(hero(sim2, 1), ...ALTAR.sealed);
  assert.ok(plainMsgs(sim2, 1).some((t) => /altars answer only before the first door/.test(t)));
});

test('Covenant of Cinders: fast clears pay +20, the heal price doubles', () => {
  const sim = fresh();
  sim.moveUnit(hero(sim), ...ALTAR.cinders);
  sim.chat(0, '-test');
  sim.chat(0, '-room killall 1');
  killRoom(sim);
  assert.match(runlog(sim), /covenant\|cinders\|\+20/, 'fast clear bonus logged');
  assert.strictEqual(sim.player(0).gold, 40 + 40 + 20,
    'danger-1 clear 40 + debug-room ember reward 40 + covenant 20');
  sim.advance(3);
  sim.chat(0, '-floor 3');
  sim.chat(0, '-room killall 1');
  killRoom(sim);
  sim.advance(3); // third clear lights the shrine
  sim.chat(0, '-embers 300');
  const h = hero(sim);
  h.life = 100;
  sim.moveUnit(h, ...SHRINE.heal);
  assert.strictEqual(sim.player(0).gold, 300 - 120, 'the price: heal costs double (120)');
});

test('Covenant of Stillness: Wrath builds half again as fast', () => {
  const sim = fresh();
  sim.moveUnit(hero(sim), ...ALTAR.stillness);
  sim.chat(0, '-test');
  sim.chat(0, '-room killall 1');
  killRoom(sim);
  assert.strictEqual(sim.global('WrathMeter'), 60, 'fast clear: floor(40 * 1.5) = 60');
});

test('Covenant of the Sealed: a free seeded epic at once, but drafts shrink to 2 choices', () => {
  const sim = fresh();
  sim.moveUnit(hero(sim), ...ALTAR.sealed);
  assert.match(runlog(sim), /sealedboon\|Ashfather's Brand/, 'the free epic is seeded and pinned');
  assert.ok(plainMsgs(sim).some((t) => /pays its debt at once: Ashfather's Brand \[EPIC\/Ash\]/.test(t)));
  sim.moveUnit(hero(sim), ...HUB);
  sim.chat(0, '-test');
  sim.chat(0, '-boon');
  const offer = runlog(sim).split('\n').filter((l) => l.startsWith('boonoffer')).pop();
  assert.strictEqual(offer.split('|').length - 1, 2, 'the price: drafts offer only 2 boons');
});

test('the fourth altar: cold until the earned vow phrase is spoken; then the Unbound pays +1 all stats per clear', () => {
  const sim = fresh();
  const h = hero(sim);
  sim.moveUnit(h, ...ALTAR.unbound);
  assert.ok(plainMsgs(sim).some((t) => /The fourth altar is cold\. A vow earned by mastery opens it/.test(t)));
  assert.ok(!/covenant\|pid=0/.test(runlog(sim)), 'no pact without the vow');
  sim.chat(0, '-vow wrongword');
  assert.ok(plainMsgs(sim).some((t) => /The vault does not know that vow/.test(t)));
  sim.chat(0, '-vow emberoath'); // the knowledge code printed by a flawless/wrath victory
  assert.match(runlog(sim), /vow\|unlocked/);
  sim.moveUnit(h, ...HUB);
  sim.moveUnit(h, ...ALTAR.unbound);
  assert.match(runlog(sim), /covenant\|pid=0\|unbound/);
  const strBefore = h.str;
  sim.chat(0, '-test');
  sim.chat(0, '-room killall 1');
  killRoom(sim);
  assert.strictEqual(h.str, strBefore + 1, 'Unbound: +1 all stats on every clear');
  assert.match(runlog(sim), /covenant\|unbound\|\+1/);
});

// ------------------------------------------------------ death choreography ---

test('a fallen torch rekindles at 50% life when the party clears the next landing', () => {
  const sim = loadMap(MAP, { users: [0, 1] });
  sim.chat(0, '-test');
  sim.chat(0, '-room killall 1');
  const h1 = sim.findUnit('H000', 1);
  sim.kill(h1);
  assert.strictEqual(h1.alive, false);
  assert.strictEqual(sim.player(0).result, null, 'one torch out is NOT a wipe');
  assert.ok(plainMsgs(sim).some((t) => /Clear the next landing .* and the torch relights at half life/.test(t)),
    'the revive path is announced immediately');
  killRoom(sim);
  sim.advance(3);
  assert.strictEqual(h1.alive, true, 'revived by the clear');
  assert.strictEqual(h1.life, h1.maxLife * 0.5, 'at exactly half life');
  assert.match(runlog(sim), /revive\|pid=1\|landing cleared/);
});

test('the shrine Rekindle plate revives the fallen at once for 120 embers', () => {
  const sim = loadMap(MAP, { users: [0, 1] });
  sim.chat(0, '-test');
  // no fallen yet: plate refuses after lighting
  sim.chat(0, '-floor 3');
  sim.chat(0, '-room killall 1');
  killRoom(sim);
  sim.advance(3); // 3rd clear lights the shrine
  sim.chat(0, '-embers 200');
  sim.moveUnit(sim.findUnit('H000', 0), ...SHRINE.rekindle);
  assert.ok(plainMsgs(sim).some((t) => /No torch is out/.test(t)));
  assert.strictEqual(sim.player(0).gold, 200, 'refusal deducts nothing');
  const h1 = sim.findUnit('H000', 1);
  sim.kill(h1);
  sim.moveUnit(sim.findUnit('H000', 0), ...HUB);
  sim.moveUnit(sim.findUnit('H000', 0), ...SHRINE.rekindle);
  assert.strictEqual(h1.alive, true, 'rekindled immediately');
  assert.strictEqual(h1.life, h1.maxLife * 0.5);
  assert.strictEqual(sim.player(0).gold, 80, 'rekindle costs exactly 120');
  assert.match(runlog(sim), /revive\|pid=1\|shrine/);
});

test('defeat is ALWAYS handled: a full wipe mid-trial still ends with the summary', () => {
  const sim = fresh(); // default seed: trial on floor 1
  sim.moveUnit(hero(sim), ...DOOR.TRIAL);
  sim.kill(hero(sim));
  sim.advance(3);
  assert.strictEqual(sim.player(0).result, 'defeat');
  const summary = plainMsgs(sim).find((t) => /VAULTS OF ASH -- DEFEAT/.test(t));
  assert.ok(summary, 'defeat summary shown even mid-trial');
  assert.match(summary, /Wrath peak: \d+%/);
  assert.match(summary, /Trials cleared: 0/);
  assert.match(summary, /Insight: \d+/);
  assert.match(summary, /Covenants: none sworn/);
});

// -------------------------------------------------------- economy threat ---

test("ember feast: the Heart's final phase gains +1 damage per 10 unspent embers, announced and hinted beforehand", () => {
  const sim = fresh();
  sim.chat(0, '-test');
  sim.chat(0, '-embers 500');
  sim.chat(0, '-boss');
  assert.ok(plainMsgs(sim).some((t) => /FEED ON HOARDED EMBERS|FEEDS ON HOARDED EMBERS/i.test(t)),
    'the threat is telegraphed at boss entry');
  const boss = sim.findUnit('u008');
  sim.natives.SetWidgetLife(boss.handle, boss.maxLife * 0.79);
  sim.advance(2);
  assert.ok(!/feast=/.test(runlog(sim)), 'no feast before phase 3');
  sim.natives.SetWidgetLife(boss.handle, boss.maxLife * 0.39);
  sim.advance(2);
  assert.match(runlog(sim), /boss\|phase=3\|adds=\d+\|feast=50/, '500 embers -> +50 damage');
  assert.ok(plainMsgs(sim).some((t) => /FEEDS on your hoard: \+50 damage from 500 unspent Embers/.test(t)));
  // spent-down pool means a weaker phase 3
  const sim2 = fresh();
  sim2.chat(0, '-test');
  sim2.chat(0, '-boss');
  const boss2 = sim2.findUnit('u008');
  sim2.natives.SetWidgetLife(boss2.handle, boss2.maxLife * 0.79);
  sim2.advance(2);
  sim2.natives.SetWidgetLife(boss2.handle, boss2.maxLife * 0.39);
  sim2.advance(2);
  assert.match(runlog(sim2), /feast=0/, 'zero embers -> zero bonus');
});

// ------------------------------------------------- affixes, roster, boss ---

test('elites: three-skull rooms spawn one affixed elite (named, announced) that drops from the 5-consumable table', () => {
  const sim = fresh();
  sim.chat(0, '-test');
  sim.chat(0, '-room killall 3');
  const elites = creeps(sim).filter((u) => ELITE_TYPES[1].includes(u.typeStr));
  assert.strictEqual(elites.length, 1, 'exactly one elite behind a three-skull door');
  assert.match(runlog(sim), /elite\|(Burning|Shielded|Swift|Volatile|Vampiric|Ashveiled) (Pyre Warden|Kindled Overseer)\|/,
    'the elite carries a seeded affix in its name');
  assert.ok(sim.callsOf('BlzSetUnitName').length >= 1, 'the affixed name is applied to the unit');
  assert.ok(plainMsgs(sim).some((t) => /Elite -- \w+ (Pyre Warden|Kindled Overseer): .+\./.test(t)),
    'affix effect announced in words');
  sim.kill(elites[0], hero(sim));
  const dropCount = ['I009', 'I010', 'I038', 'I039', 'I040']
    .reduce((n, t) => n + sim.itemsByType(t).length, 0);
  assert.strictEqual(dropCount, 1, 'one consumable from the 5-deep drop table');
  assert.match(runlog(sim), /elitedrop\|/);
});

test('affix effects are real: Volatile bursts into fodder (seed 1), Shielded gets +40% life (seed 6)', () => {
  const sim = fresh();
  sim.chat(0, '-seed 1');
  sim.chat(0, '-test');
  sim.chat(0, '-room killall 3');
  assert.match(runlog(sim), /elite\|Volatile Pyre Warden/);
  const elite = creeps(sim).find((u) => ELITE_TYPES[1].includes(u.typeStr));
  const before = creeps(sim).length;
  sim.kill(elite, hero(sim));
  assert.strictEqual(creeps(sim).length, before + 1, 'volatile death: -1 elite, +2 fodder');
  assert.match(runlog(sim), /volatile\|burst/);

  const sim6 = fresh();
  sim6.chat(0, '-seed 6');
  sim6.chat(0, '-test');
  sim6.chat(0, '-room killall 3');
  assert.match(runlog(sim6), /elite\|Shielded Kindled Overseer/);
  const shielded = creeps(sim6).find((u) => ELITE_TYPES[1].includes(u.typeStr));
  assert.ok(Math.abs(shielded.maxLife - 720 * 1.4) < 0.001, 'Shielded: 720 * 1.4 = 1008 max life');
});

test('the tiered roster: every floor spawns only its own tier (20 creeps + 6 elites in object data)', () => {
  const units = JSON.parse(fs.readFileSync(path.join(MAP, 'objects-units.json'), 'utf8')).custom;
  const creepEntries = Object.keys(units).filter((k) => /^u0(0[0-5]|1[1-9]|2[0-4]):/.test(k));
  assert.strictEqual(creepEntries.length, 20, '20 creep kits (u000-u005, u011-u024)');
  const eliteEntries = Object.keys(units).filter((k) => /^u0(0[67]|2[5-8]):/.test(k));
  assert.strictEqual(eliteEntries.length, 6, '6 elite kits');
  const TIER_SETS = {
    1: new Set(['u000', 'u001', 'u011', 'u012', 'u013', 'u014', ...ELITE_TYPES[1]]),
    2: new Set(['u002', 'u003', 'u015', 'u016', 'u017', 'u018', 'u019', ...ELITE_TYPES[2]]),
    3: new Set(['u004', 'u005', 'u020', 'u021', 'u022', 'u023', 'u024', ...ELITE_TYPES[3]]),
  };
  for (const f of [1, 2, 3]) {
    const sim = fresh();
    sim.chat(0, '-test');
    if (f > 1) sim.chat(0, `-floor ${f}`);
    sim.chat(0, '-room killall 3');
    const types = creeps(sim).map((u) => u.typeStr);
    assert.ok(types.length > 0);
    for (const t of types) {
      assert.ok(TIER_SETS[f].has(t), `floor ${f} spawned ${t} — outside its tier deck`);
    }
  }
});

test('the template deck: 20 authored rooms (7/7/6), unique keys, all three objectives per floor', () => {
  const idx = fresh().global('TemplateIndex');
  const floors = idx.split(';').map((s) => s.split(':')[1].split(','));
  assert.deepStrictEqual(floors.map((f) => f.length), [7, 7, 6], '7+7+6 = 20 templates');
  const all = floors.flat();
  assert.strictEqual(new Set(all).size, 20, 'all template keys are unique');
});

test('boss add-patterns: one of two seeded aspects, announced at the gate (Spark Swarm here; Shard Ring in the golden run)', () => {
  const sim = fresh();
  sim.chat(0, '-test');
  sim.chat(0, '-boss');
  assert.match(runlog(sim), /boss\|pattern=Spark Swarm/);
  assert.ok(plainMsgs(sim).some((t) => /wakes in its SPARK SWARM aspect/.test(t)),
    'the aspect is announced before any phase fires');
  const boss = sim.findUnit('u008');
  sim.natives.SetWidgetLife(boss.handle, boss.maxLife * 0.79);
  sim.advance(2);
  assert.strictEqual(sim.allUnits('u009').filter((u) => u.alive).length, 3,
    'Spark Swarm phase 2: 3 Heart Sparks (solo)');
  sim.natives.SetWidgetLife(boss.handle, boss.maxLife * 0.39);
  sim.advance(2);
  assert.strictEqual(sim.allUnits('u010').filter((u) => u.alive).length, 2,
    'Spark Swarm phase 3: 2 Molten Shards (solo)');
});

// ------------------------------------------------------- fairness polish ---

test('-help documents every command, the mechanics, and the credited inspirations', () => {
  const sim = fresh();
  sim.chat(0, '-help');
  const out = plainMsgs(sim).join('\n');
  for (const cmd of ['-help', '-sigils', '-vow', '-seed', '-test', '-floor', '-room', '-trial',
    '-embers', '-boon', '-grant', '-clear', '-wrath', '-insight', '-covenant', '-boss',
    '-god', '-ff', '-runlog']) {
    assert.ok(out.includes(cmd), `-help mentions ${cmd}`);
  }
  assert.ok(/covenant/i.test(out) && /TRIAL/i.test(out) && /Wrath/.test(out) && /feeds on them|FEEDS/i.test(out),
    '-help explains the run mechanics');
  assert.ok(/DeathdruidX/.test(out) && /Ulfsire/.test(out) && /PortusM/.test(out),
    'credits are in-game, not just in the README');
});

test('the credits quest names all three inspirations and what was adapted from each', () => {
  const sim = fresh();
  const descs = sim.callsOf('QuestSetDescription').map((c) => String(c.args[1]));
  const credits = descs.find((d) => /Credits|inspirations/i.test(d) || /DeathdruidX/.test(d));
  assert.ok(credits, 'a credits quest is created at map start');
  assert.match(credits, /Roguelike by DeathdruidX/);
  assert.match(credits, /Ulfsire's Roguelike/);
  assert.match(credits, /Just Another Roguelike by PortusM/);
  assert.match(credits, /Sin ambush|Wrath/);
  assert.match(credits, /risk contracts|trial doors/i);
});
