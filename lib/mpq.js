'use strict';
// MPQ archive I/O with two interchangeable backends:
//
//   1. stormlib-node (native StormLib bindings) — PRIMARY, used whenever the
//      optional native module is loadable. No external binary needed and the
//      HM3W pre-header is written in one pass (no concat step): the header is
//      pre-written to the output file and SFileCreateArchive converts it,
//      appending the MPQ at the next 512-byte boundary (= offset 512).
//   2. smpq CLI (apt-get install -y smpq) — FALLBACK when the native module
//      is unavailable (it's an optionalDependency; node-gyp may fail).
//
// Backend selection: WC3_MPQ_BACKEND=smpq forces the CLI fallback (useful for
// testing both paths: `npm run test:smpq`), WC3_MPQ_BACKEND=stormlib requires
// the native module (throws if unloadable). Default: auto (stormlib if
// loadable, else smpq).
//
// stormlib-node gotchas (each of these cost real debugging time):
// - SFileReadFile requires an **ArrayBuffer**. Passing a Node Buffer SIGABRTs
//   the whole process (native crash, not an exception).
// - SFileGetFileSize returns a **BigInt** — wrap in Number().
// - NEVER pass MPQ_FILE.REPLACEEXISTING (0x80000000) to SFileAddFileEx: a
//   signed-int coercion bug in the binding silently disables compression and
//   files get stored raw. We always create archives fresh, so it's never
//   needed anyway.
// - SFileRemoveFile on '(listfile)'/'(attributes)' fails with ERR:10003 —
//   don't try to strip them.
// - Warcraft III only reads MPQ **v1** (MPQ_CREATE.ARCHIVE_V1 / `smpq -M 1`).
//
// Shared notes:
// - Both backends READ .w3x files directly (StormLib scans for the MPQ magic
//   at 512-byte offsets past the HM3W pre-header).
// - Archive paths: MPQ uses '\' separators, but StormLib's name hashing
//   treats '/' and '\' as identical, so adding/extracting with '/' works.
// - Protected maps strip the '(listfile)' — enumeration then yields nothing
//   (smpq) or unresolved 'FileXXXXXXXX.xxx' pseudo-names (stormlib), and
//   extraction falls back to probing KNOWN_FILES one by one (hash lookup by
//   exact name works without a listfile). Extraction success is ALWAYS
//   verified on disk: smpq exits 0 even when a file is missing, so trust
//   neither backend's return status.

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Common Warcraft III archive member names, used as a fallback listfile for
// archives without a (listfile) (e.g. protected maps).
const KNOWN_FILES = [
  'war3map.j', 'scripts\\war3map.j', 'war3map.lua', 'scripts\\war3map.lua',
  'war3map.w3e', 'war3map.w3i', 'war3map.wts', 'war3map.doo', 'war3mapUnits.doo',
  'war3map.shd', 'war3map.wpm', 'war3map.mmp', 'war3map.w3r', 'war3map.w3c',
  'war3map.w3s', 'war3map.imp', 'war3map.wct', 'war3map.wtg', 'war3map.w3v',
  'war3map.w3u', 'war3map.w3t', 'war3map.w3b', 'war3map.w3d', 'war3map.w3a',
  'war3map.w3h', 'war3map.w3q', 'war3map.w3f',
  'war3mapSkin.w3u', 'war3mapSkin.w3t', 'war3mapSkin.w3b', 'war3mapSkin.w3d',
  'war3mapSkin.w3a', 'war3mapSkin.w3h', 'war3mapSkin.w3q', 'war3mapSkin.txt',
  'war3mapMap.blp', 'war3mapMap.tga', 'war3mapPreview.tga', 'war3mapPreview.blp',
  'war3mapPath.tga', 'war3mapMisc.txt', 'war3mapExtra.txt', 'conversation.json',
];

const INTERNAL_FILES = new Set(['(listfile)', '(attributes)', '(signature)']);
// stormlib-node reports members with unresolved names (no listfile entry) as
// 'File00000012.xxx' pseudo-names — they carry no usable archive path.
const PSEUDO_NAME = /^File\d{8}\./;

// ---------------------------------------------------------------------------
// Backend selection

let stormlibCache; // undefined = not probed, false = unavailable, object = loaded

