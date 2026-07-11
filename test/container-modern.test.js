'use strict';
// Modern-map container-layer upgrades (lib/mpq, lib/header, lib/viewer,
// tools/w3x-pack, tools/w3x-extract, validate-map container section):
//   1. bare-MPQ .w3x (no HM3W pre-header) — pack --bare + extract round-trip,
//      and validate-map treats a bare container as WARN not FAIL
//   2. fake/partial-listfile hardening — extractAll ALWAYS probes
//      listfile ∪ KNOWN_FILES (real fake-listfile maps hide standard files
//      behind a tiny decoy list). NB: a partial STORED listfile cannot be
//      synthesized — StormLib and smpq both refuse to write '(listfile)'
//      and auto-generate a complete one — so the authoritative fixture is
//      the real eaw.w3x sample (guarded), plus a stripped-listfile synthetic
//      exercised through the recover-names round-trip below.
//   3. --recover-names — harvest path strings from extracted content
//      (script + object data + MDX TEXS + derived variants), hash-probe them
//      against the archive, extract hits under their real names
//   4. content sniffer additions — TGA/TOC/FDF/SLK/MDL
//   5. viewer MPQ header shim — nonstandard headerSize normalized on a copy
//   6. readW3iFlags classic-w3i guard
//
// Scratchpad real samples are read ONLY when present (fs.existsSync); CI
// without them still passes on the synthetic fixtures.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const FIXTURES = path.join(ROOT, 'fixtures');
const mpq = require(path.join(ROOT, 'lib', 'mpq'));
const { createArchive, extractAll, probeExtract, sniffExtension, safeMemberRel, backendName } = mpq;
const { buildHeader, readW3iFlags, hasHM3W } = require(path.join(ROOT, 'lib', 'header'));
const { packDir } = require(path.join(ROOT, 'tools', 'w3x-pack'));
const { recoverNames, harvestMdxTexs, expandVariants } = require(path.join(ROOT, 'lib', 'recover'));
const viewer = require(path.join(ROOT, 'lib', 'viewer'));

const SCRATCH = '/tmp/claude-0/-home-user-wc3/df8a77ea-156b-5f11-9fb8-e8ed8104d142/scratchpad';
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'wc3-container-test-'));
const runTool = (tool, ...args) => spawnSync('node', [path.join(ROOT, 'tools', tool), ...args], { encoding: 'utf8' });

// --------------------------------------------------------------------------
// Standard MPQ crypt, reused to strip the listfile hash entries so a
// synthetic archive enumerates as all-anonymous (the protection scheme).
// (Mirrors test/protected-extract.test.js — kept local to this file.)
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
    u32[i] = decrypt ? plain : (plain ^ ((key + seed) >>> 0)) >>> 0;
    key = ((((~key) << 0x15) + 0x11111111) | (key >>> 0x0B)) >>> 0;
    seed = (plain + seed + (seed << 5) + 3) >>> 0;
  }
}
function stripListfile(archivePath) {
  const buf = fs.readFileSync(archivePath);
  let off = -1;
  for (let o = 0; o + 4 <= buf.length; o += 512) {
    if (buf.readUInt32LE(o) === 0x1A51504D) { off = o; break; }
  }
  assert.ok(off >= 0, 'MPQ header found');
  const hashPos = off + buf.readUInt32LE(off + 0x10);
  const hashCount = buf.readUInt32LE(off + 0x18);
  const words = new Uint32Array(hashCount * 4);
  for (let i = 0; i < words.length; i++) words[i] = buf.readUInt32LE(hashPos + i * 4);
  const key = hashString('(hash table)', 3);
  cryptBlock(words, key, true);
  for (const name of ['(listfile)', '(attributes)', '(signature)']) {
    const a = hashString(name, 1), b = hashString(name, 2);
    for (let e = 0; e < hashCount; e++) {
      if (words[e * 4] === a && words[e * 4 + 1] === b) { words[e * 4] = 0xDEADBEEF; words[e * 4 + 1] = 0xDEADBEEF; }
    }
  }
  cryptBlock(words, key, false);
  for (let i = 0; i < words.length; i++) buf.writeUInt32LE(words[i], hashPos + i * 4);
  fs.writeFileSync(archivePath, buf);
}

