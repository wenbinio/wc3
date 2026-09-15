'use strict';
// Purpose-built regression inputs test these utilities, NOT Warcraft behaviour.
// No Blizzard common.j, proprietary maps, models or textures are bundled.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { compareDirectories, inventory, memberName } = require('../tools/compare-map-members');
const { parseNatives, compareApis, readApi } = require('../tools/inspect-game-api');
const compareTool = path.resolve(__dirname, '../tools/compare-map-members.js');
const apiTool = path.resolve(__dirname, '../tools/inspect-game-api.js');

function workspace(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wc3-compat-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const before = path.join(root, 'before'), after = path.join(root, 'after');
  fs.mkdirSync(before); fs.mkdirSync(after);
  return { root, before, after };
}
function put(dir, name, data = 'fixture') {
  const file = path.join(dir, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  return file;
}
function same(w) { put(w.before, 'war3map.lua', '-- regression input'); put(w.after, 'war3map.lua', '-- regression input'); }
function cli(tool, args) { return spawnSync(process.execPath, [tool, ...args], { encoding: 'utf8' }); }
function api(text) { return { natives: parseNatives(text), sourceSha256: null }; }
const DECL = 'native FixtureAction takes integer subject, real amount returns boolean';

test('identical directories report only their limited scope', t => {
  const w = workspace(t); same(w);
  const report = compareDirectories(w.before, w.after);
  assert.equal(report.status, 'MATCH_WITHIN_SCOPE');
  assert.equal(report.unchanged, 1);
  assert.equal(report.runtimeValidated, false);
  assert.match(report.archiveCompleteness, /not established/);
  assert.deepEqual(report.changes, []);
});
test('one changed byte is detected with before/after hashes', t => {
  const w = workspace(t); same(w); put(w.after, 'war3map.lua', '-- regression inpuT');
  const report = compareDirectories(w.before, w.after);
  assert.equal(report.status, 'DIFFERENCES');
  assert.equal(report.changes[0].kind, 'changed');
  assert.notEqual(report.changes[0].before.sha256, report.changes[0].after.sha256);
});
test('additions and removals need their own explicit allowance', t => {
  const w = workspace(t); same(w); put(w.before, 'skin.bin'); put(w.after, 'light.bin');
  assert.equal(compareDirectories(w.before, w.after, { changed: ['skin.bin', 'light.bin'] }).unexpected, 2);
  const report = compareDirectories(w.before, w.after, { added: ['light.bin'], removed: ['skin.bin'] });
  assert.equal(report.status, 'MATCH_WITHIN_SCOPE');
  assert.equal(report.changes.length, 2);
});
test('changed allowance is exact and case-insensitive for ASCII', t => {
  const w = workspace(t); same(w); put(w.after, 'war3map.lua', '-- changed');
  assert.equal(compareDirectories(w.before, w.after, { changed: ['WAR3MAP.LUA'] }).status, 'MATCH_WITHIN_SCOPE');
  assert.throws(() => compareDirectories(w.before, w.after, { changed: ['*.lua'] }), /invalid member/);
});
test('container metadata is listed as ignored, with opt-in comparison', t => {
  const w = workspace(t); same(w); put(w.before, '(attributes)', 'old'); put(w.after, '(attributes)', 'new');
  const report = compareDirectories(w.before, w.after);
  assert.equal(report.status, 'MATCH_WITHIN_SCOPE');
  assert.equal(report.before.ignored[0].path, '(attributes)');
  assert.equal(compareDirectories(w.before, w.after, { includeMpqMetadata: true }).status, 'DIFFERENCES');
});
test('HM3W header and arbitrary underscore files are not silently ignored', t => {
  const w = workspace(t); same(w); put(w.before, '_header.json', '{}'); put(w.after, '_header.json', '{"flags":1}');
  put(w.before, '_custom.dat');
  const names = compareDirectories(w.before, w.after).changes.map(c => c.name);
  assert.deepEqual(names, ['_custom.dat', '_header.json']);
});
test('unknown members force incomplete even when their dumped bytes agree', t => {
  const w = workspace(t); same(w);
  put(w.before, '_unknown/File00000001.bin'); put(w.after, '_unknown/File00000001.bin');
  const report = compareDirectories(w.before, w.after);
  assert.equal(report.status, 'INCOMPLETE');
  assert.equal(report.before.unresolved.length, 1);
});
test('empty directories cannot pass a vacuous preservation comparison', t => {
  const w = workspace(t); assert.equal(compareDirectories(w.before, w.after).status, 'INCOMPLETE');
});
test('case collisions are refused instead of overwriting inventory entries', t => {
  const w = workspace(t); put(w.before, 'model.mdx'); put(w.before, 'MODEL.mdx');
  assert.throws(() => inventory(w.before), /collision/);
});
test('symlink files and root directories are refused', t => {
  const w = workspace(t); const target = put(w.after, 'target');
  fs.symlinkSync(target, path.join(w.before, 'link'));
  assert.throws(() => inventory(w.before), /symlink/);
  const link = path.join(w.root, 'root-link'); fs.symlinkSync(w.after, link, 'dir');
  assert.throws(() => inventory(link), /plain directory/);
});
test('file, aggregate, entry and depth budgets are enforced', t => {
  const w = workspace(t); put(w.before, 'a', '1234'); put(w.before, 'b', '1234');
  assert.throws(() => inventory(w.before, { limits: { maxFileBytes: 3 } }), /budget/);
  assert.throws(() => inventory(w.before, { limits: { maxTotalBytes: 6 } }), /budget/);
  assert.throws(() => inventory(w.before, { limits: { maxEntries: 1 } }), /budget/);
  put(w.after, 'a/b/c', 'x');
  assert.throws(() => inventory(w.after, { limits: { maxDepth: 1 } }), /depth/);
  assert.throws(() => inventory(w.after, { limits: { maxEntries: -1 } }), /invalid limit/);
});
test('unsafe paths and Windows drive/ADS forms are refused', () => {
  for (const name of ['../map', '/map', 'a/../b', 'a//b', 'C:\\map', 'file:stream', 'a\0b']) {
    assert.throws(() => memberName(name));
  }
  assert.equal(memberName('Models\\Lamp.MDX'), 'models/lamp.mdx');
});
test('comparison CLI distinguishes match, difference and usage error', t => {
  const w = workspace(t); same(w);
  assert.equal(cli(compareTool, [w.before, w.after]).status, 0);
  put(w.after, 'war3map.lua', '-- changed');
  assert.equal(cli(compareTool, [w.before, w.after]).status, 1);
  assert.equal(cli(compareTool, [w.before, w.after, '--allow-changed', 'war3map.lua']).status, 0);
  assert.equal(cli(compareTool, [w.before, w.after, '--bogus']).status, 2);
  assert.equal(cli(compareTool, [w.before, w.after, '--allow-changed']).status, 2);
});
test('unused exceptions stay visible and input files are not changed', t => {
  const w = workspace(t); same(w);
  const original = fs.readFileSync(path.join(w.before, 'war3map.lua'));
  const report = compareDirectories(w.before, w.after, { changed: ['unused.bin'] });
  assert.deepEqual(report.unusedAllowances, [{ kind: 'changed', name: 'unused.bin' }]);
  assert.deepEqual(fs.readFileSync(path.join(w.before, 'war3map.lua')), original);
  assert.deepEqual(fs.readdirSync(w.before), ['war3map.lua']);
});
test('API parser reads parameter types, order, returns and constness', () => {
  const n = parseNatives(`constant ${DECL}`)[0];
  assert.equal(n.constant, true); assert.equal(n.returns, 'boolean');
  assert.deepEqual(n.parameters, [{ type: 'integer', name: 'subject' }, { type: 'real', name: 'amount' }]);
});
test('comments and quoted fake declarations do not produce natives', () => {
  const source = `// native FakeLine takes nothing returns nothing\n/* native FakeBlock takes nothing returns nothing */\nconstant string note = "native FakeString takes nothing returns nothing"\n${DECL}`;
  assert.deepEqual(parseNatives(source).map(n => n.name), ['FixtureAction']);
});
test('BOM, CRLF, multiline parameters and trailing comments are supported', () => {
  const source = '\uFEFFnative FixtureAction takes\r\n integer subject,\r\n real amount returns boolean // test\r\n';
  assert.deepEqual(parseNatives(source), parseNatives(DECL));
});
test('nothing arguments and sorted output are stable', () => {
  const result = parseNatives(`${DECL}\nnative FixtureAaa takes nothing returns nothing`);
  assert.equal(result[0].name, 'FixtureAaa'); assert.deepEqual(result[0].parameters, []);
});
test('duplicate natives and malformed declarations fail closed', () => {
  for (const text of [`${DECL}\n${DECL}`, 'native Broken takes garbage returns nothing',
    'native Broken takes nothing', 'native Broken takes integer a, integer a returns nothing',
    'native Broken takes nothing a returns nothing', 'function test takes nothing returns nothing\nendfunction']) {
    assert.throws(() => parseNatives(text));
  }
});
test('unterminated comments and strings are rejected', () => {
  assert.throws(() => parseNatives(`${DECL}\n/* unclosed`), /unterminated/);
  assert.throws(() => parseNatives(`${DECL}\n"unclosed`), /unterminated/);
});
test('parameter renaming is not a breaking declaration change', () => {
  const report = compareApis(api(DECL), api(DECL.replace('subject', 'other').replace('amount', 'value')));
  assert.deepEqual(report.changed, []); assert.equal(report.breakingDeclarationChange, false);
});
test('added natives do not imply removals or runtime support', () => {
  const report = compareApis(api(DECL), api(`${DECL}\nnative FixtureNew takes nothing returns nothing`));
  assert.equal(report.added[0].name, 'FixtureNew'); assert.equal(report.breakingDeclarationChange, false);
  assert.equal(report.runtimeValidated, false);
});
test('removed natives and changed types/constness/returns are flagged', () => {
  assert.equal(compareApis(api(`${DECL}\nnative FixtureOld takes nothing returns nothing`), api(DECL)).removed.length, 1);
  for (const text of [DECL.replace('integer subject', 'real subject'), `constant ${DECL}`, DECL.replace('returns boolean', 'returns integer')]) {
    assert.equal(compareApis(api(DECL), api(text)).breakingDeclarationChange, true);
  }
});
test('API snapshots hash supplied bytes and label build claims as unverified', t => {
  const w = workspace(t); const file = put(w.root, 'common.j', DECL);
  const result = readApi(file, 'local-install');
  assert.equal(result.nativeCount, 1); assert.match(result.sourceSha256, /^[0-9a-f]{64}$/);
  assert.equal(result.labelVerified, false); assert.equal(result.runtimeValidated, false);
  assert.equal(result.source, 'common.j');
});
test('API input symlinks, missing files and oversized files are rejected', t => {
  const w = workspace(t); const target = put(w.root, 'common.j', DECL);
  const link = path.join(w.root, 'link.j'); fs.symlinkSync(target, link);
  assert.throws(() => readApi(link), /regular file/);
  assert.throws(() => readApi(path.join(w.root, 'missing.j')));
  const large = put(w.root, 'large.j', ''); fs.truncateSync(large, 16 * 1024 ** 2 + 1);
  assert.throws(() => readApi(large), /16 MiB/);
});
test('API CLI checks required declarations without assuming implementation', t => {
  const w = workspace(t); const file = put(w.root, 'common.j', DECL);
  const good = cli(apiTool, ['snapshot', file, '--require', 'FixtureAction']);
  assert.equal(good.status, 0); assert.equal(JSON.parse(good.stdout).runtimeValidated, false);
  const missing = cli(apiTool, ['snapshot', file, '--require', 'NotDeclared']);
  assert.equal(missing.status, 1); assert.deepEqual(JSON.parse(missing.stdout).missingRequired, ['NotDeclared']);
  assert.equal(cli(apiTool, ['snapshot', file, '--nonsense']).status, 2);
});
test('API CLI diff returns one on breaking change and rejects unsupported options', t => {
  const w = workspace(t); const before = put(w.root, 'old.j', DECL);
  const after = put(w.root, 'new.j', DECL.replace('returns boolean', 'returns integer'));
  assert.equal(cli(apiTool, ['diff', before, after]).status, 1);
  assert.equal(cli(apiTool, ['diff', before, before]).status, 0);
  assert.equal(cli(apiTool, ['diff', before, after, '--require', 'FixtureAction']).status, 2);
});