function loadStormlib() {
  const forced = process.env.WC3_MPQ_BACKEND || '';
  if (forced === 'smpq') return null;
  if (stormlibCache === undefined) {
    try {
      stormlibCache = {
        SL: require('stormlib-node'),
        E: require('stormlib-node/dist/enums'),
      };
    } catch {
      stormlibCache = false;
    }
  }
  if (!stormlibCache && forced === 'stormlib') {
    throw new Error('WC3_MPQ_BACKEND=stormlib but the stormlib-node native module is not loadable. Run: bash scripts/setup.sh (or unset WC3_MPQ_BACKEND to fall back to smpq)');
  }
  return stormlibCache || null;
}

// Which backend the next call will use: 'stormlib' | 'smpq'.
function backendName() {
  return loadStormlib() ? 'stormlib' : 'smpq';
}

function assertSmpq() {
  try {
    execFileSync('smpq', ['--version'], { stdio: 'ignore' });
  } catch {
    throw new Error('no MPQ backend available: stormlib-node is not loadable and smpq is not installed. Run: bash scripts/setup.sh');
  }
}

// ---------------------------------------------------------------------------
// stormlib-node backend internals

function slListNames(SL, hMpq) {
  const names = [];
  let first;
  try {
    first = SL.SFileFindFirstFile(hMpq, '*');
  } catch {
    return names; // empty archive / nothing enumerable
  }
  let cur = first;
  while (cur) {
    names.push(cur.cFileName);
    cur = SL.SFileFindNextFile(first.hFind);
  }
  SL.SFileFindClose(first.hFind);
  return names;
}

// Read one member as a Buffer, or null when absent. NB: SFileGetFileSize
// returns BigInt; SFileReadFile needs an ArrayBuffer (Buffer => SIGABRT).
function slReadMember(SL, E, hMpq, name) {
  if (!SL.SFileHasFile(hMpq, name)) return null;
  let hFile;
  try {
    hFile = SL.SFileOpenFileEx(hMpq, name, E.SFILE_OPEN.FROM_MPQ);
  } catch {
    return null;
  }
  try {
    const size = Number(SL.SFileGetFileSize(hFile));
    const ab = new ArrayBuffer(size);
    if (size > 0) SL.SFileReadFile(hFile, ab);
    return Buffer.from(ab);
  } finally {
    SL.SFileCloseFile(hFile);
  }
}

// ---------------------------------------------------------------------------
// Public API

// List archive contents. Returns [] when there is no listfile (protected
// maps): stormlib pseudo-names are filtered out, smpq has nothing to print.
function listFiles(archivePath) {
  const abs = path.resolve(archivePath);
  const sl = loadStormlib();
  if (sl) {
    const { SL, E } = sl;
    const hMpq = SL.SFileOpenArchive(abs, E.STREAM_FLAG.READ_ONLY);
    try {
      return slListNames(SL, hMpq).filter((n) => !PSEUDO_NAME.test(n));
    } finally {
      SL.SFileCloseArchive(hMpq);
    }
  }
  assertSmpq();
  let out;
  try {
    out = execFileSync('smpq', ['-l', abs], { encoding: 'utf8' });
  } catch (e) {
    throw new Error(`smpq -l failed on ${archivePath}: ${e.message}`);
  }
  // Output lines: "<size> <date> <time> <name>"
  return out.split('\n')
    .map((l) => l.replace(/^\s*\d+\s+\S+\s+\S+\s/, '').trim())
    .filter((n) => n.length > 0);
}

