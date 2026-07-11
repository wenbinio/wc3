'use strict';
// Protected-map (stripped listfile) extraction regressions for lib/mpq.js:
//   (a) extractAll always reports total vs named-extracted vs unresolved
//       entry counts, so anonymous members are never silently invisible
//   (b) opts.dumpUnknown / WC3_EXTRACT_UNKNOWN=1 dumps the unresolved
//       (FileNNNNNNNN pseudo-named) members under _unknown/ with
//       content-sniffed extensions ('MDLX' -> .mdx, 'BLP1' -> .blp, ...)
//   (c) the _unknown/ dump stays diagnostics-only: map-to-json skips it and
//       nothing under _unknown/ ever becomes map source
// The protected fixture is synthesized in-test: a normal archive whose
// internal-file hash entries ('(listfile)'/'(attributes)') are then
// corrupted exactly the way map protectors do it — every member's name
// becomes unrecoverable while hash lookup by exact name keeps working.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const FIXTURES = path.join(ROOT, 'fixtures');
const { createArchive, extractAll, backendName } = require(path.join(ROOT, 'lib', 'mpq'));
const { buildHeader } = require(path.join(ROOT, 'lib', 'header'));
const { extractedToSource } = require(path.join(ROOT, 'lib', 'source'));

const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'wc3-toolkit-protected-test-'));

// --------------------------------------------------------------------------
// Standard MPQ crypt (crypt table + name hash + block cipher), used to
// corrupt the internal-file hash entries — the classic protection scheme.

const CT = (() => {
  const t = new Uint32Array(0x500);
  let seed = 0x00100001;
  for (let i = 0; i < 0x100; i++) {
    for (let j = 0; j < 5; j++) {
      seed = (seed * 125 + 3) % 0x2AAAAB;
      const a = (seed & 0xFFFF) << 16;
      seed = (seed * 125 + 3) % 0x2AAAAB;
      t[i + j * 0x100] = (a | (seed & 0xFFFF)) >>> 0;
    }
  }
  return t;
})();

function hashString(s, type) {
  let s1 = 0x7FED7FED, s2 = 0xEEEEEEEE;
  const up = s.toUpperCase();
  for (let i = 0; i < up.length; i++) {
    const c = up.charCodeAt(i);
    s1 = (CT[type * 0x100 + c] ^ ((s1 + s2) >>> 0)) >>> 0;
    s2 = (c + s1 + s2 + (s2 << 5) + 3) >>> 0;
  }
  return s1 >>> 0;
}

function cryptBlock(u32, key, decrypt) {
  let seed = 0xEEEEEEEE;
  for (let i = 0; i < u32.length; i++) {
    seed = (seed + CT[0x400 + (key & 0xFF)]) >>> 0;
    const stored = u32[i];
    const plain = decrypt ? (stored ^ ((key + seed) >>> 0)) >>> 0 : stored;
    if (decrypt) u32[i] = plain; else u32[i] = (plain ^ ((key + seed) >>> 0)) >>> 0;
    key = ((((~key) << 0x15) + 0x11111111) | (key >>> 0x0B)) >>> 0;
    seed = (plain + seed + (seed << 5) + 3) >>> 0;
  }
}

// Corrupt the hash-table name fields of the internal files so no name in the
// archive is recoverable (all members enumerate as pseudo-names), while
// every real member remains reachable by exact-name hash lookup.
function stripListfile(archivePath) {
  const buf = fs.readFileSync(archivePath);
  let off = -1;
  for (let o = 0; o + 4 <= buf.length; o += 512) {
    if (buf.readUInt32LE(o) === 0x1A51504D) { off = o; break; } // 'MPQ\x1a'
  }
  assert.ok(off >= 0, 'MPQ header found');
  const hashPos = off + buf.readUInt32LE(off + 0x10);
  const hashCount = buf.readUInt32LE(off + 0x18);
  const words = new Uint32Array(hashCount * 4);
  for (let i = 0; i < words.length; i++) words[i] = buf.readUInt32LE(hashPos + i * 4);
  const key = hashString('(hash table)', 3);
  cryptBlock(words, key, true);
  let hit = 0;
  for (const name of ['(listfile)', '(attributes)', '(signature)']) {
    const a = hashString(name, 1), b = hashString(name, 2);
    for (let e = 0; e < hashCount; e++) {
      if (words[e * 4] === a && words[e * 4 + 1] === b) {
        words[e * 4] = 0xDEADBEEF; words[e * 4 + 1] = 0xDEADBEEF;
        hit++;
      }
    }
  }
  cryptBlock(words, key, false);
  for (let i = 0; i < words.length; i++) buf.writeUInt32LE(words[i], hashPos + i * 4);
  fs.writeFileSync(archivePath, buf);
  return hit;
}

