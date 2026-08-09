'use strict';
// MPQ backend tests: lib/mpq.js uses stormlib-node when loadable and falls
// back to the smpq CLI; WC3_MPQ_BACKEND=smpq forces the fallback. The whole
// suite runs under both backends in CI style:
//   npm test            # default (stormlib-node when loadable)
//   npm run test:smpq   # forced smpq CLI fallback
// This file additionally cross-checks the two backends against each other
// in one process (archives made by one must extract bit-identically with
// the other), so a plain `npm test` still covers basic interop.

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { createArchive, extractAll, listFiles, probeExtract, backendName } = require(path.join(ROOT, 'lib', 'mpq'));
const { buildHeader, HEADER_SIZE } = require(path.join(ROOT, 'lib', 'header'));

const FIXTURES = path.join(ROOT, 'fixtures');
const MEMBERS = ['war3map.w3i', 'war3map.w3e', 'war3map.wts', 'war3map.doo'];
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'wc3-toolkit-mpq-test-'));

function withBackend(name, fn) {
  const prev = process.env.WC3_MPQ_BACKEND;
  process.env.WC3_MPQ_BACKEND = name;
  try { return fn(); } finally {
    if (prev === undefined) delete process.env.WC3_MPQ_BACKEND;
    else process.env.WC3_MPQ_BACKEND = prev;
  }
}

function availableBackends() {
  const backends = ['smpq'];
  try {
    if (withBackend('', () => backendName()) === 'stormlib') backends.unshift('stormlib');
  } catch { /* native module unavailable */ }
  return backends;
}

const BACKENDS = availableBackends();

test(`active backend is reported (this run: ${backendName()})`, () => {
  assert.ok(['stormlib', 'smpq'].includes(backendName()));
  assert.strictEqual(withBackend('smpq', () => backendName()), 'smpq', 'WC3_MPQ_BACKEND=smpq forces the CLI fallback');
});

for (const writer of BACKENDS) {
  test(`createArchive[${writer}]: one-pass .w3x (header + MPQ v1 at 512), compressed, both backends read it back`, () => {
    const out = path.join(WORK, `made-by-${writer}.w3x`);
    const header = buildHeader({ name: `backend ${writer}`, flags: 1, maxPlayers: 2 });
    withBackend(writer, () => createArchive(out, FIXTURES, MEMBERS, header));

    const buf = fs.readFileSync(out);
    assert.strictEqual(buf.toString('latin1', 0, 4), 'HM3W', 'pre-header first');
    assert.strictEqual(buf.toString('latin1', HEADER_SIZE, HEADER_SIZE + 4), 'MPQ\x1a', 'MPQ magic at offset 512');
    const raw = MEMBERS.reduce((n, m) => n + fs.statSync(path.join(FIXTURES, m)).size, 0);
    assert.ok(buf.length < raw, `archive (${buf.length}) smaller than raw members (${raw}) => compression active`);

    for (const reader of BACKENDS) {
      const outDir = path.join(WORK, `${writer}-read-by-${reader}`);
      const result = withBackend(reader, () => extractAll(out, outDir));
      assert.deepStrictEqual(result.extracted.sort(), [...MEMBERS].sort(), `${reader} extracts every member`);
      assert.strictEqual(result.total, MEMBERS.length, `${reader} reports total entries (internal files excluded)`);
      assert.strictEqual(result.unresolved, 0, `${reader} reports no anonymous entries on a listfile'd archive`);
      assert.deepStrictEqual(result.unknown, [], `${reader} dumps nothing without dumpUnknown`);
      for (const m of MEMBERS) {
        assert.ok(
          fs.readFileSync(path.join(outDir, m)).equals(fs.readFileSync(path.join(FIXTURES, m))),
          `${m}: ${writer}-written archive read back bit-identically by ${reader}`
        );
      }
      const names = withBackend(reader, () => listFiles(out));
      for (const m of MEMBERS) assert.ok(names.includes(m), `${reader} listFiles sees ${m}`);
    }
  });
}

