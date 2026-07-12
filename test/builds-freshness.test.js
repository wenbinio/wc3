'use strict';
// maps/builds/ freshness guard: the committed compiled .w3x of every bundled
// map source must match a fresh build of that source. Comparison is by
// EXTRACTED MEMBER CONTENT, never archive bytes — MPQ packing (hash table
// layout, compression) is nondeterministic, member payloads are not.
// A failure here means a bundled source changed (or a build-pipeline change
// altered the generated blocks/binaries) without regenerating the committed
// artifact — the doctrine is: rebuild via build-map and commit the new .w3x
// (CLAUDE.md "Map source anatomy": maps/builds/ holds the committed compiled
// map of each bundled source).
// Cost: ~5s for all five maps (build 0.3s each + two extractions), so the
// guard is default-on — no env gate.
// Side benefit: this also pins "every bundled map still builds clean" for
// build-map's strict gates (model sanity, luaparse, generated-constant lint).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BUILDS = path.join(ROOT, 'maps', 'builds');
const { buildMap } = require(path.join(ROOT, 'tools', 'build-map'));
const { extractAll } = require(path.join(ROOT, 'lib', 'mpq'));
const { walk } = require(path.join(ROOT, 'lib', 'source'));
const { parseHeader } = require(path.join(ROOT, 'lib', 'header'));

const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'wc3-builds-fresh-test-'));

const artifacts = fs.readdirSync(BUILDS).filter((f) => f.endsWith('.w3x')).sort();

test('every bundled map source has a committed artifact and vice versa', () => {
  assert.ok(artifacts.length >= 5, `expected the bundled maps under maps/builds/, got ${artifacts.length}`);
  const sources = fs.readdirSync(path.join(ROOT, 'maps'), { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== 'builds').map((e) => e.name).sort();
  assert.deepStrictEqual(artifacts.map((f) => f.replace(/\.w3x$/, '')), sources,
    'maps/builds/<name>.w3x set matches the bundled source set');
});

for (const artifact of artifacts) {
  const name = artifact.replace(/\.w3x$/, '');
  test(`maps/builds/${artifact} is fresh (extracted members match a rebuild)`, () => {
    const committedW3x = path.join(BUILDS, artifact);
    const rebuiltW3x = path.join(WORK, `${name}-rebuilt.w3x`);
    buildMap(path.join(ROOT, 'maps', name), rebuiltW3x, {}); // throws on any build FAIL

    // HM3W pre-headers must agree field for field
    assert.deepStrictEqual(
      parseHeader(fs.readFileSync(rebuiltW3x)),
      parseHeader(fs.readFileSync(committedW3x)),
      'HM3W header fields');

    const committedDir = path.join(WORK, `${name}-committed`);
    const rebuiltDir = path.join(WORK, `${name}-rebuilt`);
    extractAll(committedW3x, committedDir);
    extractAll(rebuiltW3x, rebuiltDir);

    const committedMembers = walk(committedDir).sort();
    const rebuiltMembers = walk(rebuiltDir).sort();
    assert.deepStrictEqual(rebuiltMembers, committedMembers, 'same archive member set');
    const stale = committedMembers.filter((m) =>
      !fs.readFileSync(path.join(committedDir, m)).equals(fs.readFileSync(path.join(rebuiltDir, m))));
    assert.deepStrictEqual(stale, [],
      `member content diverged — the committed artifact is stale; regenerate it: node tools/build-map.js maps/${name} maps/builds/${artifact}`);
  });
}

test.after(() => {
  fs.rmSync(WORK, { recursive: true, force: true });
});
