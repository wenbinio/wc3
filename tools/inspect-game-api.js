#!/usr/bin/env node
'use strict';
// Inspect declarations from USER-SUPPLIED common.j files. Never infer native
// names or patch support from release-note prose. This is not a JASS compiler.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const MAX_BYTES = 16 * 1024 ** 2;
const IDENT = '[A-Za-z_][A-Za-z0-9_]*';

function cleanSource(text) {
  // Keep strings/rawcodes opaque, so declarations in quoted documentation or
  // comments cannot become apparent natives. Preserve line boundaries.
  let out = '', state = 'code';
  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i + 1];
    if (state === 'line') {
      if (c === '\n') { state = 'code'; out += '\n'; } else out += ' ';
    } else if (state === 'block') {
      if (c === '*' && next === '/') { state = 'code'; out += '  '; i++; }
      else out += c === '\n' ? '\n' : ' ';
    } else if (state === '"' || state === "'") {
      if (c === '\\') { out += '  '; i++; }
      else if (c === state) { state = 'code'; out += ' '; }
      else if (c === '\n') throw new Error('unterminated quoted literal');
      else out += ' ';
    } else if (c === '/' && next === '/') { state = 'line'; out += '  '; i++; }
    else if (c === '/' && next === '*') { state = 'block'; out += '  '; i++; }
    else if (c === '"' || c === "'") { state = c; out += ' '; }
    else out += c;
  }
  if (state !== 'code' && state !== 'line') throw new Error('unterminated comment or literal');
  return out;
}

function parseNatives(text) {
  const cleaned = cleanSource(text.replace(/^\uFEFF/, '')).replace(/\r\n?/g, '\n');
  const start = /^\s*(?:constant\s+)?native\b/gm;
  const declaration = new RegExp(`^\\s*(constant\\s+)?native\\s+(${IDENT})\\s+takes\\s+([\\s\\S]*?)\\s+returns\\s+(${IDENT})[ \\t]*(?=\\n|$)`);
  const params = new RegExp(`^(${IDENT})\\s+(${IDENT})$`);
  const natives = new Map();
  let match;
  while ((match = start.exec(cleaned)) !== null) {
    const found = declaration.exec(cleaned.slice(match.index));
    if (!found) throw new Error('malformed native declaration');
    const [, constant, name, argumentsText, returns] = found;
    const args = argumentsText.trim();
    const parameters = args === 'nothing' ? [] : args.split(',').map(arg => {
      const parameter = params.exec(arg.trim());
      if (!parameter || parameter[1] === 'nothing') throw new Error(`malformed parameters for ${name}`);
      return { type: parameter[1], name: parameter[2] };
    });
    if (new Set(parameters.map(p => p.name)).size !== parameters.length) throw new Error(`duplicate parameter in ${name}`);
    if (natives.has(name)) throw new Error(`duplicate native declaration: ${name}`);
    // Parameter renaming is not a signature change. Type/order/constness is.
    const signature = `${constant ? 'constant ' : ''}native ${name} takes ${parameters.length ? parameters.map(p => p.type).join(',') : 'nothing'} returns ${returns}`;
    natives.set(name, { name, constant: !!constant, parameters, returns, signature });
    start.lastIndex = match.index + found[0].length;
  }
  if (!natives.size) throw new Error('no native declarations found; supply common.j, not Blizzard.j or a map script');
  return [...natives.values()].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
}

function readApi(filename, label = null) {
  const stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES) throw new Error('API input must be a regular file of at most 16 MiB');
  // Bound the actual read as well as stat; never read an unbounded grown file.
  const fd = fs.openSync(filename, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  let buffer;
  try {
    const storage = Buffer.allocUnsafe(MAX_BYTES + 1);
    let length = 0, count;
    while (length < storage.length && (count = fs.readSync(fd, storage, length, storage.length - length, null)) > 0) length += count;
    if (length > MAX_BYTES || length !== stat.size) throw new Error('API input exceeded its budget or changed during read');
    buffer = storage.subarray(0, length);
  } finally { fs.closeSync(fd); }
  const natives = parseNatives(buffer.toString('utf8'));
  return { schemaVersion: 1, source: path.basename(filename), label,
    labelVerified: false, sourceSha256: crypto.createHash('sha256').update(buffer).digest('hex'),
    nativeCount: natives.length, natives, runtimeValidated: false };
}

function compareApis(before, after) {
  const old = new Map(before.natives.map(n => [n.name, n]));
  const current = new Map(after.natives.map(n => [n.name, n]));
  const added = after.natives.filter(n => !old.has(n.name));
  const removed = before.natives.filter(n => !current.has(n.name));
  const changed = after.natives.filter(n => old.has(n.name) && old.get(n.name).signature !== n.signature)
    .map(n => ({ name: n.name, before: old.get(n.name), after: n }));
  return { schemaVersion: 1, beforeSha256: before.sourceSha256, afterSha256: after.sourceSha256,
    added, removed, changed, breakingDeclarationChange: removed.length > 0 || changed.length > 0,
    scope: 'native declarations only; implementation, constants, helper functions and binary formats are not checked',
    runtimeValidated: false };
}

function main(argv) {
  const [command, ...rest] = argv;
  const paths = [], required = [];
  let label = null;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === '--label' || arg === '--require') {
      if (!rest[i + 1] || rest[i + 1].startsWith('--')) throw new Error(`missing value for ${arg}`);
      if (arg === '--label') label = rest[++i]; else required.push(rest[++i]);
    } else if (arg.startsWith('--')) throw new Error(`unknown option: ${arg}`);
    else paths.push(arg);
  }
  if (command === 'snapshot' && paths.length === 1) {
    const result = readApi(paths[0], label);
    result.missingRequired = required.filter(name => !result.natives.some(n => n.name === name));
    console.log(JSON.stringify(result, null, 2));
    return result.missingRequired.length ? 1 : 0;
  }
  if (command === 'diff' && paths.length === 2 && !required.length && label === null) {
    const result = compareApis(readApi(paths[0]), readApi(paths[1]));
    console.log(JSON.stringify(result, null, 2));
    return result.breakingDeclarationChange ? 1 : 0;
  }
  throw new Error('usage: inspect-game-api.js snapshot <common.j> [--label <unverified-build-label>] [--require <name>] | diff <old-common.j> <new-common.j>');
}
if (require.main === module) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (e) { console.error(`API inspection failed: ${e.message}`); process.exitCode = 2; }
}
module.exports = { cleanSource, parseNatives, readApi, compareApis, main };