// --------------------------------------------------------------------------

const MDX = Buffer.concat([Buffer.from('MDLX'), Buffer.alloc(64, 7)]);
const BLP = Buffer.concat([Buffer.from('BLP1'), Buffer.alloc(64, 3)]);
const TXT = Buffer.from('secret readme\nline two\n');
// named-probe-able members (in KNOWN_FILES) + anonymous-only custom imports
const NAMED = ['war3map.w3i', 'war3map.wts'];
const HIDDEN = 3; // secret.mdx, secret.blp, readme.txt

const W3X = path.join(WORK, 'protected.w3x');

test.before(() => {
  const src = path.join(WORK, 'members');
  fs.mkdirSync(path.join(src, 'war3mapImported'), { recursive: true });
  for (const n of NAMED) fs.copyFileSync(path.join(FIXTURES, n), path.join(src, n));
  fs.writeFileSync(path.join(src, 'war3mapImported', 'secret.mdx'), MDX);
  fs.writeFileSync(path.join(src, 'war3mapImported', 'secret.blp'), BLP);
  fs.writeFileSync(path.join(src, 'readme.txt'), TXT);
  createArchive(W3X, src, [...NAMED, 'war3mapImported/secret.mdx', 'war3mapImported/secret.blp', 'readme.txt'],
    buildHeader({ name: 'protected', flags: 1, maxPlayers: 2 }));
  assert.ok(stripListfile(W3X) >= 1, 'internal hash entries corrupted');
});

test(`(a) [${backendName()}] extractAll reports total vs named vs unresolved on a stripped-listfile archive`, () => {
  const outDir = path.join(WORK, 'named-only');
  const res = extractAll(W3X, outDir);
  assert.deepStrictEqual(res.extracted.sort(), [...NAMED].sort(), 'named extraction probes KNOWN_FILES');
  // total counts every non-internal entry; the anonymized internal files are
  // indistinguishable, so they count too (>= 5 members + ex-(listfile))
  assert.ok(res.total >= NAMED.length + HIDDEN + 1, `total entries reported (got ${res.total})`);
  assert.strictEqual(res.unresolved, res.total - NAMED.length, 'unresolved = total - named');
  assert.ok(res.unresolved >= HIDDEN, 'the hidden members are counted, not silently dropped');
  assert.deepStrictEqual(res.unknown, [], 'no dump without the option');
  assert.ok(!fs.existsSync(path.join(outDir, '_unknown')), 'no _unknown/ dir without the option');
});