// --------------------------------------------------------------------------
// 1. Bare-MPQ container

test(`[${backendName()}] w3x-pack --bare emits a bare MPQ (no HM3W) that extracts round-trip`, () => {
  const src = path.join(WORK, 'bare-src');
  fs.mkdirSync(src, { recursive: true });
  const members = ['war3map.w3i', 'war3map.w3e', 'war3map.wts'];
  for (const m of members) fs.copyFileSync(path.join(FIXTURES, m), path.join(src, m));

  const out = path.join(WORK, 'bare.w3x');
  const res = packDir(src, out, { bare: true });
  assert.strictEqual(res.bare, true);
  assert.strictEqual(res.headerFields, null, 'no header fields for a bare pack');

  const buf = fs.readFileSync(out);
  assert.strictEqual(buf.toString('latin1', 0, 4), 'MPQ\x1a', 'MPQ magic at offset 0, no pre-header');
  assert.ok(!hasHM3W(buf), 'no HM3W pre-header');

  const ex = extractAll(out, path.join(WORK, 'bare-ex'));
  assert.deepStrictEqual(ex.extracted.sort(), [...members].sort(), 'every member read back from the bare MPQ');
  for (const m of members) {
    assert.ok(fs.readFileSync(path.join(WORK, 'bare-ex', m)).equals(fs.readFileSync(path.join(FIXTURES, m))), `${m} bit-identical`);
  }
});

test('w3x-pack --bare CLI flag round-trips and prints the bare-container note', () => {
  const src = path.join(WORK, 'bare-cli-src');
  fs.mkdirSync(src, { recursive: true });
  for (const m of ['war3map.w3i', 'war3map.w3e']) fs.copyFileSync(path.join(FIXTURES, m), path.join(src, m));
  const out = path.join(WORK, 'bare-cli.w3x');
  const r = runTool('w3x-pack.js', '--bare', src, out);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /bare MPQ container/);
  assert.strictEqual(fs.readFileSync(out).toString('latin1', 0, 4), 'MPQ\x1a');
});

test('validate-map: bare MPQ container is a WARN, not a FAIL, and other checks still run', () => {
  const src = path.join(WORK, 'bare-val-src');
  fs.mkdirSync(src, { recursive: true });
  for (const m of ['war3map.w3i', 'war3map.w3e', 'war3map.wts']) fs.copyFileSync(path.join(FIXTURES, m), path.join(src, m));
  fs.writeFileSync(path.join(src, 'war3map.lua'), 'function config() end\nfunction main() end\n');
  const out = path.join(WORK, 'bare-val.w3x');
  packDir(src, out, { bare: true });

  const r = runTool('validate-map.js', out);
  assert.match(r.stdout, /WARN\s+HM3W pre-header.*bare-MPQ container/, 'bare container warns');
  assert.doesNotMatch(r.stdout, /FAIL\s+HM3W pre-header/, 'never fails on the container alone');
  assert.match(r.stdout, /extract archive/, 'extraction still runs after the warning');
});

// --------------------------------------------------------------------------
// 2. Fake/partial-listfile hardening — union probing

test(`[${backendName()}] extractAll always probes listfile ∪ KNOWN_FILES (regression: full listfile still complete)`, () => {
  // A normal archive mixing a KNOWN_FILES member with a non-KNOWN custom one:
  // union probing must never LOSE the custom member the listfile names.
  const src = path.join(WORK, 'union-src');
  fs.mkdirSync(src, { recursive: true });
  fs.copyFileSync(path.join(FIXTURES, 'war3map.w3i'), path.join(src, 'war3map.w3i'));
  fs.writeFileSync(path.join(src, 'custom-only.dat'), 'not a known file name');
  const out = path.join(WORK, 'union.w3x');
  createArchive(out, src, ['war3map.w3i', 'custom-only.dat'], buildHeader({ name: 'u', maxPlayers: 1 }));

  const ex = extractAll(out, path.join(WORK, 'union-ex'));
  assert.ok(ex.extracted.includes('war3map.w3i'), 'KNOWN_FILES member extracted');
  assert.ok(ex.extracted.includes('custom-only.dat'), 'listfile-only custom member NOT lost by union');
});

