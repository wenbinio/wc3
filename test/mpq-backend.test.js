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
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { createArchive, extractAll, listFiles, backendName } = require(path.join(ROOT, 'lib', 'mpq'));
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

test.after(() => {
  fs.rmSync(WORK, { recursive: true, force: true });
});
