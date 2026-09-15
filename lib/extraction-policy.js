'use strict';
// Filesystem/resource policy, shared by BOTH archive interfaces. This is not
// an OS sandbox against a hostile concurrent writer or a native-library bug.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const DEFAULT_LIMITS = Object.freeze({ maxEntries: 50000, maxFileBytes: 128 * 1024 ** 2,
  maxTotalBytes: 1024 ** 3, maxArchiveBytes: 512 * 1024 ** 2, maxDepth: 32, timeoutMs: 60000 });
function refusal(message) { const e = new Error(message); e.code = 'WC3_EXTRACT_SAFETY'; return e; }
function limitsFor(values = {}) {
  for (const key of Object.keys(values)) if (!(key in DEFAULT_LIMITS)) throw refusal(`unknown extraction limit: ${key}`);
  const limits = { ...DEFAULT_LIMITS, ...values };
  for (const [key, value] of Object.entries(limits)) if (!Number.isSafeInteger(value) || value < 1) throw refusal(`invalid extraction limit: ${key}`);
  return limits;
}
function memberRel(value) {
  if (typeof value !== 'string' || !value || value.length > 260 || /[\x00-\x1f\x7f:*?"<>|\[\]]/.test(value)) return null;
  const rel = value.replace(/\\/g, '/');
  const parts = rel.split('/');
  if (parts.some(p => !p || p === '.' || p === '..' || /[. ]$/.test(p) || /^[-]/.test(p) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) return null;
  return rel;
}
function identity(name) { return name.replace(/\\/g, '/').replace(/[A-Z]/g, c => c.toLowerCase()); }
function checkAncestors(value, includeLeaf = true) {
  const absolute = path.resolve(value), parts = absolute.slice(path.parse(absolute).root.length).split(path.sep).filter(Boolean);
  let current = path.parse(absolute).root;
  for (const [i, part] of parts.entries()) {
    current = path.join(current, part);
    if (!includeLeaf && i === parts.length - 1) break;
    let stat;
    try { stat = fs.lstatSync(current); } catch (e) { if (e.code === 'ENOENT') break; throw e; }
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw refusal(`unsafe directory ancestor: ${current}`);
  }
  return absolute;
}
function checkedArchive(value, limits) {
  checkAncestors(value, false);
  const stat = fs.lstatSync(value);
  if (stat.isSymbolicLink() || !stat.isFile() || stat.size > limits.maxArchiveBytes) throw refusal('archive is not a plain file within the byte budget');
  return stat;
}
function hashFile(value, limit = DEFAULT_LIMITS.maxArchiveBytes) {
  const stat = fs.lstatSync(value);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > limit) throw refusal(`not a bounded regular file: ${value}`);
  const fd = fs.openSync(value, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    const before = fs.fstatSync(fd), hash = crypto.createHash('sha256'), chunk = Buffer.alloc(65536);
    let total = 0, n;
    while ((n = fs.readSync(fd, chunk, 0, chunk.length, null))) {
      total += n; if (total > limit) throw refusal('file grew beyond its byte budget'); hash.update(chunk.subarray(0, n));
    }
    const after = fs.fstatSync(fd);
    if (before.size !== total || after.size !== total || before.mtimeMs !== after.mtimeMs) throw refusal('file changed while hashing');
    return { size: total, sha256: hash.digest('hex') };
  } finally { fs.closeSync(fd); }
}
function context(outDir, values = {}) {
  const limits = limitsFor(values), root = checkAncestors(outDir);
  fs.mkdirSync(root, { recursive: true });
  const claimed = new Map(); let bytes = 0, entries = 0;
  function scan(dir, prefix = '', depth = 0) {
    if (depth > limits.maxDepth) throw refusal('existing output depth budget exceeded');
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix + entry.name, key = identity(rel);
      if (!memberRel(rel) || ++entries > limits.maxEntries) throw refusal('unsafe or excessive existing output entries');
      if (claimed.has(key)) throw refusal(`existing output collision: ${rel}`);
      claimed.set(key, rel);
      if (entry.isSymbolicLink()) throw refusal(`existing output symlink: ${rel}`);
      if (entry.isDirectory()) scan(path.join(dir, entry.name), rel + '/', depth + 1);
      else if (entry.isFile()) {
        const size = fs.lstatSync(path.join(dir, entry.name)).size;
        if (size > limits.maxFileBytes || size > limits.maxTotalBytes - bytes) throw refusal('existing output byte budget exceeded');
        bytes += size;
      } else throw refusal(`existing output is not a regular file: ${rel}`);
    }
  }
  scan(root);
  const reserve = (value, diagnostic = false) => {
    const rel = memberRel(value);
    if (!rel || rel.split('/').length > limits.maxDepth) throw refusal(`unsafe archive member: ${JSON.stringify(value)}`);
    const key = identity(rel), top = key.split('/')[0];
    if (!diagnostic && ['_header.json', '_extraction.json', '_unknown', '_viewer', '_triggers'].includes(top)) throw refusal(`archive member conflicts with toolkit metadata: ${value}`);
    const parts = rel.split('/');
    for (let i = 1; i <= parts.length; i++) {
      const spelling = parts.slice(0, i).join('/'), k = identity(spelling), old = claimed.get(k);
      if (old && old !== spelling) throw refusal(`case/separator collision: ${old} / ${spelling}`);
      claimed.set(k, spelling);
    }
    const dest = path.join(root, ...parts);
    checkAncestors(path.dirname(dest));
    if (fs.existsSync(dest) || (() => { try { fs.lstatSync(dest); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } })()) throw refusal(`refusing to overwrite extraction output: ${rel}`);
    if (++entries > limits.maxEntries) throw refusal('extraction entry budget exceeded');
    return rel;
  };
  const consume = size => {
    if (!Number.isSafeInteger(size) || size < 0 || size > limits.maxFileBytes || size > limits.maxTotalBytes - bytes) throw refusal('extraction byte budget exceeded');
    bytes += size;
  };
  const write = (rel, buffer) => {
    const dest = path.join(root, ...rel.split('/'));
    checkAncestors(path.dirname(dest)); fs.mkdirSync(path.dirname(dest), { recursive: true });
    const fd = fs.openSync(dest, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW || 0), 0o600);
    try { fs.writeFileSync(fd, buffer); } finally { fs.closeSync(fd); }
  };
  return { limits, root, reserve, consume, write, get bytes() { return bytes; } };
}
module.exports = { DEFAULT_LIMITS, limitsFor, memberRel, identity, checkAncestors, checkedArchive, hashFile, context, refusal };