test('fake-listfile: real eaw.w3x named extraction jumps from a decoy count to >= 29 standard files', { skip: !fs.existsSync(path.join(SCRATCH, 'modern-maps2', 'eaw.w3x')) && 'scratchpad sample absent' }, () => {
  const ex = extractAll(path.join(SCRATCH, 'modern-maps2', 'eaw.w3x'), path.join(WORK, 'eaw-ex'));
  assert.ok(ex.extracted.length >= 29, `named extraction recovers >= 29 standard files (got ${ex.extracted.length})`);
  for (const req of ['war3map.w3i', 'war3map.w3e', 'war3map.doo', 'war3map.w3u']) {
    assert.ok(ex.extracted.includes(req), `${req} recovered despite the fake 3-entry listfile`);
  }
});

// --------------------------------------------------------------------------
// 3. --recover-names round-trip (synthetic)
//
// Archive: war3map.j (KNOWN_FILES) references a hidden model by path; the
// hidden model's MDX TEXS names a hidden texture. Strip the listfile so the
// two custom members are anonymous, then --recover-names must re-derive
// both real names purely from the extracted content.

function makeMdxWithTexs(texturePath) {
  const name = Buffer.alloc(260);
  Buffer.from(texturePath, 'latin1').copy(name);
  const entry = Buffer.concat([
    Buffer.from([0, 0, 0, 0]),        // replaceableId
    name,                              // char[260]
    Buffer.from([0, 0, 0, 0]),        // flags
  ]);
  const chunk = Buffer.concat([
    Buffer.from('TEXS', 'latin1'),
    (() => { const b = Buffer.alloc(4); b.writeUInt32LE(entry.length, 0); return b; })(),
    entry,
  ]);
  return Buffer.concat([Buffer.from('MDLX', 'latin1'), chunk]);
}

test(`[${backendName()}] --recover-names re-derives hidden model + its TEXS texture from a stripped-listfile archive`, () => {
  const HIDDEN_MDX = 'war3mapImported\\hidden_tank.mdx';
  const HIDDEN_BLP = 'war3mapImported\\tank_skin.blp';
  const mdxBytes = makeMdxWithTexs(HIDDEN_BLP);
  const blpBytes = Buffer.concat([Buffer.from('BLP1', 'latin1'), Buffer.alloc(200, 9)]);

  const src = path.join(WORK, 'rec-src');
  fs.mkdirSync(path.join(src, 'war3mapImported'), { recursive: true });
  fs.copyFileSync(path.join(FIXTURES, 'war3map.w3i'), path.join(src, 'war3map.w3i'));
  // JASS script references the hidden model by its archive path
  fs.writeFileSync(path.join(src, 'war3map.j'),
    'function main takes nothing returns nothing\n' +
    `call AddSpecialEffect("war3mapImported\\\\hidden_tank.mdx", 0., 0.)\n` +
    'endfunction\n');
  fs.writeFileSync(path.join(src, 'war3mapImported', 'hidden_tank.mdx'), mdxBytes);
  fs.writeFileSync(path.join(src, 'war3mapImported', 'tank_skin.blp'), blpBytes);

  const out = path.join(WORK, 'recover.w3x');
  createArchive(out, src, ['war3map.w3i', 'war3map.j', 'war3mapImported/hidden_tank.mdx', 'war3mapImported/tank_skin.blp'],
    buildHeader({ name: 'rec', maxPlayers: 1 }));
  stripListfile(out); // now every member enumerates anonymously

  const dir = path.join(WORK, 'recover-ex');
  const ex = extractAll(out, dir, { dumpUnknown: true });
  assert.ok(ex.extracted.includes('war3map.j'), 'script recovered by KNOWN_FILES probe');
  assert.ok(!ex.extracted.includes('war3mapImported/hidden_tank.mdx'), 'custom model starts anonymous');

  const stats = recoverNames(out, dir);
  const recovered = stats.recovered.slice().sort();
  assert.ok(recovered.includes('war3mapImported/hidden_tank.mdx'), `model name recovered from the script (got ${recovered})`);
  assert.ok(recovered.includes('war3mapImported/tank_skin.blp'), 'texture name recovered from the model TEXS chunk');
  assert.ok(fs.readFileSync(path.join(dir, 'war3mapImported/hidden_tank.mdx')).equals(mdxBytes), 'model bytes exact');
  assert.ok(fs.readFileSync(path.join(dir, 'war3mapImported/tank_skin.blp')).equals(blpBytes), 'texture bytes exact');
  assert.ok(stats.pruned >= 2, 'the anonymous _unknown/ twins of the recoveries are pruned');
});

