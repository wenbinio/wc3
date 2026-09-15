'use strict';
const fs = require('fs');
const path = require('path');
const { hashFile, identity, memberRel, DEFAULT_LIMITS, refusal } = require('./extraction-policy');
const NAME = '_extraction.json';
function writeManifest(archive, directory, result, backend, recovery = null) {
  const inv = require('../tools/compare-map-members').inventory(directory);
  const members = [...inv.members.entries()].filter(([key]) => key !== NAME)
    .map(([name, item]) => ({ name, ...item })).sort((a,b) => a.name.localeCompare(b.name, 'en'));
  const report = { schemaVersion: 1, kind: 'wc3-extraction', archive: hashFile(archive), backend,
    engine: 'StormLib', enumerated: result.total, namedExtracted: result.extracted.length,
    enumeration: result.enumeration || { observed: false, complete: false },
    unresolved: result.unresolved, unknown: result.unknown, recovery,
    limits: result.limits || DEFAULT_LIMITS, members,
    complete: result.enumeration?.complete === true && result.unresolved === 0 && inv.unresolved.length === 0,
    runtimeValidated: false };
  // Exclusive write: callers must use fresh directories. No stale receipt reuse.
  fs.writeFileSync(path.join(directory, NAME), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return report;
}
function verifyManifest(directory, inv) {
  const file = path.join(directory, NAME);
  const fail = reason => ({ verified: false, complete: false, reason });
  try {
    hashFile(file, 16 * 1024 ** 2);
    const report = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (report.schemaVersion !== 1 || report.kind !== 'wc3-extraction' || !Array.isArray(report.members) ||
        !/^[a-f0-9]{64}$/.test(report.archive?.sha256 || '') || !Number.isSafeInteger(report.archive?.size)) return fail('invalid extraction manifest schema');
    const actual = new Map([...inv.members].filter(([key]) => key !== NAME));
    const seen = new Set();
    for (const item of report.members) {
      if (!memberRel(item.path) || item.name !== identity(item.path) || seen.has(item.name)) return fail('ambiguous manifest member');
      seen.add(item.name);
      const observed = actual.get(item.name);
      if (!observed || observed.size !== item.size || observed.sha256 !== item.sha256) return fail(`manifest mismatch: ${item.name}`);
    }
    if (seen.size !== actual.size) return fail('files added or removed after extraction');
    const complete = report.complete === true && report.enumeration?.complete === true && report.enumeration?.observed === true &&
      report.enumeration.anonymous === 0 && report.enumeration.missing?.length === 0 && report.unresolved === 0 &&
      Number.isSafeInteger(report.enumerated) && report.enumerated > 0 && report.namedExtracted === report.enumerated &&
      report.unknown?.length === 0 && inv.unresolved.length === 0;
    return { verified: true, complete, archive: report.archive, backend: report.backend,
      scope: 'local unsigned extraction receipt; backend-enumerable scope only', reason: complete ? null : 'archive inventory not complete' };
  } catch (e) { return fail(`manifest unavailable or invalid: ${e.message}`); }
}
module.exports = { NAME, writeManifest, verifyManifest };