// ---------------------------------------------------------------------------
// Read-safety (gotcha 15 / gotcha 5): opening an archive to READ it must never
// write to it. A committed .w3x that a read silently rewrites (maps/builds/*,
// or the owner-directed test/*_EN.w3x translation set) shows up as an
// unexplained `M <file>` in git status and gets "helpfully" reverted by
// whoever notices it next — destroying whatever real work put it there.
//
// Reported as a live bug in 2026-08 ("npm test mutates test/NameTagRip_EN.w3x
// by ~5 bytes"). It did NOT reproduce, and the investigation is worth
// recording so it is not re-run by hand:
//   - Every SFileOpenArchive site in lib/mpq.js already passes
//     STREAM_FLAG.READ_ONLY, and has since 2026-07 (79563e0 / fbfdf46).
//   - The enum resolves to 256, not undefined — an undefined lookup would
//     coerce to 0 = read/write, which is the plausible way this class of bug
//     WOULD appear, so it is pinned below.
//   - Measured negative control: opening these archives with flags = 0
//     (read/write) and closing them did not change a byte either — this
//     StormLib build only flushes an archive it actually modified. So the
//     flag is defense-in-depth, not the sole thing standing between a read
//     and a rewrite. Do not remove it on that basis.
//   - The reported ~5 bytes were a deliberate committed content change
//     (df084a8, war3mapSkin.txt 512 -> 524 bytes restoring the CRLF dialect),
//     not a tool-induced mutation.
// These tests pin the outcome regardless of mechanism: the enum still means
// what we think, every open site passes it, and a real read of a real archive
// leaves the bytes alone.

// Scope: test/ holds an owner-directed set of third-party translated maps
// (test/*_EN.w3x) that is explicitly excluded from all toolkit doctrine — the
// toolkit's own suite must never pull them in. They are not fixtures. This is
// a static lint rather than a behavioral one on purpose: an "did the suite read
// them" check via atime is not reliable here (other agents sweep the same files
// concurrently, which is exactly what made this look like a test-suite bug in
// the first place).
test('scope: no toolkit test references the owner-directed translation set in test/', () => {
  // Built from parts so this guard does not match its own source.
  const NEEDLE = '_EN' + '.w3x';
  // Comments are stripped first: this file discusses those paths in prose.
  const decomment = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const dir = __dirname;
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.test.js'))) {
    const code = decomment(fs.readFileSync(path.join(dir, f), 'utf8'));
    assert.ok(!code.includes(NEEDLE),
      `${f}: names a file from the owner-directed translation set in test/. Those archives are third-party `
      + 'and excluded from toolkit doctrine — they are not fixtures. Use fixtures/ (MIT) or a built map instead.');
  }
});

test('read-safety: stormlib-node still exposes a non-zero STREAM_FLAG.READ_ONLY', { skip: !BACKENDS.includes('stormlib') && 'stormlib-node not loadable' }, () => {
  const E = require('stormlib-node/dist/enums');
  assert.ok(E.STREAM_FLAG && typeof E.STREAM_FLAG.READ_ONLY === 'number',
    'STREAM_FLAG.READ_ONLY must exist as a number — an undefined enum coerces to 0 = read/write');
  assert.notStrictEqual(E.STREAM_FLAG.READ_ONLY, 0,
    'STREAM_FLAG.READ_ONLY must be non-zero (0 would open the archive read/write)');
});

test('read-safety: every SFileOpenArchive in lib/mpq.js passes STREAM_FLAG.READ_ONLY', () => {
  const src = fs.readFileSync(path.join(ROOT, 'lib', 'mpq.js'), 'utf8');
  const calls = [...src.matchAll(/SFileOpenArchive\s*\(([^)]*)\)/g)];
  assert.ok(calls.length >= 1, 'lib/mpq.js opens archives via SFileOpenArchive');
  for (const [, args] of calls) {
    assert.match(args, /STREAM_FLAG\.READ_ONLY/,
      `SFileOpenArchive(${args}) must pass STREAM_FLAG.READ_ONLY — reads may never mutate the archive (gotcha 15)`);
  }
});

for (const reader of BACKENDS) {
  test(`read-safety[${reader}]: listFiles/extractAll/probeExtract leave the archive byte-identical`, () => {
    // Copy a committed artifact rather than reading it in place: a test must
    // never be able to damage maps/builds/ even if this invariant regresses.
    const src = path.join(ROOT, 'maps', 'builds', 'demo.w3x');
    const probe = path.join(WORK, `readsafe-${reader}.w3x`);
    fs.copyFileSync(src, probe);
    const before = crypto.createHash('sha256').update(fs.readFileSync(probe)).digest('hex');
    const sizeBefore = fs.statSync(probe).size;

    withBackend(reader, () => {
      listFiles(probe);
      extractAll(probe, path.join(WORK, `readsafe-${reader}-ex`), { dumpUnknown: true });
      probeExtract(probe, path.join(WORK, `readsafe-${reader}-probe`), ['war3map.w3i', 'war3map.w3e']);
    });

    assert.strictEqual(fs.statSync(probe).size, sizeBefore, `${reader}: reading must not change the archive size`);
    assert.strictEqual(crypto.createHash('sha256').update(fs.readFileSync(probe)).digest('hex'), before,
      `${reader}: reading an archive must leave it byte-identical (gotcha 15)`);
  });
}

test.after(() => {
  fs.rmSync(WORK, { recursive: true, force: true });
});