test('w3x-extract --recover-names CLI implies --dump-unknown and reports recovery stats', () => {
  // reuse the archive built by the round-trip test would require ordering;
  // build a fresh minimal one here
  const mdxBytes = makeMdxWithTexs('war3mapImported\\fx.blp');
  const src = path.join(WORK, 'rec-cli-src');
  fs.mkdirSync(path.join(src, 'war3mapImported'), { recursive: true });
  fs.copyFileSync(path.join(FIXTURES, 'war3map.w3i'), path.join(src, 'war3map.w3i'));
  fs.writeFileSync(path.join(src, 'war3map.j'), 'call Preload("war3mapImported\\\\model_a.mdx")\n');
  fs.writeFileSync(path.join(src, 'war3mapImported', 'model_a.mdx'), mdxBytes);
  fs.writeFileSync(path.join(src, 'war3mapImported', 'fx.blp'), Buffer.concat([Buffer.from('BLP1'), Buffer.alloc(50, 1)]));
  const out = path.join(WORK, 'rec-cli.w3x');
  createArchive(out, src, ['war3map.w3i', 'war3map.j', 'war3mapImported/model_a.mdx', 'war3mapImported/fx.blp'], buildHeader({ name: 'c', maxPlayers: 1 }));
  stripListfile(out);

  const r = runTool('w3x-extract.js', '--recover-names', out, path.join(WORK, 'rec-cli-ex'));
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /name recovery: \d+ name\(s\) recovered/);
  assert.match(r.stdout, /war3mapImported\/model_a\.mdx/, 'recovered model listed');
  assert.match(r.stdout, /war3mapImported\/fx\.blp/, 'recovered texture listed');
});

// --------------------------------------------------------------------------
// 4. Content sniffer additions

test('sniffExtension classifies TGA/TOC/FDF/SLK/MDL (previously .bin/.txt)', () => {
  const B = (s) => Buffer.from(s, 'latin1');
  // TGA v1 header (uncompressed truecolor, 2x2, 24bpp)
  const tga = Buffer.alloc(18 + 2 * 2 * 3); tga[2] = 2; tga.writeUInt16LE(2, 12); tga.writeUInt16LE(2, 14); tga[16] = 24;
  assert.strictEqual(sniffExtension(tga), 'tga', 'TGA v1 header heuristic');
  const tgaFooter = Buffer.concat([Buffer.alloc(40, 1), B('TRUEVISION-XFILE.'), Buffer.from([0])]);
  assert.strictEqual(sniffExtension(tgaFooter), 'tga', 'TGA v2 footer');
  assert.strictEqual(sniffExtension(B('ID;PWXL;N;E\r\nB;X2;Y2\r\nE\r\n')), 'slk', 'SLK magic');
  assert.strictEqual(sniffExtension(B('// Saved by MdlxConv\nVersion {\n\tFormatVersion 800,\n}\n')), 'mdl', 'MDL "// Saved by"');
  assert.strictEqual(sniffExtension(B('Version {\n\tFormatVersion 800,\n}\nModel "x" {\n}\n')), 'mdl', 'MDL version block');
  assert.strictEqual(sniffExtension(B('Frame "BACKDROP" "MyBd" {\n}\n')), 'fdf', 'FDF Frame keyword');
  assert.strictEqual(sniffExtension(B('IncludeFile "UI\\a.fdf",\n')), 'fdf', 'FDF IncludeFile');
  assert.strictEqual(sniffExtension(B('UI\\FrameDef\\a.fdf\nUI\\FrameDef\\b.fdf\n')), 'toc', 'TOC frame-def path list');
  assert.strictEqual(sniffExtension(B('plain readme text\nsecond line\n')), 'txt', 'generic text stays txt');
  assert.strictEqual(sniffExtension(B('MDLX\x00\x00\x00\x00')), 'mdx', 'binary magic still wins over text');
});

