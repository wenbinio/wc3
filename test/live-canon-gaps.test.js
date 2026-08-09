'use strict';
// Three FALSE-FAIL regressions found by profiling the LIVE hosted canon
// (2026-08): every one of these made validate-map/preflight fail maps that
// demonstrably run right now, with live player bases. Per the WARN doctrine
// (CLAUDE.md), FAIL is reserved for things that break the map for players.
//
//   GAP-1 script-path case sensitivity (lib/scriptfiles.js): MPQ member
//         names are case-insensitive and Tower Survivors v1.90 ships its
//         ONLY script as `Scripts\war3map.j` (capital S). The hardcoded
//         lowercase lookup reported "no war3map.lua or war3map.j in
//         archive" on a map with 352 games/month.
//   GAP-2 the JASS gate fired on a DECOY stub inside a Lua map: Hero Strife
//         TD v3.1.9 is scriptLanguage 1 with a valid 2.1MB war3map.lua AND a
//         26-byte garbage `scripts\war3map.j` (JASSHelper/anti-tamper
//         leftover). Only the script the game runs may fail the map
//         (gotcha 7); the secondary is WARN + unchecked.
//   GAP-3 classic (pre-1.32) .doo overread (lib/classicdoo.js): upstream
//         reads a 1.32+-only per-entry skinId and drifts +4 bytes/entry.
//         133 of 331 profiled mid-tail live maps are saved by such an
//         editor. WARN + raw copy (the gotcha-26 trap-stub treatment) —
//         and ONLY for this identified signature: any other translator
//         throw, including a genuinely corrupt .doo, still FAILs.
//
// Fixtures are synthetic (fixtures/ MIT + the viewer's own classic writer);
// no third-party map is committed (gotcha 9 / Legal).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const FIXTURES = path.join(ROOT, 'fixtures');
const { findScriptMembers, resolvePrimary, isScriptMember } = require(path.join(ROOT, 'lib', 'scriptfiles'));
const { isClassicDooOverread } = require(path.join(ROOT, 'lib', 'classicdoo'));
const { byWar, warToJson } = require(path.join(ROOT, 'lib', 'filemap'));
const { extractedToSource } = require(path.join(ROOT, 'lib', 'source'));
const { extractAll } = require(path.join(ROOT, 'lib', 'mpq'));
const { packDir } = require(path.join(ROOT, 'tools', 'w3x-pack'));
const { validate } = require(path.join(ROOT, 'tools', 'validate-map'));

function tmpdir(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `wc3-${label}-`));
}

const CLEANUP = [];
function scratch(label) {
  const d = tmpdir(label);
  CLEANUP.push(d);
  return d;
}
process.on('exit', () => {
  for (const d of CLEANUP) fs.rmSync(d, { recursive: true, force: true });
});

// Build the demo map (optionally with extra/modified source files), extract
// it, let `mutate` rewrite the extracted member tree, repack and validate.
// This is the only way to get archive members our own source layout cannot
// express (an uppercase `Scripts\`, a classic-layout .doo).
function validateMutatedDemo(label, mutate, sourceMutate) {
  const src = scratch(`${label}-src`);
  const work = scratch(`${label}-work`);
  fs.cpSync(path.join(ROOT, 'maps', 'demo'), src, { recursive: true });
  if (sourceMutate) sourceMutate(src);
  const first = path.join(work, 'first.w3x');
  const buildLog = execFileSync(process.execPath,
    [path.join(ROOT, 'tools', 'build-map.js'), src, first],
    { stdio: ['pipe', 'pipe', 'pipe'] });
  const xdir = path.join(work, 'x');
  extractAll(first, xdir);
  if (mutate) mutate(xdir);
  const out = path.join(work, 'mutated.w3x');
  packDir(xdir, out);
  return { results: validate(out), buildLog: String(buildLog) };
}

const nameOf = (results, name) => results.find((r) => r.name === name);
const failures = (results) => results.filter((r) => !r.pass && !r.warn);

// A minimal, valid JASS map script (pjass grammar level).
const MINIMAL_JASS = [
  'function config takes nothing returns nothing',
  '    call SetMapName("Toolkit Demo Map")',
  'endfunction',
  'function main takes nothing returns nothing',
  '    call SetCameraBounds(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0)',
  'endfunction',
  '',
].join('\n');

// The real decoy: 26 bytes of control characters where a script should be.
// pjass reports "Unrecognized character (ASCII 1)" on it, over and over.
const DECOY_J = Buffer.alloc(26, 0x01);

// ---- GAP-1: case-insensitive script members ---------------------------------

test('scriptfiles: script members match case- and slash-insensitively', () => {
  assert.ok(isScriptMember('Scripts\\war3map.j'));
  assert.ok(isScriptMember('SCRIPTS/WAR3MAP.LUA'));
  assert.ok(isScriptMember('war3map.J'));
  assert.ok(!isScriptMember('files/war3map.j.bak'));
  assert.ok(!isScriptMember('war3map.w3i'));

  const found = findScriptMembers([
    'war3map.w3e', 'Scripts\\war3map.j', 'war3map.lua', 'imports/x.mdx',
  ]);
  // original spellings preserved, root before scripts/, lua before j
  assert.deepStrictEqual(found.all, ['war3map.lua', 'Scripts\\war3map.j']);
  assert.deepStrictEqual(found.lua, ['war3map.lua']);
  assert.deepStrictEqual(found.jass, ['Scripts\\war3map.j']);
});