test(`(b) [${backendName()}] dumpUnknown dumps pseudo-named members with sniffed extensions, deduped against named files`, () => {
  const outDir = path.join(WORK, 'dumped');
  const res = extractAll(W3X, outDir, { dumpUnknown: true });
  assert.deepStrictEqual(res.extracted.sort(), [...NAMED].sort(), 'named extraction unchanged');
  assert.strictEqual(res.unknown.length, res.unresolved,
    'every unresolved member dumped (named duplicates skipped, nothing else lost)');
  assert.ok(res.unknown.every((r) => /^_unknown\/File\d{8}\.\w+$/.test(r)), `pseudo-named under _unknown/ (${res.unknown})`);

  const byExt = (ext) => res.unknown.filter((r) => r.endsWith('.' + ext));
  assert.strictEqual(byExt('mdx').length, 1, 'MDLX magic sniffed as .mdx');
  assert.ok(fs.readFileSync(path.join(outDir, byExt('mdx')[0])).equals(MDX), 'hidden MDX recovered bit-identically');
  assert.strictEqual(byExt('blp').length, 1, 'BLP1 magic sniffed as .blp');
  assert.ok(fs.readFileSync(path.join(outDir, byExt('blp')[0])).equals(BLP), 'hidden BLP recovered bit-identically');
  const txts = byExt('txt').map((r) => fs.readFileSync(path.join(outDir, r)));
  assert.ok(txts.some((b) => b.equals(TXT)), 'hidden text file recovered as .txt');

  // named duplicates (war3map.w3i / war3map.wts also exist as pseudo-entries)
  // must NOT be dumped twice
  for (const n of NAMED) {
    const named = fs.readFileSync(path.join(outDir, n));
    assert.ok(!res.unknown.some((r) => fs.readFileSync(path.join(outDir, r)).equals(named)), `${n} not duplicated in _unknown/`);
  }
  // nothing pseudo-named leaks into the archive-root extraction
  assert.ok(!fs.readdirSync(outDir).some((n) => /^File\d{8}\./.test(n)), 'no pseudo-files at extraction root');
});

test(`[${backendName()}] WC3_EXTRACT_UNKNOWN=1 enables the dump without code changes`, () => {
  const outDir = path.join(WORK, 'env-dumped');
  const prev = process.env.WC3_EXTRACT_UNKNOWN;
  process.env.WC3_EXTRACT_UNKNOWN = '1';
  try {
    const res = extractAll(W3X, outDir);
    assert.ok(res.unknown.length >= HIDDEN, 'env var triggers the dump');
  } finally {
    if (prev === undefined) delete process.env.WC3_EXTRACT_UNKNOWN;
    else process.env.WC3_EXTRACT_UNKNOWN = prev;
  }
});

test('(c) map-to-json skips _unknown/: pseudo-files never become map source', () => {
  const extractedDir = path.join(WORK, 'dumped'); // from test (b), includes _unknown/
  const sourceDir = path.join(WORK, 'dumped-src');
  const manifest = extractedToSource(extractedDir, sourceDir);
  assert.ok(manifest.skipped.length >= HIDDEN, 'dump recorded as skipped');
  assert.ok(manifest.skipped.every((r) => r.startsWith('_unknown/')), 'only diagnostics skipped');
  assert.ok(manifest.copied.every((r) => !r.startsWith('_unknown/')), 'dump not copied through');
  assert.ok(!fs.existsSync(path.join(sourceDir, 'files', '_unknown')), 'no files/_unknown in map source');
  assert.deepStrictEqual(manifest.errors, [], 'pseudo-files cause no translation errors');
  assert.strictEqual(manifest.translated['war3map.w3i'], 'info.json', 'real members still translate');
});

test('w3x-extract CLI prints entry counts and honors --dump-unknown', () => {
  const run = (args) => spawnSync('node', [path.join(ROOT, 'tools', 'w3x-extract.js'), ...args], { encoding: 'utf8' });

  const plain = run([W3X, path.join(WORK, 'cli-plain')]);
  assert.strictEqual(plain.status, 0, plain.stderr);
  assert.match(plain.stdout, /archive entries: \d+ — named extracted: 2, unresolved \(anonymous\): \d+/, 'counts printed');
  assert.match(plain.stdout, /anonymous member\(s\) were NOT extracted .*--dump-unknown/, 'hint printed');

  const dump = run(['--dump-unknown', W3X, path.join(WORK, 'cli-dump')]);
  assert.strictEqual(dump.status, 0, dump.stderr);
  assert.match(dump.stdout, /dumped \d+ anonymous member\(s\) under .*_unknown\//, 'dump reported');
  assert.match(dump.stdout, /_unknown\/File\d{8}\.mdx/, 'sniffed MDX listed');
  assert.ok(fs.existsSync(path.join(WORK, 'cli-dump', '_unknown')), '_unknown/ created by CLI flag');
});

test.after(() => {
  fs.rmSync(WORK, { recursive: true, force: true });
});