test('safeMemberRel rejects path traversal / absolute paths', () => {
  assert.strictEqual(safeMemberRel('war3mapImported\\a.blp'), 'war3mapImported/a.blp');
  assert.strictEqual(safeMemberRel('..\\..\\etc\\passwd'), null, 'traversal rejected');
  assert.strictEqual(safeMemberRel('/etc/passwd'), null, 'absolute rejected');
  assert.strictEqual(safeMemberRel('C:\\windows\\x'), null, 'drive-absolute rejected');
  assert.strictEqual(safeMemberRel('a\\..\\b'), null, 'embedded .. rejected');
});

test('MDX TEXS harvest + variant expansion', () => {
  const sink = new Set();
  harvestMdxTexs(makeMdxWithTexs('Textures\\custom_skin.blp'), sink);
  assert.ok([...sink].some((s) => /custom_skin\.blp$/i.test(s)), 'TEXS path harvested');

  const v = expandVariants('war3mapImported\\BTNhero.blp');
  assert.ok(v.has('war3mapImported\\DISBTNhero.blp'), 'BTN -> DISBTN pair');
  assert.ok([...v].some((s) => /CommandButtonsDisabled\\DISBTNhero\.blp$/i.test(s)), 'ReplaceableTextures disabled prefix');
  assert.ok(expandVariants('a\\b.mdx').has('a\\b.mdl'), 'mdx <-> mdl swap');
});

// --------------------------------------------------------------------------
// 5. Viewer MPQ header shim

test('viewer opens an archive with a protector-mangled headerSize (normalized on a copy)', () => {
  const src = path.join(WORK, 'shim-src');
  fs.mkdirSync(src, { recursive: true });
  for (const m of ['war3map.w3i', 'war3map.w3e', 'war3map.wts']) fs.copyFileSync(path.join(FIXTURES, m), path.join(src, m));
  const out = path.join(WORK, 'shim.w3x');
  createArchive(out, src, ['war3map.w3i', 'war3map.w3e', 'war3map.wts'], buildHeader({ name: 's', maxPlayers: 2 }));

  const buf = fs.readFileSync(out);
  // find the MPQ header (offset 512, past HM3W) and clobber headerSize like a
  // protector: v1 headerSize is always 0x20; write a bogus value.
  let off = -1;
  for (let o = 0; o + 4 <= buf.length; o += 512) if (buf.readUInt32LE(o) === 0x1A51504D) { off = o; break; }
  assert.ok(off > 0);
  assert.strictEqual(buf.readUInt16LE(off + 12), 0, 'format version 0 (v1)');
  buf.writeUInt32LE(0x200102, off + 4); // the exact gwz.w3x mangling
  fs.writeFileSync(out, buf);

  const map = viewer.openMapReadonly(buf);
  const named = map.getFileNames().filter((n) => !n.startsWith('(') && !/^File\d{8}/.test(n));
  assert.ok(named.includes('war3map.w3i'), `viewer enumerates members after header normalization (got ${named})`);

  // the normalization must not mutate the caller's buffer
  assert.strictEqual(buf.readUInt32LE(off + 4), 0x200102, 'input buffer left untouched (fix applied to a copy)');
});

