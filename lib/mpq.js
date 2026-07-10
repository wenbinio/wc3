'use strict';
// Thin wrapper around the `smpq` CLI (StormLib MPQ archiving utility).
// Install: apt-get install -y smpq   (scripts/setup.sh does this)
//
// Notes:
// - smpq READS .w3x files directly (it finds the MPQ past the 512-byte HM3W
//   pre-header) but always CREATES bare MPQs — callers prepend the header.
// - We create archives as MPQ version 1 (-M 1): Warcraft III only reads v1.
// - Archive paths: MPQ uses '\' separators, but StormLib's name hashing
//   treats '/' and '\' as identical, so adding/extracting with '/' works.
// - `smpq -x <archive>` with no file names extracts everything listed in the
//   archive's (listfile). Protected maps strip the listfile — extraction then
//   falls back to probing KNOWN_FILES one by one (hash lookup by exact name
//   works without a listfile).

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

function assertSmpq() {
  try {
    execFileSync('smpq', ['--version'], { stdio: 'ignore' });
  } catch {
    throw new Error("smpq not found. Run: bash scripts/setup.sh  (apt-get install -y smpq)");
  }
}

// List archive contents via (listfile). Returns [] when there is no listfile.
function listFiles(archivePath) {
  assertSmpq();
  let out;
  try {
    out = execFileSync('smpq', ['-l', path.resolve(archivePath)], { encoding: 'utf8' });
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
function extractAll(archivePath, outDir) {
  assertSmpq();
  const abs = path.resolve(archivePath);
  fs.mkdirSync(outDir, { recursive: true });
  let names = [];
  try { names = listFiles(abs); } catch { /* fall through to probing */ }
  names = names.filter((n) => n !== '(listfile)' && n !== '(attributes)' && n !== '(signature)');

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
function createArchive(mpqPath, cwdDir, files) {
  assertSmpq();
  if (files.length === 0) throw new Error('refusing to create an empty MPQ');
  const abs = path.resolve(mpqPath);
  fs.rmSync(abs, { force: true });
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  // smpq -c: create archive (adds a (listfile) automatically). MPQ v1 for WC3.
  execFileSync('smpq', ['-c', '-M', '1', '-C', 'ZLIB', abs, ...files], {
    cwd: cwdDir, stdio: 'pipe',
  });
  return abs;
}

module.exports = { KNOWN_FILES, listFiles, extractAll, createArchive, assertSmpq };