// Extract all files into outDir. Returns array of extracted relative paths
// (with forward slashes). Falls back to KNOWN_FILES probing if no listfile.
// Every extraction is verified on disk regardless of backend.
function extractAll(archivePath, outDir) {
  const abs = path.resolve(archivePath);
  fs.mkdirSync(outDir, { recursive: true });

  const sl = loadStormlib();
  if (sl) {
    const { SL, E } = sl;
    const hMpq = SL.SFileOpenArchive(abs, E.STREAM_FLAG.READ_ONLY);
    const extracted = [];
    try {
      let names = slListNames(SL, hMpq)
        .filter((n) => !INTERNAL_FILES.has(n) && !PSEUDO_NAME.test(n));
      if (names.length === 0) names = KNOWN_FILES; // no listfile: probe
      for (const name of names) {
        const rel = name.replace(/\\/g, '/');
        const buf = slReadMember(SL, E, hMpq, name);
        if (buf === null) continue;
        const dest = path.join(outDir, rel);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, buf);
        if (fs.existsSync(dest)) extracted.push(rel); // verify on disk
      }
    } finally {
      SL.SFileCloseArchive(hMpq);
    }
    return extracted;
  }

  assertSmpq();
  let names = [];
  try { names = listFiles(abs); } catch { /* fall through to probing */ }
  names = names.filter((n) => !INTERNAL_FILES.has(n));

  const extracted = [];
  const tryExtract = (name) => {
    const rel = name.replace(/\\/g, '/');
    try {
      // NB: smpq exits 0 even when `name` is not in the archive (it only
      // prints an error) — verify the file actually appeared on disk.
      execFileSync('smpq', ['-x', '-f', abs, name], { cwd: outDir, stdio: 'pipe' });
      if (!fs.existsSync(path.join(outDir, rel))) return false;
      extracted.push(rel);
      return true;
    } catch { return false; }
  };

  if (names.length > 0) {
    for (const n of names) tryExtract(n);
  } else {
    // No listfile (protected map?) — probe known names.
    for (const n of KNOWN_FILES) tryExtract(n);
  }
  return extracted;
}

// Create an MPQ (v1) at mpqPath from `files`, an array of relative paths
// resolved against cwdDir. Relative paths become the archive member names.
// When `headerBuf` (a 512-byte-multiple pre-header, e.g. the HM3W block from
// lib/header.js buildHeader) is given, it is written first and the MPQ
// follows it — producing a ready .w3x in one step, no concat needed:
//   - stormlib: the header is pre-written and SFileCreateArchive converts
//     the existing file, appending the archive at the next 512-byte boundary.
//   - smpq: a bare MPQ is created in a temp file and prepended with the
//     header (smpq can only create bare MPQs).
function createArchive(mpqPath, cwdDir, files, headerBuf) {
  if (files.length === 0) throw new Error('refusing to create an empty MPQ');
  if (headerBuf && headerBuf.length % 512 !== 0) {
    throw new Error(`pre-header must be a multiple of 512 bytes (got ${headerBuf.length}) — StormLib aligns the MPQ to 512-byte offsets`);
  }
  const abs = path.resolve(mpqPath);
  fs.rmSync(abs, { force: true });
  fs.mkdirSync(path.dirname(abs), { recursive: true });

  const sl = loadStormlib();
  if (sl) {
    const { SL, E } = sl;
    if (headerBuf) fs.writeFileSync(abs, headerBuf);
    const hMpq = SL.SFileCreateArchive(
      abs,
      E.MPQ_CREATE.ARCHIVE_V1 | E.MPQ_CREATE.LISTFILE, // WC3 reads MPQ v1 only
      Math.max(files.length + 4, E.HASH_TABLE_SIZE.MIN)
    );
    try {
      for (const rel of files) {
        // NEVER add MPQ_FILE.REPLACEEXISTING here — a signed-int coercion
        // bug silently disables compression (files get stored raw).
        SL.SFileAddFileEx(
          hMpq,
          path.join(cwdDir, rel),
          rel.replace(/\//g, '\\'),
          E.MPQ_FILE.COMPRESS,
          E.MPQ_COMPRESSION.ZLIB,
          E.MPQ_COMPRESSION.ZLIB
        );
      }
    } finally {
      SL.SFileCloseArchive(hMpq); // flushes tables
    }
    return abs;
  }

  assertSmpq();
  const bare = headerBuf ? abs + '.mpq.tmp' : abs;
  fs.rmSync(bare, { force: true });
  // smpq -c: create archive (adds a (listfile) automatically). MPQ v1 for WC3.
  execFileSync('smpq', ['-c', '-M', '1', '-C', 'ZLIB', bare, ...files], {
    cwd: cwdDir, stdio: 'pipe',
  });
  if (headerBuf) {
    fs.writeFileSync(abs, Buffer.concat([headerBuf, fs.readFileSync(bare)]));
    fs.rmSync(bare, { force: true });
  }
  return abs;
}

module.exports = { KNOWN_FILES, listFiles, extractAll, createArchive, assertSmpq, backendName };