test('validate-map: an uppercase Scripts/war3map.j IS the map script (Tower Survivors v1.90)', () => {
  // demo, converted to a JASS map, with the script moved to the capital-S
  // folder the real map uses. Before the fix this reported
  //   FAIL  map script present  (no war3map.lua or war3map.j in archive)
  const { results } = validateMutatedDemo('gap1', (xdir) => {
    fs.mkdirSync(path.join(xdir, 'Scripts'), { recursive: true });
    fs.renameSync(path.join(xdir, 'war3map.j'), path.join(xdir, 'Scripts', 'war3map.j'));
  }, (src) => {
    fs.rmSync(path.join(src, 'war3map.lua'));
    fs.writeFileSync(path.join(src, 'war3map.j'), MINIMAL_JASS);
    const info = JSON.parse(fs.readFileSync(path.join(src, 'info.json'), 'utf8'));
    info.scriptLanguage = 0;
    fs.writeFileSync(path.join(src, 'info.json'), JSON.stringify(info, null, 2));
  });

  const present = nameOf(results, 'map script present');
  assert.ok(present && present.pass && !present.warn, 'map script present must PASS');
  assert.match(present.detail, /Scripts\/war3map\.j/);
  // and it is gated as the real script (pjass PASS, or WARN when pjass is
  // not installed — the optional-tool tier, never a failure)
  const jass = nameOf(results, 'jass syntax Scripts/war3map.j');
  assert.ok(jass, 'the uppercase member reaches the JASS gate');
  assert.ok(jass.pass, 'valid JASS must not fail');
  assert.deepStrictEqual(failures(results), [], 'no hard failures');
});

// ---- GAP-2: a decoy .j must not fail a Lua map ------------------------------

test('scriptfiles: scriptLanguage 1 + a parsing war3map.lua makes any .j secondary', () => {
  const scripts = findScriptMembers(['war3map.lua', 'scripts/war3map.j']);
  const r = resolvePrimary(1, scripts);
  assert.strictEqual(r.language, 'lua');
  assert.deepStrictEqual(r.primary, ['war3map.lua']);
  assert.deepStrictEqual(r.secondary, ['scripts/war3map.j']);

  // a JASS map is the mirror image
  const j = resolvePrimary(0, findScriptMembers(['war3map.lua', 'war3map.j']));
  assert.strictEqual(j.language, 'j');
  assert.deepStrictEqual(j.secondary, ['war3map.lua']);

  // a declared-Lua map whose war3map.lua does NOT parse keeps Lua primary:
  // the broken script must still fail the map
  const broken = resolvePrimary(1, findScriptMembers(['war3map.lua', 'war3map.j']),
    (s) => s !== 'war3map.lua');
  assert.strictEqual(broken.language, 'lua');
  assert.deepStrictEqual(broken.primary, ['war3map.lua']);

  // unreadable w3i (protected map): a parsing war3map.lua wins on evidence
  const unknown = resolvePrimary(null, findScriptMembers(['war3map.lua', 'scripts/war3map.j']));
  assert.strictEqual(unknown.language, 'lua');
  assert.match(unknown.reason, /unreadable/);
});

