#!/usr/bin/env node
'use strict';
// Read-only comparison of EXTRACTED directories, not a Warcraft emulator or
// an archive extractor. No third-party dependency and no archive is opened.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const LIMITS = { maxEntries: 50000, maxFileBytes: 512 * 1024 ** 2,
  maxTotalBytes: 4 * 1024 ** 3, maxDepth: 64 };
const MPQ_METADATA = new Set(['(listfile)', '(attributes)', '(signature)']);

function memberName(value) {
  if (typeof value !== 'string' || !value || /[\x00-\x1f:*?]/.test(value)) {
    throw new Error(`invalid member path: ${JSON.stringify(value)}`);
  }
  const name = value.replace(/\\/g, '/');
  if (name.startsWith('/') || name.split('/').some(p => !p || p === '.' || p === '..')) {
    throw new Error(`unsafe member path: ${JSON.stringify(value)}`);
  }
  // MPQ ASCII name matching. Do not pretend Unicode case-folding is supported.
  return name.replace(/[A-Z]/g, c => c.toLowerCase());
}

function digestFile(filename, limit) {
  const fd = fs.openSync(filename, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    const initial = fs.fstatSync(fd);
    if (!initial.isFile()) throw new Error(`not a regular file: ${filename}`);
    if (initial.size > limit) throw new Error(`file byte budget exceeded: ${filename}`);
    const hash = crypto.createHash('sha256');
    const chunk = Buffer.allocUnsafe(65536);
    let size = 0, n;
    while ((n = fs.readSync(fd, chunk, 0, chunk.length, null)) > 0) {
      size += n;
      if (size > limit) throw new Error(`file byte budget exceeded: ${filename}`);
      hash.update(chunk.subarray(0, n));
    }
    const final = fs.fstatSync(fd);
    if (size !== initial.size || final.size !== initial.size || final.mtimeMs !== initial.mtimeMs) {
      throw new Error(`file changed during comparison: ${filename}`);
    }
    return { size, sha256: hash.digest('hex') };
  } finally { fs.closeSync(fd); }
}

function inventory(directory, options = {}) {
  const limits = { ...LIMITS, ...options.limits };
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error(`invalid limit: ${name}`);
  }
  const root = path.resolve(directory);
  const stat = fs.lstatSync(root);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`not a plain directory: ${root}`);
  const members = new Map(), seen = new Set(), ignored = [], unresolved = [];
  let entries = 0, totalBytes = 0;
  function visit(relative, depth) {
    if (depth > limits.maxDepth) throw new Error('directory depth budget exceeded');
    const dir = fs.opendirSync(path.join(root, relative));
    try {
      let entry;
      while ((entry = dir.readSync()) !== null) {
        if (++entries > limits.maxEntries) throw new Error('entry budget exceeded');
        const rel = relative ? `${relative}/${entry.name}` : entry.name;
        const key = memberName(rel);
        if (seen.has(key)) throw new Error(`ambiguous case/separator collision: ${rel}`);
        seen.add(key);
        if (entry.isSymbolicLink()) throw new Error(`symlink refused: ${rel}`);
        if (entry.isDirectory()) { visit(rel, depth + 1); continue; }
        if (!entry.isFile()) throw new Error(`non-regular entry refused: ${rel}`);
        // Hash before ignoring so ignored content is still bounded and auditable.
        const data = digestFile(path.join(root, rel), Math.min(limits.maxFileBytes, limits.maxTotalBytes - totalBytes));
        totalBytes += data.size;
        const item = { path: rel, ...data };
        if (key.startsWith('_unknown/')) { unresolved.push(item); continue; }
        if (key.startsWith('_viewer/') || key.startsWith('_triggers/') ||
          (!options.includeMpqMetadata && MPQ_METADATA.has(key))) {
          ignored.push(item); continue;
        }
        // _header.json is deliberately INCLUDED: HM3W names/flags matter.
        // Arbitrary underscore-prefixed files and manifest.json are not ignored.
        members.set(key, item);
      }
    } finally { dir.closeSync(); }
  }
  visit('', 0);
  const order = (a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
  return { members, entries, totalBytes, ignored: ignored.sort(order), unresolved: unresolved.sort(order) };
}

function compareDirectories(beforeDir, afterDir, options = {}) {
  const before = inventory(beforeDir, options), after = inventory(afterDir, options);
  const allow = {};
  for (const kind of ['changed', 'added', 'removed']) {
    allow[kind] = new Set((options[kind] || []).map(memberName));
  }
  const changes = [];
  let unchanged = 0;
  for (const name of [...new Set([...before.members.keys(), ...after.members.keys()])].sort()) {
    const old = before.members.get(name), current = after.members.get(name);
    if (old && current && old.sha256 === current.sha256 && old.size === current.size) { unchanged++; continue; }
    const kind = !old ? 'added' : !current ? 'removed' : 'changed';
    changes.push({ name, kind, allowed: allow[kind].has(name), before: old || null, after: current || null });
  }
  const incomplete = before.unresolved.length > 0 || after.unresolved.length > 0 ||
    before.members.size === 0 || after.members.size === 0;
  const unexpected = changes.filter(c => !c.allowed).length;
  const summary = i => ({ memberCount: i.members.size, entries: i.entries,
    totalBytes: i.totalBytes, ignored: i.ignored, unresolved: i.unresolved });
  return {
    schemaVersion: 1,
    status: incomplete ? 'INCOMPLETE' : unexpected ? 'DIFFERENCES' : 'MATCH_WITHIN_SCOPE',
    scope: 'provided extracted directory members; MPQ compression/layout is not compared',
    archiveCompleteness: 'not established; review extraction counts independently',
    runtimeValidated: false,
    before: summary(before), after: summary(after), unchanged, unexpected, changes,
    unusedAllowances: Object.entries(allow).flatMap(([kind, names]) =>
      [...names].filter(name => !changes.some(c => c.kind === kind && c.name === name)).map(name => ({ kind, name }))),
  };
}

function main(argv) {
  const options = {}, dirs = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--include-mpq-metadata') options.includeMpqMetadata = true;
    else if (['--allow-changed', '--allow-added', '--allow-removed'].includes(arg)) {
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`missing path for ${arg}`);
      const key = arg.slice('--allow-'.length);
      (options[key] ||= []).push(argv[++i]);
    } else if (arg.startsWith('--')) throw new Error(`unknown option: ${arg}`);
    else dirs.push(arg);
  }
  if (dirs.length !== 2) throw new Error('usage: compare-map-members.js <before-dir> <after-dir> [--allow-changed|--allow-added|--allow-removed <exact-path>] [--include-mpq-metadata]');
  const report = compareDirectories(dirs[0], dirs[1], options);
  console.log(JSON.stringify(report, null, 2));
  return report.status === 'MATCH_WITHIN_SCOPE' ? 0 : 1;
}
if (require.main === module) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (e) { console.error(`comparison failed: ${e.message}`); process.exitCode = 2; }
}
module.exports = { compareDirectories, inventory, memberName, main };
