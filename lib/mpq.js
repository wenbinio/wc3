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
// - Protected maps strip the '(listfile)' — enumeration then yields only
//   unresolved 'FileNNNNNNNN.xxx' pseudo-names (both backends are StormLib-
//   based), and NAMED extraction falls back to probing KNOWN_FILES one by
//   one (hash lookup by exact name works without a listfile). extractAll
//   always reports total-entries vs named-extracted vs unresolved counts so
//   anonymous members are never silently invisible, and can optionally dump
//   the unresolved members under _unknown/ with content-sniffed extensions
//   (opts.dumpUnknown / WC3_EXTRACT_UNKNOWN=1). Extraction success is ALWAYS
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
// Both backends report members with unresolved names (no listfile entry) as
// 'File00000012.xxx' pseudo-names — they carry no usable archive path, but
// StormLib can still OPEN them by that pseudo-name (it encodes the block
// index), which is what the _unknown/ dump uses.
const PSEUDO_NAME = /^File\d{8}\./;

// Best-effort content sniffing for anonymous (pseudo-named) members dumped
// under _unknown/. Returns an extension without the dot, or null.
function sniffExtension(buf) {
  if (buf.length >= 4) {
    const m4 = buf.toString('latin1', 0, 4);
    if (m4 === 'MDLX') return 'mdx';
    if (m4 === 'BLP1' || m4 === 'BLP2') return 'blp';
    if (m4 === 'W3E!') return 'w3e';
    if (m4 === 'W3do') return 'doo';
    if (m4 === 'HM3W') return 'w3x';
    if (m4 === 'MPQ\x1a') return 'mpq';
    if (m4 === 'RIFF') return 'wav';
    if (m4 === 'OggS') return 'ogg';
    if (m4 === '\x89PNG') return 'png';
    if (m4 === 'DDS ') return 'dds';
    if (m4 === 'Mts\x00') return 'mp3'; // rare LAME header wrapper
  }
  if (buf.length >= 3) {
    if (buf.toString('latin1', 0, 3) === 'ID3') return 'mp3';
    if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'jpg';
  }
  // text heuristic (tab/CR/LF + printable ASCII, optional UTF-8 BOM)
  const start = (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) ? 3 : 0;
  const n = Math.min(buf.length, 512);
  if (n > start) {
    let text = true;
    for (let i = start; i < n; i++) {
      const b = buf[i];
      if (b !== 9 && b !== 10 && b !== 13 && (b < 32 || b > 126)) { text = false; break; }
    }
    if (text) return 'txt';
  }
  return null;
}

// _unknown/ dump filename for a pseudo-named member: keep the FileNNNNNNNN
// stem, prefer our content sniff for the extension, else StormLib's own
// guess (unless it's the generic '.xxx'), else '.bin'.
function unknownDumpName(pseudoName, buf) {
  const dot = pseudoName.lastIndexOf('.');
  const stem = dot > 0 ? pseudoName.slice(0, dot) : pseudoName;
  const slExt = dot > 0 ? pseudoName.slice(dot + 1) : '';
  const ext = sniffExtension(buf) || (slExt && slExt !== 'xxx' ? slExt : 'bin');
  return `${stem}.${ext}`;
}

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

// Raw smpq enumeration: every entry smpq -l prints, including internal files
// and FileNNNNNNNN pseudo-names (smpq is StormLib-based and reports
// unresolved members the same way stormlib-node does).
function smpqListRaw(abs) {
  assertSmpq();
  let out;
  try {
    out = execFileSync('smpq', ['-l', abs], { encoding: 'utf8' });
  } catch (e) {
    throw new Error(`smpq -l failed on ${abs}: ${e.message}`);
  }
  // Output lines: "<size> <date> <time> <name>"
  return out.split('\n')
    .map((l) => l.replace(/^\s*\d+\s+\S+\s+\S+\s/, '').trim())
    .filter((n) => n.length > 0);
}

// List archive contents (NAMED members only). Pseudo-names of unresolved
// members are filtered out on both backends; extractAll's result counts are
// the way to see how many anonymous members exist.
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
  return smpqListRaw(abs).filter((n) => !PSEUDO_NAME.test(n));
}

