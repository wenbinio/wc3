#!/usr/bin/env node
'use strict';
// Build the AI archive: copy the original .w3x and splice ONE member into the
// copy -- scripts\war3map.j, replaced with the injected script.
//
// Why a splice and not a rebuild: the archive is protected. Its listfile is
// stripped, so 265 of its 286 members have no recoverable name from the
// archive alone; rebuilding from an extraction would silently drop every
// anonymous import. Replacing a single member leaves all 285 others exactly as
// the author shipped them, which is also what makes the verification below
// meaningful.
//
// TWO DISCLOSED MODIFICATIONS, both game-neutral:
//   1. dwHeaderSize at offset 4 is 0x504F7856 in the shipped file -- a
//      protector's garbage value that makes StormLib open the archive
//      read-only. It is repaired to 32 (the real MPQ v1 header size). The game
//      does not read this field the way StormLib does; the original loads and
//      so does the repaired copy.
//   2. scripts\war3map.j is replaced with the injected script.
// Nothing else is touched. verify() proves that member-by-member.
//
// Usage: node pack.js <original.w3x> <out.w3x> <member>=<file> [<member>=<file> ...]
//   e.g. node pack.js in.w3x out.w3x 'scripts\\war3map.j=build/war3map.j'

const fs = require('fs');
const path = require('path');

const SL = require('stormlib-node');
const E = require('stormlib-node/dist/enums');

const SCRIPT_MEMBER = 'scripts\\war3map.j';

function repairHeader(file) {
  const fd = fs.openSync(file, 'r+');
  const buf = Buffer.alloc(4);
  fs.readSync(fd, buf, 0, 4, 4);
  const before = buf.readUInt32LE(0);
  let repaired = false;
  if (before !== 32) {
    const out = Buffer.alloc(4);
    out.writeUInt32LE(32, 0);
    fs.writeSync(fd, out, 0, 4, 4);
    repaired = true;
  }
  fs.closeSync(fd);
  return { before, repaired };
}

function readMember(hMpq, name) {
  const hFile = SL.SFileOpenFileEx(hMpq, name, 0);
  try {
    const size = Number(SL.SFileGetFileSize(hFile));
    // SFileReadFile wants an ArrayBuffer; a Node Buffer SIGABRTs the process.
    const ab = new ArrayBuffer(size);
    SL.SFileReadFile(hFile, ab, size);
    return Buffer.from(new Uint8Array(ab));
  } finally {
    SL.SFileCloseFile(hFile);
  }
}

function listNames(hMpq) {
  const names = [];
  let first;
  try {
    first = SL.SFileFindFirstFile(hMpq, '*');
  } catch {
    return names;
  }
  let cur = first;
  while (cur) {
    names.push(cur.cFileName);
    cur = SL.SFileFindNextFile(first.hFind);
  }
  SL.SFileFindClose(first.hFind);
  return names;
}

function main() {
  const [orig, out, ...pairs] = process.argv.slice(2);
  if (!orig || !out || pairs.length === 0) {
    console.error('usage: node pack.js <original.w3x> <out.w3x> <member>=<file> ...');
    return 2;
  }

  const members = pairs.map((p) => {
    const i = p.indexOf('=');
    if (i < 0) throw new Error('bad pair (expected <member>=<file>): ' + p);
    return { name: p.slice(0, i).replace(/\//g, '\\'), file: path.resolve(p.slice(i + 1)) };
  });
  for (const m of members) {
    m.bytes = fs.readFileSync(m.file);
  }

  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.copyFileSync(orig, out);
  const hdr = repairHeader(out);
  console.log(`header    dwHeaderSize 0x${hdr.before.toString(16)} -> 32` +
              (hdr.repaired ? ' (repaired, disclosed)' : ' (already correct)'));

  const hMpq = SL.SFileOpenArchive(out, 0, 0);
  try {
    for (const m of members) {
      // NEVER pass MPQ_FILE.REPLACEEXISTING: a signed-int coercion bug in the
      // binding silently disables compression. Remove, then add.
      SL.SFileRemoveFile(hMpq, m.name, 0);
      SL.SFileAddFileEx(
        hMpq,
        m.file,
        m.name,
        E.MPQ_FILE.COMPRESS,
        E.MPQ_COMPRESSION.ZLIB,
        E.MPQ_COMPRESSION.ZLIB
      );
      console.log(`spliced   ${m.name}  (${m.bytes.length} bytes)`);
    }
  } finally {
    SL.SFileCloseArchive(hMpq);
  }
  return verify(orig, out, members);
}

// Every member of the original must come back byte-identical from the new
// archive, except the one we replaced -- which must come back exactly equal to
// the script we injected.
function verify(orig, out, members) {
  const a = SL.SFileOpenArchive(orig, 0, E.MPQ_OPEN.READ_ONLY || 0x00000100);
  const b = SL.SFileOpenArchive(out, 0, E.MPQ_OPEN.READ_ONLY || 0x00000100);
  let same = 0;
  const changed = [];
  const failedA = [];
  const failedB = [];
  let bad = false;
  try {
    // The listfile is stripped, so replaced members may enumerate under an
    // anonymous FileNNNNNNNN pseudo-name. A changed member is therefore
    // identified by CONTENT -- it held the original member before and holds
    // exactly the file we spliced after -- not by the enumerated name.
    for (const m of members) {
      m.was = readMember(a, m.name);
    }

    for (const n of listNames(a)) {
      if (n === '(listfile)' || n === '(attributes)') continue;
      let x = null;
      let y = null;
      try { x = readMember(a, n); } catch { failedA.push(n); }
      try { y = readMember(b, n); } catch { failedB.push(n); }
      if (x === null || y === null) continue;
      if (x.equals(y)) { same++; continue; }
      const m = members.find((mm) => x.equals(mm.was) && y.equals(mm.bytes));
      changed.push({ n, ok: !!m, as: m ? m.name : '(UNEXPECTED)' });
      if (!m) bad = true;
    }

    console.log(`verify    ${same} member(s) byte-identical`);
    for (const c of changed) {
      console.log(`verify    changed ${c.n} -> ${c.as} ${c.ok ? 'OK' : 'UNEXPECTED'}`);
    }
    for (const m of members) {
      const got = readMember(b, m.name);
      const okRt = got.equals(m.bytes);
      console.log(`verify    ${m.name} round-trips byte-exact: ${okRt ? 'YES' : 'NO'} (${got.length} bytes)`);
      if (!okRt) bad = true;
    }
    const sameFailures = failedA.length === failedB.length;
    console.log(`verify    unreadable in original ${failedA.length}, in build ${failedB.length}` +
      (sameFailures ? ' (same in both — pre-existing, not caused by the splice)' : ' (MISMATCH)'));
    if (!sameFailures) bad = true;
    if (changed.length !== members.length) {
      console.log(`verify    expected ${members.length} changed member(s), saw ${changed.length}`);
      bad = true;
    }
    if (bad) {
      console.error('VERIFY FAILED');
      return 1;
    }
  } finally {
    SL.SFileCloseArchive(a);
    SL.SFileCloseArchive(b);
  }
  return 0;
}

process.exit(main());