test('validate-map: a junk secondary .j in a Lua map WARNs, never FAILs (Hero Strife TD v3.1.9)', () => {
  // The decoy rides along as an opaque file, exactly like the real map's
  // 26-byte scripts\war3map.j. Before the fix this reported
  //   FAIL  jass syntax scripts/war3map.j  (line 1: Unrecognized character ...)
  const { results, buildLog } = validateMutatedDemo('gap2', null, (src) => {
    fs.mkdirSync(path.join(src, 'files', 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(src, 'files', 'scripts', 'war3map.j'), DECOY_J);
  });

  const present = nameOf(results, 'map script present');
  assert.ok(present && present.pass);
  assert.match(present.detail, /war3map\.lua/);
  assert.match(present.detail, /scripts\/war3map\.j/);

  const lua = nameOf(results, 'lua syntax war3map.lua');
  assert.ok(lua && lua.pass && !lua.warn, 'the real script is still gated and passes');

  const jass = nameOf(results, 'jass syntax scripts/war3map.j');
  assert.ok(jass, 'the decoy is reported');
  assert.ok(jass.warn, 'as a WARN, not a FAIL');
  assert.match(jass.detail, /not the map script, unchecked/);
  assert.match(jass.detail, /scriptLanguage=1/);
  assert.deepStrictEqual(failures(results), [], 'a decoy cannot fail a working map');
  // build-map mirrors the rule: the decoy packs with a warning, no throw
  assert.ok(!/pjass/.test(buildLog) || /not the map script/.test(buildLog));
});

// ---- GAP-3: classic .doo overread -------------------------------------------

// Down-convert a Reforged (v8 + skinId) .doo fixture to the CLASSIC on-disk
// layout with the viewer's own writer: buildVersion 0 => no skin fields.
// The version dwords are IDENTICAL in both layouts (W3do / 8 / 11), which is
// exactly why the declared version cannot be used to tell them apart.
function makeClassic(kind, fixture) {
  const w3x = require('mdx-m3-viewer-th/dist/cjs/parsers/w3x/index.js').default;
  const f = new w3x[kind].File();
  f.load(new Uint8Array(fs.readFileSync(path.join(FIXTURES, fixture))), 132);
  return Buffer.from(f.save(0));
}

function upstreamThrow(member, buf) {
  try {
    warToJson(byWar.get(member), buf);
    return null;
  } catch (e) {
    return e;
  }
}

test('classicdoo: the pre-1.32 layout is identified by an EXACT classic walk', () => {
  for (const [member, kind, fixture] of [
    ['war3map.doo', 'doo', 'war3map.doo'],
    ['war3mapUnits.doo', 'unitsdoo', 'war3mapUnits.doo'],
  ]) {
    const classic = makeClassic(kind, fixture);
    const err = upstreamThrow(member, classic);
    assert.ok(err, `${member}: upstream must overread on the classic layout`);
    assert.match(String(err.message), /out of range/);
    const hit = isClassicDooOverread(member, classic, err);
    assert.ok(hit, `${member}: identified as the classic layout`);
    assert.strictEqual(hit.bytes, classic.length);
    assert.ok(hit.entries > 0);

    // the header alone proves nothing: the MODERN fixture declares the same
    // W3do/8/11 and must never be excused
    const modern = fs.readFileSync(path.join(FIXTURES, fixture));
    assert.strictEqual(modern.readInt32LE(4), classic.readInt32LE(4));
    assert.strictEqual(modern.readInt32LE(8), classic.readInt32LE(8));
    assert.strictEqual(isClassicDooOverread(member, modern, err), null,
      'a file that parses fine is never classified as a classic overread');

    // a genuinely corrupt classic file (tail chopped) is NOT excused
    const truncated = classic.subarray(0, classic.length - 3);
    const terr = upstreamThrow(member, truncated) || new RangeError('out of range');
    assert.strictEqual(isClassicDooOverread(member, truncated, terr), null,
      'a corrupt .doo still fails: the classic walk does not consume it exactly');

    // and a non-overread error is out of scope no matter the file
    assert.strictEqual(isClassicDooOverread(member, classic,
      new Error('WC3MapTranslator cannot currently parse this version of a war3map file')), null);
  }
  // other members are never touched by this rule
  assert.strictEqual(isClassicDooOverread('war3map.w3s', Buffer.alloc(8),
    new RangeError('The value of "offset" is out of range. It must be >= 0 and <= 4. Received 8')), null);
});

test('validate-map: a classic .doo is WARN + passthrough, a corrupt one still FAILs', () => {
  const classic = makeClassic('doo', 'war3map.doo');
  const { results } = validateMutatedDemo('gap3', (xdir) => {
    fs.writeFileSync(path.join(xdir, 'war3map.doo'), classic);
  });
  const tr = nameOf(results, 'translate war3map.doo');
  assert.ok(tr, 'the file is surfaced');
  assert.ok(tr.warn, 'reported as WARN, not FAIL');
  assert.match(tr.detail, /classic pre-1\.32 \.doo layout/);
  assert.match(tr.detail, /skinId/);
  assert.match(tr.detail, /docs\/upstream/);
  assert.deepStrictEqual(failures(results), [], 'a classic-editor map does not fail');

  // negative control on the SAME path: chop the tail and the FAIL returns
  const { results: bad } = validateMutatedDemo('gap3-bad', (xdir) => {
    fs.writeFileSync(path.join(xdir, 'war3map.doo'), classic.subarray(0, classic.length - 3));
  });
  const badTr = nameOf(bad, 'translate war3map.doo');
  assert.ok(badTr && !badTr.pass && !badTr.warn, 'a corrupt .doo is still a hard FAIL');
});

test('map-to-json: a classic .doo is copied raw and NAMED in the manifest', () => {
  const extracted = scratch('gap3-extracted');
  const source = scratch('gap3-source');
  const classic = makeClassic('doo', 'war3map.doo');
  fs.writeFileSync(path.join(extracted, 'war3map.doo'), classic);
  fs.copyFileSync(path.join(FIXTURES, 'war3map.w3e'), path.join(extracted, 'war3map.w3e'));

  const manifest = extractedToSource(extracted, source);
  const err = manifest.errors.find((e) => e.file === 'war3map.doo');
  assert.ok(err, 'the failure is recorded, never swallowed');
  assert.match(err.note || '', /classic pre-1\.32 \.doo layout/);
  assert.ok(!fs.existsSync(path.join(source, 'doodads.json')), 'not translated');
  assert.ok(fs.readFileSync(path.join(source, 'files', 'war3map.doo')).equals(classic),
    'copied through raw, byte-identical');
});