// Extract all files into outDir. Falls back to KNOWN_FILES probing when the
// archive has no resolvable names (stripped listfile). Every extraction is
// verified on disk regardless of backend. Returns
//   {
//     extracted:  [relpaths]      named members written to outDir,
//     total:      number|null     archive entries excluding known internal
//                                 files (null if enumeration yielded nothing;
//                                 anonymous internal files, e.g. a stripped
//                                 '(attributes)', are indistinguishable and
//                                 count as entries),
//     unresolved: number|null     entries with no recoverable name
//                                 (max(0, total - extracted.length)),
//     unknown:    [relpaths]      pseudo-named members dumped under _unknown/
//                                 with content-sniffed extensions — only when
//                                 opts.dumpUnknown (default: env
//                                 WC3_EXTRACT_UNKNOWN=1) and only members
//                                 whose content doesn't duplicate a named
//                                 extraction.
//   }
function extractAll(archivePath, outDir, opts) {
  opts = opts || {};
  const dumpUnknown = opts.dumpUnknown !== undefined
    ? !!opts.dumpUnknown
    : process.env.WC3_EXTRACT_UNKNOWN === '1';
  const abs = path.resolve(archivePath);
  fs.mkdirSync(outDir, { recursive: true });

  const sl = loadStormlib();
  if (sl) {
    const { SL, E } = sl;
    const hMpq = SL.SFileOpenArchive(abs, E.STREAM_FLAG.READ_ONLY);
    const extracted = [];
    let all = [];
    const unknown = [];
    try {
      all = slListNames(SL, hMpq).filter((n) => !INTERNAL_FILES.has(n));
      let names = all.filter((n) => !PSEUDO_NAME.test(n));
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
      if (dumpUnknown) {
        const dedup = extractedContentIndex(outDir, extracted);
        for (const name of all.filter((n) => PSEUDO_NAME.test(n))) {
          // pseudo-names encode the block index — StormLib opens them even
          // though the real archive path is unrecoverable. Skip SFileHasFile
          // (hash lookup by name would miss) and just try the open.
          let buf = null;
          try {
            const hFile = SL.SFileOpenFileEx(hMpq, name, E.SFILE_OPEN.FROM_MPQ);
            try {
              const size = Number(SL.SFileGetFileSize(hFile)); // BigInt!
              const ab = new ArrayBuffer(size); // NEVER a Buffer (SIGABRT)
              if (size > 0) SL.SFileReadFile(hFile, ab);
              buf = Buffer.from(ab);
            } finally {
              SL.SFileCloseFile(hFile);
            }
          } catch { continue; }
          if (dedup.isDuplicate(buf)) continue; // same content probed by name
          const rel = `_unknown/${unknownDumpName(name, buf)}`;
          const dest = path.join(outDir, rel);
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.writeFileSync(dest, buf);
          unknown.push(rel);
        }
      }
    } finally {
      SL.SFileCloseArchive(hMpq);
    }
    return extractResult(extracted, all.length, unknown);
  }

  assertSmpq();
  let all = [];
  try { all = smpqListRaw(abs); } catch { /* fall through to probing */ }
  all = all.filter((n) => !INTERNAL_FILES.has(n));

  const extracted = [];
  const unknown = [];
  const tryExtract = (name, dir, sink) => {
    const rel = name.replace(/\\/g, '/');
    try {
      // NB: smpq exits 0 even when `name` is not in the archive (it only
      // prints an error) — verify the file actually appeared on disk.
      execFileSync('smpq', ['-x', '-f', abs, name], { cwd: dir, stdio: 'pipe' });
      if (!fs.existsSync(path.join(dir, rel))) return false;
      sink.push(rel);
      return true;
    } catch { return false; }
  };

  const names = all.filter((n) => !PSEUDO_NAME.test(n));
  if (names.length > 0) {
    for (const n of names) tryExtract(n, outDir, extracted);
  } else {
    // No listfile (protected map?) — probe known names.
    for (const n of KNOWN_FILES) tryExtract(n, outDir, extracted);
  }

  if (dumpUnknown) {
    const pseudo = all.filter((n) => PSEUDO_NAME.test(n));
    if (pseudo.length > 0) {
      // smpq extracts pseudo-names too (StormLib-based) — stage them in a
      // temp dir, then move under _unknown/ with a content-sniffed extension.
      const staging = fs.mkdtempSync(path.join(outDir, '.wc3tk-unknown-'));
      try {
        const dedup = extractedContentIndex(outDir, extracted);
        for (const name of pseudo) {
          const got = [];
          if (!tryExtract(name, staging, got)) continue;
          const buf = fs.readFileSync(path.join(staging, got[0]));
          if (dedup.isDuplicate(buf)) continue;
          const rel = `_unknown/${unknownDumpName(name, buf)}`;
          const dest = path.join(outDir, rel);
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.writeFileSync(dest, buf);
          unknown.push(rel);
        }
      } finally {
        fs.rmSync(staging, { recursive: true, force: true });
      }
    }
  }
  return extractResult(extracted, all.length, unknown);
}

// Shared result shape for extractAll. `totalEnumerated` of 0 means the
// archive could not be enumerated at all (counts unknown), since even a
// fully-stripped listfile still enumerates as pseudo-named entries.
function extractResult(extracted, totalEnumerated, unknown) {
  const total = totalEnumerated > 0 ? totalEnumerated : null;
  return {
    extracted,
    total,
    unresolved: total === null ? null : Math.max(0, total - extracted.length),
    unknown: unknown || [],
  };
}

// Content index over the named extractions, so the _unknown/ dump can skip
// pseudo-entries that are just the anonymous view of a file KNOWN_FILES
// probing already recovered by name.
function extractedContentIndex(outDir, extracted) {
  const bySize = new Map();
  for (const rel of extracted) {
    const p = path.join(outDir, rel);
    const size = fs.statSync(p).size;
    if (!bySize.has(size)) bySize.set(size, []);
    bySize.get(size).push(p);
  }
  return {
    isDuplicate(buf) {
      for (const p of bySize.get(buf.length) || []) {
        if (fs.readFileSync(p).equals(buf)) return true;
      }
      return false;
    },
  };
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