test('real gwz.w3x: viewer degrades gracefully (opens, no named members) rather than crashing', { skip: !fs.existsSync(path.join(SCRATCH, 'modern-maps', 'gwz.w3x')) && 'scratchpad sample absent' }, () => {
  const map = viewer.openMapReadonly(fs.readFileSync(path.join(SCRATCH, 'modern-maps', 'gwz.w3x')));
  assert.ok(map.getFileNames().length > 0, 'viewer enumerates the mangled-header archive');
});

// --------------------------------------------------------------------------
// 6. readW3iFlags classic-w3i guard

test('readW3iFlags reads classic w3i (v15+) and rejects garbage without hanging', () => {
  // synthetic classic v18 w3i: version, saves, editorVersion, 4 strings,
  // 8 camera floats, 4 complements, w/h, flags
  const parts = [];
  const i32 = (v) => { const b = Buffer.alloc(4); b.writeInt32LE(v, 0); return b; };
  parts.push(i32(18), i32(1), i32(6059));
  for (let i = 0; i < 4; i++) parts.push(Buffer.from('n\0', 'latin1'));
  for (let i = 0; i < 8; i++) parts.push(Buffer.alloc(4));  // camera floats
  for (let i = 0; i < 4; i++) parts.push(i32(0));           // complements
  parts.push(i32(64), i32(64));                             // playable w/h
  parts.push(i32(0x1234));                                  // flags
  const w3i = Buffer.concat(parts);
  assert.strictEqual(readW3iFlags(w3i), 0x1234, 'classic v18 flags read at the right offset');

  assert.strictEqual(readW3iFlags(Buffer.from('MDLX not a w3i at all')), null, 'non-w3i version rejected');
  // truncated buffer with an unterminated string must return null, not loop
  assert.strictEqual(readW3iFlags(Buffer.concat([i32(25), i32(0), i32(0), Buffer.from('unterminated')])), null, 'unterminated string -> null');
});

test('real classic xhs.w3x: readW3iFlags matches the HM3W pre-header flags (56674)', { skip: !fs.existsSync(path.join(SCRATCH, 'modern-maps', 'xhs-extracted', 'war3map.w3i')) && 'scratchpad sample absent' }, () => {
  const w3i = fs.readFileSync(path.join(SCRATCH, 'modern-maps', 'xhs-extracted', 'war3map.w3i'));
  const hdr = fs.readFileSync(path.join(SCRATCH, 'modern-maps', 'xhs.w3x')).subarray(0, 512);
  const { parseHeader } = require(path.join(ROOT, 'lib', 'header'));
  assert.strictEqual(readW3iFlags(w3i), parseHeader(hdr).flags, 'classic v25 w3i flags match the pre-header');
});

// --------------------------------------------------------------------------
// probeExtract sanity (used by recover-names)

test(`[${backendName()}] probeExtract skips junk names, extracts real hits, verifies on disk`, () => {
  const src = path.join(WORK, 'probe-src');
  fs.mkdirSync(src, { recursive: true });
  fs.copyFileSync(path.join(FIXTURES, 'war3map.w3i'), path.join(src, 'war3map.w3i'));
  const out = path.join(WORK, 'probe.w3x');
  createArchive(out, src, ['war3map.w3i'], buildHeader({ name: 'p', maxPlayers: 1 }));
  stripListfile(out);

  const dir = path.join(WORK, 'probe-ex');
  const r = probeExtract(out, dir, ['war3map.w3i', 'does\\not\\exist.blp', '..\\escape', 'war3map.w3i']);
  assert.deepStrictEqual(r.recovered, ['war3map.w3i'], 'only the real, safe name recovered');
  assert.ok(r.probed <= 2, 'duplicate and traversal candidates deduped/dropped before probing');
});

test.after(() => { fs.rmSync(WORK, { recursive: true, force: true }); });
